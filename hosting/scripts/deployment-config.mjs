import {
  OutputRootConfigSchema,
  OutputWorkerSchema,
  OutputContainerSchema,
  convertToWranglerConfig,
} from '@cloudflare/config';

// The Build Output Specification requires one default Worker directory. Keep
// receipt roles and deployed names unchanged; the gateway owns that entry.
export const workerOutputPath = (role) =>
  `.cloudflare/output/v0/workers/${role === 'gateway' ? 'default' : role}`;

const fail = () => {
  throw new Error('Invalid deployment manifest');
};
function fields(value, names) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...names].sort().join(',')
  )
    fail();
}
function matches(value, pattern) {
  if (typeof value !== 'string' || value.trim() !== value || !pattern.test(value)) fail();
}
function count(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail();
}

// Inputs have already passed manifest validation. This is a reviewable candidate,
// not a Notifications API payload or evidence of live alert delivery.
function monitoringCandidate(account, datasetName) {
  const dataset = `events.analyticsEngine.${datasetName}`;
  const query = (filters) =>
    `SELECT COUNT(*) AS value\nFROM ${dataset}\nWHERE accountTag = '${account}'\n  AND timestamp >= NOW() - INTERVAL '5' MINUTE\n  AND blob1 = 'kiln.ops.v1'\n  AND ${filters}`;
  return {
    schemaVersion: 1,
    configured: false,
    destination: null,
    dataset,
    dialect: 'Cloudflare Analytics SQL API',
    alerts: [
      [
        'deletion-heartbeat',
        "blob2 = 'health' AND blob3 = 'deletion' AND blob4 = 'ok' AND double5 = 1",
        '<',
        1,
      ],
      ['compute-heartbeat', "blob2 = 'health' AND blob3 = 'compute' AND blob4 = 'ok'", '<', 1],
      [
        'deletion-overdue',
        "blob2 = 'health' AND blob3 = 'deletion' AND blob4 = 'ok' AND double4 > 0",
        '>=',
        1,
      ],
      [
        'compute-cleanup',
        "blob2 = 'health' AND blob3 = 'compute' AND blob4 = 'ok' AND double4 > 0",
        '>=',
        3,
      ],
      ['gateway-errors', "blob2 = 'http' AND blob4 LIKE '5%'", '>=', 5],
      ['gateway-rejections', "blob2 = 'http' AND blob4 = '429'", '>=', 100],
    ].map(([name, filters, comparison, threshold]) => ({
      name,
      query: query(filters),
      comparison,
      threshold,
      executionIntervalMinutes: 1,
      repeatIntervalMinutes: 60,
    })),
  };
}

/** Pure preparation: no Cloudflare requests, credentials, resource creation or public routes. */
export function deploymentConfig(m) {
  fields(m, [
    'account',
    'prefix',
    'origin',
    'database',
    'oauthKv',
    'bucket',
    'images',
    'compute',
    'storage',
    'requestLimits',
  ]);
  fields(m.database, ['id', 'name']);
  fields(m.images, ['coordinator', 'software']);
  fields(m.compute, [
    'maxConcurrent',
    'tenantPerMinute',
    'tenantPerDay',
    'globalPerDay',
    'globalPerMonth',
    'deadlineMs',
  ]);
  fields(m.storage, ['maxBytes', 'maxObjects', 'maxGroups']);
  fields(m.requestLimits, ['edge', 'account']);
  for (const policy of Object.values(m.requestLimits)) {
    fields(policy, ['namespace', 'perMinute']);
    matches(policy.namespace, /^[1-9][0-9]*$/);
    count(Number(policy.namespace));
    count(policy.perMinute);
  }
  if (m.requestLimits.edge.namespace === m.requestLimits.account.namespace) fail();
  matches(m.account, /^[a-f0-9]{32}$/);
  matches(m.prefix, /^kiln-[a-z0-9]+(?:-[a-z0-9]+)*$/);
  if (m.prefix.length > 40) fail();
  matches(m.database.id, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  matches(m.oauthKv, /^[a-f0-9]{32}$/);
  if (m.database.name !== `${m.prefix}-accounts` || m.bucket !== `${m.prefix}-artifacts`) fail();
  let origin;
  try {
    origin = new URL(m.origin);
  } catch {
    fail();
  }
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== m.origin ||
    origin.username ||
    origin.password
  )
    fail();
  for (const [kind, image] of Object.entries(m.images)) {
    matches(
      image,
      /^registry\.cloudflare\.com\/[a-f0-9]{32}\/kiln-(?:coordinator|software)@sha256:[a-f0-9]{64}$/,
    );
    if (!image.startsWith(`registry.cloudflare.com/${m.account}/kiln-${kind}@sha256:`)) fail();
  }
  for (const value of Object.values(m.compute)) count(value);
  for (const value of Object.values(m.storage)) count(value);
  count(m.compute.maxConcurrent, 16);
  count(m.compute.deadlineMs, 120000);
  if (
    m.compute.tenantPerMinute > m.compute.tenantPerDay ||
    m.compute.tenantPerDay > m.compute.globalPerDay ||
    m.compute.globalPerDay > m.compute.globalPerMonth
  )
    fail();
  const names = Object.fromEntries(
    ['gateway', 'tenant', 'admission', 'request', 'evaluation', 'render'].map((role) => [
      role,
      `${m.prefix}-${role}`,
    ]),
  );
  const text = (value) => ({ type: 'text', value: String(value) });
  const object = (role, exportName) => ({
    type: 'durable-object',
    worker: names[role],
    exportName,
  });
  const workerBinding = (role, exportName) => ({ type: 'worker', worker: names[role], exportName });
  const sqlite = { type: 'durable-object', storage: 'sqlite' };
  const entry = { type: 'worker' };
  const containers = {};
  for (const [role, imageKey, kind] of [
    ['request', 'coordinator', 'coordinator'],
    ['evaluation', 'kiln', 'software'],
    ['render', 'renderer', 'software'],
  ]) {
    containers[role] = OutputContainerSchema.parse({
      name: `${names[role]}-vm`,
      schedulingPolicy: 'durable-object',
      ssh: { enabled: false },
      observability: { enabled: false, logs: { enabled: false } },
      images: { [imageKey]: { reference: m.images[kind] } },
    });
  }
  const definitions = {
    gateway: {
      entry: 'worker',
      env: {
        ACCOUNTS: { type: 'd1', ...m.database },
        OAUTH_KV: { type: 'kv', id: m.oauthKv },
        OPERATIONS: {
          type: 'analytics-engine-dataset',
          name: `${m.prefix.replaceAll('-', '_')}_ops`,
        },
        PUBLIC_ORIGIN: text(m.origin),
        ...Object.fromEntries(
          [
            ['edge', 'EDGE_REQUEST_LIMIT'],
            ['account', 'ACCOUNT_REQUEST_LIMIT'],
          ].map(([kind, name]) => [
            name,
            {
              type: 'rate-limit',
              namespace: m.requestLimits[kind].namespace,
              simple: { limit: m.requestLimits[kind].perMinute, period: 60 },
            },
          ]),
        ),
        TENANTS: object('tenant', 'KilnTenant'),
        NATIVE_COMPUTE: workerBinding('admission', 'KilnCompute'),
        ...Object.fromEntries(
          [
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'GITHUB_CLIENT_ID',
            'GITHUB_CLIENT_SECRET',
          ].map((name) => [name, { type: 'secret' }]),
        ),
      },
      exports: {},
    },
    tenant: {
      entry: 'tenant-worker',
      env: {
        ARTIFACTS: { type: 'r2', name: m.bucket },
        STORAGE_MAX_BYTES: text(m.storage.maxBytes),
        STORAGE_MAX_OBJECTS: text(m.storage.maxObjects),
        STORAGE_MAX_GROUPS: text(m.storage.maxGroups),
      },
      exports: { KilnTenant: sqlite },
    },
    admission: {
      entry: 'admission-worker',
      env: {
        ADMISSION: object('admission', 'KilnAdmission'),
        REQUESTS: object('request', 'KilnNativeRequest'),
        COMPUTE_MAX_CONCURRENT: text(m.compute.maxConcurrent),
        COMPUTE_TENANT_PER_MINUTE: text(m.compute.tenantPerMinute),
        COMPUTE_TENANT_PER_DAY: text(m.compute.tenantPerDay),
        COMPUTE_GLOBAL_PER_DAY: text(m.compute.globalPerDay),
        COMPUTE_GLOBAL_PER_MONTH: text(m.compute.globalPerMonth),
        COMPUTE_DEADLINE_MS: text(m.compute.deadlineMs),
      },
      exports: { KilnAdmission: sqlite, KilnCompute: entry, KilnComputeControl: entry },
    },
    request: {
      entry: 'request-worker',
      env: {
        PUBLIC_ORIGIN: text(m.origin),
        TENANTS: object('tenant', 'KilnTenant'),
        REQUESTS: object('request', 'KilnNativeRequest'),
        EVALUATIONS: object('evaluation', 'KilnEvaluationJob'),
        RENDERS: object('render', 'KilnRenderJob'),
      },
      exports: {
        KilnNativeRequest: { ...sqlite, container: containers.request.name },
        KilnNativeStorage: entry,
        KilnNativeEvaluation: entry,
        KilnNativeRender: entry,
      },
    },
    evaluation: {
      entry: 'evaluation-worker',
      env: { EVALUATIONS: object('evaluation', 'KilnEvaluationJob') },
      exports: { KilnEvaluationJob: { ...sqlite, container: containers.evaluation.name } },
    },
    render: {
      entry: 'render-worker',
      env: { RENDERS: object('render', 'KilnRenderJob') },
      exports: { KilnRenderJob: { ...sqlite, container: containers.render.name } },
    },
  };
  const workers = {},
    wrangler = {};
  for (const [role, definition] of Object.entries(definitions)) {
    const worker = OutputWorkerSchema.parse({
      name: names[role],
      compatibilityDate: '2026-10-06',
      compatibilityFlags: [
        'enable_ctx_exports',
        'enable_request_signal',
        'global_fetch_strictly_public',
      ],
      workersDev: false,
      previewUrls: false,
      domains: [],
      triggers: role === 'gateway' ? [{ type: 'scheduled', schedule: '* * * * *' }] : [],
      limits: { cpuMs: 30000, subrequests: 500 },
      // URLs can contain authorization codes and download capabilities. Do not
      // persist request/trace payloads; sanitized operational metrics are separate.
      observability: {
        enabled: false,
        redactQueryString: true,
        logs: { enabled: false, invocationLogs: false, persist: false },
        traces: { enabled: false, persist: false },
      },
      env: definition.env,
      exports: definition.exports,
      manifest: {
        type: 'complete',
        mainModule: 'worker.mjs',
        modules: { 'worker.mjs': { type: 'esm' } },
      },
    });
    workers[role] = worker;
    const config = convertToWranglerConfig({
      accountId: m.account,
      worker: {
        ...worker,
        entrypoint: `./${workerOutputPath(role)}/bundle/worker.mjs`,
      },
      containers: containers[role] ? [containers[role]] : [],
    });
    // cf beta.12 emits script_name even for self bindings; Containers require
    // those to be local. Never remove it from an actual cross-service binding.
    for (const binding of config.durable_objects?.bindings ?? [])
      if (binding.script_name === worker.name) delete binding.script_name;
    config.routes = [];
    if (role === 'gateway') config.d1_databases[0].migrations_dir = './migrations';
    wrangler[role] = config;
  }
  return {
    monitoring: monitoringCandidate(m.account, definitions.gateway.env.OPERATIONS.name),
    root: OutputRootConfigSchema.parse({
      accountId: m.account,
      buildContext: { isPreview: false },
    }),
    workers,
    containers,
    wrangler,
    entries: Object.fromEntries(
      Object.entries(definitions).map(([role, value]) => [role, value.entry]),
    ),
    deployOrder: ['tenant', 'evaluation', 'render', 'request', 'admission', 'gateway'],
  };
}
