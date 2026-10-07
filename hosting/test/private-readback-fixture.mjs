import { createHash } from 'node:crypto';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const id = (value) => hash(value).slice(0, 32);
export function readbackFixture(manifest, config, mode = 'private-lifecycle') {
  const namespaces = Object.values(config.workers).flatMap((w) =>
    Object.entries(w.exports)
      .filter(([, e]) => e.type === 'durable-object')
      .map(([name]) => ({
        id: id(w.name + name),
        script: w.name,
        class: name,
        use_sqlite: true,
      })),
  );
  const ns = (worker, name) => namespaces.find((n) => n.script === worker && n.class === name);
  const bindings = (w) =>
    Object.entries(w.env).map(([name, b]) => {
      switch (b.type) {
        case 'text':
          return { name, type: 'plain_text', text: b.value };
        case 'worker':
          return {
            name,
            type: 'service',
            service: b.worker,
            ...(b.exportName ? { entrypoint: b.exportName } : {}),
          };
        case 'durable-object':
          return {
            name,
            type: 'durable_object_namespace',
            namespace_id: ns(b.worker, b.exportName).id,
            class_name: b.exportName,
          };
        case 'd1':
          return { name, type: 'd1', id: b.id };
        case 'kv':
          return { name, type: 'kv_namespace', namespace_id: b.id };
        case 'r2':
          return { name, type: 'r2_bucket', bucket_name: b.name };
        case 'rate-limit':
          return { name, type: 'ratelimit', namespace_id: b.namespace, simple: b.simple };
        case 'analytics-engine-dataset':
          return { name, type: 'analytics_engine', dataset: b.name };
        default:
          throw new Error('Unexpected fixture binding');
      }
    });
  const workers = Object.fromEntries(
    Object.entries(config.workers).map(([role, w]) => {
      const bytes = Buffer.from(`fixture ${role}`),
        versionId = id(`${role}version`);
      return [
        role,
        {
          worker: {
            id: id(w.name),
            name: w.name,
            subdomain: { enabled: false, previews_enabled: false },
            observability: config.wrangler[role].observability,
            logpush: false,
            tail_consumers: [],
            references: { domains: [], queues: [], dispatch_namespace_outbounds: [] },
          },
          scriptSettings: {
            logpush: false,
            tail_consumers: [],
            observability: structuredClone(config.wrangler[role].observability),
          },
          version: {
            id: versionId,
            main_module: 'worker.mjs',
            modules: [{ name: 'worker.mjs', content_base64: bytes.toString('base64') }],
            bindings: bindings(w),
            exports: w.exports,
            urls: [],
            compatibility_date: w.compatibilityDate,
            compatibility_flags: w.compatibilityFlags,
            limits: config.wrangler[role].limits,
            containers: Object.values(config.containers)
              .filter((c) => Object.values(w.exports).some((e) => e.container === c.name))
              .map((c) => ({
                name: c.name,
                class_name: Object.entries(w.exports).find(([, e]) => e.container === c.name)[0],
                images: Object.fromEntries(
                  Object.entries(c.images).map(([k, v]) => [k, v.reference]),
                ),
              })),
          },
          deployments: {
            deployments: [
              {
                id: id(`${role}deployment`),
                versions: [{ version_id: versionId, percentage: 100 }],
              },
            ],
          },
          routes: [],
          schedules: (config.wrangler[role].triggers?.crons ?? []).map((cron) => ({
            cron,
            created_on: '2026-10-07T00:00:00Z',
            modified_on: '2026-10-07T00:00:00Z',
          })),
        },
      ];
    }),
  );
  const applications = Object.entries(config.containers).map(([role, c]) => ({
    id: id(c.name),
    account_id: manifest.account,
    name: c.name,
    scheduling_policy: 'durable_object',
    durable_objects: {
      namespace_id: ns(config.workers[role].name, Object.keys(config.workers[role].exports)[0]).id,
    },
    configuration: { wrangler_ssh: { enabled: false } },
    observability: { logs: { enabled: false } },
    health: { instances: { active: 0, starting: 0 } },
  }));
  const migrations = Array.from(
    { length: 9 },
    (_, i) => `${String(i + 1).padStart(4, '0')}_fixture.sql`,
  );
  const receipt = {
    mode,
    sourceDirty: false,
    sourceCommit: 'e'.repeat(40),
    deployOrder: config.deployOrder,
    images: mode === 'private-operations' ? {} : manifest.images,
    nativeExecutionPossible: mode !== 'private-operations',
    publicHttp: false,
    requiredGatewaySecrets: [],
    workers: Object.entries(workers).map(([role, w]) => ({
      role,
      name: w.worker.name,
      sha256: hash(Buffer.from(w.version.modules[0].content_base64, 'base64')),
    })),
    migrations: migrations.map((name) => ({ name, sha256: 'f'.repeat(64) })),
  };
  const snapshot = {
    account: manifest.account,
    complete: true,
    workers,
    namespaces,
    applications,
    database: { uuid: manifest.database.id, name: manifest.database.name },
    kv: { id: manifest.oauthKv, title: `${manifest.prefix}-oauth` },
    bucket: { name: manifest.bucket },
    managedDomain: { enabled: false },
    customDomains: { domains: [] },
    migrations,
  };
  return { manifest, receipt, snapshot };
}
