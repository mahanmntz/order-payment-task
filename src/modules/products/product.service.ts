import { Types } from 'mongoose';
import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { Product } from './product.model';

export type Reserved = { productId: Types.ObjectId; name: string; price: number; quantity: number };

/** Return reserved stock to inventory. */
export const releaseStock = (items: ReadonlyArray<{ productId: Types.ObjectId; quantity?: number | null }>) =>
  Product.bulkWrite(items.map((i) => ({ updateOne: { filter: { _id: i.productId }, update: { $inc: { stock: i.quantity ?? 0 } } } })));

/**
 * Atomically reserve stock for every line and return price snapshots.
 * All-or-nothing: if one line fails, earlier reservations are released.
 */
export async function reserveStock(items: { productId: string; quantity: number }[]): Promise<Reserved[]> {
  const qty = new Map<string, number>(); // merge duplicate lines
  items.forEach((i) => qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity));

  const reserved: Reserved[] = [];
  for (const [productId, quantity] of qty) {
    // Check-and-decrement in ONE atomic operation: succeeds only if the product is active AND enough stock remains.
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
