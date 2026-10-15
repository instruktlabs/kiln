/**
 * Baked surface attributes (delivery contract item 2).
 *
 * `_EDGE` is a convex-rim weight from dihedral angles (1 on a chamfer, bevel or rim; 0 on a
 * flat face) and `_CAVITY` is exposure from a fixed hemispherical ray set (1 fully exposed;
 * toward 0 in a recess). Both are float vertex attributes in [0, 1] that both converters write
 * and the integration manifest lists with their parameters.
 */
import { describe, expect, test } from 'bun:test';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import * as THREE from 'three';
import { createGltfIO } from '../gltf-io';
import { GEOMETRY_ALLOCATION_LIMITS } from '../geometry-budget';
import { buildSandboxGlobals } from '../primitives';
import { renderGLBInProcess } from '../render';
import { bakeSurfaceAttributes, SURFACE_BAKE_DEFAULTS } from '../surface-bake';

/** Split every triangle of a non-indexed geometry into four, keeping it flat. */
function midpointSubdivide(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = source.getAttribute('position');
  const out: number[] = [];
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i);
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [v(i), v(i + 1), v(i + 2)];
    const ab = a.clone().lerp(b, 0.5);
    const bc = b.clone().lerp(c, 0.5);
    const ca = c.clone().lerp(a, 0.5);
    for (const tri of [
      [a, ab, ca],
      [ab, b, bc],
      [ca, bc, c],
      [ab, bc, ca],
    ])
      for (const point of tri) out.push(point.x, point.y, point.z);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  result.computeVertexNormals();
  return result;
}

/** A unit cube whose twelve edges are cut by 45-degree chamfers of width `c` per face. */
function chamferedBox(c = 0.1): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const a = 0.5 - c;
  for (const axis of [0, 1, 2])
    for (const s of [-0.5, 0.5])
      for (const u of [-a, a])
        for (const w of [-a, a]) {
          const point = [0, 0, 0];
          point[axis] = s;
          point[(axis + 1) % 3] = u;
          point[(axis + 2) % 3] = w;
          points.push(new THREE.Vector3(...point));
        }
  return midpointSubdivide(midpointSubdivide(new ConvexGeometry(points)));
}

const values = (mesh: THREE.Mesh, name: string) =>
  Array.from((mesh.geometry.getAttribute(name) as THREE.BufferAttribute).array as Float32Array);

describe('bakeSurfaceAttributes', () => {
  test('edge reads near 1 on chamfer vertices and near 0 on face centres', () => {
    const mesh = new THREE.Mesh(chamferedBox(), new THREE.MeshStandardMaterial());
    bakeSurfaceAttributes(mesh, { cavity: false });
    const edge = values(mesh, '_edge');
    const p = mesh.geometry.getAttribute('position');
    const chamfer: number[] = [];
    const centre = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const point = [p.getX(i), p.getY(i), p.getZ(i)].map((x) => Math.abs(x));
      const onFace = point.filter((x) => Math.abs(x - 0.5) < 1e-6).length === 1;
      const atChamferBoundary = point.filter((x) => Math.abs(x - 0.4) < 1e-6).length === 2;
      if (onFace && atChamferBoundary) chamfer.push(edge[i]!);
      if (onFace && point.filter((x) => x < 1e-6).length === 2)
        centre.set([p.getX(i), p.getY(i), p.getZ(i)].map((x) => x.toFixed(3)).join(), edge[i]!);
    }
    expect(chamfer.length).toBeGreaterThan(20);
    expect(centre.size).toBe(6);
    expect(Math.min(...chamfer)).toBeGreaterThan(0.7);
    expect(Math.max(...centre.values())).toBeLessThan(0.05);
    expect(edge.every((value) => value >= 0 && value <= 1)).toBe(true);
    // Without the smoothing step a chamfer vertex reads exactly 1.
    const sharp = new THREE.Mesh(chamferedBox(), new THREE.MeshStandardMaterial());
    bakeSurfaceAttributes(sharp, { edge: { smoothing: 0 }, cavity: false });
    expect(values(sharp, '_edge').filter((value) => value === 1).length).toBeGreaterThanOrEqual(
      chamfer.length,
    );
    expect(sharp.geometry.getAttribute('_cavity')).toBeUndefined();
  });

  test('a box inside an open-topped box bakes lower cavity than a free box', () => {
    const material = new THREE.MeshStandardMaterial();
    const free = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6, 2, 2, 2), material);
    const freeRoot = new THREE.Group();
    freeRoot.add(free);
    bakeSurfaceAttributes(freeRoot, { edge: false });

    const root = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6, 2, 2, 2), material);
    inner.position.y = 0.35;
    root.add(inner);
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      part.position.set(x, y, z);
      root.add(part);
    };
    wall(1, 0.05, 1, 0, 0.025, 0);
    wall(0.05, 1, 1, 0.5, 0.5, 0);
    wall(0.05, 1, 1, -0.5, 0.5, 0);
    wall(1, 1, 0.05, 0, 0.5, 0.5);
    wall(1, 1, 0.05, 0, 0.5, -0.5);
    bakeSurfaceAttributes(root, { edge: false });

    const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
    const freeCavity = values(free, '_cavity');
    const innerCavity = values(inner, '_cavity');
    expect(Math.min(...freeCavity)).toBe(1);
    expect(mean(innerCavity)).toBeLessThan(mean(freeCavity) - 0.2);
    expect(innerCavity.every((value) => value >= 0 && value <= 1)).toBe(true);
    // Deterministic: the same scene bakes the same bytes.
    const again = inner.clone();
    again.geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6, 2, 2, 2);
    root.add(again);
    root.remove(inner);
    bakeSurfaceAttributes(again, { edge: false, cavity: { occluders: root } });
    expect(values(again, '_cavity')).toEqual(innerCavity);
  });

  test('bakes each mesh its own geometry copy and records its parameters', () => {
    const shared = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    const a = new THREE.Mesh(shared, material);
    const b = new THREE.Mesh(shared, material);
    b.position.x = 3;
    root.add(a, b);
    bakeSurfaceAttributes(a, { edge: { thresholdDegrees: 50 }, cavity: { rays: 8 } });
    expect(a.geometry).not.toBe(shared);
    expect(b.geometry).toBe(shared);
    expect(shared.getAttribute('_edge')).toBeUndefined();
    expect(a.geometry.userData.kilnSurfaceBakeV1).toEqual({
      _EDGE: { thresholdDegrees: 50, smoothing: SURFACE_BAKE_DEFAULTS.edge.smoothing },
      _CAVITY: { rays: 8, radius: expect.any(Number) },
    });
  });

  test('rejects work beyond the geometry allocation limits', () => {
    expect(GEOMETRY_ALLOCATION_LIMITS.surfaceBakeRayDirections).toBe(256);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    expect(() => bakeSurfaceAttributes(mesh, { cavity: { rays: 257 } })).toThrow(RangeError);
    expect(() => bakeSurfaceAttributes(mesh, { edge: { thresholdDegrees: 0 } })).toThrow(
      RangeError,
    );
    expect(typeof buildSandboxGlobals().bakeSurfaceAttributes).toBe('function');
  });

  for (const gltfExporter of ['legacy', 'three'] as const)
    test(`both attributes survive export (${gltfExporter}) and the manifest lists them`, async () => {
      const result = await renderGLBInProcess(
        `const meta={name:'Baked'};
function build(){
  const root=createRoot('Root');
  const m=gameMaterial('#777777');
  createPart('Floor',boxGeo(2,0.1,2),m,{parent:root,position:[0,0.05,0]});
  createPart('Crate',boxGeo(0.5,0.5,0.5),m,{parent:root,position:[0,0.35,0]});
  bakeSurfaceAttributes(root,{edge:{thresholdDegrees:35},cavity:{rays:16}});
  return root;
}`,
        { gltfExporter },
      );
      expect(result.warnings.filter((warning) => warning.includes('_edge'))).toEqual([]);
      const doc = await createGltfIO().readBinary(new Uint8Array(result.glb));
      const primitives = doc
        .getRoot()
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives());
      expect(primitives.length).toBe(2);
      for (const primitive of primitives) {
        for (const name of ['_EDGE', '_CAVITY']) {
          const accessor = primitive.getAttribute(name)!;
          expect(accessor.getType()).toBe('SCALAR');
          expect(accessor.getComponentType()).toBe(5126);
          const array = Array.from(accessor.getArray()!);
          expect(array.every((value) => value >= 0 && value <= 1)).toBe(true);
        }
      }
      const edge = Array.from(primitives[0]!.getAttribute('_EDGE')!.getArray()!);
      expect(Math.max(...edge)).toBe(1);
      const attributes = result.integrationManifest.vertexAttributes!;
      expect(attributes.map((entry) => entry.name)).toEqual(['_EDGE', '_CAVITY']);
      expect(attributes[0]!.meshes).toEqual([
        '/Baked[0]/Root[0]/Mesh_Floor[0]',
        '/Baked[0]/Root[0]/Mesh_Crate[0]',
      ]);
      expect(attributes[0]!.params).toEqual({ thresholdDegrees: 35, smoothing: 1 });
      expect(attributes[1]!.params).toMatchObject({ rays: 16 });
      expect(result.integrationManifest.structuralQa.validatorErrors).toBe(0);
    });
});
