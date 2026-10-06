import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const output = new URL('../../.cache/hosted-worker/', import.meta.url);
const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/worker.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  metafile: true,
  external: ['cloudflare:workers'],
});
const bytes = result.outputFiles[0].contents;
await mkdir(output, { recursive: true });
await writeFile(new URL('worker.mjs', output), bytes);
await writeFile(
  new URL('build.json', output),
  `${JSON.stringify(
    {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.byteLength,
      inputs: Object.keys(result.metafile.inputs),
    },
    null,
    2,
  )}\n`,
);
console.log(`Built hosted Worker (${bytes.byteLength} bytes); no deployment performed.`);
