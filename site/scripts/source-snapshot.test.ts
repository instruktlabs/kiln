import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSourceSnapshot, snapshotSource } from './source-snapshot.mjs';

test('a docs/skills snapshot retains actual uncommitted inputs and rejects later byte drift', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-source-snapshot-'));
  try {
    const engine = join(root, 'engine');
    const out = join(root, 'snapshot');
    await mkdir(join(engine, 'docs'), { recursive: true });
    await mkdir(join(engine, 'skills/example'), { recursive: true });
    await writeFile(join(engine, 'docs/install.md'), '# Local candidate');
    await writeFile(join(engine, 'skills/example/SKILL.md'), 'Retain exact revisions.');
    const manifest = await createSourceSnapshot({ engine, out, identity: { commit: 'abc1234', clean: false } });
    expect(manifest.files).toHaveLength(2);
    expect(await readFile(join(out, 'docs/install.md'), 'utf8')).toBe('# Local candidate');
    expect(snapshotSource(join(out, 'docs'))).toMatchObject({ commit: 'abc1234', clean: false, filesSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    await writeFile(join(out, 'docs/install.md'), '# Changed');
    expect(() => snapshotSource(join(out, 'docs'))).toThrow('snapshot');
  } finally { await rm(root, { recursive: true, force: true }); }
});
