/**
 * The old town around the cathedral, as data: where every kit asset stands and where each kind of paving lies.
 * Pure and deterministic (its own seeded generator), so the interactive scene, the film and the tests agree.
 *
 * World frame (the cathedral's): metres, +Y up, west front at +X, apse at -X; north is +Z, south -Z.
 * Kit frame: each house's street facade is at its local x = 0 and faces +X, party walls at z = +-width/2, depth to -X.
 * A placement's `rotation` turns local +X to the outward direction (cos r, 0, -sin r).
 */

/** Footprints of the house kit (wall width and depth, metres), from the variants' authored dimensions. */
export const HOUSES = {
  'house-timber-gable-shop': { width: 7, depth: 12, styles: ['square', 'street', 'lane'] },
  'house-timber-gable-door': { width: 6, depth: 11, styles: ['street', 'lane'] },
  'house-timber-gable-narrow': { width: 5.2, depth: 12, styles: ['street', 'lane'] },
  'house-stone-gable-shop': { width: 8, depth: 13, styles: ['square', 'street'] },
  'house-stone-gable-tall': { width: 7, depth: 12, styles: ['square', 'street', 'lane'] },
  'house-plaster-eaves-arcade': { width: 9, depth: 13, styles: ['square'] },
  'house-stone-eaves-arcade': { width: 10, depth: 13, styles: ['square'] },
  'house-plaster-eaves-shop': { width: 8, depth: 12, styles: ['square', 'street', 'lane'] },
};

/** The cathedral's footprint and the paved precinct around it (cathedral close, chevet garden and parvis). */
export const CATHEDRAL = { x0: -77.5, x1: 66.8, z0: -31.5, z1: 31.5 };
export const PRECINCT = { x0: -114, x1: 158, z0: -56, z1: 48 };
export const PARVIS = { x0: 66.8, x1: 158, z0: -56, z1: 48 };

/** Street centre lines. Each street is `width` wide; blocks fill the rectangles between them. */
// The main streets bound the precinct: its edges are the facades of the blocks beyond them.
const X_STREETS = [-436, -380, -324, -270, -216, -162, -109, -60, -6, 48, 102, 153, 206, 258, 310, 362, 414, 466];
const Z_STREETS = [-430, -376, -322, -268, -214, -160, -105, -51, 0, 43, 97, 151, 205, 259, 313, 367, 421];
const MAIN_X = new Set([-109, 153]);
const MAIN_Z = new Set([-51, 0, 43]);
const streetWidth = (main) => (main ? 10 : 8);
export const TOWN_RADIUS = 430;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const facing = (nx, nz) => Math.atan2(-nz, nx);

/**
 * Fill a facade line from `a` to `b` (points [x, z]) with houses facing `normal` ([nx, nz]). Houses abut; the
 * leftover length becomes narrow slots between them, as in an old town. Returns the placements.
 */
export function fillFrontage(a, b, normal, style, rng, { setback = 0.25 } = {}) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  // On the squares, arcades and shopfronts come round more often.
  const options = Object.entries(HOUSES).filter(([, h]) => h.styles.includes(style)).flatMap((entry) => (style === 'square' ? Array(/arcade/.test(entry[0]) ? 5 : /shop/.test(entry[0]) ? 2 : 1).fill(entry) : [entry]));
  // A few random sequences; keep the one that leaves the least unused length.
  let best = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const sequence = [];
    let used = 0;
    let previous = null;
    for (let guard = 0; guard < 200; guard++) {
      const fits = options.filter(([key, h]) => key !== previous && used + h.width <= length);
      if (!fits.length) break;
      const [key, h] = fits[Math.floor(rng() * fits.length)];
      sequence.push(key);
      used += h.width;
      previous = key;
    }
    if (!best || length - used < best.left) best = { sequence, left: length - used };
  }
  const gap = best.sequence.length > 1 ? best.left / (best.sequence.length - 1) : 0;
  const rotation = facing(normal[0], normal[1]);
  const placements = [];
  let along = best.sequence.length > 1 ? 0 : best.left / 2;
  for (const key of best.sequence) {
    const h = HOUSES[key];
    const centre = along + h.width / 2;
    const back = rng() * setback;
    placements.push({
      key,
      x: a[0] + ux * centre - normal[0] * back,
      z: a[1] + uz * centre - normal[1] * back,
      rotation: rotation + (rng() - 0.5) * 0.02,
      variant: Math.floor(rng() * 1e6),
    });
    along += h.width + gap;
  }
  return placements;
}

function overlapsPrecinct(x0, z0, x1, z1) {
  return x1 > PRECINCT.x0 + 1 && x0 < PRECINCT.x1 - 1 && z1 > PRECINCT.z0 + 1 && z0 < PRECINCT.z1 - 1;
}

/**
 * Where the grid stays as drawn: the precinct with the blocks that face it, and the axial street west of the parvis
 * that the street-level shots look down. Beyond them the bends grow to full over `RAMP` metres.
 */
const CORE = [
  { x0: PRECINCT.x0 - 14, x1: PRECINCT.x1 + 14, z0: PRECINCT.z0 - 14, z1: PRECINCT.z1 + 14 },
  { x0: PRECINCT.x1, x1: 240, z0: -30, z1: 30 },
];
const RAMP = 70;
// Bends: the field's peak shift and its wavelengths (metres), each crossing's own jitter, and the least a street turns
// at a crossing outside the core (radians).
const BEND = { amplitude: 18, wavelengths: [380, 520, 700], jitter: 3, turn: (4 * Math.PI) / 180 };
// Outside the core: minor streets' width and how far each side may step back (metres), the same for the share of minor
// streets that are lanes, and the share of cells that join a neighbour into one long block.
const STREET = { width: 7, inset: 2.5 };
const LANE = { width: 4.5, share: 0.35, inset: 1 };
const MERGE = { share: 0.22 };
// A house's depth with its setback and a margin: how far back from a facade line its neighbours must keep.
const HOUSE_DEPTH = 13.4;

/** How far the streets bend at a point: 0 in the core, rising smoothly to 1. */
export function bendWeight(x, z) {
  let distance = Infinity;
  for (const r of CORE) distance = Math.min(distance, Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)));
  const t = Math.min(distance / RAMP, 1);
  return t * t * (3 - 2 * t);
}

/** The shift of every street crossing, seeded: a smooth field of a few waves plus jitter, scaled by `bendWeight`. */
function crossings(seed) {
  const rng = mulberry32(seed * 104729 + 3);
  const waves = (count) => BEND.wavelengths.slice(0, count).map((length) => {
    const heading = rng() * Math.PI * 2;
    const k = (2 * Math.PI) / length;
    return { kx: Math.cos(heading) * k, kz: Math.sin(heading) * k, phase: rng() * Math.PI * 2 };
  });
  const sum = (list, x, z) => list.reduce((total, w, i) => total + Math.sin(w.kx * x + w.kz * z + w.phase) / (i + 1), 0) / 1.83;
  const wx = waves(3);
  const wz = waves(3);
  const points = X_STREETS.map((x) => Z_STREETS.map((z) => {
    const w = bendWeight(x, z);
    const jx = (rng() - 0.5) * 2 * BEND.jitter;
    const jz = (rng() - 0.5) * 2 * BEND.jitter;
    return [x + w * (BEND.amplitude * sum(wx, x, z) + jx), z + w * (BEND.amplitude * sum(wz, x, z) + jz)];
  }));
  // Chance alone leaves some streets straight for several blocks. Where a street would carry on within `turn` of
  // straight across a crossing outside the core, the crossing moves across it until the street bends that much.
  const lines = [
    ...X_STREETS.map((_, i) => Z_STREETS.map((__, j) => [i, j])),
    ...Z_STREETS.map((_, j) => X_STREETS.map((__, i) => [i, j])),
  ];
  for (let pass = 0; pass < 3; pass++) {
    for (const line of lines) {
      for (let k = 1; k < line.length - 1; k++) {
        const [p, q, r] = [line[k - 1], line[k], line[k + 1]].map(([i, j]) => points[i][j]);
        if (![p, q, r].every((point, n) => bendWeight(X_STREETS[line[k - 1 + n][0]], Z_STREETS[line[k - 1 + n][1]]) > 0)) continue;
        const before = Math.atan2(q[1] - p[1], q[0] - p[0]);
        const after = Math.atan2(r[1] - q[1], r[0] - q[0]);
        const turn = Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before)));
        if (turn >= BEND.turn) continue;
        // Across the chord from p to r, on the side the crossing already leans to.
        const chord = unit(sub(r, p));
        const across = [-chord[1], chord[0]];
        const lean = (q[0] - (p[0] + r[0]) / 2) * across[0] + (q[1] - (p[1] + r[1]) / 2) * across[1];
        const side = lean < 0 ? -1 : 1;
        const shift = ((BEND.turn - turn) * side) / (1 / Math.hypot(...sub(q, p)) + 1 / Math.hypot(...sub(r, q)));
        q[0] += across[0] * shift;
        q[1] += across[1] * shift;
      }
    }
  }
  // Minor streets that are lanes, chosen per street.
  const lanes = new Set();
  X_STREETS.forEach((x) => !MAIN_X.has(x) && rng() < LANE.share && lanes.add(`x:${x}`));
  Z_STREETS.forEach((z) => !MAIN_Z.has(z) && rng() < LANE.share && lanes.add(`z:${z}`));
  return { points, lanes };
}

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
};

/** Where the line through `p` along `d` meets the line through `q` along `e`. */
function meet(p, d, q, e) {
  const det = d[0] * e[1] - d[1] * e[0];
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / det;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

/**
 * A convex polygon (anticlockwise with +X right and +Z up) with each edge moved inward by its own distance (outward
 * when negative). Null when it closes up.
 */
export function insetPolygon(corners, distances) {
  const n = corners.length;
  const lines = corners.map((p, k) => {
    const d = unit(sub(corners[(k + 1) % n], p));
    const o = typeof distances === 'number' ? distances : distances[k];
    return { p: [p[0] - d[1] * o, p[1] + d[0] * o], d };
  });
  const out = lines.map((line, k) => {
    const before = lines[(k + n - 1) % n];
    return meet(before.p, before.d, line.p, line.d);
  });
  // Every edge must keep its direction, or the polygon has turned inside out.
  for (let k = 0; k < n; k++) {
    const e = sub(out[(k + 1) % n], out[k]);
    if (e[0] * lines[k].d[0] + e[1] * lines[k].d[1] <= 0.5) return null;
  }
  return out;
}

/** A point inside a quadrilateral at (u, v) across it, corners in order. */
function across(q, u, v) {
  const a = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u];
  const b = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u];
  return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v];
}

/** An axis-aligned rectangle as a polygon. */
export const rectangle = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** Whether a polygon (anticlockwise with +X right and +Z up) is convex. */
function convex(corners) {
  const n = corners.length;
  return corners.every((p, k) => {
    const a = sub(corners[(k + 1) % n], p);
    const b = sub(corners[(k + 2) % n], corners[(k + 1) % n]);
    return a[0] * b[1] - a[1] * b[0] > 0;
  });
}

/**
 * Blocks between the streets, skipping the precinct and thinning out towards a ragged town edge, and the streets
 * themselves: one segment per block side, `line` naming the grid street and `step` its place along it. Outside the
 * core some pairs of neighbouring cells make one long block, and the street between them is left out, so streets end
 * in T-junctions and blocks differ in size.
 */
export function townBlocks(seed = 7) {
  const rng = mulberry32(seed);
  const { points, lanes } = crossings(seed);
  const segments = new Map();
  const segment = (line, step, a, b, main) => {
    const id = `${line}|${step}`;
    if (!segments.has(id)) {
      const core = bendWeight(...a) === 0 || bendWeight(...b) === 0;
      const width = main ? streetWidth(true) : core ? streetWidth(false) : lanes.has(line) ? LANE.width : STREET.width;
      segments.set(id, { line, step, a, b, width, core, lane: width === LANE.width });
    }
    return segments.get(id);
  };
  // The grid's cells: which hold a block, and which face the core.
  const cells = new Map();
  for (let i = 0; i < X_STREETS.length - 1; i++) {
    for (let j = 0; j < Z_STREETS.length - 1; j++) {
      const roll = rng();
      const x0 = X_STREETS[i];
      const x1 = X_STREETS[i + 1];
      const z0 = Z_STREETS[j];
      const z1 = Z_STREETS[j + 1];
      const bx0 = x0 + streetWidth(MAIN_X.has(x0)) / 2;
      const bx1 = x1 - streetWidth(MAIN_X.has(x1)) / 2;
      const bz0 = z0 + streetWidth(MAIN_Z.has(z0)) / 2;
      const bz1 = z1 - streetWidth(MAIN_Z.has(z1)) / 2;
      if (overlapsPrecinct(bx0, bz0, bx1, bz1)) continue;
      const r = Math.hypot((x0 + x1) / 2 - 20, (z0 + z1) / 2);
      if (r > TOWN_RADIUS) continue;
      if (r > TOWN_RADIUS - 110 && roll < (r - (TOWN_RADIUS - 110)) / 140) continue;
      // Blocks that face the precinct or the axial street hold the grandest houses.
      const core = bx1 >= PRECINCT.x0 - 12 && bx0 <= PRECINCT.x1 + 12 && bz1 >= PRECINCT.z0 - 12 && bz0 <= PRECINCT.z1 + 12;
      cells.set(`${i},${j}`, { i, j, core, merged: false });
    }
  }
  // A cell's outline and sides, anticlockwise from its (x0, z0) corner; `span` cells along x or z.
  const P = (i, j) => points[i][j];
  const X = (i) => [`x:${X_STREETS[i]}`, MAIN_X.has(X_STREETS[i])];
  const Z = (j) => [`z:${Z_STREETS[j]}`, MAIN_Z.has(Z_STREETS[j])];
  const outline = (i, j, alongX, alongZ) => {
    const [x1, z1] = [i + alongX, j + alongZ];
    const ring = [];
    const sides = [];
    for (let k = i; k < x1; k++) ring.push([P(k, j), segment(Z(j)[0], k, P(k, j), P(k + 1, j), Z(j)[1])]);
    for (let k = j; k < z1; k++) ring.push([P(x1, k), segment(X(x1)[0], k, P(x1, k), P(x1, k + 1), X(x1)[1])]);
    for (let k = x1; k > i; k--) ring.push([P(k, z1), segment(Z(z1)[0], k - 1, P(k - 1, z1), P(k, z1), Z(z1)[1])]);
    for (let k = z1; k > j; k--) ring.push([P(i, k), segment(X(i)[0], k - 1, P(i, k - 1), P(i, k), X(i)[1])]);
    for (const [, side] of ring) sides.push(side);
    return { cell: ring.map(([p]) => p), sides };
  };
  const blocks = [];
  for (const c of cells.values()) {
    if (c.merged) continue;
    c.merged = true;
    let span = [1, 1];
    // Outside the core, a cell may join the next one along x or z into one long block, if the result stays convex.
    if (!c.core && rng() < MERGE.share) {
      const [di, dj] = rng() < 0.5 ? [1, 0] : [0, 1];
      const next = cells.get(`${c.i + di},${c.j + dj}`);
      if (next && !next.core && !next.merged) {
        const ring = [P(c.i, c.j), ...(di ? [P(c.i + 1, c.j)] : []), P(c.i + 1 + di, c.j), ...(dj ? [P(c.i + 1, c.j + 1)] : []), P(c.i + 1 + di, c.j + 1 + dj), ...(di ? [P(c.i + 1, c.j + 1)] : []), P(c.i, c.j + 1 + dj), ...(dj ? [P(c.i, c.j + 1)] : [])];
        if (convex(ring)) {
          next.merged = true;
          span = [1 + di, 1 + dj];
        }
      }
    }
    const { cell, sides } = outline(c.i, c.j, ...span);
    // Outside the core each side steps back a little, so streets narrow and widen as in an old town; lanes less.
    const insets = sides.map((s) => (c.core ? 0 : rng() * (s.lane ? LANE.inset : STREET.inset)));
    const corners = insetPolygon(cell, sides.map((s, k) => s.width / 2 + insets[k]));
    if (!corners) continue;
    // The long sides run to the corners: a merged block's, or a single cell's longer pair.
    const length = (k) => Math.hypot(...sub(corners[(k + 1) % corners.length], corners[k]));
    const alongZ = span[0] === span[1] ? length(0) + length(2) >= length(1) + length(3) : span[0] > 1;
    const through = sides.map((s) => s.line.startsWith(alongZ ? 'z:' : 'x:'));
    const xs = corners.map((p) => p[0]);
    const zs = corners.map((p) => p[1]);
    blocks.push({
      // A block too thin for two rows of houses back to back is a garden.
      corners, cell, sides, through, core: c.core, garden: !c.core && (rng() < 0.07 || !insetPolygon(corners, HOUSE_DEPTH)),
      x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs),
    });
  }
  return { blocks, streets: [...segments.values()] };
}

/** The angle inside a convex polygon at corner `k`, in radians. */
function cornerAngle(corners, k) {
  const n = corners.length;
  const a = unit(sub(corners[(k + n - 1) % n], corners[k]));
  const b = unit(sub(corners[(k + 1) % n], corners[k]));
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
}

/**
 * How far from a corner of angle `angle` a row of houses starts. One row runs to the corner (`through`), moved along
 * only where the corner is sharp, so its first house stays inside the block. The row on the other side starts clear of
 * the first row's houses.
 */
export function cornerSetback(angle, through, depth = HOUSE_DEPTH) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  if (through) return Math.max(0, (depth * cos) / sin);
  return cos >= 0 ? (depth * (1 + cos)) / sin : depth * Math.min(1 / sin, -sin / cos);
}

/**
 * Houses around a block. The block's long sides run to the corners and the short sides fit between them (`through`).
 * Where two sides of a merged block meet nearly in line, the second gives way to the first.
 */
function blockHouses(block, rng) {
  const { corners, through } = block;
  const n = corners.length;
  const length = (k) => Math.hypot(...sub(corners[(k + 1) % n], corners[k]));
  const style = (k) => {
    if (!block.core) return block.sides[k].lane || rng() < 0.6 ? 'lane' : 'street';
    // A side faces the precinct when its middle lies on the precinct's edge and it looks into the precinct.
    const [mx, mz] = [(corners[k][0] + corners[(k + 1) % n][0]) / 2, (corners[k][1] + corners[(k + 1) % n][1]) / 2];
    const onEdge = Math.min(Math.abs(mz - PRECINCT.z1), Math.abs(mz - PRECINCT.z0), Math.abs(mx - PRECINCT.x1), Math.abs(mx - PRECINCT.x0)) < 1 && mx > PRECINCT.x0 - 1 && mx < PRECINCT.x1 + 1 && mz > PRECINCT.z0 - 1 && mz < PRECINCT.z1 + 1;
    return onEdge ? 'square' : 'street';
  };
  // At corner v, the side ending there (v - 1) and the side starting there (v): which one runs through.
  const runs = (v) => {
    const before = through[(v + n - 1) % n];
    const after = through[v];
    return before === after ? 'before' : before ? 'before' : 'after';
  };
  const houses = [];
  for (let k = 0; k < n; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % n];
    const d = unit(sub(b, a));
    const start = cornerSetback(cornerAngle(corners, k), runs(k) === 'after');
    const end = cornerSetback(cornerAngle(corners, (k + 1) % n), runs((k + 1) % n) === 'before');
    if (length(k) - start - end < 5) continue;
    // Outward: to the right of an anticlockwise side.
    const normal = [d[1], -d[0]];
    houses.push(...fillFrontage([a[0] + d[0] * start, a[1] + d[1] * start], [b[0] - d[0] * end, b[1] - d[1] * end], normal, style(k), rng));
  }
  return houses;
}

/**
 * The whole town. `props` are kit placements other than houses; `paving` lists rectangles per material
 * ([x0, z0, x1, z1]); `lights` are lantern positions for night lighting.
 */
export function townLayout({ seed = 7 } = {}) {
  const rng = mulberry32(seed * 7919 + 1);
  const { blocks, streets } = townBlocks(seed);
  const houses = [];
  const props = [];
  const courtyards = [];
  for (const block of blocks) {
    if (block.garden) {
      // A walled garden: trees and grass instead of houses.
      courtyards.push(block.corners);
      for (let k = 0; k < 6; k++) {
        const key = rng() < 0.5 ? 'tree-a' : 'tree-b';
        const [x, z] = across(block.corners, 0.18 + rng() * 0.64, 0.18 + rng() * 0.64);
        props.push({ key, x, z, rotation: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.3 });
      }
      continue;
    }
    houses.push(...blockHouses(block, rng));
    // The yard behind the houses.
    const inner = insetPolygon(block.corners, 12.5);
    if (inner) {
      courtyards.push(inner);
      const trees = rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
      for (let k = 0; k < trees; k++) {
        const key = rng() < 0.5 ? 'tree-a' : 'tree-b';
        const [x, z] = across(inner, 0.25 + rng() * 0.5, 0.25 + rng() * 0.5);
        props.push({ key, x, z, rotation: rng() * Math.PI * 2, scale: 0.75 + rng() * 0.3 });
      }
    }
  }

  const lights = [];
  const lantern = (x, z, rotation = 0) => {
    props.push({ key: 'lantern', x, z, rotation });
    lights.push([x, 4.0, z]);
  };
  const P = PARVIS;
  // Parvis: the fountain south of the axis, café terraces in front of the sunny north row, a small market
  // in the south-west corner, lanterns around the edge and bollards closing the axial street to carts.
  props.push({ key: 'fountain', x: 117, z: -22, rotation: 0 });
  for (const [dx, dz, r] of [[0, 6.2, 0], [6.2, 0, 0], [0, -6.2, 0], [-6.2, 0, 0]]) {
    props.push({ key: 'bench', x: 117 + dx, z: -22 + dz, rotation: facing(-dx / 6.2, -dz / 6.2) + r * 0 });
  }
  for (let x = 74, k = 0; x < P.x1 - 6; x += 7.5, k++) {
    props.push({ key: k % 4 < 2 ? 'cafe-red' : 'cafe-green', x: x + (rng() - 0.5) * 1.2, z: P.z1 - 6 - rng() * 3.5, rotation: rng() * Math.PI * 2 });
  }
  const stalls = [[128, -42, 0], [134, -42, 0], [140, -42, 0], [146, -42, 0], [131, -33, Math.PI], [137, -33, Math.PI], [143, -33, Math.PI]];
  stalls.forEach(([x, z, flip], k) => props.push({ key: k % 3 === 1 ? 'stall-green' : 'stall-red', x, z, rotation: facing(0, flip ? -1 : 1) }));
  for (let x = 75; x <= P.x1 - 4; x += 16) {
    lantern(x, P.z1 - 2.6);
    lantern(x, P.z0 + 2.6);
  }
  for (let z = P.z0 + 10; z <= P.z1 - 8; z += 16) if (Math.abs(z) > 8) lantern(P.x1 - 2.6, z);
  for (let z = -4; z <= 4; z += 2) props.push({ key: 'bollard', x: P.x1 + 1.5, z, rotation: 0 });
  // Axial street west of the parvis: lanterns on both sides, following it where it bends.
  for (let x = P.x1 + 14; x < TOWN_RADIUS; x += 18) {
    lantern(...alongStreet(streets, 'z:0', x, 4.2));
    lantern(...alongStreet(streets, 'z:0', x + 9, -4.2));
  }
  // Cathedral close: lanterns along the north houses; a double row of plane trees and benches in the south close.
  for (let x = -100; x < P.x0 - 4; x += 15) lantern(x, PRECINCT.z1 - 2.4);
  for (let x = -96; x < P.x0 - 8; x += 12) {
    props.push({ key: (x / 12) % 2 ? 'tree-a' : 'tree-b', x, z: -45, rotation: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.2 });
    if ((x + 96) % 24 === 12) props.push({ key: 'bench', x, z: -39.5, rotation: facing(0, -1) });
  }
  // Chevet garden behind the apse.
  for (const [x, z] of [[-101, -36], [-101, -18], [-102, 0], [-101, 18], [-101, 36], [-89, -46], [-89, 42]]) {
    props.push({ key: z % 2 ? 'tree-a' : 'tree-b', x, z, rotation: rng() * Math.PI * 2, scale: 0.95 + rng() * 0.2 });
  }
  for (let z = -40; z <= 40; z += 20) lantern(PRECINCT.x0 + 2.6, z);

  // Paving as convex polygons. Streets: every block's cell to the middle of its streets and a little beyond, so the
  // paving ends with the town and fields begin.
  const paving = {
    cobbles: [rectangle(PRECINCT.x0 - 6, PRECINCT.z0 - 6, PRECINCT.x1 + 6, PRECINCT.z1 + 6), ...blocks.map((b) => insetPolygon(b.cell, -6))],
    flags: [rectangle(PRECINCT.x0, PRECINCT.z0, PRECINCT.x1, PRECINCT.z1)],
    soil: courtyards,
    granite: precinctBands().map((band) => rectangle(...band)),
  };
  return { houses, props, lights, paving, blocks, streets };
}

/** A point `side` metres to the left of a street's centre line where it crosses `x` (straight on past its ends). */
function alongStreet(streets, line, x, side) {
  const s = streets.find((street) => street.line === line && Math.min(street.a[0], street.b[0]) <= x && x <= Math.max(street.a[0], street.b[0]));
  if (!s) return [x, side];
  const t = (x - s.a[0]) / (s.b[0] - s.a[0]);
  const d = unit(sub(s.b, s.a));
  return [s.a[0] + (s.b[0] - s.a[0]) * t - d[1] * side, s.a[1] + (s.b[1] - s.a[1]) * t + d[0] * side];
}

/** Granite bands: a kerb round the precinct and a grid across the parvis that leads the eye to the portals. */
function precinctBands() {
  const w = 0.5;
  const P = PRECINCT;
  const bands = [
    [P.x0, P.z0, P.x1, P.z0 + w], [P.x0, P.z1 - w, P.x1, P.z1],
    [P.x0, P.z0, P.x0 + w, P.z1], [P.x1 - w, P.z0, P.x1, P.z1],
  ];
  for (let x = PARVIS.x0 + 9.6; x < PARVIS.x1 - 2; x += 14.4) bands.push([x - w / 2, PARVIS.z0, x + w / 2, PARVIS.z1]);
  for (let z = -43.2; z < PARVIS.z1 - 2; z += 14.4) bands.push([PARVIS.x0, z - w / 2, PARVIS.x1, z + w / 2]);
  return bands;
}
