/**
 * What lies outside the town, from the plan alone: the paved roads that leave its open street ends,
 * the trees and shrubs a walker can reach, the woods and hedgerows beyond them, and the fallen
 * leaves under it all. Pure and seeded: the same seed gives the same country.
 * Plan coordinates: streets run along Z from 0 to the town's length.
 */
import { random } from './plan/plan.js';
import type { Random } from './plan/plan.js';
import type { TownPlacement, TownPlan } from './plan/town-plan.js';

/**
 * A road as a line of points [x, z] with the half width of its carriageway. It starts at `from`, on
 * the town's edge and `drop` below the ground, and has climbed to the ground by its first point.
 */
/** `mouth` is half the road's width where it leaves the town, when that is wider than the road itself: the street's own width. */
export interface Road { id: string; half: number; mouth?: number; points: [number, number][]; main: boolean; from: [number, number]; drop: number }
/** Where a street leaves the town: the carriageway is lower than the ground, so the ground is left open for the climb. */
export interface Threshold { x: number; z: number; dz: 1 | -1; half: number; drop: number }
export type TreeForm = 'broad' | 'column' | 'open' | 'conifer' | 'shrub';
/** A tree too far off to walk to: drawn as a picture of the tree kit, not as the kit itself. */
export interface FarTree { x: number; z: number; height: number; spread: number; form: TreeForm; leaf: string; accent: string; bark: string }
/** Fallen leaves under a tree, or the floor of a wood: a soft patch on the ground. */
export interface Litter { x: number; z: number; radius: number; colour: string; strength: number }
export interface Outskirts {
  roads: Road[];
  thresholds: Threshold[];
  /** Trees and shrubs near enough to walk among: placements of the tree kit. */
  trees: TownPlacement[];
  far: FarTree[];
  litter: Litter[];
  /** The colours the town's streets are paved in, which its roads keep. */
  paving: { sett: string; kerb: string };
}

/** Metres of climb between a street's carriageway and the road on the ground. */
export const RAMP = 3.5;
/** A tree nearer the walls than this is the kit itself; farther off it is a picture of it. */
export const NEAR = 150;
/** How far out the country is planted, metres from the walls. */
export const FAR = 640;
/** How far a gatehouse stands out past the street end, metres: the planner's building depth. */
const GATEHOUSE = 8;
const ROAD_LENGTH = 620;

/**
 * Leaf and second-leaf colours of a wood in autumn, and how common each is. A crown keeps to one
 * family: a tree still green is green all through, and one that has turned is gold, orange or red
 * all through. Green beside gold or orange in one crown reads as a fault, so no tone mixes them.
 */
export const AUTUMN: { leaf: string; accent: string; weight: number }[] = [
  { leaf: '#4f6b2e', accent: '#5e7d34', weight: 3 },
  { leaf: '#44602f', accent: '#537239', weight: 2.5 },
  { leaf: '#d1a62f', accent: '#e3bf4a', weight: 3 },
  { leaf: '#cf8a2a', accent: '#e0a63c', weight: 2.5 },
  { leaf: '#c9692a', accent: '#dd8a35', weight: 2 },
  { leaf: '#b04428', accent: '#cc6230', weight: 1.2 },
  { leaf: '#8f3524', accent: '#b04a2a', weight: 0.6 },
];
/** Evergreens keep their colour. */
export const EVERGREEN: { leaf: string; accent: string; weight: number }[] = [
  { leaf: '#2f4a34', accent: '#3d5a3c', weight: 2 },
  { leaf: '#33513a', accent: '#46613f', weight: 1 },
];
/** Hedgerow shrubs: dull greens, and a few that have turned russet. */
export const HEDGE: { leaf: string; accent: string; weight: number }[] = [
  { leaf: '#55632f', accent: '#64753a', weight: 2.5 },
  { leaf: '#5f6b33', accent: '#6f7d3c', weight: 2 },
  { leaf: '#9a5a2c', accent: '#b4702f', weight: 1 },
  { leaf: '#8a4228', accent: '#a8552c', weight: 0.6 },
];
const BARK: Record<TreeForm, string[]> = {
  broad: ['#6a5644', '#74624f', '#5e4d3f'],
  column: ['#7a6e5e', '#6b6052'],
  open: ['#d9d4c8', '#cdc7ba', '#e0dbd0'],
  conifer: ['#63503f', '#584739'],
  shrub: ['#574a3d'],
};
/** What the tree kit can be: its declared ranges. */
export const TREE_RANGE = { height: [1.5, 16], spread: [1.5, 9] } as const;

type Tone = { leaf: string; accent: string; weight: number };
const smooth = (t: number) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, value));

/** Distance from a point to a line of points. */
export function nearRoad(road: Pick<Road, 'points'>, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < road.points.length; i++) {
    const [ax, az] = road.points[i]!, [bx, bz] = road.points[i + 1]!;
    const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
    const t = length ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Points along a line at every `step` metres from `from`, each with the unit normal to its left. */
function along(points: readonly [number, number][], from: number, to: number, step: number): { x: number; z: number; nx: number; nz: number; at: number }[] {
  const out = [];
  let walked = 0, next = from;
  for (let i = 0; i + 1 < points.length && next <= to; i++) {
    const [ax, az] = points[i]!, [bx, bz] = points[i + 1]!, length = Math.hypot(bx - ax, bz - az);
    while (next <= walked + length && next <= to) {
      const t = (next - walked) / length;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx: -(bz - az) / length, nz: (bx - ax) / length, at: next });
      next += step;
    }
    walked += length;
  }
  return out;
}

export function planOutskirts(plan: TownPlan): Outskirts {
  const R = random(`seed-town:${plan.seed}/outskirts`);
  const { x0, x1, length, kerbHeight } = plan.town;
  const high = plan.streets[Math.min(1, plan.streets.length - 1)]!.name;
  const roads: Road[] = [], thresholds: Threshold[] = [];
  const paved = plan.placements.find(place => place.kit === 'paving')?.values as { sett?: string; kerb?: string } | undefined;
  const paving = { sett: paved?.sett ?? '#6f6a66', kerb: paved?.kerb ?? '#8e8a84' };

  // ---- roads: the high street's road runs on to the horizon; a side street's road joins it ----
  const open = plan.ends.filter(end => end.open);
  for (const end of open) thresholds.push({ x: end.x, z: end.z, dz: end.end === 'N' ? 1 : -1, half: end.road + 0.3, drop: kerbHeight });
  const mainOf = new Map<string, Road>();
  for (const end of open.filter(e => e.street === high)) {
    const dz = end.end === 'N' ? 1 : -1, Q = R.fork(`road-${end.end}`), drift = (Q.next() * 2 - 1) * 70, straight = 46 + Q.next() * 20;
    const points: [number, number][] = [];
    for (let d = RAMP; d <= ROAD_LENGTH; d += d < 220 ? 5 : 14) points.push([end.x + drift * smooth((d - straight) / 300), end.z + dz * d]);
    const road: Road = { id: `road-${end.street}${end.end}`, half: end.road + 0.3, points, main: true, from: [end.x, end.z], drop: kerbHeight };
    roads.push(road);
    mainOf.set(end.end, road);
  }
  for (const end of open.filter(e => e.street !== high)) {
    const dz = end.end === 'N' ? 1 : -1, Q = R.fork(`road-${end.street}${end.end}`), main = mainOf.get(end.end);
    const lead = 22 + Q.next() * 14, points: [number, number][] = [[end.x, end.z + dz * RAMP]];
    if (!main) {
      for (let d = RAMP + 6; d <= ROAD_LENGTH; d += 12) points.push([end.x, end.z + dz * d]);
    } else {
      // Out of the gate, then a long curve into the high road, arriving along it.
      const joinAt = Math.max(8, Math.round((84 + Q.next() * 50 - RAMP) / 5)), j = Math.min(main.points.length - 2, joinAt);
      const [tx, tz] = main.points[j]!, [ux, uz] = main.points[j + 1]!, heading = Math.hypot(ux - tx, uz - tz);
      const p0: [number, number] = [end.x, end.z + dz * lead], reach = Math.abs(tz - p0[1]) * 0.5;
      const p1: [number, number] = [end.x, p0[1] + dz * reach], p2: [number, number] = [tx - (ux - tx) / heading * reach, tz - (uz - tz) / heading * reach];
      for (let d = RAMP + 5; d < lead; d += 5) points.push([end.x, end.z + dz * d]);
      for (let i = 0; i <= 26; i++) {
        const t = i / 26, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, e = t ** 3;
        points.push([a * p0[0] + b * p1[0] + c * p2[0] + e * tx, a * p0[1] + b * p1[1] + c * p2[1] + e * tz]);
      }
    }
    roads.push({ id: `road-${end.street}${end.end}`, half: Math.min(end.road, 2.6), mouth: end.road + 0.3, points, main: false, from: [end.x, end.z], drop: kerbHeight });
  }

  // ---- planting ----
  const trees: TownPlacement[] = [], far: FarTree[] = [], litter: Litter[] = [];
  const T = R.fork('trees');
  /** Metres from the town's walls; a gatehouse counts as wall. Nothing inside. */
  const fromWalls = (x: number, z: number) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(-GATEHOUSE - z, 0, z - length - GATEHOUSE));
  const inside = (x: number, z: number, margin: number) => x > x0 - margin && x < x1 + margin && z > -GATEHOUSE - margin && z < length + GATEHOUSE + margin;
  // What stands where, in cells, so a tree need only look at its neighbours.
  const CELL = 12, cells = new Map<string, { x: number; z: number; room: number }[]>();
  const cellOf = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const crowded = (x: number, z: number, room: number) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const other of cells.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(other.x - x, other.z - z) < (other.room + room) * 0.42) return true;
    }
    return false;
  };
  /** Clear of the town's walls, of every road and of what already stands. */
  const free = (x: number, z: number, room: number, skipRoads = false) => {
    if (inside(x, z, 4 + room / 2)) return false;
    if (!skipRoads && roads.some(road => nearRoad(road, x, z) < road.half + 1.9 + room * 0.32)) return false;
    return !crowded(x, z, room);
  };
  const tone = (Q: Random, form: TreeForm): Tone => Q.weighted((form === 'conifer' ? EVERGREEN : form === 'shrub' ? HEDGE : AUTUMN).map(t => [t, t.weight] as [Tone, number]));
  const plant = (Q: Random, id: string, form: TreeForm, x: number, z: number, colour = tone(Q, form), scale = 1) => {
    const size = Q.next(), lean = Q.next();
    const height = round(clamp(scale * (form === 'broad' ? 9 + size * 5.5 : form === 'column' ? 12 + size * 4 : form === 'open' ? 7 + size * 4 : form === 'conifer' ? 9 + size * 6 : 1.6 + size * 1.6), TREE_RANGE.height));
    const spread = round(clamp(form === 'broad' ? height * (0.52 + lean * 0.16) : form === 'column' ? 4.5 + lean * 1.5 : form === 'open' ? 3.5 + lean * 2 : form === 'conifer' ? height * (0.36 + lean * 0.08) : 2 + lean * 1.6, TREE_RANGE.spread));
    const room = form === 'column' ? spread * 0.45 : spread, bark = Q.pick(BARK[form]);
    // A crown wears its own tone's pair. A second colour borrowed from another tone goes olive in the crown's shade and reads as green spots.
    const accent = colour.accent;
    const list = cells.get(cellOf(x, z));
    if (list) list.push({ x, z, room }); else cells.set(cellOf(x, z), [{ x, z, room }]);
    // Near or far is decided where the tree is recorded, to the same tenth of a metre.
    if (fromWalls(round(x), round(z)) > NEAR) {
      far.push({ x: round(x), z: round(z), height, spread, form, leaf: colour.leaf, accent, bark });
      return;
    }
    trees.push({ id, kit: 'tree', pos: [round(x), 0, round(z)], yaw: Q.int(0, 359), values: { height, spread, form, leaf: colour.leaf, leafAccent: accent, bark } });
    // Leaves have begun to fall: a patch of them under every tree that sheds.
    if (form !== 'conifer' && form !== 'shrub') litter.push({ x: round(x), z: round(z), radius: round(room * 0.62 + 0.8), colour: accent, strength: 0.55 + 0.35 * Q.next() });
  };

  // Avenues: both sides of each high road, one kind of tree to a road; a side road gets a looser line.
  for (const road of roads) {
    const Q = T.fork(road.id), form = road.main ? Q.weighted([['column', 3], ['broad', 2]] as ['column' | 'broad', number][]) : Q.weighted([['broad', 3], ['open', 2]] as ['broad' | 'open', number][]);
    const first = tone(Q, form), other = tone(Q, form), step = road.main ? 9 + Q.next() * 2.5 : 13 + Q.next() * 4, aside = road.half + (form === 'broad' ? 5 : 3.6);
    for (const stop of along(road.points, 7, road.main ? 440 : 150, step)) {
      for (const side of [-1, 1]) {
        if (!road.main && Q.chance(0.35)) continue;
        const x = stop.x + stop.nx * aside * side, z = stop.z + stop.nz * aside * side;
        // An avenue tree keeps clear of the other roads, not of its own.
        if (roads.some(r => r !== road && nearRoad(r, x, z) < r.half + 2.6)) continue;
        if (!free(x, z, form === 'column' ? 2 : 5, true)) continue;
        plant(Q, `tree-${road.id}-${trees.length + far.length}`, form, x, z, Q.chance(0.72) ? first : other, road.main ? 1 : 0.92);
      }
    }
  }

  const cx = (x0 + x1) / 2, cz = length / 2, halfX = (x1 - x0) / 2, halfZ = length / 2 + GATEHOUSE;
  /** A point at a seeded bearing, between `near` and `far` metres out from the walls. */
  const ring = (Q: Random, near: number, far: number, bias = 1.4): [number, number] => {
    const turn = Q.next() * Math.PI * 2, out = near + (far - near) * Q.next() ** bias;
    const ex = Math.cos(turn), ez = Math.sin(turn), edge = Math.min(halfX / Math.max(1e-6, Math.abs(ex)), halfZ / Math.max(1e-6, Math.abs(ez)));
    return [cx + ex * (edge + out), cz + ez * (edge + out)];
  };
  /** A wood: trees filling a round patch at `spacing`, shrubs along its edge, and its floor under them. */
  const wood = (Q: Random, label: string, at: [number, number], radius: number, spacing: number, forms: [TreeForm, number][], scale: number, edge: boolean) => {
    const main = tone(Q, 'broad'), count = Math.round(Math.PI * radius * radius / (spacing * spacing * 1.15));
    let stood = 0;
    for (let i = 0, tries = 0; i < count && tries < count * 5; tries++) {
      const turn = Q.next() * Math.PI * 2, out = radius * Math.sqrt(Q.next()), x = at[0] + Math.cos(turn) * out, z = at[1] + Math.sin(turn) * out;
      const form = Q.weighted(forms);
      if (!free(x, z, form === 'broad' ? spacing * 1.05 : spacing * 0.75)) continue;
      plant(Q, `tree-${label}-${i}`, form, x, z, form === 'conifer' ? undefined : Q.chance(0.55) ? main : tone(Q, form), scale);
      i++;
      stood++;
    }
    if (edge) {
      for (let i = 0, n = Math.round(2 * Math.PI * radius / 3.4); i < n; i++) {
        if (Q.chance(0.4)) continue;
        const turn = 2 * Math.PI * (i + Q.next() * 0.5) / n, out = radius + 1 + Q.next() * 2.5, x = at[0] + Math.cos(turn) * out, z = at[1] + Math.sin(turn) * out;
        if (free(x, z, 2.4)) plant(Q, `tree-${label}-edge-${i}`, 'shrub', x, z);
      }
    }
    if (stood > 2) litter.push({ x: round(at[0]), z: round(at[1]), radius: round(radius + 5), colour: '#3a3a22', strength: 0.5 });
  };
  /** A hedgerow: shrubs in a line with a tree now and then. */
  const hedge = (Q: Random, label: string, from: [number, number], bearing: number, run: number, step: number, treeEvery: number, shrubs: boolean) => {
    const dx = Math.cos(bearing), dz = Math.sin(bearing);
    for (let d = 0, i = 0; d <= run; d += step * (0.85 + 0.3 * Q.next()), i++) {
      const x = from[0] + dx * d + (Q.next() - 0.5) * 0.8, z = from[1] + dz * d + (Q.next() - 0.5) * 0.8;
      const tall = i % treeEvery === treeEvery - 1 || !shrubs;
      if (!tall && Q.chance(0.12)) continue;                                           // a gap
      const form: TreeForm = tall ? Q.weighted([['broad', 4], ['open', 2], ['conifer', 1]] as [TreeForm, number][]) : 'shrub';
      if (free(x, z, tall ? 4 : 2.2)) plant(Q, `tree-${label}-${i}`, form, x, z);
    }
  };
  /** A bearing along the walls or square to them, a few degrees off: fields are laid out from the town. */
  const fieldBearing = (Q: Random) => Q.int(0, 3) * Math.PI / 2 + (Q.next() - 0.5) * 0.3;

  // Near the town, where a walker goes: woods with shrubs at their edges, hedgerows, groups and single trees.
  const N = T.fork('near');
  for (let w = 0, n = N.int(3, 4); w < n; w++) wood(N, `wood-${w}`, ring(N, 42, 112, 1), 13 + N.next() * 9, 5.6, [['broad', 5], ['conifer', 2], ['open', 2]], 1, true);
  for (let h = 0, n = N.int(6, 8); h < n; h++) hedge(N, `hedge-${h}`, ring(N, 14, 90, 1), fieldBearing(N), 45 + N.next() * 70, 2.7, N.int(5, 8), true);
  for (let g = 0, n = N.int(9, 12); g < n; g++) wood(N, `group-${g}`, ring(N, 14, 130), 4 + N.next() * 5, 5, [['broad', 5], ['open', 3], ['conifer', 1]], 1, false);
  for (let s = 0, n = N.int(22, 30); s < n; s++) {
    const [x, z] = ring(N, 9, 140), form = N.weighted([['broad', 5], ['open', 3], ['conifer', 1], ['shrub', 2]] as [TreeForm, number][]);
    if (free(x, z, form === 'shrub' ? 2.4 : 5)) plant(N, `tree-single-${s}`, form, x, z);
  }
  // Beyond, to the horizon: lines of trees between the fields, and woods that thicken with distance.
  const F = T.fork('far');
  for (let h = 0, n = F.int(16, 22); h < n; h++) hedge(F, `line-${h}`, ring(F, NEAR + 8, FAR - 160, 1), fieldBearing(F), 120 + F.next() * 180, 10, 1, false);
  for (let w = 0, n = F.int(44, 54); w < n; w++) wood(F, `far-${w}`, ring(F, NEAR + 30, FAR, 0.75), 24 + F.next() * 46, 8.2, [['broad', 7], ['conifer', 3], ['open', 1]], 1.08, false);
  for (let s = 0, n = F.int(110, 150); s < n; s++) {
    const [x, z] = ring(F, NEAR + 4, FAR - 40, 1), form = F.weighted([['broad', 5], ['open', 2], ['conifer', 2]] as [TreeForm, number][]);
    if (free(x, z, 5)) plant(F, `far-single-${s}`, form, x, z);
  }
  return { roads, thresholds, trees, far, litter, paving };
}
