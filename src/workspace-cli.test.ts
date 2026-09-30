import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMaterialDependencies } from './workspace-cli';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
test('material pin files reject oversized, malformed, invalid and executable payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-material-pins-input-'));
  roots.push(root);
  const path = join(root, 'pins.json');
  for (const bytes of [
    ' '.repeat(1024 * 1024 + 1),
    '{broken',
    '{"code":"process.exit()"}',
    '[{"resourceId":"x","revisionId":"current","sha256":"unknown"}]',
    Buffer.from([0xff]),
  ]) {
    await writeFile(path, bytes);
    await expect(readMaterialDependencies(path)).rejects.toThrow();
  }
  await writeFile(path, '[]');
  expect(await readMaterialDependencies(path)).toEqual([]);
});
