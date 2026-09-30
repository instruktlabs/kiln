import {
  type Accessor,
  type Material,
  type Node,
  type Primitive,
  PropertyType,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Box3, Matrix4, Vector3 } from 'three';
import { createGltfIO, type Lod, MSFT_LOD } from './gltf-io';

type Bounds = { min: number[]; max: number[]; size: number[] } | null;
type Field = 'geometry' | 'material' | 'transform' | 'bounds';
interface Part {
  name: string;
  node: Node;
  /** World matrix where the node is drawn; a chain's lower level takes LOD0's parent. */
  world: number[];
  primitives: Primitive[];
  bounds: Bounds;
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
        node.listExtensions().some((extension) => extension.extensionName !== MSFT_LOD) ||
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
      const part: Part = { name, node, world: matrix.toArray(), primitives, bounds: null };
      parts.set(path, part);
      own.union(visit(node.listChildren(), path, depth + 1, matrix));
      part.bounds = bounds(own);
      if (drawn) combined.union(own);
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
  return { parts, animation, scenePath, bounds: bounds(box), glbSha256: await digest(bytes) };
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
      'Exact exported static mesh data and rest transforms; named hierarchy paths. MSFT_lod lower levels are compared at the path they take beside LOD0, and bounds are LOD0 only. Animation channels are reported separately. Metadata (including LOD switch thresholds), visual equivalence, intent and physical fit are not assessed.',
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
