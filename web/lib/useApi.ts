'use client';
import { useCallback, useRef, useState } from 'react';
import { session } from './session';
import type { ApiResult, ProviderBody } from './types';

export type LogEntry = { id: number; title: string; curl: string; status: number; replayed: boolean; response: unknown };

const API_DIRECT = 'http://localhost:3000'; // only used to print an equivalent curl command

/** fetch that never throws */
async function request(url: string, method: string, headers: Record<string, string>, body?: unknown) {
  const t = performance.now();
  let res: Response | null = null;
  let json: any;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    json = await res.json().catch(() => ({ success: false, message: 'Unexpected server response', code: 'BAD_RESPONSE' }));
  } catch {
    json = { success: false, message: 'Cannot reach the server. Is the API running?', code: 'NETWORK_ERROR' };
  }
  const ms = Math.round(performance.now() - t);
  console.debug(`[api] ${method} ${url} -> ${res?.status ?? 'network error'} (${ms}ms)`);
  const result: ApiResult = { ok: !!json.success, status: res?.status ?? 0, data: json.data, message: json.message, code: json.code, replayed: res?.headers.get('idempotent-replayed') === 'true' };
  return { result, json };
}

const toCurl = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  `curl -X ${method} ${API_DIRECT}${path}` +
  Object.entries(headers).map(([k, v]) => ` \\\n  -H '${k}: ${v}'`).join('') +
  (body === undefined ? '' : ` \\\n  -d '${JSON.stringify(body)}'`);

export function useApi() {
  const nextId = useRef(1);
  const [log, setLog] = useState<LogEntry[]>([]);
  const record = useCallback((e: Omit<LogEntry, 'id'>) => setLog((l) => [{ ...e, id: nextId.current++ }, ...l].slice(0, 30)), []);

  const call = useCallback(
    async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult> => {
      const token = session.token();
      const h: Record<string, string> = { 'content-type': 'application/json', ...headers, ...(token && { authorization: `Bearer ${token}` }) };
      const { result, json } = await request(`/api${path}`, method, h, body);
      if (method !== 'GET') {
        record({ title: `${method} ${path}`, curl: toCurl(method, path, { ...h, ...(token && { authorization: 'Bearer $TOKEN' }) }, body), status: result.status, replayed: !!result.replayed, response: json });
      }
      return result;
    },
    [record],
  );

  // provider webhook, sent through Next's server which adds the secret
  const provider = useCallback(
    async (body: ProviderBody): Promise<ApiResult> => {
      const { result, json } = await request('/provider/callback', 'POST', { 'content-type': 'application/json' }, body);
      record({
        title: 'POST /payments/callback (provider)',
        curl: toCurl('POST', '/payments/callback', { 'content-type': 'application/json', 'x-callback-secret': '$CALLBACK_SECRET' }, body),
        status: result.status, replayed: false, response: json,
      });
      return result;
    },
    [record],
  );

  return { call, provider, log, clearLog: () => setLog([]) };
}
