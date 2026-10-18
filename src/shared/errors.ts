import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found'));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.locals.errorCode = err.code;
    return void res.status(err.status).json({ success: false, message: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    res.locals.errorCode = 'VALIDATION_ERROR';
    const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    return void res.status(400).json({ success: false, message, code: 'VALIDATION_ERROR' });
  }
  if (err?.type === 'entity.parse.failed') {
    return void res.status(400).json({ success: false, message: 'Invalid JSON', code: 'INVALID_JSON' });
  }
  res.locals.errorCode = 'INTERNAL_ERROR';
  logger.error('unhandled error', { stack: err?.stack ?? String(err) }); // log internally, never leak
  res.status(500).json({ success: false, message: 'Internal server error', code: 'INTERNAL_ERROR' });
};
