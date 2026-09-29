// End-to-end smoke: boots the server in-process, hits /health and /render with a
// real GLB, validates PNG output, exercises auth and the bad-input paths.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

process.env.PORT = process.env.PORT ?? '8199';
process.env.RENDER_SERVICE_TOKEN = process.env.RENDER_SERVICE_TOKEN ?? 'smoke-token';
const PORT = process.env.PORT;
const TOKEN = process.env.RENDER_SERVICE_TOKEN;

const here = dirname(fileURLToPath(import.meta.url));
const glbPath = process.env.SMOKE_GLB ?? join(here, 'fixtures', 'material-channels-v1.glb');

await import('../src/server.mjs');
await new Promise((r) => setTimeout(r, 300));

const base = `http://127.0.0.1:${PORT}`;
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!cond) failures++;
};

// The server logs to stdout in-process, so intercepting console.log is the only
// way to assert on the request line. done() writes it synchronously before the
// client's fetch can settle, so the line is always present on return.
async function capturingLog(fn) {
  const lines = [];
  const real = console.log;
  console.log = (...args) => {
    lines.push(args.join(' '));
  };
  try {
    const value = await fn();
    return { value, lines, text: lines.join('\n') };
  } finally {
    console.log = real;
  }
}

const requestLines = (lines) =>
  lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((o) => o?.evt === 'request');

const health = await (await fetch(`${base}/health`)).json();
check('health ok', health.ok === true, health.rendererId);
check(
  'health advertises capabilities + auth posture',
  Array.isArray(health.capabilities) &&
    health.capabilities.includes('auth.x-render-token') &&
    health.capabilities.includes('render.profile.neutral-studio-v1') &&
    health.capabilities.includes('render.cameras.perspective-v1') &&
    health.capabilities.includes('render.targets.rectangular-v1') &&
    health.capabilities.includes('render.outputs.sha256-v1') &&
    Array.isArray(health.lightingPresetIds) &&
    // Membership, not equality. Pinning the whole list meant that adding
    // gallery-studio-v1 turned this check red and left it red -- a smoke that
    // always reports one failure is a smoke nobody reads. What actually matters
    // is that every advertised preset is backed by a declared capability.
    health.lightingPresetIds.includes('neutral-studio-v1') &&
    health.lightingPresetIds.every((id) => health.capabilities.includes(`render.profile.${id}`)) &&
    typeof health.backend === 'string' &&
    health.backend.length > 0 &&
    health.presentationProfile === 'review-neutral-v1' &&
    health.authRequired === true,
  JSON.stringify(health.capabilities),
);

const noAuth = await fetch(`${base}/render`, { method: 'POST', body: '{}' });
check('unauthenticated render rejected', noAuth.status === 401);

// The gateway path cannot use Authorization (RunPod consumes it at the edge),
// so the custom header must authenticate on its own.
const customHeader = await fetch(`${base}/render`, {
  method: 'POST',
  headers: { 'x-render-token': TOKEN },
  body: 'nope',
});
check('x-render-token accepted (reaches body validation)', customHeader.status === 400);

const wrongCustom = await capturingLog(() =>
  fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'x-render-token': 'wrong-token' },
    body: '{}',
  }),
);
check('wrong x-render-token rejected', wrongCustom.value.status === 401);
const rejectedLine = requestLines(wrongCustom.lines)[0];
check(
  'rejected auth is logged as such',
  rejectedLine?.status === 401 &&
    rejectedLine?.auth === 'rejected' &&
    rejectedLine?.path === '/render',
  JSON.stringify(rejectedLine),
);
check(
  'no token value in the rejected line',
  !wrongCustom.text.includes(TOKEN) && !wrongCustom.text.includes('wrong-token'),
);

const badJson = await fetch(`${base}/render`, {
  method: 'POST',
  headers: { authorization: `Bearer ${TOKEN}` },
  body: 'nope',
});
check('invalid JSON rejected', badJson.status === 400);

const badGlb = await fetch(`${base}/render`, {
  method: 'POST',
  headers: { authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ glb_base64: Buffer.from('not a glb').toString('base64') }),
});
check('bad GLB magic rejected', badGlb.status === 400);

const glb = readFileSync(glbPath);
const t0 = performance.now();
const rendered = await capturingLog(async () =>
  (
    await fetch(`${base}/render`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ glb_base64: glb.toString('base64'), size: 384, beauty_size: 1024 }),
    })
  ).json(),
);
const r = rendered.value;
const wallMs = (performance.now() - t0).toFixed(1);

check('render ok', r.ok === true);
check('six views', Array.isArray(r.views) && r.views.length === 6);
check('rendererId present', typeof r.rendererId === 'string' && r.rendererId.startsWith('dawn-'));
check(
  'render reports the fixed presentation profile',
  r.presentationProfile === 'review-neutral-v1',
);
const png0 = Buffer.from(r.views?.[0] ?? '', 'base64');
check('view is PNG', png0[0] === 0x89 && png0[1] === 0x50, `${png0.length}B`);
const decodedView0 = PNG.sync.read(png0);
const corner = decodedView0.data.subarray(0, 3);
const cornerLuma = Math.round(0.2126 * corner[0] + 0.7152 * corner[1] + 0.0722 * corner[2]);
check(
  'studio backdrop stays neutral and visibly above black',
  cornerLuma >= 90 && Math.max(...corner) - Math.min(...corner) <= 32,
  `rgb=${[...corner].join(',')} luma=${cornerLuma}`,
);
const beauty = Buffer.from(r.beauty ?? '', 'base64');
check('beauty is PNG', beauty[0] === 0x89 && beauty[1] === 0x50, `${beauty.length}B`);
console.log(`timings: ${JSON.stringify(r.timings)} wall=${wallMs}ms`);

// One structured line per request is the only service-side evidence a production
// degrade ever happened; §2.2(a)'s client-side view is otherwise the sole witness.
const renderLine = requestLines(rendered.lines)[0];
check(
  'render emits one request log line',
  requestLines(rendered.lines).length === 1 && renderLine?.evt === 'request',
  JSON.stringify(renderLine),
);
check(
  'log line carries method/path/status/auth',
  renderLine?.method === 'POST' &&
    renderLine?.path === '/render' &&
    renderLine?.status === 200 &&
    renderLine?.auth === 'ok' &&
    renderLine?.authVia === 'authorization',
);
check(
  'log line carries byte counts and timings',
  renderLine?.glbBytes === glb.length &&
    renderLine?.bodyBytes > glb.length &&
    renderLine?.views === 6 &&
    renderLine?.beauty === true &&
    typeof renderLine?.timings?.totalMs === 'number' &&
    renderLine?.ms > 0,
  `glbBytes=${renderLine?.glbBytes} ms=${renderLine?.ms}`,
);
check(
  'no token or GLB payload in the log line',
  !rendered.text.includes(TOKEN) && !rendered.text.includes(glb.toString('base64').slice(0, 32)),
);

const out = join(here, 'out');
mkdirSync(out, { recursive: true });
if (r.ok) {
  writeFileSync(join(out, 'smoke-view0.png'), png0);
  if (beauty.length) writeFileSync(join(out, 'smoke-beauty.png'), beauty);
}

// second render: warm-path timing, and proof that per-render disposal releases
// only what the request owned — the pooled RTs and the shared environment map
// must survive it, so a repeat of the same fixture has to produce the same grid.
// Byte-equality is a same-process, same-device claim only; the port is
// contractually a non-deterministic view producer across GPU tiers.
const { initRenderer } = await import('../src/renderer.mjs');
const { renderer } = await initRenderer();
// After render 1 the RT pool and the PMREM environment are already allocated, so
// this baseline isolates exactly what a request allocates and must give back.
const mem1 = { ...renderer.info.memory };
const t1 = performance.now();
const r2 = await (
  await fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'x-render-token': TOKEN },
    body: JSON.stringify({ glb_base64: glb.toString('base64'), size: 384, beauty_size: 1024 }),
  })
).json();
check(
  'warm render ok',
  r2.ok === true,
  `wall=${(performance.now() - t1).toFixed(1)}ms gpu=${JSON.stringify(r2.timings)}`,
);
check(
  'repeat render matches first view count',
  r2.views?.length === r.views?.length,
  `${r2.views?.length} vs ${r.views?.length}`,
);
const png0b = Buffer.from(r2.views?.[0] ?? '', 'base64');
const beautyB = Buffer.from(r2.beauty ?? '', 'base64');
check(
  'repeat render still produces PNGs',
  png0b[0] === 0x89 && png0b[1] === 0x50 && beautyB[0] === 0x89 && beautyB[1] === 0x50,
  `${png0b.length}B ${beautyB.length}B`,
);
check(
  'repeat render byte-identical to first',
  png0b.equals(png0),
  `${png0.length}B vs ${png0b.length}B`,
);

const mem2 = renderer.info.memory;
const grew = (k) => mem2[k] - mem1[k];
check(
  'render allocations are returned, not accumulated',
  grew('textures') <= 0 && grew('texturesSize') <= 0 && grew('geometries') <= 0,
  `textures ${mem1.textures}->${mem2.textures} bytes ${mem1.texturesSize}->${mem2.texturesSize} geometries ${mem1.geometries}->${mem2.geometries}`,
);

// Render-target pools are keyed by size and never evicted, so the set of
// reachable keys must be bounded no matter what a caller asks for.
const { snapRenderSize, ALLOWED_RENDER_SIZES } = await import('../src/renderer.mjs');
const snappedKeys = new Set();
for (let n = -50; n <= 4200; n += 7) snappedKeys.add(snapRenderSize(n));
snappedKeys.add(snapRenderSize(undefined));
snappedKeys.add(snapRenderSize(Number.NaN));
check(
  'every requestable size snaps into the allowlist',
  [...snappedKeys].every((s) => ALLOWED_RENDER_SIZES.includes(s)),
  `${snappedKeys.size} distinct keys from ~600 requests`,
);
check(
  'snapping rounds up, so a caller never gets less detail than it asked for',
  snapRenderSize(385) === 512 && snapRenderSize(384) === 384 && snapRenderSize(9999) === 2048,
  `385->${snapRenderSize(385)} 384->${snapRenderSize(384)} 9999->${snapRenderSize(9999)}`,
);

// Variable view counts (T3.3). The engine picks a grid shape and composites the
// reply into it, so the count that comes back must equal the count requested —
// exactly, in request order. Silently truncating an over-long list (what this
// service used to do) shows up client-side as a mystery degrade with no hint
// that the request itself was the problem.
const { validateViewDirs, MAX_VIEW_DIRS } = await import('../src/renderer.mjs');

const nineDirs = [
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1],
  [0, 1, 0.001],
  [0.7, 0.5, 0.7],
  [0, -1, 0.001],
  [-0.7, 0.5, -0.7],
  [0.7, -0.35, 0.7],
];
const nine = await (
  await fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'x-render-token': TOKEN },
    body: JSON.stringify({ glb_base64: glb.toString('base64'), size: 128, views: nineDirs }),
  })
).json();
check(
  'nine requested views produce nine PNGs',
  nine.ok === true && nine.views?.length === 9,
  `${nine.views?.length ?? nine.error}`,
);

const one = await (
  await fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'x-render-token': TOKEN },
    body: JSON.stringify({
      glb_base64: glb.toString('base64'),
      size: 128,
      views: [[0.7, 0.5, 0.7]],
    }),
  })
).json();
check(
  'a single requested view produces a single PNG',
  one.ok === true && one.views?.length === 1,
  `${one.views?.length ?? one.error}`,
);

const exactCamera = {
  position: [4, 3, 6],
  target: [0, 0.8, 0],
  up: [0, 1, 0],
  fovDeg: 48,
  aspect: 16 / 9,
  near: 0.1,
  far: 100,
};
const cameraMemBefore = { ...renderer.info.memory };
const cameraRendered = await capturingLog(async () =>
  (
    await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'x-render-token': TOKEN },
      body: JSON.stringify({
        glb_base64: glb.toString('base64'),
        cameras: [exactCamera],
        width: 320,
        height: 180,
        lighting_preset_id: 'neutral-studio-v1',
      }),
    })
  ).json(),
);
const cameraResult = cameraRendered.value;
const cameraPng = PNG.sync.read(Buffer.from(cameraResult.views?.[0] ?? '', 'base64'));
check(
  'exact perspective camera render returns its rectangular PNG',
  cameraResult.ok === true && cameraPng.width === 320 && cameraPng.height === 180,
  `${cameraPng.width}x${cameraPng.height}`,
);
check(
  'camera response echoes actual renderer provenance and exact transport',
  cameraResult.rendererId === health.rendererId &&
    cameraResult.backend === health.backend &&
    cameraResult.presentationProfile === 'neutral-studio-v1' &&
    cameraResult.lightingPresetId === 'neutral-studio-v1' &&
    cameraResult.width === 320 &&
    cameraResult.height === 180 &&
    JSON.stringify(cameraResult.cameras) === JSON.stringify([exactCamera]),
);
check(
  'camera response binds each output and the ordered output set',
  /^sha256:[0-9a-f]{64}$/.test(cameraResult.viewSha256?.[0] ?? '') &&
    /^sha256:[0-9a-f]{64}$/.test(cameraResult.outputSetSha256 ?? '') &&
    cameraResult.cameraReceipts?.[0]?.outputSha256 === cameraResult.viewSha256[0] &&
    cameraResult.cameraReceipts?.[0]?.width === 320 &&
    cameraResult.cameraReceipts?.[0]?.height === 180,
);
const cameraMemAfter = renderer.info.memory;
check(
  'camera targets are request-owned and disposed after readback',
  cameraMemAfter.textures <= cameraMemBefore.textures &&
    cameraMemAfter.texturesSize <= cameraMemBefore.texturesSize,
  `textures ${cameraMemBefore.textures}->${cameraMemAfter.textures} ` +
    `bytes ${cameraMemBefore.texturesSize}->${cameraMemAfter.texturesSize}`,
);
const cameraLine = requestLines(cameraRendered.lines)[0];
check(
  'camera log carries bounded dimensions/profile/output identity without payloads',
  cameraLine?.renderMode === 'camera' &&
    cameraLine?.camerasRequested === 1 &&
    cameraLine?.width === 320 &&
    cameraLine?.height === 180 &&
    cameraLine?.lightingPresetId === 'neutral-studio-v1' &&
    cameraLine?.backend === health.backend &&
    cameraLine?.rendererId === health.rendererId &&
    cameraLine?.outputSetSha256 === cameraResult.outputSetSha256 &&
    !cameraRendered.text.includes(glb.toString('base64').slice(0, 32)),
);

const mixedMode = await fetch(`${base}/render`, {
  method: 'POST',
  headers: { 'x-render-token': TOKEN },
  body: JSON.stringify({
    glb_base64: glb.toString('base64'),
    cameras: [exactCamera],
    width: 320,
    height: 180,
    size: 320,
  }),
});
check('camera mode rejects legacy square sizing before queueing', mixedMode.status === 400);

const unsupportedLight = await fetch(`${base}/render`, {
  method: 'POST',
  headers: { 'x-render-token': TOKEN },
  body: JSON.stringify({
    glb_base64: glb.toString('base64'),
    cameras: [exactCamera],
    width: 320,
    height: 180,
    lighting_preset_id: 'dramatic-night-v1',
  }),
});
check('camera mode rejects unsupported lighting identities', unsupportedLight.status === 400);

const overriddenBackground = await fetch(`${base}/render`, {
  method: 'POST',
  headers: { 'x-render-token': TOKEN },
  body: JSON.stringify({
    glb_base64: glb.toString('base64'),
    cameras: [exactCamera],
    width: 320,
    height: 180,
    background: '#000000',
  }),
});
check(
  'camera mode rejects background overrides that would falsify its profile',
  overriddenBackground.status === 400,
);

const tooMany = await fetch(`${base}/render`, {
  method: 'POST',
  headers: { 'x-render-token': TOKEN },
  body: JSON.stringify({
    glb_base64: glb.toString('base64'),
    views: Array.from({ length: MAX_VIEW_DIRS + 1 }, () => [1, 0, 0]),
  }),
});
const tooManyBody = await tooMany.json();
check(
  'an over-long views list is rejected, not truncated',
  tooMany.status === 400 && /maximum is 12/.test(tooManyBody.error ?? ''),
  tooManyBody.error,
);

const malformed = await fetch(`${base}/render`, {
  method: 'POST',
  headers: { 'x-render-token': TOKEN },
  body: JSON.stringify({ glb_base64: glb.toString('base64'), views: [['a', 'b', 'c']] }),
});
check(
  'a malformed view vector is rejected before it becomes a NaN camera',
  malformed.status === 400,
  `status ${malformed.status}`,
);

const threw = (v) => {
  try {
    validateViewDirs(v);
    return false;
  } catch {
    return true;
  }
};
check(
  'validateViewDirs defaults on undefined and on an empty list',
  validateViewDirs(undefined).length === 6 && validateViewDirs([]).length === 6,
);
check(
  'validateViewDirs returns a valid list unchanged (no truncation, no reorder)',
  JSON.stringify(validateViewDirs(nineDirs)) === JSON.stringify(nineDirs),
);
check(
  'validateViewDirs rejects the shapes that render as plausible nonsense',
  threw('nope') &&
    threw([[1, 0]]) &&
    threw([[1, 0, 0, 0]]) &&
    threw([[1, Number.NaN, 0]]) &&
    threw([[0, 0, 0]]) &&
    threw(Array.from({ length: MAX_VIEW_DIRS + 1 }, () => [1, 0, 0])),
);

// Device-loss policy. Real loss cannot be injected through Dawn's Node binding,
// so assert the decision itself; markGpuShutdown mutates module state, hence last.
const { shouldExitOnDeviceLost, markGpuShutdown } = await import('../src/gpu.mjs');
check('lost device exits the worker', shouldExitOnDeviceLost({ reason: 'unknown' }) === true);
check('our own destroy is not a fault', shouldExitOnDeviceLost({ reason: 'destroyed' }) === false);
markGpuShutdown();
check(
  'loss during shutdown is not a fault',
  shouldExitOnDeviceLost({ reason: 'unknown' }) === false,
);

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
