import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { renderGLBInProcess } from '../render';
import { isolatedEvaluatorLaunch } from './isolation';

test('isolated Node flags retain Khronos validation and remove the prototype mutation accessor', async () => {
  const launch = isolatedEvaluatorLaunch(
    '/app/node_modules/@instruktlabs/kiln/lib/evaluator/worker.js',
    { platform: 'linux', pathExists: () => true },
  );
  const nodeIndex = launch.args.lastIndexOf('/usr/local/bin/node');
  expect(nodeIndex).toBeGreaterThan(0);
  const runtimeFlags = launch.args.slice(nodeIndex + 1, -1);
  const { glb } = await renderGLBInProcess(
    'function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}',
  );
  // Exercise the actual dependency with the launcher's Node flags on every OS.
  // This does not claim to qualify Linux namespaces or replace the real VM job.
  const child = spawnSync(
    'node',
    [
      ...runtimeFlags,
      '--input-type=module',
      '--eval',
      `import assert from 'node:assert/strict';
       import { validateBytes } from 'gltf-validator';
       const report = await validateBytes(Buffer.from('${glb.toString('base64')}', 'base64'));
       assert.equal(report.issues.numErrors, 0);
       assert.equal(Object.hasOwn(Object.prototype, '__proto__'), false);
       const target = Object.assign({}, JSON.parse('{"__proto__":{"polluted":true}}'));
       assert.equal(Object.getPrototypeOf(target), Object.prototype);
       assert.equal(target.polluted, undefined);
       console.log('validator-passed-prototype-accessor-absent');`,
    ],
    {
      cwd: resolve(import.meta.dir, '../..'),
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 16 * 1024,
      windowsHide: true,
      env: {
        PATH: process.env['PATH'] ?? process.env['Path'],
        ...(process.platform === 'win32' ? { SystemRoot: process.env['SystemRoot'] } : {}),
        NODE_ENV: 'production',
        NO_COLOR: '1',
      },
    },
  );
  expect(child.stderr).toBe('');
  expect(child.status).toBe(0);
  expect(child.stdout.trim()).toBe('validator-passed-prototype-accessor-absent');
});
