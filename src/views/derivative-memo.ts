import { createHash } from 'node:crypto';
import { reviewLodChains } from './lod';
import type {
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  InterleavedBufferAttribute,
  Material,
  Mesh,
  Object3D,
  SkinnedMesh,
  Texture,
} from 'three';

/**
 * A review shot sends the GPU a derivative GLB: the review scene, exported as it stands for that
 * shot. Shots of one scene state, and later calls on the same artifact, export the same bytes,
 * and on a large asset each export costs seconds. This memo keeps those bytes under a key that
 * names the artifact and everything about the scene that the export reads.
 *
 * The key is built from the scene, not from the shot request, so a request input nobody listed
 * cannot reuse stale bytes. It names:
 * - every node: its identity, its parent's, name, visibility, transform and userData;
 * - every mesh's geometry and each of its attributes (and morph attributes and index) by
 *   identity and edit `version`, its draw range and groups, and its morph weights;
 * - every material property by value, and each texture a material holds by identity, edit
 *   `version` and transform;
 * - every skin's bind matrix and its bones' world poses, and every instance buffer's version;
 * - the subtree's ancestors, the same way.
 *
 * A scene is keyed only once it is registered with the hash of the GLB it was loaded from, and
 * only while every node, geometry, attribute, material and texture in it was there at
 * registration, lower levels of detail included. An export key also describes the levels set
 * aside, so an edit to one shows. Anything new (a fresh attribute, a new texture) gives no key,
 * and the export runs. What the key cannot see is an edit inside an attribute's
 * array or a texture's image that does not bump its `version`. three needs that bump
 * (`needsUpdate`) to draw such an edit too, and no review path makes one.
 */

interface Registration {
  artifact: string;
  ids: WeakMap<object, number>;
}

const registrations = new WeakMap<object, Registration>();

const materialsOf = (mesh: Mesh): Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

/** Number every node, geometry, attribute, material and texture of a scene loaded from `artifact`. */
export function registerReviewArtifact(root: unknown, artifact: string): void {
  const scene = root as Object3D;
  const registration: Registration = { artifact, ids: new WeakMap() };
  let next = 0;
  const number = (value: object) => {
    if (!registration.ids.has(value)) registration.ids.set(value, next++);
  };
  const numberAttribute = (attribute: BufferAttribute | InterleavedBufferAttribute) => {
    number(attribute);
    if ((attribute as InterleavedBufferAttribute).isInterleavedBufferAttribute)
      number((attribute as InterleavedBufferAttribute).data);
  };
  const visit = (node: Object3D) => {
    number(node);
    registrations.set(node, registration);
    const mesh = node as Mesh;
    if (mesh.geometry) {
      number(mesh.geometry);
      for (const attribute of Object.values(mesh.geometry.attributes)) numberAttribute(attribute);
      for (const list of Object.values(
        mesh.geometry.morphAttributes as Record<string, Array<BufferAttribute>>,
      ))
        for (const attribute of list) numberAttribute(attribute);
      if (mesh.geometry.index) number(mesh.geometry.index);
    }
    if (mesh.material)
      for (const material of materialsOf(mesh)) {
        number(material);
        for (const value of Object.values(material))
          if ((value as Texture | null)?.isTexture) number(value as Texture);
      }
  };
  scene.traverse(visit);
  // Lower levels of detail are built beside the scene, detached until a shot draws one.
  for (const chain of reviewLodChains(scene))
    for (const level of chain.levels) level.traverse(visit);
}

class Unkeyable extends Error {}

/** An interleaved attribute's edits bump its shared buffer's version. */
const versionOf = (attribute: BufferAttribute | InterleavedBufferAttribute) =>
  (attribute as InterleavedBufferAttribute).isInterleavedBufferAttribute
    ? (attribute as InterleavedBufferAttribute).data.version
    : (attribute as BufferAttribute).version;

/** An attribute by identity and edit version: a fresh attribute in its place has no id. */
const attributeState = (
  attribute: BufferAttribute | InterleavedBufferAttribute,
  id: (value: object) => number,
) => [
  id(attribute),
  (attribute as InterleavedBufferAttribute).isInterleavedBufferAttribute
    ? id((attribute as InterleavedBufferAttribute).data)
    : null,
  versionOf(attribute),
];

function geometryState(geometry: BufferGeometry, id: (value: object) => number): unknown[] {
  const attributes = Object.keys(geometry.attributes)
    .sort()
    .map((name) => [name, attributeState(geometry.attributes[name]!, id)]);
  const morphAttributes = geometry.morphAttributes as Record<
    string,
    Array<BufferAttribute | InterleavedBufferAttribute>
  >;
  const morphs = Object.keys(morphAttributes)
    .sort()
    .map((name) => [
      name,
      morphAttributes[name]!.map((attribute) => attributeState(attribute, id)),
    ]);
  return [
    id(geometry),
    attributes,
    morphs,
    geometry.index ? [id(geometry.index), geometry.index.version] : null,
    geometry.drawRange.start,
    Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : null,
    geometry.groups.map((group) => [group.start, group.count, group.materialIndex ?? null]),
  ];
}

const textureState = (texture: Texture, id: (value: object) => number) => [
  id(texture),
  texture.version,
  texture.channel,
  texture.offset.toArray(),
  texture.repeat.toArray(),
  texture.center.toArray(),
  texture.rotation,
  texture.matrixAutoUpdate,
  Array.from(texture.matrix.elements),
  texture.wrapS,
  texture.wrapT,
  texture.flipY,
  texture.colorSpace,
  texture.magFilter,
  texture.minFilter,
];

/** Fields that differ between two loads of the same bytes, or that only three's runtime uses. */
const UNSTABLE_MATERIAL_FIELDS = new Set(['uuid', 'id', '_listeners']);

/** Every own property of a material, by value; textures by identity, version and transform. */
function materialState(material: Material, id: (value: object) => number): unknown {
  const fields: unknown[] = [id(material), material.type];
  for (const name of Object.keys(material).sort()) {
    if (UNSTABLE_MATERIAL_FIELDS.has(name)) continue;
    const value = (material as unknown as Record<string, unknown>)[name];
    if (typeof value === 'function') continue;
    if (
      value === null ||
      value === undefined ||
      ['string', 'number', 'boolean'].includes(typeof value)
    )
      fields.push(name, value ?? null);
    else if ((value as Texture).isTexture) fields.push(name, textureState(value as Texture, id));
    else if (typeof (value as { toArray?: unknown }).toArray === 'function')
      fields.push(name, (value as { toArray(): unknown[] }).toArray());
    // `defines`, `userData`, `clippingPlanes` and other plain data. A value that is not data
    // (a cycle, a BigInt) throws here, and the scene has no key.
    else fields.push(name, JSON.stringify(value));
  }
  return fields;
}

/**
 * What a key covers. An `export` key covers everything a derivative export reads. A
 * `geometry` key covers only what decides where drawn vertices land: the tree, visibility,
 * transforms, attributes, morph weights, skins and instances. It leaves out names, userData,
 * materials and textures, which no bounds walk reads.
 */
export type StateKeyScope = 'export' | 'geometry';

function nodeState(
  node: Object3D,
  id: (value: object) => number,
  materials: Map<Material, unknown>,
  scope: StateKeyScope,
): unknown[] {
  const state: unknown[] = [
    id(node),
    node.parent ? id(node.parent) : null,
    node.visible,
    node.position.toArray(),
    node.quaternion.toArray(),
    node.scale.toArray(),
    node.matrixAutoUpdate,
    Array.from(node.matrix.elements),
  ];
  if (scope === 'export') state.push(node.name, JSON.stringify(node.userData));
  const mesh = node as Mesh;
  if (mesh.geometry) state.push(geometryState(mesh.geometry, id));
  if (scope === 'export' && mesh.material)
    state.push(
      materialsOf(mesh).map((material) => {
        // Shared by many meshes: describe each once per key.
        if (!materials.has(material)) materials.set(material, materialState(material, id));
        return id(material);
      }),
    );
  if (mesh.morphTargetInfluences) state.push(Array.from(mesh.morphTargetInfluences));
  const skinned = node as SkinnedMesh;
  if (skinned.isSkinnedMesh)
    state.push(
      Array.from(skinned.bindMatrix.elements),
      skinned.bindMode,
      // A bone may sit outside the keyed subtree; its world pose moves the skin all the same.
      skinned.skeleton.bones.map((bone) => {
        bone.updateWorldMatrix(true, false);
        return [id(bone), Array.from(bone.matrixWorld.elements)];
      }),
    );
  const instanced = node as InstancedMesh;
  if (instanced.isInstancedMesh)
    state.push(
      instanced.count,
      instanced.instanceMatrix.version,
      instanced.instanceColor?.version ?? null,
    );
  return state;
}

/**
 * The key of `root` as an export would read it now, with the export's own `options`, or
 * `undefined` when the scene is not registered, holds something added since, or cannot be
 * described as data.
 */
export function derivativeStateKey(
  root: unknown,
  options: unknown,
  scope: StateKeyScope = 'export',
): string | undefined {
  const scene = root as Object3D;
  const registration = registrations.get(scene);
  if (!registration) return undefined;
  const id = (value: object) => {
    const known = registration.ids.get(value);
    if (known === undefined) throw new Unkeyable();
    return known;
  };
  try {
    const materials = new Map<Material, unknown>();
    const nodes: unknown[] = [];
    scene.traverse((node) => {
      if (registrations.get(node) !== registration) throw new Unkeyable();
      nodes.push(nodeState(node, id, materials, scope));
    });
    // The levels of detail set aside: what a swap would draw, and what it would put back.
    const detached: unknown[] = [];
    if (scope === 'export')
      for (const chain of reviewLodChains(scene))
        for (const member of [chain.base, ...chain.levels])
          if (member.parent === null)
            member.traverse((node) => {
              if (registrations.get(node) !== registration) throw new Unkeyable();
              detached.push(nodeState(node, id, materials, scope));
            });
    // A subtree's placement is its ancestors'.
    const ancestors: unknown[] = [];
    for (let node = scene.parent; node; node = node.parent)
      ancestors.push(nodeState(node, id, materials, scope));
    return createHash('sha256')
      .update(
        JSON.stringify({
          version: 'kiln.derivative-memo.v1',
          scope,
          artifact: registration.artifact,
          options,
          nodes,
          detached,
          ancestors,
          materials: [...materials.values()],
        }),
      )
      .digest('hex');
  } catch {
    return undefined;
  }
}

export interface DerivativeGlbMemo {
  /** The bytes stored under `key`, or `produce`'s, stored when `key` is defined. */
  bytes(key: string | undefined, produce: () => Promise<Uint8Array>): Promise<Uint8Array>;
  stats(): { entries: number; bytes: number; maxBytes: number };
}

/** A byte-bounded store of derivative GLBs, least recently used out first. */
export function createDerivativeGlbMemo(maxBytes = 64 * 1024 * 1024): DerivativeGlbMemo {
  const entries = new Map<string, Uint8Array>();
  let held = 0;
  return {
    async bytes(key, produce) {
      const hit = key === undefined ? undefined : entries.get(key);
      if (hit) {
        entries.delete(key!);
        entries.set(key!, hit);
        return Uint8Array.from(hit);
      }
      const produced = Uint8Array.from(await produce());
      if (key !== undefined && produced.byteLength <= maxBytes) {
        // Two calls on one scene state can both miss and both produce: the later replaces.
        const stored = entries.get(key);
        if (stored) {
          entries.delete(key);
          held -= stored.byteLength;
        }
        while (entries.size > 0 && held + produced.byteLength > maxBytes) {
          const [oldest, value] = entries.entries().next().value!;
          entries.delete(oldest);
          held -= value.byteLength;
        }
        entries.set(key, Uint8Array.from(produced));
        held += produced.byteLength;
      }
      return produced;
    },
    stats: () => ({ entries: entries.size, bytes: held, maxBytes }),
  };
}

/** The host's shared derivative store. Keys name the artifact, so sessions never collide. */
export const derivativeGlbMemo = createDerivativeGlbMemo();
