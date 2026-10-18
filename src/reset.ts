// `npm run reset`: wipe order + payment history and restore seeded product stock. Dev only.
import mongoose from 'mongoose';
import { config } from './config';
import { Order } from './modules/orders';
import { Payment } from './modules/payments';
import { resetCatalog, seed } from './seed';

(async () => {
  if (config.prod) throw new Error('Refusing to reset a production database');
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  const [orders, payments] = await Promise.all([Order.deleteMany({}), Payment.deleteMany({})]);
  await seed();
  await resetCatalog();
  console.log(`Deleted ${orders.deletedCount} orders and ${payments.deletedCount} payments; product stock restored.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
