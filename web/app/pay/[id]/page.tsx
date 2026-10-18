'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { money } from '@/lib/format';
import { session } from '@/lib/session';
import { useApi } from '@/lib/useApi';
import type { PaymentInfo } from '@/lib/types';

type Phase = 'loading' | 'error' | 'form' | 'success' | 'failed';
// sample card data; nothing is validated or stored
const SAMPLE_CARD = { number: '4539 1488 0343 6467', name: 'Sarah Mitchell', expiry: '09 / 29', cvc: '418' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mock hosted payment page: moves no money. */
export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { call, provider } = useApi();
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [busy, setBusy] = useState<'succeeded' | 'failed' | null>(null);
  const [error, setError] = useState('');
  const [card, setCard] = useState(SAMPLE_CARD);

  useEffect(() => {
    if (!session.token()) { router.replace('/'); return; }
    call('GET', `/payments/${id}`).then((r) => {
      if (!r.ok) { setError(r.message ?? 'Could not load this payment'); setPhase('error'); return; }
      setPayment(r.data);
      // already settled: show the outcome, never charge twice
      setPhase(r.data.status === 'Succeeded' ? 'success' : r.data.status === 'Failed' ? 'failed' : 'form');
    });
  }, [id, call, router]);

  const submit = async (status: 'succeeded' | 'failed') => {
    if (!payment || busy) return;
    setBusy(status);
    setError('');
    // minimum delay so it feels like a real bank round-trip
    const [r] = await Promise.all([provider({ paymentId: payment._id, status, amount: payment.amount }), sleep(status === 'succeeded' ? 2000 : 800)]);
    setBusy(null);
    if (!r.ok) return setError(r.message ?? 'Payment could not be completed. Try again.');
    setPhase(r.data.paymentStatus === 'Succeeded' ? 'success' : 'failed');
  };
  const back = () => { session.saveView('orders'); router.push('/'); };

  return (
    <div className="pay-wrap">
      <div className="pay-card">
        <div className="row between">
          <span className="muted">Mock payment provider</span>
          <span className="badge">Test mode</span>
        </div>

        {phase === 'loading' && <div className="emptybox"><span className="spinner big" /></div>}

        {phase === 'error' && (
          <div className="emptybox">
            <p className="error">{error}</p>
            <button onClick={back}>Back to orders</button>
          </div>
        )}

        {phase === 'form' && payment && (
          <>
            <div>
              <div className="muted">Order #{payment.orderId.slice(-6)}</div>
              <div className="amount">{money(payment.amount)}</div>
            </div>
            <div className="card-visual">
              <span>●●</span>
              <div className="mono">{card.number}</div>
              <div className="row between"><span>{card.name.toUpperCase()}</span><span>{card.expiry}</span></div>
            </div>
            <div className="fields">
              <input value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} aria-label="Card number" disabled={!!busy} />
              <input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} aria-label="Name on card" disabled={!!busy} style={{ gridColumn: '1 / -1' }} />
              <input value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} aria-label="Expiry" disabled={!!busy} />
              <input value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} aria-label="CVC" disabled={!!busy} />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="big-btn" disabled={!!busy} onClick={() => submit('succeeded')}>
              {busy === 'succeeded' ? (<><span className="spinner" />Processing…</>) : `Pay ${money(payment.amount)}`}
            </button>
            <button className="link" disabled={!!busy} onClick={() => submit('failed')}>
              {busy === 'failed' && <span className="spinner" />}Decline payment
            </button>
          </>
        )}

        {(phase === 'success' || phase === 'failed') && payment && (
          <div className="result">
            <div className={`result-icon ${phase === 'success' ? 'ok' : 'bad'}`}>{phase === 'success' ? '✓' : '✕'}</div>
            <h2>{phase === 'success' ? 'Payment successful' : 'Payment failed'}</h2>
            <p className="muted">{money(payment.amount)} · Order #{payment.orderId.slice(-6)}</p>
            <button onClick={back}>Back to orders</button>
          </div>
        )}
      </div>
    </div>
  );
}
