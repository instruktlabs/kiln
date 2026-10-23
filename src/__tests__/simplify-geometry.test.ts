/**
 * simplifyGeometry: an explicit, author-called lower-detail copy of one geometry (#243).
 *
 * The pinned meshoptimizer simplifier reduces triangles towards a ratio or count. Kiln wraps
 * it so the input is never mutated, material groups stay separate, UV seams and open borders
 * hold, and the achieved ratio and the simplifier's error are reported on the result. It feeds
 * defineLod tiers; it never runs implicitly.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { listDiscoveryEntries } from '../discovery/catalog';
import { createLexicalDiscoveryIndex } from '../discovery/lexical-index';
import { createGltfIO } from '../gltf-io';
import { summarizeLodChains } from '../lod-export';
import { buildSandboxGlobals } from '../primitives';
import { renderGLBInProcess } from '../render';
import { type SimplifyReportV1, simplifyGeometry } from '../simplify';

const triangles = (geometry: THREE.BufferGeometry) =>
  (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;

function report(geometry: THREE.BufferGeometry): SimplifyReportV1 {
  return geometry.userData.kilnSimplify as SimplifyReportV1;
}

function snapshot(geometry: THREE.BufferGeometry) {
  return {
    attributes: Object.fromEntries(
      Object.entries(geometry.attributes).map(([name, attribute]) => [
        name,
        Array.from(attribute.array as ArrayLike<number>),
      ]),
    ),
    index: geometry.index ? Array.from(geometry.index.array as ArrayLike<number>) : null,
    groups: structuredClone(geometry.groups),
    userData: structuredClone(geometry.userData),
  };
}

function uvRange(geometry: THREE.BufferGeometry) {
  const uv = geometry.getAttribute('uv');
  const range = { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity, nan: 0 };
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (!Number.isFinite(u) || !Number.isFinite(v)) range.nan++;
    range.minU = Math.min(range.minU, u);
    range.maxU = Math.max(range.maxU, u);
    range.minV = Math.min(range.minV, v);
    range.maxV = Math.max(range.maxV, v);
  }
  return range;
}

/** Edges, keyed by rounded positions, not shared by exactly two triangles: cracks or borders. */
function openEdges(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  const key = (i: number) =>
    [position.getX(i), position.getY(i), position.getZ(i)].map((n) => n.toFixed(5)).join();
  const corners = geometry.index ? geometry.index.count : position.count;
  const at = (i: number) => (geometry.index ? geometry.index.getX(i) : i);
  const edges = new Map<string, number>();
  for (let t = 0; t < corners; t += 3) {
    const keys = [key(at(t)), key(at(t + 1)), key(at(t + 2))];
    if (new Set(keys).size < 3) continue;
    for (let e = 0; e < 3; e++) {
      const [a, b] = [keys[e]!, keys[(e + 1) % 3]!].sort();
      edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((count) => count !== 2).length;
}

describe('simplifyGeometry', () => {
  test('reduces a sphere to near the requested ratio and reports the result', async () => {
    const sphere = new THREE.SphereGeometry(1, 32, 16);
    const before = triangles(sphere);
    const far = await simplifyGeometry(sphere, { ratio: 0.25 });

    expect(far).not.toBe(sphere);
    expect(far.isBufferGeometry).toBe(true);
    const after = triangles(far);
    expect(after).toBeGreaterThanOrEqual(before * 0.25 * 0.9);
    expect(after).toBeLessThanOrEqual(before * 0.25 * 1.1);
    const r = report(far);
    expect(r.schemaVersion).toBe(1);
    expect(r.trianglesBefore).toBe(before);
    expect(r.trianglesAfter).toBe(after);
    expect(r.ratio).toBeCloseTo(after / before, 6);
    expect(r.requested).toEqual({ ratio: 0.25 });
    // The simplifier's error: relative to the mesh extent and in scene units.
    expect(r.error).toBeGreaterThan(0);
    expect(r.error).toBeLessThan(0.1);
    expect(r.errorAbsolute).toBeGreaterThan(0);
    expect(r.errorAbsolute).toBeCloseTo(r.error * r.scale, 6);
    // Fewer vertices too: unused vertices are compacted away, normals stay unit length.
    expect(far.getAttribute('position').count).toBeLessThan(sphere.getAttribute('position').count);
    const normal = far.getAttribute('normal');
    for (let i = 0; i < normal.count; i++)
      expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 4);
    far.computeBoundingSphere();
    expect(far.boundingSphere!.radius).toBeCloseTo(1, 1);
  });

  test('closed shapes stay closed: UV seams do not open into cracks', async () => {
    for (const geometry of [
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.TorusGeometry(1, 0.3, 24, 48),
    ])
      for (const lockBorder of [true, false]) {
        const out = await simplifyGeometry(geometry, { ratio: 0.25, lockBorder });
        expect(triangles(out)).toBeLessThanOrEqual(triangles(geometry) * 0.3);
        expect(openEdges(out)).toBe(0);
      }
  });

  test('a triangle target works like a ratio', async () => {
    const sphere = new THREE.SphereGeometry(1, 32, 16);
    const far = await simplifyGeometry(sphere, { targetTriangles: 300 });
    expect(Math.abs(triangles(far) - 300)).toBeLessThanOrEqual(30);
    expect(report(far).requested).toEqual({ targetTriangles: 300 });
  });

  test('never mutates the input geometry', async () => {
    const box = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
    box.userData.note = 'kept';
    const before = snapshot(box);
    const out = await simplifyGeometry(box, { ratio: 0.3 });
    expect(snapshot(box)).toEqual(before);
    expect(out.userData.note).toBe('kept');
    expect(box.userData.kilnSimplify).toBeUndefined();
    for (const name of Object.keys(out.attributes))
      expect(out.getAttribute(name).array).not.toBe(box.getAttribute(name).array);
  });

  test('keeps material groups separate and their boundaries in place', async () => {
    // BoxGeometry has one group per face, materialIndex 0..5.
    const box = new THREE.BoxGeometry(2, 2, 2, 8, 8, 8);
    const axes = [
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [2, 1],
      [2, -1],
    ] as const;
    // Group boundaries hold even when open borders are free to move.
    for (const lockBorder of [true, false]) {
      const out = await simplifyGeometry(box, { ratio: 0.25, lockBorder });

      expect(out.groups.map((group) => group.materialIndex)).toEqual([0, 1, 2, 3, 4, 5]);
      let next = 0;
      for (const group of out.groups) {
        expect(group.start).toBe(next);
        expect(group.count % 3).toBe(0);
        expect(group.count).toBeGreaterThan(0);
        next += group.count;
      }
      expect(next).toBe(out.index!.count);
      expect(triangles(out)).toBeLessThan(triangles(box) * 0.5);
      expect(report(out).runs).toBe(6);
      expect(report(out).lockedVertices).toBeGreaterThan(0);

      // Every triangle of a face group stays on that face's plane, and the faces still meet
      // edge to edge: no group borrows another's vertices and no shared edge moved apart.
      const position = out.getAttribute('position');
      for (const group of out.groups) {
        const [axis, sign] = axes[group.materialIndex!]!;
        for (let i = group.start; i < group.start + group.count; i++)
          expect(position.getComponent(out.index!.getX(i), axis)).toBeCloseTo(sign, 6);
      }
      expect(openEdges(out)).toBe(0);
      out.computeBoundingBox();
      expect(out.boundingBox!.min.toArray()).toEqual([-1, -1, -1]);
      expect(out.boundingBox!.max.toArray()).toEqual([1, 1, 1]);
    }
  });

  test('keeps UV seams and their range on a seamed cylinder, with no NaNs', async () => {
    const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 2, 48, 12);
    const before = uvRange(cylinder);
    const out = await simplifyGeometry(cylinder, { ratio: 0.3 });
    const after = uvRange(out);

    expect(triangles(out)).toBeLessThan(triangles(cylinder) * 0.5);
    expect(after.nan).toBe(0);
    expect(after.minU).toBeCloseTo(before.minU, 6);
    expect(after.maxU).toBeCloseTo(before.maxU, 6);
    expect(after.minV).toBeCloseTo(before.minV, 6);
    expect(after.maxV).toBeCloseTo(before.maxV, 6);

    // The side seam survives: some positions still carry both u = 0 and u = 1.
    const position = out.getAttribute('position');
    const uv = out.getAttribute('uv');
    const us = new Map<string, Set<number>>();
    for (let i = 0; i < position.count; i++) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)]
        .map((n) => n.toFixed(5))
        .join();
      if (!us.has(key)) us.set(key, new Set());
      us.get(key)!.add(Math.round(uv.getX(i) * 1e5) / 1e5);
    }
    expect([...us.values()].some((set) => set.has(0) && set.has(1))).toBe(true);
    // Material groups of the cylinder (side, top cap, bottom cap) are kept too.
    expect(out.groups.map((group) => group.materialIndex)).toEqual([0, 1, 2]);
  });

  test('locks open borders by default, and frees them on request', async () => {
    const plane = new THREE.PlaneGeometry(2, 2, 16, 16);
    const border = (geometry: THREE.BufferGeometry) => {
      const position = geometry.getAttribute('position');
      const points = new Set<string>();
      for (let i = 0; i < position.count; i++) {
        const [x, y] = [position.getX(i), position.getY(i)];
        if (Math.abs(Math.abs(x) - 1) < 1e-6 || Math.abs(Math.abs(y) - 1) < 1e-6)
          points.add(`${x.toFixed(5)},${y.toFixed(5)}`);
      }
      return points;
    };
    const locked = await simplifyGeometry(plane, { ratio: 0.1 });
    expect(border(locked)).toEqual(border(plane));
    expect(report(locked).lockBorder).toBe(true);

    const free = await simplifyGeometry(plane, { ratio: 0.1, lockBorder: false });
    expect(border(free).size).toBeLessThan(border(plane).size);
    expect(triangles(free)).toBeLessThan(triangles(locked));
  });

  test('welds an unindexed copy before simplifying and keeps every attribute type', async () => {
    const sphere = new THREE.SphereGeometry(1, 24, 12).toNonIndexed();
    const colors = new Uint8Array(sphere.getAttribute('position').count * 4).fill(200);
    sphere.setAttribute('color', new THREE.BufferAttribute(colors, 4, true));
    const out = await simplifyGeometry(sphere, { ratio: 0.3 });
    expect(out.index).not.toBeNull();
    expect(triangles(out)).toBeLessThan(triangles(sphere) * 0.4);
    const color = out.getAttribute('color') as THREE.BufferAttribute;
    expect(color.array).toBeInstanceOf(Uint8Array);
    expect(color.normalized).toBe(true);
    expect(color.itemSize).toBe(4);
    expect(Array.from(color.array as Uint8Array).every((value) => value === 200)).toBe(true);
  });

  test('reports when an error limit stops it short of the target', async () => {
    const sphere = new THREE.SphereGeometry(1, 32, 16);
    const out = await simplifyGeometry(sphere, { ratio: 0.1, maxError: 0.001 });
    const r = report(out);
    expect(r.trianglesAfter).toBeGreaterThan(r.trianglesBefore * 0.1 * 1.1);
    expect(r.error).toBeLessThanOrEqual(0.001);
    expect(r.maxError).toBe(0.001);
    expect(out.userData.kilnGeometryWarnings).toEqual([
      expect.objectContaining({ code: 'SIMPLIFY_TARGET_NOT_REACHED' }),
    ]);
  });

  test('is deterministic', async () => {
    const a = await simplifyGeometry(new THREE.TorusGeometry(1, 0.3, 24, 48), { ratio: 0.2 });
    const b = await simplifyGeometry(new THREE.TorusGeometry(1, 0.3, 24, 48), { ratio: 0.2 });
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  test('rejects bad options with a sentence that names the fix', async () => {
    const sphere = new THREE.SphereGeometry(1, 8, 6);
    for (const [options, message] of [
      [{ ratio: 0 }, 'ratio'],
      [{ ratio: 1.5 }, 'ratio'],
      [{ ratio: -0.2 }, 'ratio'],
      [{ ratio: Number.NaN }, 'ratio'],
      [{}, 'exactly one of ratio or targetTriangles'],
      [{ ratio: 0.5, targetTriangles: 10 }, 'exactly one of ratio or targetTriangles'],
      [{ targetTriangles: 0 }, 'targetTriangles'],
      [{ targetTriangles: 2.5 }, 'targetTriangles'],
      [{ ratio: 0.5, maxError: -1 }, 'maxError'],
      [{ ratio: 0.5, lockBorder: 'yes' }, 'lockBorder'],
      [{ ratio: 0.5, target: 10 }, 'unknown option "target"'],
    ] as const)
      await expect(simplifyGeometry(sphere, options as never)).rejects.toThrow(message);
    await expect(simplifyGeometry(sphere, undefined as never)).rejects.toThrow(
      'exactly one of ratio or targetTriangles',
    );
    await expect(simplifyGeometry({} as never, { ratio: 0.5 })).rejects.toThrow('BufferGeometry');
  });

  test('is a sandbox global that feeds defineLod through a rendered Kiln program', async () => {
    expect(typeof buildSandboxGlobals().simplifyGeometry).toBe('function');
    const code = `const meta = { name: 'Simplified Rock' };
async function build() {
  const root = createRoot('Rock');
  const stone = gameMaterial(0x777777);
  const rock = sphereGeo(1, 32, 16);
  const far = await simplifyGeometry(rock, { ratio: 0.25 });
  const near = new THREE.Group(); near.name = 'Rock_LOD0'; near.position.y = 1; root.add(near);
  const farTier = new THREE.Group(); farTier.name = 'Rock_LOD1'; farTier.position.y = 1; root.add(farTier);
  createPart('RockNear', rock, stone, { parent: near });
  createPart('RockFar', far, stone, { parent: farTier });
  defineLod([near, farTier], { screenCoverage: [0.05, 0.001] });
  return root;
}`;
    const result = await renderGLBInProcess(code);
    // The sandbox's primitive range stamp follows the copy; no provenance or target notes.
    expect(result.warnings.join(' ')).not.toContain('SIMPLIFY_');
    const doc = await createGltfIO().readBinary(new Uint8Array(result.glb));
    const [chain] = summarizeLodChains(doc);
    expect(chain!.levels.map((level) => level.name)).toEqual(['Rock_LOD0', 'Rock_LOD1']);
    const [near, far] = chain!.levels.map((level) => level.triangles);
    expect(near).toBe(960);
    expect(far).toBeGreaterThanOrEqual(216);
    expect(far).toBeLessThanOrEqual(264);
  });

  test('keeps a whole-geometry source range stamp and drops per-face provenance it cannot map', async () => {
    const stamped = new THREE.SphereGeometry(1, 32, 16);
    stamped.userData.kilnRanges = [{ name: 'sphereGeo#1', start: 0, count: 960 }];
    const kept = await simplifyGeometry(stamped, { ratio: 0.25 });
    expect(kept.userData.kilnRanges).toEqual([
      { name: 'sphereGeo#1', start: 0, count: triangles(kept) },
    ]);
    expect(kept.userData.kilnGeometryWarnings).toBeUndefined();

    const csg = new THREE.SphereGeometry(1, 32, 16);
    csg.userData.kilnCsgProvenance = { schemaVersion: 1, runs: [], faceIds: [] };
    csg.userData.kilnRanges = [{ name: 'a', start: 0, count: 100 }];
    const dropped = await simplifyGeometry(csg, { ratio: 0.25 });
    expect(dropped.userData.kilnCsgProvenance).toBeUndefined();
    expect(dropped.userData.kilnRanges).toBeUndefined();
    expect(dropped.userData.kilnGeometryWarnings).toEqual([
      expect.objectContaining({ code: 'SIMPLIFY_PROVENANCE_DROPPED' }),
    ]);
  });
});

describe('simplifyGeometry in Discovery', () => {
  test('a search for lower detail finds it, and defineLod points to it', async () => {
    const entries = listDiscoveryEntries();
    const index = createLexicalDiscoveryIndex(entries);
    const hits = await index.search('simplify decimate lower detail');
    expect(hits[0]?.id).toBe('operation:simplifyGeometry');

    const simplify = entries.find((entry) => entry.id === 'operation:simplifyGeometry')!;
    expect(simplify.kind).toBe('operation');
    if (simplify.kind !== 'operation') throw new Error('expected an operation');
    expect(simplify.contract.execution).toBe('async');
    expect(simplify.contract.example).toContain('simplifyGeometry(');
    expect(simplify.contract.example).toContain('defineLod(');

    const lod = entries.find((entry) => entry.id === 'operation:defineLod')!;
    expect(lod.limitations.join(' ')).not.toContain('Kiln simplifies no geometry');
    expect(lod.limitations.join(' ')).toContain('simplifyGeometry');
    expect(lod.related.map((related) => related.id)).toContain('operation:simplifyGeometry');
  });
});
