// Sim-spec 12 test 3 (clearances) on the accepted GLBs, at the placements the scene draws (placements.ts) and with the
// parts the asset map hides left out:
//   - vehicle envelopes (body 0.95 x 0.60 m from Y 3.90 to the rail, carrying a FOUP) clear all static geometry by
//     0.10 m along every edge of the rail graph, sampled every 25 mm (the rails they ride are exempt);
//   - hoist envelopes (the FOUP's plan from its seat up to Y 3.90) clear static geometry by 0.10 m at all 175 ports.
//     The receiving structure is exempt: the target load port, and a stocker's or UTS's own parts up to 0.10 m above
//     the seat (shelf, pins, guide rails). Two shortfalls are recorded instead of failed, because neither is a layout
//     choice: the neighbouring load port on the same tool (the tools' lp locators stand 0.505 m apart and the load port
//     GLB is 0.50 m wide, so a descending FOUP passes 69 mm from its neighbour) and, at the four robot stations, the arm
//     at home (its gripper 53.5 mm from a FOUP on the port it serves, placed by the arm's seatRef). The test holds
//     both at their measured values so any change shows;
//   - stocker faces stand 0.6 m from their rails;
//   - the spine and the bay aisles are clear for the 0.62 m walker (FF3's humanoid) from the floor to 1.8 m.
// FF_SIMSPEC_EVIDENCE=1 writes evidence/sim-spec/ff2/clearance.json; otherwise the run is compared with it.
// FF3 adds the subfab kits of the owner's decision D-42 (the last describe below, its own record in
// evidence/sim-spec/ff3/kit-clearance.json, written with FF3_EVIDENCE=1): every kit clears its section module by 0.10 m
// at the least whole centimetre that allows, stands on the floor and meets the slab without crossing either, and keeps
// clear of the tool rows above; the FF2 tests and record above do not change (the kits lie below all their bands).
import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { foupYawForHeading } from '../../src/scene/foup-poses';
import { FAB_DATA } from '../../src/sim/index';
import { floorWalkPaths } from '../../src/sim/floor-transport';
import type { GraphEdgeData } from '../../src/sim/data';
import { staticPlacements } from '../../src/scene/world/placements';
import type { Placed } from '../../src/scene/world/placements';
import { crossings, nearestPiece, PlanGrid, rectangle, slabPieces, soupBounds, soupDistance, triangleDistance } from './envelopes';
import type { Piece } from './envelopes';
import { bakedEntity, GLBS_AVAILABLE, loadModels, MAP, PACKAGE, placementMatrix, posedParts, staticTriangles } from './fab-geometry';
import type { WorldTriangles } from './fab-geometry';

const { graph, layout } = FAB_DATA;
const EVIDENCE = resolve(PACKAGE, 'evidence/sim-spec/ff3-floor/clearance.json');
const WRITE = process.env.FF_SIMSPEC_EVIDENCE === '1';
const RAILS = new Set(['railStraight', 'railCurve', 'railSwitch']);
const CLEAR = 0.1;
/** Sim-spec 12 test 3's vehicle envelope and the carried FOUP base (heights.vehicleFoupBase). */
const VEHICLE = { halfLength: 0.475, halfWidth: 0.3, y0: 3.9, y1: graph.datumY };
const REACH = 0.5, STEP = 0.025;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const evidence: Record<string, unknown> = {};

let models: Map<string, GLTF>;
beforeAll(async () => { if (GLBS_AVAILABLE) models = await loadModels(); });

function pointOn(g: GraphEdgeData['geometry'], f: number): [number, number, number, number] {
  if (g.type === 'line') {
    const dx = g.to[0] - g.from[0], dz = g.to[2] - g.from[2], L = Math.hypot(dx, dz);
    return [g.from[0] + dx * f, g.from[2] + dz * f, dx / L, dz / L];
  }
  const a = ((g.startDeg + g.sweepDeg * f) * Math.PI) / 180, s = Math.sign(g.sweepDeg);
  return [g.center[0] + g.radius * Math.cos(a), g.center[2] + g.radius * Math.sin(a), -Math.sin(a) * s, Math.cos(a) * s];
}
const ownerName = (t: WorldTriangles, p: Piece) => { const o = t.owners[p.owner]!; return `${o.entity} ${o.id}`; };

describe.skipIf(!GLBS_AVAILABLE)('sim-spec 12 test 3: clearances on the accepted geometry', () => {
  test('vehicle envelopes clear all static geometry by 0.10 m along every edge', () => {
    const lo = VEHICLE.y0 - REACH, hi = VEHICLE.y1 + REACH;
    const tris = staticTriangles(models, FAB_DATA, e => !RAILS.has(e), [lo, hi]);
    const pieces = slabPieces(tris, lo, hi), grid = new PlanGrid(pieces, 0.5);
    let samples = 0, min = Infinity, where: Record<string, unknown> = {};
    const byOwner = new Map<string, number>();
    for (const e of graph.edges) {
      const n = Math.max(1, Math.ceil(e.length / STEP));
      for (let k = 0; k <= n; k++) {
        const [x, z, tx, tz] = pointOn(e.geometry, k / n);
        const near = nearestPiece(grid, rectangle(x, z, tx, tz, VEHICLE.halfLength, VEHICLE.halfWidth), VEHICLE.y0, VEHICLE.y1, REACH);
        samples++;
        if (near.piece < 0) continue;
        const who = ownerName(tris, pieces[near.piece]!);
        byOwner.set(who.split(' ')[0]!, Math.min(byOwner.get(who.split(' ')[0]!) ?? Infinity, near.distance));
        if (near.distance < min) { min = near.distance; where = { edge: e.id, at: [r4(x), r4(z)], owner: who }; }
      }
    }
    evidence.vehicle = {
      envelope: '0.95 x 0.60 m body centred on the rail, Y 3.90 to the rail datum 4.90, carrying a FOUP; every graph edge every 25 mm; rails exempt',
      edges: graph.edges.length, samples, minClearanceM: r4(min), nearest: where,
      byEntityM: Object.fromEntries([...byOwner].sort((a, b) => a[1] - b[1]).map(([k, v]) => [k, r4(v)])),
    };
    expect(samples).toBeGreaterThan(18_000);
    expect(min).toBeGreaterThanOrEqual(CLEAR);
  });

  test('hoist envelopes clear static geometry by 0.10 m at every port (receiving structure exempt, two recorded shortfalls)', () => {
    const fb = MAP.entities.foup!.measured!.bounds!, hx = Math.max(-fb.min[0], fb.max[0]), hz = Math.max(-fb.min[2], fb.max[2]);
    const tris = staticTriangles(models, FAB_DATA, e => !RAILS.has(e), [0, VEHICLE.y0 + REACH]);
    const pieces = slabPieces(tris, 0, VEHICLE.y0 + REACH), grid = new PlanGrid(pieces, 0.5);
    const index = new Map(tris.owners.map((o, i) => [o.id, i]));
    const toolOf = new Map(layout.tools.flatMap(t => t.ports.map(p => [p.id, t.id] as const)));
    const armOf = new Map(layout.floorRobots.arms.map(a => [a.port, a.id] as const));
    const kinds: Record<string, { ports: number; minM: number; nearest: string }> = {};
    const neighbour: number[] = [], arm: number[] = [], failures: string[] = [];
    for (const p of graph.ports) {
      const yaw = foupYawForHeading(p.heading[0], p.heading[2]);
      const poly = rectangle(p.seat[0], p.seat[2], Math.cos(yaw), -Math.sin(yaw), hx, hz);
      const self = index.get(p.kind === 'load' ? p.id : p.owner), seatY = p.seat[1];
      const tool = toolOf.get(p.id), servingArm = armOf.get(p.id);
      const receiving = (q: Piece) => q.owner === self && (p.kind === 'load' || q.yMax <= seatY + CLEAR);
      const isNeighbour = (q: Piece) => { const o = tris.owners[q.owner]!; return p.kind === 'load' && q.owner !== self && o.entity === 'loadPort' && toolOf.get(o.id) === tool; };
      const isArm = (q: Piece) => servingArm !== undefined && tris.owners[q.owner]!.id === servingArm;
      const other = nearestPiece(grid, poly, seatY, VEHICLE.y0, REACH, q => !receiving(q) && !isNeighbour(q) && !isArm(q));
      const k = (kinds[p.kind] ??= { ports: 0, minM: Infinity, nearest: '' });
      k.ports++;
      if (other.distance < k.minM) { k.minM = other.distance; k.nearest = `${p.id} <- ${ownerName(tris, pieces[other.piece]!)}`; }
      if (other.distance < CLEAR) failures.push(`${p.id} ${r4(other.distance)} m from ${ownerName(tris, pieces[other.piece]!)}`);
      const n = nearestPiece(grid, poly, seatY, VEHICLE.y0, REACH, isNeighbour);
      if (n.piece >= 0 && n.distance < CLEAR) neighbour.push(n.distance);
      if (servingArm) arm.push(nearestPiece(grid, poly, seatY, VEHICLE.y0, REACH, isArm).distance);
    }
    evidence.hoist = {
      envelope: 'the FOUP plan (measured bounds, yaw for the rail heading) from its seat up to Y 3.90 at every port',
      exempt: 'the target load port entirely; a stocker\'s or UTS\'s own parts up to 0.10 m above the seat (shelf, pins, guide rails)',
      byKind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { ports: v.ports, minClearanceM: r4(v.minM), nearest: v.nearest }])),
      recordedShortfalls: {
        neighbourLoadPort: { ports: neighbour.length, minM: r4(Math.min(...neighbour)), maxM: r4(Math.max(...neighbour)),
          why: 'the tools\' lp locators stand 0.505 m apart and the load port GLB is 0.50 m wide (Z -0.25..0.25), so a descending FOUP (0.416 m wide) passes 69 mm from its neighbour: an asset and spec fact, not a layout choice' },
        servingArmAtHome: { ports: arm.length, minM: r4(Math.min(...arm)),
          why: 'the arm stands where its seatRef meets the port\'s foupSeat (the author\'s hand-off geometry); at home its gripper is 53.5 mm from a FOUP on that port' },
      },
    };
    expect(graph.ports.length).toBe(175);
    expect(failures).toEqual([]);
    // The shortfalls stay what was measured: no contact, and no new port joins them.
    // 99 of the 103 load ports have a neighbour 69 mm away; the robot-station ports of the metrology tools and probers
    // do not (their tools space the ports wider).
    expect(neighbour.length).toBe(99);
    expect(Math.min(...neighbour)).toBeGreaterThan(0.04);
    expect(arm.length).toBe(4);
    expect(Math.min(...arm)).toBeGreaterThan(0.05);
  });

  test('stocker faces stand 0.6 m from their rails', () => {
    const faces: Record<string, number> = {};
    for (const st of layout.stockers) {
      const yaw = (st.yaw * Math.PI) / 180, world = new Matrix4().compose(new Vector3(...st.position), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1));
      const enclosure = posedParts(models, 'stocker', world, {}, ['enclosure']).get('enclosure')!;
      const [fx, , fz] = st.facing;
      for (const port of graph.ports.filter(p => p.owner === st.id)) {
        const node = graph.nodes.find(n => n.id === port.node)!;
        let d = Infinity;
        for (let i = 0; i < enclosure.length; i += 3) d = Math.min(d, (node.position[0] - enclosure[i]!) * fx + (node.position[2] - enclosure[i + 2]!) * fz);
        faces[port.id] = r4(d);
      }
    }
    evidence.stockerFaces = { rule: 'the enclosure\'s nearest vertex to the rail centreline, along the stocker\'s facing, at each OHT port node', distancesM: faces };
    expect(Object.keys(faces).length).toBe(8);
    for (const [id, d] of Object.entries(faces)) expect(Math.abs(d - 0.6), id).toBeLessThanOrEqual(0.005);
  });

  test('the spine and the bay aisles are clear for the 0.62 m walker', () => {
    const y0 = 0.02, y1 = 1.8, radius = layout.cameras.walk.walker.widthM / 2, N = 16, rc = radius / Math.cos(Math.PI / N);
    const tris = staticTriangles(models, FAB_DATA, e => e !== 'floorModule', [y0, y1]);
    const pieces = slabPieces(tris, y0, y1), grid = new PlanGrid(pieces, 0.5);
    const disc = (x: number, z: number) => {
      const p = new Float64Array(N * 2);
      for (let i = 0; i < N; i++) { p[i * 2] = x + rc * Math.cos((2 * Math.PI * i) / N); p[i * 2 + 1] = z + rc * Math.sin((2 * Math.PI * i) / N); }
      return p;
    };
    const paths: Record<string, { minM: number | null; nearest: string; clearBeyondM?: number }> = {};
    for (const path of floorWalkPaths(FAB_DATA)) {
      const [ax, az] = path.from, [bx, bz] = path.to, n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05);
      let min = Infinity, who = '';
      for (let k = 0; k <= n; k++) {
        const near = nearestPiece(grid, disc(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n), y0, y1, 1);
        if (near.piece >= 0 && near.distance < min) { min = near.distance; who = ownerName(tris, pieces[near.piece]!); }
      }
      expect(min, path.id).toBeGreaterThan(0.05);
      // No candidate in the one-metre neighborhood is a measured lower bound, not an infinite JSON number.
      paths[path.id] = Number.isFinite(min) ? { minM: r4(min), nearest: who } : { minM: null, nearest: '', clearBeyondM: 1 };
    }
    evidence.walker = { rule: 'a 0.62 m wide walker (circumscribed 16-gon) along every walk path, Y 0.02 to 1.8, against all static geometry but the floor', paths };
    expect(Object.keys(paths).length).toBe(17);
  });

  test('the record matches evidence/sim-spec/ff3-floor/clearance.json (FF2 record retained)', () => {
    const record = {
      schema: 'foundry-floor.evidence.clearance/1', test: 'sim-spec 12 test 3', ...evidence,
      decisions: {
        sectionModule4: 'the spine\'s east U-turn swept a vehicle through section module 4\'s return-air shaft (0.000 m); moving the U-turn clear needs the N4, N5 and S5 bays 0.2 to 0.5 m west, more than the east half\'s 0.8 m of slack allows, so that module draws its withoutShaft variant (build-layout.ts picks it by rule)',
        utsThroats: 'uts-n12 and uts-n01 measured 0.074 m beside the N1 diverge and N4 merge throats; their rows now stop 0.3 m short of the throats (0.108 m)',
        placements: layout.sectionCut.modulePlacements.map(m => `${m.id}:${m.variant}`),
      },
    };
    if (WRITE) {
      mkdirSync(dirname(EVIDENCE), { recursive: true });
      writeFileSync(EVIDENCE, `${JSON.stringify(record, null, 2)}\n`);
      return;
    }
    expect(existsSync(EVIDENCE)).toBe(true);
    expect(record).toEqual(JSON.parse(readFileSync(EVIDENCE, 'utf8')));
  });
});

test('interpenetration helper: touching faces pass, a crossing edge fails', () => {
  const quad = (y: number) => Float64Array.from([0, y, 0, 1, y, 0, 1, y, 1, 0, y, 0, 1, y, 1, 0, y, 1]);
  expect(crossings(quad(0), quad(0)).count).toBe(0);
  const post = Float64Array.from([0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.52, 0.5, 0.5]);
  expect(crossings(quad(0), post).count).toBeGreaterThan(0);
});

// ---- FF3, D-42: the subfab kits ------------------------------------------------------------------------------------
// The owner's decision D-42 enlarges the section module's kit zone in the layout to take the accepted subfab kit as
// built; build-layout.ts places one kit per module at the zone's pose. Exact triangle distances (soupDistance) on the
// accepted GLBs as the scene draws them: the scene's placements, the module's hidden parts left out and module 4 in its
// withoutShaft form, the kit at rest (its fan turns inside the shroud). The floor slab the kit stands on, the waffle
// slab its pipes meet and those slabs' cut-face caps are its designed contacts: held to touch without crossing, not to
// the clearance.
const KIT_EVIDENCE = resolve(PACKAGE, 'evidence/sim-spec/ff3/kit-clearance.json');
const WRITE_FF3 = process.env.FF3_EVIDENCE === '1';
const SUBFAB_PARTS = ['subfabColumns', 'returnAirShaft', 'mainsPipes_pipes', 'mainsPipes_brackets', 'lateralPipes', 'backWalls_panels'];
const CONTACTS = ['floorSlab', 'waffleSlab_concrete', 'waffleSlab_pockets', 'cutFaceCaps_concrete'];
/** The other quarter turn, which also runs the kit's 3.6 m side along the row, at its own least clearing centimetre
 *  (module frame). */
const ALTERNATIVE = { yaw: -90, x: 0.5 };
/** Clearances compare at micrometre resolution: the GLBs hold float32 vertices, whose rounding at these coordinates is
 *  about 1e-7 m, so a gap authored at exactly 0.10 m measures within a micrometre of it. */
const MICRON = 1e-6;
const rad = (deg: number) => (deg * Math.PI) / 180;
const concat =(list: readonly Float64Array[]) => {
  const out = new Float64Array(list.reduce((n, t) => n + t.length, 0));
  let o = 0;
  for (const t of list) { out.set(t, o); o += t.length; }
  return out;
};
interface KitSoup { soup: Float64Array; partOf: (triangle: number) => string }

/** The part of a soup beyond the plane x = x0, by clipping every triangle to it: the area, the highest point, the
 *  reach and the parts it belongs to. */
function beyondPlane(kit: KitSoup, x0: number) {
  const { soup } = kit;
  let total = 0, area = 0, top = -Infinity, reach = -Infinity;
  const parts = new Set<string>();
  const polygonArea = (p: number[][]) => {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < p.length; i++) {
      const [ax, ay, az] = p[i]!, [bx, by, bz] = p[(i + 1) % p.length]!;
      cx += ay! * bz! - az! * by!; cy += az! * bx! - ax! * bz!; cz += ax! * by! - ay! * bx!;
    }
    return Math.hypot(cx, cy, cz) / 2;
  };
  for (let i = 0; i < soup.length; i += 9) {
    const v = [0, 1, 2].map(k => [soup[i + k * 3]!, soup[i + k * 3 + 1]!, soup[i + k * 3 + 2]!]);
    total += polygonArea(v);
    if (!v.some(p => p[0]! > x0 + 1e-9)) continue;
    const clipped: number[][] = [];
    for (let k = 0; k < 3; k++) {
      const p = v[k]!, q = v[(k + 1) % 3]!, pin = p[0]! >= x0, qin = q[0]! >= x0;
      if (pin) clipped.push(p);
      if (pin !== qin) { const f = (x0 - p[0]!) / (q[0]! - p[0]!); clipped.push([x0, p[1]! + (q[1]! - p[1]!) * f, p[2]! + (q[2]! - p[2]!) * f]); }
    }
    area += polygonArea(clipped);
    for (const p of clipped) { top = Math.max(top, p[1]!); reach = Math.max(reach, p[0]!); }
    parts.add(kit.partOf(i / 9));
  }
  return { reachM: r4(reach - x0), surfaceShare: Number((area / total).toFixed(3)), highestY: r4(top), parts: [...parts].sort() };
}

describe.skipIf(!GLBS_AVAILABLE)('D-42 (FF3): the subfab kits in the enlarged kit zone', () => {
  const { kitZone, subfabKits, modulePlacements, moduleOriginX, x: sectionPlaneX } = layout.sectionCut;
  const placed = staticPlacements(FAB_DATA);
  const kits = placed.subfabKit ?? [], modules = placed.sectionModule ?? [];
  const record: Record<string, unknown> = {};
  const hidden = new Set(MAP.entities.sectionModule!.hideByDefault ?? []);
  const subfabFloor = layout.heights.subfabFloor!, slabUnderside = layout.levels.subfab![1]!;

  /** The kit's triangles, every mesh node an anchor so the nearest triangle names its part. */
  function kitSoup(p: Placed): KitSoup {
    const nodes = (models.get('subfabKit')!.parser.json as { nodes: { name?: string; mesh?: number }[] }).nodes;
    const names = [...new Set(nodes.filter(n => n.mesh !== undefined && n.name).map(n => n.name!))];
    const parts = [...posedParts(models, 'subfabKit', placementMatrix('subfabKit', p), {}, names)];
    const starts: [number, string][] = [];
    let n = 0;
    for (const [name, t] of parts) { starts.push([n, name]); n += t.length / 9; }
    const partOf = (i: number) => { let part = ''; for (const [s, name] of starts) if (i >= s) part = name; return part; };
    return { soup: concat(parts.map(([, t]) => t)), partOf };
  }
  /** The module's drawn triangles by part: the subfab parts and contacts named, hidden parts left out, its form. */
  function moduleParts(p: Placed): Map<string, Float64Array> {
    const { model, variantForm } = bakedEntity(models, 'sectionModule');
    const form = p.variant !== undefined ? variantForm[p.variant]! : 0;
    const world = placementMatrix('sectionModule', p).multiply(model.forms[form]!.offset);
    const parts = posedParts(models, 'sectionModule', world, {}, [...SUBFAB_PARTS, ...CONTACTS], form);
    for (const name of hidden) parts.delete(name);
    return parts;
  }
  /** A kit in module i's frame (the module stands at yaw 0): the zone's pose moved by dx along X, or turned. */
  const kitAt = (i: number, dx = 0, yaw = kitZone.pose.yaw): Placed => {
    const m = modules[i]!;
    return { id: `probe-${i}`, x: m.x + kitZone.pose.x + dx, y: subfabFloor, z: m.z + kitZone.pose.z, yaw: rad(yaw) };
  };
  /** The least distance from the kit to every non-contact part of the module (0.6 m reach), the nearest pair named. */
  function moduleClearance(kit: KitSoup, parts: Map<string, Float64Array>) {
    const byPart: Record<string, number> = {};
    let min = Infinity, pair = '';
    for (const [name, tris] of parts) {
      if (CONTACTS.includes(name)) continue;
      const near = soupDistance(kit.soup, tris, 0.6);
      if (near.a < 0) continue;
      byPart[name] = near.distance;
      if (near.distance < min) { min = near.distance; pair = `${kit.partOf(near.a)} / ${name}`; }
    }
    return { min, pair, byPart };
  }
  const precise = (v: number) => Number(v.toPrecision(7));

  test('one kit per section module at the zone\'s pose; the enlarged zone holds the module\'s zone and the kit', () => {
    expect(kits.length).toBe(7);
    expect(subfabKits.length).toBe(modulePlacements.length);
    expect(MAP.entities.subfabKit!.instances).toEqual({ pilot: 7, megafab: 7, phone: 7 });
    for (const [i, kit] of subfabKits.entries()) {
      const m = modulePlacements[i]!;
      expect(m.yaw).toBe(0);
      expect(kit.module).toBe(m.id);
      expect(kit.position).toEqual([r4(moduleOriginX + kitZone.pose.x), subfabFloor, r4(m.position[2] + kitZone.pose.z)]);
      expect(kit.yaw).toBe(kitZone.pose.yaw);
    }
    const holds = (outer: { min: readonly number[]; max: readonly number[] }, inner: { min: readonly number[]; max: readonly number[] }) =>
      inner.min.every((v, k) => v >= outer.min[k]! - 1e-9) && inner.max.every((v, k) => v <= outer.max[k]! + 1e-9);
    expect(kitZone.fits).toBe(true);
    expect(holds(kitZone.zone, kitZone.kitBox)).toBe(true);
    expect(holds(kitZone.zone, kitZone.moduleZone!)).toBe(true);
    // The kit's box in the layout is the drawn kit's bounds in the module frame.
    const b = soupBounds(kitSoup(kits[0]!).soup), m0 = modules[0]!;
    expect([r4(b.min[0] - m0.x), r4(b.min[1]), r4(b.min[2] - m0.z)]).toEqual([...kitZone.kitBox.min]);
    expect([r4(b.max[0] - m0.x), r4(b.max[1]), r4(b.max[2] - m0.z)]).toEqual([...kitZone.kitBox.max]);
    record.zone = {
      decision: kitZone.decision, frame: kitZone.pose.frame, moduleZone: { min: kitZone.moduleZone!.min, max: kitZone.moduleZone!.max },
      enlargedZone: { min: kitZone.zone.min, max: kitZone.zone.max }, pose: { x: kitZone.pose.x, z: kitZone.pose.z, yaw: kitZone.pose.yaw },
      kitBox: { min: kitZone.kitBox.min, max: kitZone.kitBox.max },
      placements: subfabKits.map(k => ({ id: k.id, module: k.module, position: k.position, yaw: k.yaw })),
    };
  });

  test('every kit clears every drawn part of its module by 0.10 m, and one centimetre west it would not', () => {
    const perKit: Record<string, { minM: number; pair: string }> = {}, byPart: Record<string, number> = {};
    let minMeasured = Infinity;
    for (const [i, p] of modules.entries()) {
      const parts = moduleParts(p);
      // The parts measured are the triangles the scene draws for this module.
      const drawn = staticTriangles(models, FAB_DATA, (e, q) => e === 'sectionModule' && q.id === p.id);
      expect([...parts.values()].reduce((n, t) => n + t.length / 9, 0), p.id).toBe(drawn.count);
      const c = moduleClearance(kitSoup(kits[i]!), parts);
      perKit[kits[i]!.id] = { minM: r4(c.min), pair: c.pair };
      minMeasured = Math.min(minMeasured, c.min);
      for (const [name, d] of Object.entries(c.byPart)) byPart[name] = Math.min(byPart[name] ?? Infinity, d);
      expect(c.min, p.id).toBeGreaterThanOrEqual(CLEAR - MICRON);
    }
    const west = moduleClearance(kitSoup(kitAt(0, -0.01)), moduleParts(modules[0]!));
    const alt = kitSoup(kitAt(0, ALTERNATIVE.x - kitZone.pose.x, ALTERNATIVE.yaw));
    const altC = moduleClearance(alt, moduleParts(modules[0]!));
    const altWest = moduleClearance(kitSoup(kitAt(0, ALTERNATIVE.x - kitZone.pose.x - 0.01, ALTERNATIVE.yaw)), moduleParts(modules[0]!));
    const chosen = beyondPlane(kitSoup(kits[0]!), sectionPlaneX), other = beyondPlane(alt, sectionPlaneX);
    expect(west.min).toBeLessThan(CLEAR - MICRON);
    expect(altC.min).toBeGreaterThanOrEqual(CLEAR - MICRON);
    expect(altWest.min).toBeLessThan(CLEAR - MICRON);
    expect(chosen.reachM).toBe(kitZone.pastSectionPlaneM);
    record.moduleClearance = {
      rule: 'exact triangle distance from each drawn kit to every drawn part of its section module but the designed contacts (next test); at least 0.10 m (sim-spec 12 test 3\'s static clearance) at micrometre resolution, since the GLBs hold float32 vertices',
      minM: r4(minMeasured), minMeasuredM: precise(minMeasured), perKit,
      byPartM: Object.fromEntries(Object.entries(byPart).sort((a, b) => a[1] - b[1]).map(([k, v]) => [k, r4(v)])),
      oneCentimetreWest: { minM: precise(west.min), pair: west.pair },
      beyondSectionPlane: { ...chosen, highestAboveFloorM: r4(chosen.highestY - subfabFloor) },
      alternative: {
        pose: { x: ALTERNATIVE.x, z: kitZone.pose.z, yaw: ALTERNATIVE.yaw }, minM: r4(altC.min), pair: altC.pair,
        oneCentimetreWest: { minM: precise(altWest.min), pair: altWest.pair },
        beyondSectionPlane: { ...other, highestAboveFloorM: r4(other.highestY - subfabFloor) },
      },
    };
  }, 120_000);

  test('each kit stands on the subfab floor and meets the waffle slab underside, crossing neither', () => {
    const perKit: Record<string, { floorM: number; slabM: number; crossings: number }> = {};
    for (const [i, p] of modules.entries()) {
      const parts = moduleParts(p), kit = kitSoup(kits[i]!), b = soupBounds(kit.soup);
      expect(b.min[1]).toBeCloseTo(subfabFloor, 6);
      expect(b.max[1]).toBeCloseTo(slabUnderside, 6);
      const floor = soupDistance(kit.soup, parts.get('floorSlab')!, 0.1).distance;
      const slab = Math.min(soupDistance(kit.soup, parts.get('waffleSlab_concrete')!, 0.1).distance, soupDistance(kit.soup, parts.get('waffleSlab_pockets')!, 0.1).distance);
      const crossed = crossings(kit.soup, concat(CONTACTS.flatMap(n => (parts.has(n) ? [parts.get(n)!] : [])))).count;
      perKit[kits[i]!.id] = { floorM: r4(floor), slabM: r4(slab), crossings: crossed };
      expect(floor, p.id).toBeLessThan(1e-6);
      expect(slab, p.id).toBeLessThan(1e-6);
      expect(crossed, p.id).toBe(0);
    }
    record.contacts = {
      rule: 'the kit spans the subfab from its floor (Y -7.5) to the waffle slab underside (Y -1.5): it touches the floor slab and the waffle slab and crosses none of the contact parts (floor slab, waffle slab concrete and pockets, cut-face caps)',
      perKit,
    };
  }, 120_000);

  test('the kits against the tool rows and every other static part', () => {
    const others = staticTriangles(models, FAB_DATA, e => e !== 'subfabKit', [subfabFloor - 1, 0.5]);
    const rowIds = new Set(layout.tools.flatMap(t => [t.id, `${t.id}.tower`, ...t.ports.map(p => p.id)]));
    const subset = (keep: (o: { entity: string; id: string }) => boolean) => {
      const list: number[] = [], owner: number[] = [];
      for (let t = 0; t < others.count; t++) {
        if (!keep(others.owners[others.owner[t]!]!)) continue;
        for (let k = 0; k < 9; k++) list.push(others.tris[t * 9 + k]!);
        owner.push(others.owner[t]!);
      }
      return { soup: Float64Array.from(list), owner };
    };
    const rows = subset(o => rowIds.has(o.id));
    const name = (s: { owner: number[] }, b: number) => { const o = others.owners[s.owner[b]!]!; return `${o.entity} ${o.id}`; };
    const perKit: Record<string, unknown> = {};
    let minRow = Infinity, minOther = Infinity;
    for (const [i, kit] of kits.entries()) {
      const soup = kitSoup(kit).soup, own = modules[i]!.id;
      const rest = subset(o => !rowIds.has(o.id) && o.id !== own);
      const nearRow = soupDistance(soup, rows.soup, 3), nearRest = soupDistance(soup, rest.soup, 3);
      const above = subfabKits[i]!.toolAbove;
      perKit[kit.id] = {
        toolAbove: above.tool, toolAbovePlanM: above.distanceM,
        nearestToolRowM: nearRow.a < 0 ? null : r4(nearRow.distance), nearestToolRow: nearRow.a < 0 ? null : name(rows, nearRow.b),
        nearestOtherM: nearRest.a < 0 ? null : r4(nearRest.distance), nearestOther: nearRest.a < 0 ? null : name(rest, nearRest.b),
      };
      if (nearRow.a >= 0) minRow = Math.min(minRow, nearRow.distance);
      if (nearRest.a >= 0) minOther = Math.min(minOther, nearRest.distance);
    }
    // The tools stand on the raised floor (Y 0) over the plenum and the waffle slab; the kits end at the slab underside.
    expect(subfabKits.filter(k => k.toolAbove.tool !== null).map(k => k.toolAbove.tool)).toEqual(['clean-02', 'clean-01', 'probe-03', 'probe-04']);
    expect(minRow).toBeGreaterThanOrEqual(1);
    expect(minOther).toBeGreaterThanOrEqual(CLEAR);
    record.toolRows = {
      rule: 'exact triangle distance, within 3 m, from each kit to the tool rows (tools, their load ports and signal towers) and to every other static part but its own module (other section modules, floor modules, floor robots, the gallery); toolAbove is the layout\'s tool over the point where the pipes meet the slab, within 3 m in plan',
      minToolRowM: r4(minRow), minOtherM: r4(minOther), perKit,
    };
  }, 120_000);

  test('the record matches evidence/sim-spec/ff3/kit-clearance.json', () => {
    const out = { schema: 'foundry-floor.evidence.kit-clearance/1', test: 'FF3 item 3 (D-42): the subfab kit placed in the enlarged kit zone', ...record };
    if (WRITE_FF3) {
      mkdirSync(dirname(KIT_EVIDENCE), { recursive: true });
      writeFileSync(KIT_EVIDENCE, `${JSON.stringify(out, null, 2)}\n`);
      return;
    }
    expect(existsSync(KIT_EVIDENCE)).toBe(true);
    expect(out).toEqual(JSON.parse(readFileSync(KIT_EVIDENCE, 'utf8')));
  });
});

test('triangle distance helpers: parallel faces, a crossing, skew edges, touching and the nearest pair', () => {
  const tri = (...p: number[]) => Float64Array.from(p);
  const floor = tri(0, 0, 0, 1, 0, 0, 0, 0, 1);
  expect(triangleDistance(floor, 0, tri(0, 0.3, 0, 1, 0.3, 0, 0, 0.3, 1), 0)).toBeCloseTo(0.3, 12);
  expect(triangleDistance(floor, 0, tri(0.2, -0.5, 0.2, 0.2, 0.5, 0.2, 0.25, 0.5, 0.2), 0)).toBe(0);
  // Skew edges: the floor's hypotenuse (x + z = 1) and a raised triangle's edge across it, 0.4 above.
  expect(triangleDistance(floor, 0, tri(0, 0.4, 0, 1, 0.4, 1, 1, 1.4, 1), 0)).toBeCloseTo(0.4, 12);
  expect(triangleDistance(floor, 0, tri(1, 0, 0, 2, 0, 0, 2, 1, 0), 0)).toBe(0);
  const near = soupDistance(concat([tri(5, 5, 5, 6, 5, 5, 5, 6, 5), floor]), tri(0, 0.25, 0, 1, 0.25, 0, 0, 0.25, 1), 1);
  expect(near).toEqual({ distance: near.distance, a: 1, b: 0 });
  expect(near.distance).toBeCloseTo(0.25, 12);
  expect(soupDistance(floor, tri(0, 2, 0, 1, 2, 0, 0, 2, 1), 1)).toEqual({ distance: Infinity, a: -1, b: -1 });
});
