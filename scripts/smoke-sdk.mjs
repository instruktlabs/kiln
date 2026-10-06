#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const sdk = await import(pkg.name);
assert.equal(typeof sdk.renderGLB, 'function');
assert.equal(typeof sdk.validateKilnCode, 'function');
assert.equal(typeof sdk.createDiscovery, 'function');
const imports = [];
for (const name of Object.keys(pkg.exports)) {
  await import(name === '.' ? pkg.name : `${pkg.name}/${name.slice(2)}`);
  imports.push(name);
}
const code =
  'function build() { return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color: 0x888888})); }';
const result = await sdk.renderGLB(code);
assert.equal(result.glb.subarray(0, 4).toString('utf8'), 'glTF');
const evaluator = await import(`${pkg.name}/evaluator`);
const workerResult = await evaluator.renderGLBViaSubprocess(code);
assert.equal(workerResult.glb.subarray(0, 4).toString('utf8'), 'glTF');
assert.equal(sdk.engineIdentity().installUrl, new URL('../', import.meta.url).href);
console.log(
  JSON.stringify({
    node: process.version,
    package: pkg.name,
    imports,
    renderBytes: result.glb.length,
    workerRenderBytes: workerResult.glb.length,
  }),
);
