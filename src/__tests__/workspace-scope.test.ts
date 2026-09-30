import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('managed CLI keeps workspace state beside its launcher despite a foreign inherited workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-launcher-scope-'));
  const workspace = join(root, 'workspace');
  const foreign = join(root, 'foreign');
  try {
    await mkdir(foreign);
    const setup = spawnSync(
      'node',
      [
        resolve(import.meta.dir, '../../scripts/create-workspace.mjs'),
        workspace,
        '--harness',
        'claude',
      ],
      { encoding: 'utf8' },
    );
    expect(setup.status, setup.stderr).toBe(0);
    const created = spawnSync(
      'node',
      [join(workspace, 'kiln.mjs'), 'project', 'create', '--id', 'local', '--name', 'Local'],
      {
        cwd: foreign,
        encoding: 'utf8',
        env: { ...process.env, KILN_WORKSPACE: foreign, KILN_PROJECT: '' },
      },
    );
    expect(created.status, created.stderr).toBe(0);
    expect(JSON.parse(created.stdout).project.projectId).toBe('local');
    expect(await readdir(foreign)).toEqual([]);
    expect(await readdir(join(workspace, '.kiln', 'projects'))).toContain('local');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
