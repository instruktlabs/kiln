/**
 * Sizes a GLB can carry.
 *
 * A `range` or `int` parameter that only moves vertices and nodes, each along a straight line,
 * can ride in the file: the default build is the base mesh, each end of the range is a morph
 * target, and one clip per parameter keys the target weights and the node transforms from the
 * minimum (time 0) to the maximum (time 1). A consumer sets the clip's time to set the value.
 *
 * This is decided by building, never by reading source: the builds at the ends must have the
 * default build's structure and differ from it only in vertex positions, normals, tangents and
 * node transforms, and a build halfway along each segment must lie on the straight line
 * within `SHAPE_GAP_METRES`. Anything else stays rebuild-only, with the reason.
 *
 * Each parameter is judged with the others at their defaults. Two carried parameters moved
 * together add their deltas, which is exact only where they do not interact.
 */
import type { Accessor, Document, Node as GltfNode, Primitive } from '@gltf-transform/core';
import * as THREE from 'three';
import { createGltfIO } from './gltf-io';
import { glbJson } from './param-bindings';
import type { IntParamV1, ParamsDeclarationV1, ParamValue, RangeParamV1 } from './params';

/** A carried parameter's clip is named this plus the parameter's name. */
export const PARAM_CLIP_PREFIX = 'kiln.param.';
/** How far a halfway build may be from the straight line; a thousandth of the asset if smaller. */
export const SHAPE_GAP_METRES = 0.0005;

export type ShapeRebuildReason =
  /** Nodes, meshes, materials, vertex counts or anything else in the JSON differs. */
  | 'STRUCTURE_CHANGED'
  /** Indices, UVs, colours, textures, instances or animation data differ. */
  | 'DATA_CHANGED'
  /** The asset already has morph targets of its own. */
  | 'HAS_MORPH_TARGETS'
  /** A halfway build is off the straight line between its ends. */
  | 'NOT_LINEAR'
  /** No vertex and no node moves with this parameter. */
  | 'NO_CHANGE'
  /** A build at one of its values failed. */
  | 'PROBE_FAILED';

export interface MorphShapeV1 {
  mode: 'morph';
  /** The animation that scrubs this parameter: its name and its index in the written file. */
  clip: string;
  animation: number;
  /** Clip time for each built value, ascending: the minimum, the default, the maximum. */
  keys: { time: number; value: number }[];
  /**
   * Each morphed mesh with the target index of each key other than the default, in key order.
   * Setting a target's weight to 1 and the others to 0 gives that end.
   */
  meshes: { index: number; name?: string; targets: number[] }[];
  /** Nodes whose translation, rotation or scale the clip keys. */
  nodes: number[];
  /** The largest distance, in metres, between a halfway build and the straight line. */
  gap: number;
}

export interface RebuildShapeV1 {
  mode: 'rebuild';
  reason: ShapeRebuildReason;
  detail: string;
}

export type ShapeBindingV1 = MorphShapeV1 | RebuildShapeV1;

const DETAIL: Record<ShapeRebuildReason, string> = {
  STRUCTURE_CHANGED:
    'The parameter changes the parts, their order, a vertex count or another value in the file. A GLB carries a size only when every value has the same parts and the same vertices.',
  DATA_CHANGED:
    'The parameter changes indices, texture coordinates, colours, textures, instances or animation data, which a morph target cannot carry.',
  HAS_MORPH_TARGETS: 'The asset already has morph targets of its own.',
  NOT_LINEAR: 'A build halfway along the range is off the straight line between its ends.',
  NO_CHANGE: 'No vertex and no node moves with this parameter at the default values of the others.',
  PROBE_FAILED: 'A build at one of its values failed, so this parameter was not classified.',
};
const rebuild = (reason: ShapeRebuildReason, detail = DETAIL[reason]): RebuildShapeV1 => ({
  mode: 'rebuild',
  reason,
  detail,
});

class NotCarried extends Error {
  constructor(readonly binding: RebuildShapeV1) {
    super(binding.reason);
  }
}

const MORPHED = ['POSITION', 'NORMAL', 'TANGENT'] as const;
type Morphed = (typeof MORPHED)[number];
const EPSILON = 1e-9;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The GLB's JSON without what a carried size may change, and without parameter tags. */
function structure(glb: Uint8Array): string {
  const json = structuredClone(glbJson(glb));
  for (const accessor of Array.isArray(json.accessors) ? json.accessors : []) {
    delete accessor.min;
    delete accessor.max;
  }
  for (const node of Array.isArray(json.nodes) ? json.nodes : [])
    for (const key of ['translation', 'rotation', 'scale', 'matrix']) delete node[key];
  for (const list of [json.nodes, json.materials])
    for (const entry of Array.isArray(list) ? list : []) {
      if (!isRecord(entry.extras)) continue;
      delete entry.extras.kilnParamV1;
      if (!Object.keys(entry.extras).length) delete entry.extras;
    }
  return JSON.stringify(json);
}

interface Loaded {
  glb: Uint8Array;
  doc: Document;
  nodes: GltfNode[];
  primitives: Primitive[][];
}

async function load(glb: Uint8Array): Promise<Loaded> {
  const doc = await createGltfIO().readBinary(glb);
  const root = doc.getRoot();
  return {
    glb,
    doc,
    nodes: root.listNodes(),
    primitives: root.listMeshes().map((mesh) => mesh.listPrimitives()),
  };
}

const floats = (accessor: Accessor | null): Float32Array | undefined => {
  const array = accessor?.getArray();
  return array instanceof Float32Array ? array : undefined;
};

function sameArray(a: ArrayLike<number> | null, b: ArrayLike<number> | null): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Refuse unless `other` is the base build with only positions, normals, tangents and node transforms moved. */
function requireSameBut(base: Loaded, other: Loaded): void {
  if (structure(base.glb) !== structure(other.glb))
    throw new NotCarried(rebuild('STRUCTURE_CHANGED'));
  const morphable = new Set<Accessor>();
  for (const primitive of base.primitives.flat()) {
    if (primitive.listTargets().length) throw new NotCarried(rebuild('HAS_MORPH_TARGETS'));
    for (const semantic of MORPHED) {
      const accessor = primitive.getAttribute(semantic);
      if (!accessor) continue;
      if (!floats(accessor)) throw new NotCarried(rebuild('DATA_CHANGED'));
      morphable.add(accessor);
    }
  }
  const mine = base.doc.getRoot().listAccessors();
  const theirs = other.doc.getRoot().listAccessors();
  if (mine.length !== theirs.length) throw new NotCarried(rebuild('STRUCTURE_CHANGED'));
  for (const [index, accessor] of mine.entries())
    if (!morphable.has(accessor) && !sameArray(accessor.getArray(), theirs[index]!.getArray()))
      throw new NotCarried(rebuild('DATA_CHANGED'));
  const images = other.doc.getRoot().listTextures();
  for (const [index, texture] of base.doc.getRoot().listTextures().entries())
    if (!sameArray(texture.getImage(), images[index]?.getImage() ?? null))
      throw new NotCarried(rebuild('DATA_CHANGED'));
}

type Trs = { t: number[]; r: number[]; s: number[] };
const trs = (node: GltfNode): Trs => ({
  t: node.getTranslation(),
  r: node.getRotation(),
  s: node.getScale(),
});
const moved = (a: readonly number[], b: readonly number[]) =>
  a.some((value, index) => Math.abs(value - b[index]!) > EPSILON);

/** World matrix of every node, each local transform a fraction of the way from `from` to `to`. */
function worldMatrices(from: Loaded, to: Loaded, fraction: number): THREE.Matrix4[] {
  const index = new Map(from.nodes.map((node, i) => [node, i]));
  const world: (THREE.Matrix4 | undefined)[] = from.nodes.map(() => undefined);
  const resolve = (i: number): THREE.Matrix4 => {
    const known = world[i];
    if (known) return known;
    const a = trs(from.nodes[i]!);
    const b = trs(to.nodes[i]!);
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(a.t).lerp(new THREE.Vector3().fromArray(b.t), fraction),
      new THREE.Quaternion().fromArray(a.r).slerp(new THREE.Quaternion().fromArray(b.r), fraction),
      new THREE.Vector3().fromArray(a.s).lerp(new THREE.Vector3().fromArray(b.s), fraction),
    );
    const parent = from.nodes[i]!.getParentNode();
    const matrix = parent ? resolve(index.get(parent)!).clone().multiply(local) : local;
    world[i] = matrix;
    return matrix;
  };
  return from.nodes.map((_, i) => resolve(i));
}

/** Calls `visit` with each mesh vertex's world position, for a build partway from `from` to `to`. */
function eachWorldVertex(
  from: Loaded,
  to: Loaded,
  fraction: number,
  visit: (x: number, y: number, z: number) => void,
): void {
  const world = worldMatrices(from, to, fraction);
  const meshes = from.doc.getRoot().listMeshes();
  const v = new THREE.Vector3();
  for (const [n, node] of from.nodes.entries()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = meshes.indexOf(mesh);
    for (const [p, primitive] of from.primitives[m]!.entries()) {
      const a = floats(primitive.getAttribute('POSITION'));
      const b = floats(to.primitives[m]![p]!.getAttribute('POSITION'));
      if (!a || !b) continue;
      for (let i = 0; i < a.length; i += 3) {
        v.set(
          a[i]! + fraction * (b[i]! - a[i]!),
          a[i + 1]! + fraction * (b[i + 1]! - a[i + 1]!),
          a[i + 2]! + fraction * (b[i + 2]! - a[i + 2]!),
        ).applyMatrix4(world[n]!);
        visit(v.x, v.y, v.z);
      }
    }
  }
}

/** The largest distance between the halfway build and the straight line from `base` to `end`. */
function lineGap(base: Loaded, end: Loaded, middle: Loaded, fraction: number): number {
  const line: number[] = [];
  eachWorldVertex(base, end, fraction, (x, y, z) => line.push(x, y, z));
  let gap = 0;
  let at = 0;
  eachWorldVertex(middle, middle, 0, (x, y, z) => {
    gap = Math.max(gap, Math.hypot(x - line[at]!, y - line[at + 1]!, z - line[at + 2]!));
    at += 3;
  });
  return gap;
}

function assetSize(base: Loaded): number {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  eachWorldVertex(base, base, 0, (x, y, z) => box.expandByPoint(v.set(x, y, z)));
  return box.isEmpty() ? 0 : Math.max(...box.getSize(v).toArray());
}

/** The value halfway between two built values that the declaration allows, if there is one. */
function halfway(spec: RangeParamV1 | IntParamV1, a: number, b: number): number | undefined {
  let middle = (a + b) / 2;
  if (spec.type === 'int') middle = Math.round(middle);
  else if (spec.snap && spec.step)
    middle = spec.min + Math.round((middle - spec.min) / spec.step) * spec.step;
  return middle === a || middle === b ? undefined : middle;
}

interface Measured {
  name: string;
  spec: RangeParamV1 | IntParamV1;
  /** The built ends other than the default, ascending. */
  ends: { value: number; build: Loaded }[];
  gap: number;
}

async function measure(
  name: string,
  spec: RangeParamV1 | IntParamV1,
  base: Loaded,
  tolerance: number,
  buildWith: (values: Record<string, ParamValue>) => Promise<Uint8Array>,
): Promise<Measured> {
  const build = async (value: number) => {
    let glb: Uint8Array;
    try {
      glb = await buildWith({ [name]: value });
    } catch {
      throw new NotCarried(rebuild('PROBE_FAILED'));
    }
    const loaded = await load(glb);
    requireSameBut(base, loaded);
    return loaded;
  };
  const ends: Measured['ends'] = [];
  for (const value of [spec.min, spec.max])
    if (value !== spec.default) ends.push({ value, build: await build(value) });
  const changes = ends.some(
    (end) =>
      end.build.nodes.some((node, i) => {
        const a = trs(base.nodes[i]!);
        const b = trs(node);
        return moved(a.t, b.t) || moved(a.r, b.r) || moved(a.s, b.s);
      }) ||
      end.build.primitives.some((list, m) =>
        list.some((primitive, p) =>
          MORPHED.some(
            (semantic) =>
              !sameArray(
                primitive.getAttribute(semantic)?.getArray() ?? null,
                base.primitives[m]![p]!.getAttribute(semantic)?.getArray() ?? null,
              ),
          ),
        ),
      ),
  );
  if (!changes) throw new NotCarried(rebuild('NO_CHANGE'));
  let gap = 0;
  for (const end of ends) {
    const middle = halfway(spec, spec.default, end.value);
    if (middle === undefined) continue;
    const fraction = (middle - spec.default) / (end.value - spec.default);
    gap = Math.max(gap, lineGap(base, end.build, await build(middle), fraction));
  }
  if (gap > tolerance)
    throw new NotCarried(
      rebuild(
        'NOT_LINEAR',
        `A build halfway along the range is up to ${(gap * 1000).toFixed(1)} mm off the straight line between its ends (${(tolerance * 1000).toFixed(2)} mm allowed).`,
      ),
    );
  return { name, spec, ends, gap };
}

const timeOf = (spec: RangeParamV1 | IntParamV1, value: number) =>
  (value - spec.min) / (spec.max - spec.min);

/**
 * Write every carried size of `declaration` into a copy of `defaultGlb` (the default build, with
 * or without parameter tags) and report each `range` and `int` parameter. `buildWith` builds the
 * program at one parameter's value with the others at their defaults; it is called for each end
 * of each range and for one value halfway along each segment. The bytes are returned untouched
 * when nothing is carried.
 */
export async function carryShapes(
  defaultGlb: Uint8Array,
  declaration: ParamsDeclarationV1,
  buildWith: (values: Record<string, ParamValue>) => Promise<Uint8Array>,
): Promise<{ glb: Uint8Array; shapes: Record<string, ShapeBindingV1> }> {
  const sizes = Object.entries(declaration.params).filter(
    (entry): entry is [string, RangeParamV1 | IntParamV1] =>
      (entry[1].type === 'range' || entry[1].type === 'int') && entry[1].min < entry[1].max,
  );
  const shapes: Record<string, ShapeBindingV1> = {};
  if (!sizes.length) return { glb: defaultGlb, shapes };
  const base = await load(defaultGlb);
  const size = assetSize(base);
  const tolerance = Math.min(SHAPE_GAP_METRES, size / 1000);
  const carried: Measured[] = [];
  for (const [name, spec] of sizes) {
    try {
      carried.push(await measure(name, spec, base, tolerance, buildWith));
    } catch (error) {
      if (!(error instanceof NotCarried)) throw error;
      shapes[name] = error.binding;
    }
  }
  if (!carried.length) return { glb: defaultGlb, shapes };

  // Written into a fresh copy, so the builds compared above stay as they were built.
  const out = await load(defaultGlb);
  const doc = out.doc;
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const meshes = doc.getRoot().listMeshes();
  const delta = (
    m: number,
    p: number,
    semantic: Morphed,
    end: Loaded,
  ): Float32Array<ArrayBuffer> => {
    const a = floats(base.primitives[m]![p]!.getAttribute(semantic))!;
    const b = floats(end.primitives[m]![p]!.getAttribute(semantic))!;
    // A tangent's fourth component is a sign, which a morph target does not carry.
    const width = semantic === 'TANGENT' ? 4 : 3;
    const result = new Float32Array((a.length / width) * 3);
    for (let i = 0, o = 0; i < a.length; i += width, o += 3)
      for (let k = 0; k < 3; k++) result[o + k] = b[i + k]! - a[i + k]!;
    return result;
  };
  const differs = (m: number, p: number, semantic: Morphed, end: Loaded) =>
    base.primitives[m]![p]!.getAttribute(semantic) !== null &&
    delta(m, p, semantic, end).some((value) => Math.abs(value) > EPSILON);

  // Which meshes each parameter morphs, and which attributes any target of a primitive needs:
  // every target of a primitive carries the same attributes, and every primitive of a mesh the
  // same number of targets.
  const morphedBy = carried.map((entry) =>
    meshes.map((_, m) =>
      entry.ends.some((end) =>
        base.primitives[m]!.some((_p, p) => MORPHED.some((s) => differs(m, p, s, end.build))),
      ),
    ),
  );
  const needs = (m: number, p: number, semantic: Morphed) =>
    semantic === 'POSITION' ||
    carried.some((entry) => entry.ends.some((end) => differs(m, p, semantic, end.build)));
  const targetNames: string[][] = meshes.map(() => []);
  const targetOf = carried.map((entry) => entry.ends.map(() => meshes.map(() => -1)));
  for (const [c, entry] of carried.entries())
    for (const [e, end] of entry.ends.entries())
      for (const [m, mesh] of meshes.entries()) {
        if (!morphedBy[c]![m]) continue;
        targetOf[c]![e]![m] = targetNames[m]!.length;
        targetNames[m]!.push(`${entry.name}=${end.value}`);
        for (const [p, primitive] of mesh.listPrimitives().entries()) {
          // The writer takes `extras.targetNames` from the first primitive's target names.
          const target = doc.createPrimitiveTarget(`${entry.name}=${end.value}`);
          for (const semantic of MORPHED)
            if (needs(m, p, semantic))
              target.setAttribute(
                semantic,
                doc
                  .createAccessor()
                  .setType('VEC3')
                  .setArray(delta(m, p, semantic, end.build))
                  .setBuffer(buffer),
              );
          primitive.addTarget(target);
        }
      }
  for (const [m, mesh] of meshes.entries()) {
    if (!targetNames[m]!.length) continue;
    mesh.setWeights(targetNames[m]!.map(() => 0));
  }

  const scalar = (values: number[], type: 'SCALAR' | 'VEC3' | 'VEC4' = 'SCALAR') =>
    doc.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
  const written: { entry: Measured; keys: MorphShapeV1['keys']; nodes: number[]; c: number }[] = [];
  for (const [c, entry] of carried.entries()) {
    const values = [...entry.ends.map((end) => end.value), entry.spec.default].sort(
      (a, b) => a - b,
    );
    const keys = values.map((value) => ({ time: timeOf(entry.spec, value), value }));
    const at = (value: number): Loaded =>
      entry.ends.find((end) => end.value === value)?.build ?? base;
    const input = scalar(keys.map((key) => key.time));
    const animation = doc.createAnimation(`${PARAM_CLIP_PREFIX}${entry.name}`);
    const channel = (
      node: GltfNode,
      path: 'weights' | 'translation' | 'rotation' | 'scale',
      output: Accessor,
    ) => {
      const sampler = doc
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation('LINEAR');
      animation
        .addSampler(sampler)
        .addChannel(
          doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler),
        );
    };
    const keyed: number[] = [];
    for (const [n, node] of out.nodes.entries()) {
      const mesh = node.getMesh();
      const m = mesh ? meshes.indexOf(mesh) : -1;
      if (m >= 0 && morphedBy[c]![m]) {
        const weights: number[] = [];
        for (const key of keys)
          for (let target = 0; target < targetNames[m]!.length; target++)
            weights.push(
              entry.ends.some((end, e) => end.value === key.value && targetOf[c]![e]![m] === target)
                ? 1
                : 0,
            );
        channel(node, 'weights', scalar(weights));
      }
      const poses = keys.map((key) => trs(at(key.value).nodes[n]!));
      const rest = trs(base.nodes[n]!);
      let any = false;
      for (const [path, part, type] of [
        ['translation', 't', 'VEC3'],
        ['rotation', 'r', 'VEC4'],
        ['scale', 's', 'VEC3'],
      ] as const) {
        if (!poses.some((pose) => moved(pose[part], rest[part]))) continue;
        channel(
          node,
          path,
          scalar(
            poses.flatMap((pose) => pose[part]),
            type,
          ),
        );
        any = true;
      }
      if (any) keyed.push(n);
    }
    written.push({ entry, keys, nodes: keyed, c });
  }

  const glb = await createGltfIO().writeBinary(doc);
  const json = glbJson(glb);
  const animations = (Array.isArray(json.animations) ? json.animations : []) as { name?: string }[];
  for (const { entry, keys, nodes, c } of written) {
    const clip = `${PARAM_CLIP_PREFIX}${entry.name}`;
    shapes[entry.name] = {
      mode: 'morph',
      clip,
      animation: animations.findIndex((animation) => animation.name === clip),
      keys,
      meshes: meshes.flatMap((mesh, m) =>
        morphedBy[c]![m]
          ? [
              {
                index: m,
                ...(mesh.getName() ? { name: mesh.getName() } : {}),
                targets: entry.ends.map((_end, e) => targetOf[c]![e]![m]!),
              },
            ]
          : [],
      ),
      nodes,
      gap: entry.gap,
    };
  }
  return { glb, shapes };
}
