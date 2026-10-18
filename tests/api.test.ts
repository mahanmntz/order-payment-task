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
let adminT: string, userT: string, user2T: string;

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
  [adminT, userT, user2T] = [await login('a@x.com', 'admin'), await login('u@x.com', 'user'), await login('u2@x.com', 'user')];
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const mkProduct = async (stock = 1, price = 500, isActive = true) =>
  (await request(app).post('/products').set(bearer(adminT)).send({ name: 'x', price, stock, isActive })).body.data;
const mkOrder = (productId: string, quantity = 1, t = userT) => request(app).post('/orders').set(bearer(t)).send({ items: [{ productId, quantity }] });
const pay = (orderId: string, amount: number, key = 'key-12345', t = userT) =>
  request(app).post('/payments').set(bearer(t)).set('Idempotency-Key', key).send({ orderId, amount });
const callback = (paymentId: string, amount: number, status = 'succeeded') =>
  request(app).post('/payments/callback').set('x-callback-secret', 'dev-secret').send({ paymentId, status, amount });

describe('auth', () => {
  it('rejects bad credentials and unauthenticated calls; only admins create products', async () => {
    expect((await request(app).post('/auth/login').send({ email: 'u@x.com', password: 'wrong' })).body.code).toBe('INVALID_CREDENTIALS');
    expect((await request(app).post('/orders').send({})).status).toBe(401);
    expect((await request(app).post('/products').set(bearer(userT)).send({ name: 'x', price: 1, stock: 1 })).status).toBe(403);
  });
  it("users cannot read or cancel someone else's order", async () => {
    const o = (await mkOrder((await mkProduct(2))._id)).body.data;
    expect((await request(app).get(`/orders/${o._id}`).set(bearer(user2T))).status).toBe(404);
    expect((await request(app).post(`/orders/${o._id}/cancel`).set(bearer(user2T))).status).toBe(404);
  });
});

describe('orders', () => {
  it('1. creates an order, total computed by the server, price tampering rejected', async () => {
    const p = await mkProduct(5, 700);
    const bad = await request(app).post('/orders').set(bearer(userT)).send({ items: [{ productId: p._id, quantity: 1, price: 1 }] });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    const ok = await mkOrder(p._id, 2);
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ total: 1400, status: 'Pending' });
    expect((await Product.findById(p._id))!.stock).toBe(3);
  });

  it('2. rejects unavailable products (missing / inactive)', async () => {
    const inactive = await mkProduct(5, 500, false);
    expect((await mkOrder(inactive._id)).body.code).toBe('PRODUCT_INACTIVE');
    expect((await mkOrder('a'.repeat(24))).body.code).toBe('PRODUCT_NOT_FOUND');
    expect((await mkOrder('nope')).body.code).toBe('VALIDATION_ERROR');
    expect((await request(app).post('/orders').set(bearer(userT)).send({ items: [{ productId: inactive._id, quantity: 0 }] })).status).toBe(400);
  });

  it('3. rejects insufficient stock and rolls back partial reservations', async () => {
    const a = await mkProduct(5);
    const b = await mkProduct(1);
    const r = await request(app).post('/orders').set(bearer(userT)).send({ items: [{ productId: a._id, quantity: 2 }, { productId: b._id, quantity: 2 }] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INSUFFICIENT_STOCK');
    expect((await Product.findById(a._id))!.stock).toBe(5);
  });

  it('4. later product price change does not affect an existing order', async () => {
    const p = await mkProduct(5, 700);
    const o = (await mkOrder(p._id, 2)).body.data;
    await request(app).patch(`/products/${p._id}`).set(bearer(adminT)).send({ price: 9999 });
    const got = (await request(app).get(`/orders/${o._id}`).set(bearer(userT))).body.data;
    expect(got.total).toBe(1400);
    expect(got.items[0].price).toBe(700);
  });

  it('9. never oversells under concurrency (stock = 1)', async () => {
    const p = await mkProduct(1);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => mkOrder(p._id, 1, i % 2 ? userT : user2T)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    expect((await Product.findById(p._id))!.stock).toBe(0);
  });

  it('cancel restores stock once; no direct status updates', async () => {
    const p = await mkProduct(2);
    const o = (await mkOrder(p._id, 2)).body.data;
    expect((await request(app).patch(`/orders/${o._id}`).set(bearer(userT)).send({ status: 'Paid' })).status).toBe(404);
    expect((await request(app).post(`/orders/${o._id}/cancel`).set(bearer(userT))).status).toBe(200);
    expect((await request(app).post(`/orders/${o._id}/cancel`).set(bearer(userT))).status).toBe(409);
    expect((await Product.findById(p._id))!.stock).toBe(2);
  });
});

describe('products & payment lookup', () => {
  it('searches products by name, escaping regex characters', async () => {
    await request(app).post('/products').set(bearer(adminT)).send({ name: 'Red Mouse', price: 1, stock: 1 });
    await request(app).post('/products').set(bearer(adminT)).send({ name: 'Blue Keyboard', price: 1, stock: 1 });
    expect((await request(app).get('/products?q=mouse')).body.data).toHaveLength(1);
    expect((await request(app).get('/products?q=.*')).body.data).toHaveLength(0);
    expect((await request(app).get('/products')).body.data).toHaveLength(2);
  });

  it('users can read only their own payment', async () => {
    const o = (await mkOrder((await mkProduct(2, 100))._id)).body.data;
    const pm = (await pay(o._id, 100)).body.data;
    expect((await request(app).get(`/payments/${pm._id}`).set(bearer(userT))).body.data.amount).toBe(100);
    expect((await request(app).get(`/payments/${pm._id}`).set(bearer(user2T))).status).toBe(404);
    expect((await request(app).get(`/payments/${pm._id}`)).status).toBe(401);
  });
});

describe('payments', () => {
  it('5. successful payment: Pending -> Paid, stock stays deducted', async () => {
    const p = await mkProduct(3, 1000);
    const o = (await mkOrder(p._id, 2)).body.data;
    const pm = await pay(o._id, 2000);
    expect(pm.status).toBe(201);
    expect(pm.body.data).toMatchObject({ amount: 2000, status: 'Pending' });
    expect((await callback(pm.body.data._id, 2000)).status).toBe(200);
    expect((await Order.findById(o._id))!.status).toBe('Paid');
    expect((await Product.findById(p._id))!.stock).toBe(1);
  });

  it('6. duplicate callbacks do not double-apply (success and failure)', async () => {
    const p = await mkProduct(3, 1000);
    const o1 = (await mkOrder(p._id, 2)).body.data;
    const pm1 = (await pay(o1._id, 2000)).body.data;
    expect((await request(app).post('/payments/callback').send({ paymentId: pm1._id, status: 'succeeded', amount: 2000 })).status).toBe(401);
    await Promise.all([callback(pm1._id, 2000), callback(pm1._id, 2000), callback(pm1._id, 2000)]);
    await callback(pm1._id, 2000, 'failed'); // late conflicting callback is ignored
    expect((await Order.findById(o1._id))!.status).toBe('Paid');
    expect((await Product.findById(p._id))!.stock).toBe(1);
    expect(await Payment.countDocuments()).toBe(1);

    const o2 = (await mkOrder(p._id, 1)).body.data;
    const pm2 = (await pay(o2._id, 1000, 'key-second')).body.data;
    await Promise.all([callback(pm2._id, 1000, 'failed'), callback(pm2._id, 1000, 'failed'), callback(pm2._id, 1000, 'failed')]);
    expect((await Order.findById(o2._id))!.status).toBe('Failed');
    expect((await Product.findById(p._id))!.stock).toBe(1); // restored exactly once
  });

  it('7. same Idempotency-Key never creates a second payment', async () => {
    const o = (await mkOrder((await mkProduct(2, 100))._id)).body.data;
    expect((await request(app).post('/payments').set(bearer(userT)).send({ orderId: o._id, amount: 100 })).status).toBe(400); // header required
    const results = await Promise.all(Array.from({ length: 10 }, () => pay(o._id, 100)));
    expect(new Set(results.map((r) => r.body.data._id)).size).toBe(1);
    expect(await Payment.countDocuments()).toBe(1);
    const o2 = (await mkOrder((await mkProduct(2, 100))._id)).body.data;
    expect((await pay(o2._id, 100)).body.code).toBe('IDEMPOTENCY_KEY_REUSED'); // same key, different order
    expect((await pay(o._id, 100, 'key-other-1')).body.code).toBe('PAYMENT_IN_PROGRESS'); // different key, same order
  });

  it('8. wrong payment amount is rejected (create and callback)', async () => {
    const o = (await mkOrder((await mkProduct(2, 1000))._id, 2)).body.data; // total 2000
    const bad = await pay(o._id, 100);
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('AMOUNT_MISMATCH');
    expect(await Payment.countDocuments()).toBe(0);
    expect((await pay(o._id, -5)).body.code).toBe('VALIDATION_ERROR');
    const pm = (await pay(o._id, 2000)).body.data;
    expect((await callback(pm._id, 100)).body.code).toBe('AMOUNT_MISMATCH');
    expect((await Order.findById(o._id))!.status).toBe('Pending');
  });

  it("cannot pay a cancelled order or someone else's order; errors leak nothing", async () => {
    const o = (await mkOrder((await mkProduct(2, 100))._id)).body.data;
    expect((await pay(o._id, 100, 'key-12345', user2T)).status).toBe(404);
    await request(app).post(`/orders/${o._id}/cancel`).set(bearer(userT));
    expect((await pay(o._id, 100)).status).toBe(409);
    const bad = await request(app).get('/orders/not-an-id').set(bearer(userT));
    expect(bad.body).toEqual({ success: false, message: expect.any(String), code: 'VALIDATION_ERROR' });
  });
});
