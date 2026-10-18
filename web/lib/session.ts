import type { Me, PayState } from './types';

export type View = 'products' | 'orders';

// sessionStorage: survives reloads and the trip to the payment page, cleared when the tab closes.
const read = (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => {
  try { v === null ? window.sessionStorage.removeItem(k) : window.sessionStorage.setItem(k, v); } catch { /* storage unavailable */ }
};
const json = <T>(k: string, fallback: T): T => { try { const v = read(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };

export const session = {
  token: () => read('token') ?? '',
  me: () => json<Me | null>('me', null),
  login(token: string, me: Me) { write('token', token); write('me', JSON.stringify(me)); },
  clear() { ['token', 'me', 'pay', 'view'].forEach((k) => write(k, null)); },
  pay: () => json<PayState>('pay', {}),
  savePay: (p: PayState) => write('pay', JSON.stringify(p)),
  view: (): View => (read('view') as View | null) ?? 'products',
  saveView: (v: View) => write('view', v),
};
