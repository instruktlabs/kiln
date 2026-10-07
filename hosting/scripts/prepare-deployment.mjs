// Offline only. Provisioning, secrets, image upload and deployment are separate
// reviewed operations. This command deliberately exposes no public route.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { build } from 'esbuild';
import { assertProductionBoundary } from './build-boundary.mjs';
import { deploymentConfig } from './deployment-config.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function main() {
  const { values } = parseArgs({
    options: { manifest: { type: 'string' }, output: { type: 'string' } },
  });
  assert(values.manifest && values.output);
  const raw = await readFile(values.manifest);
  assert(raw.length <= 16384);
  const manifest = JSON.parse(raw);
  const configuration = deploymentConfig(manifest);
  const cache = await realpath(resolve(root, '.cache'));
  const output = resolve(values.output),
    parent = await realpath(dirname(output));
  assert(parent === cache || parent.startsWith(cache + sep));
  // Refuse an existing output, including a link or a partly prepared candidate.
  await mkdir(output);
  assert((await realpath(output)).startsWith(cache + sep));
  const files = [];
  const put = async (path, bytes) => {
    const destination = resolve(output, path);
    assert(destination.startsWith(output + sep));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
    files.push({ path, sha256: hash(bytes), bytes: Buffer.byteLength(bytes) });
  };
  const json = (path, value) => put(path, `${JSON.stringify(value, null, 2)}\n`);
  const git = async (...args) =>
    (await promisify(execFile)('git', args, { cwd: root })).stdout.trim();
  const sourceCommit = await git('rev-parse', 'HEAD');
  const sourceDirty = Boolean(await git('status', '--porcelain'));
  const receipt = {
    schemaVersion: 1,
    sourceCommit,
    sourceDirty,
    configSchema: '0.23.0',
    publicHttp: false,
    deployed: false,
    resourcesCreated: false,
    manifestSha256: hash(raw),
    deployOrder: configuration.deployOrder,
    requiredGatewaySecrets: Object.keys(configuration.workers.gateway.env).filter(
      (name) => configuration.workers.gateway.env[name].type === 'secret',
    ),
    images: manifest.images,
    workers: [],
    migrations: [],
    files,
    launchGates: [
      'exact-source CI',
      'resource ownership',
      'image identity',
      'provider secrets',
      'public ingress protection',
      'sanitized operational monitoring',
      'live OAuth and lifecycle qualification',
      'owner deployment approval',
    ],
  };
  const schemaPackage = JSON.parse(
    await readFile(
      new URL('../node_modules/@cloudflare/config/package.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(schemaPackage.version, receipt.configSchema);
  await json('.cloudflare/output/v0/config.json', configuration.root);
  await json('monitoring-candidate.json', configuration.monitoring);
  for (const [role, entry] of Object.entries(configuration.entries)) {
    const result = await build({
      entryPoints: [resolve(root, 'hosting/src', `${entry}.ts`)],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      conditions: ['workerd'],
      target: 'es2022',
      metafile: true,
      external: ['cloudflare:workers'],
    });
    const bytes = result.outputFiles[0].contents;
    const inputs = Object.keys(result.metafile.inputs);
    assertProductionBoundary(entry, inputs);
    const built = Object.values(result.metafile.outputs)[0];
    const worker = configuration.workers[role];
    for (const name of ['default', ...Object.keys(worker.exports)])
      assert(built.exports.includes(name));
    assert(built.imports.every((item) => item.external && item.path === 'cloudflare:workers'));
    const bundle = `.cloudflare/output/v0/workers/${role}/bundle/worker.mjs`;
    await put(bundle, bytes);
    await json(`.cloudflare/output/v0/workers/${role}/worker.config.json`, worker);
    await json(`${role}.wrangler.json`, configuration.wrangler[role]);
    receipt.workers.push({
      role,
      name: worker.name,
      entry,
      bundle,
      sha256: hash(bytes),
      bytes: bytes.length,
      inputs: inputs.map((input) => relative(root, resolve(input)).replaceAll('\\', '/')),
    });
  }
  for (const container of Object.values(configuration.containers))
    await json(
      `.cloudflare/output/v0/containers/${container.name}/container.config.json`,
      container,
    );
  const migrations = resolve(root, 'hosting/migrations');
  for (const name of (await readdir(migrations))
    .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
    .sort()) {
    const bytes = await readFile(resolve(migrations, name));
    await put(`migrations/${name}`, bytes);
    receipt.migrations.push({ name, sha256: hash(bytes) });
  }
  assert.equal(await git('rev-parse', 'HEAD'), sourceCommit);
  await writeFile(
    resolve(output, 'deployment-receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: 'wx' },
  );
  console.log(JSON.stringify(receipt));
}
try {
  await main();
} catch {
  // A malformed input could contain a mistakenly supplied credential. Never
  // echo it, parser excerpts or arbitrary provider/configuration error text.
  console.error(
    'Deployment preparation failed. Check the manifest, pinned dependencies and a fresh output directory under .cache; nothing was deployed.',
  );
  process.exitCode = 1;
}
