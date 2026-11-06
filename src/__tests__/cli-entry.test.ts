import { expect, it } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
it('executes a Node CLI symlink once and stays inert when imported', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-entry-'));
  try {
    const runtime = join(directory, 'runtime');
    await mkdir(runtime);
    const bundle = join(runtime, 'cli.mjs');
    const result = await Bun.build({
      entrypoints: [resolve(import.meta.dir, '../cli.ts')],
      target: 'node',
      packages: 'external',
      outdir: runtime,
      naming: 'cli.mjs',
    });
    expect(result.success).toBe(true);
    let alias = join(directory, 'kiln');
    if (process.platform === 'win32') {
      const linkedDirectory = join(directory, 'bin');
      await symlink(runtime, linkedDirectory, 'junction');
      alias = join(linkedDirectory, 'cli.mjs');
    } else await symlink(bundle, alias, 'file');
    const run = (path: string) =>
      Bun.spawnSync(['node', path, '--help'], { stdout: 'pipe', stderr: 'pipe' });
    const direct = run(bundle),
      linked = run(alias);
    expect(direct.exitCode).toBe(0);
    expect(direct.stdout.toString()).toContain('kiln render');
    expect(linked.exitCode).toBe(0);
    expect(linked.stdout.toString()).toBe(direct.stdout.toString());
    await mkdir(join(runtime, 'scripts'));
    await mkdir(join(runtime, 'src'));
    const setup = join(runtime, 'scripts/create-workspace.mjs');
    await copyFile(resolve(import.meta.dir, '../../scripts/create-workspace.mjs'), setup);
    await copyFile(
      resolve(import.meta.dir, '../runtime-support.mjs'),
      join(runtime, 'src/runtime-support.mjs'),
    );
    let setupAlias = join(directory, 'kiln-init');
    if (process.platform === 'win32')
      setupAlias = join(directory, 'bin/scripts/create-workspace.mjs');
    else await symlink(setup, setupAlias, 'file');
    const directSetup = run(setup),
      linkedSetup = run(setupAlias);
    expect(directSetup.exitCode, directSetup.stderr.toString()).toBe(0);
    expect(directSetup.stdout.toString()).toContain('Usage: kiln-init');
    expect(linkedSetup.exitCode).toBe(0);
    expect(linkedSetup.stdout.toString()).toBe(directSetup.stdout.toString());
    const importer = join(directory, 'import.mjs');
    await writeFile(
      importer,
      `await import(${JSON.stringify(pathToFileURL(bundle).href)});await import(${JSON.stringify(pathToFileURL(setup).href)});console.log('IMPORTED_ONLY');`,
    );
    const imported = run(importer);
    expect(imported.exitCode).toBe(0);
    expect(imported.stdout.toString().trim()).toBe('IMPORTED_ONLY');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000); // Compiled-CLI runs: 1.5 s in CI, past its old budget at load 20+ on 5 November 2026.

it('holds the process open until a command settles, instead of exiting 0 in silence', async () => {
  // A CLI entry that awaits `main()` and then sets `process.exitCode` assumes the
  // runtime keeps the process alive while that promise is pending. It does not.
  // When the in-flight work is not registered as an active resource the loop goes
  // idle, `beforeExit` fires, and the process exits 0 having written nothing --
  // the exact shape of the `kiln save` failure that read as a flaky test. Drive
  // the boundary with a promise that never settles and owns no handle: unheld,
  // that process exits immediately; held, it cannot.
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-alive-'));
  try {
    // Import the module under test by URL so the child runs the shipped entry.
    const cli = pathToFileURL(resolve(import.meta.dir, '../cli.ts')).href;
    const script = join(directory, 'held.mjs');
    await writeFile(
      script,
      `const { withProcessAlive } = await import(${JSON.stringify(cli)});\n` +
        `process.on('exit', () => process.stdout.write('EXITED'));\n` +
        `await withProcessAlive(() => new Promise(() => {}));\n`,
    );
    const child = Bun.spawn([process.execPath, script], { stdout: 'pipe', stderr: 'pipe' });
    const exited = await Promise.race([
      child.exited.then(() => 'exited' as const),
      new Promise<'alive'>((done) => setTimeout(() => done('alive'), 1500)),
    ]);
    child.kill();
    expect(exited).toBe('alive');

    const settles = join(directory, 'settles.mjs');
    await writeFile(
      settles,
      `const { withProcessAlive } = await import(${JSON.stringify(cli)});\n` +
        `process.stdout.write(await withProcessAlive(async () => 'DONE'));\n`,
    );
    const clean = Bun.spawnSync([process.execPath, settles], { stdout: 'pipe', stderr: 'pipe' });
    expect(clean.exitCode).toBe(0);
    expect(clean.stdout.toString()).toBe('DONE');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
