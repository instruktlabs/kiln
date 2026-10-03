// SPDX-License-Identifier: MIT
// The approach roads' geometry (fix round 2): the horizontal alignment's tangents and arcs, the vertical
// profile's parabolic curves, and the route that joins the deck to both approaches (no step or kink at
// the deck ends, projection back to station and offset, the lanes' poses from one approach end to the
// other). The approach data are data/layout.json's; the deck is a synthetic grid with the g3 profile's
// end grade (the Roadway itself is checked by scripts/layout.ts --check and tests/tools/drive-check.ts).
import { describe, expect, test } from 'bun:test';
import { LANES, laneX } from '../../src/constants';
import { LAYOUT } from '../../scripts/authored-layout';
import { lanePose, laneStation, TRAFFIC_FLOW } from '../../src/traffic/config';
import { checkProfile, horizontalAt, horizontalProject, lateral, profileAt } from '../../src/world/alignment';
import type { RoadGrid } from '../../src/world/road';
import { approachHorizontal, createRoute, routeHeight, routePoint, routeProject, routeYaw } from '../../src/world/route';

const END = LAYOUT.bridge.roadEndZ, NAMES = ['south', 'north'] as const;
/** A deck grid in the Roadway's layout (0.5 m by 1 m) rising from 62.55 m at the deck ends at 3.18 percent, level at 75.3 m. */
function deckGrid(): RoadGrid {
  const x0 = -10, z0 = -Math.ceil(END), dx = .5, dz = 1, nx = 41, nz = 2 * Math.ceil(END) + 1, heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) heights.fill(Math.min(75.3, 62.55 + .0318 * (END - Math.abs(z0 + j * dz))), j * nx, (j + 1) * nx);
  return { x0, z0, dx, dz, nx, nz, heights };
}
const route = createRoute(deckGrid(), LAYOUT.approaches, END);

describe('approach roads: alignment, profile and route', () => {
  test('each alignment runs on from the road end without a kink, and projection inverts station and offset', () => {
    for (const name of NAMES) {
      const a = LAYOUT.approaches[name], h = approachHorizontal(name, a.alignment, END), rMin = Math.min(...a.alignment.radii);
      expect(h.length).toBeGreaterThanOrEqual(a.length);
      const first = horizontalAt(h, 0);
      expect([first.x, first.z, first.tx, first.tz].map(v => +v.toFixed(9))).toEqual([0, (name === 'north' ? 1 : -1) * END, 0, name === 'north' ? 1 : -1]);
      let previous = first;
      for (let s = 1; s <= a.length; s++) {
        const p = horizontalAt(h, s);
        expect(Math.hypot(p.tx, p.tz)).toBeCloseTo(1, 9);
        // Arc-length parametrised, and the direction turns no faster than the tightest curve.
        expect(Math.hypot(p.x - previous.x, p.z - previous.z)).toBeCloseTo(1, 4);
        expect(Math.acos(Math.min(1, p.tx * previous.tx + p.tz * previous.tz))).toBeLessThanOrEqual(1 / rMin + 1e-9);
        if (s % 25 === 0) for (const d of [-9.4488, -1.7018, 0, 7.8994]) {
          const [nx, nz] = lateral(p.tx, p.tz), q = horizontalProject(h, p.x + d * nx, p.z + d * nz);
          expect(q!.s).toBeCloseTo(s, 5); expect(q!.d).toBeCloseTo(d, 5);
        }
        previous = p;
      }
    }
  });

  test('each profile starts at the deck end elevation and grade and keeps elevation and grade continuous', () => {
    for (const name of NAMES) {
      const a = LAYOUT.approaches[name], profile = { pvis: a.profile };
      expect(() => checkProfile(profile)).not.toThrow();
      const start = profileAt(profile, 0);
      expect(start.y).toBeCloseTo(a.start.elevation, 9); expect(start.grade).toBeCloseTo(a.start.grade, 9);
      // The steepest grade change per metre of any vertical curve bounds the change between samples.
      const v = a.profile, g = (k: number) => (v[k + 1]![1] - v[k]![1]) / (v[k + 1]![0] - v[k]![0]);
      const rate = Math.max(...v.slice(1, -1).map((p, i) => Math.abs(g(i + 1) - g(i)) / p[2]));
      let previous = start;
      for (let s = .25; s <= a.length; s += .25) {
        const p = profileAt(profile, s);
        expect(Math.abs(p.grade - previous.grade)).toBeLessThanOrEqual(rate * .25 + 1e-9);
        expect(Math.abs(p.y - previous.y - (p.grade + previous.grade) / 2 * .25)).toBeLessThan(1e-6);
        previous = p;
      }
    }
  });

  test('the route joins the deck to both approaches without a step or a kink', () => {
    for (const sign of [-1, 1] as const) {
      for (const d of [-7.8994, 0, 4.8006]) {
        const inside = routeHeight(route, sign * (END - 1e-6), d), outside = routeHeight(route, sign * (END + 1e-6), d);
        expect(Math.abs(inside - outside)).toBeLessThan(1e-4);
        // Across the last grid row the height runs linearly into the approach (a 3 cm per metre class grade).
        for (let t = END - 3; t < END + 3; t += .05) expect(Math.abs(routeHeight(route, sign * (t + .05), d) - routeHeight(route, sign * t, d))).toBeLessThan(.0025);
      }
      const onDeck = routePoint(route, sign * (END - .5), 0), onApproach = routePoint(route, sign * (END + .5), 0);
      expect(routeYaw(onDeck)).toBeCloseTo(0, 9); expect(Math.abs(routeYaw(onApproach))).toBeLessThan(1e-6);
      expect(onApproach.approach?.name).toBe(sign > 0 ? 'north' : 'south');
    }
  });

  test('projection returns the station and offset on the deck and on both approaches', () => {
    for (const sigma of [route.min + 1, -1500, -END - 20, -500, 0, 700, END + 30, 1400, route.max - 1]) {
      for (const d of [-8.5, -1.7018, 3, 9.4488]) {
        const p = routePoint(route, sigma, d), q = routeProject(route, p.x, p.z);
        expect(q!.sigma).toBeCloseTo(sigma, 5); expect(q!.d).toBeCloseTo(d, 5);
      }
    }
    // Beyond a modelled end there is no route.
    const past = routePoint(route, route.max, 0);
    expect(routeProject(route, past.x + 50 * past.fx, past.z + 50 * past.fz)).toBeNull();
  });

  test('every lane runs from one approach end to the other at its deck x, facing its direction of travel', () => {
    LANES.forEach((lane, i) => {
      const dir = lane.direction === 'north' ? 1 : -1;
      for (let s = 0; s <= TRAFFIC_FLOW.laneLength; s += 97) {
        const { p, yaw } = lanePose(route, i, s), q = routeProject(route, p.x, p.z);
        expect(q!.sigma).toBeCloseTo(laneStation(i, s), 5); expect(q!.d).toBeCloseTo(laneX(i), 5);
        // A traffic vehicle's local +X, (cos yaw, -sin yaw), points along the lane's direction of travel.
        expect(Math.cos(yaw) * dir * p.fx - Math.sin(yaw) * dir * p.fz).toBeCloseTo(1, 9);
      }
    });
  });
});
