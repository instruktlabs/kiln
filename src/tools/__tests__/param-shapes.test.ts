/**
 * `range` and `int` parameters a GLB can carry as morph targets: a size that only moves
 * vertices and nodes in a straight line is written as targets and one scrub clip, and the
 * carried file, loaded by three.js and set to a value, matches a rebuild at that value.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { exportAssetGlb } from '../../asset-export';
import { FileAssetLibrary } from '../../assets-node';
import { carryShapes, classifyShapes, PARAM_CLIP_PREFIX } from '../../param-shapes';
import type { ParamsDeclarationV1, ParamValue } from '../../params';
import { MemoryProgramStore } from '../../program-store';
import { renderGLBInProcess } from '../../render';
import { createKilnProgramToolRegistry } from '../registry';

// `width` stretches the board and moves the sides: straight lines. `bays` changes how many
// dividers there are. `bow` lifts the board by its square: not a straight line.
const CODE = `const meta = { name: 'Shelf' };
const P = defineParams({
  width: { type: 'range', default: 1.0, min: 0.6, max: 1.6, unit: 'm' },
  bays: { type: 'int', default: 2, min: 1, max: 4 },
  bow: { type: 'range', default: 0, min: 0, max: 0.2 },
});
function build() {
  const root = createRoot('Shelf');
  const wood = gameMaterial(0x8a5a33);
  createPart('Board', boxGeo(0.3, 0.04, P.width), wood, { parent: root, position: [0, 0.52 + P.bow * P.bow * 10, 0] });
  createPart('Left', boxGeo(0.3, 0.5, 0.04), wood, { parent: root, position: [0, 0.25, -P.width / 2 + 0.02] });
  createPart('Right', boxGeo(0.3, 0.5, 0.04), wood, { parent: root, position: [0, 0.25, P.width / 2 - 0.02] });
  for (let i = 1; i < P.bays; i++)
    createPart('Divider' + i, boxGeo(0.28, 0.5, 0.02), wood, { parent: root, position: [0, 0.25, -P.width / 2 + (P.width * i) / P.bays] });
  return root;
}`;

const declaration: ParamsDeclarationV1 = {
  schemaVersion: 1,
  params: {
    width: { type: 'range', default: 1.0, min: 0.6, max: 1.6, unit: 'm' },
    bays: { type: 'int', default: 2, min: 1, max: 4 },
    bow: { type: 'range', default: 0, min: 0, max: 0.2 },
  },
};
const buildWith = async (values: Record<string, ParamValue>) =>
  (await renderGLBInProcess(CODE, { params: { values } })).glb;
const parse = (glb: Uint8Array) => new GLTFLoader().parseAsync(Uint8Array.from(glb).buffer, '');

/** World position of every vertex of every mesh, morph targets applied, keyed by mesh name. */
function worldPositions(scene: THREE.Object3D): Map<string, number[]> {
  scene.updateMatrixWorld(true);
  const out = new Map<string, number[]>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    const targets = mesh.geometry.morphAttributes.position ?? [];
    const list: number[] = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      for (const [index, target] of targets.entries()) {
        const weight = mesh.morphTargetInfluences?.[index] ?? 0;
        v.x += weight * target.getX(i);
        v.y += weight * target.getY(i);
        v.z += weight * target.getZ(i);
      }
      v.applyMatrix4(mesh.matrixWorld);
      list.push(v.x, v.y, v.z);
    }
    out.set(mesh.name, list);
  });
  return out;
}

/** The largest distance between matching vertices of two files. */
function largestGap(a: Map<string, number[]>, b: Map<string, number[]>): number {
  expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  let gap = 0;
  for (const [name, list] of a) {
    const other = b.get(name)!;
    expect(other.length).toBe(list.length);
    for (let i = 0; i < list.length; i += 3)
      gap = Math.max(
        gap,
        Math.hypot(
          list[i]! - other[i]!,
          list[i + 1]! - other[i + 1]!,
          list[i + 2]! - other[i + 2]!,
        ),
      );
  }
  return gap;
}

let defaultGlb: Uint8Array;
let carried: Awaited<ReturnType<typeof carryShapes>>;
beforeAll(async () => {
  defaultGlb = await buildWith({});
  carried = await carryShapes(defaultGlb, declaration, buildWith);
}, 120_000);

describe('carryShapes', () => {
  test('a size that moves vertices and nodes in straight lines is carried as morph targets', () => {
    expect(carried.shapes.width).toMatchObject({
      mode: 'morph',
      clip: `${PARAM_CLIP_PREFIX}width`,
      keys: [
        { time: 0, value: 0.6 },
        { time: 0.4, value: 1 },
        { time: 1, value: 1.6 },
      ],
    });
    const width = carried.shapes.width as { gap: number; meshes: unknown[]; nodes: number[] };
    expect(width.gap).toBeLessThan(1e-5);
    expect(width.meshes.length).toBeGreaterThan(0);
    expect(width.nodes.length).toBeGreaterThan(0);
  });

  test('a count that changes the parts, and a size that bends, each need a rebuild', () => {
    expect(carried.shapes.bays).toMatchObject({ mode: 'rebuild', reason: 'STRUCTURE_CHANGED' });
    expect(carried.shapes.bow).toMatchObject({ mode: 'rebuild', reason: 'NOT_LINEAR' });
    expect((carried.shapes.bow as { detail: string }).detail).toMatch(/\d+(\.\d+)? mm/);
  });

  test('untouched, the carried file is the default build', async () => {
    const file = await parse(carried.glb);
    const built = await parse(defaultGlb);
    expect(largestGap(worldPositions(file.scene), worldPositions(built.scene))).toBeLessThan(1e-6);
    expect(file.animations.map((clip) => clip.name)).toEqual([`${PARAM_CLIP_PREFIX}width`]);
  });

  test('each target is named for the parameter value it reaches', async () => {
    const file = await parse(carried.glb);
    const names = new Set<string>();
    file.scene.traverse((object) => {
      const dictionary = (object as THREE.Mesh).morphTargetDictionary;
      for (const name of Object.keys(dictionary ?? {})) names.add(name);
    });
    expect([...names].sort()).toEqual(['width=0.6', 'width=1.6']);
  });

  test('three.js sets the clip to a value and the file matches a rebuild at that value', async () => {
    for (const value of [0.6, 0.8, 1.0, 1.3, 1.6]) {
      const file = await parse(carried.glb);
      const clip = file.animations.find((entry) => entry.name === `${PARAM_CLIP_PREFIX}width`)!;
      const mixer = new THREE.AnimationMixer(file.scene);
      // Clamp at the last key: a looping action wraps time 1 back to the minimum.
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime((value - 0.6) / (1.6 - 0.6));
      const rebuilt = await parse(await buildWith({ width: value }));
      const gap = largestGap(worldPositions(file.scene), worldPositions(rebuilt.scene));
      // Float32 deltas and keyed transforms: well inside the 0.5 mm the classification allows.
      expect(gap).toBeLessThan(1e-4);
    }
  }, 120_000);

  test('a declaration with no size parameter leaves the bytes alone', async () => {
    const none = await carryShapes(defaultGlb, { schemaVersion: 1, params: {} }, buildWith);
    expect(none.glb).toBe(defaultGlb);
    expect(none.shapes).toEqual({});
  });

  test('a failed build is reported for that parameter only', async () => {
    const failing = await carryShapes(defaultGlb, declaration, (values) =>
      'width' in values ? Promise.reject(new Error('no')) : buildWith(values),
    );
    expect(failing.shapes.width).toMatchObject({ mode: 'rebuild', reason: 'PROBE_FAILED' });
    expect(failing.shapes.bays).toMatchObject({ mode: 'rebuild', reason: 'STRUCTURE_CHANGED' });
  }, 120_000);
});

describe('classifyShapes', () => {
  test('decides what carryShapes decides, in declaration order, without writing a file', async () => {
    const classes = await classifyShapes(defaultGlb, declaration, buildWith);
    expect(Object.keys(classes)).toEqual(['width', 'bays', 'bow']);
    expect(classes.width).toEqual({
      mode: 'morph',
      gap: (carried.shapes.width as { gap: number }).gap,
    });
    expect(classes.bays).toEqual(carried.shapes.bays!);
    expect(classes.bow).toEqual(carried.shapes.bow!);
  }, 120_000);
});

describe('a sweep reports which sizes a GLB can carry', () => {
  test('each range and int parameter is listed as carried or rebuild-only, with the reason', async () => {
    const programStore = new MemoryProgramStore();
    const ref = await programStore.put(CODE);
    const render = createKilnProgramToolRegistry({ programStore }).find(
      (def) => def.name === 'kiln_render',
    )!;
    const result = (await render.run({ programRef: ref, params: { sweep: true } })) as {
      sweep: {
        built: number;
        failed: number;
        shapes?: Record<string, { mode: string; gap?: number; reason?: string }>;
      };
    };
    expect(result.sweep.failed).toBe(0);
    expect(Object.keys(result.sweep.shapes ?? {})).toEqual(['width', 'bays', 'bow']);
    expect(result.sweep.shapes?.width?.mode).toBe('morph');
    expect(result.sweep.shapes?.width?.gap).toBeLessThan(1e-5);
    expect(result.sweep.shapes?.bays).toMatchObject({
      mode: 'rebuild',
      reason: 'STRUCTURE_CHANGED',
    });
    expect(result.sweep.shapes?.bow).toMatchObject({ mode: 'rebuild', reason: 'NOT_LINEAR' });
  }, 120_000);

  test('a program with no size parameter reports no shapes', async () => {
    const programStore = new MemoryProgramStore();
    const ref = await programStore.put(
      CODE.replace(
        /defineParams\(\{[\s\S]*?\}\);/,
        "defineParams({ lit: { type: 'toggle', default: true } });",
      )
        .replaceAll('P.width', '1')
        .replaceAll('P.bays', '2')
        .replaceAll('P.bow', '0'),
    );
    const render = createKilnProgramToolRegistry({ programStore }).find(
      (def) => def.name === 'kiln_render',
    )!;
    const result = (await render.run({ programRef: ref, params: { sweep: true } })) as {
      sweep: { built: number; shapes?: unknown };
    };
    expect(result.sweep.built).toBeGreaterThan(0);
    expect(result.sweep.shapes).toBeUndefined();
  }, 60_000);
});

describe('runtime export with carried shapes', () => {
  let root: string;
  let library: FileAssetLibrary;
  let saved: { assetId: string; revisionId: string };
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'kiln-param-shapes-'));
    library = new FileAssetLibrary({ project: root });
    const programStore = new MemoryProgramStore();
    const ref = await programStore.put(CODE);
    const save = createKilnProgramToolRegistry({ assetLibrary: library, programStore }).find(
      (def) => def.name === 'kiln_save',
    )!;
    saved = (
      (await save.run({ programRef: ref, name: 'Shelf', collection: 'project' })) as {
        asset: { assetId: string; revisionId: string };
      }
    ).asset;
  }, 60_000);
  afterAll(() => rm(root, { recursive: true, force: true }));

  test('writes the targets and the clip only when asked, and lists them in the sidecar', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    const plain = await exportAssetGlb(record, { profile: 'runtime' });
    if (plain.profile !== 'runtime') throw new Error('Expected a runtime export');
    expect(JSON.parse(new TextDecoder().decode(plain.metadata.bytes)).params).toBeUndefined();

    const output = await exportAssetGlb(record, { profile: 'runtime', paramBuilds: buildWith });
    if (output.profile !== 'runtime') throw new Error('Expected a runtime export');
    const metadata = JSON.parse(new TextDecoder().decode(output.metadata.bytes));
    expect(metadata.params.shapes.width).toMatchObject({
      mode: 'morph',
      clip: `${PARAM_CLIP_PREFIX}width`,
    });
    expect(metadata.params.shapes.bays.mode).toBe('rebuild');
    const file = await parse(output.glb);
    const index = metadata.params.shapes.width.animation as number;
    expect(file.animations[index]!.name).toBe(`${PARAM_CLIP_PREFIX}width`);
    // The saved revision is unchanged.
    const editable = await exportAssetGlb(record, { profile: 'editable' });
    expect(editable.glb).toEqual(record.files['asset.glb']!);
  }, 120_000);

  test('refuses carried shapes on a derived file', async () => {
    const record = await library.read('project', saved.assetId, saved.revisionId);
    for (const options of [{ target: 'three' as const }, { draws: 'minimal' as const }])
      await expect(
        exportAssetGlb(record, { profile: 'runtime', paramBuilds: buildWith, ...options }),
      ).rejects.toThrow(/Carried shapes/);
  });
});
