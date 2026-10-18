// Mock payment provider webhook. It runs on the Next server and holds the shared secret,
// like a real provider would: the browser never sees CALLBACK_SECRET.
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${API_URL}/payments/callback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-callback-secret': process.env.CALLBACK_SECRET ?? 'dev-secret' },
      body: JSON.stringify(body),
    });
    console.log(`[provider] callback payment=${body?.paymentId} status=${body?.status} -> API ${res.status}`);
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('[provider] API unreachable', e);
    return Response.json({ success: false, message: 'Payment provider could not reach the API', code: 'PROVIDER_UNREACHABLE' }, { status: 502 });
  }
}
