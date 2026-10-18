'use client';
import { useState } from 'react';
import type { Call, Me } from '@/lib/types';

const QUICK = [
  { label: 'Admin', email: 'admin@example.com', password: 'admin123' },
  { label: 'User 1', email: 'user1@example.com', password: 'user123' },
  { label: 'User 2', email: 'user2@example.com', password: 'user123' },
];

export default function Login({ call, onLogin }: { call: Call; onLogin: (token: string, user: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (e: string, p: string) => {
    setLoading(true);
    const r = await call('POST', '/auth/login', { email: e, password: p });
    setLoading(false);
    if (r.ok) onLogin(r.data.token, r.data.user);
  };

  return (
    <form className="login" onSubmit={(e) => { e.preventDefault(); if (!loading) login(email, password); }}>
      <h1>Sign in</h1>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus disabled={loading} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
      <button type="submit" disabled={loading || !email || !password}>{loading && <span className="spinner" />}Continue</button>
      <div className="quick">
        {QUICK.map((q) => (
          <button type="button" key={q.label} className="ghost" disabled={loading} onClick={() => login(q.email, q.password)}>{q.label}</button>
        ))}
      </div>
    </form>
  );
}
