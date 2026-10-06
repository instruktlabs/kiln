import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const output = new URL('../../.cache/hosted-worker/', import.meta.url);
await mkdir(output, { recursive: true });
for (const entry of ['worker', 'tenant-worker', 'native-programs', 'native-assets']) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../src/${entry}.ts`, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: entry.startsWith('native-') ? 'node' : 'browser',
    target: 'es2022',
    metafile: true,
    external: ['cloudflare:workers', '@instruktlabs/kiln/*'],
  });
  const bytes = result.outputFiles[0].contents;
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some((name) => /(?:^|\/)test\//.test(name.replaceAll('\\', '/')))) {
    throw new Error('Production bundle includes test helpers');
  }
  if (
    entry !== 'worker' &&
    inputs.some((name) => /oauth|(?:^|\/)auth\.ts$/.test(name.replaceAll('\\', '/')))
  ) {
    throw new Error('Storage bundle includes authorization-server code');
  }
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
