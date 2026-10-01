// SPDX-License-Identifier: MIT
// Writes the fab floor as explicit data (D-21: the truth is data) from the rules of the pack's
// simulation spec (sim-spec.md sections 2-5 and 10), the accepted assets as measured from their GLBs
// (data/assets.json, written by scripts/inspect-assets.ts: extents, locators, clip sweeps and the reviews'
// clearance rules) and the research report (b.10 route, b.11 throughput):
//   data/layout.json  placements in metres: levels, bays, spine, rail plan, tools, stockers, UTS, walls,
//                     gallery, section cut, floor robots, people (service points and walk paths), walk areas,
//                     floor paths, named views
//   data/tools.json   the 42 tools, 2 stockers and 32 UTS shelves with their process and reliability data
//   data/route.json   the 240-step route by family
// Every value is an estimate (E) unless it carries its own basis label. Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/build-layout.ts [--write | --check]
// `--check` regenerates in memory and fails when a stored file differs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
type V3 = [number, number, number];
type V2 = [number, number];
/** Values are stored on a 0.1 mm grid so trigonometric residue never reaches the data. */
const q = (x: number) => { const v = Math.round(x * 10000) / 10000; return Object.is(v, -0) ? 0 : v; };
const v3 = (x: number, y: number, z: number): V3 => [q(x), q(y), q(z)];
/** Yaw about +Y in degrees: 0 points local +X along world +X, 180 along -X, -90 along +Z (south), +90 along -Z. */
export function rotateY(yaw: number, p: readonly number[]): V3 {
  const t = yaw * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return [p[0]! * c + p[2]! * s, p[1]!, -p[0]! * s + p[2]! * c];
}
const place = (origin: V3, yaw: number, local: readonly number[]): V3 => { const r = rotateY(yaw, local); return v3(origin[0] + r[0], origin[1] + r[1], origin[2] + r[2]); };
interface Box { min: V3; max: V3 }
/** The world box of a local box under a placement (yaws are multiples of 90 degrees, so boxes stay axis-aligned). */
function placeBox(origin: V3, yaw: number, b: Box): Box {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const z of [b.min[2], b.max[2]]) { const p = place(origin, yaw, [x, 0, z]); xs.push(p[0]); zs.push(p[2]); }
  ys.push(origin[1] + b.min[1], origin[1] + b.max[1]);
  return { min: v3(Math.min(...xs), Math.min(...ys), Math.min(...zs)), max: v3(Math.max(...xs), Math.max(...ys), Math.max(...zs)) };
}

// ---- Heights (sim-spec 2 and 5.1) -------------------------------------------------------------
const HEIGHTS = { raisedFloor: 0, ohtRailDatum: 4.9, ffuFace: 6.0, subfabFloor: -7.5, roof: 14.0, loadPortSeat: 0.9, stockerPortSeat: 0.9, utsSeat: 3.2, vehicleFoupBase: 4.0 };
const LEVELS = { roofSlab: [13.4, 14], interstitial: [6.4, 13.4], ffuBand: [6, 6.4], cleanroom: [0, 6], plenum: [-0.6, 0], waffleSlab: [-1.5, -0.6], subfab: [-7.5, -1.5], floorSlab: [-8, -7.5] };

// ---- Measured assets (data/assets.json; the accepted GLBs' extents, locators and clip sweeps) -----------
interface MeasuredClip { name: string; play: string; sweep?: Box }
interface MeasuredEntity { status: string; measured?: { bounds: Box & { size: V3 }; subtrees?: Record<string, Box>; nodeBounds?: Record<string, Box> }; locators?: Record<string, V3>; clearance?: Record<string, number | string>; clips?: MeasuredClip[]; facts?: Record<string, unknown> }
const ASSETS = JSON.parse(readFileSync(resolve(ROOT, 'data/assets.json'), 'utf8')) as { entities: Record<string, MeasuredEntity> };
function measured(key: string): { bounds: Box & { size: V3 }; locators: Record<string, V3>; entity: MeasuredEntity } {
  const e = ASSETS.entities[key];
  if (!e?.measured || !e.locators) throw new Error(`data/assets.json has no measured entry ${key}: run scripts/inspect-assets.ts --write`);
  return { bounds: e.measured.bounds, locators: e.locators, entity: e };
}
/** A wired entity (names, clips and locators stated by the coordinator, file pending) plans with its stated locators
 *  until the entry is measured; a measured entry always wins. */
interface WiredEntity { status: string; locators?: Record<string, V3>; facts?: Record<string, unknown>; expected?: { locators: Record<string, V3>; sizeM: V3; facts: Record<string, unknown> }; measured?: { bounds: Box & { size: V3 }; poses?: Record<string, V3> } }
function iface(key: string): { locators: Record<string, V3>; bounds: Box; basis: string; facts: Record<string, unknown>; poses: Record<string, V3> } {
  const e = ASSETS.entities[key] as WiredEntity | undefined;
  if (!e) throw new Error(`data/assets.json has no entity ${key}`);
  if (e.measured && e.locators) return { locators: e.locators, bounds: e.measured.bounds, basis: 'measured from the pinned GLB', facts: e.facts ?? e.expected?.facts ?? {}, poses: e.measured.poses ?? {} };
  if (!e.expected) throw new Error(`${key} has neither a measured GLB nor a stated interface`);
  const [sx, sy, sz] = e.expected.sizeM;
  return { locators: e.expected.locators, bounds: { min: v3(-sx / 2, 0, -sz / 2), max: v3(sx / 2, sy, sz / 2) }, basis: 'stated interface (coordinator 23:08); replaced by the measured GLB when the fix revision is pinned', facts: e.expected.facts, poses: {} };
}
const TYPE_ENTITY: Record<string, string> = {
  'etch-cluster-tool': 'tool:etch', 'cvd-ald-cluster-tool': 'tool:cvd-ald', 'pvd-cluster-tool': 'tool:pvd', 'single-wafer-clean-tool': 'tool:clean',
  'cmp-polisher': 'tool:cmp', 'vertical-furnace': 'tool:furnace', 'ion-implanter': 'tool:implanter', 'metrology-inspection-tool': 'tool:metrology',
  'wafer-prober-tester': 'tool:prober', 'coater-developer-track': 'tool:track', 'euv-scanner': 'tool:euv-scanner', 'duv-immersion-scanner': 'tool:duv-scanner',
};
interface KeepOut extends Box { why: string }
/** size is the measured extent [along local X, height, along local Z]; ports are the lp1..lpN locators on the front face (local +X). */
interface ToolType { entity: string; bounds: Box; size: V3; ports: V3[]; tower: V3; interface?: { name: string; position: V3 }; keepOut: KeepOut[] }
/** The parts of a box outside the body, one box per side it leaves (two doors on opposite sides give two boxes). */
function outside(s: Box, body: Box): Box[] {
  const out: Box[] = [];
  for (let k = 0; k < 3; k++) {
    if (s.max[k]! > body.max[k]! + 1e-3) { const b: Box = { min: [...s.min], max: [...s.max] }; b.min[k] = body.max[k]!; out.push(b); }
    if (s.min[k]! < body.min[k]! - 1e-3) { const b: Box = { min: [...s.min], max: [...s.max] }; b.max[k] = body.min[k]!; out.push(b); }
  }
  return out;
}
function toolType(type: string): ToolType {
  const key = TYPE_ENTITY[type]!, m = measured(key), b = m.bounds, L = m.locators, rule = m.entity.clearance ?? {};
  const ports = Object.keys(L).filter(n => /^lp\d+$/.test(n)).sort((a, z) => Number(a.slice(2)) - Number(z.slice(2))).map(n => L[n]!);
  const ifaceName = ['scannerInterface', 'trackInterface'].find(n => L[n]);
  const body: Box = { min: b.min, max: b.max }, keepOut: KeepOut[] = [];
  // The operating envelope: every down-state clip's moving parts, swept over the clip (measured), outside the body.
  for (const c of m.entity.clips ?? []) if (c.sweep && c.play === 'down-open') for (const o of outside(c.sweep, body)) keepOut.push({ why: `${c.name} sweep`, min: v3(...o.min), max: v3(...o.max) });
  // The reviews' clearance rules on top of the sweeps.
  if (typeof rule.plusZ === 'number' && rule.plusZ > 0) keepOut.push({ why: `review: ${rule.plusZ} m clear on the +Z side (lid)`, min: v3(b.min[0], 0, b.max[2]), max: v3(b.max[0], b.max[1], b.max[2] + rule.plusZ) });
  if (typeof rule.serviceDoor === 'number') {
    const door = keepOut.find(k => k.why.startsWith('ServiceOpen') && k.min[0] >= b.max[0] - 1e-3);
    if (!door) throw new Error(`${key}: the service-door rule needs the ServiceOpen sweep in front of the face`);
    const face = ports[0]?.[0] ?? b.max[0];
    keepOut.push({ why: `review: ${rule.serviceDoor} m clear in front of the service door`, min: v3(b.max[0], 0, door.min[2]), max: v3(Math.max(door.max[0], face + rule.serviceDoor), door.max[1], door.max[2]) });
  }
  if (typeof rule.headroomY === 'number') {
    const head = keepOut.find(k => k.why.startsWith('HeadOpen'));
    if (!head) throw new Error(`${key}: the headroom rule needs the HeadOpen sweep`);
    keepOut.push({ why: `review: ${rule.headroomY} m headroom over the head`, min: v3(head.min[0], b.max[1], head.min[2]), max: v3(head.max[0], rule.headroomY, head.max[2]) });
  }
  return {
    entity: key, bounds: { min: v3(...b.min), max: v3(...b.max) }, size: v3(...b.size), ports, tower: L.signalTowerMount!, keepOut,
    ...(ifaceName ? { interface: { name: ifaceName, position: L[ifaceName]! } } : {}),
  };
}
const TOOL_TYPES: Record<string, ToolType> = Object.fromEntries(Object.keys(TYPE_ENTITY).map(t => [t, toolType(t)]));
const LOAD_PORT = measured('loadPort');
/** The load port's foupSeat locator, relative to its origin on the tool face (+X toward the aisle). */
const LOAD_PORT_SEAT: V3 = LOAD_PORT.locators.foupSeat!;
const STOCKER_M = measured('stocker');
const STOCKER = {
  size: STOCKER_M.bounds.size, bounds: STOCKER_M.bounds, ports: ['port1', 'port2', 'port3', 'port4'].map(n => STOCKER_M.locators[n]!), manualPortSeat: STOCKER_M.locators.manualPortSeat!, tower: STOCKER_M.locators.signalTowerMount!,
  slots: { rackX: [-0.95, 0.95], z0: -5.0, dz: 0.5, columns: 21, y0: 0.4, dy: 0.8, levels: 6, innerSeatX: 0.95, innerSeatY: 0.9, passThroughM: 1.15 },
};
const UTS_M = measured('uts');
const UTS = { size: UTS_M.bounds.size, seats: [UTS_M.locators.seatA!, UTS_M.locators.seatB!] };

// ---- Families (report b.11 and sim-spec 3.7; every value E) ------------------------------------
interface Group { label: string; routeFamilies: string[]; toolType: string; installed: number; wph?: number; lotOverheadMin?: number; mtbfH: number; mttrH: number; pmEveryH: number; pmLengthH: number; batch?: boolean; accent: string }
export const GROUPS: Record<string, Group> = {
  euv: { label: 'EUV litho cell (track and scanner)', routeFamilies: ['euv'], toolType: 'euv-scanner', installed: 2, wph: 100, lotOverheadMin: 4, mtbfH: 80, mttrH: 4, pmEveryH: 168, pmLengthH: 6, accent: 'accent-litho' },
  duv: { label: 'DUV immersion litho cell (track and scanner)', routeFamilies: ['duv'], toolType: 'duv-immersion-scanner', installed: 2, wph: 170, lotOverheadMin: 4, mtbfH: 150, mttrH: 3, pmEveryH: 336, pmLengthH: 4, accent: 'accent-litho' },
  etch: { label: 'Plasma etch', routeFamilies: ['etch'], toolType: 'etch-cluster-tool', installed: 6, wph: 55, lotOverheadMin: 5, mtbfH: 120, mttrH: 3, pmEveryH: 168, pmLengthH: 4, accent: 'accent-etch' },
  cvdald: { label: 'CVD and ALD deposition', routeFamilies: ['cvd', 'ald'], toolType: 'cvd-ald-cluster-tool', installed: 6, wph: 50, lotOverheadMin: 5, mtbfH: 120, mttrH: 3, pmEveryH: 168, pmLengthH: 4, accent: 'accent-deposition' },
  pvd: { label: 'PVD metallisation', routeFamilies: ['pvd'], toolType: 'pvd-cluster-tool', installed: 3, wph: 50, lotOverheadMin: 5, mtbfH: 120, mttrH: 3, pmEveryH: 168, pmLengthH: 4, accent: 'accent-deposition' },
  implant: { label: 'Ion implant', routeFamilies: ['implant'], toolType: 'ion-implanter', installed: 2, wph: 150, lotOverheadMin: 5, mtbfH: 100, mttrH: 4, pmEveryH: 336, pmLengthH: 6, accent: 'accent-implant' },
  cmp: { label: 'Chemical-mechanical planarisation', routeFamilies: ['cmp'], toolType: 'cmp-polisher', installed: 4, wph: 45, lotOverheadMin: 5, mtbfH: 150, mttrH: 2, pmEveryH: 168, pmLengthH: 3, accent: 'accent-cmp' },
  clean: { label: 'Single-wafer wet clean', routeFamilies: ['clean'], toolType: 'single-wafer-clean-tool', installed: 2, wph: 300, lotOverheadMin: 4, mtbfH: 200, mttrH: 2, pmEveryH: 336, pmLengthH: 3, accent: 'accent-clean' },
  furnace: { label: 'Vertical furnace (batch)', routeFamilies: ['furnace'], toolType: 'vertical-furnace', installed: 3, mtbfH: 300, mttrH: 4, pmEveryH: 720, pmLengthH: 8, batch: true, accent: 'accent-thermal' },
  metrology: { label: 'Metrology and inspection', routeFamilies: ['metrology'], toolType: 'metrology-inspection-tool', installed: 4, wph: 90, lotOverheadMin: 4, mtbfH: 250, mttrH: 2, pmEveryH: 720, pmLengthH: 4, accent: 'accent-metrology' },
  probe: { label: 'Wafer sort (probe test)', routeFamilies: ['probe'], toolType: 'wafer-prober-tester', installed: 4, wph: 2, lotOverheadMin: 10, mtbfH: 150, mttrH: 1, pmEveryH: 336, pmLengthH: 2, accent: 'accent-test' },
};
const FURNACE_BATCH = { maxLots: 4, minLots: 2, oldestWaitH: 2, cycleH: 5, handlingMin: 20, internalBuffer: 8, portTransferS: 30, basis: 'E (sim-spec 4; report b.11)' };
const WAFERS_PER_LOT = 25;

// ---- Route (report b.10) -----------------------------------------------------------------------
const MODULES: { name: string; loops: number; families: string[] }[] = [
  { name: 'STI isolation', loops: 1, families: ['clean', 'furnace', 'cvd', 'duv', 'metrology', 'etch', 'clean', 'cvd', 'furnace', 'cmp', 'metrology'] },
  { name: 'Well and threshold implants', loops: 6, families: ['clean', 'duv', 'metrology', 'implant', 'clean'] },
  { name: 'Nanosheet stack and fin patterning', loops: 1, families: ['clean', 'cvd', 'cvd', 'cvd', 'euv', 'metrology', 'etch', 'clean', 'metrology'] },
  { name: 'Critical front-end patterning', loops: 3, families: ['ald', 'euv', 'metrology', 'etch', 'clean', 'metrology'] },
  { name: 'Dummy gate, spacer, source/drain', loops: 4, families: ['ald', 'etch', 'clean', 'cvd', 'duv', 'implant', 'furnace'] },
  { name: 'Replacement metal gate (sheet release)', loops: 2, families: ['etch', 'clean', 'ald', 'ald', 'pvd', 'cmp', 'metrology'] },
  { name: 'Middle-of-line contacts', loops: 2, families: ['cvd', 'euv', 'metrology', 'etch', 'clean', 'pvd', 'cmp', 'metrology'] },
  { name: 'Tight-pitch metal, dual damascene (EUV)', loops: 6, families: ['cvd', 'euv', 'etch', 'euv', 'etch', 'clean', 'pvd', 'cmp', 'metrology'] },
  { name: 'Relaxed-pitch metal, dual damascene (DUV)', loops: 6, families: ['cvd', 'duv', 'etch', 'duv', 'etch', 'clean', 'pvd', 'cmp', 'metrology'] },
  { name: 'Pad and passivation', loops: 1, families: ['cvd', 'duv', 'etch', 'clean', 'metrology'] },
  { name: 'Wafer sort', loops: 1, families: ['probe'] },
];
const EXPECTED_PASSES: Record<string, number> = { clean: 40, etch: 38, metrology: 35, cvd: 24, duv: 24, euv: 18, cmp: 17, pvd: 16, ald: 11, implant: 10, furnace: 6, probe: 1 };

// ---- Section cut (the level section module, measured; coordinator messages 00:27 and 00:33) ---------------
// The modules tile the east cut along Z at their measured length, the row centred on the clean room; each root sits on
// the clean-room floor with its cut face (local +X max) on the section plane. The module parts that stand in the clean
// room (the return-air shafts, measured) are obstacles: the tool rows pack around them and the walker collides with them.
const CLEANROOM_Z: V2 = [-27, 23.4];
const SECTION_M = measured('sectionModule');
const SECTION_TILE = SECTION_M.bounds.size[2];
const SECTION_COUNT = Math.round((CLEANROOM_Z[1] - CLEANROOM_Z[0]) / SECTION_TILE);
if (Math.abs(SECTION_COUNT * SECTION_TILE - (CLEANROOM_Z[1] - CLEANROOM_Z[0])) > 1e-6) throw new Error(`the section module (${SECTION_TILE} m) does not tile the clean room along the cut`);
const SECTION = {
  x: 36, moduleOriginX: q(36 - SECTION_M.bounds.max[0]), modules: SECTION_COUNT, moduleWidth: SECTION_TILE,
  centresZ: Array.from({ length: SECTION_COUNT }, (_, i) => q(CLEANROOM_Z[0] + SECTION_TILE * (i + 0.5))),
};
// The spine's U-turns (centres on the spine axis, the bay loops' 1.8 m radius) and the vehicle envelope of sim-spec 12
// test 3 (body 0.95 x 0.60 m, 0.10 m clear of all static geometry). On a U-turn the body's outer corners sweep out to
// the radius below. A module whose return-air shaft lies inside that sweep plus the clearance draws without its shaft
// (the asset map's `withoutShaft` variant): moving the east U-turn clear needs the N4, N5 and S5 bays 0.2 to 0.5 m west,
// more than the east half's 0.8 m of slack between the litho partition and the cut allows (FF2 report).
const SPINE_UTURN = { x: 33.3, radius: 1.8 };
const VEHICLE_ENVELOPE = { length: 0.95, width: 0.6, clearanceM: 0.1 };
const UTURN_SWEEP_M = Math.hypot(SPINE_UTURN.radius + VEHICLE_ENVELOPE.width / 2, VEHICLE_ENVELOPE.length / 2);
const SECTION_PARTS = Object.entries(SECTION_M.entity.measured?.nodeBounds ?? {}).filter(([, b]) => b.max[1] > LEVELS.cleanroom[0]! && b.min[1] < LEVELS.cleanroom[1]!);
const SECTION_MODULES = SECTION.centresZ.map((z, i) => {
  const parts = SECTION_PARTS.map(([name, b]) => ({ name, box: placeBox(v3(SECTION.moduleOriginX, 0, z), 0, b) }));
  const inSweep = parts.filter(({ box }) => [-1, 1].some(side => {
    const cx = side * SPINE_UTURN.x, dx = Math.max(box.min[0] - cx, 0, cx - box.max[0]), dz = Math.max(box.min[2], 0, -box.max[2]);
    return (side > 0 ? box.max[0] > cx : box.min[0] < cx) && Math.hypot(dx, dz) < UTURN_SWEEP_M + VEHICLE_ENVELOPE.clearanceM;
  }));
  if (inSweep.some(p => p.name !== 'returnAirShaft')) throw new Error(`section-${i + 1}: ${inSweep.map(p => p.name).join(', ')} in the U-turn sweep`);
  return { id: `section-${i + 1}`, z, variant: inSweep.length ? 'withoutShaft' : 'withShaft', parts: parts.filter(p => !inSweep.includes(p)) };
});
const SECTION_OBSTACLES = SECTION_MODULES.flatMap(m => m.parts.map(p => ({ id: `${m.id}.${p.name}`, ...p.box })));

// ---- Bays and placements (sim-spec 5.2-5.4) ----------------------------------------------------
const BAYS = [
  { id: 'N1', x: [-36, -21.6], z: [-27, -3], xc: -28.8, loop: true, contents: '6 etch tools, 3 per side' },
  { id: 'N2', x: [-21.6, -7.2], z: [-27, -3], xc: -14.4, loop: false, contents: '2 DUV litho cells (amber zone)' },
  { id: 'N3', x: [-7.2, 7.2], z: [-27, -3], xc: 0, loop: false, contents: '2 EUV litho cells (amber zone)' },
  { id: 'N4', x: [7.2, 21.6], z: [-27, -3], xc: 14.4, loop: true, contents: '6 CVD/ALD tools, 3 per side' },
  { id: 'N5', x: [21.6, 36], z: [-27, -3], xc: 28.8, loop: true, contents: '3 PVD tools (west side), 2 clean tools (east side)' },
  { id: 'S1', x: [-36, -21.6], z: [3, 23.4], xc: -28.8, loop: true, contents: '4 CMP polishers, 2 per side' },
  { id: 'S2', x: [-21.6, -7.2], z: [3, 23.4], xc: -14.4, loop: true, contents: '3 furnaces (west side), 2 implanters (east side, end stations toward the spine)' },
  { id: 'S3', x: [-7.2, 7.2], z: [3, 23.4], xc: 0, loop: true, contents: '2 stockers facing each other across the aisle' },
  { id: 'S4', x: [7.2, 21.6], z: [3, 23.4], xc: 14.4, loop: true, contents: '4 metrology tools, 2 per side' },
  { id: 'S5', x: [21.6, 36], z: [3, 23.4], xc: 28.8, loop: true, contents: '4 probers, 2 per side; install zone at the gallery end' },
] as const;
const BAY_LOOP = { railOffset: 1.8, toolFaceOffset: 2.1, railNearZ: 3.6, railFarZ: 18.0, firstToolZ: 4.2, toolGap: 0.3, uTurnRadius: 1.8 };

interface PortOut { id: string; locator: string; mount: V3; seat: V3; facing: V3 }
interface ToolOut {
  id: string; type: string; entity: string; group: string; bay: string; side: 'west' | 'east' | 'north'; position: V3; yaw: number; size: V3; bounds: Box;
  footprint: Box; keepOut: KeepOut[]; ports: PortOut[]; signalTowerMount: V3; cell?: string; interface?: { name: string; position: V3 }; variant?: string; accent: string; scheduled: boolean;
}
const tools: ToolOut[] = [];

function addTool(id: string, type: string, group: string, bay: string, side: ToolOut['side'], position: V3, yaw: number, cell?: string): ToolOut {
  const t = TOOL_TYPES[type]!;
  const facing = v3(...rotateY(yaw, [1, 0, 0]));
  const ports = t.ports.map((mount, i) => ({ id: `${id}.lp${i + 1}`, locator: `lp${i + 1}`, mount: place(position, yaw, mount), seat: place(position, yaw, [mount[0] + LOAD_PORT_SEAT[0], LOAD_PORT_SEAT[1], mount[2] + LOAD_PORT_SEAT[2]]), facing }));
  const tool: ToolOut = {
    id, type, entity: t.entity, group, bay, side, position, yaw, size: t.size, bounds: t.bounds, footprint: placeBox(position, yaw, t.bounds),
    keepOut: t.keepOut.map(k => ({ why: k.why, ...placeBox(position, yaw, k) })), ports, signalTowerMount: place(position, yaw, t.tower), accent: GROUPS[group]!.accent, scheduled: true,
  };
  if (cell) tool.cell = cell;
  if (t.interface) tool.interface = { name: t.interface.name, position: place(position, yaw, t.interface.position) };
  tools.push(tool);
  return tool;
}
/** Tools along one side of a bay loop, faces 2.1 m from the aisle centre (the lp locators set the face), packed
 *  outward from |Z| = 4.2 by their measured Z extents: 0.3 m between bodies, and no keep-out envelope (clip sweeps
 *  and the reviews' clearances) reaching a neighbour's body (sim-spec 5.4; cluster review). A tool whose body or
 *  envelope would meet a section-module obstacle in the clean room (a return-air shaft) moves outward past it, 0.3 m
 *  clear of its body. */
function bayRow(prefix: string, first: number, count: number, type: string, group: string, bayId: string, side: 'west' | 'east', variants?: string[]) {
  const bay = BAYS.find(b => b.id === bayId)!, t = TOOL_TYPES[type]!, d = bayId.startsWith('N') ? -1 : 1, yaw = side === 'west' ? 0 : 180;
  const face = t.ports[0]![0];
  const x = side === 'west' ? bay.xc - BAY_LOOP.toolFaceOffset - face : bay.xc + BAY_LOOP.toolFaceOffset + face;
  // World Z offsets of the body and of the envelope (body plus keep-outs) from the tool origin, in the outward direction.
  const zRange = (boxes: Box[]) => { const zs = boxes.flatMap(b => [b.min[2], b.max[2]]).map(z => d * (yaw === 0 ? z : -z)); return [Math.min(...zs), Math.max(...zs)] as V2; };
  const bodyR = zRange([t.bounds]), envR = zRange([t.bounds, ...t.keepOut]);
  const meets = (s: number): Box | undefined => {
    const origin = v3(x, 0, d * s), body = placeBox(origin, yaw, t.bounds), env = [body, ...t.keepOut.map(k => placeBox(origin, yaw, k))];
    const gap = BAY_LOOP.toolGap;
    const lt = (a: number, b: number) => a < b - 1e-6;
    return SECTION_OBSTACLES.find(o => (lt(o.min[0], body.max[0] + gap) && lt(body.min[0] - gap, o.max[0]) && lt(o.min[2], body.max[2] + gap) && lt(body.min[2] - gap, o.max[2]))
      || env.some(e => lt(o.min[0], e.max[0]) && lt(e.min[0], o.max[0]) && lt(o.min[2], e.max[2]) && lt(e.min[2], o.max[2])));
  };
  let bodyFar = -Infinity, envFar = -Infinity;
  for (let i = 0; i < count; i++) {
    let s = i === 0 ? BAY_LOOP.firstToolZ - bodyR[0] : Math.max(bodyFar + BAY_LOOP.toolGap - bodyR[0], envFar - bodyR[0], bodyFar - envR[0]);
    for (let o = meets(s), guard = 0; o; o = meets(s)) {
      const far = Math.max(d * o.min[2], d * o.max[2]), next = q(Math.max(far + BAY_LOOP.toolGap - bodyR[0], far - envR[0]));
      s = next > s ? next : q(s + 1e-4);
      if (++guard > 100) throw new Error(`${prefix}: no place clear of the section-module obstacles`);
    }
    if (s + envR[0] < Math.abs(bay.z[d < 0 ? 1 : 0]) - 1e-9) throw new Error(`${prefix}: the envelope reaches the spine aisle`);
    const tool = addTool(`${prefix}-${String(first + i).padStart(2, '0')}`, type, group, bayId, side, v3(x, 0, d * s), yaw);
    if (variants) tool.variant = variants[i % variants.length]!;
    bodyFar = s + bodyR[1]; envFar = s + envR[1];
  }
}
bayRow('etch', 1, 3, 'etch-cluster-tool', 'etch', 'N1', 'west');
bayRow('etch', 4, 3, 'etch-cluster-tool', 'etch', 'N1', 'east');
bayRow('cvd', 1, 3, 'cvd-ald-cluster-tool', 'cvdald', 'N4', 'west');
bayRow('cvd', 4, 3, 'cvd-ald-cluster-tool', 'cvdald', 'N4', 'east');
bayRow('pvd', 1, 3, 'pvd-cluster-tool', 'pvd', 'N5', 'west');
bayRow('clean', 1, 2, 'single-wafer-clean-tool', 'clean', 'N5', 'east');
bayRow('cmp', 1, 2, 'cmp-polisher', 'cmp', 'S1', 'west');
bayRow('cmp', 3, 2, 'cmp-polisher', 'cmp', 'S1', 'east');
bayRow('furnace', 1, 3, 'vertical-furnace', 'furnace', 'S2', 'west');
bayRow('implant', 1, 2, 'ion-implanter', 'implant', 'S2', 'east');
// Metrology review: each instance shows exactly one of `column` and `opticalHead`; the rows alternate them.
bayRow('metro', 1, 2, 'metrology-inspection-tool', 'metrology', 'S4', 'west', ['column', 'opticalHead']);
bayRow('metro', 3, 2, 'metrology-inspection-tool', 'metrology', 'S4', 'east', ['column', 'opticalHead']);
bayRow('probe', 1, 2, 'wafer-prober-tester', 'probe', 'S5', 'west');
bayRow('probe', 3, 2, 'wafer-prober-tester', 'probe', 'S5', 'east');

// Litho cells (sim-spec 5.4): track at yaw -90 with its front on Z -2.1 (origin Z -6.1); the scanner behind it.
// The spec's cell X positions (-18.0, -10.8, -3.6, +3.6) are kept unless a scanner's service-door sweep (measured;
// litho review: keep the sweep clear on both sides) would reach a partition or another scanner's sweep; such a
// cell moves west by the least amount, on a 10 mm grid, that leaves 0.1 m.
const LITHO_SPEC = [
  { cell: 'cell-duv-1', group: 'duv', x: -18.0, bay: 'N2' }, { cell: 'cell-duv-2', group: 'duv', x: -10.8, bay: 'N2' },
  { cell: 'cell-euv-1', group: 'euv', x: -3.6, bay: 'N3' }, { cell: 'cell-euv-2', group: 'euv', x: 3.6, bay: 'N3' },
];
const PARTITION_X = [-21.6, 7.2], WALL_HALF = 0.05, DOOR_MARGIN = 0.1;
const doorReach = (type: string) => Math.max(...TOOL_TYPES[type]!.keepOut.filter(k => k.why.startsWith('ServiceOpen')).map(k => Math.max(Math.abs(k.min[2]), Math.abs(k.max[2]))));
const scannerType = (g: string) => g === 'euv' ? 'euv-scanner' : 'duv-immersion-scanner';
const LITHO = { trackOriginZ: -6.1, yaw: -90, euvScannerOriginZ: -17.1, duvScannerOriginZ: -12.85, cells: [] as { cell: string; group: string; x: number; bay: string; specX: number; doorReach: number }[] };
{
  let limit = PARTITION_X[1]! - WALL_HALF;
  for (const c of [...LITHO_SPEC].sort((a, b) => b.x - a.x)) {
    const reach = doorReach(scannerType(c.group)), x = Math.min(c.x, Math.floor((limit - reach - DOOR_MARGIN) * 100 + 1e-6) / 100);
    LITHO.cells.push({ ...c, x: q(x), specX: c.x, doorReach: q(reach) });
    limit = x - reach;
  }
  if (limit < PARTITION_X[0]! + WALL_HALF + DOOR_MARGIN - 1e-9) throw new Error('the litho cells do not fit between the partitions with their door sweeps');
  LITHO.cells.sort((a, b) => a.x - b.x);
}
for (const c of LITHO.cells) {
  const n = c.cell.slice(-1), kind = c.group;
  addTool(`track-${kind}-${n}`, 'coater-developer-track', c.group, c.bay, 'north', v3(c.x, 0, LITHO.trackOriginZ), LITHO.yaw, c.cell);
}
for (const c of LITHO.cells) {
  const n = c.cell.slice(-1), euv = c.group === 'euv';
  addTool(`scanner-${c.group}-${n}`, scannerType(c.group), c.group, c.bay, 'north', v3(c.x, 0, euv ? LITHO.euvScannerOriginZ : LITHO.duvScannerOriginZ), LITHO.yaw, c.cell);
}

// Stockers (S3): west yaw 0 at (-3.9, 0, 10.2), east yaw 180 at (3.9, 0, 10.2).
const stockers = [{ id: 'stocker-w', position: v3(-3.9, 0, 10.2), yaw: 0 }, { id: 'stocker-e', position: v3(3.9, 0, 10.2), yaw: 180 }].map(s => ({
  ...s, entity: 'stocker', size: STOCKER.size, footprint: placeBox(s.position, s.yaw, STOCKER.bounds), facing: v3(...rotateY(s.yaw, [1, 0, 0])),
  ports: STOCKER.ports.map((p, i) => ({ id: `${s.id}.port${i + 1}`, locator: `port${i + 1}`, seat: place(s.position, s.yaw, p), innerSeat: place(s.position, s.yaw, [STOCKER.slots.innerSeatX, STOCKER.slots.innerSeatY, p[2]]) })),
  manualPort: { id: `${s.id}.manual`, locator: 'manualPortSeat', seat: place(s.position, s.yaw, STOCKER.manualPortSeat), innerSeat: place(s.position, s.yaw, [STOCKER.slots.innerSeatX, STOCKER.slots.innerSeatY, 0]) },
  signalTowerMount: place(s.position, s.yaw, STOCKER.tower),
}));

// UTS shelves (sim-spec 5.4): 12 on the north rail in the free gaps between the track ports, 20 on the south rail.
function shelfRow(from: number, to: number, count: number, gap = 0.3): number[] {
  const pitch = UTS.size[0] + gap, span = count * UTS.size[0] + (count - 1) * gap, start = (from + to) / 2 - span / 2 + UTS.size[0] / 2;
  if (span > Math.abs(to - from) + 1e-9) throw new Error(`UTS row ${from}..${to} cannot hold ${count}`);
  return Array.from({ length: count }, (_, i) => q(start + i * pitch));
}
// The rows beside the N1 diverge (throat X -25.2) and the N4 merge (throat 10.8) stop 0.3 m short of the throat and pack
// at 0.2 m: a vehicle turning onto or off the branch swings its corner toward the first shelf's hanger rods (sim-spec 12
// test 3 measured 0.074 m with the shelf at the throat, 0.108 m with 0.3 m).
const THROAT_CLEAR_M = 0.3;
const utsNorthX = [...shelfRow(-25.2 + THROAT_CLEAR_M, -19.5, 4, 0.2), ...shelfRow(-9.3, -5.1, 2), ...shelfRow(-2.1, 2.1, 2), ...shelfRow(5.1, 10.8 - THROAT_CLEAR_M, 4, 0.2)];
const utsSouthX = [...shelfRow(-25.2, -18.0, 4), ...shelfRow(-10.8, -3.6, 4), ...shelfRow(3.6, 10.8, 4), ...shelfRow(18.0, 25.2, 4), -28.8, -14.4, 14.4, 28.8];
const uts = [
  ...utsNorthX.sort((a, b) => b - a).map((x, i) => ({ id: `uts-n${String(i + 1).padStart(2, '0')}`, rail: 'north', position: v3(x, HEIGHTS.utsSeat, -1.8) })),
  ...utsSouthX.sort((a, b) => a - b).map((x, i) => ({ id: `uts-s${String(i + 1).padStart(2, '0')}`, rail: 'south', position: v3(x, HEIGHTS.utsSeat, 1.8) })),
].map(u => ({ ...u, entity: 'uts', yaw: 0, size: UTS.size, seats: UTS.seats.map((s, i) => ({ id: `${u.id}.${i ? 'b' : 'a'}`, locator: i ? 'seatB' : 'seatA', seat: place(u.position, 0, s) })) }));
// A shelf must not hang over a load port seat (the hoist passes through its position).
for (const u of uts) for (const t of tools) for (const p of t.ports) if (Math.abs(p.seat[2] - u.position[2]) < 0.5 && Math.abs(p.seat[0] - u.position[0]) < UTS.size[0] / 2 + 0.25) throw new Error(`${u.id} hangs over ${p.id}`);

// ---- Rail plan (sim-spec 5.3-5.4): runs, curves and switches in travel order ----------------------
// The graph script (build-rail-graph.ts) splits straight runs into 3.6 m pieces (a filler scaled 0.25-1.0
// where a run is not a multiple) and inserts a port node above every seat.
const Y = HEIGHTS.ohtRailDatum;
interface SwitchOut { id: string; bay: string; use: 'diverge' | 'merge'; origin: V3; yaw: number }
interface CurveOut { id: string; center: V3; radius: number; from: V3; to: V3; turn: 'left' | 'right' }
interface RunOut { id: string; from: V3; to: V3; spine: boolean }
const switches: SwitchOut[] = [], curves: CurveOut[] = [], runs: RunOut[] = [];
const loops = BAYS.filter(b => b.loop);
for (const b of loops) {
  const xc = b.xc, north = b.id.startsWith('N'), s = north ? -1 : 1, key = b.id.toLowerCase();
  if (north) {
    switches.push({ id: `sw-${key}-div`, bay: b.id, use: 'diverge', origin: v3(xc + 3.6, Y, -1.8), yaw: 180 });
    switches.push({ id: `sw-${key}-mrg`, bay: b.id, use: 'merge', origin: v3(xc - 1.8, Y, -1.8), yaw: 180 });
  } else {
    switches.push({ id: `sw-${key}-div`, bay: b.id, use: 'diverge', origin: v3(xc - 3.6, Y, 1.8), yaw: 0 });
    switches.push({ id: `sw-${key}-mrg`, bay: b.id, use: 'merge', origin: v3(xc + 1.8, Y, 1.8), yaw: 0 });
  }
  // Out along the first rail, U-turn, back along the second (both U-turn quarters are left turns).
  const outX = north ? xc + 1.8 : xc - 1.8, backX = north ? xc - 1.8 : xc + 1.8, near = s * BAY_LOOP.railNearZ, far = s * BAY_LOOP.railFarZ;
  runs.push({ id: `run-${key}-out`, from: v3(outX, Y, near), to: v3(outX, Y, far), spine: false });
  curves.push({ id: `cu-${key}-1`, center: v3(xc, Y, far), radius: 1.8, from: v3(outX, Y, far), to: v3(xc, Y, far + s * 1.8), turn: 'left' });
  curves.push({ id: `cu-${key}-2`, center: v3(xc, Y, far), radius: 1.8, from: v3(xc, Y, far + s * 1.8), to: v3(backX, Y, far), turn: 'left' });
  runs.push({ id: `run-${key}-back`, from: v3(backX, Y, far), to: v3(backX, Y, near), spine: false });
}
// Spine: north rail westbound, west U-turn, south rail eastbound, east U-turn. Runs are the stretches between switches.
function spineRuns(z: number, dir: 1 | -1, name: string) {
  const edgesX = switches.filter(sw => q(sw.origin[2]) === q(z)).flatMap(sw => [sw.origin[0], q(sw.origin[0] + dir * 1.8)]);
  const stops = [...new Set([-SPINE_UTURN.x * dir, ...edgesX, SPINE_UTURN.x * dir].map(q))].sort((a, b) => dir * (a - b));
  let n = 0;
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i]!, b = stops[i + 1]!;
    if (switches.some(sw => q(sw.origin[2]) === q(z) && q(sw.origin[0]) === a && q(a + dir * 1.8) === b)) continue; // a switch main line
    runs.push({ id: `run-spine-${name}-${++n}`, from: v3(a, Y, z), to: v3(b, Y, z), spine: true });
  }
}
spineRuns(-1.8, -1, 'n');
spineRuns(1.8, 1, 's');
{
  const { x: ux, radius: ur } = SPINE_UTURN;
  curves.push({ id: 'cu-spine-w1', center: v3(-ux, Y, 0), radius: ur, from: v3(-ux, Y, -ur), to: v3(q(-ux - ur), Y, 0), turn: 'left' });
  curves.push({ id: 'cu-spine-w2', center: v3(-ux, Y, 0), radius: ur, from: v3(q(-ux - ur), Y, 0), to: v3(-ux, Y, ur), turn: 'left' });
  curves.push({ id: 'cu-spine-e1', center: v3(ux, Y, 0), radius: ur, from: v3(ux, Y, ur), to: v3(q(ux + ur), Y, 0), turn: 'left' });
  curves.push({ id: 'cu-spine-e2', center: v3(ux, Y, 0), radius: ur, from: v3(q(ux + ur), Y, 0), to: v3(ux, Y, -ur), turn: 'left' });
}

// ---- Walls (wall kit: 3.6 m panels, corner posts; review 2 answer p for doors) -------------------------
// A run is straight between two posts. A door panel is never against a post (at least one panel between them)
// and never at a free end; every run here ends at a post, so a door index must lie in 1..count-2.
const PANEL = measured('wallKit').entity.measured!.subtrees!.wallPanelSolid!;
const PANEL_W = q(PANEL.max[0] - PANEL.min[0]), WALL_H = q(PANEL.max[1]);
interface PanelOut { id: string; run: string; variant: 'solid' | 'glazed' | 'glazedAmber' | 'door'; position: V3; yaw: number; scale?: V3 }
const panels: PanelOut[] = [], posts: { id: string; position: V3 }[] = [];
function wallRun(run: string, from: V2, to: V2, variant: PanelOut['variant'], doors: number[] = []) {
  const dx = to[0] - from[0], dz = to[1] - from[1], L = Math.hypot(dx, dz), n = Math.round(L / PANEL_W);
  if (Math.abs(n * PANEL_W - L) > 1e-6) throw new Error(`${run}: ${L} m is not a whole number of panels`);
  for (const d of doors) if (d < 1 || d > n - 2) throw new Error(`${run}: door ${d} is against a post (review 2, answer p)`);
  const yaw = Math.abs(dz) > Math.abs(dx) ? 90 : 0;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    panels.push({ id: `${run}-${String(i + 1).padStart(2, '0')}`, run, variant: doors.includes(i) ? 'door' : variant, position: v3(from[0] + dx * f, 0, from[1] + dz * f), yaw });
  }
  for (const p of [from, to]) if (!posts.some(o => o.position[0] === q(p[0]) && o.position[2] === q(p[1]))) posts.push({ id: `post-${posts.length + 1}`, position: v3(p[0], 0, p[1]) });
}
wallRun('wall-n', [-36, -27], [36, -27], 'solid');
// wall-w index 7 is the fab door at the spine end (Z 0): technicians walk in and out through it (people, below).
wallRun('wall-w', [-36, -27], [-36, 23.4], 'solid', [3, 7, 10]);
wallRun('wall-s', [-36, 23.4], [36, 23.4], 'glazed', [6, 13]);
wallRun('partition-w', [-21.6, -27], [-21.6, -5.4], 'glazedAmber');
wallRun('partition-e', [7.2, -27], [7.2, -5.4], 'glazedAmber');
const DOOR = { openingWidth: 1.8, note: 'the leaves slide from X +-0.45 to +-1.35 (DoorOpen): a 1.8 m opening at the panel centre' };

// ---- Gallery, section cut and the viewing landing ------------------------------------------------------
const GALLERY = { x: [-36, 36] as V2, z: [23.4, 27] as V2 };
const GALLERY_SEG = measured('gallerySegment');
/** Utility review: lower the segment 0.05 m so its walking surface (local Y 0.045 to 0.050) is flush with Y 0. */
const GALLERY_DROP = 0.05;
const GALLERY_TOP = q(GALLERY_SEG.bounds.max[1] - GALLERY_DROP);
if (Math.abs(GALLERY_SEG.bounds.size[0] - 7.2) > 1e-3 || Math.abs(GALLERY_SEG.bounds.size[2] - (GALLERY.z[1] - GALLERY.z[0])) > 1e-3) throw new Error('the gallery segment no longer tiles the 7.2 x 3.6 m gallery');
// The run's capped ends face west (yaw 180), so its west end is closed by a wall-kit panel scaled to the gallery height;
// its open east end continues onto the viewing landing.
panels.push({ id: 'gallery-end-w', run: 'gallery-end', variant: 'solid', position: v3(GALLERY.x[0], 0, (GALLERY.z[0] + GALLERY.z[1]) / 2), yaw: 90, scale: v3(1, GALLERY_TOP / WALL_H, 1) });
const LANDING = { x: [36, 39.6] as V2, z: [19.8, 27] as V2 };
// Where a visitor first stands, shared by the walk start and the landing view: the middle of the glazed south-wall panel
// east of X 0 (wall-s-11), 2.0 m back from the glass. The segment's own eye point (tourCamera: its centre line, 0.8 m
// toward the glass) cannot be used as it stands: the 7.2 m segments centre and end on multiples of 3.6 m, where the
// 3.6 m wall panels meet, so from every segment eye point the view is a mullion pair 1 m away (measured in the FF2
// captures at X 0). Set back to 2.0 m, the glazing frame and the handrail stay in view and read as the gallery.
const FIRST_GLAZED = panels.filter(p => p.run === 'wall-s' && p.variant === 'glazed' && p.position[0] > 0).sort((a, b) => a.position[0] - b.position[0])[0]!;
const GALLERY_EYE = { x: FIRST_GLAZED.position[0], z: q(GALLERY.z[0] + 2.0), panel: FIRST_GLAZED.id };
const SUBFAB_KIT = measured('subfabKit');
/** The tool standing nearest over a kit's toolAbove point (horizontal distance to its footprint, within 3 m), if any. */
function toolAbove(p: V3): { tool: string | null; distanceM: number | null } {
  let best: { tool: string | null; distanceM: number | null } = { tool: null, distanceM: null };
  for (const tool of tools) {
    const f = tool.footprint, dx = Math.max(f.min[0] - p[0], 0, p[0] - f.max[0]), dz = Math.max(f.min[2] - p[2], 0, p[2] - f.max[2]), d = q(Math.hypot(dx, dz));
    if (d <= 3 && (best.distanceM === null || d < best.distanceM)) best = { tool: tool.id, distanceM: d };
  }
  return best;
}
// The subfab kit (D-42). FF2 found that the accepted kit (3.6 x 6.0 x 2.4 m) fits the module's own kit zone (coordinator
// 00:33: X -0.5..1.2, Y -7.5..-5.5, Z -1.8..1.8 in the module frame; the asset map keeps it as the module's fact) in no
// quarter turn, and placed none. The owner's decision D-42 (2026-09-30): the zone is enlarged in the scene layout to take
// the kit as built; neither GLB is revised. The module's subfab is 2.33 m deep from the back-wall mullions (X -1.13) to
// the section plane (its cut face, X +1.2), and its mains and laterals fill the back of it to X -0.52, so the kit, 2.4 m
// across the cut in both quarter turns that run its 3.6 m side along the row, cannot stand wholly inside the module: the
// enlarged zone crosses the section plane.
// The pose, per module: turned 90 degrees as FF2 turned it (the 23:32 rule: the 3.6 m side along Z), on the mount's Z,
// and moved east of the mount (X 0.35) to the least whole centimetre at which every part of the kit clears every drawn
// part of the module by 0.10 m (sim-spec 12 test 3's static clearance, compared at micrometre resolution because the
// GLBs hold float32 vertices), the floor slab it stands on and the waffle slab its pipes meet excepted.
// tests/unit/clearance.test.ts measures that on both GLBs by triangle distance, holds X - 0.01 short of it and records
// the figures in evidence/sim-spec/ff3/kit-clearance.json: at X 0.63 the kit's tray base stands 0.10 m from the
// laterals, and the kit reaches 0.63 m past the section plane. The other such quarter turn (yaw -90) clears at X 0.50,
// nearer the plane, but puts more of the kit past it; that record is the owner's alternative.
// The enlarged zone is the smallest box holding the module's own zone and the kit at that pose.
const KIT_MOUNT = SECTION_M.locators.subfabKitMount!;
const MODULE_KIT_ZONE = (SECTION_M.entity.facts?.kitZone ?? null) as Box | null;
const KIT_POSE = { x: 0.63, z: 0, yaw: 90, frame: 'the section module (its root: X 0 at the module centre, Y 0 the clean-room floor, Z 0 the module centre)' };
const SECTION_PLANE_LOCAL_X = SECTION_M.bounds.max[0];
const KIT_BOX = placeBox(v3(KIT_POSE.x, KIT_MOUNT[1], KIT_POSE.z), KIT_POSE.yaw, SUBFAB_KIT.bounds);
const union = (a: Box, b: Box): Box => ({ min: v3(Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])), max: v3(Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])) });
const KIT_ZONE = MODULE_KIT_ZONE ? union(MODULE_KIT_ZONE, KIT_BOX) : KIT_BOX;
const inside = (b: Box, z: Box) => b.min.every((v, i) => v >= z.min[i]! - 1e-3) && b.max.every((v, i) => v <= z.max[i]! + 1e-3);
if (!inside(KIT_BOX, KIT_ZONE) || (MODULE_KIT_ZONE && !inside(MODULE_KIT_ZONE, KIT_ZONE))) throw new Error('the enlarged kit zone must hold the module\'s zone and the kit');
if (KIT_BOX.min[1] !== KIT_MOUNT[1] || KIT_BOX.max[1] !== LEVELS.subfab[1]) throw new Error(`the kit spans Y ${KIT_BOX.min[1]}..${KIT_BOX.max[1]}, not the subfab floor to the waffle slab underside`);
const kitZone = {
  decision: 'D-42 (owner, 2026-09-30): the zone is enlarged in the scene layout to take the accepted kit as built',
  zone: KIT_ZONE, moduleZone: MODULE_KIT_ZONE, mount: KIT_MOUNT, pose: KIT_POSE, kitSize: SUBFAB_KIT.bounds.size, kitBox: KIT_BOX, fits: true,
  pastSectionPlaneM: q(KIT_BOX.max[0] - SECTION_PLANE_LOCAL_X), clearanceM: 0.1,
  note: `module frame. The module's own zone (${MODULE_KIT_ZONE ? MODULE_KIT_ZONE.max.map((v, i) => q(v - MODULE_KIT_ZONE.min[i]!)).join(' x ') : '?'} m) takes the kit (${SUBFAB_KIT.bounds.size[2]} m across the cut, ${SUBFAB_KIT.bounds.size[1]} m tall at yaw ${KIT_POSE.yaw}) in no quarter turn, and the module's subfab is shallower than the kit, so the enlarged zone crosses the section plane by ${q(KIT_BOX.max[0] - SECTION_PLANE_LOCAL_X)} m: the kit stands ${KIT_POSE.x} m east of the module centre (${q(KIT_POSE.x - KIT_MOUNT[0])} m east of the mount), the least whole centimetre at which it clears every drawn module part by 0.10 m at micrometre resolution (the floor slab and the waffle slab excepted; tests/unit/clearance.test.ts)`,
};
const subfabKits = SECTION.centresZ.map((z, i) => {
  const yaw = KIT_POSE.yaw, position = v3(SECTION.moduleOriginX + KIT_POSE.x, KIT_MOUNT[1], z + KIT_POSE.z), above = place(position, yaw, SUBFAB_KIT.locators.toolAbove!);
  if (Math.abs(above[1] - LEVELS.waffleSlab[0]!) > 1e-6) throw new Error(`subfab-kit-${i + 1}: the pipes end at Y ${above[1]}, not the waffle slab underside`);
  return { id: `subfab-kit-${i + 1}`, module: `section-${i + 1}`, position, yaw, footprint: placeBox(position, yaw, SUBFAB_KIT.bounds), toolAbove: { point: above, ...toolAbove(above) } };
});
if (Math.abs(KIT_MOUNT[1] - HEIGHTS.subfabFloor) > 1e-6) throw new Error('subfabKitMount is not on the subfab floor');
// End walls close the open row ends below the clean-room floor and above the FFU face (the fab walls close the clean
// room between); the south end stops under the gallery slab.
const SECTION_END_T = 0.1;
const sectionEndWalls = [
  { id: 'section-end-n-low', min: v3(36 - SECTION_M.bounds.size[0], LEVELS.floorSlab[0]!, CLEANROOM_Z[0] - SECTION_END_T), max: v3(36, LEVELS.cleanroom[0]!, CLEANROOM_Z[0]) },
  { id: 'section-end-n-high', min: v3(36 - SECTION_M.bounds.size[0], LEVELS.cleanroom[1]!, CLEANROOM_Z[0] - SECTION_END_T), max: v3(36, LEVELS.roofSlab[1]!, CLEANROOM_Z[0]) },
  { id: 'section-end-s-low', min: v3(36 - SECTION_M.bounds.size[0], LEVELS.floorSlab[0]!, CLEANROOM_Z[1]), max: v3(36, -GALLERY_DROP, CLEANROOM_Z[1] + SECTION_END_T) },
  { id: 'section-end-s-high', min: v3(36 - SECTION_M.bounds.size[0], LEVELS.cleanroom[1]!, CLEANROOM_Z[1]), max: v3(36, LEVELS.roofSlab[1]!, CLEANROOM_Z[1] + SECTION_END_T) },
];

// ---- Floor robots (accepted after their fix pass): arm stations at load ports, each AMR parked at the arm's deckPark ----
// The arm's seatRef lies on the port's foupSeat (arm +X toward the tool); the AMR root stands at the arm's deckPark
// facing the arm's +X, so a FOUP on its foup1, lifted by DeckUp, has its top flange at the arm's deck pose. The FF2
// twin has no floor moves, so both stand at rest; the hand-off geometry is checked here and by the unit tests.
const ARM = iface('toolFrontRobotArm'), AMR = iface('amrFloorRobot'), FOUP_TOP = measured('foup').locators.gripPoint!;
const ROBOT_STATIONS = ['metro-01.lp1', 'metro-03.lp1', 'probe-01.lp1', 'probe-03.lp1'];
const robotStations = ROBOT_STATIONS.map((portId, i) => {
  const tool = tools.find(tt => tt.ports.some(p => p.id === portId))!, port = tool.ports.find(p => p.id === portId)!;
  const yaw = tool.yaw === 0 ? 180 : tool.yaw === 180 ? 0 : tool.yaw + 180, seatRef = ARM.locators.seatRef!;
  const r = rotateY(yaw, seatRef), arm = v3(port.seat[0] - r[0], 0, port.seat[2] - r[2]);
  if (Math.abs(seatRef[1] - port.seat[1]) > 1e-6) throw new Error(`${portId}: seatRef height ${seatRef[1]} is not the port seat height ${port.seat[1]}`);
  // The deck pose is gripCentre at the start of DeckToSeat and the rise is foup1 at the end of DeckUp, both measured
  // from the pinned GLBs (the stated values are the fallback while an entry is only wired).
  const armDeck = ARM.poses.gripDeck ?? ((ARM.facts.gripPoses as { deck?: V3 } | undefined)?.deck ?? ARM.facts.deckPose as V3);
  const amr = place(arm, yaw, ARM.locators.deckPark!), deckPose = place(arm, yaw, armDeck);
  const rise = AMR.poses.foup1Up && AMR.poses.foup1Rest ? AMR.poses.foup1Up[1] - AMR.poses.foup1Rest[1] : AMR.facts.deckRiseM as number, foup1 = AMR.locators.foup1!;
  const lifted = place(amr, yaw, [foup1[0], foup1[1] + rise + FOUP_TOP[1], foup1[2]]);
  const handoffErrorM = q(Math.hypot(lifted[0] - deckPose[0], lifted[1] - deckPose[1], lifted[2] - deckPose[2]));
  if (handoffErrorM > 0.002) throw new Error(`${portId}: the lifted FOUP flange misses the arm's deck pose by ${handoffErrorM} m`);
  return {
    id: `robot-station-${i + 1}`, port: portId, tool: tool.id,
    arm: { id: `arm-${i + 1}`, position: arm, yaw, footprint: placeBox(arm, yaw, ARM.bounds) },
    amr: { id: `amr-${i + 1}`, position: amr, yaw, footprint: placeBox(amr, yaw, AMR.bounds) },
    handoff: { seat: port.seat, deckPose, foupFlangeAtDeckUp: lifted, errorM: handoffErrorM },
  };
});
// Robots stand clear of every tool body and load port, of each other, and of the bay aisle centreline by the
// 0.62 m walker's half width plus 0.05 m. An arm reaches over the port it serves by design (its wrist and gripper at
// home stand 0.52 m from the tool face, above the port's 0.55 m stage): that pair is checked in 3D against the GLB
// triangles, with a FOUP on the seat, by sim-spec test 3 (tests/unit/clearance.test.ts), not by these plan boxes.
{
  const overlap = (a: Box, b: Box) => a.min[0] < b.max[0] - 1e-6 && b.min[0] < a.max[0] - 1e-6 && a.min[2] < b.max[2] - 1e-6 && b.min[2] < a.max[2] - 1e-6;
  const portBody = (p: PortOut) => placeBox(p.mount, Math.round(Math.atan2(-p.facing[2], p.facing[0]) * 180 / Math.PI), LOAD_PORT.bounds);
  const bodies = [...tools.map(tt => ({ id: tt.id, box: tt.footprint })), ...tools.flatMap(tt => tt.ports.map(p => ({ id: p.id, box: portBody(p) })))];
  const robots = robotStations.flatMap(s => [{ id: s.arm.id, box: s.arm.footprint, serves: s.port }, { id: s.amr.id, box: s.amr.footprint, serves: '' }]);
  for (const r of robots) {
    for (const b of bodies) if (b.id !== r.serves && overlap(r.box, b.box)) throw new Error(`${r.id} overlaps ${b.id}`);
    for (const o of robots) if (o !== r && overlap(r.box, o.box)) throw new Error(`${r.id} overlaps ${o.id}`);
    const bay = BAYS.find(b => r.box.min[0] >= b.x[0] && r.box.max[0] <= b.x[1] && r.box.min[2] >= Math.min(...b.z) && r.box.max[2] <= Math.max(...b.z));
    if (!bay) throw new Error(`${r.id} is not inside one bay`);
    const gap = Math.min(Math.abs(r.box.min[0] - bay.xc), Math.abs(r.box.max[0] - bay.xc));
    if ((r.box.min[0] - bay.xc) * (r.box.max[0] - bay.xc) <= 0 || gap < 0.31 + 0.05) throw new Error(`${r.id} leaves ${gap} m to the aisle centreline`);
  }
}

// ---- People (technicians; FF3's humanoid shares the points and paths) ----------------------------------------------
// The twin's service visits (repair, PM, qualification) name a resource: a tool, or a litho cell (track and scanner).
// A technician enters through the west-wall door at the spine end, walks along the spine at floor level and down the
// bay aisle to the service point, services the tool and walks out the same way. The service point faces the tool
// front 1.0 m out (clear of the load ports and a FOUP on them), at the tool centre along the face, shifted along the
// face in 0.25 m steps when a floor robot stands there; a litho cell is serviced at its track front, from the spine.
const TECH = measured('technician');
const PEOPLE_DOOR = panels.find(p => p.id === 'wall-w-08')!;
if (PEOPLE_DOOR.variant !== 'door' || Math.abs(PEOPLE_DOOR.position[2]) > 1e-6) throw new Error('the people door is wall-w-08 at the spine end');
const SPINE_Z = 0, DOOR_INSIDE = v3(PEOPLE_DOOR.position[0] + 0.6, 0, PEOPLE_DOOR.position[2]), SERVICE_OUT = 1.0;
const TECH_HALF = Math.max(TECH.bounds.size[0], TECH.bounds.size[2]) / 2;
function servicePoint(tool: ToolOut): { at: V3; yaw: number } {
  const facing = rotateY(tool.yaw, [1, 0, 0]), along = rotateY(tool.yaw, [0, 0, 1]);
  const face = tool.ports[0]!.mount, centre = tool.position;
  // The face point level with the tool centre (the face plane passes through the port mounts).
  const k = (centre[0] - face[0]) * along[0] + (centre[2] - face[2]) * along[2];
  const base = v3(face[0] + along[0] * k + facing[0] * SERVICE_OUT, 0, face[2] + along[2] * k + facing[2] * SERVICE_OUT);
  const yaw = Math.round(Math.atan2(facing[2], -facing[0]) * 180 / Math.PI); // the figure's +X toward the tool
  const robots = robotStations.flatMap(s => [s.arm.footprint, s.amr.footprint]);
  const clear = (p: V3) => robots.every(b => p[0] + TECH_HALF + 0.1 <= b.min[0] || p[0] - TECH_HALF - 0.1 >= b.max[0] || p[2] + TECH_HALF + 0.1 <= b.min[2] || p[2] - TECH_HALF - 0.1 >= b.max[2]);
  const halfWidth = Math.abs(along[0]) > 0.5 ? tool.size[2] / 2 : tool.size[2] / 2;
  for (let s = 0; s <= halfWidth; s += 0.25) for (const sign of s === 0 ? [1] : [-1, 1]) {
    const p = v3(base[0] + along[0] * s * sign, 0, base[2] + along[2] * s * sign);
    if (clear(p)) return { at: p, yaw: q(yaw) };
  }
  throw new Error(`${tool.id}: no service point clear of the floor robots`);
}
function peoplePath(at: V3, bayId: string | null): V2[] {
  const path: V2[] = [[DOOR_INSIDE[0], DOOR_INSIDE[2]]];
  if (bayId) {
    const bay = BAYS.find(b => b.id === bayId)!;
    path.push([bay.xc, SPINE_Z], [bay.xc, at[2]]);
  } else path.push([at[0], SPINE_Z]);
  path.push([at[0], at[2]]);
  return path.map(([x, z]) => [q(x), q(z)] as V2).filter((p, i, a) => i === 0 || p[0] !== a[i - 1]![0] || p[1] !== a[i - 1]![1]);
}
const pathLength = (path: V2[]) => q(path.reduce((s, p, i) => i ? s + Math.hypot(p[0] - path[i - 1]![0], p[1] - path[i - 1]![1]) : 0, 0));
const serviceTargets: Record<string, { at: V3; yaw: number; path: V2[]; lengthM: number; via: string }> = {};
for (const tool of tools) {
  if (tool.cell) continue;
  const sp = servicePoint(tool), path = peoplePath(sp.at, tool.bay);
  serviceTargets[tool.id] = { ...sp, path, lengthM: pathLength(path), via: `bay aisle ${tool.bay}` };
}
for (const c of LITHO.cells) {
  const track = tools.find(tt => tt.cell === c.cell && tt.type === 'coater-developer-track')!, sp = servicePoint(track), path = peoplePath(sp.at, null);
  serviceTargets[c.cell] = { ...sp, path, lengthM: pathLength(path), via: 'the spine (track front)' };
}

// ---- Walking (D-22) and floor paths ---------------------------------------------------------------------
// Areas are the walkable floor (Y 0); obstacles are derived in code from the placements (tool bodies, load
// ports, stockers, wall panels (doors closed), posts, floor robots, the gallery's benches and kiosks) plus the
// edges below. Paths are the floor routes a
// 0.62 m walker (FF3's humanoid) uses: the spine at floor level and the bay aisles.
const WALK = {
  eyeY: 1.6, speed: 1.4, runSpeed: 2.8, radius: 0.3,
  areas: [
    { id: 'fab', x: [-36, 36], z: [-27, 23.4] },
    { id: 'gallery', x: GALLERY.x, z: GALLERY.z },
    { id: 'landing', x: LANDING.x, z: LANDING.z },
  ],
  edges: [
    { id: 'section-cut-rail', from: [36, -27], to: [36, 23.4], note: 'a 1.1 m handrail along the cut: the raised floor ends here' },
    { id: 'landing-rail-n', from: [36, 19.8], to: [39.6, 19.8], note: 'viewing landing handrail' },
    { id: 'landing-rail-e', from: [39.6, 19.8], to: [39.6, 27], note: 'viewing landing handrail' },
    { id: 'gallery-wall-s', from: [-36, 27], to: [39.6, 27], note: 'the gallery\'s outer wall' },
    { id: 'gallery-wall-w', from: [-36, 23.4], to: [-36, 27], note: 'the gallery\'s west end' },
    // The segments turn local +Z onto the glazing (yaw 180), so their handrail (local Z 1.65, full tile length, top 1.10
    // m, the utility review's mount note) runs 0.15 m inside the glass along the whole gallery, doors included.
    { id: 'gallery-handrail', from: [GALLERY.x[0], q(GALLERY.z[0] + 0.15)], to: [GALLERY.x[1], q(GALLERY.z[0] + 0.15)], note: 'the gallery segments\' handrail, 1.10 m high, 0.15 m inside the glazing' },
  ],
  start: { position: [GALLERY_EYE.x, 0, GALLERY_EYE.z], yawDeg: 90, note: `in the gallery facing north, behind glazed panel ${GALLERY_EYE.panel} (the landing view's point)` },
  walker: { widthM: 0.62, note: 'the floor paths keep at least this clear width (FF3 humanoid work robot)' },
  paths: [
    { id: 'spine', from: [-35.2, 0], to: [35.2, 0] },
    ...BAYS.filter(b => b.loop).map(b => { const north = b.id.startsWith('N'); return { id: `aisle-${b.id}`, from: [b.xc, north ? -3 : 3], to: [b.xc, north ? -26.2 : 22.6] }; }),
  ],
};

// ---- Named views and the tour (sim-spec 10; TASK-FF2 item 4) -------------------------------------------
const litho = LITHO.cells.find(c => c.cell === 'cell-euv-1')!, etchBay = BAYS.find(b => b.id === 'N1')!;
const view = (position: V3, target: V3, fov: number, label: string, note?: string) => ({ position: position.map(q) as V3, target: target.map(q) as V3, fov, label, ...(note ? { note } : {}) });
const CAMERAS = {
  // Sim-spec 10's gallery view at the walk eye height (1.6 m over the flush walking surface) from the walk start: through
  // the middle of one glazed panel, toward the stocker canyon's centre line.
  landing: { position: [GALLERY_EYE.x, WALK.eyeY, GALLERY_EYE.z], target: [0, 3.0, 10.2], fov: 55, label: 'Gallery landing', note: `sim-spec 10: the gallery, looking north into the fab through glazed panel ${GALLERY_EYE.panel} from the walk start (a segment's own eye point falls on a wall mullion)` },
  overview: { position: [0, 64, 58], target: [0, 0, 0], fov: 40, label: 'Overview', note: 'overview orbit; the ceiling hides while the camera is above the FFU face' },
  spine: view([-33.6, 2.6, 0.6], [0, 1.9, -0.4], 55, 'The spine', 'along the central aisle under the two spine rails'),
  litho: view([litho.x + 3.8, 2.8, -5.2], [litho.x, 1.6, -15.5], 55, 'An EUV litho cell', 'the track and the scanner behind it, from the gap between the EUV cells'),
  cluster: view([etchBay.xc, 2.4, -3.3], [etchBay.xc, 1.1, -16], 55, 'The etch bay', 'down the aisle between the etch clusters, load ports on both sides'),
  stocker: view([0, 1.8, 19.2], [0, 2.8, 6.0], 55, 'The stocker canyon', 'between the two stockers, looking toward the spine'),
  gallery: view([-33.8, 1.6, 25.6], [-8, 1.5, 22.6], 60, 'The visitor gallery', 'along the gallery, the fab through the glazing'),
  section: view([53, 0.6, 12.5], [35, -2.2, 1.0], 50, 'The section cut', 'from the east: subfab, waffle slab, cleanroom, FFU band and interstitial'),
  walk: WALK,
  tour: {
    stops: ['landing', 'spine', 'litho', 'cluster', 'stocker', 'gallery', 'section'], legSeconds: 7, holdSeconds: 4,
    cutSeconds: 2, flySpeedMps: 3.5, filletM: 2, minHorizontalFovDeg: 40,
    note: 'the camera moves along the named views; everything it shows is live twin state',
    // Fly legs keep to the aisles at 2.4 to 2.8 m: over people (1.8 m), under the UTS shelves (from 3.12 m) and the
    // vehicles (from 3.9 m, hoists only at the ports along the aisle sides). The gallery, the fab floor and the section
    // view outside the cut are separate spaces, so the tour cuts between them through a fade.
    legs: [
      { from: 'landing', to: 'spine', kind: 'cut', note: 'from the gallery onto the fab floor (glazing between)' },
      { from: 'spine', to: 'litho', kind: 'fly', via: [[-30, 2.6, 0], [q(litho.x + 3.8), 2.7, 0]], note: 'east along the spine aisle, north into the gap between the EUV cells' },
      { from: 'litho', to: 'cluster', kind: 'fly', via: [[q(litho.x + 3.8), 2.6, 0], [etchBay.xc, 2.5, 0]], note: 'back to the spine, west, north into the etch bay aisle' },
      { from: 'cluster', to: 'stocker', kind: 'fly', via: [[etchBay.xc, 2.5, 0], [0, 2.4, 0]], note: 'back to the spine, east, south into the stocker canyon' },
      { from: 'stocker', to: 'gallery', kind: 'cut', note: 'from the fab floor into the gallery' },
      { from: 'gallery', to: 'section', kind: 'cut', note: 'from the gallery to the view of the section cut' },
    ],
    // What each stop shows (sim-spec 12 test 9 frames `anchor`, a point on `subject`, at 16:9 and 9:19.5).
    features: {
      landing: { subject: 'fab', lines: 'fab', anchor: [0, 3, 2], note: 'the stocker canyon and the spine beyond, through the glazing' },
      spine: { subject: 'spine', lines: 'fleet', anchor: [-15, 4.6, 1.8], note: 'the south spine rail and its vehicles' },
      litho: { subject: 'cell-euv-1', lines: 'tool', anchor: [litho.x, 2.0, -17.1], note: 'the scanner behind the track' },
      cluster: { subject: 'etch-03', lines: 'tool', anchor: [-30.9, 1.35, -14.1], note: 'the load-port face of the third west etch cluster' },
      stocker: { subject: 'stocker-e', lines: 'stocker', anchor: [1.65, 2.7, 10.2], note: 'the east stocker\'s canyon face' },
      gallery: { subject: 'gallery-04', lines: 'outputs', anchor: [-10.8, 1.2, 25.2], note: 'a gallery segment along the glazing' },
      section: { subject: 'section-5', lines: 'tools', anchor: [36, -3.5, 5.4], note: 'the subfab level of a section module at the cut' },
    },
  },
};

// ---- Assemble ----------------------------------------------------------------------------------
const cleanroom = { x: [-36, 36], z: [-27, 23.4], moduleSize: 3.6, grid: [20, 14] };
const layout = {
  schema: 'foundry-floor.layout/2',
  generatedBy: 'scripts/build-layout.ts (from the simulation spec sections 2-5 and 10 and the measured assets in data/assets.json)',
  basis: 'E unless a value carries its own label',
  conventions: {
    units: 'metres; yaw in degrees about +Y',
    frame: 'right-handed, +Y up, +X east, +Z south; a north-up top view shows +X to the right and +Z downward; compass words are scene labels, not a site orientation',
    yaw: '0 points an asset\'s +X along world +X, 180 along -X, -90 along +Z (south), +90 along -Z (north)',
    assetFrame: '+X forward (the working face or travel direction), +Y up, +Z right',
    loadSide: 'Every load port, stocker port and UTS seat lies directly under the rail; tools stand on the right of the direction of travel with their faces 0.3 m from the rail centreline; vehicles carry FOUPs with the door toward their right',
    measured: 'tool bounds, locators and keep-outs come from data/assets.json (the accepted GLBs); footprint and keepOut are world boxes',
  },
  scene: { x: [-36, 39.6], z: [-27, 27] },
  cleanroom,
  gallery: { ...GALLERY, segments: 10, segmentWidth: 7.2, yaw: 180, handrailY: q(1.1 - GALLERY_DROP), top: GALLERY_TOP, drop: GALLERY_DROP,
    note: 'visitor-gallery-segment tiles: glazing line (local +Z) on the fab wall at Z 23.4 (yaw 180), capped ends west, the run\'s open end east onto the viewing landing, the west end closed by a wall-kit panel; lowered 0.05 m so the walking surface is flush with Y 0',
    segmentPlacements: Array.from({ length: 10 }, (_, i) => ({ id: `gallery-${String(i + 1).padStart(2, '0')}`, position: v3(-32.4 + 7.2 * i, -GALLERY_DROP, 25.2), yaw: 180 })),

    landing: { ...LANDING, handrailY: 1.1, note: 'a viewing landing east of the cut: the section reads from here' } },
  sectionCut: { ...SECTION, note: 'east edge, no wall: subfab, waffle slab, cleanroom, FFU band and interstitial are visible; level-section-module tiles (measured), the row centred on the clean room',
    modulePlacements: SECTION_MODULES.map(m => ({ id: m.id, position: v3(SECTION.moduleOriginX, 0, m.z), yaw: 0, variant: m.variant,
      ...(m.variant === 'withoutShaft' ? { note: `the spine's east U-turn sweeps a vehicle (${VEHICLE_ENVELOPE.length} x ${VEHICLE_ENVELOPE.width} m) through this module's return-air shaft, so it draws without it (sim-spec 12 test 3)` } : {}) })),
    obstacles: SECTION_OBSTACLES, endWalls: sectionEndWalls, kitZone, subfabKits },
  floorRobots: { basis: `arm ${ARM.basis}; AMR ${AMR.basis}`, note: 'arm stations at load ports with their AMRs parked at deckPark; at rest in FF2 (no floor moves in the twin)', stations: robotStations,
    arms: robotStations.map(s => ({ ...s.arm, station: s.id, port: s.port })), amrs: robotStations.map(s => ({ ...s.amr, station: s.id, port: s.port })) },
  people: {
    note: 'service visits walk in through the fab door at the spine end, along the spine and the bay aisle to the service point, and out the same way; FF3\'s humanoid uses the same points and paths',
    door: { panel: PEOPLE_DOOR.id, position: PEOPLE_DOOR.position, inside: DOOR_INSIDE }, spineZ: SPINE_Z, serviceOutM: SERVICE_OUT,
    targets: serviceTargets,
  },
  heights: HEIGHTS,
  levels: LEVELS,
  floorModules: { ...cleanroom, count: 280 },
  ceilingModules: { ...cleanroom, count: 280, ffuFaceY: HEIGHTS.ffuFace },
  lithoZone: { amberCeiling: { x: [-21.6, 7.2], z: [-27, -1.8], modules: 56 }, partitions: [{ x: -21.6, z: [-27, -5.4], panels: 6 }, { x: 7.2, z: [-27, -5.4], panels: 6 }], note: 'open toward the spine where the track fronts face it',
    cells: LITHO.cells.map(c => ({ cell: c.cell, x: c.x, specX: c.specX, doorReach: c.doorReach })), doorMargin: DOOR_MARGIN },
  walls: { north: { z: -27, x: [-36, 36], solid: 20 }, west: { x: -36, z: [-27, 23.4], solid: 11, doors: 3 }, galleryEnd: { x: -36, z: GALLERY.z, panels: 1, scaleY: q(GALLERY_TOP / WALL_H) }, south: { z: 23.4, x: [-36, 36], glazed: 18, doors: 2 }, east: 'open (section cut)', panelWidth: PANEL_W, height: WALL_H, thickness: q(PANEL.max[2] - PANEL.min[2]), door: DOOR, panels, posts },
  installZone: { bay: 'S5', x: [21.6, 36], z: [12.0, 23.4], note: 'reserved floor for tool installation; no tools placed' },
  spine: { aisleZ: [-3, 3], northRail: { z: -1.8, heading: '-X (west)' }, southRail: { z: 1.8, heading: '+X (east)' }, uTurns: [{ center: [-SPINE_UTURN.x, 0], radius: SPINE_UTURN.radius }, { center: [SPINE_UTURN.x, 0], radius: SPINE_UTURN.radius }], circulation: 'anticlockwise in a north-up top view' },
  bayLoop: BAY_LOOP,
  bays: BAYS,
  rails: {
    datumY: Y, section: { width: 0.3, height: 0.2, shape: 'C channel' },
    kit: {
      straight: { length: 3.6, endA: [-1.8, 0, 0], endB: [1.8, 0, 0], fillerScale: [0.25, 1.0] },
      curve: { radius: 1.8, sweepDeg: 90, from: [0, 0, 0], to: [1.8, 0, 1.8], center: [0, 0, 1.8], note: 'origin heading +X to (1.8, 0, 1.8) heading +Z (a right turn); traversed in reverse it is a left turn' },
      switch: { length: 1.8, main: { from: [0, 0, 0], to: [1.8, 0, 0] }, branchDiverge: { from: [0, 0, 0], to: [1.8, 0, 1.8], center: [0, 0, 1.8] }, branchMerge: { from: [0, 0, 1.8], to: [1.8, 0, 0], center: [1.8, 0, 1.8] }, toggleS: 0.6, note: 'one branch is used per placement; the other is hidden by node name' },
    },
    speeds: { straight: { value: 5.0, basis: 'C' }, curve: { value: 1.0, basis: 'E' }, switch: { value: 2.0, basis: 'E' } },
    runs, curves, switches,
  },
  loadPort: { entity: 'loadPort', bounds: { min: LOAD_PORT.bounds.min, max: LOAD_PORT.bounds.max }, seat: LOAD_PORT_SEAT },
  tools, stockers, uts,
  stockerSlots: STOCKER.slots,
  cameras: CAMERAS,
};

const familyToGroup: Record<string, string> = {};
for (const [g, v] of Object.entries(GROUPS)) for (const f of v.routeFamilies) familyToGroup[f] = g;
const processMin = (g: Group) => g.batch ? FURNACE_BATCH.cycleH * 60 + FURNACE_BATCH.handlingMin : WAFERS_PER_LOT / g.wph! * 60 + g.lotOverheadMin!;
const toolsData = {
  schema: 'foundry-floor.tools/1',
  generatedBy: 'scripts/build-layout.ts',
  basis: 'E: every process and reliability input is an estimate (report b.11 inputs; sim-spec 3.7)',
  wafersPerLot: WAFERS_PER_LOT,
  groups: Object.fromEntries(Object.entries(GROUPS).map(([id, g]) => [id, {
    label: g.label, routeFamilies: g.routeFamilies, toolType: g.toolType, installed: g.installed, accent: g.accent,
    ...(g.batch ? { batch: true } : { wph: { value: g.wph, basis: 'E' }, lotOverheadMin: { value: g.lotOverheadMin, basis: 'E' } }),
    processMinPerLot: Math.round(processMin(g) * 10000) / 10000,
    processMsPerLot: Math.round(processMin(g) * 60000),
    reliability: { mtbfH: g.mtbfH, mttrH: g.mttrH, pmEveryH: g.pmEveryH, pmLengthH: g.pmLengthH, basis: 'E', ttf: 'exponential with the MTBF (calendar time)', repair: 'lognormal with the MTTR as its mean, shape 0.5', pm: 'staggered across the tools of the group' },
  }])),
  familyToGroup,
  furnaceBatch: FURNACE_BATCH,
  engineering: { afterPmQualificationMin: 30, basis: 'E', note: 'a qualification run after each PM shows the ENGINEERING state' },
  tools: tools.map(t => ({ id: t.id, type: t.type, group: t.group, bay: t.bay, side: t.side, position: t.position, yaw: t.yaw, ports: t.ports.map(p => p.id), ...(t.cell ? { cell: t.cell } : {}), scheduled: t.scheduled })),
  cells: LITHO.cells.map(c => ({ id: c.cell, group: c.group, track: `track-${c.group}-${c.cell.slice(-1)}`, scanner: `scanner-${c.group}-${c.cell.slice(-1)}`, note: 'one resource that uses the track\'s four ports' })),
  stockers: stockers.map(s => ({ id: s.id, position: s.position, yaw: s.yaw, ports: s.ports.map(p => p.id), manualPort: s.manualPort.id,
    slots: 252, usableSlots: null as number | null, crane: { travelZ: 2.0, lift: 1.0, forkCycleS: 2.0, basis: 'E' }, passThrough: { distanceM: 1.15, seconds: 3, basis: 'E' } })),
  uts: uts.map(u => ({ id: u.id, rail: u.rail, position: u.position, seats: u.seats.map(s => s.id) })),
};
// Usable slots: 252 minus the front-rack slots displaced by the five inner seats (within 0.5 m of a port Z, levels 0-1).
{
  const portZ = [...STOCKER.ports.map(p => p[2]), STOCKER.manualPortSeat[2]];
  let blocked = 0;
  for (let i = 0; i < STOCKER.slots.columns; i++) for (let j = 0; j < 2; j++) if (portZ.some(z => Math.abs(STOCKER.slots.z0 + i * STOCKER.slots.dz - z) < 0.5 - 1e-9)) blocked++;
  for (const s of toolsData.stockers) s.usableSlots = 252 - blocked;
}

const route: { step: number; module: number; loop: number; family: string; group: string }[] = [];
MODULES.forEach((m, mi) => { for (let l = 0; l < m.loops; l++) for (const f of m.families) route.push({ step: route.length, module: mi, loop: l, family: f, group: familyToGroup[f]! }); });
const passes: Record<string, number> = {};
for (const r of route) passes[r.family] = (passes[r.family] ?? 0) + 1;
for (const [f, n] of Object.entries(EXPECTED_PASSES)) if (passes[f] !== n) throw new Error(`route passes for ${f}: ${passes[f]} != ${n}`);
if (route.length !== 240) throw new Error(`route has ${route.length} steps`);
const rawMin = route.reduce((s, r) => s + processMin(GROUPS[r.group]!), 0);
const routeData = {
  schema: 'foundry-floor.route/1',
  generatedBy: 'scripts/build-layout.ts',
  basis: 'E: a 240-step abstraction of a 2 nm-class flow (report b.10); real flows exceed 300 steps [R]',
  steps: route.length,
  modules: MODULES.map((m, i) => ({ index: i, name: m.name, loops: m.loops, families: m.families, steps: m.loops * m.families.length })),
  passes,
  rawProcessHours: Math.round(rawMin / 60 * 100) / 100,
  route: route.map(r => [r.family, r.module, r.loop]),
  routeColumns: ['family', 'module', 'loop'],
};

function emit(name: string, value: unknown): { name: string; text: string } { return { name, text: JSON.stringify(value, null, 1) + '\n' }; }
const outputs = [emit('layout.json', layout), emit('tools.json', toolsData), emit('route.json', routeData)];
if (import.meta.main) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const o of outputs) {
    const path = resolve(ROOT, 'data', o.name);
    if (check) { let old = ''; try { old = readFileSync(path, 'utf8'); } catch { /* missing */ } if (old !== o.text) { stale++; console.log(`stale: data/${o.name}`); } }
    else writeFileSync(path, o.text);
  }
  console.log(JSON.stringify({ tools: tools.length, ports: tools.reduce((n, t) => n + t.ports.length, 0), stockers: stockers.length, uts: uts.length, utsSeats: uts.length * 2, panels: panels.length, posts: posts.length, switches: switches.length, curves: curves.length, runs: runs.length, litho: LITHO.cells.map(c => `${c.cell} ${c.x}`), rawProcessHours: routeData.rawProcessHours, bytes: outputs.map(o => o.text.length), mode: check ? 'check' : 'write', stale }));
  if (check && stale) process.exit(1);
}
