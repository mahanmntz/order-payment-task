import { Router } from 'express';
import { z } from 'zod';
import { objectId } from '../../shared/validation';
import { auth, me } from '../auth';
import { cancelOrder, createOrder, getOrder, listOrders } from './order.service';

export const orderRouter = Router();
orderRouter.use('/orders', auth); // scoped: the router is mounted at the root

const body = z
  .object({ items: z.array(z.object({ productId: objectId, quantity: z.number().int().min(1).max(1000) }).strict()).min(1).max(100) })
  .strict();

orderRouter.post('/orders', async (req, res) => {
  const { items } = body.parse(req.body);
  res.status(201).json({ success: true, data: await createOrder(me(res), items) });
});
orderRouter.get('/orders', async (_req, res) => {
  res.json({ success: true, data: await listOrders(me(res)) });
});
orderRouter.get('/orders/:id', async (req, res) => {
  res.json({ success: true, data: await getOrder(me(res), objectId.parse(req.params.id)) });
});
orderRouter.post('/orders/:id/cancel', async (req, res) => {
  res.json({ success: true, data: await cancelOrder(me(res), objectId.parse(req.params.id)) });
});
