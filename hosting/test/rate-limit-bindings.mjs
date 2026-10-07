// Real local bindings. Ordinary auth/storage fixtures have generous limits so
// unrelated tests stay independent; request-limits.test.mjs tests exhaustion.
export const rateLimitBindings = {
  EDGE_REQUEST_LIMIT: { namespace_id: '1001', simple: { limit: 1000000, period: 60 } },
  ACCOUNT_REQUEST_LIMIT: { namespace_id: '1002', simple: { limit: 1000000, period: 60 } },
};
