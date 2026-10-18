// npm run reset: delete orders and payments, restore seeded products (dev only)
import mongoose from 'mongoose';
import { config } from './config';
import { Order } from './modules/orders';
import { Payment } from './modules/payments';
import { seed } from './seed';

(async () => {
  if (config.prod) throw new Error('Refusing to reset a production database');
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  const [orders, payments] = await Promise.all([Order.deleteMany({}), Payment.deleteMany({})]);
  await seed(true);
  console.log(`Deleted ${orders.deletedCount} orders and ${payments.deletedCount} payments; products restored.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
