// SPDX-License-Identifier: MIT
// Builds data/campus.json (FF-C1 item 1, D-21): the campus frame, the placements of the accepted structures (four
// buildings of an S1 head and an S2 hall, two S3 links, two S4 canopies, eight S5 bridges), the roads of the accepted
// blueprint (the split road, the cross pass, the roundabout, the road ends with their dissolve stretches), the traffic
// lanes, the parking loops, the utility satellites, the light standards, the interior twin's locator, the tiers,
// views and looks of the exterior, and the campus checks, measured on the placed meshes:
//   seams          each S1 and its S2 meet on the seam plane with identical outlines and no cap or gap;
//   negative-scale no node of any placed model has a negative scale or a mirrored world matrix;
//   clear-height   every S5 clears the road by 29.4 m;
//   road-profile   every road surface vertex lies at grade;
//   lanes-on-road  every traffic lane keeps a vehicle's half width on the paved surface;
//   road-envelope  no structure triangle enters the drivable area between 0.05 and 5 m above grade;
//   extents        every placed vertex lies inside the blueprint's extents within 0.5 m (contract projections listed);
//   interior-fit   the interior twin's footprint and level bands fit the south-west head's level 1.
// The structure files are read from the authors' outputs and verified against the newest library revision
// (scripts/structures.ts) before anything is measured.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/build-campus.ts --write   (writes data/campus.json)
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/build-campus.ts --check   (fails on drift or a failed check)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { det3, isUnder, meshTriangles, transformPoint, worldMatrices } from './glb';
import { loadStructure, measureStructure, STRUCTURES } from './structures';
import { CAMPUS_SCHEMA, placementMatrix, placePoint } from '../src/campus/data';
import type {
  Box3Json, CampusCheck, CampusData, CampusDiscrepancy, CampusLights, CampusLook, CampusModel, CampusParking, CampusPlacement, CampusRoads,
  CampusSatellites, CampusSolid, CampusTier, CampusTierName, CampusView, CampusViewName, ParkingLoop, V2, V3,
} from '../src/campus/data';
import { buildLanes, drivableArea, groundLayers, lanePoint, lampHeads, parkingStalls, quadBezier, satelliteBoxes } from '../src/campus/roads';

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CAMPUS_PATH = resolve(PACKAGE, 'data/campus.json');
const CONTRACT = 'pack2-research/terafab/briefs/structures-contract.md';
const BLUEPRINT = 'pack2-research/terafab/campus-blueprint-v7.svg';
const r3 = (v: number) => { const x = Math.round(v * 1000) / 1000; return Object.is(x, -0) ? 0 : x; };
const r1 = (v: number) => { const x = Math.round(v * 10) / 10; return Object.is(x, -0) ? 0 : x; };
const v3 = (p: readonly number[]): V3 => [r3(p[0]!), r3(p[1]!), r3(p[2]!)];

// ---------------------------------------------------------------- structures and placements (contract, campus paragraph)

type BuildingId = 'SW' | 'SE' | 'NE' | 'NW';
interface BuildingSpec { id: BuildingId; head: string; hall: string; position: V3; yawDeg: number; mirror: V2 }
/** SW = W as built, SE = E as built, NE = W turned 180 degrees, NW = E turned 180 degrees; seam planes at u = -3015
 *  and +3015, hall centrelines at v = -300 and +300. `mirror` maps a south-west blueprint point to this building's. */
const BUILDINGS: BuildingSpec[] = [
  { id: 'SW', head: 's1-head-W', hall: 's2-hall-W', position: [-3015, 0, -300], yawDeg: 0, mirror: [1, 1] },
  { id: 'SE', head: 's1-head-E', hall: 's2-hall-E', position: [-3015, 0, 300], yawDeg: 0, mirror: [1, -1] },
  { id: 'NE', head: 's1-head-W', hall: 's2-hall-W', position: [3015, 0, 300], yawDeg: 180, mirror: [-1, -1] },
  { id: 'NW', head: 's1-head-E', hall: 's2-hall-E', position: [3015, 0, -300], yawDeg: 180, mirror: [-1, 1] },
];
const FAR: Record<string, string | null> = {
  's1-head-W': 's1-head-W-far', 's1-head-E': 's1-head-E-far', 's2-hall-W': 's2-hall-W-far', 's2-hall-E': 's2-hall-E-far',
  's5-split-bridge': 's5-split-bridge-far', 's3-link': null, 's4-canopy': null,
};
const BRIDGE_X = [468, 1044, 1620, 2196];

function placementSpecs(): Omit<CampusPlacement, 'bounds' | 'farBounds'>[] {
  const out: Omit<CampusPlacement, 'bounds' | 'farBounds'>[] = [];
  for (const b of BUILDINGS) {
    const as = b.yawDeg ? 'turned 180 degrees' : 'as built';
    out.push({ id: `${b.id}-head`, piece: 'S1', model: b.head, far: FAR[b.head]!, building: b.id, position: b.position, yawDeg: b.yawDeg, rule: `contract campus paragraph: ${b.id} = ${b.head.endsWith('W') ? 'W' : 'E'} ${as}, seam at u = ${b.position[0]}, centreline v = ${b.position[2]}` });
    out.push({ id: `${b.id}-hall`, piece: 'S2', model: b.hall, far: FAR[b.hall]!, building: b.id, position: b.position, yawDeg: b.yawDeg, rule: `contract campus paragraph: ${b.id} = ${b.hall.endsWith('W') ? 'W' : 'E'} ${as}, seam at u = ${b.position[0]}, centreline v = ${b.position[2]}` });
  }
  out.push({ id: 'link-W', piece: 'S3', model: 's3-link', far: null, building: null, position: [0, 0, -270], yawDeg: 0, rule: 'contract S3: one copy at campus (0, -270) as built' });
  out.push({ id: 'link-E', piece: 'S3', model: 's3-link', far: null, building: null, position: [0, 0, 270], yawDeg: 180, rule: 'contract S3: one at (0, +270) turned 180 degrees' });
  out.push({ id: 'canopy-S', piece: 'S4', model: 's4-canopy', far: null, building: null, position: [-3960, 0, 0], yawDeg: 0, rule: 'contract S4: one copy at campus (-3960, 0) as built (the south-west arrival canopy)' });
  out.push({ id: 'canopy-N', piece: 'S4', model: 's4-canopy', far: null, building: null, position: [3960, 0, 0], yawDeg: 180, rule: 'contract S4: one at (+3960, 0) turned 180 degrees' });
  BRIDGE_X.forEach((x, k) => out.push({ id: `bridge-S${k + 1}`, piece: 'S5', model: 's5-split-bridge', far: FAR['s5-split-bridge']!, building: null, position: [-3015 + x, 0, 0], yawDeg: 0, rule: `contract S5 (revision 3): south pair, building-frame X = ${x}` }));
  BRIDGE_X.forEach((x, k) => out.push({ id: `bridge-N${k + 1}`, piece: 'S5', model: 's5-split-bridge', far: FAR['s5-split-bridge']!, building: null, position: [3015 - x, 0, 0], yawDeg: 0, rule: `contract S5 (revision 3): north pair, building-frame X = ${x}` }));
  return out;
}

// ---------------------------------------------------------------- measured triangles

interface Part { name: string; tris: Float64Array; count: number; materials: string[] }
const loaded = new Map<string, ReturnType<typeof loadStructure>>();
const partsCache = new Map<string, Part[]>();
function structure(id: string) { let s = loaded.get(id); if (!s) { s = loadStructure(id); loaded.set(id, s); } return s; }
/** The model's triangles by top-level part, in its own frame. */
function modelParts(id: string): Part[] {
  const cached = partsCache.get(id);
  if (cached) return cached;
  const { file, tree } = structure(id), world = worldMatrices(tree), root = tree.nodes[tree.roots[0]!]!, parts: Part[] = [];
  const names = (file.json.materials ?? []).map(m => m.name ?? '');
  for (const c of root.children) {
    const tris: number[] = [], materials: string[] = [];
    for (const n of tree.nodes) {
      if (n.mesh === null || !isUnder(tree, n.index, c)) continue;
      const m = world[n.index]!;
      for (const t of meshTriangles(file, n.mesh)) {
        for (let k = 0; k < t.count * 3; k++) tris.push(...transformPoint(m, t.positions[k * 3]!, t.positions[k * 3 + 1]!, t.positions[k * 3 + 2]!));
        for (let k = 0; k < t.count; k++) materials.push(names[t.material] ?? '');
      }
    }
    if (tris.length) parts.push({ name: tree.nodes[c]!.name, tris: Float64Array.from(tris), count: tris.length / 9, materials });
  }
  partsCache.set(id, parts);
  return parts;
}
/** The model's parts placed in the campus frame. */
function placedParts(model: string, position: readonly number[], yawDeg: number): Part[] {
  return modelParts(model).map(p => {
    const out = new Float64Array(p.tris.length);
    for (let k = 0; k < p.tris.length; k += 3) { const q = placePoint(position, yawDeg, p.tris[k]!, p.tris[k + 1]!, p.tris[k + 2]!); out[k] = q[0]; out[k + 1] = q[1]; out[k + 2] = q[2]; }
    return { ...p, tris: out };
  });
}
function partsBounds(parts: readonly Part[]): Box3Json {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let k = 0; k < p.tris.length; k += 3) for (let a = 0; a < 3; a++) { const x = p.tris[k + a]!; if (x < min[a]!) min[a] = x; if (x > max[a]!) max[a] = x; }
  return { min: v3(min), max: v3(max) };
}

// ---------------------------------------------------------------- roads and ground (blueprint v7; lanes and markings E)

/** Right-hand traffic lanes, 0 next to the centre line (m/s): the campus limit is about 70 km/h in lane 0. */
const LANE_SPEEDS = [19, 17, 15, 13];
function roadsInput(stubEnd: number, outerFrom: number): CampusRoads {
  return {
    gradeY: 0,
    palette: { grade: '#7b8a6a', asphalt: '#3c3f42', apron: '#6c6d6a', marking: '#e6e4dc', centre: '#e6e4dc', kerb: '#9c9a94', island: '#65774f', parking: '#46494c', plaza: '#a3a19b' },
    gradeRadius: 24000,
    split: {
      u: [-4300, 4300], halfWidth: 40, lanes: { perDirection: 4, width: 4.5, firstCentre: 2.75 },
      lineWidth: 0.25, centreDash: { dash: 12, gap: 6 }, laneDash: { dash: 6, gap: 9 }, edgeLine: 18.5, outerEdgeLine: 39.5,
      markingsFrom: 136, dissolve: 150, carEnd: 4150,
    },
    cross: { halfWidth: 60, v: 1150, stubEnd, outerFrom, lanes: { perDirection: 4, width: 4.5, firstCentre: 2.75 }, dissolve: 150 },
    roundabout: { radius: 110, island: 40, kerb: 2, apronTo: 85, lanes: { count: 4, width: 5, inner: 85 }, fillet: 36 },
    // Drop-off bays: the canopy's kerbs (S4 `dropOffKerb`, 0.3 tall along Z = +-60 from X = -100 to 0) are the road
    // edge under the back of the roof; the bays run from the road edge to 0.1 m short of the kerb, from 4 m clear of the
    // V-column at (X -100, Z +-60) to the front faces.
    dropOff: [
      { u: [-4056, -3960], v: [-59.4, -40] }, { u: [-4056, -3960], v: [40, 59.4] },
      { u: [3960, 4056], v: [-59.4, -40] }, { u: [3960, 4056], v: [40, 59.4] },
    ],
    plazas: [
      { u: [-4110, -3960], v: [-150, -40] }, { u: [-4110, -3960], v: [40, 150] },
      { u: [3960, 4110], v: [-150, -40] }, { u: [3960, 4110], v: [40, 150] },
    ],
  };
}

/** Blueprint v7 parking loops (the south-west set; the other corners mirror it by scale(+-1, +-1)): three nested
 *  quadratic curves, each an 8 m aisle with a stall row either side, cut where the stalls would reach the head's
 *  front face (u = -3960) less 3 m. */
const LOOPS_SW: [V2, V2, V2][] = [
  [[-4230, -260], [-4230, -520], [-4000, -640]],
  [[-4150, -260], [-4150, -470], [-3960, -560]],
  [[-4070, -260], [-4070, -420], [-3920, -480]],
];
const AISLE = 8, PITCH = 2.6, DEPTH = 5.5, FRONT_FACE = 3960, FACE_CLEAR = 3;
function parkingInput(): CampusParking {
  const loops: ParkingLoop[] = [];
  for (const b of BUILDINGS) LOOPS_SW.forEach((curve, k) => {
    const c = curve.map(p => [p[0] * b.mirror[0], p[1] * b.mirror[1]] as V2) as [V2, V2, V2];
    // The largest t whose stall rows (the aisle and a stall depth either side, half a pitch along) stay FACE_CLEAR
    // outside the front face (|u| >= FRONT_FACE + FACE_CLEAR).
    let t1 = 1;
    for (let k = 0; k <= 1000; k++) {
      const t = k / 1000, p = quadBezier(c, t), q = quadBezier(c, Math.min(1, t + 0.001)), r = quadBezier(c, Math.max(0, t - 0.001));
      const du = q[0] - r[0], dv = q[1] - r[1], l = Math.hypot(du, dv) || 1, nu = -dv / l, tu = du / l;
      let nearest = Infinity;
      for (const s of [-1, 1]) for (const a of [-1, 1]) nearest = Math.min(nearest, Math.abs(p[0] + s * nu * (AISLE / 2 + DEPTH) + a * tu * PITCH / 2));
      if (nearest < FRONT_FACE + FACE_CLEAR) { t1 = Math.max(0, (k - 1) / 1000); break; }
    }
    loops.push({ id: `parking-${b.id}-${k + 1}`, corner: b.id, curve: c, t: [0, r3(t1)], aisle: AISLE, pitch: PITCH, depth: DEPTH });
  });
  return {
    loops, car: { body: [4.5, 1.8, 0.9], cabin: [2.3, 1.55, 0.55], cabinBack: 0.2, lift: 0.25 }, occupancy: 0.72, seed: 7,
    paints: ['#e9e9e6', '#b9bcbf', '#6f7377', '#23262a', '#2f4f7a', '#8a2f2c', '#3e5a48', '#c9b99a'],
  };
}

/** Blueprint v7 utility satellites: the zone u -2900..-600, v -760..-610, blocks along v = -685 (stroke 110) dashed
 *  160 on, 200 off from u = -2800 to -700; six per building, mirrored. Height 16 m (E). */
function satellitesInput(): CampusSatellites {
  const us = [-2720, -2360, -2000, -1640, -1280, -920], centres: V2[] = [];
  for (const b of BUILDINGS) for (const u of us) centres.push([u * b.mirror[0], -685 * b.mirror[1]]);
  return { size: [160, 110, 16], roofUnit: [40, 24, 5], centres, colour: '#b3b5b2', roofColour: '#3b4148' };
}

/** Light standards (E): both sides of the split road 3 m outside its edge every 72 m (the bay rhythm) from the ring to
 *  the car ends, not under the canopies; four round the roundabout; two pairs along each cross-pass stub. */
function lightsInput(roads: CampusRoads): CampusLights {
  const poles: { at: V2; headingDeg: number }[] = [], edge = roads.split.halfWidth + 3;
  for (let u = 140; u <= roads.split.carEnd - 10; u += 72) for (const su of [-1, 1]) {
    if (u >= 3950 && u <= 4120) continue;
    for (const sv of [-1, 1]) poles.push({ at: [su * u, sv * edge], headingDeg: sv > 0 ? -90 : 90 });
  }
  const ringR = roads.roundabout.radius + 4;
  for (const deg of [30, 150, 210, 330]) { const a = deg * Math.PI / 180; poles.push({ at: [r3(ringR * Math.cos(a)), r3(ringR * Math.sin(a))], headingDeg: deg - 180 }); }
  for (const sv of [-1, 1]) for (const v of [150, 200]) for (const su of [-1, 1]) poles.push({ at: [su * (roads.cross.halfWidth + 3), sv * v], headingDeg: su > 0 ? 180 : 0 });
  return { pole: { height: 12, radius: 0.14, arm: 2.5, head: [0.9, 0.25, 0.35] }, poles, colour: '#8e9296', headColour: '#3b4148', lampColour: '#fff1dc' };
}

// ---------------------------------------------------------------- exterior tiers, views and looks (E)

const TIERS: Record<CampusTierName, CampusTier> = {
  minimal: { fullWithin: 800, parking: 0.3, trafficHeadway: 18, trafficPerLane: 30, trafficLod: [30, 120, 700], far: 26000 },
  economy: { fullWithin: 1200, parking: 0.5, trafficHeadway: 12, trafficPerLane: 50, trafficLod: [40, 160, 1000], far: 30000 },
  balanced: { fullWithin: 1800, parking: 0.75, trafficHeadway: 9, trafficPerLane: 70, trafficLod: [50, 200, 1400], far: 36000 },
  high: { fullWithin: 2400, parking: 1, trafficHeadway: 7, trafficPerLane: 90, trafficLod: [60, 250, 1800], far: 40000 },
};
const VIEWS: Record<CampusViewName, CampusView> = {
  campus: { position: [-3400, 3000, -6400], target: [-150, 0, 0], fov: 40, label: 'Whole campus' },
  pair: { position: [-5300, 900, -2300], target: [-2000, 20, 0], fov: 40, label: 'One pair' },
  canopy: { position: [-4460, 45, -250], target: [-4030, 14, -10], fov: 50, label: 'Arrival canopy' },
  split: { position: [-3920, 85, 0], target: [-2400, 35, 0], fov: 50, label: 'The split' },
  bridge: { position: [-1760, 3, 26], target: [-1971, 32, 0], fov: 60, label: 'Under a bridge' },
  roundabout: { position: [-330, 170, -260], target: [0, 0, 0], fov: 45, label: 'Roundabout' },
};
const DAY: CampusLook = {
  zenith: '#6e9bcb', horizon: '#d8e2ea', ground: '#7b8a6a',
  fog: { colour: '#d8e2ea', near: 2500, far: 26000 },
  sun: { colour: '#fff3e2', intensity: 2.6, azimuthDeg: 222, elevationDeg: 42 },
  hemisphere: { sky: '#dbe7f2', ground: '#8b8a7a', intensity: 1.1 },
  environmentIntensity: 0.8, exposure: 1,
  // Contract materials table: edge-lit strips "the scene dims them by day"; the other emissives stay as exported.
  emissive: { 'edge-lit': 0.25, 'rooflight-warm': 1, 'port-lit': 1, 'soffit-lit': 1 },
  lamps: 0,
};

// ---------------------------------------------------------------- blueprint regions (south-west, mirrored per building)

type Region = { kind: 'poly'; pts: V2[] } | { kind: 'rect'; u: V2; v: V2 } | { kind: 'stroke'; pts: V2[]; half: number };
const HEAD_SW: V2[] = [[-3960, -832], [-3960, -110], [-3015, -110], [-3015, -490], [-3495, -832]];
function hallBodySW(): V2[] {
  const pts: V2[] = [[-3015, -490], [-423, -490]];
  for (let k = 1; k <= 64; k++) pts.push(quadBezier([[-423, -490], [-243, -490], [-243, -300]], k / 64));
  pts.push([-243, -110], [-3015, -110]);
  return pts;
}
const CANOPY_SW: V2[] = [[-3960, -60], [-4040, -150], [-4110, -150], [-4060, -40], [-4060, 40], [-4110, 150], [-4040, 150], [-3960, 60]];
const mirrorPts = (pts: readonly V2[], m: V2): V2[] => pts.map(p => [p[0] * m[0], p[1] * m[1]]);
function inPoly(pts: readonly V2[], u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a[1] > v) !== (b[1] > v) && u < (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function segDist(u: number, v: number, a: V2, b: V2): number {
  const du = b[0] - a[0], dv = b[1] - a[1], l2 = du * du + dv * dv, t = l2 ? Math.max(0, Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / l2)) : 0;
  return Math.hypot(u - a[0] - du * t, v - a[1] - dv * t);
}
/** Distance outside a region (0 inside). */
function outside(r: Region, u: number, v: number): number {
  if (r.kind === 'rect') return Math.hypot(Math.max(r.u[0] - u, 0, u - r.u[1]), Math.max(r.v[0] - v, 0, v - r.v[1]));
  if (r.kind === 'stroke') { let d = Infinity; for (let k = 0; k + 1 < r.pts.length; k++) d = Math.min(d, segDist(u, v, r.pts[k]!, r.pts[k + 1]!)); return Math.max(0, d - r.half); }
  if (inPoly(r.pts, u, v)) return 0;
  let d = Infinity;
  for (let k = 0; k < r.pts.length; k++) d = Math.min(d, segDist(u, v, r.pts[k]!, r.pts[(k + 1) % r.pts.length]!));
  return d;
}
/** An SVG stroke of a three-point polyline with the default mitre join and butt caps, as a polygon. */
function mitredStroke(pts: readonly [V2, V2, V2], half: number): V2[] {
  const normal = (a: V2, b: V2): V2 => { const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv); return [-dv / l * half, du / l * half]; };
  const [a, o, b] = pts, n1 = normal(a, o), n2 = normal(o, b);
  // The offset lines of the two segments on one side meet at the mitre point.
  const meet = (p1: V2, d1: V2, p2: V2, d2: V2): V2 => {
    const den = d1[0] * d2[1] - d1[1] * d2[0], t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
    return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
  };
  const d1: V2 = [o[0] - a[0], o[1] - a[1]], d2: V2 = [b[0] - o[0], b[1] - o[1]];
  const side = (k: number): V2 => meet([a[0] + k * n1[0], a[1] + k * n1[1]], d1, [o[0] + k * n2[0], o[1] + k * n2[1]], d2);
  return [[a[0] + n1[0], a[1] + n1[1]], side(1), [b[0] + n2[0], b[1] + n2[1]], [b[0] - n2[0], b[1] - n2[1]], side(-1), [a[0] - n1[0], a[1] - n1[1]]];
}
function regionsFor(p: Omit<CampusPlacement, 'bounds' | 'farBounds'>): { regions: Region[]; source: string } {
  const b = BUILDINGS.find(x => x.id === p.building);
  if (p.piece === 'S1' && b) return { regions: [{ kind: 'poly', pts: mirrorPts(HEAD_SW, b.mirror) }], source: 'blueprint head polygon (-3960,-832) (-3960,-110) (-3015,-110) (-3015,-490) (-3495,-832), mirrored' };
  if (p.piece === 'S2' && b) return {
    regions: [
      { kind: 'poly', pts: mirrorPts(hallBodySW(), b.mirror) },
      { kind: 'rect', u: [Math.min(-2990 * b.mirror[0], -500 * b.mirror[0]), Math.max(-2990 * b.mirror[0], -500 * b.mirror[0])], v: [Math.min(-560 * b.mirror[1], -490 * b.mirror[1]), Math.max(-560 * b.mirror[1], -490 * b.mirror[1])] },
      { kind: 'rect', u: [Math.min(-2950 * b.mirror[0], -560 * b.mirror[0]), Math.max(-2950 * b.mirror[0], -560 * b.mirror[0])], v: [Math.min(-110 * b.mirror[1], -60 * b.mirror[1]), Math.max(-110 * b.mirror[1], -60 * b.mirror[1])] },
    ],
    source: 'blueprint hall path (M -3015 -490 H -423 Q -243 -490 -243 -300 L -243 -110 H -3015 Z) and pod rows (v -525 stroke 70 over u -2990..-500; v -85 stroke 50 over u -2950..-560), mirrored',
  };
  if (p.piece === 'S3') {
    const s = p.position[2] < 0 ? 1 : -1, apex = p.position[2];
    // Contract S3 (review 1) runs the arms to (+-271, -150) in the link frame, the swept hall faces, where the blueprint
    // chevron (M -170 -420 L 0 -270 L 170 -420, stroke 60) stops at +-170; the arm ends are inside the halls.
    // The blueprint draws the chevron as an SVG stroke with the default joins and caps (mitred apex, butt ends). The
    // contract runs the arms to (+-271, -150) where their centrelines meet the swept hall faces; the arm ends are the
    // author's joint with the sweep, so the region continues the arms inside the halls (75 m further along each arm,
    // to the halls' outer face line) and adds the halls themselves.
    const halls = BUILDINGS.filter(x => Math.sign(x.position[2]) === Math.sign(apex)).map(x => ({ kind: 'poly', pts: mirrorPts(hallBodySW(), x.mirror) }) as Region);
    const k = (309.7 + 75) / 309.7;
    return { regions: [{ kind: 'poly', pts: mitredStroke([[-271 * k, apex - 150 * k * s], [0, apex], [271 * k, apex - 150 * k * s]], 30) }, ...halls], source: 'contract S3 chevron (arms to +-271, -150 at the swept hall faces, 60 wide, continued 75 m inside the halls; the blueprint stroke\'s mitred apex) and the two halls it joins (the blueprint chevron\'s arms end at +-170)' };
  }
  if (p.piece === 'S4') return { regions: [{ kind: 'poly', pts: p.position[0] < 0 ? CANOPY_SW : mirrorPts(CANOPY_SW, [-1, 1]) }], source: 'blueprint canopy polygon (-3960,-60) (-4040,-150) (-4110,-150) (-4060,-40) (-4060,40) (-4110,150) (-4040,150) (-3960,60), mirrored' };
  return { regions: [{ kind: 'rect', u: [p.position[0] - 80, p.position[0] + 80], v: [-140, 140] }], source: 'contract S5 (revision 3; blueprint v7 predates the bridges): 160 wide at the faces, landings to |v| 140' };
}
/** Parts allowed to stand proud of the blueprint outline, by the clause that puts them there (overhang allowed, m). */
const ALLOWANCES: { piece: string; part: RegExp; allowed: number; clause: string }[] = [
  { piece: 'S1', part: /^frontFins$/, allowed: 0.6, clause: 'contract Head (S1): the front face carries trim-graphite fins 0.6 m deep' },
  { piece: 'S1', part: /^entrancePortal$/, allowed: 0.6, clause: 's1-head-half.md: entrancePortal frame 2 m deep around the opening' },
  { piece: 'S2', part: /^bayFins$/, allowed: 0.6, clause: 's2-hall-half.md: bayFins 0.6 deep on both faces' },
  { piece: 'S2', part: /^(outerPods|splitPods)$/, allowed: 12, clause: 'contract revision 3 (port pods): each podCanopy projects 12 beyond the loading face' },
];
const TOLERANCE = 0.5;

// ---------------------------------------------------------------- checks

/** Caps (triangles lying in the seam plane u = s) per part, and how far the model reaches either side of the plane. */
function seamPlane(parts: readonly Part[], s: number, eps = 1e-3) {
  let caps = 0, lo = Infinity, hi = -Infinity;
  const byPart: Record<string, number> = {};
  for (const part of parts) {
    for (let t = 0; t < part.count; t++) {
      const o = t * 9, T = part.tris;
      if (Math.abs(T[o]! - s) < eps && Math.abs(T[o + 3]! - s) < eps && Math.abs(T[o + 6]! - s) < eps) { caps++; byPart[part.name] = (byPart[part.name] ?? 0) + 1; }
    }
    for (let k = 0; k < part.tris.length; k += 3) { const d = part.tris[k]! - s; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  }
  return { caps, byPart, extreme: [lo, hi] as V2 };
}

/** A model cut by the plane u = c: the cut segments per part as (v - vc, Y) pairs. */
function cut(parts: readonly Part[], c: number, vc: number): { part: string; a: V2; b: V2 }[] {
  const out: { part: string; a: V2; b: V2 }[] = [];
  for (const part of parts) for (let t = 0; t < part.count; t++) {
    const o = t * 9, T = part.tris, d = [T[o]! - c, T[o + 3]! - c, T[o + 6]! - c];
    if ((d[0]! > 0 && d[1]! > 0 && d[2]! > 0) || (d[0]! < 0 && d[1]! < 0 && d[2]! < 0)) continue;
    const pts: V2[] = [];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
      if ((d[i]! > 0) === (d[j]! > 0)) continue;
      const k = d[i]! / (d[i]! - d[j]!);
      pts.push([T[o + i * 3 + 2]! + (T[o + j * 3 + 2]! - T[o + i * 3 + 2]!) * k - vc, T[o + i * 3 + 1]! + (T[o + j * 3 + 1]! - T[o + i * 3 + 1]!) * k]);
    }
    if (pts.length === 2) out.push({ part: part.name, a: pts[0]!, b: pts[1]! });
  }
  return out;
}

type CutSeg = { part: string; a: V2; b: V2 };
const OUTLINE_BIN = 0.05, OUTLINE_V: V2 = [-192, 192], OUTLINE_Y: V2 = [-1, 54];
/** The outer outline of a cut as seen from outside the building, as samples: per 5 cm row of Y the outermost point
 *  either side, per 5 cm column of v the highest point, each at its actual position with the part that made it (the
 *  lowest points stand on grade and are never seen; the base is measured by contractOutline). Robust to open interior
 *  surfaces (no fill). */
function outlineSamples(segs: readonly CutSeg[]): { v: number; y: number; part: string }[] {
  const rows = Math.round((OUTLINE_Y[1] - OUTLINE_Y[0]) / OUTLINE_BIN), cols = Math.round((OUTLINE_V[1] - OUTLINE_V[0]) / OUTLINE_BIN);
  type S = { v: number; y: number; part: string } | undefined;
  const left: S[] = new Array(rows), right: S[] = new Array(rows), top: S[] = new Array(cols);
  for (const s of segs) {
    const n = Math.max(1, Math.ceil(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / 0.005));
    for (let k = 0; k <= n; k++) {
      const v = s.a[0] + (s.b[0] - s.a[0]) * k / n, y = s.a[1] + (s.b[1] - s.a[1]) * k / n;
      const j = Math.floor((y - OUTLINE_Y[0]) / OUTLINE_BIN), i = Math.floor((v - OUTLINE_V[0]) / OUTLINE_BIN), p = { v, y, part: s.part };
      if (j >= 0 && j < rows) { if (!left[j] || v < left[j]!.v) left[j] = p; if (!right[j] || v > right[j]!.v) right[j] = p; }
      if (i >= 0 && i < cols) { if (!top[i] || y > top[i]!.y) top[i] = p; }
    }
  }
  return [...left, ...right, ...top].filter((p): p is { v: number; y: number; part: string } => !!p);
}
/** Parts whose outline differs at the seam by a recorded decision: the clause, and the largest difference it explains
 *  (the feature's own size). A sample farther than 5 mm from the other model is explained when it belongs to such a
 *  part or when the other model has that part within the radius. */
const SEAM_KNOWN: Record<string, { radius: number; clause: string }> = {
  edgeLights: { radius: 0.11, clause: 'the lit parapet strip: S1 (accepted 15:00) inlays it in the top 0.3 m of the parapet\'s outer face; S2 (review 2) puts it on top of the parapet, 0.3 wide and 0.1 tall (the rule settled at the head\'s second round); the coordinator\'s seam check (OVERNIGHT.md 16:05) kept S1 accepted, no head round 3' },
  panelSeams: { radius: 0.06, clause: 'the half grooves at the seam (0.05 deep): S1\'s stop 0.3 m below the wall top and start 0.1 m above the plinth top (contract rule of 15:00); S2\'s run the full wall height' },
};
/** From each outline sample of A, the distance to the nearest cut surface of B (any part); a sample farther than 5 mm
 *  is explained by a known part (SEAM_KNOWN) or unexplained. */
function outlineDistance(samples: readonly { v: number; y: number; part: string }[], segs: readonly CutSeg[]) {
  const cell = 0.5, grid = new Map<string, CutSeg[]>();
  for (const s of segs) {
    const i0 = Math.floor(Math.min(s.a[0], s.b[0]) / cell), i1 = Math.floor(Math.max(s.a[0], s.b[0]) / cell), j0 = Math.floor(Math.min(s.a[1], s.b[1]) / cell), j1 = Math.floor(Math.max(s.a[1], s.b[1]) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = `${i},${j}`, l = grid.get(k); if (l) l.push(s); else grid.set(k, [s]); }
  }
  let worst = 0, unexplained = 0, where = '';
  const known: Record<string, { maxM: number; at: V2; within: boolean }> = {};
  for (const p of samples) {
    let best = Infinity, near = '';
    const partNear: Record<string, number> = {};
    const i = Math.floor(p.v / cell), j = Math.floor(p.y / cell);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const s of grid.get(`${i + di},${j + dj}`) ?? []) {
      const d = segDist(p.v, p.y, s.a, s.b);
      if (d < best) { best = d; near = s.part; }
      if (SEAM_KNOWN[s.part] && d < (partNear[s.part] ?? Infinity)) partNear[s.part] = d;
    }
    if (!Number.isFinite(best)) for (const s of segs) { const d = segDist(p.v, p.y, s.a, s.b); if (d < best) { best = d; near = s.part; } }
    worst = Math.max(worst, best);
    if (best <= 0.005) continue;
    const exempt = SEAM_KNOWN[p.part] ? p.part : Object.keys(partNear).find(k => partNear[k]! <= SEAM_KNOWN[k]!.radius) ?? null;
    if (exempt) {
      const r = known[exempt];
      if (!r || best > r.maxM) known[exempt] = { maxM: r3(best), at: [r3(p.v), r3(p.y)], within: best <= SEAM_KNOWN[exempt]!.radius };
    } else if (best > unexplained) { unexplained = best; where = `${p.part} at (${r3(p.v)}, ${r3(p.y)}), nearest ${near} ${r3(best)} m`; }
  }
  return { worstM: r3(worst), unexplainedM: r3(unexplained), where, known };
}
/** The contract's outline, extrapolated to the seam plane from two cuts beyond the half grooves (the taper wall and
 *  deck leave the seam at an angle): the wall faces between the plinth and the first reveal (Y 4 to 20), the deck top
 *  clear of the monitor and parapets (v - centreline = +-100), and the lowest point of the envelope. */
function contractOutline(first: readonly CutSeg[], second: readonly CutSeg[], d1: number, d2: number) {
  const measure = (segs: readonly CutSeg[]) => {
    let w0 = Infinity, w1 = -Infinity, base = Infinity;
    const deck = [-Infinity, -Infinity];
    for (const s of segs) {
      const n = Math.max(1, Math.ceil(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / 0.005));
      for (let k = 0; k <= n; k++) {
        const v = s.a[0] + (s.b[0] - s.a[0]) * k / n, y = s.a[1] + (s.b[1] - s.a[1]) * k / n;
        if (y >= 4 && y <= 20) { w0 = Math.min(w0, v); w1 = Math.max(w1, v); }
        base = Math.min(base, y);
        [-100, 100].forEach((c, q) => { if (Math.abs(v - c) <= 0.025) deck[q] = Math.max(deck[q]!, y); });
      }
    }
    return [w0, w1, deck[0]!, deck[1]!, base];
  };
  const a = measure(first), b = measure(second), at0 = a.map((x, k) => x - (b[k]! - x) * d1 / (d2 - d1));
  return { walls: [r3(at0[0]!), r3(at0[1]!)] as V2, deckTop: [r3(at0[2]!), r3(at0[3]!)], base: r3(Math.min(a[4]!, b[4]!)) };
}

const SLAB = /slab|floor|ceiling/i;
/** Interior slab bands at the seam: the waffle slab and its raised clean floor form one band per level. */
const SLAB_BANDS: Record<string, string[]> = {
  floorSlab: ['floorSlab'], level1: ['waffleSlabL1', 'cleanFloorL1'], ffuCeilingL1: ['ffuCeilingL1'], slabL2: ['slabL2'],
  level2: ['waffleSlabL2', 'cleanFloorL2'], ffuCeilingL2: ['ffuCeilingL2'], topSlab: ['topSlab'],
};
function slabBands(segs: readonly CutSeg[]): Record<string, V2 | null> {
  const out: Record<string, V2 | null> = {};
  for (const [band, parts] of Object.entries(SLAB_BANDS)) {
    let lo = Infinity, hi = -Infinity;
    for (const s of segs) if (parts.includes(s.part)) { lo = Math.min(lo, s.a[1], s.b[1]); hi = Math.max(hi, s.a[1], s.b[1]); }
    out[band] = Number.isFinite(lo) ? [r3(lo), r3(hi)] : null;
  }
  return out;
}

function seamsCheck(): CampusCheck {
  const buildings: Record<string, unknown> = {};
  let pass = true;
  for (const b of BUILDINGS) {
    const s = b.position[0], vc = b.position[2], headParts = placedParts(b.head, b.position, b.yawDeg), hallParts = placedParts(b.hall, b.position, b.yawDeg);
    const head = seamPlane(headParts, s), hall = seamPlane(hallParts, s);
    // The head lies on the side away from the hall: SW and SE heads at u < s, NE and NW at u > s.
    const toward = b.yawDeg ? -1 : 1;
    const headReach = toward > 0 ? head.extreme[1] : -head.extreme[0], hallReach = toward > 0 ? -hall.extreme[0] : hall.extreme[1];
    const cuts = (d: number) => ({ head: cut(headParts, s - toward * d, vc), hall: cut(hallParts, s + toward * d, vc) });
    // The outline and slabs 1.37 mm inside each model (both half grooves present, the taper's lean under 1 mm).
    const near = cuts(0.00137), outline = { headToHall: outlineDistance(outlineSamples(near.head), near.hall), hallToHead: outlineDistance(outlineSamples(near.hall), near.head) };
    const d1 = 0.0637, d2 = 0.1137, c1 = cuts(d1), c2 = cuts(d2);
    const lineHead = contractOutline(c1.head, c2.head, d1, d2), lineHall = contractOutline(c1.hall, c2.hall, d1, d2);
    const contractOk = [lineHead, lineHall].every(l => Math.abs(l.walls[0] + 190) <= 0.005 && Math.abs(l.walls[1] - 190) <= 0.005 && l.deckTop.every(y => Math.abs(y - 46) <= 0.02) && Math.abs(l.base) <= 0.005);
    const envelopeCaps = (p: ReturnType<typeof seamPlane>) => Object.entries(p.byPart).filter(([k]) => !SLAB.test(k)).reduce((n, [, c]) => n + c, 0);
    const caps = { head: envelopeCaps(head), hall: envelopeCaps(hall) };
    const bandsHead = slabBands(near.head), bandsHall = slabBands(near.hall);
    // Every band's top matches; every band's underside matches except the ground slab's, which lies on grade.
    const slabRows = Object.fromEntries(Object.keys(SLAB_BANDS).map(k => {
      const h = bandsHead[k], l = bandsHall[k], top = !!h && !!l && Math.abs(h[1] - l[1]) < 0.005, under = !!h && !!l && Math.abs(h[0] - l[0]) < 0.005;
      return [k, { head: h, hall: l, pass: top && (under || k === 'floorSlab'), ...(k === 'floorSlab' && !under ? { note: 'S1 builds no underside on grade (never seen)' } : {}) }];
    }));
    const slabsOk = Object.values(slabRows).every(r => r.pass);
    const outlineOk = [outline.headToHall, outline.hallToHead].every(o => o.unexplainedM <= 0.005 && Object.values(o.known).every(k => k.within));
    const ok = caps.head === 0 && caps.hall === 0 && Math.abs(headReach) < 1e-3 && Math.abs(hallReach) < 1e-3 && outlineOk && contractOk && slabsOk;
    pass &&= ok;
    buildings[b.id] = {
      pass: ok, seamU: s,
      /** How far each model passes the seam plane toward the other (0 = meets it exactly; positive = overlap, negative = gap). */
      reachPastSeam: { head: r3(headReach), hall: r3(hallReach) },
      caps: { envelope: caps, interiorSlabs: { head: head.caps - caps.head, hall: hall.caps - caps.hall }, byPart: { head: head.byPart, hall: hall.byPart } },
      contractOutline: { head: lineHead, hall: lineHall },
      outerOutline: outline,
      slabBands: slabRows,
    };
  }
  return {
    name: 'seams', pass, measured: { buildings, known: SEAM_KNOWN, cuts: 'outline and slabs 1.37 mm inside each model; the contract outline extrapolated to the plane from 63.7 and 113.7 mm' },
    rule: 'item 1 and the contract\'s Seam face: each S1 and its S2 meet on the seam plane (both reach it, neither passes it by 1 mm: no gap); no envelope triangle lies in the plane (no cap); on both the outline is v +-190 about the centreline (wall faces between plinth and first reveal) and Y 0 up to the deck at 46 (the contract\'s 20 mm deck tolerance), within 5 mm; the outer outlines are identical: every outline sample of either model (the outermost point per 5 cm of Y either side, the highest and lowest per 5 cm of v) lies within 5 mm of the other model\'s surface, except the parts listed in `known` with their recorded decision and measured difference; every interior slab band reaches the seam at the same Y (5 mm; the ground slab\'s underside on grade excepted). Interior-slab caps are measured and listed: they lie inside the joined slabs',
  };
}

function negativeScaleCheck(placements: readonly Omit<CampusPlacement, 'bounds' | 'farBounds'>[]): CampusCheck {
  let nodes = 0, negative = 0, mirrored = 0;
  const models = new Set<string>();
  for (const p of placements) for (const id of [p.model, ...(p.far ? [p.far] : [])]) {
    models.add(id);
    const { tree } = structure(id), m = Float64Array.from(placementMatrix(p.position, p.yawDeg)), world = worldMatrices(tree, undefined, m);
    for (const n of tree.nodes) { nodes++; if (n.s.some(x => x < 0)) negative++; const w = world[n.index]; if (w && det3(w) < 0) mirrored++; }
  }
  const placementDets = placements.map(p => r3(det3(Float64Array.from(placementMatrix(p.position, p.yawDeg)))));
  return { name: 'negative-scale', pass: negative === 0 && mirrored === 0 && placementDets.every(d => d > 0), measured: { placedNodes: nodes, models: models.size, negativeScales: negative, mirroredWorldMatrices: mirrored, placementDeterminants: [...new Set(placementDets)] }, rule: 'item 1: no negative scale on any node (every placed node, the placement included, has a positive determinant)' };
}

function clearHeightCheck(placements: readonly Omit<CampusPlacement, 'bounds' | 'farBounds'>[], roads: CampusRoads): CampusCheck {
  const bridges: Record<string, unknown> = {};
  let pass = true;
  for (const p of placements.filter(x => x.piece === 'S5')) {
    const under = (id: string) => {
      let low = Infinity;
      for (const part of placedParts(id, p.position, p.yawDeg)) for (let t = 0; t < part.count; t++) {
        const o = t * 9, T = part.tris, v0 = Math.min(T[o + 2]!, T[o + 5]!, T[o + 8]!), v1 = Math.max(T[o + 2]!, T[o + 5]!, T[o + 8]!);
        if (v1 < -roads.split.halfWidth || v0 > roads.split.halfWidth) continue;
        low = Math.min(low, T[o + 1]!, T[o + 4]!, T[o + 7]!);
      }
      return r3(low - roads.gradeY);
    };
    const full = under(p.model), far = p.far ? under(p.far) : null, ok = Math.abs(full - 29.4) < 1e-3 && (far === null || Math.abs(far - 29.4) < 1e-3);
    pass &&= ok;
    bridges[p.id] = { u: p.position[0], clearM: full, farClearM: far, pass: ok };
  }
  return { name: 'clear-height', pass, measured: { bridges }, rule: 'item 1 and contract S5: every bridge clears the road (|v| <= 40, the split road) by 29.4 m, full and far shell, measured on the placed meshes' };
}

function paved(roads: CampusRoads) {
  const S = roads.split, C = roads.cross, R = roads.roundabout;
  const rects = [{ u: S.u, v: [-S.halfWidth, S.halfWidth] as V2 }, { u: [-C.halfWidth, C.halfWidth] as V2, v: [-C.v, C.v] as V2 }, ...roads.dropOff];
  return (u: number, v: number) => {
    let d = Math.hypot(u, v) - R.radius;
    for (const r of rects) { const du = Math.max(r.u[0] - u, u - r.u[1]), dv = Math.max(r.v[0] - v, v - r.v[1]); d = Math.min(d, Math.hypot(Math.max(du, 0), Math.max(dv, 0)) + Math.min(Math.max(du, dv), 0)); }
    return Math.max(d, R.island + R.kerb - Math.hypot(u, v));
  };
}

// ---------------------------------------------------------------- the build

export function buildCampus(): { data: CampusData; problems: string[] } {
  const problems: string[] = [];
  const specs = placementSpecs();
  // Models: measured from the verified files.
  const models: Record<string, CampusModel> = {};
  for (const id of new Set(specs.flatMap(p => [p.model, ...(p.far ? [p.far] : [])]))) {
    const s = STRUCTURES[id]!, m = measureStructure(structure(id).file, structure(id).tree);
    models[id] = {
      piece: s.piece, kind: s.kind, tier: s.tier, far: FAR[id] ?? null, glb: `models/structures/${s.file}`, revision: s.revision, bytes: s.bytes, sha256: s.sha256,
      triangles: m.triangles, meshes: m.meshes, materials: m.materials.map(x => x.name), bounds: { min: v3(m.bounds.min), max: v3(m.bounds.max) },
    };
  }
  const placements: CampusPlacement[] = specs.map(p => ({ ...p, bounds: partsBounds(placedParts(p.model, p.position, p.yawDeg)), farBounds: p.far ? partsBounds(placedParts(p.far, p.position, p.yawDeg)) : null }));

  // The cross-pass stubs stop 15 m short of the links' near faces; the outer legs start 15 m beyond their far faces
  // (measured on the placed links' plan footprint over the cross pass, |u| <= 60: every triangle edge sampled every
  // 0.25 m, so faces that cross the strip without a vertex in it count).
  let linkNear = Infinity, linkFar = 0;
  const crossHalf = roadsInput(0, 0).cross.halfWidth;
  for (const p of specs.filter(x => x.piece === 'S3')) for (const part of placedParts(p.model, p.position, p.yawDeg)) for (let t = 0; t < part.count; t++) {
    const o = t * 9, T = part.tris;
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
      const au = T[o + i * 3]!, av = T[o + i * 3 + 2]!, bu = T[o + j * 3]!, bv = T[o + j * 3 + 2]!, n = Math.max(1, Math.ceil(Math.hypot(bu - au, bv - av) / 0.25));
      for (let k = 0; k <= n; k++) {
        const u = au + (bu - au) * k / n, v = Math.abs(av + (bv - av) * k / n);
        if (Math.abs(u) > crossHalf) continue;
        linkNear = Math.min(linkNear, v); linkFar = Math.max(linkFar, v);
      }
    }
  }
  const roads = roadsInput(Math.floor(linkNear - 15), Math.ceil(linkFar + 15));
  const lanes = buildLanes(roads, LANE_SPEEDS).map(l => ({ ...l, length: r3(l.length), segments: l.segments.map(s => s.kind === 'line' ? { ...s, from: [r3(s.from[0]), r3(s.from[1])] as V2, to: [r3(s.to[0]), r3(s.to[1])] as V2, length: r3(s.length) } : { ...s, centre: [r3(s.centre[0]), r3(s.centre[1])] as V2, start: Math.round(s.start * 1e9) / 1e9, sweep: Math.round(s.sweep * 1e9) / 1e9, radius: r3(s.radius), length: r3(s.length) }) }));
  const parking = parkingInput(), satellites = satellitesInput(), lights = lightsInput(roads);

  // Interior locator: the south-west head's level 1 behind the atrium, in line with the entrance and the canopy.
  const sw = specs.find(p => p.id === 'SW-head')!, layout = JSON.parse(readFileSync(resolve(PACKAGE, 'data/layout.json'), 'utf8')) as { scene: { x: V2; z: V2 }; levels: Record<string, V2>; heights: Record<string, number> };
  const local: V3 = [-760, 8, 115], yawDeg = -90, campus = placePoint(sw.position, sw.yawDeg, ...local);
  const twin = (x: number, z: number) => placePoint(campus, yawDeg, x, 0, z);
  const corners = [twin(layout.scene.x[0], layout.scene.z[0]), twin(layout.scene.x[1], layout.scene.z[1])];
  const headLoc = measureStructure(structure('s1-head-W').file, structure('s1-head-W').tree).locators;
  const interior = {
    building: 'SW', placement: 'SW-head', buildingFrame: local, campus: v3(campus), yawDeg, level: 1 as const, walkingSurfaceY: 8,
    twinExtents: { x: layout.scene.x, z: layout.scene.z },
    campusExtents: { u: [r3(Math.min(corners[0]![0], corners[1]![0])), r3(Math.max(corners[0]![0], corners[1]![0]))] as V2, v: [r3(Math.min(corners[0]![2], corners[1]![2])), r3(Math.max(corners[0]![2], corners[1]![2]))] as V2 },
    entrance: v3(placePoint(sw.position, sw.yawDeg, ...(headLoc['entrance'] as V3))), canopyDropOff: v3(placePoint([-3960, 0, 0], 0, -60, 0, 0)),
    enterZone: { u: [-4110, -3960] as V2, v: [-60, 60] as V2, maxSpeed: 4 }, orbitEnterDistance: 700,
    note: 'FF2 frame to campus: the twin origin (its walking surface) at the locator, turned -90 degrees about Y, so FF2 +X (east) runs along campus +v and FF2 +Z (south) along campus -u; its gallery faces the atrium and the entrance. Inside, the scene renders the twin in its own frame (a floating origin at the locator) with the exterior hidden.',
  };

  // Solids for the orbit floor and camera obstruction: every exterior part of every placed full model.
  const solids: CampusSolid[] = [];
  for (const p of specs) for (const part of placedParts(p.model, p.position, p.yawDeg)) {
    if (SLAB.test(part.name) || /^atrium/.test(part.name)) continue;
    const b = partsBounds([part]);
    solids.push({ placement: p.id, part: part.name, min: [r1(b.min[0]), r1(b.min[1]), r1(b.min[2])], max: [r1(b.max[0]), r1(b.max[1]), r1(b.max[2])] });
  }

  // ------------------------------------------------ checks
  const checks: CampusCheck[] = [seamsCheck(), negativeScaleCheck(specs), clearHeightCheck(specs, roads)];

  // Road profile: every ground vertex at grade.
  const layers = groundLayers(roads, parking);
  let vertices = 0, maxDy = 0;
  for (const l of layers) for (let k = 1; k < l.mesh.positions.length; k += 3) { vertices++; maxDy = Math.max(maxDy, Math.abs(l.mesh.positions[k]! - roads.gradeY)); }
  checks.push({ name: 'road-profile', pass: maxDy === 0, measured: { vertices, maxOffsetFromGradeM: maxDy, gradeY: roads.gradeY, triangles: Object.fromEntries(layers.map(l => [l.name, l.mesh.triangles])) }, rule: 'item 1: the road profile is flat at grade (every road, marking and ground vertex at the grade height)' });

  // Lanes on the paved surface with a vehicle's half width (the widest accepted vehicle, the bus, is 2.55 m wide). The
  // lanes end where the split road's dissolve stretch ends, so the lateral margin is measured with the road's ends
  // extended (a lane end is not a lateral excursion).
  const pavedSdf = paved(roads), half = 1.3, laneRows: Record<string, unknown> = {};
  const lateralSdf = paved({ ...roads, split: { ...roads.split, u: [roads.split.u[0] - 50, roads.split.u[1] + 50] } });
  let lanesOk = true;
  for (const lane of lanes) {
    let worst = Infinity, worstAt: V2 = [0, 0];
    const pt = { u: 0, v: 0, heading: 0, curvature: 0, segment: 0 };
    for (let s = 0; s <= lane.length; s += 1) { lanePoint(lane, s, pt); const m = -lateralSdf(pt.u, pt.v); if (m < worst) { worst = m; worstAt = [r1(pt.u), r1(pt.v)]; } }
    const ok = worst >= half;
    lanesOk &&= ok;
    laneRows[lane.id] = { lengthM: lane.length, speed: lane.speed, leastMarginM: r3(worst), at: worstAt, pass: ok };
  }
  checks.push({ name: 'lanes-on-road', pass: lanesOk, measured: { lanes: laneRows, halfWidthM: half }, rule: 'item 5: every traffic lane, sampled every 1 m, keeps a vehicle half width (1.3 m) on the paved surface either side (lane ends at the road ends excluded)' });

  // Road envelope: no structure triangle inside the drivable area between 0.05 and 5 m above grade.
  const drive = drivableArea(roads), y0 = roads.gradeY + 0.05, y1 = roads.gradeY + 5;
  const boxes = [...drive.rects.map(r => ({ u: r.u, v: r.v })), { u: [-roads.roundabout.radius, roads.roundabout.radius] as V2, v: [-roads.roundabout.radius, roads.roundabout.radius] as V2 }];
  let tested = 0, hits = 0, least = Infinity;
  const hitParts: Record<string, number> = {};
  for (const p of specs) for (const id of [p.model, ...(p.far ? [p.far] : [])]) for (const part of placedParts(id, p.position, p.yawDeg)) for (let t = 0; t < part.count; t++) {
    const o = t * 9, T = part.tris, ys = [T[o + 1]!, T[o + 4]!, T[o + 7]!];
    if (Math.max(...ys) < y0 || Math.min(...ys) > y1) continue;
    const us = [T[o]!, T[o + 3]!, T[o + 6]!], vs = [T[o + 2]!, T[o + 5]!, T[o + 8]!];
    const bu0 = Math.min(...us), bu1 = Math.max(...us), bv0 = Math.min(...vs), bv1 = Math.max(...vs);
    if (!boxes.some(b => bu1 >= b.u[0] - 2 && bu0 <= b.u[1] + 2 && bv1 >= b.v[0] - 2 && bv0 <= b.v[1] + 2)) continue;
    tested++;
    // Sample the triangle's part inside the height band on a 0.25 m lattice (and its corners).
    const la = Math.hypot(us[1]! - us[0]!, vs[1]! - vs[0]!, ys[1]! - ys[0]!), lb = Math.hypot(us[2]! - us[0]!, vs[2]! - vs[0]!, ys[2]! - ys[0]!);
    const na = Math.min(2000, Math.max(1, Math.ceil(la / 0.25))), nb = Math.min(2000, Math.max(1, Math.ceil(lb / 0.25)));
    let hit = false;
    for (let i = 0; i <= na && !hit; i++) for (let j = 0; j <= nb - Math.floor(i * nb / na) && !hit; j++) {
      const a = i / na, b = j / nb; if (a + b > 1 + 1e-9) continue;
      const y = ys[0]! + (ys[1]! - ys[0]!) * a + (ys[2]! - ys[0]!) * b; if (y < y0 || y > y1) continue;
      const u = us[0]! + (us[1]! - us[0]!) * a + (us[2]! - us[0]!) * b, v = vs[0]! + (vs[1]! - vs[0]!) * a + (vs[2]! - vs[0]!) * b, d = drive.sdf(u, v);
      least = Math.min(least, d);
      if (d <= 0) hit = true;
    }
    if (hit) { hits++; hitParts[`${p.id}/${id}/${part.name}`] = (hitParts[`${p.id}/${id}/${part.name}`] ?? 0) + 1; }
  }
  checks.push({ name: 'road-envelope', pass: hits === 0, measured: { trianglesTested: tested, trianglesInside: hits, byPart: hitParts, leastClearanceM: r3(least), band: [y0, y1], stubEnd: roads.cross.stubEnd, linkNearFaceV: r3(linkNear) }, rule: 'items 1 and 5: no structure triangle (full or far) enters the drivable area (the split road to its car ends, the drop-off bays, the roundabout outside its island, the cross-pass stubs) between 0.05 and 5 m above grade' });

  // Extents: every placed vertex within 0.5 m of the blueprint shape, or within a listed projection.
  const extentRows: Record<string, unknown> = {};
  let extentsOk = true;
  for (const p of specs) {
    const { regions, source } = regionsFor(p);
    for (const id of [p.model, ...(p.far ? [p.far] : [])]) {
      const worst: Record<string, { overhangM: number; at: V2 }> = {}, allowedBy: Record<string, string> = {};
      let placementWorst = 0, placementOk = true;
      for (const part of placedParts(id, p.position, p.yawDeg)) {
        let w = 0, at: V2 = [0, 0];
        for (let k = 0; k < part.tris.length; k += 3) {
          const d = Math.min(...regions.map(r => outside(r, part.tris[k]!, part.tris[k + 2]!)));
          if (d > w) { w = d; at = [r1(part.tris[k]!), r1(part.tris[k + 2]!)]; }
        }
        const allowance = ALLOWANCES.find(a => a.piece === p.piece && a.part.test(part.name));
        const limit = (allowance?.allowed ?? 0) + TOLERANCE;
        if (w > TOLERANCE) { worst[part.name] = { overhangM: r3(w), at }; if (allowance) allowedBy[part.name] = allowance.clause; }
        if (w > limit) placementOk = false;
        placementWorst = Math.max(placementWorst, w);
      }
      extentsOk &&= placementOk;
      extentRows[`${p.id}/${id}`] = { pass: placementOk, worstOverhangM: r3(placementWorst), beyondTolerance: worst, projections: allowedBy, region: source };
    }
  }
  checks.push({ name: 'extents', pass: extentsOk, measured: { placements: extentRows, toleranceM: TOLERANCE }, rule: 'item 1: every placement inside the blueprint\'s extents within 0.5 m (every placed vertex, plan distance outside the blueprint shape); parts the contract or a brief puts proud of the outline are allowed their stated projection plus 0.5 m and listed' });

  // Interior fit: the twin's footprint inside the head's bar, clear of the atrium void, its level bands on the head's.
  const headParts = placedParts('s1-head-W', sw.position, sw.yawDeg), band = (name: string) => partsBounds(headParts.filter(x => x.name === name));
  const bar = { u: [-3960, -3495] as V2, v: [-832, -110] as V2 }, atrium = placedParts('s1-head-W', sw.position, sw.yawDeg).filter(x => x.name === 'atriumParapets');
  const atriumBox = partsBounds(atrium), ce = interior.campusExtents;
  const inBar = ce.u[0] >= bar.u[0] && ce.u[1] <= bar.u[1] && ce.v[0] >= bar.v[0] && ce.v[1] <= bar.v[1];
  const atriumClear = r3(Math.max(ce.u[0] - atriumBox.max[0], atriumBox.min[0] - ce.u[1], ce.v[0] - atriumBox.max[2], atriumBox.min[2] - ce.v[1]));
  const bands = {
    walkingSurface: { head: band('cleanFloorL1').max[1], twin: layout.heights['raisedFloor']! + 8 },
    ffuFace: { head: band('ffuCeilingL1').min[1], twin: layout.heights['ffuFace']! + 8 },
    subfabFloor: { head: band('floorSlab').max[1], twin: layout.heights['subfabFloor']! + 8 },
    levelTop: { head: band('slabL2').min[1], twin: layout.levels['roofSlab']![0] + 8 },
  };
  const bandsOk = Object.values(bands).every(b => Math.abs(b.head - b.twin) < 1e-3);
  // No head part other than the level slabs inside the twin's box (plan footprint, Y 0 to 22).
  let intruders = 0;
  const intruderParts = new Set<string>();
  for (const part of headParts) {
    if (SLAB.test(part.name)) continue;
    for (let t = 0; t < part.count; t++) {
      const o = t * 9, T = part.tris;
      const u0 = Math.min(T[o]!, T[o + 3]!, T[o + 6]!), u1 = Math.max(T[o]!, T[o + 3]!, T[o + 6]!), v0 = Math.min(T[o + 2]!, T[o + 5]!, T[o + 8]!), v1 = Math.max(T[o + 2]!, T[o + 5]!, T[o + 8]!), yy0 = Math.min(T[o + 1]!, T[o + 4]!, T[o + 7]!), yy1 = Math.max(T[o + 1]!, T[o + 4]!, T[o + 7]!);
      if (u1 > ce.u[0] && u0 < ce.u[1] && v1 > ce.v[0] && v0 < ce.v[1] && yy1 > 0.05 && yy0 < 21.95) { intruders++; intruderParts.add(part.name); }
    }
  }
  checks.push({ name: 'interior-fit', pass: inBar && atriumClear >= 10 && bandsOk && intruders === 0, measured: { locator: interior.campus, campusExtents: ce, insideBar: inBar, atriumClearanceM: atriumClear, bands, intrudingTriangles: intruders, intrudingParts: [...intruderParts] }, rule: 'items 1 and 6: the twin\'s plan footprint lies in the south-west head\'s bar, at least 10 m clear of the atrium void; its walking surface, FFU face, subfab floor and level top land on the head\'s level-1 bands (FF2 + 8.0 m); no head part other than the level slabs enters its volume' });

  // Parking, satellites and light standards stay off the roads and out of the buildings.
  const stalls = parkingStalls(parking), heads = BUILDINGS.map(b => mirrorPts(HEAD_SW, b.mirror));
  let stallsOnRoad = 0, stallsInHead = 0;
  for (const st of stalls) { if (pavedSdf(st.u, st.v) < 3) stallsOnRoad++; if (heads.some(h => inPoly(h, st.u, st.v) || h.some((_, k) => segDist(st.u, st.v, h[k]!, h[(k + 1) % h.length]!) < 3))) stallsInHead++; }
  const hallBodies = BUILDINGS.map(b => ({ kind: 'poly', pts: mirrorPts(hallBodySW(), b.mirror) }) as Region);
  const satClear = Math.min(...satellites.centres.map(c => Math.min(...hallBodies.map(h => outside(h, c[0], c[1]))) - satellites.size[1] / 2));
  const poleOnRoad = lights.poles.filter(p => drive.sdf(p.at[0], p.at[1]) < 1).length;
  checks.push({ name: 'dressing-clear', pass: stallsOnRoad === 0 && stallsInHead === 0 && satClear > 70 + 12 && poleOnRoad === 0, measured: { stalls: stalls.length, stallsOnRoad, stallsWithin3mOfHead: stallsInHead, satelliteClearanceToHallM: r3(satClear), polesOnDrivable: poleOnRoad }, rule: 'item 3: parking stall centres at least 3 m off every road and head outline, satellites beyond the outer pods and their canopies (more than 82 m from the hall body), light standards at least 1 m off the drivable area' });

  const discrepancies: CampusDiscrepancy[] = [
    { id: 'blueprint-path', source: 'TASK-FF-CAMPUS-1 Sources', says: 'campus-blueprint-v7.svg is in the same directory as the contract (briefs/)', built: 'read from pack2-research/terafab/campus-blueprint-v7.svg (the contract header names that path)', resolution: 'path corrected; no content difference' },
    { id: 'ten-glbs', source: 'TASK-FF-CAMPUS-1 items 2 and 9', says: 'the ten GLBs', built: 'twelve: the brief\'s own table lists 5 + 5 + 2 files (S1 W/E full and far, S4; S2 W/E full and far, S3; S5 full and far)', resolution: 'all twelve verified against the newest library revision and staged' },
    { id: 's3-blocks-cross-pass', source: `${CONTRACT} S3 and ${BLUEPRINT}`, says: 'the blueprint draws the cross pass (u -60..60) straight through the chevron; the contract builds each link as a closed clad box from grade (Y 0 to 30)', built: `drivable cross-pass stubs from the roundabout to |v| = ${roads.cross.stubEnd} (15 m short of the placed link's near face at |v| = ${r3(linkNear)}); the outer legs from |v| = ${roads.cross.outerFrom} are drawn, not driven, with no traffic`, resolution: 'open decision for the owner: a portal through the link, or the link raised over the road' },
    { id: 'chevron-arms', source: BLUEPRINT, says: 'chevron arms end at u = +-170', built: 'the contract (S3, review 1) and the asset run them to (+-271, -150) in the link frame, the swept hall faces', resolution: 'built as the asset and contract; the extents check uses the contract chevron and the halls it joins' },
    { id: 'bridges-and-pod-canopies', source: `${BLUEPRINT} and ${CONTRACT} revision 3`, says: 'blueprint v7: no bridges along the split; pod rows v -560..-490 and -110..-60', built: 'eight S5 bridges (revision 3 supersedes "no bridges"); pod canopies 12 m beyond the loading faces', resolution: 'contract projections listed in the extents check with their clauses' },
    { id: 'tip-to-tip', source: BLUEPRINT, says: 'text: 1,660 m tip to tip', built: '1,664 m (832 x 2), the contract and the drawn geometry', resolution: 'built as the contract' },
    { id: 'head-top', source: `${CONTRACT} Head (S1)`, says: 'bar roof 70 m', built: `measured head top ${models['s1-head-W']!.bounds.max[1]} m (the roof monitor over the taper; far shell ${models['s1-head-W-far']!.bounds.max[1]} m)`, resolution: 'built as exported (the author\'s question 13 is on record)' },
    { id: 'lanes-and-markings', source: BLUEPRINT, says: 'split road 80 wide and cross pass 120 wide with dashed centre lines; no lanes drawn', built: 'four 4.5 m lanes each way either side of the centre line, solid edge lines at |v| 18.5 and 39.5, the remainder a paved shoulder; a four-lane roundabout (r 85..105) with an apron and a planted island (r 40); estimates (E)', resolution: 'scene design within the blueprint\'s paved outlines' },
    { id: 'drop-off-bays', source: 's4-arrival-canopy.md dropOffKerb', says: 'the canopy kerbs at Z +-60 are the road edge under the back of the roof; the blueprint road is 80 wide (|v| <= 40)', built: 'drop-off bays from the road edge to the kerbs (|v| 40..59.4) under each canopy', resolution: 'both honoured' },
    { id: 'link-arm-ends', source: `${CONTRACT} S3 (review 1)`, says: 'the arms run to (+-271, -150) in the link frame, the swept hall faces', built: 'the asset\'s arm back corners reach (+-265.2, -181.1): 41 m outside the blueprint\'s quadratic hall end, in the corner the sweep leaves open, and 10 m past a square end at +-271', resolution: 'built as the accepted asset; the extents region continues the arms 75 m inside the halls; a visible fact for the owner\'s look review' },
    { id: 'seam-details', source: `${CONTRACT} Seam face and the rules of 15:00`, says: 'S1 and S2 each stop at the seam with no cap; the lit strip sits on top of every parapet; half grooves meet across the join', built: 'measured on the placed meshes: S1 inlays the lit strip in the top 0.3 m of its parapet face while S2 puts it on top (a 0.100 m step at the join); S1\'s half grooves stop 0.3 m below the wall top, S2\'s run the full height (0.051 m); S2 caps its nine interior slabs at the seam (18 triangles per building, inside the joined slabs); S1\'s ground slab has no underside (on grade)', resolution: 'the envelope outline and slab bands match within 5 mm otherwise; the coordinator kept S1 accepted at the seam check (OVERNIGHT.md 16:05); listed for the owner' },
  ];

  const counts = {
    placements: placements.length, models: Object.keys(models).length, solids: solids.length, lanes: lanes.length,
    stalls: stalls.length, occupiedStalls: stalls.filter(s => s.occupied).length, satellites: satellites.centres.length, lightStandards: lights.poles.length,
    lampHeads: lampHeads(lights).length, satelliteBoxes: satelliteBoxes(satellites).body.length,
    groundTriangles: layers.reduce((s, l) => s + l.mesh.triangles, 0),
    fullTriangles: placements.reduce((s, p) => s + models[p.model]!.triangles, 0),
    farTriangles: placements.reduce((s, p) => s + models[p.far ?? p.model]!.triangles, 0),
  };

  const data: CampusData = {
    schema: CAMPUS_SCHEMA,
    generatedBy: 'scripts/build-campus.ts (from the structures contract, the accepted blueprint v7 and the verified structure exports; lanes, markings, parking, satellites, lights, tiers, views and looks are estimates (E) within them)',
    frame: {
      axes: 'x = u (north +), y up, z = v (east +); metres; right-handed', origin: 'the roundabout centre at grade',
      units: 'metres, seconds, degrees', yaw: 'yawDeg about +Y (three.js rotation.y): a model point (x, z) lands at (x cos + z sin, -x sin + z cos) + position',
      contract: CONTRACT, blueprint: BLUEPRINT,
    },
    models, placements, solids, roads, lanes, parking, satellites, lights, interior, tiers: TIERS, views: VIEWS, looks: { day: DAY },
    orbit: { minDistance: 25, maxDistance: 16000, maxPolar: 1.5, clearance: 6, bounds: { min: [-5200, 0, -2600], max: [5200, 300, 2600] } },
    counts, checks, discrepancies,
  };
  // A failed check prints its failing rows only (a row is failing when it carries pass: false).
  const failing = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const rows = Object.entries(value as Record<string, unknown>);
    if (rows.some(([, v]) => v && typeof v === 'object' && 'pass' in (v as object))) return Object.fromEntries(rows.filter(([, v]) => !(v && typeof v === 'object' && (v as { pass?: boolean }).pass === true)).map(([k, v]) => [k, failing(v)]));
    return Object.fromEntries(rows.map(([k, v]) => [k, failing(v)]));
  };
  for (const c of checks) if (!c.pass) problems.push(`check ${c.name} failed: ${JSON.stringify(failing(c.measured)).slice(0, 6000)}`);
  return { data, problems };
}

export const campusJson = (data: CampusData) => `${JSON.stringify(data, null, 1)}\n`;

if (import.meta.main) {
  const write = process.argv.includes('--write'), check = process.argv.includes('--check');
  const { data, problems } = buildCampus(), text = campusJson(data);
  let stale = false;
  try { stale = readFileSync(CAMPUS_PATH, 'utf8') !== text; } catch { stale = true; }
  if (write) writeFileSync(CAMPUS_PATH, text);
  console.log(JSON.stringify({ bytes: new TextEncoder().encode(text).length, stale: write ? false : stale, counts: data.counts, checks: Object.fromEntries(data.checks.map(c => [c.name, c.pass])) }));
  for (const p of problems) console.error(p);
  if (problems.length || (check && stale)) process.exitCode = 1;
}
