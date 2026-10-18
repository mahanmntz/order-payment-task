import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { config } from '../../config';
import { AppError } from '../../shared/errors';
import { User } from '../users';

export type Me = { id: string; role: 'user' | 'admin' };

export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const hashPassword = (pw: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
};
const checkPassword = (pw: string, stored: string) => {
  const [salt, hash] = stored.split(':');
  return safeEqual(scryptSync(pw, salt, 64).toString('hex'), hash);
};

// Minimal HS256 JWT (header.payload.signature), no external dependency.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (data: string) => createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

export const signToken = (me: Me) => {
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...me, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${data}.${sign(data)}`;
};

export const verifyToken = (token: string): Me | null => {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s || !safeEqual(s, sign(`${h}.${p}`))) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? { id: payload.id, role: payload.role } : null;
  } catch {
    return null;
  }
};

export async function login(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Same error for unknown email / wrong password: don't reveal which one failed.
  if (!user || !checkPassword(password, user.passwordHash)) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  return { token: signToken({ id: String(user._id), role: user.role }), user: { id: user._id, email: user.email, role: user.role } };
}
