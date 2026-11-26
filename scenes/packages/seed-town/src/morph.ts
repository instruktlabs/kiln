/**
 * The sizes of every kit part, applied by one shader node.
 *
 * three keys a shader build by the ids of a geometry's morph attributes, and its morph node reads one texture per
 * geometry, so a town drawn with three's own morph targets builds a program and a pipeline for every sized part, in
 * the camera's pass and again in the sun's shadow pass. Here the kit's targets leave the drawn geometry. All their
 * deltas lie in one texture, each instance's turn and weights in another, and a part tells the shader where its own
 * lie through one uniform. The node is the same for every part, so parts that share a material share a build.
 *
 * three applies a material's positionNode after its instancing, so the node adds the delta already turned by the
 * instance: a placement is a turn about Y and a translation (placementMatrix), and M(p + d) = Mp + Rd. Each instance's
 * row therefore starts with the cosine and sine of its yaw.
 */
import { DataTexture, FloatType, RGBAFormat, RedFormat, Vector4 } from 'three/webgpu';
import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Material, Node, Object3D, Vector3 } from 'three/webgpu';
import { Fn, If, Loop, instanceIndex, int, ivec2, normalLocal, positionLocal, textureLoad, texture, uniform, vec3, vertexIndex } from 'three/tsl';

export const MORPH = {
  /** Texels across both textures. Even: a position delta and its normal delta are neighbours in one row. */
  width: 512,
  /** Texels before an instance's weights: the cosine and sine of its yaw. */
  head: 2,
  /** The weight texture starts this tall and grows by half when a plan outgrows it. */
  rows: 64,
} as const;

/** Where a part's deltas lie: its first row, and how many vertices and targets it has. */
export interface MorphBlock { row: number; vertices: number; targets: number }
export interface DeltaAtlas { data: Float32Array; width: number; height: number; blocks: MorphBlock[] }

type Attribute = BufferAttribute | InterleavedBufferAttribute;

/**
 * Lay the morph targets of these geometries in one RGBA texture, a block of whole rows for each. In a block, target t
 * of vertex v has its position delta at texel (t x vertices + v) x 2 and its normal delta at the next.
 */
export function packDeltas(geometries: readonly BufferGeometry[], width: number = MORPH.width): DeltaAtlas {
  if (width < 2 || width % 2) throw new Error('The morph texture width must be even');
  const blocks: MorphBlock[] = [];
  let row = 0;
  for (const geometry of geometries) {
    const vertices = geometry.getAttribute('position').count, targets = geometry.morphAttributes.position?.length ?? 0;
    blocks.push({ row, vertices, targets });
    row += Math.ceil(targets * vertices * 2 / width);
  }
  const height = Math.max(1, row), data = new Float32Array(width * height * 4);
  geometries.forEach((geometry, part) => {
    const block = blocks[part]!, positions = geometry.morphAttributes.position ?? [], normals = geometry.morphAttributes.normal ?? [];
    const write = (source: Attribute | undefined, target: number, shift: number) => {
      if (!source) return;
      for (let vertex = 0; vertex < block.vertices; vertex++) {
        const at = (block.row * width + (target * block.vertices + vertex) * 2 + shift) * 4;
        data[at] = source.getX(vertex); data[at + 1] = source.getY(vertex); data[at + 2] = source.getZ(vertex);
      }
    };
    for (let target = 0; target < block.targets; target++) { write(positions[target], target, 0); write(normals[target], target, 1); }
  });
  return { data, width, height, blocks };
}

/** The texel of a position delta; the normal delta is the next texel in the row. */
export function deltaTexel(block: MorphBlock, target: number, vertex: number, width: number = MORPH.width): [x: number, y: number] {
  const texel = (target * block.vertices + vertex) * 2;
  return [texel % width, block.row + Math.floor(texel / width)];
}

/** The first weight texel of each mesh, one run after another: per instance the head, then one weight per target. */
export function weightRows(meshes: readonly { count: number; targets: number }[]): { bases: number[]; texels: number } {
  const bases: number[] = [];
  let texels = 0;
  for (const mesh of meshes) { bases.push(texels); texels += mesh.count * (MORPH.head + mesh.targets); }
  return { bases, texels };
}

export interface MorphTextures { deltas: DataTexture; weights: DataTexture }
export interface PartMorph {
  /** One pair of textures for a whole view; a larger weight texture replaces the old one here. */
  shared: MorphTextures;
  /** (first row of the part's deltas, targets, vertices, first texel of the mesh's weights). */
  info: Vector4;
}

export function deltaTexture(atlas: DeltaAtlas): DataTexture {
  const made = new DataTexture(atlas.data, atlas.width, atlas.height, RGBAFormat, FloatType);
  made.name = 'Seed town size deltas';
  made.needsUpdate = true;
  return made;
}

/** A weight texture with room for `texels`, at least as tall as `rows`. */
export function weightTexture(texels: number, rows: number = MORPH.rows): DataTexture {
  const height = Math.max(rows, Math.ceil(texels / MORPH.width));
  const made = new DataTexture(new Float32Array(MORPH.width * height), MORPH.width, height, RedFormat, FloatType);
  made.name = 'Seed town size weights';
  made.needsUpdate = true;
  return made;
}

const bound = new WeakMap<Object3D, PartMorph>();
/** What the node reads when it draws `object`. */
export function bindMorph(object: Object3D, morph: PartMorph): void { bound.set(object, morph); }
export function morphOf(object: Object3D): PartMorph | undefined { return bound.get(object); }

/** The node's arithmetic on the CPU: the turned position and normal deltas of one vertex of one instance. */
export function sampleMorph(morph: PartMorph, instance: number, vertex: number, move: Vector3, bend: Vector3): void {
  const { info, shared } = morph, deltas = shared.deltas.image.data as Float32Array, weights = shared.weights.image.data as Float32Array;
  const block: MorphBlock = { row: info.x, targets: info.y, vertices: info.z }, at = info.w + instance * (MORPH.head + block.targets);
  const cos = weights[at]!, sin = weights[at + 1]!, width = shared.deltas.image.width;
  let mx = 0, my = 0, mz = 0, bx = 0, by = 0, bz = 0;
  for (let target = 0; target < block.targets; target++) {
    const weight = weights[at + MORPH.head + target]!;
    if (!weight) continue;
    const [x, y] = deltaTexel(block, target, vertex, width), texel = (y * width + x) * 4;
    mx += deltas[texel]! * weight; my += deltas[texel + 1]! * weight; mz += deltas[texel + 2]! * weight;
    bx += deltas[texel + 4]! * weight; by += deltas[texel + 5]! * weight; bz += deltas[texel + 6]! * weight;
  }
  move.set(cos * mx + sin * mz, my, cos * mz - sin * mx);
  bend.set(cos * bx + sin * bz, by, cos * bz - sin * bx);
}

// What the node reads while it builds, and for an object nobody bound: no targets, so nothing moves.
const idle: PartMorph = {
  shared: { deltas: deltaTexture({ data: new Float32Array(8), width: 2, height: 1, blocks: [] }), weights: weightTexture(0, 1) },
  info: new Vector4(),
};
const deltaMap = texture(idle.shared.deltas), weightMap = texture(idle.shared.weights);
const part = uniform(idle.info).onObjectUpdate(({ object }) => {
  const morph = (object && bound.get(object)) ?? idle;
  deltaMap.value = morph.shared.deltas;
  weightMap.value = morph.shared.weights;
  return morph.info;
});

/**
 * A material's positionNode: the position three has already instanced, plus this instance's size deltas turned with
 * it. The normal takes its deltas the same way. three copies a material's positionNode onto its shadow material, so
 * the sun's shadow pass moves the same vertices.
 */
export const townMorph: Node = Fn(() => {
  const row = int(part.x), targets = int(part.y), vertices = int(part.z), across = int(MORPH.width);
  const weightAt = (index: Node<'int'>) => {
    const y = index.div(across);
    return textureLoad(weightMap, ivec2(index.sub(y.mul(across)), y)).r;
  };
  const deltaAt = (index: Node<'int'>) => {
    const y = index.div(across);
    return textureLoad(deltaMap, ivec2(index.sub(y.mul(across)), row.add(y))).xyz;
  };
  const first = int(part.w).add(int(instanceIndex).mul(targets.add(MORPH.head))).toVar();
  const cos = weightAt(first).toVar(), sin = weightAt(first.add(1)).toVar();
  const move = vec3(0).toVar(), bend = vec3(0).toVar();
  Loop({ start: int(0), end: targets, type: 'int', condition: '<' }, ({ i }) => {
    const weight = weightAt(first.add(MORPH.head).add(i)).toVar();
    If(weight.notEqual(0), () => {
      const texel = int(i).mul(vertices).add(int(vertexIndex)).mul(2).toVar();
      move.addAssign(deltaAt(texel).mul(weight));
      bend.addAssign(deltaAt(texel.add(1)).mul(weight));
    });
  });
  const turn = (v: Node<'vec3'>) => vec3(cos.mul(v.x).add(sin.mul(v.z)), v.y, cos.mul(v.z).sub(sin.mul(v.x)));
  normalLocal.addAssign(turn(bend));
  return positionLocal.add(turn(move));
})() as unknown as Node;

/** Give a kit material the town's morph node. three carries the property over when it makes the material's node form. */
export function withMorph<T extends Material>(material: T): T {
  const holder = material as T & { positionNode?: Node | null };
  if (holder.positionNode && holder.positionNode !== townMorph) throw new Error(`Material ${material.name} already moves its vertices`);
  holder.positionNode = townMorph;
  return material;
}
