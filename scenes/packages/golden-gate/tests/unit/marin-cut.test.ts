// SPDX-License-Identifier: MIT
// Fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md) item 3, the Marin climb: the north approach's benched cut from
// data/layout.json approaches.north.cuts. The profile (bed, toe wall, faces and level benches); the corridor
// following it on the cut's side (the natural terrain standing where lower, the envelope's fill below the bed), the
// envelope unchanged on the other side and outside the cut's stations; the clip grid's columns at the profile's
// edges; the scrub weight only where the cut lowers the terrain; and the toe wall in the near mesh only.
import { describe, expect, test } from 'bun:test';
import { LAYOUT } from '../../src/data';
import { horizontalProject } from '../../src/world/alignment';
import { approachArrays } from '../../src/world/approach-mesh';
import { approachCorridorPlans, applyCorridors, bedDepth, corridorHeight, cutProfile, cutWeight } from '../../src/world/corridor';
import { frame } from '../../src/world/mesh-arrays';
import { buildApproach } from '../../src/world/route';

const { approaches, bridge, dressing } = LAYOUT, cs = approaches.crossSection, data = approaches.north.cuts![0]!;
const north = buildApproach('north', approaches.north, bridge.roadEndZ), plan = approachCorridorPlans(approaches, bridge.roadEndZ, dressing)[1]!, cut = plan.cuts[0]!;
/** A station where the cut holds fully (inside its fades and short of the road's end). */
const FULL = 960;

describe('Marin climb', () => {
  test('one cut, on the southbound lanes\' side of the north approach, its wall at the bed\'s edge and its edges ascending', () => {
    expect(plan.approach.name).toBe('north');
    expect(plan.cuts.length).toBe(1);
    expect(cut.side).toBe(north.sign * data.side);
    expect(cut.wall[0]).toBeGreaterThanOrEqual(plan.bed - 1e-9);
    for (let k = 1; k < cut.edges.length; k++) expect(cut.edges[k]!).toBeGreaterThan(cut.edges[k - 1]!);
    expect(cutWeight(cut, FULL)).toBe(1);
    expect(FULL).toBeLessThan(north.length);
  });

  test('the profile: the bed to the wall, its top, faces rising `face` m per m and level benches after every bench[1] m of rise', () => {
    const road = 100, bed = road - cs.pavement, [front, back] = cut.wall, top = road + cut.height, [width, rise] = cut.bench, run = rise / cut.face;
    expect(cutProfile(cut, 0, bed, road)).toBe(bed);
    expect(cutProfile(cut, front, bed, road)).toBe(bed);
    expect(cutProfile(cut, back, bed, road)).toBeCloseTo(top, 9);
    for (let k = 0; k < 3; k++) {
      const foot = back + k * (run + width);
      expect(cutProfile(cut, foot + run / 2, bed, road)).toBeCloseTo(top + k * rise + rise / 2, 9);
      expect(cutProfile(cut, foot + run, bed, road)).toBeCloseTo(top + (k + 1) * rise, 9);
      expect(cutProfile(cut, foot + run + width / 2, bed, road)).toBeCloseTo(top + (k + 1) * rise, 9);
    }
    // Continuous, never falling outward.
    let last = cutProfile(cut, 0, bed, road);
    for (let ad = .05; ad <= cut.reach[1]; ad += .05) { const y = cutProfile(cut, ad, bed, road); expect(y).toBeGreaterThanOrEqual(last - 1e-9); expect(y - last).toBeLessThan(.2); last = y; }
  });

  test('the corridor follows the profile where the terrain stands above it, the natural terrain where lower, the envelope elsewhere', () => {
    const road = frame(north, FULL).y, bed = road - bedDepth(plan, FULL), side = cut.side;
    for (let ad = cut.wall[0]; ad <= cut.reach[0]; ad += .5) {
      const profile = cutProfile(cut, ad, bed, road);
      expect(corridorHeight(plan, FULL, side * ad, road + 100)).toBeCloseTo(profile, 9);
      if (profile - 1 > bed) expect(corridorHeight(plan, FULL, side * ad, profile - 1)).toBeCloseTo(profile - 1, 9);
    }
    // Below the bed: the envelope's fill.
    const out = 20 - plan.bed;
    expect(corridorHeight(plan, FULL, side * 20, bed - 50)).toBeCloseTo(bed - cs.envelope.fill * out, 9);
    // Beyond the cut's reach, the natural terrain.
    expect(corridorHeight(plan, FULL, side * (cut.reach[1] + .5), road + 100)).toBe(road + 100);
    // The other side: the envelope's own cut slope.
    expect(corridorHeight(plan, FULL, -side * 20, road + 100)).toBeCloseTo(bed + cs.envelope.cut * out, 9);
    // Before the cut's stations: the envelope's cut slope on its side too.
    const s = cut.s[0] - 5, r = frame(north, s).y - bedDepth(plan, s);
    expect(corridorHeight(plan, s, side * 20, frame(north, s).y + 100)).toBeCloseTo(r + cs.envelope.cut * out, 9);
    // Monotonic in the natural height (the skirts rely on it).
    for (const ad of [14, 20, 30, 45, 58]) for (let h = road - 20; h < road + 60; h += 1) expect(corridorHeight(plan, FULL, side * ad, h + 1)).toBeGreaterThanOrEqual(corridorHeight(plan, FULL, side * ad, h) - 1e-9);
  });

  test('the clip grid has a column at every edge of the profile inside the cut\'s rows, lying on other columns outside them', () => {
    const nc = plan.cols.length;
    const dAt = (i: number, j: number) => { const f = frame(north, plan.rows[i]!), k = (i * nc + j) * 2; return (plan.corners[k]! - f.x) * f.nx + (plan.corners[k + 1]! - f.z) * f.nz; };
    const inside = plan.rows.findIndex(s => s > cut.s[0] + 1 && s < cut.s[1] - 1), outside = plan.rows.findIndex(s => s > cut.s[1] + 1);
    expect(inside).toBeGreaterThan(0); expect(outside).toBeGreaterThan(inside);
    const edgeCols = cut.edges.map(e => plan.cols.findIndex(c => Math.abs(c - cut.side * e) < 1e-9));
    for (const [k, j] of edgeCols.entries()) { expect(j).toBeGreaterThanOrEqual(0); expect(dAt(inside, j)).toBeCloseTo(cut.side * cut.edges[k]!, 6); }
    // Outside the cut's rows each column added for it lies on a column that is not its own.
    const own = new Set(edgeCols), others = [...Array(nc).keys()].filter(j => !own.has(j) || Math.abs(plan.cols[j]! - cut.side * plan.bed) < 1e-9);
    for (const j of edgeCols) expect(others.some(o => Math.abs(dAt(outside, o) - dAt(outside, j)) < 1e-6)).toBe(true);
  });

  test('the scrub weight: only where the cut lowers the terrain, on its side beyond the wall\'s front, in full where it lowers it enough', () => {
    // A synthetic tile over the cut: a plateau 30 m above the road, every 2 m over s 930 to 1000 and x -30 to 70.
    const S: number[] = [], X: number[] = [];
    for (let s = 930; s <= 1000; s += 2) S.push(s);
    for (let x = -30; x <= 70; x += 2) X.push(x);
    const position = new Float32Array(S.length * X.length * 3), normal = new Float32Array(position.length), uv = new Float32Array(S.length * X.length * 2), index: number[] = [];
    S.forEach((s, i) => X.forEach((x, j) => { const f = frame(north, s), d = north.sign * x, k = i * X.length + j; position.set([f.x + f.nx * d, f.y + 30, f.z + f.nz * d], k * 3); normal.set([0, 1, 0], k * 3); }));
    for (let i = 0; i + 1 < S.length; i++) for (let j = 0; j + 1 < X.length; j++) { const a = i * X.length + j, b = a + 1, c = a + X.length, d = c + 1; index.push(a, c, b, b, c, d); }
    const result = applyCorridors({ position, normal, uv, index: Uint32Array.from(index) }, [plan]);
    expect(result.scrub).not.toBeNull();
    expect(result.scrub!.dark).toEqual(data.scrub.dark); expect(result.scrub!.light).toEqual(data.scrub.light);
    let full = 0, some = 0;
    for (let v = 0; v < result.position.length / 3; v++) {
      const w = result.scrub!.weight[v]!, x = result.position[v * 3]!, y = result.position[v * 3 + 1]!, z = result.position[v * 3 + 2]!, p = horizontalProject(north.horizontal, x, z, 1e6)!;
      const natural = frame(north, p.s).y + 30, ad = p.d * cut.side;
      expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1);
      if (w > 0) { some++; expect(ad).toBeGreaterThan(cut.wall[0] - 1e-3); expect(ad).toBeLessThan(cut.reach[1]); if (w > .01) expect(y).toBeLessThan(natural - 2e-3); }
      if (ad >= cut.wall[1] && ad <= cut.reach[0] && p.s >= cut.s[0] + cut.fade && p.s <= north.length && y < natural - .5) { expect(w).toBeCloseTo(1, 5); full++; }
    }
    expect(full).toBeGreaterThan(100); expect(some).toBeGreaterThan(full);
  });

  test('the toe wall: near only, along toe.s on the cut\'s side, between its faces, from below the bed to its top above the road', () => {
    const near = approachArrays(north, cs, bridge.roadEndZ, bridge.medianHalfWidth, 'near', dressing), far = approachArrays(north, cs, bridge.roadEndZ, bridge.medianHalfWidth, 'far', dressing);
    const wall = (a: Float32Array) => {
      const found: { s: number; ad: number; up: number }[] = [];
      for (let i = 0; i < a.length / 3; i++) {
        const p = horizontalProject(north.horizontal, a[i * 3]!, a[i * 3 + 2]!, 1e6)!, ad = p.d * cut.side;
        if (ad > cut.wall[0] - 1e-3 && ad < cut.wall[1] + 1e-3 && p.s > cut.s[0]) found.push({ s: p.s, ad, up: a[i * 3 + 1]! - frame(north, p.s).y });
      }
      return found;
    };
    const top = wall(near.concrete.position).filter(v => v.up > 0);
    expect(top.length).toBeGreaterThan(40);
    for (const v of top) { expect(v.s).toBeGreaterThanOrEqual(data.toe.s[0] - 1e-3); expect(v.s).toBeLessThanOrEqual(data.toe.s[1] + 1e-3); expect(v.up).toBeCloseTo(data.toe.height, 4); }
    expect(Math.min(...wall(near.concrete.position).map(v => v.up))).toBeLessThan(-cs.pavement);
    expect(wall(far.concrete.position).length).toBe(0);
  });
});
