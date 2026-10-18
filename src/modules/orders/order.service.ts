import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { Me } from '../auth';
import { releaseStock, reserveStock } from '../products';
import { Order } from './order.model';

// Users only see their own orders; a foreign id looks exactly like a missing one (404).
const scope = (u: Me) => (u.role === 'admin' ? {} : { userId: u.id });

export async function createOrder(user: Me, items: { productId: string; quantity: number }[]) {
  const lines = await reserveStock(items);
  try {
    // Prices are the snapshots taken while reserving; the total is computed here, never by the client.
    const order = await Order.create({ userId: user.id, items: lines, total: lines.reduce((s, l) => s + l.price * l.quantity, 0) });
    logger.info('order.created', { order: String(order._id), user: user.id, items: lines.length, total: order.total });
    return order;
  } catch (e) {
    await releaseStock(lines);
    throw e;
  }
}

export const listOrders = (user: Me) => Order.find(scope(user)).sort({ createdAt: -1 }).limit(50);

export async function getOrder(user: Me, id: string) {
  const order = await Order.findOne({ _id: id, ...scope(user) });
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
  return order;
}

/**
 * The only way an order's status changes. Atomic and conditional on Pending, so it can run any number of times
 * (duplicate callbacks, double clicks) and takes effect exactly once. Stock returns on Cancelled/Failed.
 */
export async function transitionOrder(filter: object, to: 'Paid' | 'Cancelled' | 'Failed') {
  const order = await Order.findOneAndUpdate({ ...filter, status: 'Pending' }, { status: to }, { returnDocument: 'after' });
  if (order) logger.info('order.transition', { order: String(order._id), from: 'Pending', to });
  if (order && to !== 'Paid') await releaseStock(order.items);
  return order;
}

/** Client-driven: Pending -> Cancelled, owner only. */
export async function cancelOrder(user: Me, id: string) {
  const order = await transitionOrder({ _id: id, ...scope(user) }, 'Cancelled');
  if (order) return order;
  await getOrder(user, id); // 404 if missing / not yours
  throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only pending orders can be cancelled');
}

/** Provider-driven (payment callback): Pending -> Paid | Failed. */
export const settleOrder = (orderId: unknown, to: 'Paid' | 'Failed') => transitionOrder({ _id: orderId }, to);
