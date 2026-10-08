import { expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Every CLI path that takes a destination must create the directories leading to
 * it. Failing on a missing parent is expensive out of proportion to the mistake:
 * the build has already run and already printed a `programRef`, so the operator
 * sees a successful render followed by a bare ENOENT and no artifact, with
 * nothing naming the parent directory as the thing to fix. The README's example
 * writes into the working directory, which is why this never showed up there.
 */
it('creates the directories leading to every CLI destination', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-out-dirs-'));
  const cli = resolve(import.meta.dir, '../cli.ts');
  const example = resolve(import.meta.dir, 'fixtures/crate.kiln.js');
  const run = (args: string[]) =>
    Bun.spawnSync([process.execPath, cli, ...args], {
      cwd: directory,
      env: {
        ...process.env,
        KILN_RENDER: 'cpu',
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_PROGRAM_STORE: join(directory, '.kiln', 'programs'),
        KILN_COLLECTIONS: JSON.stringify({ project: join(directory, 'collection') }),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  const wrote = async (path: string) => (await stat(path)).size > 0;
  try {
    const glb = join(directory, 'render', 'deep', 'crate.glb');
    const views = join(directory, 'views', 'deep', 'sheet.png');
    // Pin this metallic fixture to CPU independently of the environment so it
    // never discovers or starts the machine's shared GPU service.
    const rendered = run(['render', example, '--render', 'cpu', '--out', glb, '--views', views]);
    expect(rendered.stderr.toString()).toBe('');
    expect(rendered.exitCode).toBe(0);
    expect(await wrote(glb)).toBe(true);
    expect(await wrote(views)).toBe(true);
    const expectedGlb = await readFile(glb);
    const expectedViews = await readFile(views);
    await writeFile(glb, 'previous GLB');
    await writeFile(views, 'previous PNG');
    const replaced = run(['render', example, '--render', 'cpu', '--out', glb, '--views', views]);
    expect(replaced.exitCode).toBe(0);
    expect(await readFile(glb)).toEqual(expectedGlb);
    expect(await readFile(views)).toEqual(expectedViews);

    const retained = run(['source', example]);
    expect(retained.exitCode).toBe(0);
    const programRef = retained.stdout.toString().trim();
    expect(programRef).toMatch(/^p_/);
    const copy = join(directory, 'source', 'deep', 'crate.kiln.js');
    expect(run(['source', programRef, '--out', copy]).exitCode).toBe(0);
    expect(await wrote(copy)).toBe(true);
    await writeFile(copy, 'keep edited source');
    const refused = run(['source', programRef, '--out', copy]);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain(`${copy} already exists and is never replaced`);
    expect(await readFile(copy, 'utf8')).toBe('keep edited source');

    const saved = run(['save', programRef, '--name', 'Crate', '--render', 'cpu']);
    expect(saved.exitCode).toBe(0);
    const asset = JSON.parse(saved.stdout.toString()).asset;
    const bundle = join(directory, 'export', 'deep', 'crate.zip');
    expect(run(['export', asset.assetId, asset.revisionId, '--out', bundle]).exitCode).toBe(0);
    expect(await wrote(bundle)).toBe(true);
    await writeFile(bundle, 'keep existing export');
    expect(run(['export', asset.assetId, asset.revisionId, '--out', bundle]).exitCode).not.toBe(0);
    expect(await readFile(bundle, 'utf8')).toBe('keep existing export');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
