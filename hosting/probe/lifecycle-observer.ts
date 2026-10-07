type Action = 'runFixed' | 'status' | 'stop';
interface Env {
  PROBE: Record<Action, () => Promise<unknown>>;
}
const dispose = (value: unknown) =>
  (value as { [Symbol.dispose]?: () => void } | null | undefined)?.[Symbol.dispose]?.();

/** Local loopback observer only. Its sole remote binding is the fixed private
 * operator, which owns the durable one-use claim. Never deploy this facade. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const action = new Map<string, Action>([
      ['/run-fixed', 'runFixed'],
      ['/status', 'status'],
      ['/stop', 'stop'],
    ]).get(url.pathname);
    // No request content becomes an RPC argument. Abort unread bodies rather
    // than consuming arbitrary local input or a cross-origin upload.
    void request.body?.cancel().catch(() => {});
    if (
      request.method !== 'POST' ||
      url.origin !== 'http://127.0.0.1:8798' ||
      url.search ||
      url.hash ||
      request.headers.has('Origin') ||
      request.headers.has('Sec-Fetch-Site') ||
      request.headers.get('X-Kiln-Operator') !== 'private-lifecycle-v1' ||
      !action
    )
      return new Response('Not found', { status: 404 });
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    let work: Promise<unknown> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    try {
      work = env.PROBE[action]();
      const result = await Promise.race([
        work.then((value) => {
          if (expired) {
            dispose(value);
            throw new Error('PRIVATE_OBSERVATION_EXPIRED');
          }
          return value;
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              expired = true;
              reject(new Error('PRIVATE_OBSERVATION_EXPIRED'));
            },
            action === 'runFixed' ? 16 * 60 * 1000 : 10000,
          );
        }),
      ]);
      try {
        const bytes = JSON.stringify(structuredClone(result));
        if (new TextEncoder().encode(bytes).length > 128 * 1024)
          throw new Error('PRIVATE_OBSERVATION_TOO_LARGE');
        return new Response(bytes, { headers: { ...headers, 'content-type': 'application/json' } });
      } finally {
        dispose(result);
      }
    } catch {
      return Response.json(
        {
          observation: 'unavailable',
          next: 'Read /status for the same trial; do not start a replacement run.',
        },
        { status: 502, headers },
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      dispose(work);
    }
  },
};
