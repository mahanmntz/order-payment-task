import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { config } from '../../config';
import { AppError } from '../../shared/errors';
import { User } from '../users';

export type Me = { id: string; role: 'user' | 'admin' };

export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const scrypt = (pw: string, salt: string) => scryptSync(pw, salt, 64).toString('hex');
export const hashPassword = (pw: string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scrypt(pw, salt)}`;
};
const checkPassword = (pw: string, stored: string) => {
  const [salt, hash] = stored.split(':');
  return safeEqual(scrypt(pw, salt), hash);
};

// HS256 JWT without a dependency: header.payload.signature
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (data: string) => createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

const signToken = (me: Me) => {
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...me, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${data}.${sign(data)}`;
};

export const verifyToken = (token: string): Me | null => {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s || !safeEqual(s, sign(`${h}.${p}`))) return null;
  try {
    const { id, role, exp } = JSON.parse(Buffer.from(p, 'base64url').toString());
    return exp > Date.now() / 1000 ? { id, role } : null;
  } catch {
    return null;
  }
};

export async function login(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // one error for unknown email and wrong password
  if (!user || !checkPassword(password, user.passwordHash)) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  return { token: signToken({ id: String(user._id), role: user.role }), user: { id: user._id, email: user.email, role: user.role } };
}
