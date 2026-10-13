import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { rasterizeCamera } from '../camera';
import { coverage, rasterizeView } from '../raster';

type Projection = 'grid' | 'orthographic' | 'perspective';
const projections: Projection[] = ['grid', 'orthographic', 'perspective'];
function view(root: THREE.Object3D, projection: Projection, back = false, cull = true) {
  const z = back ? -1 : 1;
  if (projection === 'grid')
    return rasterizeView(root, [0, 0, z], { size: 64, backfaceCull: cull });
  return rasterizeCamera(
    root,
    {
      version: 'kiln.camera.v1',
      projection,
      position: [0, 0, 2 * z],
      target: [0, 0, 0],
      up: [0, 1, 0],
      aspect: 1,
      near: 0.1,
      far: 5,
      ...(projection === 'orthographic' ? { halfHeight: 0.8 } : { fovDeg: 50 }),
    },
    64,
    cull,
  );
}
function center(image: Uint8Array) {
  return [...image.subarray((32 * 64 + 32) * 3, (32 * 64 + 32) * 3 + 3)];
}

for (const projection of projections)
  for (const indexed of [true, false]) {
    test(`${projection} respects material faces and nested reflections (indexed=${indexed})`, () => {
      for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
        for (const [sx, sy, sz, parentX] of [
          [1, 1, 1, 1],
          [-1, 1, 1, 1],
          [1, -1, 1, 1],
          [-1, -1, 1, 1],
          [1, 1, -1, 1],
          [-1, 1, 1, -1],
          [1, 1, 0, 1],
        ]) {
          const root = new THREE.Group();
          root.scale.x = parentX!;
          const plane = new THREE.PlaneGeometry();
          const geometry = indexed ? plane : plane.toNonIndexed();
          // Deliberately incorrect shading normals must never decide visibility.
          const normal = geometry.getAttribute('normal');
          for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 0, -1);
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ side, color: 0xffffff }),
          );
          mesh.scale.set(sx!, sy!, sz!);
          root.add(mesh);
          for (const back of [false, true]) {
            const frontFacing = back === (sz === -1);
            const visible =
              side === THREE.DoubleSide || (side === THREE.FrontSide ? frontFacing : !frontFacing);
            const pixels = coverage(view(root, projection, back), 64);
            if (visible) expect(pixels).toBeGreaterThan(0.2);
            else expect(pixels).toBe(0);
          }
        }
      }
    });
  }

for (const projection of projections) {
  test(`${projection} lights the visible side and preserves positive-scale front lighting`, () => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    const front = center(view(mesh, projection));
    expect(front).toEqual([212, 212, 212]);
    for (const mirrored of [false, true]) {
      mesh.scale.x = mirrored ? -1 : 1;
      mesh.material.side = THREE.FrontSide;
      expect(center(view(mesh, projection))).toEqual(front);
      mesh.material.side = THREE.DoubleSide;
      expect(center(view(mesh, projection))).toEqual(front);
      const back = center(view(mesh, projection, true));
      expect(back).toEqual([137, 137, 137]);
      mesh.material.side = THREE.BackSide;
      expect(center(view(mesh, projection, true))).toEqual(back);
      mesh.material.side = THREE.FrontSide;
      expect(center(view(mesh, projection, true, false))).toEqual(back);
    }
    mesh.scale.set(0, 1, 1);
    expect(coverage(view(mesh, projection, false, false), 64)).toBe(0);
  });

  test(`${projection} resolves sidedness per material group and legacy duck doubleSided`, () => {
    const geometry = new THREE.PlaneGeometry();
    geometry.clearGroups();
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshStandardMaterial({ side: THREE.BackSide }),
    ]);
    const front = coverage(view(mesh, projection), 64);
    const back = coverage(view(mesh, projection, true), 64);
    expect(front).toBeGreaterThan(0.1);
    expect(back).toBeGreaterThan(0.1);
    expect(front).toBeCloseTo(back, 1);
    mesh.material[0]!.side = THREE.DoubleSide;
    mesh.material[1]!.side = THREE.DoubleSide;
    const both = coverage(view(mesh, projection), 64);
    const bothBack = coverage(view(mesh, projection, true), 64);
    expect(both).toBeGreaterThan(front * 1.5);
    for (const material of mesh.material) {
      material.side = THREE.FrontSide;
      Object.assign(material, { doubleSided: true });
    }
    expect(coverage(view(mesh, projection, true), 64)).toBe(bothBack);
  });

  test(`${projection} uses deformed winding with a reflected mesh root`, () => {
    const geo = new THREE.PlaneGeometry();
    const count = geo.getAttribute('position').count;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geo.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(
        Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
        4,
      ),
    );
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([bone]));
    mesh.scale.x = -1;
    expect(coverage(view(mesh, projection), 64)).toBeGreaterThan(0.2);
    bone.rotation.y = Math.PI;
    expect(coverage(view(mesh, projection), 64)).toBe(0);
    expect(coverage(view(mesh, projection, true), 64)).toBeGreaterThan(0.2);
    bone.rotation.y = 0;
    geo.morphAttributes.position = [
      new THREE.Float32BufferAttribute(
        Array.from(geo.getAttribute('position').array, (v, i) => (i % 3 === 0 ? -v : v)),
        3,
      ),
    ];
    mesh.updateMorphTargets();
    mesh.morphTargetInfluences![0] = 1;
    expect(coverage(view(mesh, projection), 64)).toBe(0);
    expect(coverage(view(mesh, projection, true), 64)).toBeGreaterThan(0.2);
  });
}
