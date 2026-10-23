import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { renderSceneToGLB } from '../render';
import { projectUV } from '../uv-project';

test('planar projection is frame-covariant, owned, and replaces unrelated existing UVs', () => {
  const source = new THREE.PlaneGeometry(2, 3);
  const before = source.getAttribute('uv').array.slice();
  const rotated = source
    .clone()
    .rotateX(Math.PI / 2)
    .translate(3, 4, 5);
  const actual = projectUV(rotated, {
    projection: 'planar',
    frame: { origin: [3, 4, 5], rotation: [90, 0, 0] },
  });
  const expected = projectUV(source, { projection: 'planar' });
  expect(actual.getAttribute('position').array).not.toBe(rotated.getAttribute('position').array);
  for (let i = 0; i < expected.getAttribute('uv').array.length; i++)
    expect(actual.getAttribute('uv').array[i]).toBeCloseTo(
      expected.getAttribute('uv').array[i]!,
      6,
    );
  expect(source.getAttribute('uv').array).toEqual(before);
  expect(actual.index).toBeNull();
});

test('box projection gives every triangle nonzero UV area and retains material groups', () => {
  const source = new THREE.BoxGeometry(2, 3, 4);
  source.deleteAttribute('uv');
  const projected = projectUV(source, { projection: 'box' });
  expect(projected.groups).toEqual(source.groups);
  const uv = projected.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 3) {
    const area =
      (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) -
      (uv.getX(i + 2) - uv.getX(i)) * (uv.getY(i + 1) - uv.getY(i));
    expect(Math.abs(area)).toBeGreaterThan(0.1);
  }
});

test('cylindrical seam splitting avoids reverse interpolation and maps caps separately', () => {
  const source = new THREE.CylinderGeometry(1, 1, 2, 12).rotateY(0.12);
  const projected = projectUV(source, { projection: 'cylindrical', seamDegrees: 180 });
  const uv = projected.getAttribute('uv');
  const p = projected.getAttribute('position');
  let caps = 0,
    sides = 0;
  for (let i = 0; i < p.count; i += 3) {
    const y = [p.getY(i), p.getY(i + 1), p.getY(i + 2)];
    if (Math.max(...y) - Math.min(...y) < 1e-6) {
      caps++;
      const v = [uv.getY(i), uv.getY(i + 1), uv.getY(i + 2)];
      expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(0.01);
    } else {
      sides++;
      const u = [uv.getX(i), uv.getX(i + 1), uv.getX(i + 2)];
      expect(Math.max(...u) - Math.min(...u)).toBeLessThan(0.1);
    }
  }
  expect(caps).toBe(24);
  expect(sides).toBe(24);
});

test('projection preserves corner attributes and invalidates tangents explicitly', () => {
  const source = new THREE.PlaneGeometry();
  source.setAttribute(
    'color',
    new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1], 3),
  );
  source.setAttribute('tangent', new THREE.Float32BufferAttribute(new Float32Array(16).fill(1), 4));
  const projected = projectUV(source, { projection: 'planar' });
  expect(projected.getAttribute('color').count).toBe(6);
  expect(projected.hasAttribute('tangent')).toBe(false);
  expect(source.hasAttribute('tangent')).toBe(true);
  expect(projected.userData.kilnAttributeWarnings[0].code).toBe('UV_PROJECTION_TANGENTS_DROPPED');
});

test('projection rejects malformed options and geometry before mapping', () => {
  const source = new THREE.PlaneGeometry();
  expect(() => projectUV(source, { projection: 'guess' } as never)).toThrow(/projection/);
  expect(() => projectUV(source, { projection: 'planar', frame: { origin: [NaN, 0, 0] } })).toThrow(
    /frame/,
  );
  expect(() => projectUV(source, { projection: 'cylindrical', angularRange: [0, 0] })).toThrow(
    /angularRange/,
  );
  source.setIndex([0, 1, 99]);
  expect(() => projectUV(source, { projection: 'planar' })).toThrow(/index/);
});

test('non-Y cylindrical frames and explicit partial arcs preserve directional UV coverage', () => {
  const source = new THREE.CylinderGeometry(1, 1, 2, 12, 1, true, Math.PI / 3, Math.PI / 3);
  // Three cylinders use x=sin(theta), z=cos(theta): this arc spans -30..30 degrees from +X.
  const base = projectUV(source, { projection: 'cylindrical', angularRange: [-30, 60] });
  const rotated = source
    .clone()
    .rotateZ(-Math.PI / 2)
    .translate(2, 3, 4);
  const framed = projectUV(rotated, {
    projection: 'cylindrical',
    angularRange: [-30, 60],
    frame: { origin: [2, 3, 4], rotation: [0, 0, -90] },
  });
  const uv = base.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    expect(framed.getAttribute('uv').getX(i)).toBeCloseTo(uv.getX(i), 5);
    expect(framed.getAttribute('uv').getY(i)).toBeCloseTo(uv.getY(i), 5);
  }
  expect(Math.min(...Array.from({ length: uv.count }, (_, i) => uv.getX(i)))).toBeCloseTo(0, 5);
  expect(Math.max(...Array.from({ length: uv.count }, (_, i) => uv.getX(i)))).toBeCloseTo(1, 5);
});

test('full-wrap triangles exceeding a half revolution fail as ambiguous instead of smearing UVs', () => {
  const source = new THREE.BufferGeometry();
  const angles = [0, 120, 240].map((degrees) => (degrees * Math.PI) / 180);
  source.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      angles.flatMap((a, i) => [Math.cos(a), i === 1 ? 1 : 0, Math.sin(a)]),
      3,
    ),
  );
  expect(() =>
    projectUV(source, { projection: 'cylindrical', seamDegrees: 0, caps: 'side' }),
  ).toThrow(/half.*revolution/);
});

test('projection expands interleaved corner data without sharing or losing values', () => {
  const source = new THREE.BufferGeometry();
  const data = new THREE.InterleavedBuffer(
    new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1]),
    6,
  );
  source.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
  source.setAttribute('color', new THREE.InterleavedBufferAttribute(data, 3, 3));
  source.setIndex([2, 0, 1]);
  const output = projectUV(source, { projection: 'planar' });
  expect(Array.from(output.getAttribute('color').array)).toEqual([0, 0, 1, 1, 0, 0, 0, 1, 0]);
  output.getAttribute('position').setX(0, 99);
  expect(source.getAttribute('position').getX(2)).toBe(0);
});

test('projection rejects expansion budgets before cloning or sampling positions', () => {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  source.setAttribute('weights', new THREE.Float32BufferAttribute(new Float32Array(48), 16));
  const index = new THREE.Uint16BufferAttribute(new Uint16Array(3), 1);
  // A reported large index represents expansion without allocating that output in this test.
  Object.defineProperty(index, 'count', { value: 1_800_000, configurable: true });
  source.setIndex(index);
  source.toNonIndexed = () => {
    throw new Error('ALLOCATION_SENTINEL');
  };
  expect(() => projectUV(source, { projection: 'box' })).toThrow('128 MiB');
  Object.defineProperty(index, 'count', { value: 2_000_001 });
  expect(() => projectUV(source, { projection: 'box' })).toThrow('triangle corner count');
});

test('projected UVs and material face coverage survive both GLB converters', async () => {
  const previous = process.env['KILN_GLTF_EXPORTER'];
  try {
    const geometry = projectUV(new THREE.BoxGeometry(2, 3, 4), { projection: 'box' });
    const materials = Array.from(
      { length: 6 },
      (_, i) => new THREE.MeshStandardMaterial({ color: (i + 1) * 0x222222 }),
    );
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, materials));
    for (const exporter of ['legacy', 'three']) {
      process.env['KILN_GLTF_EXPORTER'] = exporter;
      const output = await renderSceneToGLB(root, { optimize: 'off', derivative: true });
      expect(output.gltfValidation.issues.numErrors).toBe(0);
      const doc = await new NodeIO().readBinary(output.bytes);
      const faces = doc
        .getRoot()
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives());
      expect(faces).toHaveLength(6);
      let triangles = 0;
      for (const face of faces) {
        const uv = face.getAttribute('TEXCOORD_0')!;
        const index = face.getIndices();
        const corners = index?.getCount() ?? uv.getCount();
        triangles += corners / 3;
        for (let t = 0; t < corners; t += 3) {
          const pairs = [0, 1, 2].map((k) =>
            uv.getElement(index ? index.getScalar(t + k) : t + k, [] as number[]),
          );
          const [a, b, c] = pairs as [number[], number[], number[]];
          expect(
            Math.abs((b[0]! - a[0]!) * (c[1]! - a[1]!) - (c[0]! - a[0]!) * (b[1]! - a[1]!)),
          ).toBeGreaterThan(0.1);
        }
      }
      expect(triangles).toBe(12);
    }
  } finally {
    if (previous === undefined) delete process.env['KILN_GLTF_EXPORTER'];
    else process.env['KILN_GLTF_EXPORTER'] = previous;
  }
});

test('metersPerUnit maps one UV unit to a fixed length from the frame origin', () => {
  const extents = (geometry: THREE.BufferGeometry) => {
    const uv = geometry.getAttribute('uv');
    const u = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const v = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    return [Math.max(...u) - Math.min(...u), Math.max(...v) - Math.min(...v)];
  };
  // Two crates of different size get the same texel density: 0.5 m per tile.
  const small = projectUV(new THREE.BoxGeometry(1, 1, 1), {
    projection: 'box',
    metersPerUnit: 0.5,
  });
  const large = projectUV(new THREE.BoxGeometry(3, 2, 3), {
    projection: 'box',
    metersPerUnit: 0.5,
  });
  expect(extents(small)).toEqual([2, 2]);
  expect(extents(large)).toEqual([6, 6]);
  // Wall pieces sharing a frame continue the same courses: U is measured from the frame origin.
  const left = projectUV(new THREE.PlaneGeometry(2, 1).translate(1, 0.5, 0), {
    projection: 'planar',
    metersPerUnit: 0.25,
  });
  const right = projectUV(new THREE.PlaneGeometry(2, 1).translate(3, 0.5, 0), {
    projection: 'planar',
    metersPerUnit: 0.25,
  });
  const u = (geometry: THREE.BufferGeometry) =>
    Array.from({ length: geometry.getAttribute('uv').count }, (_, i) =>
      geometry.getAttribute('uv').getX(i),
    );
  expect(Math.max(...u(left))).toBe(8);
  expect(Math.min(...u(right))).toBe(8);
  expect(Math.max(...u(right))).toBe(16);
  for (const metersPerUnit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => projectUV(new THREE.BoxGeometry(), { projection: 'box', metersPerUnit })).toThrow(
      'metersPerUnit',
    );
});

test('metric cylindrical projection keeps the full-wrap seam on a whole tile', () => {
  // Circumference 2*pi*0.4 = 2.513 m at 0.3 m per tile is 8.38 tiles; the wrap rounds to 8.
  const source = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 24, 1, true);
  const projected = projectUV(source, { projection: 'cylindrical', metersPerUnit: 0.3 });
  const uv = projected.getAttribute('uv');
  const p = projected.getAttribute('position');
  let seam = 0;
  for (let i = 0; i < uv.count; i++) {
    expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
    expect(uv.getX(i)).toBeLessThanOrEqual(8);
    // The default seam is the -X direction: those corners sit exactly on 0 or 8.
    if (Math.abs(p.getZ(i)) < 1e-6 && p.getX(i) < 0) {
      seam++;
      expect([0, 8]).toContain(uv.getX(i));
    }
    expect(uv.getY(i)).toBeCloseTo(p.getY(i) / 0.3, 5);
  }
  expect(seam).toBeGreaterThan(0);
  // A partial arc has no seam to close: U is the arc length at the largest radius.
  const halfShell = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 12, 1, true, Math.PI / 2, Math.PI);
  const half = projectUV(halfShell, {
    projection: 'cylindrical',
    angularRange: [180, 180],
    metersPerUnit: 0.3,
  });
  const halfU = Array.from({ length: half.getAttribute('uv').count }, (_, i) =>
    half.getAttribute('uv').getX(i),
  );
  expect(Math.max(...halfU)).toBeCloseTo((Math.PI * 0.4) / 0.3, 5);
});
