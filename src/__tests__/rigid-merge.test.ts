/**
 * Rigid-group merge (`src/rigid-merge.ts`), the draw-call step proposed for `optimize: 'full'`.
 *
 * Fixtures are small Documents named like Kiln exports (`Mesh_*` parts, `Joint_*` pivots). Every
 * merge is checked against what draws: per-material triangle count, area, centroid, signed volume
 * and winding agreement in world space, exact drawn bounds, and per-vertex world frames.
 */
import { describe, expect, test } from 'bun:test';
import {
  Document,
  type Material,
  type Node,
  Primitive,
  type Scene,
  type TypedArray,
} from '@gltf-transform/core';
import {
  EXTMeshGPUInstancing,
  KHRMaterialsTransmission,
  KHRMaterialsVariants,
  KHRMaterialsVolume,
  KHRNodeVisibility,
} from '@gltf-transform/extensions';
import * as THREE from 'three';
import { KILN_SEMANTIC_EXTRAS_KEY } from '../contracts/semantic';
import { createGltfIO, MSFT_LOD, MSFTLod } from '../gltf-io';
import { collectGlbMetrics } from '../metrics';
import { drawnSceneBounds } from '../node-visibility';
import {
  boxGeo,
  createPart,
  createPivot,
  createRoot,
  gameMaterial,
  glassMaterial,
} from '../primitives';
import { renderSceneToGLB } from '../render';
import { mergeRigidGroups, type RigidMergeSummary, rigidMerge } from '../rigid-merge';

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

interface PartOptions {
  t?: Vec3;
  r?: Quat;
  s?: Vec3;
  size?: Vec3;
  tangents?: boolean;
  indexed?: boolean;
}

/** Box faces as (normal, u, v) with u x v = normal, so (0,1,2)(0,2,3) winds outward. */
const FACES: [Vec3, Vec3, Vec3][] = [
  [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [-1, 0, 0],
    [0, 1, 0],
  ],
];

const quat = (axis: Vec3, angle: number): Quat =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle).toArray() as Quat;

function fixture() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const accessor = (type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4', array: TypedArray) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const box = (material: Material | null, o: PartOptions = {}): Primitive => {
    const size = o.size ?? [1, 1, 1];
    const pos: number[] = [];
    const nrm: number[] = [];
    const tan: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const [n, u, v] of FACES) {
      const base = pos.length / 3;
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        for (let k = 0; k < 3; k++) pos.push(((n[k]! + a * u[k]! + b * v[k]!) * size[k]!) / 2);
        nrm.push(...n);
        tan.push(...u, 1);
        uv.push((a + 1) / 2, (b + 1) / 2);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const indexed = o.indexed ?? true;
    const flat = (values: number[], width: number) =>
      indexed ? values : idx.flatMap((i) => values.slice(i * width, i * width + width));
    const prim = doc
      .createPrimitive()
      .setMaterial(material)
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(flat(pos, 3))))
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array(flat(nrm, 3))))
      .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(flat(uv, 2))));
    if (o.tangents ?? true)
      prim.setAttribute('TANGENT', accessor('VEC4', new Float32Array(flat(tan, 4))));
    if (indexed) prim.setIndices(accessor('SCALAR', new Uint16Array(idx)));
    return prim;
  };
  const node = (name: string, parent: Node | Scene, o: PartOptions = {}): Node => {
    const created = doc.createNode(name);
    if (o.t) created.setTranslation(o.t);
    if (o.r) created.setRotation(o.r);
    if (o.s) created.setScale(o.s);
    parent.addChild(created);
    return created;
  };
  const part = (
    name: string,
    material: Material | null,
    parent: Node | Scene,
    o: PartOptions = {},
  ) => node(name, parent, o).setMesh(doc.createMesh(name).addPrimitive(box(material, o)));
  const material = (name: string) => doc.createMaterial(name);
  return { doc, scene, accessor, box, node, part, material };
}

/** Fourteen static parts over nine materials and a two-part door on `Joint_FrontDoor`. */
function farmhouseLike() {
  const f = fixture();
  const m = Object.fromEntries(
    ['masonry', 'stone', 'trim', 'glass', 'flue', 'wood', 'roof', 'shutter', 'iron', 'door'].map(
      (name) => [name, f.material(name)],
    ),
  ) as Record<string, Material>;
  m['glass']!.setAlphaMode('BLEND');
  const root = f.node('Farmhouse', f.scene);
  const shell = f.node('Shell', root);
  const roof = f.node('Roof', root, { t: [0, 3, 0], r: quat([0, 0, 1], 0.2), s: [1.5, 0.5, 1] });
  const porch = f.node('Porch', root, { t: [0, 0, 4], r: quat([0, 1, 0], Math.PI / 2) });
  const steps = f.node('Steps', root, { t: [2, 0, 5] });
  const shutters = f.node('Shutters', root);
  const door = f.node('Door', root, { t: [1, 0, 2] });
  let x = 0;
  const part = (name: string, material: string, parent: Node) => {
    x += 1.25;
    return f.part(name, m[material]!, parent, { t: [x, 0.5, 0] });
  };
  part('Mesh_ShellMasonry', 'masonry', shell);
  part('Mesh_ShellStone', 'stone', shell);
  part('Mesh_ShellTrim', 'trim', shell);
  part('Mesh_ShellGlass', 'glass', shell);
  part('Mesh_ChimneyFlue', 'flue', shell);
  part('Mesh_InteriorCeiling', 'trim', shell);
  part('Mesh_InteriorFloor', 'wood', shell);
  part('Mesh_RoofShingles', 'roof', roof);
  part('Mesh_PorchTimber', 'wood', porch);
  part('Mesh_PorchPlinth', 'stone', porch);
  part('Mesh_PorchRoof', 'roof', porch);
  part('Mesh_StepTreads', 'wood', steps);
  part('Mesh_ShutterPanels', 'shutter', shutters);
  part('Mesh_ShutterHinges', 'iron', shutters);
  const hinge = f.node('Joint_FrontDoor', door, { t: [2.8, 0.4, -0.49], r: quat([0, 1, 0], 0.3) });
  f.part('Mesh_DoorLeaf', m['door']!, hinge, { t: [0.45, 1, 0], size: [0.9, 2, 0.08] });
  f.part('Mesh_DoorHardware', m['iron']!, hinge, { t: [0.8, 1, 0.05], size: [0.1, 0.1, 0.1] });
  return { ...f, hinge };
}

function sceneNodes(doc: Document): Node[] {
  const out: Node[] = [];
  for (const scene of doc.getRoot().listScenes())
    for (const child of scene.listChildren()) child.traverse((node) => out.push(node));
  return out;
}

const named = (doc: Document, name: string): Node =>
  doc
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === name)!;
const nodeNames = (doc: Document) =>
  doc
    .getRoot()
    .listNodes()
    .map((node) => node.getName())
    .sort();
const subtreePrims = (node: Node): Primitive[] => {
  const out: Primitive[] = [];
  node.traverse((n) => out.push(...(n.getMesh()?.listPrimitives() ?? [])));
  return out;
};
const ownTriangles = (node: Node): number =>
  (node.getMesh()?.listPrimitives() ?? []).reduce((sum, p) => sum + triangles(p).length, 0);

function triangles(prim: Primitive): [number, number, number][] {
  const indices = prim.getIndices();
  const count = indices?.getCount() ?? prim.getAttribute('POSITION')!.getCount();
  const at = (i: number) => indices?.getScalar(i) ?? i;
  const out: [number, number, number][] = [];
  for (let i = 0; i + 2 < count; i += 3) out.push([at(i), at(i + 1), at(i + 2)]);
  return out;
}

/** Per material: [triangles, area, area-weighted centroid xyz, signed volume, winding agreement]. */
function fingerprint(doc: Document): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const node of sceneNodes(doc)) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    const facing = Math.sign(world.determinant());
    for (const prim of mesh.listPrimitives()) {
      const key = prim.getMaterial()?.getName() ?? '(none)';
      const acc = out.get(key) ?? [0, 0, 0, 0, 0, 0, 0];
      const position = prim.getAttribute('POSITION')!;
      const normal = prim.getAttribute('NORMAL');
      const p = (i: number) =>
        new THREE.Vector3().fromArray(position.getElement(i, [])).applyMatrix4(world);
      for (const [a, b, c] of triangles(prim)) {
        const [pa, pb, pc] = [p(a), p(b), p(c)];
        const face = pb.clone().sub(pa).cross(pc.clone().sub(pa)).multiplyScalar(facing);
        const area = face.length() / 2;
        const centroid = pa.clone().add(pb).add(pc).divideScalar(3);
        acc[0]! += 1;
        acc[1]! += area;
        acc[2]! += centroid.x * area;
        acc[3]! += centroid.y * area;
        acc[4]! += centroid.z * area;
        acc[5]! += (facing * pa.dot(pb.clone().cross(pc))) / 6;
        if (normal) {
          const shading = new THREE.Vector3()
            .fromArray(normal.getElement(a, []))
            .applyMatrix3(normalMatrix);
          acc[6]! += Math.sign(face.dot(shading));
        }
      }
      out.set(key, acc);
    }
  }
  return out;
}

/** Float32 baking moves sums by a few ulps; a wrong transform moves them by whole units. */
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a));

function expectSameFingerprint(before: Map<string, number[]>, after: Map<string, number[]>) {
  expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
  const differences = [...before].flatMap(([key, values]) =>
    values.flatMap((value, i) => {
      const moved = after.get(key)![i]!;
      return close(value, moved) ? [] : [`${key}[${i}] ${value} -> ${moved}`];
    }),
  );
  expect(differences).toEqual([]);
}

function expectSameBounds(before: Document, after: Document) {
  const a = drawnSceneBounds(before.getRoot().listScenes()[0]!);
  const b = drawnSceneBounds(after.getRoot().listScenes()[0]!);
  const extent = Math.max(1, ...a.max.map((v, i) => v - a.min[i]!));
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(b.min[i]! - a.min[i]!)).toBeLessThanOrEqual(1e-6 * extent);
    expect(Math.abs(b.max[i]! - a.max[i]!)).toBeLessThanOrEqual(1e-6 * extent);
  }
}

interface Frame {
  p: THREE.Vector3;
  n: THREE.Vector3;
  t: THREE.Vector3;
  three: THREE.Vector3;
  corrected: THREE.Vector3;
}

/**
 * Every vertex's world position, normal and tangent, with the bitangent as two renderer
 * families build it: three r186 uses cross(N, T) * w (normal_vertex.glsl.js:9); a renderer that
 * corrects mirrored transforms also multiplies by sign(det(world)).
 */
function frames(doc: Document): Frame[] {
  const out: Frame[] = [];
  for (const node of sceneNodes(doc)) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const linear = new THREE.Matrix3().setFromMatrix4(world);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    const det = Math.sign(world.determinant());
    for (const prim of mesh.listPrimitives()) {
      const [pos, nrm, tan] = (['POSITION', 'NORMAL', 'TANGENT'] as const).map(
        (s) => prim.getAttribute(s)!,
      );
      for (let i = 0; i < pos!.getCount(); i++) {
        const p = new THREE.Vector3().fromArray(pos!.getElement(i, [])).applyMatrix4(world);
        const n = new THREE.Vector3().fromArray(nrm!.getElement(i, [])).applyMatrix3(normalMatrix);
        const t4 = tan!.getElement(i, []);
        const t = new THREE.Vector3().fromArray(t4).applyMatrix3(linear).normalize();
        n.normalize();
        const three = n.clone().cross(t).multiplyScalar(t4[3]!);
        out.push({ p, n, t, three, corrected: three.clone().multiplyScalar(det) });
      }
    }
  }
  return out;
}

/** Pairs each vertex with the one at the same world position and normal; counts differences. */
function compareFrames(before: Frame[], after: Frame[]) {
  const near = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceTo(b) < 1e-5;
  const result = { unmatched: 0, tangent: 0, three: 0, corrected: 0 };
  if (after.length !== before.length) result.unmatched += Math.abs(after.length - before.length);
  for (const a of before) {
    const b = after.find((f) => near(f.p, a.p) && near(f.n, a.n));
    if (!b) result.unmatched += 1;
    else {
      if (!near(a.t, b.t)) result.tangent += 1;
      if (!near(a.three, b.three)) result.three += 1;
      if (!near(a.corrected, b.corrected)) result.corrected += 1;
    }
  }
  return result;
}

describe('mergeRigidGroups: farmhouse-shaped asset', () => {
  test('keeps Joint_FrontDoor with its own two primitives and merges by material elsewhere', () => {
    const { doc, hinge } = farmhouseLike();
    const before = fingerprint(doc);
    const reference = farmhouseLike().doc;
    const metricsBefore = collectGlbMetrics(doc);
    const doorPrims = subtreePrims(hinge);
    const names = nodeNames(doc);

    const summary = mergeRigidGroups(doc);

    expect(metricsBefore.drawCalls).toBe(16);
    expect(summary.primitivesBefore).toBe(16);
    // 14 static parts over 9 materials (the one BLEND glass stays alone) + 2 door parts.
    expect(summary.primitivesAfter).toBe(11);
    const metricsAfter = collectGlbMetrics(doc);
    expect(metricsAfter.drawCalls).toBeLessThanOrEqual(11);
    expect(metricsAfter.triangles).toBe(metricsBefore.triangles);
    expect(summary.boundaries).toEqual([{ node: 'Joint_FrontDoor', reasons: ['joint-pivot'] }]);

    const joint = named(doc, 'Joint_FrontDoor');
    expect(joint).toBe(hinge);
    expect(subtreePrims(joint)).toEqual(doorPrims);
    expect(
      subtreePrims(joint)
        .map((p) => p.getMaterial()!.getName())
        .sort(),
    ).toEqual(['door', 'iron']);
    expect(nodeNames(doc)).toEqual(names);
    expectSameFingerprint(before, fingerprint(doc));
    expectSameBounds(reference, doc);

    // The pivot still swings its own geometry, and only that.
    hinge.setRotation(quat([0, 1, 0], -1.2));
    named(reference, 'Joint_FrontDoor').setRotation(quat([0, 1, 0], -1.2));
    expectSameFingerprint(fingerprint(reference), fingerprint(doc));
  });

  test('a Kiln export of the same shape merges the same way', async () => {
    const root = createRoot('Farmhouse');
    const mats = {
      masonry: gameMaterial(0xe8dcc0),
      stone: gameMaterial(0x8a8478),
      trim: gameMaterial(0xf2ead8),
      glass: glassMaterial(0x88aacc, { opacity: 0.35 }),
      flue: gameMaterial(0x222222),
      wood: gameMaterial(0xb08040),
      roof: gameMaterial(0x3a3a40),
      shutter: gameMaterial(0x6b7a3a),
      iron: gameMaterial(0x303030, { metalness: 0.8 }),
      door: gameMaterial(0x9a2a20),
    };
    const group = (name: string) => {
      const g = new THREE.Object3D();
      g.name = name;
      root.add(g);
      return g;
    };
    const [shell, roof, porch, steps, shutters, doorGroup] = [
      'Shell',
      'Roof',
      'Porch',
      'Steps',
      'Shutters',
      'Door',
    ].map(group) as THREE.Object3D[];
    let x = 0;
    const part = (name: string, mat: THREE.Material, parent: THREE.Object3D) => {
      x += 1.25;
      return createPart(name, boxGeo(1, 1, 1), mat, { position: [x, 0.5, 0], parent });
    };
    part('ShellMasonry', mats.masonry, shell!);
    part('ShellStone', mats.stone, shell!);
    part('ShellTrim', mats.trim, shell!);
    part('ShellGlass', mats.glass, shell!);
    part('ChimneyFlue', mats.flue, shell!);
    part('InteriorCeiling', mats.trim, shell!);
    part('InteriorFloor', mats.wood, shell!);
    part('RoofShingles', mats.roof, roof!);
    part('PorchTimber', mats.wood, porch!);
    part('PorchPlinth', mats.stone, porch!);
    part('PorchRoof', mats.roof, porch!);
    part('StepTreads', mats.wood, steps!);
    part('ShutterPanels', mats.shutter, shutters!);
    part('ShutterHinges', mats.iron, shutters!);
    const hinge = createPivot('FrontDoor', [2.8, 0.4, -0.49], doorGroup!);
    hinge.rotation.y = 0.3;
    createPart('DoorLeaf', boxGeo(0.9, 2, 0.08), mats.door, {
      position: [0.45, 1, 0],
      parent: hinge,
    });
    createPart('DoorHardware', boxGeo(0.1, 0.1, 0.1), mats.iron, {
      position: [0.8, 1, 0.05],
      parent: hinge,
    });
    const { bytes } = await renderSceneToGLB(root, { optimize: 'off' });
    const doc = await createGltfIO().readBinary(bytes);
    const reference = await createGltfIO().readBinary(bytes);
    const before = collectGlbMetrics(doc);

    const summary = mergeRigidGroups(doc);

    expect(before.drawCalls).toBe(16);
    expect(collectGlbMetrics(doc).drawCalls).toBe(11);
    expect(collectGlbMetrics(doc).triangles).toBe(before.triangles);
    expect(subtreePrims(named(doc, 'Joint_FrontDoor'))).toHaveLength(2);
    expect(summary.boundaries.map((b) => b.node)).toContain('Joint_FrontDoor');
    expect(nodeNames(doc)).toEqual(nodeNames(reference));
    expectSameFingerprint(fingerprint(reference), fingerprint(doc));
    expectSameBounds(reference, doc);
    // The merged document still writes and reads back.
    const written = await createGltfIO().writeBinary(doc);
    expect(collectGlbMetrics(await createGltfIO().readBinary(written)).drawCalls).toBe(11);
  });
});

describe('mergeRigidGroups: tangents', () => {
  function tangentParts() {
    const f = fixture();
    const m = f.material('Painted');
    f.part('Mesh_A', m, f.scene);
    f.part('Mesh_RotY', m, f.scene, { t: [3, 0, 0], r: quat([0, 1, 0], Math.PI / 2) });
    f.part('Mesh_Skewed', m, f.scene, {
      t: [0, 3, 0],
      r: quat([0, 0, 1], Math.PI / 6),
      s: [2, 1, 1],
    });
    // A rotated child of a non-uniformly scaled parent is sheared in world space: its normals
    // need the inverse transpose, not the 3x3 itself.
    const squash = f.node('Squash', f.scene, { t: [0, -4, 0], s: [1, 3, 1] });
    f.part('Mesh_Sheared', m, squash, { r: quat([0, 0, 1], Math.PI / 4) });
    f.part('Mesh_MirrorX', m, f.scene, { t: [6, 0, 0], s: [-1, 1, 1] });
    f.part('Mesh_MirrorZ', m, f.scene, { t: [9, 0, 0], r: quat([1, 0, 0], 0.4), s: [1, 1, -1] });
    return f;
  }

  test('rotated and mirrored tangent-bearing parts keep their world frames for every renderer', () => {
    const { doc } = tangentParts();
    const before = frames(doc);
    const shape = fingerprint(doc);

    const summary = mergeRigidGroups(doc);

    // Tangent-bearing parts join only within one world handedness: {A, RotY, Skewed, Sheared} and
    // {MirrorX, MirrorZ}, so neither renderer convention sees a changed bitangent.
    expect(summary.primitivesAfter).toBe(2);
    expect(compareFrames(before, frames(doc))).toEqual({
      unmatched: 0,
      tangent: 0,
      three: 0,
      corrected: 0,
    });
    expectSameFingerprint(shape, fingerprint(doc));
    expect(named(doc, 'Mesh_RotY').getMesh()).toBeNull();
    expect(named(doc, 'Mesh_MirrorZ').getMesh()).toBeNull();
  });

  test('mergeMirroredTangents joins across handedness with w *= sign(det)', () => {
    const { doc } = tangentParts();
    const before = frames(doc);
    const shape = fingerprint(doc);

    const summary = mergeRigidGroups(doc, { mergeMirroredTangents: true });

    expect(summary.primitivesAfter).toBe(1);
    expectSameFingerprint(shape, fingerprint(doc));
    // A renderer that applies the world determinant sees the same frame everywhere, while
    // three r186, which does not, sees both mirrored parts' bitangents flip (2 x 24 vertices).
    expect(compareFrames(before, frames(doc))).toEqual({
      unmatched: 0,
      tangent: 0,
      three: 48,
      corrected: 0,
    });
  });

  test('mirrored parts without tangents join with flipped winding and normals intact', () => {
    const f = fixture();
    const m = f.material('Plain');
    f.part('Mesh_Left', m, f.scene, { tangents: false, indexed: false });
    f.part('Mesh_Right', m, f.scene, {
      t: [4, 0, 0],
      s: [-1, 1, 1],
      tangents: false,
      indexed: false,
    });
    f.part('Mesh_Flipped', m, f.scene, { t: [0, 4, 0], s: [1, -2, 1], tangents: false });
    f.part('Mesh_Indexed', m, f.scene, { t: [0, 0, 4], tangents: false });
    const shape = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    // Indexed and unindexed layouts cannot join each other.
    expect(summary.primitivesAfter).toBe(2);
    const after = fingerprint(f.doc);
    expectSameFingerprint(shape, after);
    expect(after.get('Plain')![6]).toBe(after.get('Plain')![0]!);
  });
});

describe('mergeRigidGroups: boundaries and locks', () => {
  test('BLEND and transmissive parts stay separate draws; volume never merges', () => {
    const f = fixture();
    const glass = f.material('Glass').setAlphaMode('BLEND');
    const water = f.material('Water');
    water.setExtension(
      'KHR_materials_transmission',
      f.doc.createExtension(KHRMaterialsTransmission).createTransmission().setTransmissionFactor(1),
    );
    const ice = f.material('Ice');
    ice.setExtension(
      'KHR_materials_volume',
      f.doc.createExtension(KHRMaterialsVolume).createVolume().setThicknessFactor(0.5),
    );
    const paint = f.material('Paint');
    f.part('Mesh_Glass1', glass, f.scene);
    f.part('Mesh_Glass2', glass, f.scene, { t: [2, 0, 0] });
    f.part('Mesh_Water1', water, f.scene, { t: [4, 0, 0] });
    f.part('Mesh_Water2', water, f.scene, { t: [6, 0, 0] });
    f.part('Mesh_Ice1', ice, f.scene, { t: [8, 0, 0] });
    f.part('Mesh_Ice2', ice, f.scene, { t: [10, 0, 0] });
    f.part('Mesh_Paint1', paint, f.scene, { t: [12, 0, 0] });
    f.part('Mesh_Paint2', paint, f.scene, { t: [14, 0, 0] });

    const summary = mergeRigidGroups(f.doc);

    expect(summary.primitivesAfter).toBe(7);
    expect(summary.locked).toEqual(
      expect.arrayContaining([
        { node: 'Mesh_Glass1', reason: 'transparent', primitives: 1 },
        { node: 'Mesh_Glass2', reason: 'transparent', primitives: 1 },
        { node: 'Mesh_Water1', reason: 'transparent', primitives: 1 },
        { node: 'Mesh_Ice1', reason: 'volume', primitives: 1 },
      ]),
    );
    for (const name of ['Mesh_Glass1', 'Mesh_Glass2', 'Mesh_Water1', 'Mesh_Water2'])
      expect(ownTriangles(named(f.doc, name))).toBe(12);

    const opted = fixture();
    const g = opted.material('Glass').setAlphaMode('BLEND');
    opted.part('Mesh_Glass1', g, opted.scene);
    opted.part('Mesh_Glass2', g, opted.scene, { t: [2, 0, 0] });
    expect(mergeRigidGroups(opted.doc, { mergeTransparent: true }).primitivesAfter).toBe(1);
  });

  test('every boundary keeps its own primitives and every lock is reported', () => {
    const f = fixture();
    const m = f.material('M');
    const own = new Map<string, Primitive>();
    const add = (name: string, o: PartOptions = {}) => {
      const node = f.part(name, m, f.scene, { t: [own.size * 2, 0, 0], ...o });
      own.set(name, node.getMesh()!.listPrimitives()[0]!);
      return node;
    };
    add('Mesh_A');
    add('Mesh_B');
    const wheel = add('Mesh_Wheel');
    const sampler = f.doc
      .createAnimationSampler()
      .setInput(f.accessor('SCALAR', new Float32Array([0, 1])))
      .setOutput(f.accessor('VEC4', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1])));
    f.doc
      .createAnimation('Spin')
      .addSampler(sampler)
      .addChannel(
        f.doc
          .createAnimationChannel()
          .setSampler(sampler)
          .setTargetNode(wheel)
          .setTargetPath('rotation'),
      );
    add('Mesh_Tagged').setExtras({ note: 'kept' });
    add('Mesh_Hidden').setExtension(
      'KHR_node_visibility',
      f.doc.createExtension(KHRNodeVisibility).createVisibility().setVisible(false),
    );
    const level = f.doc.createNode('Mesh_Lod1');
    add('Mesh_Lod0').setExtension(
      MSFT_LOD,
      f.doc.createExtension(MSFTLod).createLod().addLevel(level),
    );
    const bone = f.node('Bone', f.scene, { t: [0, 5, 0] });
    add('Mesh_Skinned').setSkin(f.doc.createSkin('Skin').addJoint(bone));
    add('Mesh_Batch').setExtension(
      'EXT_mesh_gpu_instancing',
      f.doc
        .createExtension(EXTMeshGPUInstancing)
        .createInstancedMesh()
        .setAttribute('TRANSLATION', f.accessor('VEC3', new Float32Array([0, 0, 0, 0, 1, 0]))),
    );
    const morph = add('Mesh_Morph');
    morph
      .getMesh()!
      .listPrimitives()[0]!
      .addTarget(
        f.doc
          .createPrimitiveTarget()
          .setAttribute('POSITION', f.accessor('VEC3', new Float32Array(24 * 3))),
      );
    add('Mesh_Strip').getMesh()!.listPrimitives()[0]!.setMode(Primitive.Mode.TRIANGLE_STRIP!);
    add('Mesh_PrimExtras').getMesh()!.listPrimitives()[0]!.setExtras({ id: 1 });
    const variants = f.doc.createExtension(KHRMaterialsVariants);
    add('Mesh_Variant')
      .getMesh()!
      .listPrimitives()[0]!
      .setExtension(
        'KHR_materials_variants',
        variants
          .createMappingList()
          .addMapping(
            variants.createMapping().setMaterial(m).addVariant(variants.createVariant('Alt')),
          ),
      );
    add('Mesh_MeshExtras').getMesh()!.setExtras({ lod: 'kept' });
    add('Mesh_Flat', { s: [1, 0, 1] });
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.primitivesAfter).toBe(summary.primitivesBefore - 1);
    expect(named(f.doc, 'Mesh_B').getMesh()).toBeNull();
    for (const [name, prim] of own)
      if (name !== 'Mesh_A' && name !== 'Mesh_B')
        expect(named(f.doc, name).getMesh()!.listPrimitives()).toEqual([prim]);
    expectSameFingerprint(before, fingerprint(f.doc));
    const reasons = Object.fromEntries(summary.boundaries.map((b) => [b.node, b.reasons]));
    expect(reasons).toEqual({
      Mesh_Wheel: ['animated'],
      Bone: ['skin-joint'],
      Mesh_Tagged: ['extras'],
      Mesh_Hidden: ['visibility'],
      Mesh_Lod0: ['lod'],
    });
    const locks = Object.fromEntries(summary.locked.map((l) => [l.node, l.reason]));
    expect(locks).toEqual({
      Mesh_Wheel: 'boundary',
      Mesh_Tagged: 'boundary',
      Mesh_Hidden: 'boundary',
      Mesh_Lod0: 'boundary',
      Mesh_Skinned: 'skinned',
      Mesh_Batch: 'instanced',
      Mesh_Morph: 'morph-targets',
      Mesh_Strip: 'primitive-mode',
      Mesh_PrimExtras: 'primitive-extras',
      Mesh_Variant: 'primitive-extensions',
      Mesh_MeshExtras: 'mesh-extras',
      Mesh_Flat: 'singular-matrix',
    });
  });

  test('children of a boundary merge among themselves, never with the parent group', () => {
    const f = fixture();
    const m = f.material('M');
    f.part('Mesh_Base', m, f.scene);
    const pivot = f.node('Joint_Lid', f.scene, { t: [0, 2, 0], r: quat([1, 0, 0], 0.5) });
    f.part('Mesh_LidA', m, pivot);
    f.part('Mesh_LidB', m, pivot, { t: [1.5, 0, 0] });
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.groups).toBe(2);
    expect(summary.primitivesAfter).toBe(2);
    expect(subtreePrims(pivot)).toHaveLength(1);
    expect(triangles(subtreePrims(pivot)[0]!)).toHaveLength(24);
    expect(ownTriangles(named(f.doc, 'Mesh_Base'))).toBe(12);
    expectSameFingerprint(before, fingerprint(f.doc));
  });

  test('a node a semantic relationship names is a boundary', () => {
    const f = fixture();
    const metal = f.material('Metal');
    f.part('Mesh_Bracket', metal, f.scene).setExtras({
      [KILN_SEMANTIC_EXTRAS_KEY]: {
        schemaVersion: 1,
        roles: ['mount'],
        relationships: [{ kind: 'attachedTo', target: 'Mesh_Hinge', targetType: 'node' }],
        frames: [],
        sockets: [],
      },
    });
    f.part('Mesh_Hinge', metal, f.scene, { t: [2, 0, 0] });
    f.part('Mesh_PanelA', metal, f.scene, { t: [4, 0, 0] });
    f.part('Mesh_PanelB', metal, f.scene, { t: [6, 0, 0] });

    const summary = mergeRigidGroups(f.doc);

    expect(summary.boundaries).toEqual([
      { node: 'Mesh_Bracket', reasons: ['extras'] },
      { node: 'Mesh_Hinge', reasons: ['relationship-target'] },
    ]);
    expect(summary.primitivesAfter).toBe(3);
    expect(ownTriangles(named(f.doc, 'Mesh_Hinge'))).toBe(12);
    expect(ownTriangles(named(f.doc, 'Mesh_PanelA'))).toBe(24);
  });

  test('contract: a named non-boundary node keeps its name, not its geometry, unless kept', async () => {
    const build = () => {
      const f = fixture();
      const asphalt = f.material('Asphalt');
      f.part('Roadway', asphalt, f.scene);
      f.part('Rail', asphalt, f.scene, { t: [0, 1, 3] });
      return f.doc;
    };
    const merged = build();
    mergeRigidGroups(merged);
    // The names survive, but `Roadway` now draws the rail too and `Rail` draws nothing.
    expect(nodeNames(merged)).toEqual(['Rail', 'Roadway']);
    expect(ownTriangles(named(merged, 'Roadway'))).toBe(24);
    expect(named(merged, 'Rail').getMesh()).toBeNull();

    // Declared parts survive; the transform form reports the same summary.
    const kept = build();
    let summary: RigidMergeSummary | undefined;
    await kept.transform(rigidMerge({ keep: ['Roadway'] }, (s) => (summary = s)));
    expect(summary!.boundaries).toEqual([{ node: 'Roadway', reasons: ['kept'] }]);
    expect(summary!.unmatchedKeep).toEqual([]);
    expect(ownTriangles(named(kept, 'Roadway'))).toBe(12);
    expect(ownTriangles(named(kept, 'Rail'))).toBe(12);
  });

  test('keep names no scene node carries are reported, not silently ignored', () => {
    const f = fixture();
    const asphalt = f.material('Asphalt');
    f.part('Roadway', asphalt, f.scene);
    f.part('Rail', asphalt, f.scene, { t: [0, 1, 3] });
    // Outside every scene, so keeping it protects nothing that draws.
    f.doc.createNode('Offstage');

    const summary = mergeRigidGroups(f.doc, { keep: ['Rail', 'Roadwya', 'Offstage', 'Roadwya'] });

    expect(summary.unmatchedKeep).toEqual(['Roadwya', 'Offstage']);
    expect(summary.boundaries).toEqual([{ node: 'Rail', reasons: ['kept'] }]);
    expect(ownTriangles(named(f.doc, 'Roadway'))).toBe(12);
    expect(mergeRigidGroups(fixture().doc).unmatchedKeep).toEqual([]);
  });

  test('a mesh shared by several nodes is cloned before any user changes', () => {
    const f = fixture();
    const m = f.material('M');
    const shared = f.part('Mesh_Left', m, f.scene).getMesh()!;
    f.node('Mesh_Right', f.scene, { t: [3, 0, 0], r: quat([0, 1, 0], 1) }).setMesh(shared);
    f.node('Mesh_Tagged', f.scene, { t: [6, 0, 0] })
      .setMesh(shared)
      .setExtras({ id: 'kept' });
    f.part('Mesh_Other', m, f.scene, { t: [0, 3, 0] });
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.primitivesAfter).toBe(2);
    expect(named(f.doc, 'Mesh_Tagged').getMesh()).toBe(shared);
    expect(ownTriangles(named(f.doc, 'Mesh_Tagged'))).toBe(12);
    expect(ownTriangles(named(f.doc, 'Mesh_Left'))).toBe(36);
    expectSameFingerprint(before, fingerprint(f.doc));
  });

  test('expandSharedMeshes: false keeps shared meshes shared and reports their users', () => {
    const f = fixture();
    const m = f.material('M');
    const shared = f.part('Mesh_Left', m, f.scene).getMesh()!;
    const prim = shared.listPrimitives()[0]!;
    f.node('Mesh_Right', f.scene, { t: [3, 0, 0], r: quat([0, 1, 0], 1) }).setMesh(shared);
    f.node('Mesh_Tagged', f.scene, { t: [6, 0, 0] })
      .setMesh(shared)
      .setExtras({ id: 'kept' });
    const pair = f.part('Mesh_PairA', m, f.scene, { t: [0, 0, 3] }).getMesh()!;
    f.node('Mesh_PairB', f.scene, { t: [0, 0, 6] }).setMesh(pair);
    f.part('Mesh_Other', m, f.scene, { t: [0, 3, 0] });
    f.part('Mesh_Other2', m, f.scene, { t: [0, 6, 0] });
    const before = fingerprint(f.doc);
    const meshes = f.doc.getRoot().listMeshes().length;

    const summary = mergeRigidGroups(f.doc, { expandSharedMeshes: false });

    // Each user of the shared mesh still draws it from the one stored copy; only Other* join.
    expect(summary.primitivesAfter).toBe(6);
    expect(summary.merges).toBe(1);
    for (const name of ['Mesh_Left', 'Mesh_Right', 'Mesh_Tagged'])
      expect(named(f.doc, name).getMesh()).toBe(shared);
    expect(named(f.doc, 'Mesh_PairB').getMesh()).toBe(pair);
    expect(shared.listPrimitives()).toEqual([prim]);
    expect(f.doc.getRoot().listMeshes()).toHaveLength(meshes - 1);
    expect(summary.locked).toEqual([
      { node: 'Mesh_Left', reason: 'shared-mesh', primitives: 1 },
      { node: 'Mesh_Right', reason: 'shared-mesh', primitives: 1 },
      { node: 'Mesh_Tagged', reason: 'boundary', primitives: 1 },
      { node: 'Mesh_PairA', reason: 'shared-mesh', primitives: 1 },
      { node: 'Mesh_PairB', reason: 'shared-mesh', primitives: 1 },
    ]);
    expect(ownTriangles(named(f.doc, 'Mesh_Other'))).toBe(24);
    expectSameFingerprint(before, fingerprint(f.doc));
  });

  test('an animation channel without a target node stops the merge', () => {
    const f = fixture();
    const m = f.material('M');
    f.part('Mesh_A', m, f.scene);
    f.part('Mesh_B', m, f.scene, { t: [2, 0, 0] });
    const sampler = f.doc.createAnimationSampler();
    f.doc
      .createAnimation('Pointer')
      .addSampler(sampler)
      .addChannel(f.doc.createAnimationChannel().setSampler(sampler));

    const summary = mergeRigidGroups(f.doc);

    expect(summary.skipped).toBe('unbounded-animation');
    expect(summary.primitivesAfter).toBe(2);
    expect(ownTriangles(named(f.doc, 'Mesh_B'))).toBe(12);
  });
});

describe('mergeRigidGroups: atomic buckets', () => {
  test('an allocation failure inside the join leaves no orphan properties or serialized changes', async () => {
    const f = fixture();
    const m = f.material('M');
    f.part('A', m, f.scene);
    f.part('B', m, f.scene, { t: [2, 0, 0] });
    const io = createGltfIO();
    const bytes = await io.writeBinary(f.doc);
    const accessors = f.doc.getRoot().listAccessors().length;
    const edges = f.doc.getGraph().listEdges().length;
    const createAccessor = f.doc.createAccessor.bind(f.doc);
    let calls = 0;
    f.doc.createAccessor = (...args) => {
      if (++calls === 2) throw new Error('join allocation failure');
      return createAccessor(...args);
    };

    const summary = mergeRigidGroups(f.doc);

    expect(summary.merges).toBe(0);
    expect(summary.rejected).toEqual([
      { node: 'A', primitives: 2, error: 'join allocation failure' },
    ]);
    expect(f.doc.getRoot().listAccessors()).toHaveLength(accessors);
    expect(f.doc.getGraph().listEdges()).toHaveLength(edges);
    expect(await io.writeBinary(f.doc)).toEqual(bytes);
  });

  test('a bucket that fails part-way leaves the document byte-identical', async () => {
    const f = fixture();
    const m = f.material('M');
    f.part('Mesh_A', m, f.scene);
    const victim = f
      .part('Mesh_B', m, f.scene, { t: [2, 0, 0] })
      .getMesh()!
      .listPrimitives()[0]!;
    f.part('Mesh_C', m, f.scene, { t: [4, 0, 0] });
    Object.assign(victim, {
      clone: () => {
        throw new Error('forced failure');
      },
    });
    const io = createGltfIO();
    const bytes = await io.writeBinary(f.doc);
    const accessors = f.doc.getRoot().listAccessors().length;

    const summary = mergeRigidGroups(f.doc);

    expect(summary.rejected).toEqual([{ node: 'Mesh_A', primitives: 3, error: 'forced failure' }]);
    expect(summary.merges).toBe(0);
    expect(summary.primitivesAfter).toBe(3);
    expect(f.doc.getRoot().listAccessors()).toHaveLength(accessors);
    expect(Buffer.from(await io.writeBinary(f.doc)).equals(Buffer.from(bytes))).toBe(true);
  });

  test('a bucket that would write non-finite values is rejected; the others still merge', () => {
    const f = fixture();
    const good = f.material('Good');
    const bad = f.material('Bad');
    f.part('Mesh_Good1', good, f.scene);
    f.part('Mesh_Good2', good, f.scene, { t: [2, 0, 0] });
    const badA = f.part('Mesh_Bad1', bad, f.scene, { t: [4, 0, 0] });
    const badB = f.part('Mesh_Bad2', bad, f.scene, { t: [6, 0, 0] });
    const position = badB.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
    position.setElement(0, [Number.NaN, 0, 0]);
    const badPrims = [badA, badB].map((n) => n.getMesh()!.listPrimitives()[0]);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.merges).toBe(1);
    expect(summary.rejected).toHaveLength(1);
    expect(summary.rejected[0]!.node).toBe('Mesh_Bad1');
    expect(summary.rejected[0]!.error).toMatch(/non-finite/);
    expect([badA, badB].map((n) => n.getMesh()!.listPrimitives()[0])).toEqual(badPrims);
    expect(summary.primitivesAfter).toBe(3);
  });
});

describe('mergeRigidGroups: release policies', () => {
  test('shared scene entry points keep their geometry while descendants merge within the shared subtree', () => {
    for (const nested of [false, true])
      for (const onlyFirst of [false, true]) {
        const f = fixture();
        const m = f.material('M');
        if (onlyFirst) f.part('OnlyA', m, f.scene, { t: [4, 0, 0] });
        const shared = f.part('Shared', m, f.scene);
        const parent = nested ? f.node('Container', shared) : shared;
        f.part('DetailA', m, parent, { t: [0, 2, 0] });
        f.part('DetailB', m, parent, { t: [0, 4, 0] });
        if (!onlyFirst) f.part('OnlyA', m, f.scene, { t: [4, 0, 0] });
        f.doc.createScene('Alternative').addChild(shared);
        const before = fingerprint(f.doc);
        const original = shared.getMesh()!.listPrimitives();

        const summary = mergeRigidGroups(f.doc);

        expect(summary.boundaries).toContainEqual({ node: 'Shared', reasons: ['shared-scene'] });
        expect(shared.getMesh()!.listPrimitives()).toEqual(original);
        expect(subtreePrims(shared)).toHaveLength(2);
        expect(ownTriangles(named(f.doc, 'OnlyA'))).toBe(12);
        expectSameFingerprint(before, fingerprint(f.doc));
      }
  });

  test('rejects a bake frame that collapses small geometry far from the destination', async () => {
    const f = fixture();
    const m = f.material('M');
    f.part('Far', m, f.scene, { t: [1e8, 0, 0] });
    f.part('Origin', m, f.scene);
    const io = createGltfIO();
    const bytes = await io.writeBinary(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.merges).toBe(0);
    expect(summary.rejected[0]?.error).toMatch(/position precision/);
    expect(await io.writeBinary(f.doc)).toEqual(bytes);
  });

  test('breaks equally conditioned frame ties with a practical coordinate scale', () => {
    const f = fixture();
    const m = f.material('M');
    f.part('Tiny', m, f.scene, { s: [2 ** -32, 2 ** -32, 2 ** -32] });
    const stable = f.part('Stable', m, f.scene);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.merges).toBe(1);
    expect(stable.getMesh()).not.toBeNull();
    for (const value of stable
      .getMesh()!
      .listPrimitives()[0]!
      .getAttribute('POSITION')!
      .getArray()!)
      expect(Math.abs(value)).toBeLessThan(10);
  });

  test('an in-scene LOD reference keeps its own geometry and descendant boundary', () => {
    const f = fixture();
    const m = f.material('Shared');
    const base = f.part('Lod0', m, f.scene);
    const level = f.part('Lod1', m, f.scene, { t: [4, 0, 0] });
    f.part('Lod1Detail', m, level);
    f.part('WallA', m, f.scene, { t: [8, 0, 0] });
    f.part('WallB', m, f.scene, { t: [12, 0, 0] });
    base.setExtension(MSFT_LOD, f.doc.createExtension(MSFTLod).createLod().addLevel(level));
    const original = level.getMesh()!.listPrimitives();
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.boundaries).toContainEqual({ node: 'Lod1', reasons: ['lod'] });
    expect(level.getMesh()!.listPrimitives()).toEqual(original);
    expect(ownTriangles(level)).toBe(12);
    expect(subtreePrims(level)).toHaveLength(2);
    expect(summary.primitivesAfter).toBe(4);
    expectSameFingerprint(before, fingerprint(f.doc));
  });

  test('chooses a conditioned contributor frame instead of magnifying coordinates in the first one', () => {
    const f = fixture();
    const m = f.material('Shared');
    f.part('FirstThin', m, f.scene, { s: [1, 1e-6, 1], tangents: false });
    const stable = f.part('Stable', m, f.scene, { t: [0, 2, 0], tangents: false });
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.merges).toBe(1);
    expect(stable.getMesh()).not.toBeNull();
    for (const mesh of f.doc.getRoot().listMeshes())
      for (const prim of mesh.listPrimitives())
        for (const value of prim.getAttribute('POSITION')!.getArray()!)
          expect(Math.abs(value)).toBeLessThan(10);
    expectSameFingerprint(before, fingerprint(f.doc));
  });

  function densePrimitive(f: ReturnType<typeof fixture>, material: Material, count: number) {
    const positions = new Float32Array(count * 3);
    const colors = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      positions.set([Math.floor(i / 3), i % 3 === 1 ? 1 : 0, i % 3 === 2 ? 1 : 0], i * 3);
      colors.set([i % 251, 128, 255, 255], i * 4);
    }
    return f.doc
      .createPrimitive()
      .setMaterial(material)
      .setAttribute('POSITION', f.accessor('VEC3', positions))
      .setAttribute('COLOR_0', f.accessor('VEC4', colors).setNormalized(true))
      .setIndices(
        f.accessor('SCALAR', new Uint16Array(Array.from({ length: count }, (_, i) => i))),
      );
  }

  test('counts accessor storage shared across distinct meshes and retains independent affordable merges', () => {
    const f = fixture();
    const m = f.material('M');
    const shared = densePrimitive(f, m, 900).setAttribute('COLOR_0', null);
    const a = f.node('SharedA', f.scene).setMesh(f.doc.createMesh().addPrimitive(shared));
    const b = f
      .node('SharedB', f.scene, { t: [0, 2, 0] })
      .setMesh(f.doc.createMesh().addPrimitive(shared.clone()));
    for (const name of ['IndependentA', 'IndependentB'])
      f.node(name, f.scene).setMesh(
        f.doc.createMesh().addPrimitive(densePrimitive(f, m, 90).setAttribute('COLOR_0', null)),
      );
    const bytes = () =>
      f.doc
        .getRoot()
        .listAccessors()
        .reduce((sum, accessor) => sum + (accessor.getArray()?.byteLength ?? 0), 0);
    const beforeBytes = bytes();
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.primitivesBefore).toBe(4);
    expect(summary.primitivesAfter).toBe(3);
    expect(bytes() - beforeBytes).toBeLessThanOrEqual(4096);
    expect(a.getMesh()!.listPrimitives()).toEqual([shared]);
    expect(b.getMesh()!.listPrimitives()).toHaveLength(1);
    expect(summary.locked).toContainEqual({
      node: 'SharedA',
      reason: 'shared-byte-budget',
      primitives: 1,
    });
    expectSameFingerprint(before, fingerprint(f.doc));
  });

  test('prices retained shared attributes across material buckets and partially locked meshes', () => {
    for (const transparent of [false, true]) {
      for (const count of [90, 180]) {
        const f = fixture();
        const first = densePrimitive(f, f.material('Opaque'), count).setAttribute('COLOR_0', null);
        const otherMaterial = f.material('Other').setAlphaMode(transparent ? 'BLEND' : 'OPAQUE');
        const second = first.clone().setMaterial(otherMaterial);
        const mesh = f.doc.createMesh().addPrimitive(first).addPrimitive(second);
        f.node('A', f.scene).setMesh(mesh);
        f.node('B', f.scene, { t: [0, 2, 0] }).setMesh(mesh);
        const held = f.node('Joint_Held', f.scene).setMesh(mesh);
        const bytes = () =>
          f.doc
            .getRoot()
            .listAccessors()
            .reduce((sum, accessor) => sum + (accessor.getArray()?.byteLength ?? 0), 0);
        const beforeBytes = bytes();
        const before = fingerprint(f.doc);

        const summary = mergeRigidGroups(f.doc);

        const savedDraws = count === 90 ? (transparent ? 1 : 2) : 0;
        expect(summary.primitivesBefore - summary.primitivesAfter).toBe(savedDraws);
        expect(bytes() - beforeBytes).toBeLessThanOrEqual(savedDraws * 4096);
        expect(held.getMesh()).toBe(mesh);
        expect(mesh.listPrimitives()).toEqual([first, second]);
        expectSameFingerprint(before, fingerprint(f.doc));
      }
    }
  });

  test('prices 6,300 added bytes against one actual saved draw, not two mesh users', () => {
    const f = fixture();
    const m = f.material('Shared');
    const prim = densePrimitive(f, m, 450).setAttribute('COLOR_0', null);
    const shared = f.doc.createMesh('Shared').addPrimitive(prim);
    const a = f.node('A', f.scene).setMesh(shared);
    const b = f.node('B', f.scene, { t: [0, 2, 0] }).setMesh(shared);
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.merges).toBe(0);
    expect(summary.primitivesAfter).toBe(2);
    expect(a.getMesh()).toBe(shared);
    expect(b.getMesh()).toBe(shared);
    expect(summary.locked).toContainEqual({
      node: 'A',
      reason: 'shared-byte-budget',
      primitives: 1,
    });
    expectSameFingerprint(before, fingerprint(f.doc));
  });

  test('merges an affordable shared mesh while preserving an untouched boundary user', () => {
    const f = fixture();
    const prim = densePrimitive(f, f.material('Shared'), 90).setAttribute('COLOR_0', null);
    const shared = f.doc.createMesh('Shared').addPrimitive(prim);
    f.node('A', f.scene).setMesh(shared);
    f.node('B', f.scene, { t: [0, 2, 0] }).setMesh(shared);
    const pivot = f.node('Joint_Held', f.scene).setMesh(shared);
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.merges).toBe(1);
    expect(summary.primitivesAfter).toBe(2);
    expect(pivot.getMesh()).toBe(shared);
    expect(shared.listPrimitives()).toEqual([prim]);
    expectSameFingerprint(before, fingerprint(f.doc));
  });

  test('splits a large joined bucket into 16-bit primitives without dropping attributes or elements', async () => {
    const f = fixture();
    const m = f.material('Shared');
    for (let i = 0; i < 3; i++)
      f.node(`Part${i}`, f.scene, { t: [0, i * 2, 0] }).setMesh(
        f.doc.createMesh().addPrimitive(densePrimitive(f, m, 24_000)),
      );
    const before = fingerprint(f.doc);

    const summary = mergeRigidGroups(f.doc);

    expect(summary.primitivesBefore).toBe(3);
    expect(summary.primitivesAfter).toBe(2);
    const drawn = f.doc
      .getRoot()
      .listNodes()
      .flatMap((n) => n.getMesh()?.listPrimitives() ?? []);
    expect(drawn).toHaveLength(2);
    for (const prim of drawn) {
      expect(prim.getAttribute('POSITION')!.getCount()).toBeLessThanOrEqual(65_534);
      expect(prim.getIndices()!.getArray()).toBeInstanceOf(Uint16Array);
      expect(prim.getAttribute('COLOR_0')!.getCount()).toBe(
        prim.getAttribute('POSITION')!.getCount(),
      );
      expect(prim.getAttribute('COLOR_0')!.getNormalized()).toBe(true);
    }
    expect(drawn.reduce((sum, p) => sum + p.getIndices()!.getCount(), 0)).toBe(72_000);
    expectSameFingerprint(before, fingerprint(f.doc));
    const { weld } = await import('@gltf-transform/functions');
    await f.doc.transform(weld());
    expectSameFingerprint(before, fingerprint(f.doc));
    for (const node of f.doc.getRoot().listNodes())
      for (const prim of node.getMesh()?.listPrimitives() ?? [])
        expect(prim.getIndices()!.getArray()).toBeInstanceOf(Uint16Array);
  });
});
