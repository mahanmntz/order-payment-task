import { RequestHandler } from 'express';

const silent = process.env.NODE_ENV === 'test' && !process.env.LOG;

const log = (level: 'INFO' | 'WARN' | 'ERROR') => (msg: string, fields: Record<string, unknown> = {}) => {
  if (silent) return;
  const kv = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' && /[\s"]/.test(v) ? JSON.stringify(v) : v}`)
    .join(' ');
  (level === 'ERROR' ? console.error : console.log)(`${new Date().toISOString()} ${level.padEnd(5)} ${msg} ${kv}`.trimEnd());
};

export const logger = { info: log('INFO'), warn: log('WARN'), error: log('ERROR') };

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl.split('?')[0]}`, { status: res.statusCode, ms: Date.now() - start, user: res.locals.user?.id, code: res.locals.errorCode });
  });
  next();
};
