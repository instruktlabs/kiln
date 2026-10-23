import {
  type Accessor,
  type Document,
  type Material,
  type Node,
  type Primitive,
  PropertyType,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS, type InstancedMesh } from '@gltf-transform/extensions';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { createGltfIO, type Lod, MSFT_LOD } from './gltf-io';
import { collectGlbMetrics, isHiddenGltfNode } from './metrics';
import { drawnSceneBounds } from './node-visibility';

type Bounds = { min: number[]; max: number[]; size: number[] } | null;
type Field = 'geometry' | 'material' | 'transform' | 'bounds' | 'visibility';
interface Part {
  name: string;
  node: Node;
  /** World matrix where the node is drawn; a chain's lower level takes LOD0's parent. */
  world: number[];
  primitives: Primitive[];
  /** Where the node draws when shown; hidden descendants are left out. */
  bounds: Bounds;
  /** `KHR_node_visibility` hides the node and its subtree. */
  hidden: boolean;
}
interface Change {
  path: string;
  beforePath: string | null;
  afterPath: string | null;
  name: string;
  status: 'added' | 'removed' | 'changed';
  fields: Field[];
  beforeBounds: Bounds;
  afterBounds: Bounds;
}
interface AnimationChannelSnapshot {
  clip: string;
  targetPath: string;
  property: string;
  fingerprint: string;
}

async function accessorFingerprint(accessor: Accessor | null) {
  const array = accessor?.getArray();
  if (!accessor || !array) throw new Error('Animation comparison requires embedded sampler data.');
  return [
    accessor.getType(),
    accessor.getComponentType(),
    accessor.getNormalized(),
    await digest(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)),
  ];
}

const MAX_GLB_BYTES = 64 * 1024 * 1024;
const MAX_NODES = 10000;
const MAX_VERTICES = 2000000;
const ACCESSOR_IGNORED = new Set(['name', 'extras', 'buffer']);
const MATERIAL_IGNORED = new Set(['name', 'extras']);

/** The lower levels an `MSFT_lod` node lists, highest detail first. */
function lowerLevels(node: Node): Node[] {
  return (node.getExtension<Lod>(MSFT_LOD)?.listLevels() ?? []).filter(
    (level): level is Node => level.propertyType === PropertyType.NODE,
  );
}

function bounds(box: Box3): Bounds {
  return box.isEmpty()
    ? null
    : {
        min: box.min.toArray(),
        max: box.max.toArray(),
        size: box.getSize(new Vector3()).toArray(),
      };
}

async function digest(bytes: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)));
  return `sha256:${[...hash].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** What one revision draws, counted the way render metrics count it. */
export interface RevisionTotals {
  triangles: number;
  /** POSITION entries of every drawn primitive, once per placement and GPU instance. */
  vertices: number;
  drawCalls: number;
  materials: number;
  bounds: Bounds;
  /** Content hash of the drawn world-space triangles; see `drawnGeometryDigests`. */
  geometry: string;
  /** The same triangles with the TEXCOORD_0 value at each corner. */
  uv: string;
}

/** Placement matrices of a drawn mesh node: its world matrix, once per GPU instance. */
function placements(node: Node): Matrix4[] {
  const world = new Matrix4().fromArray(node.getWorldMatrix());
  const instances = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
  if (!instances) return [world];
  const translation = instances.getAttribute('TRANSLATION');
  const rotation = instances.getAttribute('ROTATION');
  const scale = instances.getAttribute('SCALE');
  const count = translation?.getCount() ?? rotation?.getCount() ?? scale?.getCount() ?? 1;
  return Array.from({ length: count }, (_, i) =>
    world
      .clone()
      .multiply(
        new Matrix4().compose(
          new Vector3().fromArray(translation?.getElement(i, []) ?? [0, 0, 0]),
          new Quaternion().fromArray(rotation?.getElement(i, []) ?? [0, 0, 0, 1]),
          new Vector3().fromArray(scale?.getElement(i, []) ?? [1, 1, 1]),
        ),
      ),
  );
}

/** Corner indices of a triangle-mode primitive as glTF orders them, or null for points/lines. */
function triangleCorners(mode: number, count: number): number[] | null {
  const corners: number[] = [];
  if (mode === 4) for (let i = 0; i + 2 < count; i += 3) corners.push(i, i + 1, i + 2);
  else if (mode === 5)
    for (let i = 0; i + 2 < count; i++)
      corners.push(...(i % 2 ? [i + 1, i, i + 2] : [i, i + 1, i + 2]));
  else if (mode === 6) for (let i = 1; i + 1 < count; i++) corners.push(i, i + 1, 0);
  else return null;
  return corners;
}

/** Floats per triangle record: three corners of position (9), TEXCOORD_0 (6) and a UV flag. */
const RECORD = 16;
const exact = (value: number) => Math.fround(value) + 0; // float32, and -0 reads as 0

function compareRecords(data: Float32Array, a: number, b: number) {
  for (let k = 0; k < RECORD; k++) {
    const d = data[a + k]! - data[b + k]!;
    if (d) return d;
  }
  return 0;
}

/** Order two starting corners of one triangle: positions [0, 9), then UVs [9, 15). */
function compareRotations(corner: Float32Array, r: number, s: number) {
  for (const [offset, width] of [
    [0, 3],
    [9, 2],
  ] as const)
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < width; k++) {
        const d =
          corner[offset + ((c + r) % 3) * width + k]! - corner[offset + ((c + s) % 3) * width + k]!;
        if (d) return d;
      }
  return 0;
}

/**
 * Two content hashes of what a revision draws, independent of node, primitive, vertex and
 * triangle order. Each drawn triangle is taken to world space (node world matrix and GPU
 * instance, float64), each corner rounded to float32 exactly as glTF stores positions, then
 * rotated (never reflected, so winding counts) to start at its smallest corner; the sorted
 * triangles are hashed. No tolerance: equal means the same float32 world coordinates, so a
 * merge that bakes transforms with different float rounding can read as a change, while one
 * that keeps the same coordinates in fewer primitives reads as identical. Points and lines
 * are hashed per primitive. The second hash adds TEXCOORD_0 at each corner. Normals, colours,
 * skin weights and morph targets are not hashed; materials are counted separately.
 */
async function drawnGeometryDigests(doc: Document) {
  const drawn: { primitive: Primitive; matrices: Matrix4[] }[] = [];
  const visit = (node: Node): void => {
    if (isHiddenGltfNode(node)) return;
    const mesh = node.getMesh();
    if (mesh) {
      const matrices = placements(node);
      for (const primitive of mesh.listPrimitives()) drawn.push({ primitive, matrices });
    }
    for (const child of node.listChildren()) visit(child);
  };
  for (const scene of doc.getRoot().listScenes())
    for (const node of scene.listChildren()) visit(node);
  let triangles = 0;
  let vertices = 0;
  for (const { primitive, matrices } of drawn) {
    const position = primitive.getAttribute('POSITION');
    const count = primitive.getIndices()?.getCount() ?? position?.getCount() ?? 0;
    vertices += (position?.getCount() ?? 0) * matrices.length;
    triangles += ((triangleCorners(primitive.getMode(), count)?.length ?? 0) / 3) * matrices.length;
    // The per-node comparison's budget, counted the same way: one visit per triangle corner.
    if (vertices > MAX_VERTICES || triangles * 3 > MAX_VERTICES)
      throw new Error('Revision comparison exceeds 2,000,000 placed vertices.');
  }
  const data = new Float32Array(triangles * RECORD);
  const others: string[] = [];
  const point = new Vector3();
  const element = [0, 0, 0];
  const texcoord = [0, 0];
  const corner = new Float32Array(15);
  let written = 0;
  for (const { primitive, matrices } of drawn) {
    const position = primitive.getAttribute('POSITION');
    if (!position) continue;
    const uv = primitive.getAttribute('TEXCOORD_0');
    const indices = primitive.getIndices();
    const count = indices?.getCount() ?? position.getCount();
    const corners = triangleCorners(primitive.getMode(), count);
    const vertexAt = (i: number) => indices?.getScalar(i) ?? i;
    for (const matrix of matrices) {
      const world = (vertex: number) => {
        position.getElement(vertex, element);
        point.fromArray(element).applyMatrix4(matrix);
        if (!Number.isFinite(point.x + point.y + point.z))
          throw new Error('Revision comparison requires finite positions and valid indices.');
        return point;
      };
      if (!corners) {
        const sequence = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const p = world(vertexAt(i));
          sequence.set([exact(p.x), exact(p.y), exact(p.z)], i * 3);
        }
        others.push(`${primitive.getMode()}:${await digest(new Uint8Array(sequence.buffer))}`);
        continue;
      }
      for (let t = 0; t < corners.length; t += 3) {
        for (let c = 0; c < 3; c++) {
          const vertex = vertexAt(corners[t + c]!);
          const p = world(vertex);
          corner[c * 3] = exact(p.x);
          corner[c * 3 + 1] = exact(p.y);
          corner[c * 3 + 2] = exact(p.z);
          const value = uv ? uv.getElement(vertex, texcoord) : [0, 0];
          corner[9 + c * 2] = exact(value[0]!);
          corner[10 + c * 2] = exact(value[1]!);
        }
        // Start at the smallest corner sequence, positions first, then UVs.
        let best = 0;
        for (const r of [1, 2]) if (compareRotations(corner, r, best) < 0) best = r;
        const at = written * RECORD;
        for (let c = 0; c < 3; c++) {
          const from = (c + best) % 3;
          data.set(corner.subarray(from * 3, from * 3 + 3), at + c * 3);
          data.set(corner.subarray(9 + from * 2, 11 + from * 2), at + 9 + c * 2);
        }
        data[at + 15] = uv ? 1 : 0;
        written++;
      }
    }
  }
  const order = new Uint32Array(written).map((_, i) => i);
  order.sort((a, b) => compareRecords(data, a * RECORD, b * RECORD));
  const positions = new Float32Array(written * 9);
  const sorted = new Float32Array(written * RECORD);
  order.forEach((record, i) => {
    positions.set(data.subarray(record * RECORD, record * RECORD + 9), i * 9);
    sorted.set(data.subarray(record * RECORD, (record + 1) * RECORD), i * RECORD);
  });
  const tail = new TextEncoder().encode(`|${others.sort().join(',')}`);
  const joined = (bytes: Float32Array) => {
    const out = new Uint8Array(bytes.byteLength + tail.byteLength);
    out.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    out.set(tail, bytes.byteLength);
    return out;
  };
  return {
    vertices,
    geometry: await digest(joined(positions)),
    uv: await digest(joined(sorted)),
  };
}

/** Render-metric counts, drawn bounds and geometry hashes of one revision's document. */
export async function revisionTotals(doc: Document): Promise<RevisionTotals> {
  const metrics = collectGlbMetrics(doc);
  const { vertices, geometry, uv } = await drawnGeometryDigests(doc);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const drawnBounds = scene ? drawnSceneBounds(scene) : null;
  const box =
    drawnBounds && [...drawnBounds.min, ...drawnBounds.max].every(Number.isFinite)
      ? new Box3(new Vector3(...drawnBounds.min), new Vector3(...drawnBounds.max))
      : new Box3();
  return {
    triangles: metrics.triangles,
    vertices,
    drawCalls: metrics.drawCalls,
    materials: metrics.uniqueMaterials,
    bounds: bounds(box),
    geometry,
    uv,
  };
}

type Count = 'triangles' | 'vertices' | 'drawCalls' | 'materials';
const COUNTS: Count[] = ['triangles', 'vertices', 'drawCalls', 'materials'];

/** Each count before and after with its signed delta, and whether drawn geometry matches. */
export function totalsDelta(before: RevisionTotals, after: RevisionTotals) {
  const counts = Object.fromEntries(
    COUNTS.map((key) => [
      key,
      { before: before[key], after: after[key], delta: after[key] - before[key] },
    ]),
  ) as Record<Count, { before: number; after: number; delta: number }>;
  const geometryIdentical = before.geometry === after.geometry;
  return {
    counts,
    geometryIdentical,
    // Corners only correspond when the triangles do; a UV verdict on changed geometry
    // would be a guess.
    ...(geometryIdentical ? { uvIdentical: before.uv === after.uv } : {}),
    boundsDelta: boundsDelta(before.bounds, after.bounds),
  };
}

function boundsDelta(before: Bounds, after: Bounds) {
  if (!before || !after) return null;
  const minus = (a: number[], b: number[]) => a.map((value, i) => value - b[i]!);
  return {
    min: minus(after.min, before.min),
    max: minus(after.max, before.max),
    size: minus(after.size, before.size),
  };
}

/** Read a saved or evaluated GLB for counting; self-contained only, never fetching. */
async function readComparisonDocument(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_GLB_BYTES) throw new Error('Revision comparison GLB exceeds 64 MiB.');
  const io = createGltfIO();
  const json = await io.binaryToJSON(bytes);
  if (
    json.json.buffers?.some((b) => b.uri && !json.resources[b.uri]) ||
    json.json.images?.some((i) => i.uri)
  )
    throw new Error('Revision comparison requires embedded GLB resources.');
  return io.readJSON(json);
}

/**
 * The counts, bounds and geometry identity of a child revision against its parent, without
 * the per-node match `compareRevisionGlbs` needs: any GLB a save accepts can be counted,
 * including repeated sibling names.
 */
export async function compareRevisionTotals(parent: Uint8Array, child: Uint8Array) {
  const before = await revisionTotals(await readComparisonDocument(parent));
  const after = await revisionTotals(await readComparisonDocument(child));
  return { before, after, ...totalsDelta(before, after) };
}

async function snapshot(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_GLB_BYTES) throw new Error('Revision comparison GLB exceeds 64 MiB.');
  const io = createGltfIO();
  const json = await io.binaryToJSON(bytes);
  const supported = new Set([...ALL_EXTENSIONS.map((ext) => ext.EXTENSION_NAME), MSFT_LOD]);
  if (json.json.extensionsUsed?.some((name) => !supported.has(name)))
    throw new Error('Revision comparison cannot ignore an unknown glTF extension.');
  // The evaluator returns self-contained GLB. Never fetch external resources here.
  if (
    json.json.buffers?.some((b) => b.uri && !json.resources[b.uri]) ||
    json.json.images?.some((i) => i.uri)
  )
    throw new Error('Revision comparison requires embedded GLB resources.');
  const doc = await io.readJSON(json);
  // Equality traverses texture resources from each material. Replace private comparison
  // images with fixed-size digests once, so sharing many materials cannot multiply
  // full-image scans. The original GLB bytes and output artifact remain untouched.
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (image)
      texture.setImage(
        new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(image))),
      );
  }
  const scenes = doc.getRoot().listScenes();
  if (scenes.length !== 1) throw new Error('Revision comparison requires exactly one scene.');
  if (doc.getRoot().listSkins().length)
    throw new Error('Revision comparison does not support skins.');
  const parts = new Map<string, Part>();
  let vertices = 0;
  const visit = (siblings: Node[], parent: string, depth: number, parentWorld: Matrix4): Box3 => {
    if (depth > 128) throw new Error('Revision comparison hierarchy exceeds 128 levels.');
    const names = new Set<string>();
    const combined = new Box3();
    // A chain's lower levels are compared where a loader places them, beside LOD0 under the
    // same parent; only what a loader without the extension draws counts toward the bounds.
    const placed = siblings.flatMap((node) => [
      { node, drawn: true },
      ...lowerLevels(node).map((level) => ({ node: level, drawn: false })),
    ]);
    for (const { node, drawn } of placed) {
      const name = node.getName();
      if (!name || names.has(name))
        throw new Error(
          'Revision comparison requires unique nonempty sibling names; rename ambiguous nodes before comparing.',
        );
      names.add(name);
      const path = `${parent}/${encodeURIComponent(name)}[0]`;
      if (parts.size >= MAX_NODES || path.length > 4096)
        throw new Error('Revision comparison exceeds node/path budget.');
      const mesh = node.getMesh();
      if (
        node
          .listExtensions()
          .some(
            (extension) =>
              extension.extensionName !== MSFT_LOD &&
              extension.extensionName !== 'KHR_node_visibility',
          ) ||
        mesh?.listExtensions().length
      )
        throw new Error(
          'Revision comparison does not support node/mesh extensions (including instancing).',
        );
      const primitives = mesh?.listPrimitives() ?? [];
      const own = new Box3();
      const matrix = parentWorld.clone().multiply(new Matrix4().fromArray(node.getMatrix()));
      if (matrix.elements.some((value) => !Number.isFinite(value)))
        throw new Error('Revision comparison requires finite transforms.');
      for (const primitive of primitives) {
        if (primitive.listTargets().length || primitive.listExtensions().length)
          throw new Error(
            'Revision comparison does not support morph targets or primitive extensions.',
          );
        const position = primitive.getAttribute('POSITION');
        if (position?.getType() !== 'VEC3')
          throw new Error('Revision comparison requires VEC3 positions.');
        const indices = primitive.getIndices();
        const count = indices?.getCount() ?? position.getCount();
        vertices += count;
        if (vertices > MAX_VERTICES)
          throw new Error('Revision comparison exceeds 2,000,000 placed vertices.');
        const element = [0, 0, 0];
        for (let index = 0; index < count; index++) {
          const vertex = indices?.getScalar(index) ?? index;
          if (!Number.isInteger(vertex) || vertex < 0 || vertex >= position.getCount())
            throw new Error('Revision comparison found an invalid vertex index.');
          position.getElement(vertex, element);
          const point = new Vector3(...element).applyMatrix4(matrix);
          if (point.toArray().some((value) => !Number.isFinite(value)))
            throw new Error('Revision comparison requires finite positions.');
          own.expandByPoint(point);
        }
      }
      const hidden = isHiddenGltfNode(node);
      const part: Part = { name, node, world: matrix.toArray(), primitives, bounds: null, hidden };
      parts.set(path, part);
      own.union(visit(node.listChildren(), path, depth + 1, matrix));
      part.bounds = bounds(own);
      if (drawn && !hidden) combined.union(own);
    }
    return combined;
  };
  if (scenes[0]!.listExtensions().length)
    throw new Error('Revision comparison does not support scene extensions.');
  const scenePath = `/${encodeURIComponent(scenes[0]!.getName() || 'Scene')}[0]`;
  // The scene wrapper carries the asset title, not a node identity. Match exported
  // nodes relative to it and expose each revision's real inspection path below.
  const box = visit(scenes[0]!.listChildren(), '', 0, new Matrix4());
  const nodePaths = new Map([...parts].map(([path, part]) => [part.node, path]));
  const animation = new Map<string, AnimationChannelSnapshot>();
  const clipNames = new Set<string>();
  for (const clip of doc.getRoot().listAnimations()) {
    const name = clip.getName();
    if (!name || clipNames.has(name) || clip.listExtensions().length)
      throw new Error('Animation comparison requires unique named clips without extensions.');
    clipNames.add(name);
    for (const channel of clip.listChannels()) {
      const target = channel.getTargetNode(),
        sampler = channel.getSampler();
      const path = target ? nodePaths.get(target) : undefined;
      const property = channel.getTargetPath();
      if (
        !path ||
        !sampler ||
        !property ||
        channel.listExtensions().length ||
        sampler.listExtensions().length
      )
        throw new Error('Animation comparison requires resolved unextended channels and samplers.');
      const key = JSON.stringify([name, path, property]);
      if (animation.has(key))
        throw new Error('Animation comparison cannot match duplicate target channels.');
      animation.set(key, {
        clip: name,
        targetPath: path,
        property,
        fingerprint: JSON.stringify([
          sampler.getInterpolation(),
          await accessorFingerprint(sampler.getInput()),
          await accessorFingerprint(sampler.getOutput()),
        ]),
      });
    }
  }
  return {
    parts,
    animation,
    scenePath,
    bounds: bounds(box),
    // Counted on the same document; the bounds are the ones this comparison reports.
    totals: { ...(await revisionTotals(doc)), bounds: bounds(box) },
    glbSha256: await digest(bytes),
  };
}

function accessorEqual(a: Accessor | null, b: Accessor | null) {
  return a === b || Boolean(a && b && a.equals(b, ACCESSOR_IGNORED));
}

function geometryEqual(a: Primitive, b: Primitive) {
  const semantics = a.listSemantics().sort();
  return (
    a.getMode() === b.getMode() &&
    JSON.stringify(semantics) === JSON.stringify(b.listSemantics().sort()) &&
    accessorEqual(a.getIndices(), b.getIndices()) &&
    semantics.every((semantic) => accessorEqual(a.getAttribute(semantic), b.getAttribute(semantic)))
  );
}

/** Exact exported static data and separate animation channels, not visual equivalence,
 * intent or a collision certificate.
 * Stable named hierarchy paths match nodes. Renames/reparenting appear as add/remove.
 * Material equality follows glTF-Transform's typed graph, including texture bytes and extensions.
 * Unsupported scene structures fail instead of generating a misleading unchanged result. */
export async function compareRevisionGlbs(
  before: Uint8Array,
  after: Uint8Array,
  page: { offset?: number; limit?: number; paths?: string[] } = {},
) {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? 50;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error('Revision comparison page requires offset >= 0 and limit 1..100.');
  if (
    page.paths !== undefined &&
    (page.paths.length < 1 ||
      page.paths.length > 12 ||
      new Set(page.paths).size !== page.paths.length ||
      page.paths.some(
        (path) => typeof path !== 'string' || !path.startsWith('/') || path.length > 4096,
      ))
  )
    throw new Error('Revision comparison paths require 1..12 distinct exact exported-node paths.');
  const previous = await snapshot(before);
  const current = await snapshot(after);
  const subtrees = page.paths?.map((path) => {
    const key = path.startsWith(`${previous.scenePath}/`)
      ? path.slice(previous.scenePath.length)
      : '';
    const part = previous.parts.get(key);
    if (!part)
      throw new Error(
        `Revision comparison baseline has no exported node at ${path}. Copy a node path from inspection; scene wrappers and synthetic primitive children are not comparison nodes.`,
      );
    return {
      key,
      path,
      beforePath: path,
      afterPath: current.parts.has(key) ? `${current.scenePath}${key}` : null,
      summary: { added: 0, removed: 0, changed: 0, unchanged: 0 },
      beforeBounds: part.bounds,
      afterBounds: current.parts.get(key)?.bounds ?? null,
    };
  });
  const changes: Change[] = [];
  const animationSummary = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  const animationChanges: Array<{
    clip: string;
    targetPath: string;
    property: string;
    status: 'added' | 'removed' | 'changed';
  }> = [];
  for (const key of [
    ...new Set([...previous.animation.keys(), ...current.animation.keys()]),
  ].sort()) {
    const a = previous.animation.get(key),
      b = current.animation.get(key);
    const status = !a
      ? 'added'
      : !b
        ? 'removed'
        : a.fingerprint !== b.fingerprint
          ? 'changed'
          : 'unchanged';
    animationSummary[status]++;
    if (status !== 'unchanged') {
      const channel = (b ?? a)!;
      animationChanges.push({
        clip: channel.clip,
        targetPath: `${b ? current.scenePath : previous.scenePath}${channel.targetPath}`,
        property: channel.property,
        status,
      });
    }
  }
  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  // Shared exported resources are common; compare each pair once, including texture bytes.
  const geometryMemo = new Map<Primitive, Map<Primitive, boolean>>();
  const materialMemo = new Map<Material, Map<Material, boolean>>();
  const memo = <T>(cache: Map<T, Map<T, boolean>>, a: T, b: T, equal: () => boolean) => {
    let row = cache.get(a);
    if (!row) {
      row = new Map();
      cache.set(a, row);
    }
    if (!row.has(b)) row.set(b, equal());
    return row.get(b)!;
  };
  for (const path of [...new Set([...previous.parts.keys(), ...current.parts.keys()])].sort()) {
    const a = previous.parts.get(path),
      b = current.parts.get(path);
    const fields: Field[] = [];
    if (a && b) {
      if (
        a.primitives.length !== b.primitives.length ||
        a.primitives.some(
          (p, i) =>
            !memo(geometryMemo, p, b.primitives[i]!, () => geometryEqual(p, b.primitives[i]!)),
        )
      )
        fields.push('geometry');
      if (
        a.primitives.length !== b.primitives.length ||
        a.primitives.some((p, i) => {
          const am = p.getMaterial(),
            bm = b.primitives[i]!.getMaterial();
          return (
            am !== bm &&
            !(am && bm && memo(materialMemo, am, bm, () => am.equals(bm, MATERIAL_IGNORED)))
          );
        })
      )
        fields.push('material');
      if (
        JSON.stringify([a.node.getMatrix(), a.world]) !==
        JSON.stringify([b.node.getMatrix(), b.world])
      )
        fields.push('transform');
      if (JSON.stringify(a.bounds) !== JSON.stringify(b.bounds)) fields.push('bounds');
      if (a.hidden !== b.hidden) fields.push('visibility');
    }
    const status = !a ? 'added' : !b ? 'removed' : fields.length ? 'changed' : 'unchanged';
    summary[status]++;
    for (const subtree of subtrees ?? []) {
      if (path === subtree.key || path.startsWith(`${subtree.key}/`)) subtree.summary[status]++;
    }
    if (status !== 'unchanged')
      changes.push({
        path: `${b ? current.scenePath : previous.scenePath}${path}`,
        beforePath: a ? `${previous.scenePath}${path}` : null,
        afterPath: b ? `${current.scenePath}${path}` : null,
        name: (b ?? a)!.name,
        status,
        fields,
        beforeBounds: a?.bounds ?? null,
        afterBounds: b?.bounds ?? null,
      });
  }
  return {
    version: 'kiln.revision-comparison.v1' as const,
    scope:
      'Exact exported static mesh data and rest transforms; named hierarchy paths. MSFT_lod lower levels are compared at the path they take beside LOD0, and bounds are LOD0 only. A KHR_node_visibility flag is compared as visibility; the bounds of a part are where it draws when shown, and the bounds of its ancestors count only what draws. Animation channels are reported separately. counts are the drawn triangles, vertices, draw calls and materials render metrics report; geometryIdentical compares the sorted drawn world-space triangles at float32 precision, so node, primitive and vertex order do not count; uvIdentical adds TEXCOORD_0 when the geometry is identical. Normals, colours, skin weights and morph targets are not in the geometry hash. Metadata (including LOD switch thresholds), visual equivalence, intent and physical fit are not assessed.',
    animation: {
      scope:
        'Exact exported channel target, interpolation, key times and values, matched by clip name and node path. Renames are add/remove. Equivalent motions may have different key data; metadata and playback behavior are not assessed.',
      summary: animationSummary,
      changes: animationChanges.slice(offset, offset + limit),
      offset,
      nextOffset: offset + limit < animationChanges.length ? offset + limit : null,
    },
    units: 'asset units' as const,
    before: {
      glbSha256: previous.glbSha256,
      bounds: previous.bounds,
      scenePath: previous.scenePath,
    },
    after: { glbSha256: current.glbSha256, bounds: current.bounds, scenePath: current.scenePath },
    summary,
    ...totalsDelta(previous.totals, current.totals),
    ...(subtrees
      ? {
          subtrees: subtrees.map(({ key, ...subtree }) => ({
            ...subtree,
            status: !current.parts.has(key)
              ? ('removed' as const)
              : subtree.summary.added + subtree.summary.removed + subtree.summary.changed > 0
                ? ('changed' as const)
                : ('unchanged' as const),
          })),
        }
      : {}),
    changes: changes.slice(offset, offset + limit),
    offset,
    nextOffset: offset + limit < changes.length ? offset + limit : null,
  };
}
