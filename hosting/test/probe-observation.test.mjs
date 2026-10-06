import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';

let observeContainer;
before(async () => {
  const output = new URL('../../.cache/hosted-probe-test/observe.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../probe/observe-container.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ observeContainer } = await import(output));
});

test('probe observation retains only the first failed native operation, never exception text', async () => {
  const actual = {
    start() {
      assert.equal(this, actual);
    },
    async exec() {
      throw new Error('private runtime diagnostic');
    },
    async destroy() {
      throw new Error('later cleanup diagnostic');
    },
  };
  const observed = observeContainer(actual);
  observed.container.start();
  await assert.rejects(observed.container.exec([]));
  await assert.rejects(observed.container.destroy());
  assert.equal(observed.failure(), 'exec');
  assert.equal(JSON.stringify(observed.failure()).includes('private'), false);
});

test('probe fixture substitution retains native exec options and observes synchronous failure', () => {
  const options = { user: '1000:1000', stdin: 'pipe' };
  const observed = observeContainer(
    {
      exec(command, received) {
        assert.deepEqual(command, [
          '/usr/local/bin/node',
          '--input-type=module',
          '-e',
          'fixed fixture',
        ]);
        assert.equal(received, options);
        throw new Error('native synchronous failure');
      },
    },
    'fixed fixture',
  );
  assert.throws(() => observed.container.exec(['original'], options));
  assert.equal(observed.failure(), 'exec');
});
