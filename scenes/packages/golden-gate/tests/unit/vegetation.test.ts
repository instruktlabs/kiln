// SPDX-License-Identifier: MIT
// Fix round 3 (golden-gate-scene/SCENE-REVIEW-3.md) item 5: the vegetation impostors from data/layout.json
// dressing.vegetation. Candidates are deterministic, thinned (never moved) by the feature level's density, within
// reach of their approach and clear of the road (with the plaza's widening), the deck end, Vista Point's paved lot and
// the benched cuts; the canopy score separates the imagery's calibration colours; roots take the highest surface of
// a tile's triangles; the crown atlas; one tile's instanced cards.
import { describe, expect, test } from 'bun:test';
import { MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import type { InstancedBufferGeometry } from 'three/webgpu';
import { LAYOUT, TIER_DATA } from '../../src/data';
import { horizontalProject } from '../../src/world/alignment';
import { polygonDistance, sideWidening } from '../../src/world/dressing';
import { buildApproach } from '../../src/world/route';
import { canopyScore, crownAtlas, surfaceHeights, VEGETATION_INSTANCE_BYTES, vegetationCandidates, vegetationTile } from '../../src/world/vegetation';

const { approaches, bridge, dressing } = LAYOUT, v = dressing.vegetation, cs = approaches.crossSection;
const all = vegetationCandidates(approaches, bridge.roadEndZ, dressing, 1);
const key = (c: (typeof all)[number]) => `${c.approach}|${c.kind}|${c.x}|${c.z}`;

describe('vegetation impostors', () => {
  test('candidates: deterministic, within reach and clear of the road, the deck end, the lot and the cuts', () => {
    expect(vegetationCandidates(approaches, bridge.roadEndZ, dressing, 1)).toEqual(all);
    for (const name of ['south', 'north'] as const) {
      const a = buildApproach(name, approaches[name], bridge.roadEndZ), mine = all.filter(c => c.approach === name);
      expect([...new Set(mine.map(c => c.kind))].sort()).toEqual([...v.approaches[name]].sort());
      for (const c of mine) {
        const p = horizontalProject(a.horizontal, c.x, c.z)!, kind = v.kinds[c.kind], half = (kind.width[0] + (kind.width[1] - kind.width[0]) * c.width) / 2;
        expect(Math.abs(p.s - c.s)).toBeLessThan(1e-6);
        expect(Math.abs(p.d - c.d)).toBeLessThan(1e-6);
        expect(Math.abs(c.d)).toBeLessThanOrEqual(v.reach);
        expect(c.s).toBeGreaterThanOrEqual(half + v.clear);
        expect(c.s).toBeLessThanOrEqual(a.length);
        // The crown's half width clear of the edge barrier's outer face (out with the plaza's widening).
        expect(Math.abs(c.d)).toBeGreaterThanOrEqual(cs.barrier[1] + sideWidening(a, dressing, cs.pavedHalfWidth, c.s, Math.sign(c.d)) + v.clear + half - 1e-9);
        for (const cut of approaches[name].cuts ?? []) {
          const beside = c.d * a.sign * cut.side > 0 && c.s > cut.s[0] - half && c.s < cut.s[1] + half;
          if (beside) expect(Math.abs(c.d)).toBeGreaterThanOrEqual(cut.reach[1] + half);
        }
        if (dressing.vista.approach === name) {
          const q = a.sign * c.d;
          expect(polygonDistance(dressing.vista.outline, c.s, q) >= half + v.clear || polygonDistance(dressing.vista.planter, c.s, q) <= -half).toBe(true);
        }
        for (const u of [c.yaw, c.height, c.width, c.seed]) { expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThan(1); }
      }
    }
  });

  test('the feature levels thin the same grid: lower densities keep a subset, in proportion', () => {
    const densities = (['high', 'medium', 'low'] as const).map(level => TIER_DATA.features[level].vegetation.density);
    expect(densities[0]).toBe(1);
    expect(densities[1]!).toBeLessThan(densities[0]!);
    expect(densities[2]!).toBeLessThan(densities[1]!);
    const full = new Set(all.map(key));
    for (const density of densities.slice(1)) {
      const thin = vegetationCandidates(approaches, bridge.roadEndZ, dressing, density);
      expect(thin.every(c => full.has(key(c)))).toBe(true);
      expect(Math.abs(thin.length / all.length - density)).toBeLessThan(.03);
    }
    for (const level of ['high', 'medium', 'low'] as const) { const f = TIER_DATA.features[level].vegetation.fade; expect(f[0]).toBeLessThan(f[1]); }
  });

  test('the canopy score separates the imagery\'s calibration colours', () => {
    const c = v.classes;
    // The Presidio forest's canopy, a headland scrub patch, a mown lawn and dry grass (sRGB, sampled from our imagery).
    expect(canopyScore([53, 72, 57], 'tree', c)).toBeGreaterThan(.95);
    expect(canopyScore([53, 72, 57], 'scrub', c)).toBeLessThan(.05);
    expect(canopyScore([93, 102, 74], 'scrub', c)).toBeGreaterThan(.95);
    expect(canopyScore([93, 102, 74], 'tree', c)).toBeLessThan(.05);
    for (const grass of [[110, 114, 94], [134, 121, 101]]) for (const kind of ['tree', 'scrub'] as const) expect(canopyScore(grass, kind, c)).toBeLessThan(.05);
  });

  test('roots take the highest surface of a tile\'s triangles; none where no triangle covers them', () => {
    // A ground quad at y 0 over x, z in [0, 10], a slope y = z over the triangle (20, 0), (30, 0), (20, 10), a roof at
    // y 5 over part of the ground, and a vertical face (ignored); a point beside the slope is uncovered.
    const position = [0, 0, 0, 10, 0, 0, 10, 0, 10, 0, 0, 10, 20, 0, 0, 30, 0, 0, 20, 10, 10, 2, 5, 2, 6, 5, 2, 2, 5, 6, 4, 0, 8, 6, 0, 8, 6, 9, 8];
    const index = [0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const h = surfaceHeights([1, 3, 22, 28, 50, 8], [1, 3, 3, 5, 50, 9], position, index);
    expect(h[0]).toBeCloseTo(0, 9);
    expect(h[1]).toBeCloseTo(5, 9);
    expect(h[2]).toBeCloseTo(3, 9);
    expect(Number.isNaN(h[4]!)).toBe(true);
    expect(h[5]).toBeCloseTo(0, 9);
    expect(Number.isNaN(h[3]!)).toBe(true);
  });

  test('the crown atlas: four cut-out cells with a clear margin, trunks at the trees\' foot', () => {
    const size = 64, { data, width, height } = crownAtlas(size);
    expect([width, height]).toEqual([2 * size, 2 * size]);
    expect(crownAtlas(size).data).toEqual(data);
    const alpha = (kind: number, variant: number, i: number, j: number) => data[((kind * size + j) * width + variant * size + i) * 4 + 3]!;
    for (let kind = 0; kind < 2; kind++) for (let variant = 0; variant < 2; variant++) {
      let cover = 0;
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const a = alpha(kind, variant, i, j);
        expect(a === 0 || a === 255).toBe(true);
        if (i < 2 || j < 2 || i >= size - 2 || j >= size - 2) expect(a).toBe(0);
        cover += a ? 1 : 0;
      }
      expect(cover / (size * size)).toBeGreaterThan(.35);
      expect(cover / (size * size)).toBeLessThan(.8);
    }
    // Tree cells: the trunk alone at the foot (row 3), under the axis.
    for (let variant = 0; variant < 2; variant++) {
      const foot = [...Array(size).keys()].filter(i => alpha(0, variant, i, 3));
      expect(foot.length).toBeGreaterThan(0);
      expect(foot.every(i => Math.abs((i + .5) / size - .5) < .05)).toBe(true);
    }
  });

  test('one tile\'s cards: roots on the surface, the uncovered dropped, binned per approach and station', () => {
    const south = all.filter(c => c.approach === 'south'), cx = south[0]!.x, cz = south[0]!.z;
    const bounds = [cx - 150, cz - 150, cx + 150, cz + 150] as const, on = all.filter(c => c.x >= bounds[0] && c.x < bounds[2] && c.z >= bounds[1] && c.z < bounds[3]);
    // A plane at y 12 over the tile's -X half only.
    const position = [bounds[0], 12, bounds[1], cx, 12, bounds[1], cx, 12, bounds[3], bounds[0], 12, bounds[3]], index = [0, 1, 2, 0, 2, 3];
    const tile = vegetationTile(all, bounds, position, index, v, new MeshStandardNodeMaterial(), 't');
    const covered = on.filter(c => c.x <= cx);
    expect(on.length).toBeGreaterThan(covered.length);
    expect(tile.cards).toBe(covered.length);
    expect(tile.dropped).toBe(on.length - covered.length);
    expect(tile.bytes).toBe(tile.cards * VEGETATION_INSTANCE_BYTES);
    let total = 0;
    for (const mesh of tile.meshes) {
      const g = mesh.geometry as InstancedBufferGeometry, root = g.getAttribute('root'), n = g.instanceCount;
      expect(mesh.name).toMatch(/^vegetation-t-(south|north)-\d+$/);
      expect(mesh.castShadow).toBe(false);
      expect(g.getAttribute('position').count).toBe(8);
      expect(g.getIndex()!.count).toBe(12);
      for (let k = 0; k < n; k++) {
        expect(root.getY(k)).toBe(12);
        expect([0, 1, 2, 3]).toContain(root.getW(k));
        expect(g.boundingSphere!.distanceToPoint(new Vector3(root.getX(k), root.getY(k), root.getZ(k)))).toBeLessThanOrEqual(0);
      }
      total += n;
    }
    expect(total).toBe(tile.cards);
  });
});
