// Local-only build. Upload, R2 provisioning and cf deploy require a reviewed allowance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import {
  OutputRootConfigSchema,
  OutputWorkerSchema,
  OutputContainerSchema,
} from '@cloudflare/config';

const { values } = parseArgs({
  options: {
    account: { type: 'string' },
    output: { type: 'string' },
    'cf-package': { type: 'string' },
  },
});
assert.match(values.account ?? '', /^[a-f0-9]{32}$/);
assert(values.output && values['cf-package']);
const cli = JSON.parse(await readFile(values['cf-package'], 'utf8'));
assert.equal(cli.name, 'cf');
assert.equal(cli.version, '1.0.0-beta.12');
const root = fileURLToPath(new URL('../../', import.meta.url)),
  output = resolve(values.output);
assert(output.startsWith(resolve(root, '.cache') + sep));
const name = 'kiln-private-integrated-v1',
  bucket = 'kiln-private-integrated-v1-evidence';
const coordinator = `registry.cloudflare.com/${values.account}/kiln-coordinator@sha256:029c4fba6f0521a5a18c9dde364d07b5ffc076fe4d988358868950de40134b66`;
const software = `registry.cloudflare.com/${values.account}/kiln-software@sha256:64022900f0c298668076db054c44e019dad6a3813751a92dec7a06ceb734fe24`;
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../probe/integrated-worker.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers'],
  metafile: true,
});
const inputs = Object.keys(compiled.metafile.inputs);
assert(
  !inputs.some((path) =>
    /oauth|\/src\/(?:auth|github|google|browser-|account-)/.test(path.replaceAll('\\', '/')),
  ),
);
const doBinding = (exportName) => ({ type: 'durable-object', worker: name, exportName });
const text = (value) => ({ type: 'text', value });
const applications = [
  ['coordinator', 'IntegratedRequestJob', 'coordinator', coordinator],
  ['evaluation', 'IntegratedEvaluationJob', 'kiln', software],
  ['render', 'IntegratedRenderJob', 'renderer', software],
];
const exports = {
  KilnIntegratedControl: { type: 'worker' },
  KilnNativeStorage: { type: 'worker' },
  KilnNativeEvaluation: { type: 'worker' },
  KilnNativeRender: { type: 'worker' },
  KilnIntegratedRun: { type: 'durable-object', storage: 'sqlite' },
  KilnIntegratedBudget: { type: 'durable-object', storage: 'sqlite' },
  KilnAdmission: { type: 'durable-object', storage: 'sqlite' },
  KilnTenant: { type: 'durable-object', storage: 'sqlite' },
};
for (const [kind, exportName] of applications)
  exports[exportName] = { type: 'durable-object', storage: 'sqlite', container: `${name}-${kind}` };
const worker = OutputWorkerSchema.parse({
  name,
  compatibilityDate: '2026-10-06',
  compatibilityFlags: ['enable_ctx_exports', 'enable_request_signal'],
  workersDev: false,
  previewUrls: false,
  domains: [],
  triggers: [],
  limits: { cpuMs: 30000, subrequests: 500 },
  observability: {
    enabled: true,
    logs: { enabled: true, headSamplingRate: 1, invocationLogs: true, persist: true },
  },
  env: {
    BUDGET: doBinding('KilnIntegratedBudget'),
    RUN: doBinding('KilnIntegratedRun'),
    ADMISSION: doBinding('KilnAdmission'),
    TENANTS: doBinding('KilnTenant'),
    REQUESTS: doBinding('IntegratedRequestJob'),
    EVALUATIONS: doBinding('IntegratedEvaluationJob'),
    RENDERS: doBinding('IntegratedRenderJob'),
    ARTIFACTS: { type: 'r2', name: bucket },
    PUBLIC_ORIGIN: text('https://kiln.instruktlabs.com'),
    STORAGE_MAX_BYTES: text('67108864'),
    STORAGE_MAX_OBJECTS: text('256'),
    STORAGE_MAX_GROUPS: text('64'),
    COMPUTE_MAX_CONCURRENT: text('1'),
    COMPUTE_TENANT_PER_MINUTE: text('9'),
    COMPUTE_TENANT_PER_DAY: text('9'),
    COMPUTE_GLOBAL_PER_DAY: text('9'),
    COMPUTE_GLOBAL_PER_MONTH: text('9'),
    COMPUTE_DEADLINE_MS: text('120000'),
  },
  exports,
  manifest: {
    type: 'complete',
    mainModule: 'worker.mjs',
    modules: { 'worker.mjs': { type: 'esm' } },
  },
});
const files = {
  'config.json': OutputRootConfigSchema.parse({
    accountId: values.account,
    buildContext: { isPreview: false },
  }),
  'workers/default/worker.config.json': worker,
};
for (const [kind, , key, image] of applications)
  files[`containers/${name}-${kind}/container.config.json`] = OutputContainerSchema.parse({
    name: `${name}-${kind}`,
    schedulingPolicy: 'durable-object',
    ssh: { enabled: false },
    images: { [key]: { reference: image } },
    observability: { enabled: false, logs: { enabled: false } },
  });
for (const [name, value] of Object.entries(files)) {
  const path = resolve(output, '.cloudflare/output/v0', name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
const bytes = compiled.outputFiles[0].contents,
  path = resolve(output, '.cloudflare/output/v0/workers/default/bundle/worker.mjs');
await mkdir(dirname(path), { recursive: true });
await writeFile(path, bytes);
const receipt = {
  worker: name,
  bucket,
  coordinator,
  software,
  workerSha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  cli: cli.version,
  inputs,
  maxMcpRequests: 9,
  quotaRejectionRequests: 1,
  maxVmStarts: { coordinator: 9, evaluation: 4, render: 4, total: 17 },
  deadlineMs: 120000,
  maxActiveParents: 1,
  maxActiveChildrenPerParent: 1,
  publicHttp: false,
  deployed: false,
};
await writeFile(resolve(output, 'build-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
