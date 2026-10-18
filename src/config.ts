const prod = process.env.NODE_ENV === 'production';
const need = (key: string, dev: string) => {
  const v = process.env[key] ?? (prod ? undefined : dev);
  if (!v) throw new Error(`${key} is required in production`);
  return v;
};

export const config = {
  prod,
  port: Number(process.env.PORT ?? 3000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/orders',
  jwtSecret: need('JWT_SECRET', 'dev-jwt-secret'),
  callbackSecret: need('CALLBACK_SECRET', 'dev-secret'),
};
