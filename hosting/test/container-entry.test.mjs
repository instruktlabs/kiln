import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { createEvaluatorRequestV2, decodeEvaluatorResultV2 } from '../../lib/evaluator/index.js';

const output = new URL('../../.cache/hosted-container-test/', import.meta.url);
const entry = fileURLToPath(new URL('evaluate.mjs', output));
const limits = { maxGlbBytes: 2 * 1024 * 1024, maxResponseBytes: 8 * 1024 * 1024 };

before(async () => {
  // Resolve the engine package's compiled exports outside hosting's private scope.
  await mkdir(output, { recursive: true });
  await copyFile(new URL('../container/evaluate.mjs', import.meta.url), entry);
});

// Only trusted fixed fixtures run on the test host. These are protocol checks,
// not evidence that the child process can contain hostile source.
function run(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, KILN_RENDER: 'cpu' },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.stdin.on('error', (error) => {
      if (!['EPIPE', 'ECONNRESET', 'EOF'].includes(error.code)) reject(error);
    });
    child.on('error', reject);
    child.on('close', (code, signal) =>
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }),
    );
    child.stdin.end(input);
  });
}

test('container entry produces a canonical deterministic GLB from the compiled package', async () => {
  const { json } = createEvaluatorRequestV2({
    requestId: 'container-entry',
    code: 'function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}',
    maxGlbBytes: limits.maxGlbBytes,
  });
  let previous;
  for (let i = 0; i < 2; i++) {
    const result = await run(json);
    assert.equal(result.signal, null);
    assert.equal(result.code, 0, result.stderr);
    const decoded = decodeEvaluatorResultV2(result.stdout, limits.maxGlbBytes, 'container-entry');
    assert.equal(decoded.ok, true);
    assert.equal(decoded.render.glb.subarray(0, 4).toString(), 'glTF');
    assert.ok(Buffer.byteLength(result.stdout) <= limits.maxResponseBytes);
    if (previous) assert.deepEqual(decoded.render.glb, previous);
    previous = decoded.render.glb;
  }
});

test('container entry returns only the canonical rejection for malformed envelopes', async () => {
  const result = await run('{"private":"FIXTURE_SOURCE_DO_NOT_ECHO"}');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).error.code, 'INPUT_INVALID');
  assert.equal(`${result.stdout}${result.stderr}`.includes('FIXTURE_SOURCE_DO_NOT_ECHO'), false);
});

test('container entry refuses oversized input and invalid UTF-8 without evaluation', async () => {
  for (const input of [Buffer.alloc(4 * 1024 * 1024 + 1, 32), Buffer.from([0xc3, 0x28])]) {
    const result = await run(input);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Kiln evaluator input or execution failed.\n');
  }
});
