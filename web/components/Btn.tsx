'use client';
import { useState, type ButtonHTMLAttributes } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick: () => unknown };

/** Button that shows a spinner and disables itself while its (async) handler runs. */
export default function Btn({ onClick, children, disabled, ...rest }: Props) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await onClick(); } finally { setBusy(false); }
  };
  return (
    <button {...rest} disabled={disabled || busy} onClick={run} aria-busy={busy}>
      {busy && <span className="spinner" />}
      {children}
    </button>
  );
}
