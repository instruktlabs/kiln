import { expect, test } from 'bun:test';
import { buildDownloadChoices } from '../src/lib/download-choices';

test('public download choices use two simple labels and preserve actual file URLs', () => {
  const runtime = { url: 'https://example.test/runtime.glb', bytes: 80, sha256: 'a'.repeat(64) };
  const editable = { url: 'https://example.test/editable.zip', bytes: 200, sha256: 'b'.repeat(64) };
  const choices = buildDownloadChoices(runtime, editable);
  expect(choices.map(choice => choice.label)).toEqual(['Runtime assets', 'Editable assets']);
  expect(choices.map(choice => choice.url)).toEqual([runtime.url, editable.url]);
  expect(choices[1]!.description).toContain('metadata');
  expect(choices[1]!.description).toContain('materials');
  expect(choices.every(choice => !/provenance|approval|SHA-256/.test(choice.description))).toBe(true);
});
