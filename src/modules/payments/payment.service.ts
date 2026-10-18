import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { Me } from '../auth';
import { getOrder, settleOrder } from '../orders';
import { Payment } from './payment.model';

export async function createPayment(user: Me, key: string, orderId: string, amount: number) {
  const replay = async () => {
    const p = await Payment.findOne({ userId: user.id, idempotencyKey: key });
    if (p && String(p.orderId) !== orderId) throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was used with a different request');
    if (p) logger.info('payment.replayed', { payment: String(p._id), user: user.id });
    return p && { payment: p, replayed: true };
  };
  const existing = await replay();
  if (existing) return existing;

  const order = await getOrder(user, orderId);
  if (order.status !== 'Pending') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Order is ${order.status}`);
  // The client-sent amount is only a check; the server's own total is the truth.
  if (amount !== order.total) throw new AppError(400, 'AMOUNT_MISMATCH', 'Amount does not match order total');

  try {
    const payment = await Payment.create({ userId: user.id, orderId, amount: order.total, idempotencyKey: key });
    logger.info('payment.created', { payment: String(payment._id), order: orderId, amount: payment.amount });
    return { payment, replayed: false };
  } catch (e: any) {
    if (e?.code !== 11000) throw e;
    // Lost a race on the same key -> replay; otherwise another payment is in flight for this order.
    const raced = await replay();
    if (raced) return raced;
    throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'A payment is already in progress for this order');
  }
}

export async function handleCallback(paymentId: string, status: 'succeeded' | 'failed', amount: number) {
  const existing = await Payment.findById(paymentId);
  if (!existing) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  if (existing.amount !== amount) throw new AppError(400, 'AMOUNT_MISMATCH', 'Amount does not match payment');

  // First callback wins; later ones (even with a different status) are no-ops that return the stored outcome.
  const updated = await Payment.findOneAndUpdate({ _id: paymentId, status: 'Pending' }, { status: status === 'succeeded' ? 'Succeeded' : 'Failed' }, { returnDocument: 'after' });
  const payment = updated ?? (await Payment.findById(paymentId))!;
  logger.info('payment.callback', { payment: paymentId, received: status, final: payment.status, applied: !!updated });

  // Idempotent too (conditional on Pending), so replays and retries after a partial failure can't double-apply.
  await settleOrder(payment.orderId, payment.status === 'Succeeded' ? 'Paid' : 'Failed');
  return payment;
}

export async function getPayment(user: Me, id: string) {
  const payment = await Payment.findOne({ _id: id, ...(user.role === 'admin' ? {} : { userId: user.id }) });
  if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  return payment;
}
