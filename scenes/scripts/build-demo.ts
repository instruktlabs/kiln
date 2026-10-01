import { build } from 'vite';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { auditLicenses, renderNotices } from './check-licenses';
import { sceneStandaloneConfig } from '../packages/scene-kit/src/build';

const root = resolve(import.meta.dir, '..');
const modes = process.argv.includes('--all') ? ['public', 'test', 'dev'] : [process.argv[2] ?? 'public'];
for (const mode of modes) {
  if (!['public', 'test', 'dev'].includes(mode)) throw new Error('Unknown scene build mode');
  const output = resolve(root, 'packages/scene-kit/dist', mode === 'public' ? 'standalone' : mode);
  await build({ ...sceneStandaloneConfig({ root: resolve(root, 'packages/scene-kit/demo'), outDir: output, mode: mode as 'public' | 'test' | 'dev' }), configFile: false });
  await cp(resolve(root, 'packages/scene-kit/demo/staged/assets'), resolve(output, 'assets'), { recursive: true });
  const server = await readFile(resolve(root, 'scripts/static-server.mjs'), 'utf8');
  await writeFile(resolve(output, 'serve.mjs'), server);
  const graph = JSON.parse(await readFile(resolve(output, 'bundle-modules.json'), 'utf8'));
  const licenses = auditLicenses(root, graph.modules);
  if (licenses.problems.length) throw new Error(licenses.problems.join('\n'));
  await writeFile(resolve(output, 'THIRD-PARTY-NOTICES.txt'), renderNotices(licenses.records));
  const { readdir } = await import('node:fs/promises');
  const sizes = [];
  for (const name of await readdir(resolve(output, 'assets'))) {
    if (!/\.(?:js|css)$/.test(name)) continue;
    const bytes = await readFile(resolve(output, 'assets', name));
    sizes.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  await mkdir(resolve(root, 'evidence/m1'), { recursive: true });
  const measurement=JSON.stringify({ mode, chunks: sizes, totalBytes: sizes.reduce((sum, x) => sum + x.bytes, 0), totalGzipBytes: sizes.reduce((sum, x) => sum + x.gzipBytes, 0) }, null, 2)+'\n';
  await writeFile(resolve(root, 'evidence/m1', `bundle-${mode}.json`),measurement);
  await mkdir(resolve(root,'evidence/m1/bundles'),{recursive:true});
  await writeFile(resolve(root,'evidence/m1/bundles',`${mode}-${sizes.map(chunk=>chunk.name).join('-')}.json`),measurement);
}
