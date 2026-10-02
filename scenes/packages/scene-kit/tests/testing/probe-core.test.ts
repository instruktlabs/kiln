import { expect, test } from 'bun:test';
import { attributionPath, casterSize, classifyRender, classifyTarget, diffCounts, isSmallCaster, maxInstanceScale, passKinds, shadowTexelWorld, summarizeFrames, totalsByKind } from '../../src/testing/probe-core';

test('renders classify by three r186 nested scene names, then by depth', () => {
  expect(classifyRender('', 0)).toBe('main');
  expect(classifyRender('Farm', 0)).toBe('main');
  expect(classifyRender('Shadow Map [ sun ]', 1)).toBe('shadow');
  expect(classifyRender('Shadow Map [ ID: 547 ]', 2)).toBe('shadow');
  expect(classifyRender('Point Light Shadow [ lamp ] - Face 3', 1)).toBe('shadow');
  expect(classifyRender('Scene [ Reflector ]', 1)).toBe('reflection');
  expect(classifyRender('water [ Reflector ]', 1)).toBe('reflection');
  expect(classifyRender('PMREM', 1)).toBe('offscreen');
  // A depth-0 render of another scene (an environment bake from a system) is not the main pass.
  expect(classifyRender('environment', 0, false)).toBe('offscreen');
  expect(classifyRender('Shadow Map [ sun ]', 0, false)).toBe('shadow');
});

test('targets classify as canvas, frame buffer, shadow map or sized render target', () => {
  const map = { width: 2048, height: 2048 }, maps = new Set([map]);
  expect(classifyTarget(null, maps)).toBe('canvas');
  expect(classifyTarget(undefined, maps)).toBe('canvas');
  expect(classifyTarget({ width: 1920, height: 988, isPostProcessingRenderTarget: true }, maps)).toBe('framebuffer');
  expect(classifyTarget(map, maps)).toBe('shadow-map');
  expect(classifyTarget({ width: 960, height: 494 }, maps)).toBe('rt 960x494');
});

test('attribution path names ancestors from the root down, skipping unnamed nodes', () => {
  const root = { name: '', parent: null } as any;
  const world = { name: 'golden-gate-world', parent: root }, bridge = { name: 'bridge', parent: world }, unnamed = { name: '', parent: bridge };
  const scene = { name: 'Golden_Gate_Bridge', parent: unnamed }, mesh = { name: 'Paint_12', parent: scene };
  expect(attributionPath(mesh, root)).toBe('golden-gate-world/bridge/Golden_Gate_Bridge');
  expect(attributionPath(mesh, root, 2)).toBe('golden-gate-world/bridge');
  expect(attributionPath(mesh, root, 9)).toBe('golden-gate-world/bridge/Golden_Gate_Bridge/Paint_12');
  expect(attributionPath({ name: '', parent: root }, root)).toBe('(unnamed)');
  expect(attributionPath({ name: 'loose', parent: null }, root)).toBe('(detached)/loose');
});

test('caster size uses index or position triangles and the shadow texel', () => {
  const sphere = (radius: number) => ({ radius });
  const indexed = { geometry: { index: { count: 900 }, attributes: { position: { count: 400 } }, boundingSphere: sphere(.5) }, matrixWorld: { getMaxScaleOnAxis: () => 2 } };
  const soup = { geometry: { index: null, attributes: { position: { count: 300 } }, boundingSphere: sphere(.01) }, matrixWorld: { getMaxScaleOnAxis: () => 1 } };
  // diameter 2·0.5·2 = 2 m over a 0.5 m texel = 4 texels
  expect(casterSize(indexed, .5)).toEqual({ triangles: 300, texels: 4 });
  expect(casterSize(soup, .5)).toEqual({ triangles: 100, texels: .04 });
  expect(casterSize(soup, null)).toEqual({ triangles: 100, texels: null });
  expect(isSmallCaster(indexed, { triangles: 300 })).toBe(false);
  expect(isSmallCaster(indexed, { triangles: 301 })).toBe(true);
  expect(isSmallCaster(indexed, { texels: 4, texelWorld: .5 })).toBe(false);
  expect(isSmallCaster(indexed, { texels: 4.5, texelWorld: .5 })).toBe(true);
  expect(isSmallCaster(soup, { texels: 2 })).toBe(false); // no texel size: never small by texels
  expect(isSmallCaster(soup, {})).toBe(false);
  let computed = 0;
  const lazy = { geometry: { index: null, attributes: { position: { count: 3 } }, boundingSphere: null as { radius: number } | null, computeBoundingSphere() { computed++; this.boundingSphere = sphere(1); } }, matrixWorld: { getMaxScaleOnAxis: () => 1 } };
  expect(casterSize(lazy, 1)).toEqual({ triangles: 1, texels: 2 });
  expect(computed).toBe(1);
});

test('an instanced caster is sized by its largest instance within count', () => {
  const scaled = (...scales: number[]) => { const a = new Float32Array(scales.length * 16); scales.forEach((s, i) => a.set([s, 0, 0, 0, 0, s * .5, 0, 0, 0, 0, s, 0, i, i, i, 1], i * 16)); return a; };
  const batch = { geometry: { index: null, attributes: { position: { count: 3 } }, boundingSphere: { radius: .5 } }, matrixWorld: { getMaxScaleOnAxis: () => 2 }, isInstancedMesh: true, count: 2, instanceMatrix: { array: scaled(1, 3, 10) } };
  expect(maxInstanceScale(batch)).toBe(3); // the third matrix is past count
  expect(casterSize(batch, .5)).toEqual({ triangles: 1, texels: 2 * .5 * 2 * 3 / .5 });
  expect(maxInstanceScale({ isInstancedMesh: true, count: 0, instanceMatrix: { array: scaled(4) } })).toBe(1);
  expect(maxInstanceScale({})).toBe(1);
});

test('orthographic shadow texel is frustum width over map width; perspective shadows have none', () => {
  expect(shadowTexelWorld({ camera: { isOrthographicCamera: true, left: -44, right: 44 }, mapSize: { x: 2048 } })).toBeCloseTo(88 / 2048, 12);
  expect(shadowTexelWorld({ camera: { isPerspectiveCamera: true }, mapSize: { x: 1024 } })).toBeNull();
  expect(shadowTexelWorld(undefined)).toBeNull();
});

test('frame summaries report identical, trailing-stable and the settled frame', () => {
  expect(summarizeFrames([])).toEqual({ stable: false, identical: false, stableAfter: null, frame: null });
  expect(summarizeFrames([{ d: 1 }, { d: 1 }, { d: 1 }])).toEqual({ stable: true, identical: true, stableAfter: 0, frame: { d: 1 } });
  expect(summarizeFrames([{ d: 3 }, { d: 5 }, { d: 5 }, { d: 5 }])).toEqual({ stable: true, identical: false, stableAfter: 1, frame: { d: 5 } });
  expect(summarizeFrames([{ d: 3 }, { d: 5 }, { d: 5 }])).toEqual({ stable: false, identical: false, stableAfter: null, frame: { d: 5 } });
  expect(summarizeFrames([{ d: 3 }, { d: 5 }, { d: 5 }], { stableFrames: 2 }).stableAfter).toBe(1);
  expect(summarizeFrames([{ d: 1, t: 9 }, { d: 1, t: 8 }], { stableFrames: 2, key: f => String(f.d) }).stable).toBe(true);
});

test('count diffs subtract numeric leaves, treating a missing side as zero', () => {
  const base = { draws: 583, triangles: 2.3e6, byKind: { main: { draws: 313 }, shadow: { draws: 270 } }, label: 'base', list: [1, 2] };
  const variant = { draws: 313, triangles: 2.1e6, byKind: { main: { draws: 313 } }, label: 'variant', list: [9] };
  expect(diffCounts(base, variant)).toEqual({ draws: -270, triangles: -2e5, byKind: { main: { draws: 0 }, shadow: { draws: -270 } } });
  expect(diffCounts({ a: 1 }, { a: 1, b: { c: 4 } })).toEqual({ a: 0, b: { c: 4 } });
});

test('pass kinds mark the canvas pass of a framebuffer render as output', () => {
  const passes = [
    { render: 'main', target: 'framebuffer' }, { render: 'shadow', target: 'shadow-map' }, { render: 'reflection', target: 'rt 960x494' }, { render: 'main', target: 'canvas' },
  ] as const;
  expect(passKinds(passes)).toEqual(['main', 'shadow', 'reflection', 'output']);
  // Without a frame-buffer target the scene draws straight to the canvas: that pass is the main pass.
  expect(passKinds([{ render: 'main', target: 'canvas' }])).toEqual(['main']);
  expect(passKinds([{ render: 'offscreen', target: 'rt 256x256' }])).toEqual(['offscreen']);
});

test('totals by kind sum draws and triangles and union pipelines', () => {
  const a = {}, b = {}, c = {};
  const totals = totalsByKind([
    { kind: 'main', draws: 10, triangles: 100, pipelines: new Set([a, b]) },
    { kind: 'main', draws: 1, triangles: 2, pipelines: new Set([b]) },
    { kind: 'shadow', draws: 5, triangles: 50, pipelines: new Set([c]) },
  ]);
  expect(totals).toEqual({
    draws: 16, triangles: 152, pipelinesUsed: 3,
    byKind: { main: { passes: 2, draws: 11, triangles: 102, pipelines: 2 }, shadow: { passes: 1, draws: 5, triangles: 50, pipelines: 1 } },
  });
});
