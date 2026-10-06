// Fixed trusted fixture, passed over stdin to the disposable image by the smoke script.
// No host workspace, network, user program or credential is available to this process.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { renderGLB } from '@instruktlabs/kiln';
import {
  createNativeRenderPort,
  encodeRenderRequest,
  RENDER_LIMITS,
} from '/opt/kiln/native-render.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pkg = JSON.parse(await readFile('/opt/kiln/node_modules/@instruktlabs/kiln/package.json'));
const { PNG } = createRequire('/opt/kiln/node_modules/@instruktlabs/kiln/package.json')('pngjs');
const source = `function build(){const root=createRoot('Root');
 const albedo=proceduralTexture({schemaVersion:2,size:32,usage:'albedo',layers:[{op:'checker',colorA:0xcc2211,colorB:0x22bb33,squares:4}]});
 createPart('Textured',boxGeo(1,1,1),pbrMaterial({albedo,roughness:0.7,metalness:0.1}),{parent:root});
 createPart('Blue',sphereGeo(0.35),pbrMaterial({albedo:0x2233dd,roughness:0.25,metalness:0.4}),{parent:root,position:[0,0.2,0.85]});return root;}`;
const { glb } = await renderGLB(source);
const images = [];
const runs = [];
function entry(input) {
  // Deliberately omit the image's Vulkan environment: Cloudflare exec does too.
  return spawnSync('/usr/local/bin/node', ['/opt/kiln/render.mjs'], {
    input,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/node' },
    timeout: 30_000,
    maxBuffer: RENDER_LIMITS.responseBytes,
  });
}
function record(name, bytes) {
  const png = PNG.sync.read(Buffer.from(bytes));
  assert.equal(png.width, 128);
  assert.equal(png.height, 128);
  let red = 0,
    green = 0;
  for (let n = 0; n < png.data.length; n += 4) {
    const [r, g, b] = png.data.subarray(n, n + 3);
    if (r > g + 12 && r > b + 12) red++;
    if (g > r + 12 && g > b + 12) green++;
  }
  assert(red > 20 && green > 20, `${name}: expected textured colours`);
  images.push({
    name,
    sha256: hash(bytes),
    red,
    green,
    base64: Buffer.from(bytes).toString('base64'),
  });
}
const port = createNativeRenderPort({
  fetch: async (request) => {
    assert.equal(request.url, 'http://kiln-renderer.internal/render');
    const result = entry(Buffer.from(await request.arrayBuffer()));
    assert.equal(result.status, 0, result.stderr?.toString() || result.error?.message);
    assert.equal(result.signal, null);
    runs.push({ stderrSha256: hash(result.stderr), bytes: result.stdout.length });
    return new Response(result.stdout);
  },
});
for (const backdrop of ['neutral', 'dark', 'light']) {
  const result = await port({
    glb,
    size: 128,
    viewDirs: [
      [1, 0.4, 1],
      [0, 0, 1],
    ],
    backdrop,
    ...(backdrop === 'neutral' ? { beautySize: 128 } : {}),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.backend, 'vulkan');
  assert.equal(result.derivativeFidelity.inputGlbSha256, `sha256:${hash(glb)}`);
  assert.equal(result.derivativeFidelity.materialFaithful, true);
  assert.equal(result.viewsPng.length, 2);
  for (const [i, bytes] of result.viewsPng.entries()) record(`${backdrop}-${i}.png`, bytes);
  if (backdrop === 'neutral') record('beauty.png', result.beautyPng);
  runs.at(-1).rendererId = result.rendererId;
}
const cameras = [
  {
    position: [2, 1.2, 2],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fovDeg: 50,
    aspect: 1,
    near: 0.1,
    far: 20,
  },
];
const camera = await port({
  glb,
  cameras,
  width: 128,
  height: 128,
  lightingPresetId: 'review-neutral-v1',
});
assert.equal(camera.ok, true, JSON.stringify(camera));
assert.deepEqual(camera.cameras, cameras);
assert.equal(camera.width, 128);
assert.equal(camera.height, 128);
assert.equal(camera.lightingPresetId, 'review-neutral-v1');
record('camera.png', camera.viewsPng[0]);
for (const bytes of [
  Buffer.from('{'),
  encodeRenderRequest({ glb: Buffer.from('not a GLB'), size: 128, viewDirs: [[1, 0, 0]] }).bytes,
]) {
  const result = entry(bytes);
  assert.equal(result.status, 1);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.toString(), 'Kiln software render input or execution failed.\n');
}
console.log(
  JSON.stringify({
    version: pkg.version,
    archiveSha256: hash(await readFile('/opt/kiln/candidate.tgz')),
    inputGlbSha256: hash(glb),
    runs,
    images,
    checks: [
      'actual-render-entry',
      'fixed-software-device',
      'exact-glb-identity',
      'three-backdrops',
      'beauty',
      'exact-camera',
      'malformed-input-before-device',
    ],
    bundleSha256: Object.fromEntries(
      await Promise.all(
        ['native-render.mjs', 'render.mjs'].map(async (name) => [
          name,
          hash(await readFile(`/opt/kiln/${name}`)),
        ]),
      ),
    ),
  }),
);
