// Test/dev count probe (installTestHooks only; public builds drop it). Wraps the instance `renderer.render` (nested
// shadow and reflection renders re-enter through it), `backend.draw` (renderer.info deltas per RenderContext) and
// `_pipelines.isReady` (draws skipped while a pipeline compiles), records one frame at a time and stops once K frames
// agree. What-ifs are count-only, applied for one probe and always restored, also when installing the probe fails.
// A pass record is one RenderContext within one render call: three keys contexts by attachment format, MRT and call
// depth (RenderContexts.js:41-67), so two same-format renders at one depth (two shadow maps) share a context id.
import { attributionPath, casterSize, classifyRender, classifyTarget, isSmallCaster, passKinds, shadowTexelWorld, summarizeFrames, totalsByKind } from './probe-core';
import type { KindTotals, PassKind, RenderKind } from './probe-core';
/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;
export interface ProbeWhatIf { hide?: string[]; freezeShadows?: boolean; skipRenders?: RenderKind[]; dropCasters?: { triangles?: number; texels?: number } }
export interface ProbeOptions { frames?: number; maxFrames?: number; stableFrames?: number; whatIf?: ProbeWhatIf; objects?: number }
export interface ProbeRuntime {
  renderer: any; state: { scene: Node; camera: Node } | null; clock: { frame: number }; pack: { models: Map<string, { scene: Node }> } | null;
  testHooks: Record<string, ((...args: any[]) => unknown) | undefined>; systems: { add(name: string, order: number, fn: () => void): () => void };
}
interface Tally { draws: number; triangles: number; byKind: Partial<Record<PassKind, { draws: number; triangles: number }>> }
export interface ProbeObject { path: string; system: string; asset: string; draws: number; triangles: number; castShadow: boolean; instances: number; skinned: boolean; transparent: boolean }
/** `call` indexes `renders`: the render call that drew the pass. */
export interface ProbePass { id: number; call: number; kind: PassKind; label: string; target: string; width: number; height: number; samples: number; draws: number; triangles: number; pipelines: number; bySystem: Record<string, { draws: number; triangles: number }>; byAsset: Record<string, { draws: number; triangles: number }>; objects?: ProbeObject[] }
export interface ProbeResult {
  frame: number; stable: boolean; stableAfter: number | null; framesObserved: number; notReady: number;
  renders: { label: string; kind: RenderKind; depth: number; parent: number; camera: string }[];
  passes: ProbePass[]; totals: { draws: number; triangles: number; pipelinesUsed: number; byKind: Partial<Record<PassKind, KindTotals>> };
  bySystem: Record<string, Tally>; byAsset: Record<string, Tally>;
  info: { render: Record<string, number>; memory: Record<string, number> }; pipelineCache: number; programs: number;
  drawingBuffer: { width: number; height: number; pixelRatio: number }; whatIf: { applied: ProbeWhatIf; affected: Record<string, number>; dropped?: DroppedCaster[] };
}
/** A caster the small-caster what-if dropped (the first 64 are listed; `affected` counts all): an InstancedMesh drops every instance, and `triangles` covers them all. */
export interface DroppedCaster { path: string; instances: number; triangles: number; texels: number | null }
const DROPPED_LISTED = 64;
interface PassRecord { id: number; call: number; render: RenderKind; label: string; target: string; width: number; height: number; samples: number; draws: number; triangles: number; pipelines: Set<unknown>; objects: Map<Node, { draws: number; triangles: number }> }
interface FrameRecord { frame: number; renders: ProbeResult['renders']; passes: Map<string, PassRecord>; notReady: number; skipped: number; info: Record<string, number> | null }

function walk(root: Node, fn: (node: Node) => void, visibleOnly = false): void {
  const stack = [root];
  while (stack.length) { const node = stack.pop(); if (!node || (visibleOnly && !node.visible)) continue; fn(node); for (let i = node.children?.length - 1; i >= 0; i--) stack.push(node.children[i]); }
}
const triangles = (mesh: Node) => Math.floor((mesh.geometry?.index ? mesh.geometry.index.count : mesh.geometry?.attributes?.position?.count ?? 0) / 3);
const instances = (mesh: Node) => mesh.isInstancedMesh ? mesh.count : mesh.geometry?.isInstancedBufferGeometry ? mesh.geometry.instanceCount ?? 0 : 1;
const transparent = (mesh: Node) => Array.isArray(mesh.material) ? mesh.material.some((m: Node) => m?.transparent) : !!mesh.material?.transparent;
/** Replaces an own or inherited method for the probe; the returned function puts back exactly what was there. */
function patch(target: any, key: string, make: (previous: any) => any): () => void {
  const own = Object.hasOwn(target, key), previous = target[key];
  target[key] = make(previous);
  return () => { if (own) target[key] = previous; else delete target[key]; };
}
const add = (tally: Record<string, Tally>, name: string, kind: PassKind, draws: number, tris: number) => {
  const t = tally[name] ??= { draws: 0, triangles: 0, byKind: {} }, k = t.byKind[kind] ??= { draws: 0, triangles: 0 };
  t.draws += draws; t.triangles += tris; k.draws += draws; k.triangles += tris;
};

export function createRenderProbe(runtime: ProbeRuntime) {
  let active = false, assetGeometry: { pack: unknown; map: Map<unknown, string> } | null = null;
  const scene = () => { const s = runtime.state?.scene; if (!s) throw new Error('Render probe needs a mounted scene'); return s; };
  const lights = () => { const out: Node[] = []; walk(scene(), node => { if (node.isLight && node.shadow) out.push(node); }); return out; };
  const systemRoots = (): Map<Node, string> | null => {
    const hook = runtime.testHooks.probeSystems;if (!hook) return null;
    const map = new Map<Node, string>();
    for (const [name, value] of Object.entries((hook() ?? {}) as Record<string, Node>)) for (const root of Array.isArray(value) ? value : [value]) if (root) map.set(root, name);
    return map;
  };
  const resolver = (systems: Map<Node, string> | null) => {
    const root = scene(), seen = new Map<Node, string>(), named = new Map<Node, string>();
    const system = (o: Node): string => {
      let s = seen.get(o);
      if (s === undefined) {
        if (systems) { let node = o; s = '(unattributed)'; while (node) { const hit = systems.get(node); if (hit) { s = hit; break; } node = node.parent; } }
        else s = attributionPath(o, root, 2);
        seen.set(o, s);
      }
      return s;
    };
    const models = () => {
      if (assetGeometry?.pack !== runtime.pack) { const map = new Map<unknown, string>(); for (const [id, model] of runtime.pack?.models ?? []) walk(model.scene, node => { if (node.isMesh) map.set(node.geometry, id); }); assetGeometry = { pack: runtime.pack, map }; }
      return assetGeometry!.map;
    };
    const asset = (o: Node): string => {
      const known = named.get(o);if (known !== undefined) return known;
      const hooked = runtime.testHooks.probeAsset?.(o);
      const a: string = typeof hooked === 'string' ? hooked : models().get(o.geometry) ?? (o.name || attributionPath(o, root, 8));
      named.set(o, a);return a;
    };
    return { system, asset };
  };
  const signature = (f: FrameRecord) => [...f.passes.values()].map(p => `${p.render}|${p.target}|${p.draws}|${p.triangles}`).join(';') + `;nr${f.notReady}`;

  function applyWhatIf(whatIf: ProbeWhatIf, systems: Map<Node, string> | null, affected: Record<string, number>, dropped: DroppedCaster[]): (() => void)[] {
    const undo: (() => void)[] = [];
    try { applyInto(whatIf, systems, affected, dropped, undo); } catch (error) { for (const step of undo.reverse()) step(); throw error; }
    return undo;
  }
  function applyInto(whatIf: ProbeWhatIf, systems: Map<Node, string> | null, affected: Record<string, number>, dropped: DroppedCaster[], undo: (() => void)[]): void {
    if (whatIf.hide?.length) {
      const named = new Map<string, Node[]>();
      for (const [root, name] of systems ?? []) named.set(name, [...named.get(name) ?? [], root]);
      for (const name of whatIf.hide) if (!named.has(name)) throw new Error(`Unknown probe system ${name}`);
      affected.hidden = 0;
      // Scenes that write visibility every frame (Foundry's entity sets) cannot undo the hide: `visible` reads false for
      // the probe while writes are kept, and the last write is restored as a plain property.
      for (const name of whatIf.hide) for (const root of named.get(name)!) {
        let kept = root.visible;
        Object.defineProperty(root, 'visible', { configurable: true, enumerable: true, get: () => false, set: (value: boolean) => { kept = value; } });
        affected.hidden++; undo.push(() => { delete root.visible; root.visible = kept; });
      }
    }
    if (whatIf.freezeShadows) {
      affected.frozenLights = 0;
      for (const light of lights()) if (light.castShadow) {
        const s = light.shadow, was = s.autoUpdate; s.autoUpdate = false; s.needsUpdate = false; affected.frozenLights++;
        undo.push(() => { s.autoUpdate = was; s.needsUpdate = true; });
      }
    }
    if (whatIf.dropCasters) {
      const texelWorld = shadowTexelWorld(lights().find(l => l.castShadow)?.shadow);
      Object.assign(affected, { casters: 0, dropped: 0, droppedInstanced: 0, droppedInstances: 0, droppedTriangles: 0 });
      if (whatIf.dropCasters.texels !== undefined) affected.texelWorld = texelWorld ?? 0;
      walk(scene(), node => {
        if (!node.isMesh || !node.castShadow) return;
        affected.casters!++;
        if (!isSmallCaster(node, { ...whatIf.dropCasters, texelWorld })) return;
        const n = instances(node), tris = triangles(node) * n;
        node.castShadow = false; affected.dropped!++; affected.droppedInstances! += n; affected.droppedTriangles! += tris;
        if (node.isInstancedMesh || node.geometry?.isInstancedBufferGeometry) affected.droppedInstanced!++;
        if (dropped.length < DROPPED_LISTED) dropped.push({ path: attributionPath(node, scene(), 8), instances: n, triangles: tris, texels: casterSize(node, texelWorld).texels });
        undo.push(() => { node.castShadow = true; });
      }, true);
    }
  }

  /** Starts a probe; `done` or `fail` is called once from the system loop. Returns a cancel that restores without finishing. */
  function run(options: ProbeOptions, done: (result: ProbeResult) => void, fail: (error: Error) => void): () => void {
    if (active) throw new Error('A render probe is already running');
    const renderer = runtime.renderer;if (!renderer) throw new Error('Render probe needs a renderer');
    const frames = options.frames ?? 8, maxFrames = options.maxFrames ?? 600, stableFrames = options.stableFrames ?? 3, whatIf = options.whatIf ?? {};
    const systems = systemRoots(), affected: Record<string, number> = {}, dropped: DroppedCaster[] = [], skip = new Set(whatIf.skipRenders ?? []);
    const undo = applyWhatIf(whatIf, systems, affected, dropped);
    const stack: { kind: RenderKind; index: number }[] = [], signatures: string[] = [], restores: (() => void)[] = [];
    let cur: FrameRecord | null = null, last: FrameRecord | null = null, observed = 0, finished = false, shadowLights: Node[] = [];
    // Removes the system and the patches, then undoes the what-if, in reverse: on finish, on cancel and on a failed install.
    const cleanup = () => { finished = true; active = false; for (const restore of restores.splice(0).reverse()) restore(); for (const step of undo.splice(0).reverse()) step(); };
    try {
      shadowLights = lights();
      restores.push(patch(renderer, 'render', previous => function (this: unknown, ...args: any[]) {
        const s = args[0], depth = stack.length, kind = classifyRender(s?.name ?? '', depth, s === runtime.state?.scene);
        if (depth > 0 && skip.has(kind)) { if (cur) cur.skipped++; return undefined; }
        let index = -1;
        if (cur) { index = cur.renders.length; cur.renders.push({ label: s?.name || '(root)', kind, depth, parent: stack.at(-1)?.index ?? -1, camera: args[1] === runtime.state?.camera ? 'main' : args[1]?.type ?? 'camera' }); }
        stack.push({ kind, index });
        try { return previous.apply(this, args); }
        finally { stack.pop(); if (!stack.length && cur) { const r = renderer.info?.render; if (r) cur.info = { calls: r.calls, drawCalls: r.drawCalls, triangles: r.triangles, frame: renderer.info.frame }; } }
      }));
      restores.push(patch(renderer.backend, 'draw', previous => function (this: unknown, ro: any, info: any) {
        const d0 = info.render.drawCalls, t0 = info.render.triangles, result = previous.call(this, ro, info);
        if (cur) {
          const ctx = ro.context, top = stack.at(-1), call = top?.index ?? -1, key = `${ctx.id}|${call}`;let p = cur.passes.get(key);
          if (!p) {
            const maps = new Set(shadowLights.map(l => l.shadow.map).filter(Boolean));
            p = { id: ctx.id, call, render: top?.kind ?? 'offscreen', label: top && cur.renders[top.index]?.label || '?', target: classifyTarget(ctx.renderTarget, maps), width: ctx.width, height: ctx.height, samples: ctx.sampleCount ?? 1, draws: 0, triangles: 0, pipelines: new Set(), objects: new Map() };
            cur.passes.set(key, p);
          }
          const dd = info.render.drawCalls - d0, dt = info.render.triangles - t0, o = p.objects.get(ro.object) ?? { draws: 0, triangles: 0 };
          p.draws += dd; p.triangles += dt; p.pipelines.add(ro.pipeline); o.draws += dd; o.triangles += dt; p.objects.set(ro.object, o);
        }
        return result;
      }));
      restores.push(patch(renderer._pipelines, 'isReady', previous => function (this: unknown, ro: any) { const ok = previous.call(this, ro); if (!ok && cur) cur.notReady++; return ok; }));
      restores.push(runtime.systems.add('kiln-render-probe', 10001, () => {
        if (finished) return;
        try {
          if (cur) {
            signatures.push(signature(cur)); last = cur; observed++;
            const s = summarizeFrames(signatures, { stableFrames, key: x => x });
            if ((observed >= frames && s.stable && cur.notReady === 0) || observed >= maxFrames) {
              const result = build(last, s.stable && cur.notReady === 0, s.stable ? s.stableAfter : null, observed);
              cleanup(); done(result); return;
            }
          }
          cur = { frame: runtime.clock.frame, renders: [], passes: new Map(), notReady: 0, skipped: 0, info: null };
        } catch (error) { cleanup(); fail(error as Error); }
      }));
    } catch (error) { cleanup(); throw error; }
    active = true;

    function build(f: FrameRecord, stable: boolean, stableAfter: number | null, framesObserved: number): ProbeResult {
      const names = resolver(systems), list = [...f.passes.values()], kinds = passKinds(list.map(p => ({ render: p.render, target: p.target })));
      const bySystem: Record<string, Tally> = {}, byAsset: Record<string, Tally> = {};
      const passes = list.map((p, i): ProbePass => {
        const kind = kinds[i]!, sys: Record<string, { draws: number; triangles: number }> = {}, assets: Record<string, { draws: number; triangles: number }> = {}, objects: ProbeObject[] = [];
        for (const [o, n] of p.objects) {
          const system = kind === 'output' ? '(output)' : names.system(o), asset = kind === 'output' ? '(output)' : names.asset(o);
          (sys[system] ??= { draws: 0, triangles: 0 }).draws += n.draws; sys[system]!.triangles += n.triangles;
          (assets[asset] ??= { draws: 0, triangles: 0 }).draws += n.draws; assets[asset]!.triangles += n.triangles;
          add(bySystem, system, kind, n.draws, n.triangles); add(byAsset, asset, kind, n.draws, n.triangles);
          if (options.objects) objects.push({ path: attributionPath(o, runtime.state?.scene ?? null, 8), system, asset, draws: n.draws, triangles: n.triangles, castShadow: !!o.castShadow, instances: instances(o), skinned: !!o.isSkinnedMesh, transparent: transparent(o) });
        }
        objects.sort((a, b) => b.draws - a.draws || b.triangles - a.triangles);
        return { id: p.id, call: p.call, kind, label: p.label, target: p.target, width: p.width, height: p.height, samples: p.samples, draws: p.draws, triangles: p.triangles, pipelines: p.pipelines.size, bySystem: sys, byAsset: assets, ...(options.objects ? { objects: objects.slice(0, options.objects) } : {}) };
      });
      if (whatIf.skipRenders?.length) affected.skippedRenders = f.skipped;
      const memory = renderer.info?.memory ?? {};
      return {
        frame: f.frame, stable, stableAfter, framesObserved, notReady: f.notReady, renders: f.renders, passes,
        totals: totalsByKind(list.map((p, i) => ({ kind: kinds[i]!, draws: p.draws, triangles: p.triangles, pipelines: p.pipelines }))), bySystem, byAsset,
        info: { render: f.info ?? {}, memory: { ...memory } }, pipelineCache: renderer._pipelines?.caches?.size ?? 0, programs: memory.programs ?? 0,
        drawingBuffer: { width: renderer.domElement?.width ?? 0, height: renderer.domElement?.height ?? 0, pixelRatio: renderer.getPixelRatio?.() ?? 1 },
        whatIf: { applied: whatIf, affected, ...(whatIf.dropCasters ? { dropped } : {}) },
      };
    }
    return () => { if (!finished) cleanup(); };
  }

  /** Meshes, casters, instancing and shadow lights, overall and per probe system (replaces the devtools-hook census). */
  function sceneSummary() {
    const root = scene(), names = resolver(systemRoots()), visible = new Set<Node>();
    walk(root, node => visible.add(node), true);
    const empty = () => ({ meshes: 0, visibleMeshes: 0, casters: 0, instanced: 0, instances: 0, skinned: 0, transparent: 0, triangles: 0 });
    const total = { ...empty(), receivers: 0 }, bySystem: Record<string, ReturnType<typeof empty>> = {};
    walk(root, node => {
      if (!node.isMesh) return;
      const shown = visible.has(node), n = instances(node), s = bySystem[runtime.testHooks.probeSystems ? names.system(node) : attributionPath(node, root, 2)] ??= empty();
      for (const t of [total, s]) {
        t.meshes++; if (!shown) continue;
        t.visibleMeshes++; t.instances += n; t.triangles += triangles(node) * n;
        if (node.castShadow) t.casters++;
        if (node.isInstancedMesh || node.geometry?.isInstancedBufferGeometry) t.instanced++;
        if (node.isSkinnedMesh) t.skinned++;
        if (transparent(node)) t.transparent++;
      }
      if (shown && node.receiveShadow) total.receivers++;
    });
    const pick = (c: Node) => Object.fromEntries(['type', 'left', 'right', 'top', 'bottom', 'fov', 'near', 'far'].filter(k => c?.[k] !== undefined).map(k => [k, c[k]]));
    return { ...total, lights: lights().map(l => ({ name: l.name, type: l.type, castShadow: !!l.castShadow, mapSize: [l.shadow.mapSize?.x, l.shadow.mapSize?.y], autoUpdate: l.shadow.autoUpdate, camera: pick(l.shadow.camera), texelWorld: shadowTexelWorld(l.shadow) })), bySystem };
  }
  return { run, sceneSummary };
}
