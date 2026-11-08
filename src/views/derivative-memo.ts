import { createHash } from 'node:crypto';
import type {
  BufferAttribute,
  BufferGeometry,
  InterleavedBufferAttribute,
  Material,
  Mesh,
  Object3D,
  SkinnedMesh,
} from 'three';

/**
 * A review shot sends the GPU a derivative GLB: the review scene, exported as it stands for that
 * shot. Shots of one scene state, and later calls on the same artifact, export the same bytes,
 * and on a large asset each export costs seconds. This memo keeps those bytes under a key that
 * names the artifact and everything about the scene that the export reads.
 *
 * The key is built from the scene, not from the shot request. A shot changes the scene by
 * hiding meshes, swapping a level of detail into another's place, or posing a clip; each of those
 * shows in the key, so a request input nobody listed cannot reuse stale bytes. A scene is keyed
 * only once it is registered with the hash of the GLB it was loaded from, and only while every
 * node, geometry and material in it was there at registration.
 */

interface Registration {
  artifact: string;
  ids: WeakMap<object, number>;
}

const registrations = new WeakMap<object, Registration>();

/** Number every node, geometry and material of a review scene just loaded from `artifact`. */
export function registerReviewArtifact(root: unknown, artifact: string): void {
  const scene = root as Object3D;
  const registration: Registration = { artifact, ids: new WeakMap() };
  let next = 0;
  const number = (value: object) => {
    if (!registration.ids.has(value)) registration.ids.set(value, next++);
  };
  scene.traverse((node) => {
    number(node);
    registrations.set(node, registration);
    const mesh = node as Mesh;
    if (mesh.geometry) number(mesh.geometry);
    if (mesh.material)
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        number(material);
  });
}

class Unkeyable extends Error {}

/** An interleaved attribute's edits bump its shared buffer's version. */
const versionOf = (attribute: BufferAttribute | InterleavedBufferAttribute) =>
  (attribute as InterleavedBufferAttribute).isInterleavedBufferAttribute
    ? (attribute as InterleavedBufferAttribute).data.version
    : (attribute as BufferAttribute).version;

function geometryState(geometry: BufferGeometry, id: (value: object) => number): unknown[] {
  const attributes = Object.keys(geometry.attributes)
    .sort()
    .map((name) => [name, versionOf(geometry.attributes[name]!)]);
  const morphAttributes = geometry.morphAttributes as Record<
    string,
    Array<BufferAttribute | InterleavedBufferAttribute>
  >;
  const morphs = Object.keys(morphAttributes)
    .sort()
    .map((name) => [name, morphAttributes[name]!.map(versionOf)]);
  return [
    id(geometry),
    attributes,
    morphs,
    geometry.index?.version ?? null,
    geometry.drawRange.start,
    Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : null,
    geometry.groups.map((group) => [group.start, group.count, group.materialIndex ?? null]),
  ];
}

function nodeState(node: Object3D, id: (value: object) => number): unknown[] {
  const state: unknown[] = [
    id(node),
    node.parent ? id(node.parent) : null,
    node.name,
    node.visible,
    node.position.toArray(),
    node.quaternion.toArray(),
    node.scale.toArray(),
    node.matrixAutoUpdate,
    Array.from(node.matrix.elements),
    JSON.stringify(node.userData),
  ];
  const mesh = node as Mesh;
  if (mesh.geometry) state.push(geometryState(mesh.geometry, id));
  if (mesh.material) {
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    state.push(materials.map((material) => [id(material), material.version, material.side]));
  }
  if (mesh.morphTargetInfluences) state.push(Array.from(mesh.morphTargetInfluences));
  const skinned = node as SkinnedMesh;
  if (skinned.isSkinnedMesh)
    state.push(
      Array.from(skinned.bindMatrix.elements),
      skinned.bindMode,
      skinned.skeleton.bones.map((bone) => id(bone)),
    );
  return state;
}

/**
 * The key of `root` as an export would read it now, with the export's own `options`, or
 * `undefined` when the scene is not registered, holds something added since, or cannot be
 * described as data.
 */
export function derivativeStateKey(root: unknown, options: unknown): string | undefined {
  const scene = root as Object3D;
  const registration = registrations.get(scene);
  if (!registration) return undefined;
  const id = (value: object) => {
    const known = registration.ids.get(value);
    if (known === undefined) throw new Unkeyable();
    return known;
  };
  try {
    const nodes: unknown[] = [];
    scene.traverse((node) => {
      if (registrations.get(node) !== registration) throw new Unkeyable();
      nodes.push(nodeState(node, id));
    });
    // A subtree's placement is its ancestors'.
    const ancestors: unknown[] = [];
    for (let node = scene.parent; node; node = node.parent) ancestors.push(nodeState(node, id));
    return createHash('sha256')
      .update(
        JSON.stringify({
          version: 'kiln.derivative-memo.v1',
          artifact: registration.artifact,
          options,
          nodes,
          ancestors,
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
        while (held + produced.byteLength > maxBytes) {
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
