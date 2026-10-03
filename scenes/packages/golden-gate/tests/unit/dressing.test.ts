// SPDX-License-Identifier: MIT
// Fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md): the approaches' dressing from data/layout.json `dressing`.
// Item 1, the toll plaza: the paved fan, the islands clear of the through lanes' traffic, the canopy over all six
// lanes, the median ending before the plaza, and the terrain bed following the widened road. Item 2, Vista Point:
// the lot less its planted island triangulated whole, the stall rows inside it with aisles between them, the
// parked cars in their stalls, the terrain pads under the lot and its throat, and the edge barrier's opening.
import { describe, expect, test } from 'bun:test';
import { LAYOUT } from '../../scripts/authored-layout';
import { approachArrays } from '../../src/world/approach-mesh';
import { approachCorridorPlans, bedDepth, corridorHeight } from '../../src/world/corridor';
import { barrierGaps, earClip, parkedVehicles, plazaWidening, polygonDistance, sideWidening, vistaLot, vistaRows } from '../../src/world/dressing';
import { PALETTE } from '../../src/traffic/config';
import { VEHICLE_TYPES } from '../../src/traffic/vehicle-models';
import { frame } from '../../src/world/mesh-arrays';
import { buildApproach } from '../../src/world/route';

const { dressing, approaches, bridge, lanes } = LAYOUT, cs = approaches.crossSection, P = cs.pavedHalfWidth, plaza = dressing.plaza;
const south = buildApproach('south', approaches.south, bridge.roadEndZ);
/** Half widths of the widest vehicles each lane carries (m): cars about 1.0, the box truck and transit bus about 1.3. */
const HALF_WIDTH: Record<string, number> = { sedan: 1, suv: 1, hatchback: 1, pickup: 1, 'box-truck': 1.3, 'transit-bus': 1.3 };
/** Lane offset x of a mesh vertex on the south approach (its own N points the other way: x = sign d). */
function laneX(position: Float32Array, i: number, s: number): { x: number; along: number } {
  const f = frame(south, s), dx = position[i * 3]! - f.x, dz = position[i * 3 + 2]! - f.z;
  return { x: south.sign * (dx * f.nx + dz * f.nz), along: dx * f.tx + dz * f.tz };
}

describe('toll plaza', () => {
  test('the paved edge fans out to pavedTo and back, smoothly and only between fan[0] and fan[3]', () => {
    const [a, b, c, d] = plaza.fan, full = plaza.pavedTo - P;
    expect(plazaWidening(plaza, P, a - 1)).toBe(0);
    expect(plazaWidening(plaza, P, d + 1)).toBe(0);
    expect(plazaWidening(plaza, P, (b + c) / 2)).toBeCloseTo(full, 9);
    let last = 0;
    for (let s = a; s <= b; s += .5) { const w = plazaWidening(plaza, P, s); expect(w).toBeGreaterThanOrEqual(last - 1e-12); last = w; }
    for (let s = c; s <= d; s += .5) { const w = plazaWidening(plaza, P, s); expect(w).toBeLessThanOrEqual(last + 1e-12); last = w; }
    // Only the plaza's side of its own approach widens.
    const mid = (b + c) / 2;
    expect(sideWidening(south, dressing, P, mid, south.sign * plaza.side)).toBeCloseTo(full, 9);
    expect(sideWidening(south, dressing, P, mid, -south.sign * plaza.side)).toBe(0);
    expect(sideWidening(buildApproach('north', approaches.north, bridge.roadEndZ), dressing, P, mid, 1)).toBe(0);
  });

  test('toll islands keep clear of every through lane\'s widest vehicle, and none stands between the lanes', () => {
    const { islands } = plaza;
    expect(islands.halfWidth.length).toBe(islands.x.length);
    islands.x.forEach((x, k) => {
      const hw = islands.halfWidth[k]!;
      for (const lane of lanes) {
        const vehicle = Math.max(...lane.classes.map(c => HALF_WIDTH[c] ?? Infinity));
        expect(Math.abs(x - lane.x) - hw - vehicle).toBeGreaterThanOrEqual(.3);
      }
      // Inside the paved width (the extra width on the plaza's side).
      expect(Math.abs(x) + hw).toBeLessThanOrEqual(x * plaza.side > 0 ? plaza.pavedTo : P);
    });
  });

  test('the canopy spans all six lanes, its columns stand on the islands under it, and it sits within the fan', () => {
    const lo = Math.min(...plaza.canopy.x), hi = Math.max(...plaza.canopy.x), edge = Math.max(...lanes.map(l => Math.abs(l.x))) + 3.1 / 2;
    expect(lo).toBeLessThan(-edge); expect(hi).toBeGreaterThan(edge);
    for (const s of plaza.columns.s) { expect(s).toBeGreaterThan(plaza.canopy.s[0]); expect(s).toBeLessThan(plaza.canopy.s[1]); }
    for (const x of plaza.islands.x) { expect(x).toBeGreaterThan(lo); expect(x).toBeLessThan(hi); }
    expect(plaza.fan[1]).toBeLessThanOrEqual(plaza.islands.s[0]); expect(plaza.fan[2]).toBeGreaterThanOrEqual(plaza.islands.s[1]);
    // The median stops just before the centre island's nose and resumes just after its tail.
    const [g0, g1] = plaza.medianGap;
    expect(g0).toBeLessThan(plaza.islands.s[0]); expect(plaza.islands.s[0] - g0).toBeLessThanOrEqual(3);
    expect(g1).toBeGreaterThan(plaza.islands.s[1]); expect(g1 - plaza.islands.s[1]).toBeLessThanOrEqual(3);
    expect(plaza.islands.x).toContain(0);
  });

  test('the south approach mesh: road out to pavedTo at the plaza, the canopy in both representations, the median across the plaza only interrupted', () => {
    const near = approachArrays(south, cs, bridge.roadEndZ, bridge.medianHalfWidth, 'near', dressing);
    const far = approachArrays(south, cs, bridge.roadEndZ, bridge.medianHalfWidth, 'far', dressing);
    const s = (plaza.canopy.s[0] + plaza.canopy.s[1]) / 2;
    let widest = 0;
    for (let i = 0; i < near.road.position.length / 3; i++) { const p = laneX(near.road.position, i, s); if (Math.abs(p.along) < 3) widest = Math.max(widest, p.x * plaza.side); }
    expect(widest).toBeCloseTo(plaza.pavedTo, 3);
    expect(near.paint).not.toBeNull(); expect(far.paint).not.toBeNull();
    // Median: the highest concrete within 0.5 m of the centreline (islands excluded by height) at stations
    // before, inside and after the gap: full height away from it, nothing inside it.
    const medianTop = (t: number) => {
      const f = frame(south, t); let top = -Infinity;
      for (let i = 0; i < near.concrete.position.length / 3; i++) {
        const dx = near.concrete.position[i * 3]! - f.x, dz = near.concrete.position[i * 3 + 2]! - f.z, along = dx * f.tx + dz * f.tz;
        if (Math.abs(along) < 1.5 && Math.abs(dx * f.nx + dz * f.nz) < .5) top = Math.max(top, near.concrete.position[i * 3 + 1]! - frame(south, t + along).y);
      }
      return top;
    };
    const [g0, g1] = plaza.medianGap, ramp = cs.joint.taper;
    expect(medianTop(g0 - ramp - 5)).toBeCloseTo(cs.medianHeight, 1);
    expect(medianTop(g1 + ramp + 5)).toBeCloseTo(cs.medianHeight, 1);
    expect(medianTop(approaches.south.ends.dissolve[0] - 30)).toBeCloseTo(cs.medianHeight, 1);
    // Inside the gap only the centre island stands there (its height), never the median's.
    for (let t = g0 + 1; t < g1; t += 2) expect(medianTop(t)).toBeLessThanOrEqual(plaza.islands.height + .01);
  });

  test('the terrain bed follows the widened road: flat under the plaza\'s extra width, the usual cut beyond the fan', () => {
    const [plan] = approachCorridorPlans(approaches, bridge.roadEndZ, dressing), s = (plaza.fan[1] + plaza.fan[2]) / 2, d = south.sign * plaza.side * (plaza.pavedTo - 2);
    const road = frame(south, s).y, hill = road + 8;
    expect(plan!.approach.name).toBe('south');
    expect(corridorHeight(plan!, s, d, hill)).toBeCloseTo(road - bedDepth(plan!, s), 6);
    // The other side and the same offset outside the fan stay on the usual envelope (a cut slope above the bed).
    expect(corridorHeight(plan!, s, -d, hill)).toBeGreaterThan(road);
    expect(corridorHeight(plan!, plaza.fan[0] - 30, d, frame(south, plaza.fan[0] - 30).y + 8)).toBeGreaterThan(frame(south, plaza.fan[0] - 30).y);
  });
});

describe('Vista Point', () => {
  const vista = dressing.vista, north = buildApproach('north', approaches.north, bridge.roadEndZ), L = vista.level;
  const world = (s: number, x: number): [number, number] => { const f = frame(north, s), d = north.sign * x; return [f.x + f.nx * d, f.z + f.nz * d]; };
  /** An [s, x] outline in the scene's plan, its edges split every 4 m or less as the mesh splits them. */
  const scenePlan = (poly: [number, number][]) => poly.flatMap((p, k) => {
    const q = poly[(k + 1) % poly.length]!, n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4 - 1e-9));
    return Array.from({ length: n }, (_, i) => world(p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n));
  });
  const area = (p: readonly [number, number][]) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j]![0] * p[i]![1] - p[i]![0] * p[j]![1]; return s / 2; };
  const outline = scenePlan(vista.outline), island = scenePlan(vista.planter);
  /** Metres inside the lot's outline, and outside the planted island. */
  const inLot = (x: number, z: number) => -polygonDistance(outline, x, z), outIsland = (x: number, z: number) => polygonDistance(island, x, z);

  test('the lot is its outline less the planted island, triangulated whole', () => {
    const lot = vistaLot(north, vista), tris = earClip(lot);
    expect(tris.length).toBe((lot.length - 2) * 3);
    let sum = 0;
    for (let i = 0; i < tris.length; i += 3) sum += Math.abs(area([lot[tris[i]!]!, lot[tris[i + 1]!]!, lot[tris[i + 2]!]!]));
    const expected = Math.abs(area(outline)) - Math.abs(area(island));
    expect(Math.abs(sum - expected)).toBeLessThan(expected * 1e-9);
  });

  test('stall rows lie inside the lot and outside the island, with an aisle between facing rows', () => {
    const rows = vistaRows(north, vista), { depth } = vista.stalls;
    const far = (r: typeof rows[number]) => r.lines.map(l => [l.p[0] + l.n[0] * depth, l.p[2] + l.n[1] * depth] as [number, number]);
    rows.forEach((r, k) => {
      expect(r.stalls.length).toBeGreaterThan(0);
      for (const [x, z] of far(r)) { expect(inLot(x, z)).toBeGreaterThan(vista.kerb.width); expect(outIsland(x, z)).toBeGreaterThan(vista.kerb.width); }
      for (const { p } of r.stalls) { expect(inLot(p[0], p[2])).toBeGreaterThan(depth / 2); expect(outIsland(p[0], p[2])).toBeGreaterThan(depth / 2); expect(p[1]).toBe(L); }
      // Neighbouring stalls wider apart than a car (2 m) even where the kerb bends toward them, their lines never
      // crossing; every other row's stall ends an aisle (5 m) away.
      const ends = far(r);
      for (let i = 1; i < r.stalls.length; i++) expect(Math.hypot(r.stalls[i]!.p[0] - r.stalls[i - 1]!.p[0], r.stalls[i]!.p[2] - r.stalls[i - 1]!.p[2])).toBeGreaterThan(2.1);
      for (let i = 1; i < ends.length; i++) expect(Math.hypot(ends[i]![0] - ends[i - 1]![0], ends[i]![1] - ends[i - 1]![1])).toBeGreaterThan(1);
      rows.forEach((o, m) => { if (m !== k) for (const [x, z] of far(r)) for (const [x2, z2] of far(o)) expect(Math.hypot(x - x2, z - z2)).toBeGreaterThan(5); });
    });
  });

  test('parked cars: vehicles and paints of the traffic set, one per stall, nose to the kerb', () => {
    const cars = parkedVehicles(approaches, bridge.roadEndZ, dressing), rows = vistaRows(north, vista);
    expect(cars.length).toBe(vista.cars.length);
    expect(new Set(vista.cars.map(c => c.row + '/' + c.stall)).size).toBe(vista.cars.length);
    cars.forEach((car, k) => {
      const spec = vista.cars[k]!, stall = rows[spec.row]!.stalls[spec.stall]!;
      expect(VEHICLE_TYPES as readonly string[]).toContain(car.type);
      expect(PALETTE.map(p => p.name)).toContain(car.paint);
      expect([car.x, car.y, car.z]).toEqual(stall.p);
      // Forward (cos yaw, -sin yaw) is -n, toward the kerb.
      expect(-Math.cos(car.yaw) * stall.n[0] + Math.sin(car.yaw) * stall.n[1]).toBeCloseTo(1, 9);
    });
  });

  test('terrain pads: a pavement depth under the lot and the throat, the natural terrain beyond their fade', () => {
    const [, plan] = approachCorridorPlans(approaches, bridge.roadEndZ, dressing), hill = L + 10;
    expect(plan!.approach.name).toBe('north');
    const [lot, throat] = plan!.pads;
    let inside = 0, beyond = 0;
    for (const pad of [lot!, throat!]) for (let s = pad.range[0]; s <= pad.range[1]; s += 1.5) for (let d = pad.range[2]; d <= pad.range[3]; d += 1.5) {
      const f = frame(north, s), x = f.x + f.nx * d, z = f.z + f.nz * d, y = corridorHeight(plan!, s, d, hill);
      const dl = polygonDistance(lot!.outline, x, z), dt = polygonDistance(throat!.outline, x, z);
      if (pad === lot && dl <= 0) { inside++; expect(y).toBeLessThanOrEqual(L - cs.pavement + 1e-9); }
      if (pad === throat && dt <= 0) { inside++; expect(y).toBeCloseTo(throat!.surface(s, d) - cs.pavement, 9); }
      if (dl >= lot!.hold + lot!.blend && dt >= throat!.hold + throat!.blend && Math.abs(d) > cs.envelope.reach[1]) { beyond++; expect(y).toBe(hill); }
    }
    expect(inside).toBeGreaterThan(1000); expect(beyond).toBeGreaterThan(1000);
    // The throat rises from the road's paved edge to the lot.
    const [s0, x0] = vista.outline[vista.throat.edge]!, mid = s0 + 6, edge = north.sign * Math.sign(x0) * P;
    expect(throat!.surface(mid, edge)).toBeCloseTo(frame(north, mid).y, 9);
    expect(throat!.surface(mid, north.sign * x0)).toBeCloseTo(L, 9);
  });

  test('the north approach mesh opens its edge barrier for the throat and closes it either side', () => {
    const near = approachArrays(north, cs, bridge.roadEndZ, bridge.medianHalfWidth, 'near', dressing), [gap] = barrierGaps(north, dressing);
    expect(gap!.side).toBe(Math.sign(north.sign * vista.outline[vista.throat.edge]![1]));
    /** Concrete vertices higher than half the barrier over its footprint on the lot's side, within 1.5 m of station t. */
    const barrierAt = (t: number) => {
      const f = frame(north, t); let n = 0;
      for (let i = 0; i < near.concrete.position.length / 3; i++) {
        const dx = near.concrete.position[i * 3]! - f.x, dz = near.concrete.position[i * 3 + 2]! - f.z, along = dx * f.tx + dz * f.tz, d = (dx * f.nx + dz * f.nz) * gap!.side;
        if (Math.abs(along) < 1.5 && d > cs.barrier[0] - .01 && d < cs.barrier[1] + .01 && near.concrete.position[i * 3 + 1]! > frame(north, t + along).y + cs.barrier[2] / 2) n++;
      }
      return n;
    };
    expect(barrierAt(gap!.s[0] - 3)).toBeGreaterThan(0);
    expect(barrierAt(gap!.s[1] + 3)).toBeGreaterThan(0);
    for (let t = gap!.s[0] + 2; t <= gap!.s[1] - 2 + 1e-9; t += 2) expect(barrierAt(t)).toBe(0);
    // The lot is near only: the far road carries no vertex at the lot's level inside its outline.
    const far = approachArrays(north, cs, bridge.roadEndZ, bridge.medianHalfWidth, 'far', dressing), onLot = (a: Float32Array) => {
      let n = 0; for (let i = 0; i < a.length / 3; i++) if (Math.abs(a[i * 3 + 1]! - L) < 1e-3 && inLot(a[i * 3]!, a[i * 3 + 2]!) > .5) n++; return n;
    };
    expect(onLot(near.road.position)).toBeGreaterThan(100);
    expect(onLot(far.road.position)).toBe(0);
  });
});
