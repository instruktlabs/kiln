export const lifecycleManifest = {
  account: 'a'.repeat(32),
  prefix: 'kiln-private-lifecycle-v1',
  origin: 'https://kiln-private-qualification.invalid',
  database: {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'kiln-private-lifecycle-v1-accounts',
  },
  oauthKv: 'b'.repeat(32),
  bucket: 'kiln-private-lifecycle-v1-artifacts',
  requestLimits: {
    edge: { namespace: '8201', perMinute: 600 },
    account: { namespace: '8202', perMinute: 120 },
  },
  images: {
    coordinator: `registry.cloudflare.com/${'a'.repeat(32)}/kiln-coordinator@sha256:${'c'.repeat(64)}`,
    software: `registry.cloudflare.com/${'a'.repeat(32)}/kiln-software@sha256:${'d'.repeat(64)}`,
  },
  compute: {
    maxConcurrent: 1,
    tenantPerMinute: 14,
    tenantPerDay: 14,
    globalPerDay: 14,
    globalPerMonth: 14,
    deadlineMs: 120000,
  },
  storage: { maxBytes: 67108864, maxObjects: 256, maxGroups: 64 },
};
