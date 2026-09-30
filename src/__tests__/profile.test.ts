/**
 * Bevel / extrude / revolve — the profile-solid ops.
 *
 * These assert the two properties the whole approach was chosen for:
 * **the bounding box does not move** when you bevel, and the result is a
 * closed solid that survives a boolean. Minkowski-based rounding was rejected
 * for cost and `smoothOut` for moving the bounding box, so both are pinned
 * here rather than left as prose.
 *
 * Volume is computed from the returned BufferGeometry (signed-tetrahedron
 * sum) rather than trusted from manifold, so these tests also fail if the
 * geometry bridge ever hands back an unclosed or mis-wound mesh.
 *
 * All manifold-backed ops share one WASM init; keep them in one file so that
 * cost is paid once.
 */

import { describe, it, expect } from 'bun:test';
import * as THREE from 'three';
import {
  circleProfile,
  extrudeProfile,
  revolveProfile,
  roundedBoxGeo,
  type Profile2D,
} from '../profile';
import { boolDiff } from '../solids';
import { createPart, createRoot, cylinderGeo, gameMaterial } from '../primitives';
import { buildSandboxGlobals } from '../primitives';
import { executeKilnCode, renderSceneToGLB } from '../render';

/** Signed volume via the tetrahedron sum. Works indexed or non-indexed. */
function meshVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = geo.getIndex();
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? (idx.getX(t * 3) as number) : t * 3;
    const i1 = idx ? (idx.getX(t * 3 + 1) as number) : t * 3 + 1;
    const i2 = idx ? (idx.getX(t * 3 + 2) as number) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    total += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(total);
}

function boxSize(geo: THREE.BufferGeometry): [number, number, number] {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  return [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
}

function triCount(geo: THREE.BufferGeometry): number {
  const idx = geo.getIndex();
  return Math.floor(idx ? idx.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3);
}

const UNIT_SQUARE: Profile2D = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

describe('roundedBoxGeo', () => {
  it('rounds all twelve edges without growing the box', async () => {
    const geo = await roundedBoxGeo(1, 1, 1, 0.1);
    const [w, h, d] = boxSize(geo);
    // The rejected alternatives fail exactly here: minkowskiSum grows the box
    // by 2r, and smoothOut+refine took a unit box to 1.56 across.
    expect(w).toBeCloseTo(1, 5);
    expect(h).toBeCloseTo(1, 5);
    expect(d).toBeCloseTo(1, 5);
    // Rounding removes material, so volume sits just under the sharp box.
    const vol = meshVolume(geo);
    expect(vol).toBeLessThan(1);
    expect(vol).toBeGreaterThan(0.97);
  });

  it('honours non-cubic dimensions in boxGeo argument order (w, h, d)', async () => {
    const geo = await roundedBoxGeo(2, 0.5, 1.25, 0.05);
    const [w, h, d] = boxSize(geo);
    expect(w).toBeCloseTo(2, 5);
    expect(h).toBeCloseTo(0.5, 5);
    expect(d).toBeCloseTo(1.25, 5);
  });

  it('chamfer keeps the exact size and is far cheaper than round', async () => {
    const chamfer = await roundedBoxGeo(1, 1, 1, 0.1, { style: 'chamfer' });
    const round = await roundedBoxGeo(1, 1, 1, 0.1, { style: 'round' });
    const [w, h, d] = boxSize(chamfer);
    expect(w).toBeCloseTo(1, 5);
    expect(h).toBeCloseTo(1, 5);
    expect(d).toBeCloseTo(1, 5);
    // A chamfer is one flat per edge; a fillet is an arc per edge.
    expect(triCount(chamfer)).toBeLessThan(triCount(round));
    // Flat cuts remove more material than arcs of the same nominal size.
    expect(meshVolume(chamfer)).toBeLessThan(meshVolume(round));
  });

  it('segments trades triangles for smoothness without moving the box', async () => {
    const coarse = await roundedBoxGeo(1, 1, 1, 0.1, { segments: 6 });
    const fine = await roundedBoxGeo(1, 1, 1, 0.1, { segments: 24 });
    expect(triCount(fine)).toBeGreaterThan(triCount(coarse));
    expect(boxSize(fine)[0]).toBeCloseTo(1, 5);
    expect(boxSize(coarse)[0]).toBeCloseTo(1, 5);
  });

  it('rejects a radius that leaves no box to round', async () => {
    // 0.5 on a 1-unit side is exactly half — there is no flat left.
    await expect(roundedBoxGeo(1, 1, 1, 0.5)).rejects.toThrow(
      /less than half the smallest dimension/,
    );
    await expect(roundedBoxGeo(2, 2, 0.4, 0.3)).rejects.toThrow(
      /less than half the smallest dimension/,
    );
  });

  it('rejects non-positive dimensions instead of returning an empty mesh', async () => {
    await expect(roundedBoxGeo(0, 1, 1, 0.1)).rejects.toThrow(/width must be a positive number/);
    await expect(roundedBoxGeo(1, 1, 1, 0)).rejects.toThrow(/radius must be a positive number/);
    await expect(roundedBoxGeo(1, -1, 1, 0.1)).rejects.toThrow(/height must be a positive number/);
  });
});

describe('extrudeProfile', () => {
  it('sweeps a square into a prism of exactly the right volume', async () => {
    const geo = await extrudeProfile(UNIT_SQUARE, { depth: 2 });
    expect(meshVolume(geo)).toBeCloseTo(2, 4);
    const [w, h, d] = boxSize(geo);
    // Default axis is 'y' to match cylinderGeo, so depth runs along Y.
    expect(w).toBeCloseTo(1, 5);
    expect(h).toBeCloseTo(2, 5);
    expect(d).toBeCloseTo(1, 5);
  });

  it('REGRESSION: an untapered extrude is a full prism, not a half-volume wedge', async () => {
    // manifold-3d 3.5.1 types `scaleTop` as `Vec2 | number` but misreads the
    // scalar form as `[s, 0]`: extrude(1, 1, 0, 1) returns a 20-triangle wedge
    // of volume 0.5 where a unit prism was asked for. normalizeTaper() exists
    // solely to force the Vec2 form. If it is ever "simplified" into passing
    // the scalar straight through, both of these drop to half volume.
    const plain = await extrudeProfile(UNIT_SQUARE, { depth: 1 });
    expect(meshVolume(plain)).toBeCloseTo(1, 4);

    const explicitFullTaper = await extrudeProfile(UNIT_SQUARE, { depth: 1, taper: 1 });
    expect(meshVolume(explicitFullTaper)).toBeCloseTo(1, 4);
  });

  it('bevelling does not move the bounding box', async () => {
    const sharp = await extrudeProfile(UNIT_SQUARE, { depth: 1 });
    const rounded = await extrudeProfile(UNIT_SQUARE, { depth: 1, bevel: 0.1 });
    expect(boxSize(rounded)[0]).toBeCloseTo(boxSize(sharp)[0], 4);
    expect(boxSize(rounded)[2]).toBeCloseTo(boxSize(sharp)[2], 4);
    // The bevel only removes material from the vertical edges.
    expect(meshVolume(rounded)).toBeLessThan(meshVolume(sharp));
    expect(meshVolume(rounded)).toBeGreaterThan(meshVolume(sharp) * 0.95);
  });

  it('chamfer and round are different shapes at the same nominal bevel', async () => {
    const round = await extrudeProfile(UNIT_SQUARE, { depth: 1, bevel: 0.1, bevelStyle: 'round' });
    const chamfer = await extrudeProfile(UNIT_SQUARE, {
      depth: 1,
      bevel: 0.1,
      bevelStyle: 'chamfer',
    });
    // 'Miter' would have been a no-op here — this is why the mapping is
    // round->Round, chamfer->Square. A chamfer must actually remove material.
    expect(meshVolume(chamfer)).toBeLessThan(1);
    expect(meshVolume(round)).toBeLessThan(1);
    expect(triCount(chamfer)).toBeLessThan(triCount(round));
  });

  it('rejects a bevel larger than the profile can absorb', async () => {
    // A 0.15-wide profile cannot survive eroding by 0.1.
    const thin: Profile2D = [
      [-0.075, -1],
      [0.075, -1],
      [0.075, 1],
      [-0.075, 1],
    ];
    await expect(extrudeProfile(thin, { depth: 1, bevel: 0.1 })).rejects.toThrow(
      /too large for this profile/,
    );
  });

  it('subtracts holes regardless of their winding order', async () => {
    const outer = circleProfile(1, 48);
    const hole = circleProfile(0.5, 48);
    const solid = await extrudeProfile(outer, { depth: 0.2 });
    const ccw = await extrudeProfile(outer, { depth: 0.2, holes: [hole] });
    const cw = await extrudeProfile(outer, { depth: 0.2, holes: [[...hole].reverse()] });

    const expectedRing = Math.PI * (1 - 0.25) * 0.2;
    expect(meshVolume(ccw)).toBeCloseTo(expectedRing, 2);
    // Reversed winding must give the same washer, not a filled disc. Under an
    // EvenOdd fill rule it would silently fill in.
    expect(meshVolume(cw)).toBeCloseTo(meshVolume(ccw), 4);
    expect(meshVolume(ccw)).toBeLessThan(meshVolume(solid));
  });

  it('taper 0 makes a pyramid of one third the prism volume', async () => {
    const pyramid = await extrudeProfile(UNIT_SQUARE, { depth: 1, taper: 0 });
    expect(meshVolume(pyramid)).toBeCloseTo(1 / 3, 3);
  });

  it('taper accepts an anisotropic [x, y] pair', async () => {
    const wedge = await extrudeProfile(UNIT_SQUARE, { depth: 1, taper: [1, 0] });
    // Full width at top, zero depth: a triangular prism laid on its side.
    expect(meshVolume(wedge)).toBeCloseTo(0.5, 3);
  });

  it('twist adds slices, and more slices converge on the true volume', async () => {
    const straight = await extrudeProfile(UNIT_SQUARE, { depth: 2 });
    const twisted = await extrudeProfile(UNIT_SQUARE, { depth: 2, twist: 90 });
    expect(triCount(twisted)).toBeGreaterThan(triCount(straight));

    // Every slice of a twisted prism is still a unit square, so the exact
    // solid has the same volume as the straight one. The *mesh* overshoots:
    // the lateral surface is ruled between two rotated squares, and that ruled
    // patch bulges outside both. The overshoot is a discretisation artifact
    // that shrinks as divisions rise — assert the convergence rather than
    // pretending the coarse mesh is exact.
    const exact = meshVolume(straight);
    const coarse = await extrudeProfile(UNIT_SQUARE, { depth: 2, twist: 90, divisions: 4 });
    const fine = await extrudeProfile(UNIT_SQUARE, { depth: 2, twist: 90, divisions: 64 });
    const err = (g: THREE.BufferGeometry) => Math.abs(meshVolume(g) - exact);
    expect(err(fine)).toBeLessThan(err(coarse));
    expect(err(fine)).toBeLessThan(exact * 0.01);
    // The default (16 divisions) should already be within a few percent.
    expect(err(twisted)).toBeLessThan(exact * 0.05);
  });

  it('an untwisted extrude has no intermediate ring by default', async () => {
    // Two 12-gon caps of 10 triangles each plus 12 side quads: 20 + 24.
    const slab = await extrudeProfile(circleProfile(1, 12), { depth: 0.2 });
    expect(triCount(slab)).toBe(44);
    // An explicit division still adds one ring of 12 side quads.
    const ringed = await extrudeProfile(circleProfile(1, 12), { depth: 0.2, divisions: 1 });
    expect(triCount(ringed)).toBe(68);
    // Twisting keeps its 16-slice default.
    const twisted = await extrudeProfile(circleProfile(1, 12), { depth: 0.2, twist: 30 });
    expect(triCount(twisted)).toBe(20 + 24 * 17);
  });

  it('rejects divisions that are not a whole number >= 0', async () => {
    for (const divisions of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(extrudeProfile(UNIT_SQUARE, { divisions })).rejects.toThrow(
        /divisions must be a whole number >= 0/,
      );
    }
  });

  it('sweeps along the requested axis', async () => {
    const along = async (axis: 'x' | 'y' | 'z') =>
      boxSize(await extrudeProfile(UNIT_SQUARE, { depth: 3, axis }));
    expect((await along('x'))[0]).toBeCloseTo(3, 5);
    expect((await along('y'))[1]).toBeCloseTo(3, 5);
    expect((await along('z'))[2]).toBeCloseTo(3, 5);
  });

  it('center:false starts the sweep at the origin', async () => {
    const geo = await extrudeProfile(UNIT_SQUARE, { depth: 2, axis: 'z', center: false });
    geo.computeBoundingBox();
    expect(geo.boundingBox!.min.z).toBeCloseTo(0, 5);
    expect(geo.boundingBox!.max.z).toBeCloseTo(2, 5);
  });

  it('rejects malformed profiles with a message that names the problem', async () => {
    await expect(
      extrudeProfile([
        [0, 0],
        [1, 1],
      ]),
    ).rejects.toThrow(/at least 3 points/);
    await expect(
      extrudeProfile([
        [0, 0],
        [1, 0],
        [Number.NaN, 1],
      ]),
    ).rejects.toThrow(/point 2 is not a finite/);
    await expect(extrudeProfile(UNIT_SQUARE, { depth: 0 })).rejects.toThrow(
      /depth must be a positive number/,
    );
    await expect(extrudeProfile(UNIT_SQUARE, { bevel: -1 })).rejects.toThrow(/bevel must be >= 0/);
  });
});

describe('revolveProfile', () => {
  it('revolves a rectangle into a solid cylinder of the right volume', async () => {
    const geo = await revolveProfile(
      [
        [0, -0.5],
        [0.4, -0.5],
        [0.4, 0.5],
        [0, 0.5],
      ],
      { segments: 64 },
    );
    // Discretised circle undersells the true area slightly.
    expect(meshVolume(geo)).toBeCloseTo(Math.PI * 0.16 * 1, 2);
    const [w, h, d] = boxSize(geo);
    expect(h).toBeCloseTo(1, 4); // default axis 'y', matching lathe
    expect(w).toBeCloseTo(0.8, 2);
    expect(d).toBeCloseTo(0.8, 2);
  });

  it('bevel rounds the rim without growing the silhouette', async () => {
    const profile: Profile2D = [
      [0, -0.5],
      [0.4, -0.5],
      [0.4, 0.5],
      [0, 0.5],
    ];
    const sharp = await revolveProfile(profile, { segments: 64 });
    const rounded = await revolveProfile(profile, { segments: 64, bevel: 0.08 });
    expect(boxSize(rounded)[1]).toBeCloseTo(boxSize(sharp)[1], 3);
    expect(meshVolume(rounded)).toBeLessThan(meshVolume(sharp));
  });

  it('a partial sweep produces less volume than a full revolution', async () => {
    const profile: Profile2D = [
      [0.2, 0],
      [0.5, 0],
      [0.5, 1],
      [0.2, 1],
    ];
    const full = await revolveProfile(profile, { segments: 64 });
    const half = await revolveProfile(profile, { segments: 64, angle: 180 });
    expect(meshVolume(half)).toBeCloseTo(meshVolume(full) / 2, 2);
  });

  it('rejects an out-of-range sweep angle', async () => {
    const p: Profile2D = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    await expect(revolveProfile(p, { angle: 0 })).rejects.toThrow(/angle must be in \(0, 360\]/);
    await expect(revolveProfile(p, { angle: 540 })).rejects.toThrow(/angle must be in \(0, 360\]/);
  });
});

describe('circleProfile', () => {
  it('builds a closed outline of the requested radius and segment count', () => {
    const pts = circleProfile(2, 16);
    expect(pts).toHaveLength(16);
    for (const [x, y] of pts) {
      expect(Math.hypot(x, y)).toBeCloseTo(2, 6);
    }
    // Closed by construction — the last point must not duplicate the first.
    expect(pts[0]).not.toEqual(pts[pts.length - 1]!);
  });

  it('offsets around an explicit center', () => {
    const pts = circleProfile(1, 8, [5, -3]);
    for (const [x, y] of pts) {
      expect(Math.hypot(x - 5, y + 3)).toBeCloseTo(1, 6);
    }
  });

  it('rejects degenerate inputs', () => {
    expect(() => circleProfile(0)).toThrow(/radius must be a positive number/);
    expect(() => circleProfile(1, 2)).toThrow(/segments must be an integer >= 3/);
  });
});

describe('interop', () => {
  it('an extruded profile survives a boolean and exports to GLB', async () => {
    const root = createRoot('Washer');
    const plate = await extrudeProfile(circleProfile(1, 48), { depth: 0.3, bevel: 0.05 });
    const body = createPart('Plate', plate, gameMaterial(0x8899aa), { parent: root });
    const drill = new THREE.Mesh(cylinderGeo(0.3, 0.3, 2, 24), gameMaterial(0x000000));
    const pierced = await boolDiff('Pierced', body, drill);

    expect(triCount(pierced.geometry)).toBeGreaterThan(0);
    expect(meshVolume(pierced.geometry)).toBeLessThan(meshVolume(plate));

    const out = createRoot('WasherOut');
    out.add(pierced);
    const { bytes } = await renderSceneToGLB(out);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('agent-authored code can use every new op through executeKilnCode', async () => {
    // The real authoring path. Importing the functions proves they work;
    // this proves the *agent* can reach them — registration, the async
    // build() contract, and interop with createPart/boolDiff all at once.
    const code = `
const meta = { name: 'Bracket', category: 'prop' };

async function build() {
  const root = createRoot('Bracket');
  const steel = gameMaterial(0x9aa4b0, { metalness: 0.6, roughness: 0.4 });

  const plate = await roundedBoxGeo(1.2, 0.15, 0.8, 0.04);
  createPart('Plate', plate, steel, { position: [0, 0, 0], parent: root });

  const rib = await extrudeProfile(
    [[0, 0], [0.6, 0], [0.6, 0.12], [0.12, 0.12], [0.12, 0.6], [0, 0.6]],
    { depth: 0.2, bevel: 0.02, axis: 'z' },
  );
  createPart('Rib', rib, steel, { position: [0, 0.1, 0], parent: root });

  const boss = await revolveProfile(
    [[0, 0], [0.12, 0], [0.12, 0.3], [0, 0.3]],
    { segments: 24, bevel: 0.03 },
  );
  const bossPart = createPart('Boss', boss, steel, {});
  const bore = createPart('Bore', cylinderGeo(0.05, 0.05, 1, 16), steel, {});
  root.add(await boolDiff('Boss', bossPart, bore));

  const washer = await extrudeProfile(circleProfile(0.3, 32), {
    depth: 0.06,
    holes: [circleProfile(0.12, 24)],
    bevel: 0.015,
    bevelStyle: 'chamfer',
  });
  createPart('Washer', washer, steel, { position: [0.5, 0.4, 0], parent: root });

  return root;
}
`;
    const { root } = await executeKilnCode(code);
    expect(root.name).toBe('Bracket');
    // createPart / boolDiff both prefix the mesh name with `Mesh_`.
    const names = new Set<string>();
    root.traverse((c) => names.add(c.name));
    expect(names.has('Mesh_Plate')).toBe(true);
    expect(names.has('Mesh_Rib')).toBe(true);
    expect(names.has('Mesh_Boss')).toBe(true);
    expect(names.has('Mesh_Washer')).toBe(true);

    const { bytes, tris } = await renderSceneToGLB(root);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(tris).toBeGreaterThan(0);
  });

  it('the sandbox exposes all four ops as globals', () => {
    const globals = buildSandboxGlobals();
    for (const name of ['roundedBoxGeo', 'extrudeProfile', 'revolveProfile', 'circleProfile']) {
      expect(typeof globals[name]).toBe('function');
    }
  });

  it('usage tracking counts the new ops like any other primitive', async () => {
    const usage: Record<string, number> = {};
    const globals = buildSandboxGlobals(usage);
    const rounded = globals['roundedBoxGeo'] as typeof roundedBoxGeo;
    await rounded(1, 1, 1, 0.1);
    expect(usage['roundedBoxGeo']).toBe(1);
  });
});
