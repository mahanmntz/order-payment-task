import mongoose from 'mongoose';
import { app } from './app';
import { config } from './config';
import { Order } from './modules/orders';
import { Payment } from './modules/payments';
import { Product } from './modules/products';
import { User } from './modules/users';
import { seed } from './seed';
import { logger } from './shared/logger';

(async () => {
  await mongoose.connect(config.mongoUri);
  await Promise.all([User, Product, Order, Payment].map((m) => m.init())); // unique indexes must exist before serving
  if (!config.prod) await seed();
  app.listen(config.port, () => logger.info('API listening', { url: `http://localhost:${config.port}` }));
})().catch((e) => {
  logger.error('startup failed', { stack: e?.stack ?? String(e) });
  process.exit(1);
});
