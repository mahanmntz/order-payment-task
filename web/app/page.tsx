'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import CartSheet from '@/components/CartSheet';
import Header from '@/components/Header';
import Login from '@/components/Login';
import Orders from '@/components/Orders';
import ProductGrid from '@/components/ProductGrid';
import RequestLog from '@/components/RequestLog';
import { session, type View } from '@/lib/session';
import { useApi } from '@/lib/useApi';
import type { Call, LoadState, Me, Order, PayState, Product, ProviderBody, ProviderCall } from '@/lib/types';

export default function Home() {
  const { call: rawCall, provider: rawProvider, log, clearLog } = useApi();
  const [booted, setBooted] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsState, setProductsState] = useState<LoadState>('loading');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersState, setOrdersState] = useState<LoadState>('loading');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPayState] = useState<PayState>({});
  const [view, setViewState] = useState<View>('products');
  const [panel, setPanel] = useState<'cart' | 'log' | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queryRef = useRef('');

  const notify = useCallback((text: string, ok = false) => {
    setToast({ text, ok });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const signedOut = useCallback(() => {
    session.clear();
    setMe(null); setCart({}); setPayState({}); setOrders([]); setPanel(null); setViewState('products');
  }, []);

  // every call goes through here: errors become toasts, an expired session signs out
  const call: Call = useCallback(
    async (...args: Parameters<Call>) => {
      const r = await rawCall(...args);
      if (r.code === 'UNAUTHORIZED') {
        if (session.token()) { signedOut(); notify('Session expired. Please sign in again.'); }
      } else if (!r.ok) notify(`${r.code ?? r.status}: ${r.message ?? 'Request failed'}`);
      else if (r.replayed) notify('Replayed: same Idempotency-Key, no new payment', true);
      return r;
    },
    [rawCall, notify, signedOut],
  );
  const provider: ProviderCall = useCallback(
    async (body: ProviderBody) => {
      const r = await rawProvider(body);
      if (!r.ok) notify(`${r.code ?? r.status}: ${r.message ?? 'Provider call failed'}`);
      return r;
    },
    [rawProvider, notify],
  );

  const loadProducts = useCallback(async (q: string) => {
    const r = await call('GET', `/products${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    if (r.ok) setProducts(r.data);
    setProductsState(r.ok ? 'ready' : 'error');
  }, [call]);

  const loadOrders = useCallback(async () => {
    if (!session.token()) { setOrders([]); setOrdersState('ready'); return; }
    const r = await call('GET', '/orders');
    if (r.ok) setOrders(r.data);
    setOrdersState(r.ok ? 'ready' : session.token() ? 'error' : 'ready');
  }, [call]);

  const refresh = useCallback(() => Promise.all([loadProducts(queryRef.current), loadOrders()]), [loadProducts, loadOrders]);

  // restore the session (also after the payment page)
  useEffect(() => {
    const t = session.token();
    const m = session.me();
    if (t && m) { setMe(m); setPayState(session.pay()); setViewState(session.view()); }
    setBooted(true);
  }, []);
  useEffect(() => { if (booted) loadOrders(); }, [booted, loadOrders]);

  // debounced search, also the initial load
  useEffect(() => {
    if (!booted) return;
    queryRef.current = query;
    const t = setTimeout(() => loadProducts(query), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, booted, loadProducts]);

  const setPay = (fn: (p: PayState) => PayState) => setPayState((p) => { const n = fn(p); session.savePay(n); return n; });
  const setView = (v: View) => { setViewState(v); session.saveView(v); };
  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const { [id]: _, ...rest } = c;
      return qty > 0 ? { ...rest, [id]: qty } : rest;
    });
  const cartCount = Object.values(cart).reduce((s, n) => s + n, 0);

  const onLogin = (token: string, user: Me) => {
    session.login(token, user);
    setMe(user);
    setView('products');
    setOrdersState('loading');
    refresh();
  };
  const onLogout = () => { signedOut(); refresh(); };
  const onAdd = (id: string) => {
    if (cartCount === 0) setPanel('cart'); // the first item opens the cart
    setQty(id, (cart[id] ?? 0) + 1);
  };

  return (
    <>
      <Header me={me} view={view} setView={setView} cartCount={cartCount} onCart={() => setPanel('cart')} onLog={() => setPanel('log')} onLogout={onLogout} />
      <main className="main">
        {!booted && <div className="emptybox"><span className="spinner big" /></div>}
        {booted && !me && <Login call={call} onLogin={onLogin} />}
        {booted && me && view === 'products' && (
          <ProductGrid call={call} me={me} products={products} state={productsState} query={query} setQuery={setQuery} cart={cart} onAdd={onAdd} onChange={refresh} />
        )}
        {booted && me && view === 'orders' && (
          <Orders call={call} provider={provider} orders={orders} state={ordersState} products={products} pay={pay} setPay={setPay} onChange={refresh} />
        )}
      </main>

      {panel === 'cart' && (
        <CartSheet
          call={call} products={products} cart={cart} setQty={setQty} onClose={() => setPanel(null)}
          onPlaced={() => { setCart({}); setPanel(null); setView('orders'); notify('Order placed', true); refresh(); }}
        />
      )}
      {panel === 'log' && <RequestLog log={log} onClear={clearLog} onClose={() => setPanel(null)} />}
      {toast && <div className={`toast ${toast.ok ? 'ok' : 'bad'}`}>{toast.text}</div>}
    </>
  );
}
