'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { money } from '@/lib/format';
import type { Call, LoadState, Order, PayState, Product, ProviderCall } from '@/lib/types';
import Btn from './Btn';
import Thumb from './Thumb';

type Props = {
  call: Call; provider: ProviderCall; orders: Order[]; state: LoadState; products: Product[];
  pay: PayState; setPay: (fn: (p: PayState) => PayState) => void; onChange: () => Promise<unknown>;
};

export default function Orders({ call, provider, orders, state, products, pay, setPay, onChange }: Props) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  // One idempotency key per order: pressing Pay twice sends the same key, so the server replays instead of creating a second payment.
  const doPay = async (o: Order, amount: number, goToGateway: boolean) => {
    const key = pay[o._id]?.key ?? crypto.randomUUID();
    const r = await call('POST', '/payments', { orderId: o._id, amount }, { 'Idempotency-Key': key });
    setPay((p) => ({ ...p, [o._id]: { key, paymentId: r.ok ? r.data._id : p[o._id]?.paymentId } }));
    if (r.ok && goToGateway) {
      setRedirecting(true); // keep feedback on screen until the payment page takes over
      router.push(`/pay/${r.data._id}`);
      setTimeout(() => setRedirecting(false), 10000); // safety net if navigation never completes
    }
  };
  // Plays the payment provider; "×3" sends three identical callbacks at the same time.
  const callback = async (o: Order, status: 'succeeded' | 'failed', times = 1) => {
    const paymentId = pay[o._id]?.paymentId;
    if (!paymentId) return;
    await Promise.all(Array.from({ length: times }, () => provider({ paymentId, status, amount: o.total })));
    await onChange();
  };
  const cancel = async (o: Order) => {
    await call('POST', `/orders/${o._id}/cancel`);
    await onChange();
  };

  if (state === 'loading') return <div className="orders">{[0, 1].map((i) => <div key={i} className="order skel"><span className="bar-skel" /><span className="bar-skel short" /></div>)}</div>;
  if (state === 'error') return <div className="emptybox"><p>Couldn’t load orders.</p><Btn onClick={onChange}>Try again</Btn></div>;
  if (orders.length === 0) return <div className="emptybox"><p className="muted">No orders yet</p></div>;

  return (
    <>
      {redirecting && (
        <div className="redirect">
          <span className="spinner big" />
          <p>Redirecting to secure payment…</p>
        </div>
      )}
    <div className="orders">
      {orders.map((o) => {
        const pending = o.status === 'Pending';
        const paymentId = pay[o._id]?.paymentId;
        return (
          <article key={o._id} className="order">
            <div className="row between">
              <span className="muted">#{o._id.slice(-6)}</span>
              <span className={`badge ${o.status}`}>{o.status}</span>
            </div>
            <div className="items">
              {o.items.map((i) => (
                <div key={i.productId} className="chip">
                  <Thumb product={products.find((p) => p._id === i.productId)} className="small" />
                  <span>×{i.quantity}</span>
                </div>
              ))}
            </div>
            <div className="row between">
              <b>{money(o.total)}</b>
              <div className="row">
                <Btn disabled={!pending} onClick={() => doPay(o, o.total, true)}>Pay</Btn>
                <Btn className="ghost" disabled={!pending} onClick={() => cancel(o)}>Cancel</Btn>
              </div>
            </div>
            <details>
              <summary>Test tools</summary>
              <div className="row">
                <Btn className="ghost" disabled={!pending} onClick={() => doPay(o, Math.max(o.total - 1, 1), false)}>Wrong amount</Btn>
                <Btn className="ghost" disabled={!paymentId} onClick={() => callback(o, 'succeeded')}>Callback ✓</Btn>
                <Btn className="ghost" disabled={!paymentId} onClick={() => callback(o, 'succeeded', 3)}>✓ ×3</Btn>
                <Btn className="ghost" disabled={!paymentId} onClick={() => callback(o, 'failed')}>Callback ✗</Btn>
              </div>
            </details>
          </article>
        );
      })}
    </div>
    </>
  );
}
