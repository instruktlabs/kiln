import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import {
  OutputRootConfigSchema,
  OutputWorkerSchema,
  OutputContainerSchema,
} from '@cloudflare/config';

// Explicit local preparation only. cf deploy --prebuilt consumes this reviewed
// output after approval; this script never uploads, provisions or invokes a VM.
const { values } = parseArgs({
  options: {
    'cf-package': { type: 'string' },
    account: { type: 'string' },
    image: { type: 'string' },
    output: { type: 'string' },
  },
});
assert.match(values.account ?? '', /^[a-f0-9]{32}$/);
assert.match(
  values.image ?? '',
  /^registry\.cloudflare\.com\/[a-f0-9]{32}\/[a-z0-9-]+@sha256:[a-f0-9]{64}$/,
);
assert.ok(values.image.startsWith(`registry.cloudflare.com/${values.account}/`));
assert.ok(values['cf-package'] && values.output);
const cliPackage = resolve(values['cf-package']);
const cli = JSON.parse(await readFile(cliPackage, 'utf8'));
assert.equal(cli.name, 'cf');
assert.equal(cli.version, '1.0.0-beta.12');
const output = resolve(values.output);
const workerName = 'kiln-private-evaluation-probe';
const containerName = 'kiln-private-evaluation-probe-jobs';
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../probe/worker.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers'],
  metafile: true,
});
const bytes = bundle.outputFiles[0].contents;
const rootConfig = OutputRootConfigSchema.parse({
  accountId: values.account,
  buildContext: { isPreview: false },
});
const workerConfig = OutputWorkerSchema.parse({
  name: workerName,
  compatibilityDate: '2026-10-06',
  compatibilityFlags: ['enable_ctx_exports'],
  workersDev: false,
  previewUrls: false,
  domains: [],
  limits: { cpuMs: 30000, subrequests: 50 },
  triggers: [{ type: 'scheduled', schedule: '*/5 * * * *' }],
  observability: {
    enabled: true,
    logs: { enabled: true, headSamplingRate: 1, invocationLogs: true, persist: true },
  },
  exports: {
    KilnProbeRun: { type: 'durable-object', storage: 'sqlite' },
    KilnProbeJob: { type: 'durable-object', storage: 'sqlite', container: containerName },
  },
  manifest: {
    type: 'complete',
    mainModule: 'worker.mjs',
    modules: { 'worker.mjs': { type: 'esm' } },
  },
});
const containerConfig = OutputContainerSchema.parse({
  name: containerName,
  schedulingPolicy: 'durable-object',
  ssh: { enabled: false },
  images: { kiln: { reference: values.image } },
  observability: { enabled: false, logs: { enabled: false } },
});
const files = {
  'config.json': rootConfig,
  'workers/default/worker.config.json': workerConfig,
  [`containers/${containerName}/container.config.json`]: containerConfig,
};
for (const [name, content] of Object.entries(files)) {
  const path = resolve(output, '.cloudflare/output/v0', name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`);
}
const modulePath = resolve(output, '.cloudflare/output/v0/workers/default/bundle/worker.mjs');
await mkdir(dirname(modulePath), { recursive: true });
await writeFile(modulePath, bytes);
const receipt = {
  worker: workerName,
  image: values.image,
  workerSha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  cli: cli.version,
  inputs: Object.keys(bundle.metafile.inputs),
  maxJobs: 4,
  priorTrialJobs: 1,
  totalApprovedJobs: 5,
  maxConcurrent: 1,
  deadlineMs: 60000,
  publicHttp: false,
  deployed: false,
};
await writeFile(resolve(output, 'build-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
