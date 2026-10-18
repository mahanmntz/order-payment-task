import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { AppError } from '../../shared/errors';
import { money, objectId } from '../../shared/validation';
import { auth, me, safeEqual } from '../auth';
import { createPayment, getPayment, handleCallback } from './payment.service';

export const paymentRouter = Router();

const createBody = z.object({ orderId: objectId, amount: money }).strict();
const callbackBody = z.object({ paymentId: objectId, status: z.enum(['succeeded', 'failed']), amount: money }).strict();
const keyHeader = z.string().trim().min(8, 'Idempotency-Key header (min 8 chars) is required').max(128);

// the provider is not a user: shared secret instead of JWT
const providerAuth: RequestHandler = (req, _res, next) =>
  safeEqual(req.header('x-callback-secret') ?? '', config.callbackSecret) ? next() : next(new AppError(401, 'UNAUTHORIZED', 'Invalid callback credentials'));

paymentRouter.post('/payments', auth, async (req, res) => {
  const key = keyHeader.parse(req.header('Idempotency-Key'));
  const { orderId, amount } = createBody.parse(req.body);
  const { payment, replayed } = await createPayment(me(res), key, orderId, amount);
  if (replayed) res.set('Idempotent-Replayed', 'true');
  res.status(replayed ? 200 : 201).json({ success: true, data: payment });
});

paymentRouter.get('/payments/:id', auth, async (req, res) => {
  res.json({ success: true, data: await getPayment(me(res), objectId.parse(req.params.id)) });
});

paymentRouter.post('/payments/callback', providerAuth, async (req, res) => {
  const { paymentId, status, amount } = callbackBody.parse(req.body);
  const payment = await handleCallback(paymentId, status, amount);
  res.json({ success: true, data: { paymentId: payment._id, paymentStatus: payment.status } });
});
