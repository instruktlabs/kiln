/**
 * Print export (#378): binary STL and 3MF in millimetres for assets whose visible meshes are
 * all closed, manifold, outward solids. The readers below are test-only: they parse the
 * written bytes back so each claim is measured from the file, not from the writer's state.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Document, WebIO } from '@gltf-transform/core';
import { EXTMeshGPUInstancing, KHRNodeVisibility } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { exportAssetPrint } from '../asset-export';
import type { AssetRecord } from '../assets';
import { geometryDiagnostics } from '../geometry';
import { createGltfIO } from '../gltf-io';
import { defineLod } from '../lod';
import { drawnSceneBounds } from '../node-visibility';
import { boxGeo, gameMaterial, planeGeo, sphereGeo } from '../primitives';
import { exportPrintGlb, PrintExportError } from '../print-export';
import { renderSceneToGLB } from '../render';

interface Body {
  name?: string;
  positions: number[];
  triangles: number[];
  /** 3MF only: the basematerials index each triangle resolves to. */
  materials?: number[];
}

/** Binary STL: 80-byte header, uint32 count, then 50 bytes per triangle. */
function readStl(bytes: Uint8Array): { header: string; body: Body } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  expect(bytes.byteLength).toBe(84 + 50 * count);
  const positions: number[] = [];
  const triangles: number[] = [];
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50 + 12;
    for (let v = 0; v < 3; v++) {
      triangles.push(positions.length / 3);
      for (let c = 0; c < 3; c++) positions.push(view.getFloat32(at + v * 12 + c * 4, true));
    }
    expect(view.getUint16(84 + t * 50 + 48, true)).toBe(0);
  }
  return {
    header: new TextDecoder().decode(bytes.subarray(0, 80)),
    body: { positions, triangles },
  };
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** A 3MF package: the entry order, the model's unit, its base materials and its objects. */
function read3mf(bytes: Uint8Array) {
  const entries = unzipSync(bytes);
  const xml = new TextDecoder().decode(entries['3D/3dmodel.model']!);
  const unit = attr(/<model\b[^>]*>/.exec(xml)![0], 'unit');
  const colors = [...xml.matchAll(/<base\b[^>]*\/>/g)].map((m) => ({
    name: attr(m[0], 'name'),
    displaycolor: attr(m[0], 'displaycolor'),
  }));
  const bodies: Body[] = [];
  const assemblies: { name?: string; components: string[] }[] = [];
  for (const object of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const head = `<object ${object[1]}>`;
    if (!object[2]!.includes('<mesh>')) {
      assemblies.push({
        name: attr(head, 'name'),
        components: [...object[2]!.matchAll(/<component\b[^>]*\/>/g)].map(
          (m) => attr(m[0], 'objectid')!,
        ),
      });
      continue;
    }
    const fallback = Number(attr(head, 'pindex'));
    const positions = [...object[2]!.matchAll(/<vertex\b[^>]*\/>/g)].flatMap((m) =>
      ['x', 'y', 'z'].map((axis) => Number(attr(m[0], axis))),
    );
    const triangles: number[] = [];
    const materials: number[] = [];
    for (const m of object[2]!.matchAll(/<triangle\b[^>]*\/>/g)) {
      triangles.push(...['v1', 'v2', 'v3'].map((v) => Number(attr(m[0], v))));
      const p1 = attr(m[0], 'p1');
      materials.push(p1 === undefined ? fallback : Number(p1));
    }
    bodies.push({ name: attr(head, 'name'), positions, triangles, materials });
  }
  const items = [...xml.matchAll(/<item\b[^>]*\/>/g)].map((m) => attr(m[0], 'objectid'));
  return { entries: Object.keys(entries), xml, unit, colors, bodies, assemblies, items };
}

/** Every undirected edge on exactly two triangles, traversed once each way (outward-consistent). */
function watertight({ positions, triangles }: Body): boolean {
  const key = (i: number) => positions.slice(i * 3, i * 3 + 3).join(',');
  const directed = new Map<string, number>();
  for (let t = 0; t < triangles.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = key(triangles[t + e]!);
      const b = key(triangles[t + ((e + 1) % 3)]!);
      if (a === b) return false;
      const edge = `${a}>${b}`;
      directed.set(edge, (directed.get(edge) ?? 0) + 1);
    }
  for (const [edge, count] of directed) {
    const [a, b] = edge.split('>');
    if (count !== 1 || directed.get(`${b}>${a}`) !== 1) return false;
  }
  return directed.size > 0;
}

function volume({ positions, triangles }: Body): number {
  let sum = 0;
  const p = (i: number) => new THREE.Vector3().fromArray(positions, i * 3);
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [p(triangles[t]!), p(triangles[t + 1]!), p(triangles[t + 2]!)];
    sum += a.dot(b.cross(c)) / 6;
  }
  return sum;
}

function bounds({ positions }: Body) {
  const box = new THREE.Box3().setFromArray(positions);
  return { min: box.min.toArray(), max: box.max.toArray() };
}

function record(glb: Uint8Array): AssetRecord {
  return {
    manifest: {
      version: 'kiln.asset.v1',
      assetId: 'a_print',
      revisionId: 'r_print',
      name: 'Print',
      tags: [],
      createdAt: '2026-11-18T00:00:00.000Z',
      editable: false,
      files: {
        'asset.glb': {
          bytes: glb.length,
          sha256: `sha256:${createHash('sha256').update(glb).digest('hex')}`,
        },
      },
    },
    files: { 'asset.glb': glb },
  };
}

/** A red box and a blue sphere apart from each other, one rotated, plus a hidden open sheet. */
function closedScene() {
  const root = new THREE.Group();
  root.name = 'Root';
  const box = new THREE.Mesh(boxGeo(0.2, 0.4, 0.6), gameMaterial(0xcc3322, { name: 'Brick' }));
  box.name = 'Block';
  box.position.set(0.5, 0.2, -0.25);
  box.rotation.set(0, Math.PI / 6, 0);
  const sphere = new THREE.Mesh(sphereGeo(0.15, 12, 8), gameMaterial(0x2255aa, { name: 'Glaze' }));
  sphere.name = 'Ball';
  sphere.position.set(-0.4, 0.15, 0.3);
  const sheet = new THREE.Mesh(planeGeo(1, 1), gameMaterial(0x00ff00));
  sheet.name = 'HiddenSheet';
  sheet.visible = false;
  root.add(box, sphere, sheet);
  const expectedVolume =
    geometryDiagnostics(box.geometry).solid.signedVolume +
    geometryDiagnostics(sphere.geometry).solid.signedVolume;
  return { root, expectedVolume };
}

async function glbBounds(glb: Uint8Array) {
  const doc = await createGltfIO().readBinary(glb);
  return drawnSceneBounds(doc.getRoot().getDefaultScene()!);
}

/** glTF is Y-up; print files are Z-up: (x, y, z) -> (x, -z, y), then metres -> millimetres. */
function expectedPrintBounds(glb: { min: number[]; max: number[] }) {
  return {
    min: [glb.min[0]! * 1000, -glb.max[2]! * 1000, glb.min[1]! * 1000],
    max: [glb.max[0]! * 1000, -glb.min[2]! * 1000, glb.max[1]! * 1000],
  };
}

function expectClose(actual: number[], expected: number[], tolerance: number) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => {
    expect(Math.abs(value - expected[i]!)).toBeLessThanOrEqual(tolerance);
  });
}

describe('print export', () => {
  test('an open visible mesh is refused, naming the part and the failing fact', async () => {
    const root = new THREE.Group();
    const block = new THREE.Mesh(boxGeo(1, 1, 1), gameMaterial(0xffffff));
    block.name = 'Block';
    const floor = new THREE.Mesh(planeGeo(2, 2), gameMaterial(0x888888));
    floor.name = 'Floor';
    root.add(block, floor);
    const { bytes } = await renderSceneToGLB(root);
    for (const format of ['stl', '3mf'] as const) {
      let caught: unknown;
      try {
        await exportPrintGlb(bytes, { format });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PrintExportError);
      const error = caught as PrintExportError;
      expect(error.code).toBe('PRINT_NOT_SOLID');
      expect(error.message).toContain('Floor');
      expect(error.message).toContain('not closed');
      expect(error.message).not.toContain('Block');
      expect(error.parts.map((part) => part.name)).toEqual(['Floor']);
      expect(error.parts[0]!.path).toMatch(/\/Floor\[0\]$/);
      expect(error.parts[0]!.reasons[0]).toBe('not closed (4 boundary edges)');
    }
  });

  test('an inward mesh is refused as not outward', async () => {
    const root = new THREE.Group();
    const geometry = boxGeo(1, 1, 1);
    const index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    const inside = new THREE.Mesh(geometry, gameMaterial(0xffffff));
    inside.name = 'InsideOut';
    root.add(inside);
    const { bytes } = await renderSceneToGLB(root);
    await expect(exportPrintGlb(bytes, { format: 'stl' })).rejects.toThrow(
      /InsideOut \(.*\): faces point inward/,
    );
  });

  test('a closed asset gives STL and 3MF with the GLB bounds, the volume and watertight bodies', async () => {
    const { root, expectedVolume } = closedScene();
    const { bytes: glb } = await renderSceneToGLB(root);
    const expectedBounds = expectedPrintBounds(await glbBounds(glb));

    const stl = await exportPrintGlb(glb, { format: 'stl' });
    expect(stl.format).toBe('stl');
    const { header, body } = readStl(stl.bytes);
    expect(header.startsWith('solid')).toBe(false);
    expect(header).toContain('millimet');
    expect(body.triangles.length / 3).toBe(stl.triangles);
    expect(watertight(body)).toBe(true);
    const box = bounds(body);
    expectClose(box.min, expectedBounds.min, 1e-3);
    expectClose(box.max, expectedBounds.max, 1e-3);
    expect(Math.abs(volume(body) / (expectedVolume * 1e9) - 1)).toBeLessThan(1e-5);

    const model = await exportPrintGlb(glb, { format: '3mf' });
    const pkg = read3mf(model.bytes);
    expect(pkg.entries).toEqual(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']);
    expect(pkg.unit).toBe('millimeter');
    expect(pkg.bodies.map((b) => b.name)).toEqual(['Block', 'Ball']);
    // One build item: an assembly whose components are the bodies, so a slicer loads one
    // object with two parts instead of two objects to arrange apart.
    expect(pkg.items).toHaveLength(1);
    expect(pkg.assemblies).toHaveLength(1);
    expect(pkg.assemblies[0]!.components).toHaveLength(2);
    expect(pkg.xml).toMatch(new RegExp(`<object id="${pkg.items[0]}" type="model"`));
    for (const each of pkg.bodies) expect(watertight(each)).toBe(true);
    const all = pkg.bodies.map(bounds);
    expectClose(
      [0, 1, 2].map((axis) => Math.min(...all.map((b) => b.min[axis]!))),
      expectedBounds.min,
      1e-3,
    );
    expectClose(
      [0, 1, 2].map((axis) => Math.max(...all.map((b) => b.max[axis]!))),
      expectedBounds.max,
      1e-3,
    );
    const total = pkg.bodies.reduce((sum, each) => sum + volume(each), 0);
    expect(Math.abs(total / (expectedVolume * 1e9) - 1)).toBeLessThan(1e-5);
    // Each body's volume matches its own part.
    expect(
      Math.abs(
        volume(pkg.bodies[0]!) /
          (geometryDiagnostics(boxGeo(0.2, 0.4, 0.6)).solid.signedVolume * 1e9) -
          1,
      ),
    ).toBeLessThan(1e-5);
    // Same triangles in both formats.
    expect(pkg.bodies.reduce((sum, each) => sum + each.triangles.length / 3, 0)).toBe(
      stl.triangles,
    );
    expect(model.unit).toBe('millimeter');
    expect(model.bodies.map((b) => b.name)).toEqual(['Block', 'Ball']);
  });

  test('3MF colours are each part material base colour, in sRGB', async () => {
    const { root } = closedScene();
    const { bytes: glb } = await renderSceneToGLB(root);
    const pkg = read3mf((await exportPrintGlb(glb, { format: '3mf' })).bytes);
    expect(pkg.colors).toEqual([
      { name: 'Brick', displaycolor: '#CC3322FF' },
      { name: 'Glaze', displaycolor: '#2255AAFF' },
    ]);
    expect(new Set(pkg.bodies[0]!.materials)).toEqual(new Set([0]));
    expect(new Set(pkg.bodies[1]!.materials)).toEqual(new Set([1]));
  });

  test('the same input gives the same bytes', async () => {
    const { root } = closedScene();
    const { bytes: glb } = await renderSceneToGLB(root);
    for (const format of ['stl', '3mf'] as const) {
      const first = await exportPrintGlb(glb, { format });
      const second = await exportPrintGlb(glb.slice(), { format });
      expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
    }
    const { root: again } = closedScene();
    const rebuilt = await renderSceneToGLB(again);
    expect(
      Buffer.from((await exportPrintGlb(rebuilt.bytes, { format: '3mf' })).bytes).equals(
        Buffer.from((await exportPrintGlb(glb, { format: '3mf' })).bytes),
      ),
    ).toBe(true);
  });

  test('hidden subtrees and lower LOD levels are not exported', async () => {
    const root = new THREE.Group();
    const near = new THREE.Mesh(boxGeo(1, 1, 1), gameMaterial(0xffffff));
    near.name = 'Rock_LOD0';
    const far = new THREE.Mesh(planeGeo(1, 1), gameMaterial(0xffffff));
    far.name = 'Rock_LOD1';
    root.add(near, far);
    defineLod([near, far], { screenCoverage: [0.2, 0.05] });
    const { bytes } = await renderSceneToGLB(root);
    const result = await exportPrintGlb(bytes, { format: '3mf' });
    expect(result.bodies.map((b) => b.name)).toEqual(['Rock_LOD0']);
    expect(result.triangles).toBe(12);
  });

  test('GPU instances are expanded and a mirrored placement stays outward', async () => {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const position = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(cube.getAttribute('position').array))
      .setBuffer(buffer);
    const indices = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Uint16Array(cube.getIndex()!.array))
      .setBuffer(buffer);
    const mesh = doc
      .createMesh('Cube')
      .addPrimitive(doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices));
    const scene = doc.createScene();
    doc.getRoot().setDefaultScene(scene);
    const instancing = doc.createExtension(EXTMeshGPUInstancing);
    const translations = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 3, 0, 0, 6, 0, 0]))
      .setBuffer(buffer);
    scene.addChild(
      doc
        .createNode('Studs')
        .setMesh(mesh)
        .setExtension(
          'EXT_mesh_gpu_instancing',
          instancing.createInstancedMesh().setAttribute('TRANSLATION', translations),
        ),
    );
    scene.addChild(
      doc.createNode('Mirror').setMesh(mesh).setScale([-2, 1, 1]).setTranslation([0, 5, 0]),
    );
    const glb = await new WebIO().registerExtensions([EXTMeshGPUInstancing]).writeBinary(doc);

    const result = await exportPrintGlb(glb, { format: '3mf' });
    expect(result.bodies.map((b) => b.name)).toEqual(['Studs', 'Studs', 'Studs', 'Mirror']);
    const pkg = read3mf(result.bytes);
    const volumes = pkg.bodies.map(volume);
    expectClose(volumes, [1e9, 1e9, 1e9, 2e9], 1);
    for (const each of pkg.bodies) expect(watertight(each)).toBe(true);
    expectClose(bounds(pkg.bodies[2]!).min, [5500, -500, -500], 1e-3);
  });

  test('a GLB with no visible triangles is refused', async () => {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const position = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array(cube.getAttribute('position').array))
      .setBuffer(buffer);
    const indices = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Uint16Array(cube.getIndex()!.array))
      .setBuffer(buffer);
    const mesh = doc
      .createMesh('Cube')
      .addPrimitive(doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices));
    const scene = doc.createScene();
    doc.getRoot().setDefaultScene(scene);
    const visibility = doc.createExtension(KHRNodeVisibility);
    scene.addChild(
      doc
        .createNode('Hidden')
        .setMesh(mesh)
        .setExtension('KHR_node_visibility', visibility.createVisibility().setVisible(false)),
    );
    const glb = await new WebIO().registerExtensions([KHRNodeVisibility]).writeBinary(doc);
    await expect(exportPrintGlb(glb, { format: 'stl' })).rejects.toThrow(/no visible/i);
  });

  test('the asset-export entry exports a saved revision', async () => {
    const { root } = closedScene();
    const { bytes } = await renderSceneToGLB(root);
    const viaRecord = await exportAssetPrint(record(bytes), { format: 'stl' });
    const direct = await exportPrintGlb(bytes, { format: 'stl' });
    expect(Buffer.from(viaRecord.bytes).equals(Buffer.from(direct.bytes))).toBe(true);
    await expect(exportAssetPrint(record(bytes), { format: 'obj' as 'stl' })).rejects.toThrow(
      /stl or 3mf/,
    );
  });
});
