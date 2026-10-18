import { Types } from 'mongoose';
import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { Product } from './product.model';

type Line = { productId: Types.ObjectId; quantity?: number | null };

export const releaseStock = (lines: readonly Line[]) =>
  Product.bulkWrite(lines.map(({ productId, quantity }) => ({ updateOne: { filter: { _id: productId }, update: { $inc: { stock: quantity ?? 0 } } } })));

/** All-or-nothing: reserves every line atomically and returns price snapshots. */
export async function reserveStock(items: { productId: string; quantity: number }[]) {
  const qty = new Map<string, number>();
  items.forEach((i) => qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity));

  const reserved: { productId: Types.ObjectId; name: string; price: number; quantity: number }[] = [];
  for (const [productId, quantity] of qty) {
    // one atomic check-and-decrement: no read-then-write race
    const p = await Product.findOneAndUpdate({ _id: productId, isActive: true, stock: { $gte: quantity } }, { $inc: { stock: -quantity } }, { returnDocument: 'after' });
    if (!p) {
      await releaseStock(reserved);
      const existing = await Product.findById(productId);
      logger.warn('stock.reserve_failed', { product: productId, requested: quantity, available: existing?.stock, active: existing?.isActive });
      throw !existing
        ? new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
        : !existing.isActive
          ? new AppError(409, 'PRODUCT_INACTIVE', 'Product is not available')
          : new AppError(409, 'INSUFFICIENT_STOCK', 'Insufficient stock');
    }
    reserved.push({ productId: p._id, name: p.name, price: p.price, quantity });
  }
  return reserved;
}
