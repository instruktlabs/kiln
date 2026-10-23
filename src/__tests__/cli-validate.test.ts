import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const entry = resolve(import.meta.dir, '../cli.ts');

function workspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'kiln-validate-cli-'));
  const run = (args: string[]) =>
    spawnSync(process.execPath, [entry, ...args], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, KILN_RENDER: 'cpu', KILN_PROGRAM_STORE: join(cwd, 'programs') },
      timeout: 20_000,
    });
  return { cwd, run, done: () => rmSync(cwd, { recursive: true, force: true }) };
}

const VALID = `const meta = { name: 'Crate' };\nfunction build() { return createRoot('Crate'); }\n`;
const INVALID = `const meta = { name: 'Crate' };\nfunction build() { return createRoot('Crate'); \n`;

test('kiln validate reports the kiln_validate result for a file and a ref', () => {
  const { cwd, run, done } = workspace();
  try {
    writeFileSync(join(cwd, 'good.js'), VALID);
    writeFileSync(join(cwd, 'bad.js'), INVALID);
    const good = run(['validate', 'good.js']);
    expect(good.status).toBe(0);
    expect(good.stdout).toMatch(/^valid p_/);
    const bad = run(['validate', 'bad.js']);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/^invalid p_/);
    expect(bad.stdout).toContain('error:');
    const json = run(['validate', 'bad.js', '--json']);
    expect(json.status).toBe(1);
    const result = JSON.parse(json.stdout);
    expect(result).toMatchObject({ valid: false, validationScope: 'syntax-and-sandbox' });
    expect(result.errors.length).toBeGreaterThan(0);
    const ref = /^valid (p_\S+)/.exec(good.stdout)![1]!;
    const byRef = run(['validate', ref, '--json']);
    expect(byRef.status).toBe(0);
    expect(JSON.parse(byRef.stdout)).toMatchObject({ valid: true, programRef: ref });
    const missing = run(['validate']);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('validate requires a program path or reference');
  } finally {
    done();
  }
  // Five CLI processes: 2.0 s on an idle host (2026-10-22); CLI-spawning tests have needed
  // up to 60 s on a loaded Windows host.
}, 60_000);
