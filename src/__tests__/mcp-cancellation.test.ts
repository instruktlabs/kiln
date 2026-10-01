import { expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

it('propagates a real MCP cancellation to the Node worker and accepts a later valid request', async () => {
  const repo = resolve(import.meta.dir, '../..');
  await mkdir(join(repo, 'tmp'), { recursive: true });
  const root = await mkdtemp(join(repo, 'tmp/mcp-cancellation-test-'));
  try {
    const entry = join(root, 'probe.ts');
    // Exercise the shipped Node transport. Bun/Linux 1.3.14 can close a later
    // worker's fd3 after cancellation; its fail-closed tests remain separate.
    await writeFile(
      entry,
      `import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createKilnMcpServer } from ${JSON.stringify(join(repo, 'src/mcp-engine.ts'))};
import { createLocalToolContext } from ${JSON.stringify(join(repo, 'src/local-runtime.ts'))};

const originalSpawn = childProcess.spawn;
let observeSpawn;
const spawned = new Promise(resolve => { observeSpawn = resolve; });
let closed;
let worker;
childProcess.spawn = (...args) => {
  const child = originalSpawn(...args);
  if (!worker && args[1]?.some(arg => arg.endsWith('evaluator-worker.mjs'))) {
    worker = child;
    closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    child.once('spawn', () => observeSpawn(child.pid));
  }
  return child;
};
syncBuiltinESMExports();

const local = createLocalToolContext({}, { KILN_EVALUATOR_TIMEOUT_MS: '1200' });
const evaluator = local.evaluatorPort;
let completed;
const outcome = new Promise(resolve => { completed = resolve; });
local.evaluatorPort = {
  async render(code, options, controls) {
    try { return await evaluator.render(code, options, controls); }
    catch (error) { completed(error.code); throw error; }
  }
};
const [ct, st] = InMemoryTransport.createLinkedPair();
const server = createKilnMcpServer(local);
const client = new Client({ name: 'kiln-cancel-test', version: '0' });
await Promise.all([server.connect(st), client.connect(ct)]);
try {
  const controller = new AbortController();
  const request = client.callTool({
    name: 'kiln_render',
    arguments: { code: 'function build(){while(true){}}', capture: { preset: '1x1' } }
  }, { signal: controller.signal }).catch(error => error);
  const pid = await spawned;
  assert.ok(Number.isInteger(pid) && pid > 0, 'An actual worker must start');
  controller.abort();
  await request;
  assert.equal(await outcome, 'CANCELLED');
  assert.deepEqual(await closed, { code: null, signal: 'SIGKILL' });
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });

  const valid = await client.callTool({
    name: 'kiln_render',
    arguments: {
      code: "const meta={name:'Box'};function build(){const root=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#aaaaaa'),{parent:root});return root;}",
      capture: { preset: '1x1' }
    }
  });
  assert.notEqual(valid.isError, true);
  const details = valid.content.find(item => item.type === 'text');
  assert.ok(details, 'The later request must return its structured result');
  assert.equal(JSON.parse(details.text).ok, true, details.text);
  assert.ok(valid.content.some(item => item.type === 'image'), 'The later request must return a real image');
  console.log('mcp-node-cancellation-recovered');
} finally {
  await client.close();
  await server.close();
  childProcess.spawn = originalSpawn;
  syncBuiltinESMExports();
  if (worker?.exitCode === null && worker?.signalCode === null) worker.kill('SIGKILL');
}
`,
    );
    // Build both entries here: CI does not need a pre-existing dist directory.
    for (const [input, name] of [
      [entry, 'probe.mjs'],
      ['src/evaluator/worker.ts', 'evaluator-worker.mjs'],
    ]) {
      const built = spawnSync(
        process.execPath,
        ['build', input!, '--target=node', '--packages=external', `--outfile=${join(root, name!)}`],
        { cwd: repo, encoding: 'utf8' },
      );
      expect(built.status, built.stderr).toBe(0);
    }
    const run = spawnSync('node', [join(root, 'probe.mjs')], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim()).toBe('mcp-node-cancellation-recovered');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
