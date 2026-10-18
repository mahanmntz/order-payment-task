import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors';
import { money, objectId } from '../../shared/validation';
import { admin, auth } from '../auth';
import { Product } from './product.model';

export const productRouter = Router();

const body = z.object({ name: z.string().min(1), price: money, stock: z.number().int().min(0), isActive: z.boolean().default(true), image: z.string().max(300).optional() }).strict();

const listQuery = z.object({ q: z.string().trim().max(50).optional() });
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

productRouter.get('/products', async (req, res) => {
  const { q } = listQuery.parse(req.query);
  const filter = q ? { name: { $regex: escapeRegex(q), $options: 'i' } } : {};
  res.json({ success: true, data: await Product.find(filter).sort({ createdAt: -1 }).limit(100) });
});

productRouter.get('/products/:id', async (req, res) => {
  const p = await Product.findById(objectId.parse(req.params.id));
  if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  res.json({ success: true, data: p });
});

productRouter.post('/products', auth, admin, async (req, res) => {
  res.status(201).json({ success: true, data: await Product.create(body.parse(req.body)) });
});

productRouter.patch('/products/:id', auth, admin, async (req, res) => {
  const p = await Product.findByIdAndUpdate(objectId.parse(req.params.id), body.partial().parse(req.body), { returnDocument: 'after', runValidators: true });
  if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  res.json({ success: true, data: p });
});
