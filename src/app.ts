import express from 'express';
import { errorHandler, notFound } from './shared/errors';
import { requestLogger } from './shared/logger';
import { authRouter } from './modules/auth';
import { orderRouter } from './modules/orders';
import { paymentRouter } from './modules/payments';
import { productRouter } from './modules/products';

export const app = express();
app.disable('x-powered-by');
app.use(requestLogger);
app.use(express.json({ limit: '100kb' }));
app.use(authRouter, productRouter, orderRouter, paymentRouter);
app.use(notFound);
app.use(errorHandler);
