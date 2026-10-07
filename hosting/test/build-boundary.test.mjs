import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { assertProductionBoundary } from '../scripts/build-boundary.mjs';

for (const module of [
  'github',
  'account-page',
  'account-actions',
  'connections',
  'browser-download',
]) {
  test(`the actual ${module} dependency graph is gateway-only`, async () => {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(`../src/${module}.ts`, import.meta.url))],
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'browser',
    });
    const inputs = Object.keys(result.metafile.inputs);
    assert.doesNotThrow(() => assertProductionBoundary('worker', inputs));
    for (const entry of [
      'tenant-worker',
      'evaluation-worker',
      'render-worker',
      'request-worker',
      'native-programs',
      'native-assets',
      'native-materials',
      'native-mcp',
      'native-host',
      'native-evaluator',
      'native-render',
    ]) {
      assert.throws(() => assertProductionBoundary(entry, inputs), /authorization-server/);
      assert.throws(
        () =>
          assertProductionBoundary(
            entry,
            inputs.map((name) => name.replaceAll('/', '\\')),
          ),
        /authorization-server/,
      );
    }
  });
}
