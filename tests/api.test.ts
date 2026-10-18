import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app';
import { hashPassword } from '../src/modules/auth';
import { Order } from '../src/modules/orders';
import { Payment } from '../src/modules/payments';
import { Product } from '../src/modules/products';
import { User } from '../src/modules/users';

let mongod: MongoMemoryServer;
let admin: string, userA: string, userB: string;

const login = async (email: string, role: 'user' | 'admin') => {
  await User.create({ email, role, passwordHash: hashPassword('pw12345') });
  return (await request(app).post('/auth/login').send({ email, password: 'pw12345' })).body.data.token as string;
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User, Order, Payment, Product].map((m) => m.init()));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Order.deleteMany({}), Payment.deleteMany({}), Product.deleteMany({})]);
  [admin, userA, userB] = [await login('admin@x.com', 'admin'), await login('a@x.com', 'user'), await login('b@x.com', 'user')];
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const mkProduct = async (stock: number, price = 1000, isActive = true) =>
  (await request(app).post('/products').set(as(admin)).send({ name: 'Item', price, stock, isActive })).body.data;
const mkOrder = (productId: string, quantity = 1, token = userA) => request(app).post('/orders').set(as(token)).send({ items: [{ productId, quantity }] });
const pay = (orderId: string, amount: number, key = 'key-12345') => request(app).post('/payments').set(as(userA)).set('Idempotency-Key', key).send({ orderId, amount });
const callback = (paymentId: string, amount: number, status = 'succeeded') =>
  request(app).post('/payments/callback').set('x-callback-secret', 'dev-secret').send({ paymentId, status, amount });
const stockOf = async (id: string) => (await Product.findById(id))!.stock;

describe('Order & Payment API', () => {
  it('1. creates an order successfully', async () => {
    const p = await mkProduct(5, 700);
    const res = await mkOrder(p._id, 2);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'Pending', total: 1400 });
    expect(await stockOf(p._id)).toBe(3);

    const tampered = await request(app).post('/orders').set(as(userA)).send({ items: [{ productId: p._id, quantity: 1, price: 1 }] });
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe('VALIDATION_ERROR');
  });

  it('2. rejects an unavailable product', async () => {
    const inactive = await mkProduct(5, 1000, false);
    expect((await mkOrder(inactive._id)).body.code).toBe('PRODUCT_INACTIVE');
    expect((await mkOrder('a'.repeat(24))).body.code).toBe('PRODUCT_NOT_FOUND');
    expect(await stockOf(inactive._id)).toBe(5);
  });

  it('3. rejects insufficient stock and rolls back partial reservations', async () => {
    const plenty = await mkProduct(5);
    const scarce = await mkProduct(1);
    const res = await request(app).post('/orders').set(as(userA)).send({ items: [{ productId: plenty._id, quantity: 2 }, { productId: scarce._id, quantity: 2 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(plenty._id)).toBe(5);
    expect(await stockOf(scarce._id)).toBe(1);
  });

  it('4. a price change after the order does not affect the order', async () => {
    const p = await mkProduct(5, 700);
    const order = (await mkOrder(p._id, 2)).body.data;
    await request(app).patch(`/products/${p._id}`).set(as(admin)).send({ price: 9999 });
    const saved = (await request(app).get(`/orders/${order._id}`).set(as(userA))).body.data;
    expect(saved.total).toBe(1400);
    expect(saved.items[0].price).toBe(700);
  });

  it('5. a successful payment marks the order Paid', async () => {
    const p = await mkProduct(3, 1000);
    const order = (await mkOrder(p._id, 2)).body.data;
    const payment = await pay(order._id, 2000);
    expect(payment.status).toBe(201);
    expect(payment.body.data).toMatchObject({ amount: 2000, status: 'Pending' });
    expect((await callback(payment.body.data._id, 2000)).status).toBe(200);
    expect((await Order.findById(order._id))!.status).toBe('Paid');
    expect(await stockOf(p._id)).toBe(1);
  });

  it('6. duplicate callbacks neither pay twice nor change stock twice', async () => {
    const p = await mkProduct(3, 1000);
    const paid = (await mkOrder(p._id, 2)).body.data;
    const pm = (await pay(paid._id, 2000)).body.data;
    expect((await request(app).post('/payments/callback').send({ paymentId: pm._id, status: 'succeeded', amount: 2000 })).status).toBe(401);
    await Promise.all([callback(pm._id, 2000), callback(pm._id, 2000), callback(pm._id, 2000)]);
    await callback(pm._id, 2000, 'failed');
    expect((await Order.findById(paid._id))!.status).toBe('Paid');
    expect(await stockOf(p._id)).toBe(1);
    expect(await Payment.countDocuments()).toBe(1);

    const failed = (await mkOrder(p._id, 1)).body.data;
    const pm2 = (await pay(failed._id, 1000, 'key-second')).body.data;
    await Promise.all([callback(pm2._id, 1000, 'failed'), callback(pm2._id, 1000, 'failed'), callback(pm2._id, 1000, 'failed')]);
    expect((await Order.findById(failed._id))!.status).toBe('Failed');
    expect(await stockOf(p._id)).toBe(1);
  });

  it('7. a repeated Idempotency-Key does not create a second payment', async () => {
    const order = (await mkOrder((await mkProduct(2, 100))._id)).body.data;
    expect((await request(app).post('/payments').set(as(userA)).send({ orderId: order._id, amount: 100 })).status).toBe(400);
    const results = await Promise.all(Array.from({ length: 10 }, () => pay(order._id, 100)));
    expect(new Set(results.map((r) => r.body.data._id)).size).toBe(1);
    expect(await Payment.countDocuments()).toBe(1);
    expect((await pay(order._id, 100, 'key-other-1')).body.code).toBe('PAYMENT_IN_PROGRESS');
  });

  it('8. rejects a payment with the wrong amount', async () => {
    const order = (await mkOrder((await mkProduct(2, 1000))._id, 2)).body.data;
    const res = await pay(order._id, 100);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('AMOUNT_MISMATCH');
    expect((await pay(order._id, -5)).body.code).toBe('VALIDATION_ERROR');
    expect(await Payment.countDocuments()).toBe(0);

    const pm = (await pay(order._id, 2000)).body.data;
    expect((await callback(pm._id, 100)).body.code).toBe('AMOUNT_MISMATCH');
    expect((await Order.findById(order._id))!.status).toBe('Pending');
  });

  it('9. two concurrent requests for the last item: only one succeeds', async () => {
    const p = await mkProduct(1);
    const [a, b] = await Promise.all([mkOrder(p._id, 1, userA), mkOrder(p._id, 1, userB)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await stockOf(p._id)).toBe(0);
    expect(await Order.countDocuments()).toBe(1);
  });
});
