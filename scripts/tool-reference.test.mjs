/**
 * `docs/tools.md` is generated, and `docs/` is in the package's `files` list, so a
 * stale reference is published to every install. The generator has had a `--check`
 * mode from the start; it appeared in no workflow and no test, which is the same
 * shape as the render service's 37 tests running nowhere (13.7).
 *
 * What slipped through it: 13.2's in-range `zod` 4.4.3 -> 4.6.2 bump changed
 * `z.toJSONSchema` to emit `items: false`, `minItems` and `maxItems` for
 * fixed-length tuples, so every tuple input in the published reference understated
 * its own schema. An offline gate that exists but runs nowhere is worth exactly as
 * much as no gate.
 */
import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { toolReferenceMarkdown, toolReferencePath } from './generate-tool-reference.ts';
import { operationReferenceMarkdown, operationReferencePath } from './generate-tool-reference.ts';

test('docs/tools.md matches the registry it is generated from', async () => {
  const published = await readFile(toolReferencePath, 'utf8');
  // Compared whole rather than by section: the drift that shipped was four added
  // lines inside one nested schema, which any summary comparison would have missed.
  expect(
    published === toolReferenceMarkdown(),
    'docs/tools.md is stale — run `bun run docs:tools`',
  ).toBe(true);
});

test('named operation reference matches the registry without changing default tools', async () => {
  expect(await readFile(operationReferencePath, 'utf8')).toBe(operationReferenceMarkdown());
  expect(operationReferenceMarkdown().match(/^## kiln_/gm)).toHaveLength(21);
});
