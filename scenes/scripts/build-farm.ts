import { build } from 'vite';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { sceneStandaloneConfig } from '../packages/scene-kit/src/build';
import { verifyStaged } from '../packages/scene-kit/src/staging';
import { auditLicenses, renderNotices } from './check-licenses';

const args = process.argv.slice(2), root = resolve(import.meta.dir, '..');
const option = (name: string, fallback: string) => { const at = args.indexOf(name); if (at < 0) return fallback; if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(`${name} needs a value`); return args[at + 1]; };
const release = option('--release', 'r34');
if (!['r33', 'r34', 'r35-local-review', 'r36-local-review'].includes(release)) throw new Error('Farm release must be r33, r34, r35-local-review or r36-local-review');
const assets = resolve(root, option('--assets', `packages/farm/staged/${release}`));
const verified = verifyStaged(assets); if (!verified.ok) throw new Error(verified.problems.join('\n'));
// r34 staging (SPEC 19.8) builds beside r33 with --out-root, so neither release overwrites the other.
// M3: --label names a new output set (packages/farm/dist/<label>) whose sizes go to evidence/build/<label>/ instead of evidence/m2/.
const label = option('--label', '');
if (label && !/^[a-z0-9-]+$/.test(label)) throw new Error('A build label uses lowercase letters, numbers and hyphens');
const outRoot = resolve(root, option('--out-root', label ? `packages/farm/dist/${label}` : 'packages/farm/dist'));
const modes = args.includes('--all') ? ['public', 'test', 'dev'] : [option('--mode', 'public')];
for (const mode of modes) {
  if (!['public', 'test', 'dev'].includes(mode)) throw new Error('Unknown Farm build mode');
  const output = resolve(outRoot, mode === 'public' ? 'standalone' : mode);
  await build({ ...sceneStandaloneConfig({ root: resolve(root, 'packages/farm/standalone'), outDir: output, mode: mode as 'public' | 'test' | 'dev' }), configFile: false });
  await cp(assets, resolve(output, 'assets'), { recursive: true });
  await cp(resolve(root, 'scripts/static-server.mjs'), resolve(output, 'serve.mjs'));
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8'));
  const licenses = auditLicenses(root, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  const chunks = [];
  for (const name of await readdir(resolve(output, 'assets'))) {
    if (!/\.(?:js|css)$/.test(name)) continue;
    const bytes = await readFile(resolve(output, 'assets', name));
    chunks.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  const evidence = resolve(root, label ? `evidence/build/${label}/bundles` : 'evidence/m2/bundles'); await mkdir(evidence, { recursive: true });
  const measurement = { ...(label ? { label } : {}), release, mode, output: relative(root, output).split(sep).join('/'), chunks, totalBytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0), totalGzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0) };
  const json = JSON.stringify(measurement, null, 2) + '\n';
  await writeFile(resolve(evidence, `${release}-${mode}-${chunks.map(chunk => chunk.name).join('-')}.json`), json);
  await writeFile(resolve(root, label ? `evidence/build/${label}/bundle-${release}-${mode}.json` : `evidence/m2/bundle-${release}-${mode}.json`), json);
  console.log(JSON.stringify(measurement));
}
