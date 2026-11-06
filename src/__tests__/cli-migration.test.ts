import { expect, test } from 'bun:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAssetIntentV1 } from '../contracts/asset';

test('actual CLI writes an exclusive migration review, preserves original bytes and visibly stops on unresolved obligations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-migration-'));
  const cli = resolve(import.meta.dir, '../cli.ts');
  const input = join(directory, 'old.json');
  const output = join(directory, 'review.json');
  const original = JSON.stringify(
    createAssetIntentV1({ category: 'prop', requiredParts: ['clear entry'] }),
    null,
    3,
  );
  const run = (args: string[]) =>
    Bun.spawnSync([process.execPath, cli, 'migrate', ...args], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, KILN_RENDER: 'cpu' },
    });
  try {
    await writeFile(input, original);
    const result = run(['intent', input, '--out', output]);
    expect(result.exitCode).toBe(3);
    const report = JSON.parse(await readFile(output, 'utf8'));
    expect(report.conversion.status).toBe('review-required');
    expect(report.conversion.proposal.requirements.parts.value.required).toEqual(['clear entry']);
    expect(report.input.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await readFile(input, 'utf8')).toBe(original);
    expect(result.stderr.toString()).toContain('not activated');
    const source = join(directory, 'asset.js');
    await writeFile(source, "function build(){return createRoot('Empty');}");
    const activation = Bun.spawnSync(
      [process.execPath, cli, 'render', source, '--requirements', output, '--render', 'cpu'],
      {
        cwd: directory,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(activation.exitCode).toBe(1);
    expect(activation.stderr.toString()).toContain('binding');
    const repeated = run(['intent', input, '--out', output]);
    expect(repeated.exitCode).toBe(1);
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(report);
    expect(run(['intent', input, '--out', input]).exitCode).toBe(1);
    expect(await readFile(input, 'utf8')).toBe(original);
    expect(run(['intent', input, '--force']).exitCode).toBe(2);
    expect(run(['intent', input, '--out', output, '--out', output]).exitCode).toBe(2);
    expect(run(['--help']).exitCode).toBe(0);
    await writeFile(input, new Uint8Array([0xff, 0xfe, 0xff]));
    expect(run(['intent', input]).exitCode).toBe(1);
    await writeFile(input, ' '.repeat(1024 * 1024 + 1));
    expect(run(['intent', input]).exitCode).toBe(1);
    expect(run(['intent', directory]).exitCode).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000); // CLI runs: 3.0 s in CI, past its old budget at load 20+ on 5 November 2026.
