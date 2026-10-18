import { RequestHandler } from 'express';
import { AppError } from '../../shared/errors';
import { Me, verifyToken } from './auth.service';

export const me = (res: { locals: any }) => res.locals.user as Me;

export const auth: RequestHandler = (req, res, next) => {
  const user = verifyToken(req.header('authorization')?.replace(/^Bearer /, '') ?? '');
  if (!user) return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
  res.locals.user = user;
  next();
};

export const admin: RequestHandler = (_req, res, next) =>
  me(res).role === 'admin' ? next() : next(new AppError(403, 'FORBIDDEN', 'Admin only'));
