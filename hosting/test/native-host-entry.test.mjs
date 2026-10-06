import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('native host entry rejects invalid public origins before loading its runtime', () => {
  for (const origin of [
    '',
    'http://kiln.example.com',
    'https://user:PRIVATE@kiln.example.com',
    'https://kiln.example.com/path',
  ]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../container/serve.mjs', import.meta.url))],
      {
        env: { KILN_PUBLIC_ORIGIN: origin },
        encoding: 'utf8',
        timeout: 5000,
      },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Kiln native host startup failed.\n');
  }
});
