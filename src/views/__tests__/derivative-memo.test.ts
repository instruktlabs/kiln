import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { renderSceneToGLB } from '../../render';
import { loadGlbReviewScene } from '../glb';
import {
  createDerivativeGlbMemo,
  derivativeStateKey,
  registerReviewArtifact,
} from '../derivative-memo';

const SHA = 'sha256:aaaa';

async function fixtureBytes(): Promise<Uint8Array> {
  const root = new THREE.Group();
  root.name = 'Root';
  const left = new THREE.Group();
  left.name = 'Left';
  left.position.set(-1, 0, 0);
  const right = new THREE.Group();
  right.name = 'Right';
  right.position.set(1, 0, 0);
  const red = new THREE.MeshStandardMaterial({ color: '#cc3333' });
  const blue = new THREE.MeshStandardMaterial({ color: '#3333cc' });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red);
  box.name = 'Box';
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), blue);
  ball.name = 'Ball';
  left.add(box);
  right.add(ball);
  root.add(left, right);
  return Uint8Array.from(
    (await renderSceneToGLB(root, { derivative: true, gltfExporter: 'three' })).bytes,
  );
}

async function loaded(bytes: Uint8Array, sha = SHA) {
  const { root } = await loadGlbReviewScene(bytes);
  registerReviewArtifact(root, sha);
  return root as THREE.Object3D;
}

const find = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!;

describe('derivative memo under concurrent calls', () => {
  test('two calls producing one key store it once, and later stores still fit', async () => {
    const memo = createDerivativeGlbMemo(100);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const produce = async () => {
      await gate;
      return new Uint8Array(40);
    };
    const both = Promise.all([memo.bytes('k', produce), memo.bytes('k', produce)]);
    release();
    await both;
    expect(memo.stats()).toMatchObject({ entries: 1, bytes: 40 });
    await memo.bytes('other', async () => new Uint8Array(70));
    expect(memo.stats()).toMatchObject({ entries: 1, bytes: 70 });
    await memo.bytes('third', async () => new Uint8Array(70));
    expect(memo.stats()).toMatchObject({ entries: 1, bytes: 70 });
  });
});
const meshes = (root: THREE.Object3D) => {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) found.push(node as THREE.Mesh);
  });
  return found;
};

describe('derivative state key', () => {
  test('two loads of the same artifact bytes share a key', async () => {
    const bytes = await fixtureBytes();
    const a = await loaded(bytes);
    const b = await loaded(bytes);
    const key = derivativeStateKey(a, {});
    expect(key).toBeString();
    expect(derivativeStateKey(b, {})).toBe(key!);
  });

  test('an unregistered scene, or a node added after registration, has no key', async () => {
    const bytes = await fixtureBytes();
    const { root } = await loadGlbReviewScene(bytes);
    expect(derivativeStateKey(root, {})).toBeUndefined();
    const registered = await loaded(bytes);
    registered.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    expect(derivativeStateKey(registered, {})).toBeUndefined();
  });

  test('another artifact hash or other export options change the key', async () => {
    const bytes = await fixtureBytes();
    const a = await loaded(bytes);
    const b = await loaded(bytes, 'sha256:bbbb');
    const key = derivativeStateKey(a, {});
    expect(derivativeStateKey(b, {})).not.toBe(key!);
    expect(derivativeStateKey(a, { backfaceCull: false })).not.toBe(key!);
    expect(derivativeStateKey(a, { requirements: { profile: 'x' } })).not.toBe(key!);
  });

  test('every scene change an export reads changes the key, and undoing it restores the key', async () => {
    const root = await loaded(await fixtureBytes());
    const key = derivativeStateKey(root, {})!;
    const [box, ball] = meshes(root) as [THREE.Mesh, THREE.Mesh];
    /** Set one field and return how to put it back. */
    const set = <T extends object, K extends keyof T>(target: T, field: K, value: T[K]) => {
      const own = target[field];
      target[field] = value;
      return () => {
        target[field] = own;
      };
    };
    const changes: Array<[string, () => () => void]> = [
      ['a hidden mesh', () => set(box, 'visible', false)],
      ['a hidden group', () => set(find(root, 'Left'), 'visible', false)],
      ['a moved node', () => set(find(root, 'Right').position, 'x', 2)],
      ['a rotated node', () => set(find(root, 'Right').rotation, 'y', 0.5)],
      [
        'another geometry on a mesh',
        () => {
          const own = box.geometry;
          box.geometry = ball.geometry;
          return () => (box.geometry = own);
        },
      ],
      [
        'another material on a mesh',
        () => {
          const own = box.material;
          box.material = ball.material;
          return () => (box.material = own);
        },
      ],
      [
        'an edited material',
        () => {
          const material = box.material as THREE.MeshStandardMaterial;
          material.needsUpdate = true;
          return () => {};
        },
      ],
      [
        'a fresh attribute in place of one',
        () => {
          const own = box.geometry.getAttribute('position');
          box.geometry.setAttribute('position', own.clone());
          return () => box.geometry.setAttribute('position', own);
        },
      ],
      [
        'a recoloured material, without needsUpdate',
        () => {
          const color = (box.material as THREE.MeshStandardMaterial).color;
          const own = color.getHex();
          color.setHex(0x00ff00);
          return () => color.setHex(own);
        },
      ],
      [
        'a changed opacity, without needsUpdate',
        () => set(box.material as THREE.MeshStandardMaterial, 'opacity', 0.5),
      ],
      [
        'a texture added to a material',
        () => set(box.material as THREE.MeshStandardMaterial, 'map', new THREE.Texture()),
      ],
      [
        'an edited vertex buffer',
        () => {
          box.geometry.getAttribute('position').needsUpdate = true;
          return () => {};
        },
      ],
      [
        // A level-of-detail swap: one node takes another's place in the tree.
        'a reparented node',
        () => {
          const right = find(root, 'Right');
          const left = find(root, 'Left');
          left.add(right);
          return () => root.add(right);
        },
      ],
    ];
    for (const [name, apply] of changes) {
      const before = derivativeStateKey(root, {});
      const undo = apply();
      const changed = derivativeStateKey(root, {});
      expect({ name, changed: changed !== before }).toEqual({ name, changed: true });
      undo();
    }
    // Version bumps cannot be undone, so only the reversible changes restore the first key.
    const fresh = await loaded(await fixtureBytes());
    expect(derivativeStateKey(fresh, {})).toBe(key);
  });

  test('a subtree is keyed by its own nodes and placement', async () => {
    const root = await loaded(await fixtureBytes());
    const left = find(root, 'Left');
    const key = derivativeStateKey(left, {});
    expect(key).toBeString();
    expect(key).not.toBe(derivativeStateKey(root, {}));
    find(root, 'Right').position.x++;
    expect(derivativeStateKey(left, {})).toBe(key!);
  });
});

describe('derivative state key, textures, morphs, skins and instances', () => {
  test('a texture transform, a morph weight, a skinned pose and an instance buffer each count', () => {
    const root = new THREE.Group();
    const texture = new THREE.Texture();
    const morphGeometry = new THREE.BoxGeometry();
    morphGeometry.morphAttributes['position'] = [morphGeometry.getAttribute('position').clone()];
    const morphed = new THREE.Mesh(morphGeometry, new THREE.MeshStandardMaterial({ map: texture }));
    morphed.updateMorphTargets();
    root.add(morphed);
    const body = new THREE.Group();
    const skinGeometry = new THREE.BoxGeometry(1, 1, 1);
    const count = skinGeometry.getAttribute('position').count;
    skinGeometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
    );
    skinGeometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(
        Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
        4,
      ),
    );
    const skinned = new THREE.SkinnedMesh(skinGeometry, new THREE.MeshStandardMaterial());
    // The bone sits outside the subtree that holds its skin.
    const bone = new THREE.Bone();
    root.add(bone);
    body.add(skinned);
    root.add(body);
    root.updateMatrixWorld(true);
    skinned.bind(new THREE.Skeleton([bone]));
    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial(),
      2,
    );
    root.add(instanced);
    registerReviewArtifact(root, SHA);

    const changes: Array<[string, unknown, () => void, () => void]> = [
      ['a moved texture', root, () => texture.offset.set(0.5, 0), () => texture.offset.set(0, 0)],
      [
        'a morph weight',
        root,
        () => (morphed.morphTargetInfluences![0] = 0.5),
        () => (morphed.morphTargetInfluences![0] = 0),
      ],
      ['a skinned pose', body, () => (bone.rotation.z = 0.5), () => (bone.rotation.z = 0)],
    ];
    for (const [name, keyed, apply, undo] of changes) {
      const before = derivativeStateKey(keyed, {});
      expect(before).toBeString();
      apply();
      expect({ name, changed: derivativeStateKey(keyed, {}) !== before }).toEqual({
        name,
        changed: true,
      });
      undo();
      expect({ name, restored: derivativeStateKey(keyed, {}) === before }).toEqual({
        name,
        restored: true,
      });
    }
    const whole = derivativeStateKey(root, {});
    instanced.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0, 0));
    instanced.instanceMatrix.needsUpdate = true;
    expect(derivativeStateKey(root, {})).not.toBe(whole!);
  });
});

describe('derivative GLB memo', () => {
  test('returns a copy of the stored bytes and exports only on a miss', async () => {
    const memo = createDerivativeGlbMemo();
    let exports = 0;
    const produce = async () => {
      exports++;
      return new Uint8Array([1, 2, 3]);
    };
    const first = await memo.bytes('k', produce);
    first[0] = 9;
    expect(await memo.bytes('k', produce)).toEqual(new Uint8Array([1, 2, 3]));
    expect(exports).toBe(1);
    await memo.bytes(undefined, produce);
    await memo.bytes(undefined, produce);
    expect(exports).toBe(3);
  });

  test('holds no more bytes than its budget, oldest out first', async () => {
    const memo = createDerivativeGlbMemo(5);
    let exports = 0;
    const produce = (n: number) => async () => {
      exports++;
      return new Uint8Array(n);
    };
    await memo.bytes('a', produce(2));
    await memo.bytes('b', produce(2));
    await memo.bytes('c', produce(2));
    expect(memo.stats()).toEqual({ entries: 2, bytes: 4, maxBytes: 5 });
    await memo.bytes('c', produce(2));
    await memo.bytes('b', produce(2));
    expect(exports).toBe(3);
    await memo.bytes('a', produce(2));
    expect(exports).toBe(4);
    await memo.bytes('big', produce(6));
    expect(memo.stats().entries).toBe(2);
  });

  test('a failed export is not stored', async () => {
    const memo = createDerivativeGlbMemo();
    await expect(memo.bytes('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    expect(memo.stats().entries).toBe(0);
  });
});
