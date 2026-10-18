import { hashPassword } from './modules/auth';
import { Product } from './modules/products';
import { User } from './modules/users';

const catalog = [
  { name: 'Keyboard', price: 2000000, stock: 10, isActive: true, image: '/products/keyboard.svg' },
  { name: 'Last-one Mouse', price: 100000, stock: 1, isActive: true, image: '/products/mouse.svg' },
  { name: 'Headphones', price: 3500000, stock: 4, isActive: true, image: '/products/headphones.svg' },
  { name: 'Discontinued Cable', price: 50000, stock: 5, isActive: false, image: '/products/cable.svg' },
];

/** Dev data: idempotent, safe to run on every start. */
export async function seed() {
  const users = [
    ['admin@example.com', 'admin123', 'admin'],
    ['user1@example.com', 'user123', 'user'],
    ['user2@example.com', 'user123', 'user'],
  ] as const;
  for (const [email, pw, role] of users) {
    await User.updateOne({ email }, { $setOnInsert: { email, passwordHash: hashPassword(pw), role } }, { upsert: true });
  }
  // Upsert by name: inserts missing products, never resets stock/price of existing ones.
  for (const { name, image, ...rest } of catalog) {
    await Product.updateOne({ name }, { $setOnInsert: rest, $set: { image } }, { upsert: true });
  }
}

/** Put the seeded catalog back to its original stock/price/active state (used by `npm run reset`). */
export async function resetCatalog() {
  for (const { name, ...fields } of catalog) await Product.updateOne({ name }, { $set: fields }, { upsert: true });
}
