import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const entry = resolve(import.meta.dir, '../cli.ts');
const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, '../../package.json'), 'utf8')) as {
  version: string;
};
const run = (args: string[]) =>
  spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, KILN_RENDER: 'cpu' },
    timeout: 20_000,
  });

// #202: `kiln --version` was an unknown option (exit 2).
test('kiln --version prints the package version alone and exits 0', () => {
  const result = run(['--version']);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(`${pkg.version}\n`);
});

test('--version is not accepted after a command', () => {
  const result = run(['render', '--version']);
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('unknown option: --version');
});
