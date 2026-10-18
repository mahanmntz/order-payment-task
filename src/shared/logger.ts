import { RequestHandler } from 'express';

// Silent under Jest unless LOG=1.
const silent = process.env.NODE_ENV === 'test' && !process.env.LOG;
type Fields = Record<string, unknown>;

const fmt = (f?: Fields) =>
  Object.entries(f ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' && /[\s"]/.test(v) ? JSON.stringify(v) : v}`)
    .join(' ');

const out = (level: 'INFO' | 'WARN' | 'ERROR', msg: string, f?: Fields) => {
  if (silent) return;
  (level === 'ERROR' ? console.error : console.log)(`${new Date().toISOString()} ${level.padEnd(5)} ${msg} ${fmt(f)}`.trimEnd());
};

export const logger = {
  info: (msg: string, f?: Fields) => out('INFO', msg, f),
  warn: (msg: string, f?: Fields) => out('WARN', msg, f),
  error: (msg: string, f?: Fields) => out('ERROR', msg, f),
};

/** One line per request: method, path, status, duration, user, and the error code if it failed. Never logs bodies or secrets. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl.split('?')[0]}`, {
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
      user: res.locals.user?.id,
      code: res.locals.errorCode,
    });
  });
  next();
};
