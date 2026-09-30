import { expect, spyOn, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { discoveryMain } from '../discovery-cli';

const entry = resolve(import.meta.dir, '../cli.ts');
function invoke(args: string[], env: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'kiln-discovery-cli-'));
  try {
    const result = spawnSync(process.execPath, [entry, 'discover', ...args], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, KILN_RENDER: 'cpu', ...env },
      timeout: 20_000,
    });
    expect(readdirSync(cwd)).toEqual([]);
    return result;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// Keep real-process entry/side-effect checks above; exercise the exported command
// boundary directly for selector cases so coverage includes its argument handling.
async function command(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const log = spyOn(console, 'log').mockImplementation((value) => stdout.push(String(value)));
  const error = spyOn(console, 'error').mockImplementation((value) => stderr.push(String(value)));
  try {
    return {
      status: await discoveryMain(args),
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
    };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

test('CLI discovery returns ranked JSON and performs no workspace writes', () => {
  const result = invoke(['--query', 'put supports around a circle', '--json']);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const json = JSON.parse(result.stdout);
  expect(json.version).toBe('kiln.discovery.v1');
  expect(json.entries.slice(0, 5).map((entry: { name: string }) => entry.name)).toContain(
    'arrayRadial',
  );
});

test('CLI capability inspection reports the selected renderer without creating a workspace', () => {
  const result = invoke(['--capabilities', '--json']);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout).capabilities.renderer).toMatchObject({
    mode: 'cpu',
    target: 'cpu',
    status: 'disabled',
    configured: false,
    required: false,
  });
});

test('CLI capabilities report the collections and program store the MCP host injects', () => {
  const roots = mkdtempSync(join(tmpdir(), 'kiln-discovery-roots-'));
  try {
    const result = invoke(['--capabilities', '--json'], {
      KILN_COLLECTIONS: JSON.stringify({
        project: join(roots, 'project'),
        shared: join(roots, 'shared'),
      }),
      KILN_PROGRAM_STORE: join(roots, 'programs'),
    });
    expect(result.status).toBe(0);
    const { assets, source } = JSON.parse(result.stdout).capabilities;
    expect(assets.available).toBe(true);
    expect(assets.collections.map((entry: { id: string }) => entry.id)).toEqual([
      'project',
      'shared',
    ]);
    expect(source.storage).toMatchObject({ entries: 0, bytes: 0 });
    // Reading capabilities creates no collection or store directory.
    expect(readdirSync(roots)).toEqual([]);
  } finally {
    rmSync(roots, { recursive: true, force: true });
  }
});

test('CLI exact details preserve ordering and unknown IDs fail atomically', async () => {
  const detail = await command(['--id', 'copyGeometry', '--id', 'operation:boxGeo', '--json']);
  expect(detail.status).toBe(0);
  expect(JSON.parse(detail.stdout).entries.map((entry: { name: string }) => entry.name)).toEqual([
    'copyGeometry',
    'boxGeo',
  ]);
  const unknown = await command(['--id', 'copyGeomtry', '--json']);
  expect(unknown.status).toBe(1);
  expect(JSON.parse(unknown.stdout).error.code).toBe('UNKNOWN_ID');
});

test('CLI rejects retired or contradictory selectors and exposes bounded human overview', async () => {
  for (const args of [['--name', 'boxGeo'], ['--category=geometry'], ['--names=boxGeo']]) {
    const result = await command(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--id');
    expect(result.stderr).toContain('--family');
  }
  for (const args of [
    ['--name', 'boxGeo'],
    ['--category', 'geometry'],
    ['--id', 'boxGeo', '--query', 'box'],
    ['--limit', '99'],
    ['--query'],
    ['--query', '--json'],
    ['--query', 'tube', '--query', 'ring'],
    ['--unknown'],
    ['tube'],
  ]) {
    const result = await command(args);
    expect(result.status).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
  }
  const result = await command([]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('createPart(');
  expect(result.stdout.length).toBeLessThan(16_384);
  expect((await command(['--help'])).stdout).toContain('Search works offline');
  const filtered = await command([
    '--kind',
    'operation',
    '--offset',
    '1',
    '--limit',
    '2',
    '--json',
  ]);
  expect(filtered.status).toBe(0);
  expect(JSON.parse(filtered.stdout).entries).toHaveLength(2);
});
