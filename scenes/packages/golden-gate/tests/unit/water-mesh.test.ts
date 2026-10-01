import { expect, test } from 'bun:test';
import { CLIPMAP_DEFAULTS, levelExtent, maxTiles, morphVertex, selectTiles, vertexCount, type ClipmapOptions } from '../../src/world/water-mesh';
import { mulberry32 } from '../../src/world/detail-textures';

interface Edge { tile: number; line: string; u0: number; u1: number; points: number[] }

function edgesFor(o: ClipmapOptions, tiles: Float32Array, count: number, cx: number, cz: number): Map<string, Edge[]> {
  const lines = new Map<string, Edge[]>(), g = o.grid;
  const add = (edge: Edge) => { const list = lines.get(edge.line) ?? []; list.push(edge); lines.set(edge.line, list); };
  for (let t = 0; t < count; t++) {
    const patch = tiles.subarray(t * 4, t * 4 + 4), x0 = patch[0]!, z0 = patch[1]!, size = patch[2]!;
    const along = (fixed: 'i' | 'j', index: number) => {
      const points: number[] = [];
      for (let n = 0; n <= g; n++) {
        const [x, z] = fixed === 'i' ? morphVertex(o, patch, index, n, cx, cz) : morphVertex(o, patch, n, index, cx, cz);
        // Edge vertices must stay on their line.
        if (fixed === 'i') expect(x).toBe(x0 + (index / g) * size); else expect(z).toBe(z0 + (index / g) * size);
        points.push(fixed === 'i' ? z : x);
      }
      return [...new Set(points)].sort((a, b) => a - b);
    };
    add({ tile: t, line: `x${x0}`, u0: z0, u1: z0 + size, points: along('i', 0) });
    add({ tile: t, line: `x${x0 + size}`, u0: z0, u1: z0 + size, points: along('i', g) });
    add({ tile: t, line: `z${z0}`, u0: x0, u1: x0 + size, points: along('j', 0) });
    add({ tile: t, line: `z${z0 + size}`, u0: x0, u1: x0 + size, points: along('j', g) });
  }
  return lines;
}

function checkWatertight(o: ClipmapOptions, cx: number, cz: number): { tiles: number; sharedEdges: number } {
  const tiles = new Float32Array(maxTiles(o) * 4), count = selectTiles(o, cx, cz, tiles);
  let area = 0; for (let t = 0; t < count; t++) area += tiles[t * 4 + 2]! ** 2;
  const outer = levelExtent(o, o.levels - 1);
  expect(area).toBe((2 * outer) ** 2); // tiles never overlap and cover the outermost square
  let shared = 0;
  for (const edges of edgesFor(o, tiles, count, cx, cz).values()) {
    for (let a = 0; a < edges.length; a++) for (let b = a + 1; b < edges.length; b++) {
      const A = edges[a]!, B = edges[b]!, u0 = Math.max(A.u0, B.u0), u1 = Math.min(A.u1, B.u1);
      if (u1 <= u0) continue;
      shared++;
      const pa = A.points.filter(u => u >= u0 && u <= u1), pb = B.points.filter(u => u >= u0 && u <= u1);
      if (pa.join() !== pb.join()) throw new Error(`crack at camera (${cx}, ${cz}) on ${A.line} [${u0}, ${u1}]: ${pa.join(' ')} vs ${pb.join(' ')}`);
    }
  }
  return { tiles: count, sharedEdges: shared };
}

test('clipmap budget: at most about 100k vertices on the high tier', () => {
  expect(vertexCount(CLIPMAP_DEFAULTS)).toBeLessThanOrEqual(100_000);
  expect(levelExtent(CLIPMAP_DEFAULTS, CLIPMAP_DEFAULTS.levels - 1)).toBeGreaterThanOrEqual(130_000);
});

test('clipmap tiles are watertight after geomorphing for many camera positions', () => {
  const rand = mulberry32(42);
  const cameras: [number, number][] = [[0, 0], [357.6, 1096], [-118, -596], [260, -40], [24, 180], [-4.8006, -330]];
  for (let i = 0; i < 40; i++) cameras.push([(rand() - .5) * 12_000, (rand() - .5) * 12_000]);
  // Cameras exactly at snap thresholds of several levels.
  for (const level of [0, 1, 3, 6]) { const t = CLIPMAP_DEFAULTS.tile0 * 2 ** level; cameras.push([t, 3 * t], [-t, t + .0001], [5 * t, -t]); }
  let shared = 0;
  for (const [cx, cz] of cameras) shared += checkWatertight(CLIPMAP_DEFAULTS, cx, cz).sharedEdges;
  expect(shared).toBeGreaterThan(1000);
});

test('clipmap is watertight for the other tier grids', () => {
  for (const grid of [2, 4]) {
    const o = { ...CLIPMAP_DEFAULTS, grid };
    for (const [cx, cz] of [[0, 0], [123.4, -567.8], [8, 24], [-2047.9, 3001]] as [number, number][]) checkWatertight(o, cx, cz);
  }
});

test('regions that change level when a centre snaps are identical on both sides', () => {
  // Just before and after the level-2 snap threshold along x the swapped strips are fully morphed
  // on the fine level and unmorphed on the coarse level, so the set of distinct vertices is equal.
  const o = CLIPMAP_DEFAULTS, t = o.tile0 * 4, eps = 1e-3;
  const distinct = (cx: number) => {
    const tiles = new Float32Array(maxTiles(o) * 4), count = selectTiles(o, cx, 0, tiles), set = new Set<string>();
    for (let n = 0; n < count; n++) {
      const patch = tiles.subarray(n * 4, n * 4 + 4); if (patch[3]! > 4) continue;
      for (let j = 0; j <= o.grid; j++) for (let i = 0; i <= o.grid; i++) {
        const [x, z] = morphVertex(o, patch, i, j, cx, 0);
        // Compare within the band that can change hands (level-2 boundary +- one level-3 tile).
        if (Math.abs(x) > 3 * t && Math.abs(x) < 6 * t && Math.abs(z) < 4 * t) set.add(`${x.toFixed(2)},${z.toFixed(2)}`);
      }
    }
    return set;
  };
  const before = distinct(t - eps), after = distinct(t + eps);
  let differ = 0; for (const key of before) if (!after.has(key)) differ++;
  for (const key of after) if (!before.has(key)) differ++;
  // Vertices move continuously with the camera (by at most eps-scaled morph), never jump.
  expect(differ / Math.max(1, before.size)).toBeLessThan(.02);
});
