import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const skill = (path: string) =>
  readFileSync(new URL(`../../skills/kiln-compose-scene/${path}`, import.meta.url), 'utf8');

test('scene delivery regenerates the aggregate export receipt from fresh export receipts (#180)', () => {
  const text = skill('references/runtime-scenes.md').split('## Delivery')[1]!;
  // The fields are those `kiln export --json` and the runtime sidecar actually emit.
  for (const field of ['revisionId', 'files[]', 'sha256', 'sourceSha256', 'history[]'])
    expect(text).toContain(field);
  expect(text).toContain('kiln export');
  expect(text).toMatch(/regenerat/);
  expect(text).toMatch(/immutable/);
  expect(text).toMatch(/before (claiming|reporting) delivery/i);
});

test('the scene skill points at that receipt rule without adding it to standalone assets (#180)', () => {
  expect(skill('SKILL.md')).toContain('export receipt');
  for (const name of ['kiln-author-asset', 'kiln-refine-asset', 'kiln-qa-asset'])
    expect(
      readFileSync(new URL(`../../skills/${name}/SKILL.md`, import.meta.url), 'utf8'),
    ).not.toContain('aggregate export receipt');
});
