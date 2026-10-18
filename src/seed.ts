import { hashPassword } from './modules/auth';
import { Product } from './modules/products';
import { User } from './modules/users';

const users = [
  { email: 'admin@example.com', password: 'admin123', role: 'admin' },
  { email: 'user1@example.com', password: 'user123', role: 'user' },
  { email: 'user2@example.com', password: 'user123', role: 'user' },
];
const catalog = [
  { name: 'Keyboard', price: 2000000, stock: 10, isActive: true, image: '/products/keyboard.svg' },
  { name: 'Last-one Mouse', price: 100000, stock: 1, isActive: true, image: '/products/mouse.svg' },
  { name: 'Headphones', price: 3500000, stock: 4, isActive: true, image: '/products/headphones.svg' },
  { name: 'Discontinued Cable', price: 50000, stock: 5, isActive: false, image: '/products/cable.svg' },
];

/** Dev data. Adds what is missing; with `reset` it also restores stock, price and active flags. */
export async function seed(reset = false) {
  for (const { password, ...u } of users) await User.updateOne({ email: u.email }, { $setOnInsert: { ...u, passwordHash: hashPassword(password) } }, { upsert: true });
  for (const { name, image, ...rest } of catalog) {
    await Product.updateOne({ name }, reset ? { $set: { ...rest, image } } : { $setOnInsert: rest, $set: { image } }, { upsert: true });
  }
}
