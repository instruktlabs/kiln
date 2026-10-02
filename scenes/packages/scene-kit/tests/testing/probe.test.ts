import { expect, test } from 'bun:test';
import { createRenderProbe, type ProbeOptions, type ProbeResult } from '../../src/testing/probe';
import { probeFixture as fixture, type ProbeFixture as Fixture } from './probe-fixture';

function run(f: Fixture, probe: ReturnType<typeof createRenderProbe>, options: ProbeOptions = {}): ProbeResult {
  let result: ProbeResult | null = null, error: unknown = null;
  probe.run(options, value => { result = value; }, value => { error = value; });
  for (let i = 0; i < 200 && !result && !error; i++) f.tick();
  if (error) throw error;
  if (!result) throw new Error('probe did not finish');
  return result;
}
const kind = (r: ProbeResult, k: string) => r.totals.byKind[k as keyof typeof r.totals.byKind];

test('groups draws by render context, waits for compiled pipelines and attributes by system and asset', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime);
  const r = run(f, probe, { frames: 4, stableFrames: 3, objects: 5 });
  expect(r.stable).toBe(true);
  expect(r.stableAfter).toBe(2); // frames 0 and 1 skipped the uncompiled house
  expect(r.notReady).toBe(0);
  expect(r.renders).toEqual([
    { label: '(root)', kind: 'main', depth: 0, parent: -1, camera: 'main' },
    { label: 'Shadow Map [ sun ]', kind: 'shadow', depth: 1, parent: 0, camera: 'OrthographicCamera' },
  ]);
  expect(r.passes.map(p => [p.id, p.kind, p.target, p.samples, p.draws, p.triangles, p.pipelines])).toEqual([
    [5, 'shadow', 'shadow-map', 1, 2, 512, 1], [3, 'main', 'framebuffer', 4, 3, 1512, 2], [4, 'output', 'canvas', 1, 1, 1, 1],
  ]);
  expect(r.totals).toEqual({ draws: 6, triangles: 2025, pipelinesUsed: 4, byKind: {
    shadow: { passes: 1, draws: 2, triangles: 512, pipelines: 1 }, main: { passes: 1, draws: 3, triangles: 1512, pipelines: 2 }, output: { passes: 1, draws: 1, triangles: 1, pipelines: 1 } } });
  expect(r.info.render.drawCalls).toBe(6);
  expect(r.bySystem).toEqual({
    heroes: { draws: 4, triangles: 1024, byKind: { shadow: { draws: 2, triangles: 512 }, main: { draws: 2, triangles: 512 } } },
    terrain: { draws: 1, triangles: 1000, byKind: { main: { draws: 1, triangles: 1000 } } },
    '(output)': { draws: 1, triangles: 1, byKind: { output: { draws: 1, triangles: 1 } } },
  });
  expect(r.byAsset.farmhouse).toEqual({ draws: 2, triangles: 1000, byKind: { shadow: { draws: 1, triangles: 500 }, main: { draws: 1, triangles: 500 } } });
  expect(r.byAsset.bolt?.draws).toBe(2);
  const main = r.passes.find(p => p.kind === 'main')!;
  expect(main.objects![0]).toEqual({ path: 'world/terrain/ground', system: 'terrain', asset: 'ground', draws: 1, triangles: 1000, castShadow: false, instances: 1, skinned: false, transparent: false });
  expect(r.pipelineCache).toBe(2);
  expect(r.drawingBuffer).toEqual({ width: 1920, height: 988, pixelRatio: 1 });
  expect(f.renderer.render).toBe(f.original.render);
  expect(f.renderer.backend.draw).toBe(f.original.draw);
  expect(f.renderer._pipelines.isReady).toBe(f.original.isReady);
  expect(f.systems.length).toBe(0);
});

test('what-ifs apply for the probe and restore afterwards', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime);
  const base = run(f, probe, { frames: 4 });
  const hidden = run(f, probe, { whatIf: { hide: ['heroes'] } });
  expect(f.heroes.visible).toBe(true);
  expect(hidden.whatIf).toEqual({ applied: { hide: ['heroes'] }, affected: { hidden: 1 } });
  expect([kind(hidden, 'main')?.draws, kind(hidden, 'shadow')]).toEqual([1, undefined]);
  const frozen = run(f, probe, { whatIf: { freezeShadows: true } });
  expect(kind(frozen, 'shadow')).toBeUndefined();
  expect(frozen.whatIf.affected).toEqual({ frozenLights: 1 });
  expect(f.sun.shadow.autoUpdate).toBe(true); // needsUpdate was re-armed and consumed by the frame that finished the probe
  const small = run(f, probe, { whatIf: { dropCasters: { triangles: 300 } } });
  expect(kind(small, 'shadow')?.draws).toBe(1);
  expect(small.whatIf.affected).toEqual({ casters: 2, dropped: 1, droppedInstanced: 0, droppedInstances: 1, droppedTriangles: 12 });
  expect(small.whatIf.dropped).toEqual([{ path: 'world/heroes/bolt', instances: 1, triangles: 12, texels: 2 * .01 / (88 / 2048) }]);
  expect(f.bolt.castShadow).toBe(true);
  const texels = run(f, probe, { whatIf: { dropCasters: { texels: 2 } } });
  expect(texels.whatIf.affected).toEqual({ casters: 2, dropped: 1, droppedInstanced: 0, droppedInstances: 1, droppedTriangles: 12, texelWorld: 88 / 2048 });
  const skipped = run(f, probe, { whatIf: { skipRenders: ['shadow'] } });
  expect(kind(skipped, 'shadow')).toBeUndefined();
  expect(skipped.whatIf.affected).toEqual({ skippedRenders: 1 });
  const again = run(f, probe, {});
  expect(again.totals).toEqual(base.totals);
});

test('hiding holds against a scene that writes visibility every frame, and keeps its last write for the restore', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime);
  let show = true;
  f.runtime.systems.add('scene-visibility', 50, () => { f.heroes.visible = show; });
  const hidden = run(f, probe, { whatIf: { hide: ['heroes'] } });
  expect(kind(hidden, 'main')?.draws).toBe(1);
  expect(f.heroes.visible).toBe(true);
  show = false; f.tick();
  expect([f.heroes.visible, Object.getOwnPropertyDescriptor(f.heroes, 'visible')?.writable]).toEqual([false, true]);
});

test('unknown systems fail the probe before anything changes; cancel restores without finishing', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime);
  expect(() => run(f, probe, { whatIf: { hide: ['nope'] } })).toThrow('Unknown probe system nope');
  expect(f.renderer.render).toBe(f.original.render);
  let finished = false;
  const cancel = probe.run({ whatIf: { hide: ['heroes'] } }, () => { finished = true; }, () => { finished = true; });
  f.tick(); f.tick();
  expect(f.heroes.visible).toBe(false);
  expect(() => probe.run({}, () => {}, () => {})).toThrow('A render probe is already running');
  cancel();
  expect([f.heroes.visible, finished, f.renderer.render === f.original.render, f.systems.length]).toEqual([true, false, true, 0]);
});

test('maxFrames ends an unsettled probe as unstable', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime);
  let n = 0;
  f.runtime.testHooks.probeSystems = undefined;
  const draw = f.renderer.backend.draw;
  f.renderer.backend.draw = (ro: any, info: any) => { draw(ro, info); if (ro.context.id === 3) info.render.triangles += n++; };
  const r = run(f, probe, { frames: 2, maxFrames: 6 });
  expect([r.stable, r.stableAfter, r.framesObserved]).toEqual([false, null, 6]);
  // Without a probeSystems hook, systems fall back to the two-level attribution path.
  expect(Object.keys(r.bySystem).sort()).toEqual(['(output)', 'world/heroes', 'world/terrain']);
});

test('scene summary counts meshes, casters and shadow lights by system', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime);
  expect(probe.sceneSummary()).toEqual({
    meshes: 3, visibleMeshes: 3, casters: 2, receivers: 3, instanced: 0, instances: 3, skinned: 0, transparent: 0, triangles: 1512,
    lights: [{ name: 'sun', type: 'DirectionalLight', castShadow: true, mapSize: [2048, 2048], autoUpdate: true, camera: { type: 'OrthographicCamera', left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 115 }, texelWorld: 88 / 2048 }],
    bySystem: {
      terrain: { meshes: 1, visibleMeshes: 1, casters: 0, instanced: 0, instances: 1, skinned: 0, transparent: 0, triangles: 1000 },
      heroes: { meshes: 2, visibleMeshes: 2, casters: 2, instanced: 0, instances: 2, skinned: 0, transparent: 0, triangles: 512 },
    },
  });
});

test('a probe that fails while installing restores what it changed and leaves the probe free', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime), pipelines = f.renderer._pipelines;
  delete f.renderer._pipelines;
  expect(() => probe.run({ whatIf: { hide: ['heroes'] } }, () => {}, () => {})).toThrow();
  expect([f.renderer.render === f.original.render, f.renderer.backend.draw === f.original.draw, f.heroes.visible, Object.getOwnPropertyDescriptor(f.heroes, 'visible')?.writable, f.systems.length])
    .toEqual([true, true, true, true, 0]);
  f.renderer._pipelines = pipelines;
  expect(run(f, probe, { frames: 4 }).stable).toBe(true);
});

test('two shadow maps sharing a render context stay separate passes, labelled and sized by their own render', () => {
  const f = fixture({ lamp: true }), r = run(f, createRenderProbe(f.runtime), { frames: 4 });
  expect(r.passes.filter(p => p.kind === 'shadow').map(p => [p.id, p.call, p.label, p.width, p.draws])).toEqual([[5, 1, 'Shadow Map [ sun ]', 2048, 2], [5, 2, 'Shadow Map [ lamp ]', 1024, 2]]);
  expect(kind(r, 'shadow')).toEqual({ passes: 2, draws: 4, triangles: 1024, pipelines: 1 });
});

test('the texel threshold sizes an instanced caster by its largest instance and drops every instance with it', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime), matrices = new Float32Array(64);
  // Four instances; the third is scaled 3x: 0.02 m × 3 over an 88/2048 m texel is 1.4 texels, still under 2.
  for (let i = 0; i < 4; i++) { const s = i === 2 ? 3 : 1; matrices.set([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, i, 0, 0, 1], i * 16); }
  Object.assign(f.bolt, { isInstancedMesh: true, count: 4, instanceMatrix: { array: matrices } });
  const small = run(f, probe, { whatIf: { dropCasters: { texels: 2 } } });
  expect(small.whatIf.affected).toEqual({ casters: 2, dropped: 1, droppedInstanced: 1, droppedInstances: 4, droppedTriangles: 48, texelWorld: 88 / 2048 });
  expect(small.whatIf.dropped?.map(d => [d.path, d.instances, d.triangles, +d.texels!.toFixed(3)])).toEqual([['world/heroes/bolt', 4, 48, +(.06 / (88 / 2048)).toFixed(3)]]);
  matrices.set([5, 0, 0, 0, 0, 5, 0, 0, 0, 0, 5, 0], 32); // 0.1 m at 2.3 texels: the batch keeps its shadow
  expect(run(f, probe, { whatIf: { dropCasters: { texels: 2 } } }).whatIf.affected).toEqual({ casters: 2, dropped: 0, droppedInstanced: 0, droppedInstances: 0, droppedTriangles: 0, texelWorld: 88 / 2048 });
  expect(f.bolt.castShadow).toBe(true);
});

test('asset names follow the loaded pack when it changes', () => {
  const f = fixture(), probe = createRenderProbe(f.runtime), packOf = (id: string) => ({ models: new Map([[id, { scene: { children: [{ isMesh: true, geometry: f.ground.geometry, children: [] }] } }]]) });
  f.runtime.pack = packOf('terrain-a');
  expect(run(f, probe, { frames: 4 }).byAsset['terrain-a']?.draws).toBe(1);
  f.runtime.pack = packOf('terrain-b');
  const r = run(f, probe, {});
  expect([r.byAsset['terrain-b']?.draws, r.byAsset['terrain-a']]).toEqual([1, undefined]);
});
