import { expect, test } from 'bun:test';
import { isolatedWorkerUrls } from './worker-urls';

test.each([
  ['src/evaluator/isolation.ts', 'src/evaluator', 'ts'],
  ['lib/evaluator/isolation.js', 'lib/evaluator', 'js'],
  ['dist/mcp-engine.mjs', 'lib/evaluator', 'js'],
  ['dist/cli.mjs', 'lib/evaluator', 'js'],
] as const)('%s resolves its complete worker set', (module, directory, extension) => {
  const root = 'file:///app/node_modules/@instruktlabs/kiln/';
  const urls = isolatedWorkerUrls(root + module);
  expect(urls.worker.href).toBe(`${root}${directory}/worker.${extension}`);
  expect(urls.probe.href).toBe(`${root}${directory}/probe-worker.${extension}`);
  expect(urls.transport.href).toBe(`${root}${directory}/transport-worker.mjs`);
});

test('compiled Windows paths keep URL encoding intact', () => {
  const urls = isolatedWorkerUrls('file:///C:/assets%20caf%C3%A9/lib/evaluator/isolation.js');
  expect(urls.worker.href).toBe('file:///C:/assets%20caf%C3%A9/lib/evaluator/worker.js');
});
