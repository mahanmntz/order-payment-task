import { Router } from 'express';
import { z } from 'zod';
import { login } from './auth.service';

export const authRouter = Router();

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) }).strict();

authRouter.post('/auth/login', async (req, res) => {
  const { email, password } = loginBody.parse(req.body);
  res.json({ success: true, data: await login(email, password) });
});
