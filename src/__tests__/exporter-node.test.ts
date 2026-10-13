import { expect, test } from 'bun:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('missing optional native canvas gives recovery advice without loading it for flat or browser exports', () => {
  // Isolate the unavailable native dependency and host globals from the rest of the suite.
  const script = `
import { mock } from 'bun:test';
const original = new Error('native binding unavailable');
let loads = 0;
mock.module('@napi-rs/canvas', () => { loads++; throw original; });
const { prepareNodeExport } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dir, '../exporter-node.ts')).href)});
delete globalThis.OffscreenCanvas;
delete globalThis.document;
await prepareNodeExport(false);
const flatLoads = loads;
globalThis.OffscreenCanvas = class {};
await prepareNodeExport(true);
const browserLoads = loads;
delete globalThis.OffscreenCanvas;
try {
  await prepareNodeExport(true);
  console.log(JSON.stringify({ unexpectedlySucceeded: true }));
} catch (error) {
  console.log(JSON.stringify({ flatLoads, browserLoads, loads, message: error.message, causePreserved: error.cause === original, canvasInstalled: Boolean(globalThis.OffscreenCanvas) }));
}
`;
  const result = Bun.spawnSync([process.execPath, '--eval', script], {
    cwd: resolve(import.meta.dir, '../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(result.stderr.toString()).toBe('');
  expect(result.exitCode).toBe(0);
  const receipt = JSON.parse(result.stdout.toString());
  expect(receipt.flatLoads).toBe(0);
  expect(receipt.browserLoads).toBe(0);
  expect(receipt.loads).toBe(1);
  expect(receipt.message).toContain('@napi-rs/canvas');
  expect(receipt.message).toContain('optional dependencies');
  expect(receipt.message).toContain('same Node runtime');
  expect(receipt.causePreserved).toBe(true);
  expect(receipt.canvasInstalled).toBe(false);
});
