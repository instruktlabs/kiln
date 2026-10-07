import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { assertProductionBoundary } from './build-boundary.mjs';

const output = new URL('../../.cache/hosted-worker/', import.meta.url);
await mkdir(output, { recursive: true });
const nativeOnly = process.argv.includes('--native-only');
if (!nativeOnly) {
  const { checkEdgeManifest } = await import('./edge-manifest.mjs');
  await checkEdgeManifest();
}
for (const entry of [
  'worker',
  'tenant-worker',
  'evaluation-worker',
  'render-worker',
  'request-worker',
  'admission-worker',
  'native-programs',
  'native-assets',
  'native-materials',
  'native-mcp',
  'native-host',
  'native-evaluator',
  'native-render',
]) {
  // The installed-image build must not depend on a checkout SDK or edge snapshot.
  if (nativeOnly && !entry.startsWith('native-')) continue;
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../src/${entry}.ts`, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: entry.startsWith('native-') ? 'node' : 'browser',
    conditions: entry.startsWith('native-') ? undefined : ['workerd'],
    target: 'es2022',
    metafile: true,
    external: entry.startsWith('native-')
      ? [
          'cloudflare:workers',
          '@instruktlabs/kiln',
          '@instruktlabs/kiln/*',
          '@modelcontextprotocol/server',
          '@modelcontextprotocol/node',
        ]
      : ['cloudflare:workers'],
  });
  const bytes = result.outputFiles[0].contents;
  const inputs = Object.keys(result.metafile.inputs);
  assertProductionBoundary(entry, inputs);
  await writeFile(new URL(`${entry}.mjs`, output), bytes);
  await writeFile(
    new URL(entry === 'worker' ? 'build.json' : `${entry}-build.json`, output),
    `${JSON.stringify(
      {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength,
        inputs,
        imports: result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].imports,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Built ${entry} (${bytes.byteLength} bytes); no deployment performed.`);
}
