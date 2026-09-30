import { expect, it } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

it('creates an isolated workspace whose Node CLI imports and exports exactly once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-setup-test-'));
  const repo = resolve(import.meta.dir, '../..');
  const node = (args: string[]) => spawnSync('node', args, { cwd: root, encoding: 'utf8' });
  try {
    const setup = node([join(repo, 'scripts/create-workspace.mjs'), root, '--harness', 'claude']);
    expect(setup.status).toBe(0);
    expect(await readdir(root)).not.toContain('src');
    // The store workspace.json and the harness configuration name exists from the start.
    expect(await readdir(join(root, '.kiln', 'programs'))).toEqual([]);
    const source = '\uFEFF// café\r\nconst meta = {};\r\n';
    await writeFile(join(root, 'asset.kiln.js'), source);
    const imported = node(['kiln.mjs', 'source', 'asset.kiln.js']);
    expect(imported.status).toBe(0);
    expect(imported.stdout.trim()).toMatch(/^p_[a-f0-9]{12}$/);
    const ref = imported.stdout.trim();
    const exported = node(['kiln.mjs', 'source', ref, '--out', 'saved.kiln.js']);
    expect(exported.status).toBe(0);
    expect(exported.stderr).toBe('');
    expect(await readFile(join(root, 'saved.kiln.js'), 'utf8')).toBe(source);
    expect(node(['kiln.mjs', 'source', ref, '--out', 'saved.kiln.js']).status).toBe(1);
    const repeat = node([join(repo, 'scripts/create-workspace.mjs'), root]);
    expect(repeat.status).toBe(1);
    expect(await readFile(join(root, 'saved.kiln.js'), 'utf8')).toBe(source);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

it('ships a CLI bundle matching the current source', async () => {
  const repo = resolve(import.meta.dir, '../..');
  const root = await mkdtemp(join(tmpdir(), 'kiln-cli-build-test-'));
  try {
    const target = join(root, 'cli.mjs');
    const built = spawnSync(
      process.execPath,
      ['build', 'src/cli.ts', '--target=node', '--packages=external', `--outfile=${target}`],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(built.status).toBe(0);
    expect(await readFile(join(repo, 'dist/cli.mjs'), 'utf8')).toBe(await readFile(target, 'utf8'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
