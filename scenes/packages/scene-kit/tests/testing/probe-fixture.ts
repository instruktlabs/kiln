// A fake renderer shaped like three r186's for the count-probe tests: nested renders re-enter through the instance
// `render`, every draw goes through `backend.draw(renderObject, info)` after `_pipelines.isReady`, shadow renders rename
// the scene, and every shadow map shares one render context (RenderContexts.js keys by format and call depth).
export function probeFixture(o: { lamp?: boolean } = {}) {
  const node = (name: string, parent: any = null, extra: Record<string, unknown> = {}): any => {
    const n = { name, parent, children: [] as any[], visible: true, ...extra }; parent?.children.push(n); return n;
  };
  const scene = node('', null, { isScene: true }), world = node('world', scene), terrain = node('terrain', world), heroes = node('heroes', world);
  const mesh = (name: string, parent: any, tris: number, cast: boolean, radius: number) => node(name, parent, { isMesh: true, castShadow: cast, receiveShadow: true,
    geometry: { index: { count: tris * 3 }, attributes: { position: { count: tris * 3 } }, boundingSphere: { radius } }, matrixWorld: { getMaxScaleOnAxis: () => 1 }, material: { transparent: false } });
  const ground = mesh('ground', terrain, 1000, false, 50), house = mesh('house', heroes, 500, true, 1), bolt = mesh('bolt', heroes, 12, true, .01);
  const light = (name: string, size: number, half: number) => node(name, scene, { isLight: true, isDirectionalLight: true, type: 'DirectionalLight', castShadow: true,
    shadow: { autoUpdate: true, needsUpdate: false, map: { width: size, height: size }, camera: { type: 'OrthographicCamera', isOrthographicCamera: true, left: -half, right: half, top: half, bottom: -half, near: 1, far: 115 }, mapSize: { x: size, y: size } } });
  const sun = light('sun', 2048, 44), lights = o.lamp ? [sun, light('lamp', 1024, 10)] : [sun];
  const camera = { type: 'PerspectiveCamera' }, quad = { name: '', parent: null, isMesh: true, geometry: { index: null, attributes: { position: { count: 3 } } } };
  const contexts = {
    main: { id: 3, renderTarget: { width: 1920, height: 988, isPostProcessingRenderTarget: true } as any, width: 1920, height: 988, sampleCount: 4 },
    shadow: { id: 5, renderTarget: sun.shadow.map, width: 2048, height: 2048, sampleCount: 1 },
    output: { id: 4, renderTarget: null, width: 1920, height: 988, sampleCount: 1 },
  };
  const pipelines = { ground: {}, lit: {}, depth: {}, output: {} };
  const triangles = (m: any) => m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
  let compiling = 2;
  const visibleMeshes = (root: any, out: any[] = []) => { if (!root.visible) return out; if (root.isMesh) out.push(root); for (const c of root.children) visibleMeshes(c, out); return out; };
  const renderer: any = {
    info: { render: { calls: 0, frame: 0, drawCalls: 0, triangles: 0 }, memory: { geometries: 4, textures: 1 } },
    _pipelines: { caches: new Map([[1, {}], [2, {}]]), isReady(ro: any) { return !(compiling > 0 && ro.object === house); } },
    domElement: { width: 1920, height: 988 }, getPixelRatio: () => 1,
    backend: { draw(ro: any, info: any) { info.render.drawCalls++; info.render.triangles += triangles(ro.object); } },
    render(s: any, c: any) {
      const caster = lights.find(l => l.shadow.camera === c);
      if (!caster) for (const l of lights) if (l.castShadow && (l.shadow.autoUpdate || l.shadow.needsUpdate)) { const n = s.name; s.name = `Shadow Map [ ${l.name} ]`; this.render(s, l.shadow.camera); s.name = n; l.shadow.needsUpdate = false; }
      const context = caster ? Object.assign(contexts.shadow, { renderTarget: caster.shadow.map, width: caster.shadow.map.width, height: caster.shadow.map.height }) : contexts.main;
      for (const m of visibleMeshes(s)) {
        if (caster && !m.castShadow) continue;
        const ro = { object: m, context, pipeline: caster ? pipelines.depth : m === ground ? pipelines.ground : pipelines.lit };
        if (this._pipelines.isReady(ro)) this.backend.draw(ro, this.info);
      }
      if (!caster) { this.backend.draw({ object: quad, context: contexts.output, pipeline: pipelines.output }, this.info); compiling--; }
    },
  };
  const systems: { order: number; fn: () => void }[] = [], clock = { frame: 0 };
  const runtime: any = {
    renderer, state: { scene, camera }, clock, disposed: false, pack: null, data: new Map(), devParams: {}, workloads: new Map(), quality: null,
    testHooks: { probeSystems: () => ({ terrain, heroes }), probeAsset: (o: any) => o === house ? 'farmhouse' : null },
    systems: { add(_name: string, order: number, fn: () => void) { const entry = { order, fn }; systems.push(entry); return () => { const i = systems.indexOf(entry); if (i >= 0) systems.splice(i, 1); }; } },
  };
  const tick = () => { clock.frame++; renderer.info.render.drawCalls = renderer.info.render.triangles = 0; for (const s of [...systems].sort((a, b) => a.order - b.order)) s.fn(); renderer.render(scene, camera); };
  const original = { render: renderer.render, isReady: renderer._pipelines.isReady, draw: renderer.backend.draw };
  return { runtime, renderer, scene, sun, ground, house, bolt, heroes, tick, original, systems };
}
export type ProbeFixture = ReturnType<typeof probeFixture>;
