'use client';
import { useState } from 'react';
import { money } from '@/lib/format';
import type { Call, LoadState, Me, Product } from '@/lib/types';
import Btn from './Btn';
import Thumb from './Thumb';

type Props = {
  call: Call; me: Me; products: Product[]; state: LoadState; query: string; setQuery: (q: string) => void;
  cart: Record<string, number>; onAdd: (id: string) => void; onChange: () => Promise<unknown>;
};

export default function ProductGrid({ call, me, products, state, query, setQuery, cart, onAdd, onChange }: Props) {
  const [form, setForm] = useState({ name: '', price: '', stock: '', image: '' });
  const [open, setOpen] = useState(false);
  const isAdmin = me.role === 'admin';

  const patch = async (id: string, body: object) => {
    await call('PATCH', `/products/${id}`, body);
    await onChange();
  };
  const create = async () => {
    const r = await call('POST', '/products', { name: form.name, price: Number(form.price), stock: Number(form.stock), ...(form.image && { image: form.image }) });
    if (r.ok) { setForm({ name: '', price: '', stock: '', image: '' }); setOpen(false); }
    await onChange();
  };

  return (
    <>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {state === 'loading' && (
        <div className="products">{[0, 1, 2].map((i) => <div key={i} className="product skel"><div className="media" /><div className="info"><span className="bar-skel" /></div></div>)}</div>
      )}

      {state === 'error' && (
        <div className="emptybox">
          <p>Couldn’t load products.</p>
          <Btn onClick={onChange}>Try again</Btn>
        </div>
      )}

      {state === 'ready' && products.length === 0 && !isAdmin && <div className="emptybox"><p className="muted">{query ? `No products match “${query}”` : 'No products yet'}</p></div>}

      {state === 'ready' && (products.length > 0 || isAdmin) && (
        <div className="products">
          {products.map((p) => (
            <article key={p._id} className={`product ${p.isActive ? '' : 'inactive'}`}>
              <div className="media">
                <Thumb product={p} />
                <span className={`pill ${p.stock === 0 ? 'out' : p.stock === 1 ? 'low' : ''}`}>
                  {!p.isActive ? 'Unavailable' : p.stock === 0 ? 'Sold out' : p.stock === 1 ? 'Last one' : `${p.stock} in stock`}
                </span>
              </div>
              <div className="info">
                <div>
                  <div className="name">{p.name}</div>
                  <div className="price">{money(p.price)}</div>
                </div>
                <button onClick={() => onAdd(p._id)}>{cart[p._id] ? `Add · ${cart[p._id]}` : 'Add'}</button>
              </div>
              {isAdmin && (
                <div className="admin">
                  <Btn className="link" onClick={() => patch(p._id, { isActive: !p.isActive })}>{p.isActive ? 'Deactivate' : 'Activate'}</Btn>
                  <Btn className="link" onClick={async () => { const v = prompt('New price', String(p.price)); if (v) await patch(p._id, { price: Number(v) }); }}>Price</Btn>
                  <Btn className="link" onClick={async () => { const v = prompt('New stock', String(p.stock)); if (v) await patch(p._id, { stock: Number(v) }); }}>Stock</Btn>
                </div>
              )}
            </article>
          ))}

          {isAdmin && !query && (
            <article className="product new">
              {open ? (
                <div className="newform">
                  <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input placeholder="Price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  <input placeholder="Stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                  <input placeholder="Image URL (optional)" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
                  <div className="row"><Btn onClick={create} disabled={!form.name || !form.price || !form.stock}>Create</Btn><button className="ghost" onClick={() => setOpen(false)}>Cancel</button></div>
                </div>
              ) : (
                <button className="ghost plus" onClick={() => setOpen(true)}>＋</button>
              )}
            </article>
          )}
        </div>
      )}
    </>
  );
}
