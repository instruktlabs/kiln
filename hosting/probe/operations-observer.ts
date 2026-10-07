import { qualificationControl } from './qualification-rpc';

type Action = 'begin' | 'status' | 'progress' | 'stop' | 'inspect';
interface Env {
  PROBE: Record<Action, () => Promise<unknown>>;
}

// Local loopback facade only; never deploy. No caller data becomes an RPC argument.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const action = new Map<string, Action>([
      ['/begin', 'begin'],
      ['/status', 'status'],
      ['/progress', 'progress'],
      ['/stop', 'stop'],
      ['/inspect', 'inspect'],
    ]).get(url.pathname);
    void request.body?.cancel().catch(() => {});
    if (
      request.method !== 'POST' ||
      url.origin !== 'http://127.0.0.1:8799' ||
      url.search ||
      url.hash ||
      request.headers.has('Origin') ||
      request.headers.has('Sec-Fetch-Site') ||
      request.headers.get('X-Kiln-Operator') !== 'private-operations-v1' ||
      !action
    )
      return new Response('Not found', { status: 404 });
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    try {
      const result = await qualificationControl(env.PROBE[action]());
      const body = JSON.stringify(result);
      if (new TextEncoder().encode(body).length > 4096)
        throw new Error('PRIVATE_RECEIPT_TOO_LARGE');
      return new Response(body, { headers: { ...headers, 'content-type': 'application/json' } });
    } catch {
      return Response.json(
        {
          observation: 'unavailable',
          next: 'Read status for the same run; do not create a replacement.',
        },
        { status: 502, headers },
      );
    }
  },
};
