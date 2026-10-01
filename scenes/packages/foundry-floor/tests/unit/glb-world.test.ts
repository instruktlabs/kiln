// The GLB world built headless from the accepted GLBs (the staged pack's copies, or the authors' files while they are
// the pinned ones; read-only inputs): every accepted GLB bakes, every static placement and every driver runs over sim
// time from the stored warm start without throwing, poses stay finite, the drawn FOUPs follow the twin, and the named
// views stay inside the desktop and phone budgets (triangles and draws, D-15 / SPEC budgets). No renderer is involved:
// the counts are what the world would submit.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PerspectiveCamera } from 'three/webgpu';
import type { InstancedBufferGeometry, InstancedMesh, InterleavedBufferAttribute, Mesh } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { parseAssetMap } from '../../src/scene/assets/asset-map';
import { INSTANCE_COLUMNS } from '../../src/scene/glb/materials';
import { serviceRoutes } from '../../src/scene/people';
import { buildGlbWorld } from '../../src/scene/world/glb-world';
import { prepareModelLevels } from '../../src/scene/glb/model-levels';
import type { GlbWorld } from '../../src/scene/world/glb-world';
import { createClock } from '../../src/sim/clock';
import { createFab, FAB_DATA, HOUR_MS } from '../../src/sim/index';

const PACKAGE = resolve(import.meta.dir, '../..'), COMMONS = resolve(PACKAGE, '../../..');
const map = parseAssetMap(readFileSync(resolve(PACKAGE, 'data/assets.json'), 'utf8'));
const snapshot = readFileSync(resolve(PACKAGE, `data/warm/seed-${FAB_DATA.config.seeds.default}.json`), 'utf8');
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const accepted = Object.entries(map.entities).filter(([, e]) => e.glb && e.pins).map(([id]) => id);
function source(id: string): string | undefined {
  const e = map.entities[id]!;
  const candidates = [resolve(PACKAGE, 'staged/ff2', e.glb!), ...(e.source ? [resolve(COMMONS, 'showcase/authors', e.source.author, e.source.file)] : [])];
  return candidates.find(path => existsSync(path) && sha(path) === e.pins!.sha256);
}
const available = accepted.every(id => source(id));
/** Budgets (SPEC): desktop 1.2M triangles and 300 draws; phone 450k triangles and 150 draws. */
const BUDGET = { desktop: { triangles: 1_200_000, draws: 300 }, phone: { triangles: 450_000, draws: 150 } };
/** FF3's people record: written with FF3_EVIDENCE=1, otherwise the run must reproduce it. */
const PEOPLE_EVIDENCE = resolve(PACKAGE, 'evidence/sim-spec/ff3-floor/people.json'), WRITE_FF3 = process.env.FF3_EVIDENCE === '1';

let loaded: Promise<Map<string, GLTF>> | undefined;
function loadModels(): Promise<Map<string, GLTF>> {
  return loaded ??= (async () => {
    const models = new Map<string, GLTF>();
    for (const id of accepted) {
      const bytes = readFileSync(source(id)!);
      const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
      await prepareModelLevels(gltf); models.set(id, gltf);
    }
    return models;
  })();
}

function viewStats(world: GlbWorld, aspect: number) {
  const out: Record<string, { triangles: number; draws: number; drawn: number; lod1: number }> = {};
  const cams = FAB_DATA.layout.cameras;
  for (const name of ['landing', 'overview', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section'] as const) {
    const v = cams[name], camera = new PerspectiveCamera(v.fov, aspect, 0.1, 400);
    camera.position.set(...v.position);
    camera.lookAt(...v.target);
    camera.updateMatrixWorld();
    // Two draws: LOD hysteresis settles on the first.
    world.draw(camera);
    world.draw(camera);
    const s = world.stats();
    out[name] = { triangles: s.triangles, draws: s.draws, drawn: s.drawn, lod1: s.lod1 };
  }
  return out;
}

describe.skipIf(!available)('the GLB world (accepted GLBs through data/assets.json)', () => {
  test('completed floor transfers release forced detail on the previously active robots', async () => {
    const fab = createFab({ snapshot, mode: 'pilot' });
    const world = buildGlbWorld(await loadModels(), map, fab.sim, { phone: false, data: FAB_DATA });
    const clock = createClock(fab.now(), 0), camera = new PerspectiveCamera(60, 1.5, .1, 1000);
    camera.position.set(0, 140, 70); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    fab.sim.S.floor.active = { id: 1, lot: 1, station: 0, stocker: 0, direction: 'deliver', phase: 'PICK', carrier: 'amr', requestedAt: 0, hot: false, t0: fab.now(), t1: fab.now() + 24000, carrying: false };
    world.update(fab.sim, clock); world.draw(camera); world.draw(camera);
    const active = world.stats().sets.toolFrontRobotArm!;
    expect(active.lod1).toBe(active.drawn - 1);
    fab.sim.S.floor.active = null;
    world.update(fab.sim, clock); world.draw(camera); world.draw(camera);
    for (const entity of ['toolFrontRobotArm', 'amrFloorRobot']) {
      const idle = world.stats().sets[entity]!; expect(idle.lod1).toBe(idle.drawn);
    }
    world.dispose();
  });
  test('builds, drives six hours of megafab from the warm start and stays inside the desktop and phone budgets', async () => {
    const models = await loadModels();
    const fab = createFab({ snapshot, mode: 'megafab' });
    const world = buildGlbWorld(models, map, fab.sim, { phone: false, data: FAB_DATA });
    const clock = createClock(fab.now(), 1);
    const start = fab.now();
    let maxFoups = 0, people = 0, samples = 0, updateMs = 0;
    for (let t = start + 1000; t <= start + 6 * HOUR_MS; t += 1000) {
      fab.step(t);
      clock.simMs = t;
      const t0 = performance.now();
      world.update(fab.sim, clock);
      updateMs += performance.now() - t0;
      samples++;
      const foups = world.foups();
      maxFoups = Math.max(maxFoups, foups.length);
      for (const f of foups) for (const v of [f.x, f.y, f.z, f.yaw]) expect(Number.isFinite(v)).toBe(true);
      people = Math.max(people, world.stats().people);
    }
    expect(samples).toBe(6 * 3600);
    expect(maxFoups).toBeGreaterThan(0);
    const desktop = viewStats(world, 16 / 9);
    for (const [name, s] of Object.entries(desktop)) {
      expect(s.triangles, name).toBeLessThanOrEqual(BUDGET.desktop.triangles);
      expect(s.draws, name).toBeLessThanOrEqual(BUDGET.desktop.draws);
      expect(s.drawn, name).toBeGreaterThan(0);
    }
    // Every accepted entity with instances has a set (FF3: the placed subfab kits and the humanoid's people set too).
    const sets = world.stats().sets;
    for (const id of accepted) if (map.entities[id]!.instances.pilot > 0) expect(sets[id], id).toBeDefined();
    console.log(JSON.stringify({ desktop, maxFoups, people, updateMsPerFrame: +(updateMs / samples).toFixed(3) }));
    world.dispose();

    // Phone: the same fab, the phone capacities, a portrait aspect.
    const phone = buildGlbWorld(models, map, fab.sim, { phone: true, data: FAB_DATA });
    phone.update(fab.sim, clock);
    const portrait = viewStats(phone, 390 / 844);
    for (const [name, s] of Object.entries(portrait)) {
      expect(s.triangles, name).toBeLessThanOrEqual(BUDGET.phone.triangles);
      expect(s.draws, name).toBeLessThanOrEqual(BUDGET.phone.draws);
    }
    console.log(JSON.stringify({ phone: portrait }));
    phone.dispose();
  }, 240_000);

  test('entity sets draw through a handful of shared materials and no per-mesh instancing programs', async () => {
    // three 0.186 builds one program per InstancedMesh (uniform buffer named by node id, uuid in the material cache
    // key); the sets instead put the instance matrix in attributes on plain meshes that share the GLB materials.
    const models = await loadModels();
    const fab = createFab({ snapshot, mode: 'pilot' });
    const world = buildGlbWorld(models, map, fab.sim, { phone: false, data: FAB_DATA });
    const instancedMeshes: string[] = [], materials = new Set<unknown>();
    let instancedGeometries = 0;
    world.root.traverse(o => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      materials.add(mesh.material);
      if ((mesh as InstancedMesh).isInstancedMesh) { instancedMeshes.push(mesh.name); return; }
      const g = mesh.geometry as InstancedBufferGeometry;
      expect(g.isInstancedBufferGeometry, mesh.name).toBe(true);
      for (const column of INSTANCE_COLUMNS) expect(g.getAttribute(column)?.itemSize, `${mesh.name} ${column}`).toBe(4);
      // WebGPU's default limit: a draw binds at most eight vertex buffers (interleaved attributes share one).
      const buffers = new Set(Object.values(g.attributes).map(a => ((a as InterleavedBufferAttribute).isInterleavedBufferAttribute ? (a as InterleavedBufferAttribute).data : a)));
      expect(buffers.size, mesh.name).toBeLessThanOrEqual(8);
      instancedGeometries++;
    });
    expect(instancedMeshes.sort()).toEqual(['foundry-floor-proxies', 'foundry-floor-pulses'].sort());
    expect(instancedGeometries).toBeGreaterThan(100);
    // Four GLB materials (opaque or transparent, tinted or not), the proxy and the pulse material.
    expect(materials.size).toBeLessThanOrEqual(6);
    world.dispose();
  });

  test('FF3: the humanoid work robot walks the repair and PM visits and the technician the qualifications, from data alone', async () => {
    // Nothing but data: sim-config gives the humanoid class the repair and PM visits and the technician the
    // qualifications, the asset map gives both their instances, and both draw through FF2's people path. The twin
    // runs unmodified from the stored warm start (twelve hours, pilot, sampled every 5 s; no injected failure): every
    // visit in progress is drawn once, by the class that owns its kind, on its route at the distance walked at the
    // asset map's walk speed (facing along the route) or at its service point (facing the tool, servicing or idling);
    // every other person of that class is walking out along a route; and the world never feeds the twin (its hash
    // equals a twin stepped alone).
    const models = await loadModels();
    const fab = createFab({ snapshot, mode: 'pilot' }), alone = createFab({ snapshot, mode: 'pilot' });
    const world = buildGlbWorld(models, map, fab.sim, { phone: false, data: FAB_DATA });
    const start = fab.now(), clock = createClock(start, 1), people = FAB_DATA.layout.people, routes = serviceRoutes(people);
    const classes = FAB_DATA.config.movers.classes.filter(c => c.kind === 'people' && (c.visits?.length ?? 0) > 0);
    const owner = new Map(classes.flatMap(c => (c.visits ?? []).map(k => [k, c] as const)));
    const speed = (entity: string) => map.entities[entity]!.people!.walkSpeedMps;
    /** Position and travel yaw s metres along a tool's route, from the route's points alone. */
    const along = (tool: string, s: number): [number, number, number] => {
      const pts = routes.get(tool)!.pts;
      let left = s;
      for (let i = 2; i < pts.length; i += 2) {
        const x0 = pts[i - 2]!, z0 = pts[i - 1]!, x1 = pts[i]!, z1 = pts[i + 1]!, len = Math.hypot(x1 - x0, z1 - z0);
        if (left <= len || i === pts.length - 2) { const f = len > 0 ? Math.min(left / len, 1) : 0; return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, Math.atan2(-(z1 - z0), x1 - x0)]; }
        left -= len;
      }
      throw new Error(`${tool}: an empty route`);
    };
    /** Distance from (x, z) to a tool's route polyline. */
    const offRoute = (tool: string, x: number, z: number) => {
      const pts = routes.get(tool)!.pts;
      let best = Infinity;
      for (let i = 2; i < pts.length; i += 2) {
        const x0 = pts[i - 2]!, z0 = pts[i - 1]!, dx = pts[i]! - x0, dz = pts[i + 1]! - z0, l2 = dx * dx + dz * dz;
        const f = l2 > 0 ? Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / l2)) : 0;
        best = Math.min(best, Math.hypot(x - (x0 + dx * f), z - (z0 + dz * f)));
      }
      return best;
    };
    const since = new Map<string, number>(); // `${class}|${tool}` -> start of the class's uninterrupted visit there
    const served: Record<'repair' | 'pm' | 'qualification', Set<string>> = { repair: new Set(), pm: new Set(), qualification: new Set() };
    const count = { walkingIn: 0, walkingOut: 0, onTheSpine: 0, offTheSpine: 0 }, maxDrawn: Record<string, number> = {};
    for (let t = start + 5_000; t <= start + 12 * HOUR_MS; t += 5_000) {
      fab.step(t); alone.step(t);
      clock.simMs = t;
      world.update(fab.sim, clock);
      const drawn = world.people(), byClass = new Map(drawn.map(g => [g.id, g.poses])), sets = world.stats().sets, live = new Set<string>();
      for (const v of fab.sim.serviceVisits()) {
        expect(routes.has(v.tool), v.tool).toBe(true);
        const c = owner.get(v.kind)!, key = `${c.id}|${v.tool}`;
        live.add(key);
        if (!since.has(key)) since.set(key, v.since);
        const mine = (byClass.get(c.id) ?? []).filter(p => p.key === v.tool);
        expect(mine, key).toHaveLength(1);
        const p = mine[0]!, s = ((t - since.get(key)!) / 1000) * speed(c.entity);
        if (s < routes.get(v.tool)!.total) {
          const [x, z, yaw] = along(v.tool, s);
          expect(p.activity, key).toBe('walk');
          expect(Math.hypot(p.x - x, p.z - z), key).toBeLessThan(1e-6);
          expect(Math.abs(Math.atan2(Math.sin(p.yaw - yaw), Math.cos(p.yaw - yaw))), key).toBeLessThan(1e-9);
          count.walkingIn++;
        } else {
          const target = people.targets[v.tool]!;
          expect({ key, activity: p.activity, x: p.x, z: p.z, yaw: p.yaw })
            .toEqual({ key, activity: v.kind === 'qualification' ? 'idle' : 'service', x: target.at[0]!, z: target.at[2]!, yaw: (target.yaw * Math.PI) / 180 });
          served[v.kind].add(`${c.id} ${v.tool}@${v.since}`);
        }
      }
      for (const key of [...since.keys()]) if (!live.has(key)) since.delete(key);
      for (const g of drawn) {
        maxDrawn[g.id] = Math.max(maxDrawn[g.id] ?? 0, g.poses.length);
        expect(sets[g.entity]?.instances ?? 0, g.entity).toBe(g.poses.length);
        expect(new Set(g.poses.map(p => p.key)).size, g.id).toBe(g.poses.length);
        for (const p of g.poses) {
          expect(Number.isFinite(p.clipS) && p.clipS >= 0, `${g.id} ${p.key}`).toBe(true);
          if (p.activity === 'walk') {
            expect(offRoute(p.key, p.x, p.z), `${g.id} ${p.key}`).toBeLessThan(1e-6);
            if (Math.abs(p.z - people.door.position[2]!) < 1e-9) count.onTheSpine++; else count.offTheSpine++;
          }
          if (!live.has(`${g.id}|${p.key}`)) { expect(p.activity, `${g.id} ${p.key} after its visit`).toBe('walk'); count.walkingOut++; }
        }
      }
    }
    expect(fab.hash()).toBe(alone.hash());
    const byId = Object.fromEntries(classes.map(c => [c.id, c]));
    for (const c of classes) expect(maxDrawn[c.id] ?? 0, c.id).toBeLessThan(map.entities[c.entity]!.instances.pilot);
    const summary = {
      rule: 'twelve hours of pilot from the stored day-30 warm start, sampled every 5 s; no injected failure',
      classes: Object.fromEntries(classes.map(c => [c.id, { entity: c.entity, visits: c.visits, capacityPilot: map.entities[c.entity]!.instances.pilot, maxDrawn: maxDrawn[c.id] ?? 0 }])),
      servedAtTheTool: Object.fromEntries(Object.entries(served).map(([k, s]) => [k, [...s].sort()])),
      samples: count, twinHashEqualsAlone: fab.hash() === alone.hash(), hash: fab.hash(),
    };
    for (const kind of ['repair', 'pm'] as const) expect([...served[kind]].every(s => s.startsWith('humanoid ')) && served[kind].size > 0, kind).toBe(true);
    expect([...served.qualification].every(s => s.startsWith('technician ')) && served.qualification.size > 0).toBe(true);
    for (const n of Object.values(count)) expect(n).toBeGreaterThan(0);
    expect(byId.humanoid?.entity).toBe('humanoidWorkRobot');
    console.log(JSON.stringify(summary));
    if (WRITE_FF3) writeFileSync(PEOPLE_EVIDENCE, `${JSON.stringify({ schema: 'foundry-floor-ff3-people/1', generatedBy: 'tests/unit/glb-world.test.ts (FF3_EVIDENCE=1)', ...summary }, null, 2)}\n`);
    else if (existsSync(PEOPLE_EVIDENCE)) {
      const { schema: _s, generatedBy: _g, ...recorded } = JSON.parse(readFileSync(PEOPLE_EVIDENCE, 'utf8')) as Record<string, unknown>;
      expect(summary).toEqual(recorded as typeof summary);
    }
    world.dispose();
  }, 240_000);
});
