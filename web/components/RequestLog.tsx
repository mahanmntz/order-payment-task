'use client';
import type { LogEntry } from '@/lib/useApi';

export default function RequestLog({ log, onClear, onClose }: { log: LogEntry[]; onClear: () => void; onClose: () => void }) {
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer wide">
        <div className="drawer-head">
          <b>Request log</b>
          <div className="row"><button className="ghost" onClick={onClear}>Clear</button><button className="ghost icon" onClick={onClose}>✕</button></div>
        </div>
        <div className="drawer-body">
          {log.length === 0 && <p className="muted center">Write requests show up here as curl</p>}
          {log.map((e) => (
            <details key={e.id} open={e.id === log[0].id}>
              <summary>
                <span className={`status ${e.status < 400 ? 'ok' : 'bad'}`}>{e.status}</span> {e.title}
                {e.replayed && <span className="badge Pending">replayed</span>}
              </summary>
              <pre>{e.curl}</pre>
              <pre>{JSON.stringify(e.response, null, 2)}</pre>
            </details>
          ))}
        </div>
      </aside>
    </>
  );
}
