import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { createLocalToolContext } from '../local-runtime';
import { MemoryProgramStore } from '../program-store';
import { decodePng } from '../views/png';
import { localWorkspaceRoot } from '../workspace-location';

const source = `const meta={name:'ReceiptBox'};function build(){const r=createRoot('Root');
createPart('Box',boxGeo(1,2,3),gameMaterial('#809080'),{parent:r,position:[0,1,0]});return r;}`;
let directory: string;
beforeAll(async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(base, 'cli-render-json-'));
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, '../cli.ts')],
    target: 'node',
    packages: 'external',
    outdir: directory,
    naming: 'cli.mjs',
  });
  expect(result.success).toBe(true);
  await writeFile(join(directory, 'source.js'), source);
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
function run(args: string[]) {
  const env = {
    ...process.env,
    KILN_EVALUATOR_MODE: 'in-process',
    KILN_BUILD_CACHE: 'off',
    KILN_WORKSPACE: directory,
    KILN_PROGRAM_STORE: join(directory, 'programs'),
    KILN_RENDER: 'cpu',
  };
  expect(localWorkspaceRoot(env)).toBe(directory);
  return Bun.spawnSync(['node', join(directory, 'cli.mjs'), ...args], {
    cwd: directory,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 20000,
  });
}
test('render JSON describes exact files and preserves shared image/requirements evidence', async () => {
  const glb = run(['render', 'source.js', '--render', 'cpu', '--out', 'asset.glb', '--json']);
  expect(glb.exitCode).toBe(0);
  expect(glb.stderr.toString()).toBe('');
  const receipt = JSON.parse(glb.stdout.toString());
  expect(receipt.ok).toBe(true);
  expect(receipt.programRef).toMatch(/^p_[a-f0-9]{12}$/);
  expect(receipt.tris).toBe(12);
  expect(receipt.bounds.size).toEqual([1, 2, 3]);
  expect(receipt.viewFidelity).toBeUndefined();
  const bytes = await readFile(join(directory, 'asset.glb'));
  expect(receipt.artifactGlbSha256).toBe(
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  );
  expect(receipt.files).toEqual([
    { kind: 'glb', path: join(directory, 'asset.glb'), bytes: bytes.length },
  ]);
  expect(receipt.glb).toBeUndefined();
  await writeFile(join(directory, 'capture.json'), '{"preset":"1x1"}');
  const image = run([
    'render',
    receipt.programRef,
    '--render',
    'cpu',
    '--views',
    'sheet.png',
    '--capture',
    'capture.json',
    '--json',
  ]);
  expect(image.exitCode).toBe(0);
  const reviewed = JSON.parse(image.stdout.toString());
  expect(reviewed.files).toHaveLength(1);
  expect(reviewed.files[0]).toMatchObject({ kind: 'image', path: join(directory, 'sheet.png') });
  expect(reviewed.programRef).toBe(receipt.programRef);
  expect(reviewed.requirements).toEqual(receipt.requirements);
  expect(reviewed.artifactGlbSha256).toBe(receipt.artifactGlbSha256);
  expect(reviewed.viewFidelity.materialFaithful).toBe(false);
  expect(reviewed.pngBase64).toBeUndefined();
  expect(reviewed.framesBase64).toBeUndefined();
  const context = createLocalToolContext(
    { programStore: new MemoryProgramStore() },
    { KILN_EVALUATOR_MODE: 'in-process', KILN_WORKSPACE: directory },
  );
  const tool = createKilnProgramToolRegistry(context).find((t) => t.name === 'kiln_render')!;
  const expected = await tool.run({ code: source, capture: { preset: '1x1' } });
  await context.liveReview?.flush?.();
  expect(
    (await readdir(join(directory, '.kiln', 'review'))).filter((name) => name.startsWith('op_')),
  ).toHaveLength(3);
  const media = tool.media!(expected)!;
  const fields = media.json as typeof reviewed;
  expect(reviewed.parts).toEqual(fields.parts);
  expect(reviewed.qaReport).toEqual(fields.qaReport);
  // Node and Bun exporters have different byte identities; each fidelity receipt
  // must identify its own artifact, while the delivered view contract agrees.
  expect(reviewed.viewFidelity.inputGlbSha256).toBe(receipt.artifactGlbSha256);
  expect(reviewed.viewFidelity).toEqual({
    ...fields.viewFidelity,
    inputGlbSha256: receipt.artifactGlbSha256,
  });
  expect(decodePng(await readFile(join(directory, 'sheet.png'))).rgb).toEqual(
    decodePng(Buffer.from(media.png)).rgb,
  );
});

test('render JSON reports argument/build/view errors and only files actually written', async () => {
  for (const args of [
    [],
    ['source.js', '--unknown'],
    ['source.js', '--capture', 'capture.json'],
    ['missing.js'],
  ]) {
    const result = run(['render', ...args, '--json']);
    expect(result.exitCode).not.toBe(0);
    const failed = JSON.parse(result.stdout.toString());
    expect(failed.ok).toBe(false);
    expect(failed.error).toBeString();
    expect(failed.files).toEqual([]);
  }
  await writeFile(
    join(directory, 'bad.js'),
    "const meta={name:'Bad'};function build(){throw new Error('deliberate failure');}",
  );
  const bad = run(['render', 'bad.js', '--json']);
  const failed = JSON.parse(bad.stdout.toString());
  expect(bad.exitCode).toBe(1);
  expect(failed.programRef).toMatch(/^p_[a-f0-9]{12}$/);
  expect(failed.error).toContain('deliberate failure');
  expect(failed.files).toEqual([]);
  await writeFile(join(directory, 'protected.png'), 'existing image');
  const views = run([
    'render',
    'source.js',
    '--render',
    'gpu',
    '--render-port',
    'http://127.0.0.1:1',
    '--out',
    'partial.glb',
    '--views',
    'protected.png',
    '--json',
  ]);
  const partial = JSON.parse(views.stdout.toString());
  expect(views.exitCode).toBe(1);
  expect(partial.ok).toBe(false);
  expect(partial.error).toContain('GPU render failed');
  expect(partial.files).toHaveLength(1);
  expect(partial.files[0].kind).toBe('glb');
  expect(partial.files[0].bytes).toBe((await readFile(join(directory, 'partial.glb'))).length);
  expect(await readFile(join(directory, 'protected.png'), 'utf8')).toBe('existing image');
  expect(run(['source', 'source.js', '--json']).exitCode).not.toBe(0);
});

test('authored console messages stay off CLI JSON stdout in trusted in-process mode', async () => {
  await writeFile(
    join(directory, 'logging.js'),
    source.replace(
      "const r=createRoot('Root');",
      "console.log('asset diagnostic'); console.info('asset info'); const r=createRoot('Root');",
    ),
  );
  const result = run(['render', 'logging.js', '--json', '--render', 'cpu', '--out', 'logging.glb']);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString()).ok).toBe(true);
  expect(result.stderr.toString()).toContain('asset diagnostic');
  expect(result.stderr.toString()).toContain('asset info');
});
