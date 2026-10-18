'use client';
import { money } from '@/lib/format';
import type { Call, Product } from '@/lib/types';
import Btn from './Btn';
import Thumb from './Thumb';

type Props = {
  call: Call; products: Product[]; cart: Record<string, number>;
  setQty: (id: string, qty: number) => void; onClose: () => void; onPlaced: () => void;
};

/** Cart as a sheet in the middle of the screen. */
export default function CartSheet({ call, products, cart, setQty, onClose, onPlaced }: Props) {
  const lines = Object.entries(cart).map(([id, quantity]) => ({ id, quantity, product: products.find((p) => p._id === id) }));
  const total = lines.reduce((s, l) => s + (l.product?.price ?? 0) * l.quantity, 0); // display only; the server computes the real total

  const place = async (extra: object = {}) => {
    const r = await call('POST', '/orders', { items: lines.map((l) => ({ productId: l.id, quantity: l.quantity, ...extra })) });
    if (r.ok) onPlaced();
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-panel">
          <div className="drawer-head"><b>Cart</b><button className="ghost icon" onClick={onClose}>✕</button></div>
          <div className="drawer-body">
            {lines.length === 0 && <p className="muted center pad-s">Your cart is empty</p>}
            {lines.map((l) => (
              <div key={l.id} className="line">
                <Thumb product={l.product} className="small" />
                <div className="grow">
                  <div>{l.product?.name ?? 'Unknown product'}</div>
                  <div className="muted">{money((l.product?.price ?? 0) * l.quantity)}</div>
                </div>
                <div className="stepper">
                  <button className="ghost icon" onClick={() => setQty(l.id, l.quantity - 1)}>−</button>
                  <span>{l.quantity}</span>
                  <button className="ghost icon" onClick={() => setQty(l.id, l.quantity + 1)}>＋</button>
                </div>
              </div>
            ))}
          </div>
          <div className="drawer-foot">
            <div className="row between"><span className="muted">Total</span><b>{money(total)}</b></div>
            <Btn disabled={lines.length === 0} onClick={() => place()}>Place order</Btn>
            <Btn className="link" disabled={lines.length === 0} title="Sends a client-side price; the server must reject it" onClick={() => place({ price: 1 })}>Tamper test: send price</Btn>
          </div>
        </div>
      </div>
    </>
  );
}
