// Fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md item 7, KIT-REQUESTS FARM-008): program and pipeline creation
// and buffer uploads at scene start on both backends, counted as the Farm's hitch runner counts them
// (scripts/run-farm-hitches.ts) but without any timing: counts and bytes only. The test build is served on an owned
// port; each backend and tier gets a fresh page at 1920 x 1080 whose WebGL2 and WebGPU calls are wrapped before any
// page script. Phases: load (navigation to ready), start (the first 120 frames after ready at the postcard), tour
// (the ten named cameras, then the vegetation poses beside each approach, 30 frames each: whatever first comes into
// view compiles here), steady (120 frames back at the postcard: uploads per frame). A program or WGSL module counts
// as per mesh when its vertex stage declares an array of mat4 in a NodeBuffer uniform block, three 0.186.0's
// matrices of an instanced mesh with at most 1,024 instances (FARM-008). The tour records each lazy creation's
// WebGPU pipeline label (three's material name and id) or WebGL2 vertex shader length.
//   ./scripts/toolchain-run.ps1 x bun packages/golden-gate/tests/tools/compile-counts.ts
// Writes evidence/build/compile-counts.json.
import { resolve } from 'node:path';
import { outputFor } from './build.ts';
import { PACKAGE_ROOT, assertOwnedUrl, launchHeadless, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned.ts';

/** Installed before any page script: wrappers count calls and bytes (no clock is read) and keep the caller's arguments. */
function instrument() {
  const w = window as any, h: any = w.__compileCounts = { phase: 'load', c: {}, frames: [], frame: null, lazy: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const add = (k: string, n = 1) => { const key = `${h.phase}.${k}`; h.c[key] = (h.c[key] ?? 0) + n; if (h.frame) h.frame[k] = (h.frame[k] ?? 0) + n; };
  const bytesOf = (data: any, offset: any, length: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (typeof data === 'number') return data;
    if (!data || typeof data.byteLength !== 'number') return 0;
    const per = data.BYTES_PER_ELEMENT ?? 1;
    return typeof length === 'number' && length > 0 ? length * per : data.byteLength - (typeof offset === 'number' ? offset * per : 0);
  };
  const wrap = (proto: any, names: string[], fn: (args: any[]) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const name of names) {
      const original = proto?.[name]; if (typeof original !== 'function') continue;
      proto[name] = function (this: unknown) { fn(Array.prototype.slice.call(arguments)); return original.apply(this, arguments as never); };
    }
  };
  const PER_MESH_GLSL = /uniform\s+NodeBuffer_\w+\s*\{\s*mat4\s+\w+\s*\[\s*\d+\s*\]/, PER_MESH_WGSL = /NodeBuffer_\w+[\s\S]{0,200}?array\s*<\s*mat4x4\s*<\s*f32\s*>\s*,\s*\d+\s*>/;
  const touring = () => String(h.phase).startsWith('tour');
  const gl = w.WebGL2RenderingContext?.prototype;
  if (gl) {
    const sources = new WeakMap<object, string>(), attached = new WeakMap<object, object[]>();
    wrap(gl, ['shaderSource'], a => sources.set(a[0], a[1]));
    wrap(gl, ['attachShader'], a => { const list = attached.get(a[0]) ?? []; list.push(a[1]); attached.set(a[0], list); });
    wrap(gl, ['compileShader'], () => add('compileShader'));
    wrap(gl, ['linkProgram'], a => {
      add('linkProgram');
      const vs = (attached.get(a[0]) ?? []).map(s => sources.get(s) ?? '').find(t => t.includes('gl_Position')) ?? '';
      if (PER_MESH_GLSL.test(vs)) add('perMesh');
      if (touring()) h.lazy.push({ phase: h.phase, vertexShaderLength: vs.length });
    });
    wrap(gl, ['bufferData'], a => { add('uploadCalls'); add('uploadBytes', bytesOf(a[1], a[3], a[4])); });
    wrap(gl, ['bufferSubData'], a => { add('uploadCalls'); add('uploadBytes', bytesOf(a[2], a[3], a[4])); });
    wrap(gl, ['texImage2D', 'texImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexImage3D', 'texSubImage2D', 'texSubImage3D', 'compressedTexSubImage2D', 'compressedTexSubImage3D', 'generateMipmap'], () => add('textureCalls'));
    wrap(gl, ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements'], () => add('draws'));
  }
  const device = w.GPUDevice?.prototype, queue = w.GPUQueue?.prototype;
  if (device) {
    wrap(device, ['createShaderModule'], a => { add('shaderModule'); if (PER_MESH_WGSL.test(String(a[0]?.code ?? ''))) add('perMesh'); });
    wrap(device, ['createRenderPipeline', 'createRenderPipelineAsync'], a => { add('renderPipeline'); if (touring()) h.lazy.push({ phase: h.phase, label: String(a[0]?.label ?? '') }); });
    wrap(device, ['createComputePipeline', 'createComputePipelineAsync'], () => add('computePipeline'));
  }
  if (queue) {
    wrap(queue, ['writeBuffer'], a => { add('uploadCalls'); add('uploadBytes', bytesOf(a[2], a[3], a[4])); });
    wrap(queue, ['writeTexture', 'copyExternalImageToTexture'], () => add('textureCalls'));
    wrap(queue, ['submit'], () => add('submits'));
  }
  // Frame boundaries: this callback is registered before the scene's, so a frame's calls fall between two ticks.
  const tick = () => { if (h.frame && h.phase !== 'load') h.frames.push({ phase: h.phase, ...h.frame }); h.frame = {}; w.requestAnimationFrame(tick); };
  w.requestAnimationFrame(tick);
}

const VIEWS = ['postcard', 'pier', 'topdown', 'horizon', 'deck', 'tower', 'span', 'lanes', 'sidewalk', 'traffic'];
// The vegetation beside each approach (item 5): the driver's eye in the Presidio forest (south approach s 480) and
// toward the headland scrub (north approach s 250).
const VEGETATION_POSES = {
  'vegetation-south': { position: [-170.01, 55.25, -1470.79], target: [-304.66, 56.75, -1644.87], fov: 55 },
  'vegetation-north': { position: [1.41, 69.68, 1283.76], target: [70.25, 77.21, 1338.54], fov: 55 },
};
const CREATION = { webgpu: ['shaderModule', 'renderPipeline', 'computePipeline', 'perMesh'], webgl2: ['compileShader', 'linkProgram', 'perMesh'] } as const;

const hosted = await serveOwned(outputFor('test')), owned = new Set([hosted.port]);
const chrome = await launchHeadless('gg-compile-counts', 1920, 1080), runs: unknown[] = [];
try {
  for (const backend of ['webgpu', 'webgl2'] as const) for (const tier of ['high', 'economy']) {
    const page = await chrome.browser.newPage(), messages: ConsoleRecord[] = [];
    page.on('console', m => messages.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 600) }));
    page.on('pageerror', e => messages.push({ kind: 'pageerror', text: String(e).slice(0, 1200) }));
    try {
      await page.evaluateOnNewDocument(instrument);
      const url = `${hosted.url}/?hud=0&tier=${tier}&cam=postcard${backend === 'webgl2' ? '&backend=webgl2' : ''}`; assertOwnedUrl(url, owned);
      await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForFunction(() => { const s = (window as any).__kilnHarness?.snapshot(); return s && (s.readyCount > 0 || s.errors.length > 0); }, { timeout: 180_000 }); // eslint-disable-line @typescript-eslint/no-explicit-any
      const phase = (p: string) => page.evaluate(q => { (window as any).__compileCounts.phase = q; }, p); // eslint-disable-line @typescript-eslint/no-explicit-any
      const frames = (n: number) => page.evaluate(k => (window as any).__kilnScene.waitFrames(k), n); // eslint-disable-line @typescript-eslint/no-explicit-any
      const invoke = (name: string, arg: unknown) => page.evaluate(([n, a]) => (window as any).__kilnScene.invoke(n, a), [name, arg] as const); // eslint-disable-line @typescript-eslint/no-explicit-any
      await phase('start'); await frames(120);
      for (const view of VIEWS) { await phase(`tour:${view}`); await invoke('setView', view); await frames(30); }
      for (const [name, pose] of Object.entries(VEGETATION_POSES)) { await phase(`tour:${name}`); await invoke('setPose', pose); await frames(30); }
      await phase('tour:postcard-again'); await invoke('setView', 'postcard'); await frames(30);
      await phase('steady'); await frames(120);
      const r = await page.evaluate(() => { const h = (window as any).__compileCounts; return { c: h.c as Record<string, number>, frames: h.frames as Record<string, number | string>[], lazy: h.lazy as unknown[] }; }); // eslint-disable-line @typescript-eslint/no-explicit-any
      const stats = await invoke('ggStats', undefined) as { tier: string; knobs: { feature: string } };
      const pick = (p: string) => Object.fromEntries(CREATION[backend].map(k => [k, r.c[`${p}.${k}`] ?? 0]));
      const tourKeys = Object.keys(r.c).filter(k => k.startsWith('tour:') && CREATION[backend].some(c => k.endsWith(`.${c}`)));
      const steady = r.frames.filter(f => f.phase === 'steady'), stat = (k: string) => { const v = steady.map(f => Number(f[k] ?? 0)).sort((a, b) => a - b); return { median: v[Math.floor(v.length / 2)] ?? 0, max: v[v.length - 1] ?? 0 }; };
      runs.push({
        backend, tier: stats.tier, feature: stats.knobs.feature, load: pick('load'), start: pick('start'),
        tour: { total: Object.fromEntries(CREATION[backend].map(k => [k, tourKeys.filter(t => t.endsWith(`.${k}`)).reduce((s, t) => s + r.c[t]!, 0)])), byView: Object.fromEntries(tourKeys.map(k => [k.slice(5), r.c[k]])), lazy: r.lazy },
        steady: { frames: steady.length, uploadCalls: stat('uploadCalls'), uploadBytes: stat('uploadBytes'), textureCalls: stat('textureCalls'), draws: stat('draws'), submits: stat('submits'), creations: pick('steady') },
        unexpected: unexpectedMessages(messages),
      });
      console.log(JSON.stringify({ backend, tier, load: pick('load'), tour: tourKeys.map(k => `${k.slice(5)}=${r.c[k]}`).join(' '), steadyUploads: stat('uploadCalls'), steadyBytes: stat('uploadBytes'), unexpected: unexpectedMessages(messages).length }));
    } finally { await page.close(); }
  }
} finally { await chrome.close(); await hosted.close(); }
writeJson(resolve(PACKAGE_ROOT, 'evidence/build/compile-counts.json'), {
  description: 'Fix round 3 item 7 (FARM-008): program and pipeline creation and buffer uploads on the test build, counts and bytes only (no timing), per backend and tier at 1920 x 1080. load: navigation to ready; start: the first 120 frames after ready at the postcard; tour: the ten named cameras and the two vegetation poses, 30 frames each (lazy: each creation there, by WebGPU pipeline label or WebGL2 vertex shader length); steady: 120 frames at the postcard, uploads (WebGPU writeBuffer, WebGL2 bufferData and bufferSubData) per frame; draws are WebGL2 draw calls (WebGPU render pass draws are not wrapped). perMesh: programs or shader modules whose vertex stage keeps an instanced mesh\'s matrices in its own NodeBuffer uniform block (three 0.186.0, FARM-008).',
  runs,
});
