// SPDX-License-Identifier: MIT
// Fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md) item 4: the median continuing the deck's movable median barrier in
// both approach representations, and the highway light standards from data/layout.json dressing.lights: pairs at
// the deck lamps' spacing on the edge barriers, clear of Vista Point's throat, the plaza canopy and the barriers'
// taper; every standard near, those up to station `far` in the far representation; the pole on the barrier's top
// and the lens at its mounting height over the shoulder.
import { describe, expect, test } from 'bun:test';
import { LAYOUT } from '../../src/data';
import { horizontalProject } from '../../src/world/alignment';
import { approachArrays } from '../../src/world/approach-mesh';
import type { MeshArrays } from '../../src/world/approach-mesh';
import { barrierGaps, lightStandards, medianGap } from '../../src/world/dressing';
import { frame } from '../../src/world/mesh-arrays';
import { buildApproach } from '../../src/world/route';

const { approaches, bridge, dressing } = LAYOUT, cs = approaches.crossSection, lights = dressing.lights;
const both = (['south', 'north'] as const).map(name => buildApproach(name, approaches[name], bridge.roadEndZ));
/** Vertices of mesh arrays as approach station, lateral d, height y and height above the road at their station. */
function local(a: ReturnType<typeof buildApproach>, m: MeshArrays | null): { s: number; d: number; y: number; up: number }[] {
  if (!m) return [];
  const out: { s: number; d: number; y: number; up: number }[] = [];
  for (let i = 0; i < m.position.length / 3; i++) {
    const p = horizontalProject(a.horizontal, m.position[i * 3]!, m.position[i * 3 + 2]!, 1e6)!, y = m.position[i * 3 + 1]!;
    out.push({ s: p.s, d: p.d, y, up: y - frame(a, p.s).y });
  }
  return out;
}

describe('median and light standards', () => {
  test('the median runs in both representations from the deck end, interrupted only across the plaza', () => {
    for (const a of both) {
      const gap = medianGap(a, dressing);
      for (const detail of ['near', 'far'] as const) {
        const vs = local(a, approachArrays(a, cs, bridge.roadEndZ, bridge.medianHalfWidth, detail, dressing).concrete);
        const top = vs.filter(v => Math.abs(Math.abs(v.d) - bridge.medianHalfWidth) < 1e-3 && Math.abs(v.up - cs.medianHeight) < 1e-3);
        // Full height every 50 m from the deck end to where the barriers taper, except across the plaza's gap.
        for (let s = 20; s < a.data.ends.dissolve[0] - cs.joint.taper - 10; s += 50) {
          if (s > gap[0] - cs.joint.taper - 10 && s < gap[1] + cs.joint.taper + 10) continue;
          expect(top.some(v => Math.abs(v.s - s) <= 10)).toBe(true);
        }
        expect(top.filter(v => v.s > gap[0] + 1 && v.s < gap[1] - 1).length).toBe(0);
      }
    }
  });

  test('pairs at the deck lamps\' spacing from the first station, clear of openings, the canopy and the barriers\' taper', () => {
    for (const a of both) {
      const near = lightStandards(a, dressing, cs, true), gaps = barrierGaps(a, dressing), end = a.data.ends.dissolve[0] - cs.joint.taper - lights.clear;
      expect(near.length).toBeGreaterThan(15);
      for (const st of near) {
        const k = (st.s - lights.start) / lights.spacing;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
        expect(st.s).toBeLessThanOrEqual(end + 1e-6);
        expect(Math.abs(st.d)).toBeGreaterThanOrEqual(lights.x - 1e-9);
        for (const g of gaps) if (g.side === st.side) expect(st.s <= g.s[0] - lights.clear || st.s >= g.s[1] + lights.clear).toBe(true);
        if (dressing.plaza.approach === a.name) expect(st.s <= dressing.plaza.canopy.s[0] - lights.clear || st.s >= dressing.plaza.canopy.s[1] + lights.clear).toBe(true);
      }
      // Both sides at the first station, which continues the deck lamps' 91.44 m spacing.
      expect(near.filter(st => st.s === lights.start).map(st => st.side).sort()).toEqual([-1, 1]);
      const far = lightStandards(a, dressing, cs, false);
      expect(far.length).toBeGreaterThan(0);
      expect(far.every(st => st.s <= lights.far)).toBe(true);
      expect(far).toEqual(near.filter(st => st.s <= lights.far));
    }
  });

  test('each standard: the pole on the barrier\'s top, the lens at its mounting height reaching over the shoulder', () => {
    for (const a of both) {
      const arrays = approachArrays(a, cs, bridge.roadEndZ, bridge.medianHalfWidth, 'near', dressing), glass = local(a, arrays.glass), paint = local(a, arrays.paint);
      for (const st of lightStandards(a, dressing, cs, true)) {
        // Heights against the road at the standard's own station (the head is level across the grade).
        const road = frame(a, st.s).y;
        const lens = glass.filter(v => Math.abs(v.s - st.s) < 1 && Math.sign(v.d) === st.side && Math.abs(v.y - road - lights.mount) < 1e-3);
        expect(lens.length).toBe(4);
        const reach = Math.abs(st.d) - lights.reach;
        for (const v of lens) expect(Math.abs(Math.abs(v.d) - reach)).toBeLessThanOrEqual(lights.head[0] / 2 + 1e-3);
        const foot = paint.filter(v => Math.abs(v.s - st.s) < 1 && Math.abs(v.d - st.d) <= lights.pole[0] / 2 + 1e-3 && Math.abs(v.y - road - cs.barrier[2]) < 1e-3);
        expect(foot.length).toBeGreaterThanOrEqual(8);
      }
    }
  });
});
