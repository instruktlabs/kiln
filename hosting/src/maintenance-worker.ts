import gateway from './worker';

// A separate, reviewable artifact closes every HTTP path without touching data
// or accepting credentials. Scheduled deletion recovery must continue unchanged.
export default {
  fetch(request: Request): Response {
    void request.body?.cancel().catch(() => {});
    return new Response(
      request.method === 'HEAD' ? null : 'Kiln is temporarily unavailable. Please try again later.',
      {
        status: 503,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          'retry-after': '60',
          'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
      },
    );
  },
  scheduled: gateway.scheduled,
};
