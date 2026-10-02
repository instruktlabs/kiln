import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { createKilnSourceDef } from '../tools/programs';
import { createLocalToolContext } from '../local-runtime';
import { MemoryProgramStore } from '../program-store';
import { FileProgramStore } from '../program-store-node';
import { decodePng } from '../views/png';
import { localWorkspaceRoot } from '../workspace-location';
import { TIERED_CAR, TIERED_CAR_CHAINS, TIERED_CAR_TRIANGLES } from './helpers/lod-fixture';
import { HIDEABLE } from './helpers/visibility-fixture';

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
  // The CLI receipt is the compact form of the shared tool result unless --detail asks otherwise.
  const expected = await tool.run({ code: source, capture: { preset: '1x1' } });
  await context.liveReview?.flush?.();
  expect(
    (await readdir(join(directory, '.kiln', 'review'))).filter((name) => name.startsWith('op_')),
  ).toHaveLength(3);
  const media = tool.media!(expected)!;
  const fields = media.json as typeof reviewed;
  expect(reviewed.parts).toEqual(fields.parts);
  expect(reviewed.qaReport).toEqual(fields.qaReport);
  expect(reviewed.qaReport.detail).toBe('compact');
  expect(reviewed.qaReport.ruleSummary).toBeDefined();
  const full = run([
    'render',
    receipt.programRef,
    '--render',
    'cpu',
    '--views',
    'full.png',
    '--capture',
    'capture.json',
    '--json',
    '--detail',
    'full',
  ]);
  expect(full.exitCode).toBe(0);
  const complete = JSON.parse(full.stdout.toString());
  expect(complete.qaReport.detail).toBeUndefined();
  expect(Array.isArray(complete.qaReport.rules)).toBe(true);
  expect(complete.pngBase64).toBeUndefined();
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
}, 60_000); // Compiled-CLI render runs: 3.2 to 4.8 s in the gates of 2 October 2026, 20.2 s in a fresh clone's gate beside two live sessions (the records commit put this budget on the next test by mistake).

test('render JSON reports argument/build/view errors and only files actually written', async () => {
  for (const args of [
    [],
    ['source.js', '--unknown'],
    ['source.js', '--detail', 'verbose'],
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
  expect(run(['source', 'source.js', '--json']).exitCode).toBe(0);
}, 60_000); // Compiled-CLI error runs: 6.1 to 8.2 s in the gates of 2 October 2026, 15.3 s in a fresh clone's gate beside two live sessions.

test('source JSON is the shared kiln_source result, pages like it, and exports with a receipt', async () => {
  const shared = createKilnSourceDef(new FileProgramStore(join(directory, 'programs')));
  const imported = run(['source', 'source.js', '--json']);
  expect(imported.stderr.toString()).toBe('');
  expect(imported.exitCode).toBe(0);
  const saved = JSON.parse(imported.stdout.toString());
  expect(saved.programRef).toMatch(/^p_[a-f0-9]{12}$/);
  expect(saved.code).toBe(source);
  expect(saved).toEqual(await shared.run({ programRef: saved.programRef }));
  const read = run(['source', saved.programRef, '--json']);
  expect(read.exitCode).toBe(0);
  expect(JSON.parse(read.stdout.toString())).toEqual(saved);
  const query = "createPart('Box'";
  const found = run(['source', saved.programRef, '--json', '--query', query, '--limit', '40']);
  expect(found.exitCode).toBe(0);
  expect(JSON.parse(found.stdout.toString())).toEqual(
    await shared.run({ programRef: saved.programRef, query, limit: 40 }),
  );
  const page = run(['source', saved.programRef, '--offset', '10', '--limit', '20', '--json']);
  expect(page.exitCode).toBe(0);
  const second = JSON.parse(page.stdout.toString());
  expect(second).toEqual(await shared.run({ programRef: saved.programRef, offset: 10, limit: 20 }));
  expect(second.nextOffset).toBe(30);
  const exported = run(['source', saved.programRef, '--json', '--out', 'exported.js']);
  expect(exported.exitCode).toBe(0);
  const bytes = await readFile(join(directory, 'exported.js'));
  expect(bytes.toString('utf8')).toBe(source);
  expect(JSON.parse(exported.stdout.toString())).toEqual({
    ok: true,
    programRef: saved.programRef,
    files: [{ kind: 'source', path: join(directory, 'exported.js'), bytes: bytes.length }],
  });
  for (const args of [
    [],
    ['p_000000000000'],
    [saved.programRef, '--out', 'exported.js'],
    [saved.programRef, '--out', 'other.js', '--offset', '1'],
    [saved.programRef, '--limit', '0'],
    ['source.js', '--out', 'other.js'],
    [saved.programRef, '--unknown'],
    [saved.programRef, '--offset', 'next'],
  ]) {
    const failed = run(['source', ...args, '--json']);
    expect(failed.exitCode).not.toBe(0);
    const output = JSON.parse(failed.stdout.toString());
    expect(output.ok).toBe(false);
    expect(output.error).toBeString();
    expect(output.files).toEqual([]);
  }
  expect(await readdir(directory)).not.toContain('other.js');
  const missingValue = run(['source', saved.programRef, '--json', '--query']);
  expect(missingValue.exitCode).toBe(2);
  expect(JSON.parse(missingValue.stdout.toString())).toMatchObject({ ok: false, files: [] });
  // Paging belongs to source --json; other commands and plain source refuse it.
  expect(run(['source', saved.programRef, '--query', 'Box']).exitCode).not.toBe(0);
  expect(run(['render', 'source.js', '--query', 'Box', '--json']).exitCode).not.toBe(0);
  // Fourteen compiled-CLI runs: 11.3 to 14.0 s in the gates of 2 October 2026 and 20.0 s on the
  // same tree in a fresh clone's gate that ran beside two live sessions (the loaded Windows host).
}, 60_000);

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

test('render reports each LOD chain in the receipt and in plain output', async () => {
  await writeFile(join(directory, 'tiered.js'), TIERED_CAR);
  const json = run(['render', 'tiered.js', '--render', 'cpu', '--out', 'tiered.glb', '--json']);
  expect(json.exitCode).toBe(0);
  const receipt = JSON.parse(json.stdout.toString());
  expect(receipt.tris).toBe(TIERED_CAR_TRIANGLES.headline);
  expect(receipt.bounds.max[1]).toBeCloseTo(1.5, 6);
  expect(receipt.levelsOfDetail).toEqual(TIERED_CAR_CHAINS);

  const plain = run(['render', 'tiered.js', '--render', 'cpu', '--out', 'tiered.glb']);
  expect(plain.exitCode).toBe(0);
  const text = plain.stdout.toString();
  expect(text).toContain(
    `  LOD ${TIERED_CAR_CHAINS[0]!.path}  24 / 12 / 12 tris  screen coverage 0.004 / 0.0002 / 0.000006`,
  );
  expect(text.match(/^ {2}LOD /gm)).toHaveLength(TIERED_CAR_CHAINS.length);
  expect(run(['render', 'source.js', '--out', 'plain.glb']).stdout.toString()).not.toContain(
    '  LOD ',
  );
});

test('render lists hidden nodes apart from the drawn headline, in the receipt and plain output', async () => {
  await writeFile(join(directory, 'hideable.js'), HIDEABLE);
  const json = run(['render', 'hideable.js', '--render', 'cpu', '--out', 'hideable.glb', '--json']);
  expect(json.exitCode).toBe(0);
  const receipt = JSON.parse(json.stdout.toString());
  expect(receipt.tris).toBe(12);
  expect(receipt.hiddenNodes).toEqual([
    { path: '/Hideable[0]/Root[0]/Mesh_Cover[0]', name: 'Mesh_Cover', triangles: 12 },
    { path: '/Hideable[0]/Root[0]/Joint_Panel[0]', name: 'Joint_Panel', triangles: 12 },
  ]);
  const text = run([
    'render',
    'hideable.js',
    '--render',
    'cpu',
    '--out',
    'hideable.glb',
  ]).stdout.toString();
  expect(text).toContain(
    '  hidden /Hideable[0]/Root[0]/Mesh_Cover[0]  12 tris (not drawn, not in the headline)',
  );
  expect(text.match(/^ {2}hidden /gm)).toHaveLength(2);
  expect(run(['render', 'source.js', '--out', 'plain.glb']).stdout.toString()).not.toContain(
    '  hidden ',
  );
});
