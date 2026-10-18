'use client';
import type { View } from '@/lib/session';
import type { Me } from '@/lib/types';

type Props = {
  me: Me | null; view: View; setView: (v: View) => void;
  cartCount: number; onCart: () => void; onLog: () => void; onLogout: () => void;
};

export default function Header({ me, view, setView, cartCount, onCart, onLog, onLogout }: Props) {
  return (
    <header className="bar">
      <span className="logo">◐</span>
      {me && (
        <nav className="tabs">
          <button className={view === 'products' ? 'tab on' : 'tab'} onClick={() => setView('products')}>Products</button>
          <button className={view === 'orders' ? 'tab on' : 'tab'} onClick={() => setView('orders')}>Orders</button>
        </nav>
      )}
      <div className="bar-right">
        <button className="ghost icon" onClick={onLog} title="Request log">{'</>'}</button>
        {me && (
          <>
            <button className="ghost" onClick={onCart}>Cart{cartCount > 0 && <span className="count">{cartCount}</span>}</button>
            <span className="avatar" title={`${me.email} (${me.role})`}>{me.email[0].toUpperCase()}</span>
            <button className="ghost" onClick={onLogout}>Sign out</button>
          </>
        )}
      </div>
    </header>
  );
}
