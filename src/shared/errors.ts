import { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found'));

const send = (res: Response, status: number, code: string, message: string) => {
  res.locals.errorCode = code;
  res.status(status).json({ success: false, message, code });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) return send(res, err.status, err.code, err.message);
  if (err instanceof ZodError) return send(res, 400, 'VALIDATION_ERROR', err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  if (err?.type === 'entity.parse.failed') return send(res, 400, 'INVALID_JSON', 'Invalid JSON');
  logger.error('unhandled error', { stack: err?.stack ?? String(err) }); // never sent to the client
  send(res, 500, 'INTERNAL_ERROR', 'Internal server error');
};
