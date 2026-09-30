import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

test('portable asset and material contracts bundle for browsers without native image dependencies', async () => {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL('./assets.ts', import.meta.url))],
    target: 'browser',
  });
  expect(result.success).toBe(true);
  expect(result.outputs.length).toBeGreaterThan(0);
});
