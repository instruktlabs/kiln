/**
 * The open ground round the town, with no renderer: the meadow as triangles, left open where a
 * street leaves the town, the paved roads that climb out of those openings and run over it, and
 * the mottling and grit the grass wears.
 * Everything here is in scene coordinates: the town centred on the origin.
 */
import { RAMP } from './outskirts';
import type { Road, Threshold } from './outskirts';
import { nearRoad } from './outskirts';
import { toLinear } from './sky';

export interface GroundMesh { positions: Float32Array; normals: Float32Array; colors: Float32Array; uvs: Float32Array; index: Uint32Array }

/** Linear colours of the grass, of the stone face beside a road's climb and of a road's shoulder, and how the ground is laid. */
export const GROUND = {
  grass: [toLinear(0.42), toLinear(0.43), toLinear(0.24)] as const,
  bank: [toLinear(0.5), toLinear(0.48), toLinear(0.45)] as const,
  shoulder: [toLinear(0.4), toLinear(0.36), toLinear(0.26)] as const,
  /** Metres one repeat of the mottling covers. */
  tile: 173,
  /** Metres one repeat of the grit covers. */
  grit: 3.2,
  /** The meadow lies a hair under the pavement it meets; a road's gutter lies a hair over the meadow. */
  y: -0.004,
  roadLift: 0.02,
  /** A carriageway is higher along its middle by this much, as in the town. */
  camber: 0.07,
  /** A kerb's width, and how far it stands above the gutter out on the road. */
  kerb: 0.15,
  kerbRise: 0.04,
  /** A road's setts begin this far inside the town and this far under the street's, so the join shows no crack. */
  tuck: 0.1,
  tuckDrop: 0.012,
  /** How wide a road's shoulder fades into the grass, metres. */
  edge: 0.9,
};

function collect(itemSize: number) {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], uvs: number[] = [], index: number[] = [];
  return {
    get count() { return positions.length / 3; },
    /** Texture coordinates are the place on the ground in mottling repeats unless `uv` gives them, in metres. */
    vertex(x: number, y: number, z: number, n: readonly number[], color: readonly number[], alpha = 1, uv?: readonly [number, number]) {
      positions.push(x, y, z);
      normals.push(n[0]!, n[1]!, n[2]!);
      colors.push(color[0]!, color[1]!, color[2]!);
      if (itemSize === 4) colors.push(alpha);
      if (uv) uvs.push(uv[0], uv[1]); else uvs.push(x / GROUND.tile, z / GROUND.tile);
    },
    face(...corners: number[]) { for (let i = 1; i + 1 < corners.length; i++) index.push(corners[0]!, corners[i]!, corners[i + 1]!); },
    /** A face of ground, wound whichever way looks up. */
    lie(...corners: number[]) {
      for (let i = 1; i + 1 < corners.length; i++) {
        const [a, b, c] = [corners[0]! * 3, corners[i]! * 3, corners[i + 1]! * 3];
        const up = (positions[b + 2]! - positions[a + 2]!) * (positions[c]! - positions[a]!) - (positions[b]! - positions[a]!) * (positions[c + 2]! - positions[a + 2]!);
        if (up >= 0) index.push(corners[0]!, corners[i]!, corners[i + 1]!); else index.push(corners[0]!, corners[i + 1]!, corners[i]!);
      }
    },
    done: (): GroundMesh => ({ positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), uvs: new Float32Array(uvs), index: new Uint32Array(index) }),
  };
}

const UP = [0, 1, 0] as const;

/**
 * Four strips of ground that meet the town's outer walls and run `far` metres out. Where a street
 * leaves the town its carriageway is lower than the ground, so the strip is left open there for
 * RAMP metres, with a stone face on each side; the road itself climbs through the opening.
 */
export function meadowGeometry(frame: { halfX: number; halfZ: number }, thresholds: readonly Threshold[], far: number): GroundMesh {
  const X = frame.halfX, Z = frame.halfZ, mesh = collect(3);
  // Counter-clockwise seen from above, so the ground faces up.
  const flat = (minX: number, maxX: number, minZ: number, maxZ: number) => {
    if (maxX - minX < 1e-6 || maxZ - minZ < 1e-6) return;
    const base = mesh.count;
    for (const [x, z] of [[minX, maxZ], [maxX, maxZ], [maxX, minZ], [minX, minZ]] as const) mesh.vertex(x, GROUND.y, z, UP, GROUND.grass);
    mesh.face(base, base + 1, base + 2, base + 3);
  };
  for (const dz of [-1, 1] as const) {
    const edge = dz * Z, lip = dz * (Z + RAMP), outer = dz * (Z + far);
    flat(-X - far, X + far, Math.min(lip, outer), Math.max(lip, outer));
    // The band against the wall, left open across each street that leaves by this edge.
    const gaps = thresholds.filter(t => t.dz === dz && Math.abs(t.z - edge) < 0.01).sort((a, b) => a.x - b.x);
    let from = -X - far;
    for (const gap of gaps) {
      flat(from, gap.x - gap.half, Math.min(edge, lip), Math.max(edge, lip));
      from = gap.x + gap.half;
      const low = -gap.drop, a = gap.x - gap.half, b = gap.x + gap.half;
      // A stone face on each side closes the wedge between the climbing road and the grass.
      for (const [x, side] of [[a, 1], [b, -1]] as const) {
        const start = mesh.count, wall = [side, 0, 0];
        const corners: [number, number, number][] = [[x, low, edge], [x, GROUND.y, edge], [x, GROUND.y, lip]];
        const order = side * dz > 0 ? [0, 1, 2] : [0, 2, 1];
        for (const k of order) mesh.vertex(corners[k]![0], corners[k]![1], corners[k]![2], wall, GROUND.bank);
        mesh.face(start, start + 1, start + 2);
      }
    }
    flat(from, X + far, Math.min(edge, lip), Math.max(edge, lip));
  }
  flat(-X - far, -X, -Z, Z);
  flat(X, X + far, -Z, Z);
  return mesh.done();
}

export interface RoadMeshes {
  /** The carriageways: setts, texture coordinates in metres along and across the road. */
  carriage: GroundMesh;
  /** Kerbs and shoulders: colours carry four components, the last how solid (0 where a shoulder meets the grass or another road crosses). */
  edging: GroundMesh;
}

/**
 * The roads out of the town as the town's own streets carry on: a cambered carriageway of setts
 * between two stone kerbs, with an earth shoulder that fades into the grass. Each road starts at the
 * town's edge, level with the street and as wide, and climbs to the ground by its first point. `sett` and
 * `kerb` are linear colours. Kerbs stop where another road's carriageway crosses them.
 */
export function roadGeometry(roads: readonly Road[], sett: readonly number[], kerb: readonly number[]): RoadMeshes {
  const carriage = collect(3), edging = collect(4);
  for (const road of roads) {
    const others = roads.filter(other => other !== road);
    // A side road lies a hair lower, so where it runs into the high road the high road's setts show.
    const lift = GROUND.roadLift - (road.main ? 0 : 0.01);
    const line: { x: number; z: number; base: number }[] = [{ x: road.from[0], z: road.from[1], base: -road.drop }, ...road.points.map(([x, z]) => ({ x, z, base: lift }))];
    let walked = 0, previous = -1, previousEdge = -1;
    for (let i = 0; i < line.length; i++) {
      const before = line[Math.max(0, i - 1)]!, after = line[Math.min(line.length - 1, i + 1)]!, here = line[i]!;
      const length = Math.hypot(after.x - before.x, after.z - before.z) || 1, nx = -(after.z - before.z) / length, nz = (after.x - before.x) / length;
      if (i > 0) walked += Math.hypot(here.x - line[i - 1]!.x, here.z - line[i - 1]!.z);
      // Through the town's edge and up the climb a road is as wide as the street it carries on; after that, its own width.
      const half = i < 2 ? road.mouth ?? road.half : road.half;
      const base = carriage.count;
      // The first row of setts is tucked under the end of the street; the kerbs start at the town's edge itself.
      const back = i === 0 ? GROUND.tuck / length : 0, sx = here.x - (after.x - before.x) * back, sz = here.z - (after.z - before.z) * back;
      const along = i === 0 ? 0 : walked + GROUND.tuck, level = here.base - (i === 0 ? GROUND.tuckDrop : 0);
      for (const k of [-1, -0.5, 0, 0.5, 1]) {
        carriage.vertex(sx + nx * half * k, level + GROUND.camber * (1 - k * k), sz + nz * half * k, UP, sett, 1, [along, half * k]);
      }
      if (previous >= 0) for (let k = 0; k < 4; k++) carriage.lie(previous + k, base + k, base + k + 1, previous + k + 1);
      previous = base;
      // On each side: the kerb's two edges, then the shoulder, then where it has faded into the grass.
      const top = Math.max(0, here.base + GROUND.kerbRise), edge = edging.count;
      for (const side of [-1, 1]) {
        const across: [number, number, readonly number[], number][] = [
          [half, top, kerb, 1], [half + GROUND.kerb, top, kerb, 1], [half + GROUND.kerb + 0.04, 0.012, GROUND.shoulder, 1], [half + GROUND.kerb + GROUND.edge, 0.006, GROUND.shoulder, 0],
        ];
        for (const [out, y, colour, solid] of across) {
          const x = here.x + nx * out * side, z = here.z + nz * out * side;
          const crossed = others.some(other => nearRoad(other, x, z) < other.half + 0.2);
          edging.vertex(x, y, z, UP, colour, crossed ? 0 : solid, [walked, out * side]);
        }
      }
      if (previousEdge >= 0) {
        for (const start of [0, 4]) for (let k = 0; k < 3; k++) edging.lie(previousEdge + start + k, edge + start + k, edge + start + k + 1, previousEdge + start + k + 1);
      }
      previousEdge = edge;
    }
  }
  return { carriage: carriage.done(), edging: edging.done() };
}

const hash = (x: number, y: number, salt: number): number => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Value noise in [0, 1) that repeats every `period` cells. */
function tiled(x: number, y: number, period: number, salt: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const wrap = (v: number) => ((v % period) + period) % period;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(wrap(x0), wrap(y0), salt), b = hash(wrap(x0 + 1), wrap(y0), salt);
  const c = hash(wrap(x0), wrap(y0 + 1), salt), d = hash(wrap(x0 + 1), wrap(y0 + 1), salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * The mottling of the ground: a square picture of `size` texels that repeats without a seam, as
 * RGBA bytes that multiply the ground's colour. The same bytes every time; nothing is random.
 */
export function grassMottle(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let value = 0, weight = 0;
      for (let octave = 0; octave < 6; octave++) {
        const period = 2 << octave, gain = 0.62 ** octave;
        value += tiled(i / size * period, j / size * period, period, octave) * gain;
        weight += gain;
      }
      // The octaves average toward the middle; stretch them so the mottling shows from the air.
      const spread = Math.min(1, Math.max(0, (value / weight - 0.5) * 2.8 + 0.5));
      const shade = 0.56 + 0.52 * spread, warm = (tiled(i / size * 5, j / size * 5, 5, 99) - 0.5) * 0.14;
      const at = (j * size + i) * 4;
      out[at] = Math.round(Math.min(1, shade + warm) * 255);
      out[at + 1] = Math.round(Math.min(1, shade) * 255);
      out[at + 2] = Math.round(Math.min(1, shade - warm * 0.6) * 255);
      out[at + 3] = 255;
    }
  }
  return out;
}

/**
 * The grit of the ground underfoot: a square picture of `size` texels (a multiple of four) that
 * repeats without a seam and averages to mid grey, so from far away it changes nothing.
 */
export function groundGrit(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      // Three sizes of fleck: single texels, pairs and fours.
      const value = 0.5 * hash(i, j, 7) + 0.3 * hash(i >> 1, j >> 1, 8) + 0.2 * hash(i >> 2, j >> 2, 9);
      const byte = Math.round(Math.min(1, Math.max(0, (value - 0.5) * 1.7 + 0.5)) * 255), at = (j * size + i) * 4;
      out[at] = out[at + 1] = out[at + 2] = byte;
      out[at + 3] = 255;
    }
  }
  return out;
}
