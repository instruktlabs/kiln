/**
 * Clip easing (R67).
 *
 * `rotationTrack`, `positionTrack` and `scaleTrack` take CUBICSPLINE (a smooth curve through the
 * keys, tangents computed as PCHIP computes them) and the easing shorthands EASE_IN, EASE_OUT
 * and EASE_IN_OUT, which bake each segment's tangents, so a smooth swing is one key pair. Both
 * exporters write standard glTF CUBICSPLINE samplers and nothing else; source posing, three.js
 * playback of the written bytes, the review scene (native samplers and the review copy) and
 * kiln_screenshot_animation all sample the same curve.
 *
 * Expected values come from closed forms: per segment fraction s, EASE_IN is s^2, EASE_OUT is
 * 2s - s^2 and EASE_IN_OUT is 3s^2 - 2s^3; a rotation eases along the shortest arc between its
 * keys (normalized component-wise, as glTF evaluates CUBICSPLINE rotations).
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAssetIntentV1 } from '../contracts';
import { createClip, positionTrack, rotationTrack } from '../primitives';
import { MemoryProgramStore } from '../program-store';
import { evaluateCharacterQa } from '../qa/character';
import { executeKilnCode, renderGLBInProcess, renderSceneToGLB } from '../render';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { loadGlbReviewScene } from '../views/glb';
import { measureLoopClosure, poseSceneAtTime, prepareClip } from '../views/pose';

const SOURCE = `
const meta = { name: 'Eased motion', category: 'prop' };
function build() {
  const root = createRoot('Root');
  const m = gameMaterial(0x8899aa);
  createPart('Door', boxGeo(1, 2, 0.1), m, { parent: root, position: [0, 1, 0] });
  createPart('Slider', boxGeo(0.2, 0.2, 0.2), m, { parent: root, position: [2, 0.1, 0] });
  createPart('Pulse', boxGeo(0.2, 0.2, 0.2), m, { parent: root, position: [0, 0.1, 2] });
  createPart('Lift', boxGeo(0.2, 0.2, 0.2), m, { parent: root, position: [-2, 0, 0] });
  return root;
}
function animate() {
  return [createClip('Swing', 4, [
    rotationTrack('Mesh_Door', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1, rotation: [0, 90, 0] }
    ], 'EASE_IN_OUT'),
    positionTrack('Mesh_Slider', [
      { time: 0, position: [2, 0.1, 0] },
      { time: 1, position: [3, 0.1, 0] }
    ], 'EASE_IN'),
    scaleTrack('Mesh_Pulse', [
      { time: 0, scale: [1, 1, 1] },
      { time: 1, scale: [2, 2, 2] }
    ], 'EASE_OUT'),
    positionTrack('Mesh_Lift', [
      { time: 0, position: [-2, 0, 0] },
      { time: 1, position: [-2, 1, 0] },
      { time: 2, position: [-2, 3, 0] },
      { time: 3, position: [-2, 3, 0] }
    ], 'CUBICSPLINE')
  ])];
}`;

/** Sample times, including the held tail after the last key (the clip lasts 4 s). */
const TIMES = [0, 0.25, 0.5, 0.75, 1, 1.5, 2.5, 3.5, 4] as const;

const easeIn = (s: number) => s * s;
const easeOut = (s: number) => 2 * s - s * s;
const easeInOut = (s: number) => 3 * s * s - 2 * s * s * s;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** The glTF cubic Hermite for one scalar segment, written out here independently of the engine. */
function hermite(p0: number, m0: number, p1: number, m1: number, s: number, span: number): number {
  const s2 = -2 * s ** 3 + 3 * s ** 2;
  const s3 = s ** 3 - s ** 2;
  return (1 - s2) * p0 + (s3 - s ** 2 + s) * m0 * span + s2 * p1 + s3 * m1 * span;
}

/**
 * Lift height: keys 0, 1, 3, 3 at 0, 1, 2, 3 s. PCHIP slopes by hand: the interior key at 1 s
 * takes the weighted harmonic mean of its neighbouring slopes 1 and 2 (4/3); the key at 2 s sits
 * where the value stops rising (0); the first end takes the three-point estimate
 * ((2 + 1) * 1 - 2) / 2 = 0.5; the last end's estimate (-1) opposes its segment, so it is 0.
 */
const LIFT = { values: [0, 1, 3, 3], slopes: [0.5, 4 / 3, 0, 0] };
function liftHeight(t: number): number {
  if (t >= 3) return 3;
  const i = Math.floor(t);
  return hermite(
    LIFT.values[i]!,
    LIFT.slopes[i]!,
    LIFT.values[i + 1]!,
    LIFT.slopes[i + 1]!,
    t - i,
    1,
  );
}

const DOOR_OPEN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
function doorRotation(t: number): THREE.Quaternion {
  const h = easeInOut(clamp01(t));
  return new THREE.Quaternion(
    h * DOOR_OPEN.x,
    h * DOOR_OPEN.y,
    h * DOOR_OPEN.z,
    1 - h + h * DOOR_OPEN.w,
  ).normalize();
}

/** Component-wise, on the same hemisphere: angleTo's acos is too coarse near zero for float32. */
function expectRotation(actual: THREE.Quaternion, expected: THREE.Quaternion): void {
  const sign = actual.dot(expected) < 0 ? -1 : 1;
  for (const axis of ['x', 'y', 'z', 'w'] as const)
    expect(actual[axis] * sign).toBeCloseTo(expected[axis], 5);
}

function assertPose(root: THREE.Object3D, t: number): void {
  const at = (name: string) => root.getObjectByName(name)!;
  const s = clamp01(t);
  expectRotation(at('Mesh_Door').quaternion, doorRotation(t));
  expect(at('Mesh_Slider').position.x).toBeCloseTo(2 + easeIn(s), 5);
  expect(at('Mesh_Pulse').scale.y).toBeCloseTo(1 + easeOut(s), 5);
  expect(at('Mesh_Lift').position.y).toBeCloseTo(liftHeight(t), 5);
}

const isCubic = (track: THREE.KeyframeTrack) =>
  (
    track as unknown as {
      createInterpolant: { isInterpolantFactoryMethodGLTFCubicSpline?: boolean };
    }
  ).createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline === true;

interface GltfJson {
  animations: {
    name: string;
    extras?: unknown;
    samplers: Record<string, unknown>[];
    channels: { sampler: number; target: { path: string } }[];
  }[];
  accessors: { count: number; type: string }[];
  scenes: { extras?: Record<string, unknown> }[];
  extensionsUsed?: string[];
}

function gltfJson(glb: Uint8Array): GltfJson {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)));
}

async function threePlayback(
  glb: Uint8Array,
): Promise<{ scene: THREE.Object3D; mixer: THREE.AnimationMixer; clip: THREE.AnimationClip }> {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(() => {
    throw new Error('Unexpected external resource request');
  });
  const loaded = await new GLTFLoader(manager).parseAsync(Uint8Array.from(glb).buffer, '');
  const mixer = new THREE.AnimationMixer(loaded.scene);
  return { scene: loaded.scene, mixer, clip: loaded.animations[0]! };
}

describe('eased and cubic tracks', () => {
  test('an easing bakes each segment tangents into the glTF cubic layout', () => {
    const track = positionTrack(
      'Body',
      [
        { time: 0, position: [0, 0, 0] },
        { time: 2, position: [1, 0, 0] },
      ],
      'EASE_IN',
    );
    expect(isCubic(track)).toBe(true);
    // Per key: in-tangent, value, out-tangent. EASE_IN leaves at rest and arrives at twice
    // the segment's mean speed: 2 * (1 / 2 s) = 1 per second.
    expect(Array.from(track.values)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0,
    ]);
    const swing = rotationTrack(
      'Door',
      [
        { time: 0, rotation: [0, 0, 0] },
        { time: 1, rotation: [0, 90, 0] },
      ],
      'EASE_IN_OUT',
    );
    expect(swing.values).toHaveLength(24);
    expect([
      ...swing.values.slice(0, 4),
      ...swing.values.slice(8, 16),
      ...swing.values.slice(20),
    ]).toEqual(new Array(16).fill(0));
  });

  test('each shorthand follows its named curve per segment, and a hold stays still', () => {
    const keys = [
      { time: 0, position: [0, 0, 0] as [number, number, number] },
      { time: 1, position: [1, 0, 0] as [number, number, number] },
      { time: 2, position: [1, 0, 0] as [number, number, number] },
      { time: 3, position: [0, 0, 0] as [number, number, number] },
    ];
    const curves = { EASE_IN: easeIn, EASE_OUT: easeOut, EASE_IN_OUT: easeInOut } as const;
    for (const [mode, curve] of Object.entries(curves) as [
      keyof typeof curves,
      (s: number) => number,
    ][]) {
      const interpolant = (
        positionTrack('Body', keys, mode) as unknown as {
          createInterpolant(): { evaluate(t: number): ArrayLike<number> };
        }
      ).createInterpolant();
      for (const s of [0.25, 0.5, 0.75]) {
        expect(interpolant.evaluate(s)[0]).toBeCloseTo(curve(s), 6);
        expect(interpolant.evaluate(1 + s)[0]).toBeCloseTo(1, 6);
        expect(interpolant.evaluate(2 + s)[0]).toBeCloseTo(1 - curve(s), 6);
      }
    }
  });

  test('CUBICSPLINE passes smoothly through the keys without overshoot; two keys are linear', () => {
    const lift = positionTrack(
      'Lift',
      [0, 1, 3, 3].map((y, time) => ({ time, position: [0, y, 0] as [number, number, number] })),
      'CUBICSPLINE',
    ) as unknown as { createInterpolant(): { evaluate(t: number): ArrayLike<number> } };
    const interpolant = lift.createInterpolant();
    for (const t of [0.5, 1, 1.5, 2, 2.5, 3])
      expect(interpolant.evaluate(t)[1]).toBeCloseTo(liftHeight(t), 6);
    for (let t = 0; t <= 3; t += 0.05)
      expect(interpolant.evaluate(t)[1]).toBeLessThanOrEqual(3 + 1e-6);
    const pair = positionTrack(
      'Pair',
      [
        { time: 0, position: [0, 0, 0] },
        { time: 1, position: [1, 0, 0] },
      ],
      'CUBICSPLINE',
    ) as unknown as { createInterpolant(): { evaluate(t: number): ArrayLike<number> } };
    expect(pair.createInterpolant().evaluate(0.25)[0]).toBeCloseTo(0.25, 6);
  });

  test('an eased rotation takes the shortest arc between keys, as LINEAR does', () => {
    const keys = [
      { time: 0, rotation: [0, 0, 0] as [number, number, number] },
      { time: 1, rotation: [0, 270, 0] as [number, number, number] },
    ];
    const posed = (track: THREE.KeyframeTrack) => {
      const root = new THREE.Group();
      root.name = 'Door';
      poseSceneAtTime(root, prepareClip(root, new THREE.AnimationClip('Turn', 1, [track])), 0.5);
      return root.quaternion.clone();
    };
    const eased = posed(rotationTrack('Door', keys, 'EASE_IN_OUT'));
    expectRotation(eased, posed(rotationTrack('Door', keys)));
    expectRotation(
      eased,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 4),
    );
  });

  test('createClip validates the cubic layout and keeps rejecting interpolants glTF lacks', () => {
    const keys = [
      { time: 0, position: [0, 0, 0] as [number, number, number] },
      { time: 1, position: [1, 0, 0] as [number, number, number] },
    ];
    expect(() => positionTrack('Body', keys.slice(0, 1), 'EASE_IN_OUT')).toThrow(/two keyframes/);
    expect(() => positionTrack('Body', keys, 'SMOOTH' as never)).toThrow(/EASE_IN_OUT/);
    expect(createClip('Ok', 1, [positionTrack('Body', keys, 'EASE_OUT')]).tracks).toHaveLength(1);
    const short = positionTrack('Body', keys, 'EASE_OUT');
    short.values = short.values.slice(0, 15);
    expect(() => createClip('Bad', 1, [short])).toThrow(/9 values per keyframe/);
    const swing = rotationTrack(
      'Door',
      [
        { time: 0, rotation: [0, 0, 0] },
        { time: 1, rotation: [0, 90, 0] },
      ],
      'EASE_IN',
    );
    // A tangent is a rate, not a rotation: only the key values must be unit quaternions.
    expect(createClip('Ok', 1, [swing]).tracks).toHaveLength(1);
    swing.values[16 + 3] = 2;
    expect(() => createClip('Bad', 1, [swing])).toThrow(/unit length/);
    const smooth = positionTrack('Body', keys).setInterpolation(THREE.InterpolateSmooth);
    expect(() => createClip('Bad', 1, [smooth])).toThrow(/interpolation/);
  });
});

describe('eased clips across every review boundary', () => {
  test('source posing and three.js playback of the source clip follow the curves', async () => {
    const { root, clips } = await executeKilnCode(SOURCE);
    expect(clips[0]!.tracks.every(isCubic)).toBe(true);
    const prepared = prepareClip(root, clips[0]!);
    for (const t of TIMES) {
      poseSceneAtTime(root, prepared, t);
      assertPose(root, t);
    }
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clips[0]!).play();
    for (const t of TIMES.filter((time) => time < 4)) {
      mixer.setTime(t);
      assertPose(root, t);
    }
  });

  for (const gltfExporter of ['legacy', 'three'] as const) {
    test(`the GLB carries standard CUBICSPLINE samplers only, and three.js plays them (${gltfExporter})`, async () => {
      const rendered = await renderGLBInProcess(SOURCE, { gltfExporter });
      expect(rendered.integrationManifest.structuralQa.validatorErrors).toBe(0);
      const json = gltfJson(rendered.glb);
      const animation = json.animations[0]!;
      expect(animation.extras).toBeUndefined();
      expect(json.scenes[0]!.extras?.kilnReviewClipsV1).toBeUndefined();
      expect((json.extensionsUsed ?? []).filter((name) => /anim/i.test(name))).toEqual([]);
      for (const channel of animation.channels) {
        const sampler = animation.samplers[channel.sampler]!;
        expect(Object.keys(sampler).sort()).toEqual(['input', 'interpolation', 'output']);
        expect(sampler.interpolation).toBe('CUBICSPLINE');
        const input = json.accessors[sampler.input as number]!;
        const output = json.accessors[sampler.output as number]!;
        expect(output.count).toBe(3 * input.count);
        expect(output.type).toBe(channel.target.path === 'rotation' ? 'VEC4' : 'VEC3');
      }
      const { scene, mixer, clip } = await threePlayback(rendered.glb);
      expect(clip.duration).toBe(4);
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      for (const t of TIMES) {
        action.reset().play();
        mixer.setTime(t);
        assertPose(scene, t);
      }
    });
  }

  test('the review scene rebuilds the cubic tracks from the native samplers', async () => {
    const { root, clips } = await loadGlbReviewScene((await renderGLBInProcess(SOURCE)).glb);
    expect(clips[0]!.tracks.every(isCubic)).toBe(true);
    const prepared = prepareClip(root, clips[0]!);
    for (const t of TIMES) {
      poseSceneAtTime(root, prepared, t);
      assertPose(root, t);
    }
  });

  test('the review copy carries cubic tracks as version 2; linear-only copies stay version 1', async () => {
    const ghost = (interpolation?: 'EASE_IN_OUT') =>
      positionTrack(
        'Ghost',
        [
          { time: 0, position: [0, 0, 0] },
          { time: 1, position: [0, 1, 0] },
        ],
        interpolation,
      );
    const { root, clips } = await executeKilnCode(SOURCE);
    const partial = createClip('Swing', 4, [...clips[0]!.tracks, ghost('EASE_IN_OUT')]);
    const rendered = await renderSceneToGLB(root, { clips: [partial] });
    const copy = gltfJson(rendered.bytes).scenes[0]!.extras?.kilnReviewClipsV1 as {
      version: number;
      clips: {
        tracks: { name: string; interpolation: string; times: number[]; values: number[] }[];
      }[];
    };
    expect(copy.version).toBe(2);
    const tracks = copy.clips[0]!.tracks;
    expect(tracks.map((track) => track.interpolation)).toEqual(new Array(5).fill('CUBICSPLINE'));
    const door = tracks.find((track) => track.name === 'Mesh_Door.quaternion')!;
    expect(door.values).toHaveLength(door.times.length * 12);
    const review = await loadGlbReviewScene(rendered.bytes);
    expect(review.clips[0]!.tracks).toHaveLength(5);
    expect(review.clips[0]!.tracks.every(isCubic)).toBe(true);
    const prepared = prepareClip(review.root, review.clips[0]!);
    for (const t of TIMES) {
      poseSceneAtTime(review.root, prepared, t);
      assertPose(review.root, t);
    }
    const plain = await executeKilnCode(
      SOURCE.replaceAll(/, 'EASE_IN_OUT'|, 'EASE_IN'|, 'EASE_OUT'|, 'CUBICSPLINE'/g, ''),
    );
    const linear = createClip('Swing', 4, [...plain.clips[0]!.tracks, ghost()]);
    const linearCopy = gltfJson((await renderSceneToGLB(plain.root, { clips: [linear] })).bytes)
      .scenes[0]!.extras?.kilnReviewClipsV1 as { version: number };
    expect(linearCopy.version).toBe(1);
  });

  test('an eased loop closes on its key values, whatever its end tangents', async () => {
    const root = new THREE.Group();
    root.name = 'Body';
    const clip = createClip(
      'Bob',
      2,
      [
        positionTrack(
          'Body',
          [
            { time: 0, position: [0, 0, 0] },
            { time: 1, position: [0, 1, 0] },
            { time: 2, position: [0, 0, 0] },
          ],
          'EASE_IN',
        ),
      ],
      { loop: true },
    );
    expect(measureLoopClosure(root, clip)).toMatchObject({ status: 'closed', checkedTracks: 1 });
  });

  test('character QA compares an eased loop on its key values, not its tangents', () => {
    const intent = createAssetIntentV1({
      category: 'character',
      capabilities: ['articulated'],
      character: {
        bodyPlan: 'biped',
        grounded: false,
        locomotion: 'walk',
        rootMotion: 'inPlace',
        clips: [{ name: 'Idle', playback: 'loop' }],
        heldItem: { required: false, attachmentRole: 'grip' },
      },
    });
    const loopFindings = (track: THREE.KeyframeTrack) =>
      evaluateCharacterQa({ intent, clips: [createClip('Idle', 1, [track])] })
        .map((finding) => finding.code)
        .filter((code) => code === 'CHAR_LOOP_ENDPOINT');
    const bob = (end: number) =>
      positionTrack(
        'Character',
        [
          { time: 0, position: [0, 0, 0] },
          { time: 0.5, position: [0, 0.1, 0] },
          { time: 1, position: [end, 0, 0] },
        ],
        'EASE_IN',
      );
    // EASE_IN arrives at speed and leaves at rest, so the end and start tangents differ.
    expect(loopFindings(bob(0))).toEqual([]);
    expect(loopFindings(bob(0.2))).toEqual(['CHAR_LOOP_ENDPOINT']);
    // A full turn ends on the opposite quaternion sign: the same rotation, so the loop closes.
    const turn = rotationTrack(
      'Character',
      [0, 120, 240, 360].map((degrees, index) => ({
        time: index / 3,
        rotation: [0, degrees, 0] as [number, number, number],
      })),
      'EASE_IN_OUT',
    );
    expect(loopFindings(turn)).toEqual([]);
  });

  test('kiln_screenshot_animation measures the eased poses from the exported bytes', async () => {
    const anim = createKilnProgramToolRegistry({ programStore: new MemoryProgramStore() }).find(
      (tool) => tool.name === 'kiln_screenshot_animation',
    )!;
    const phases = [0, 0.0625, 0.125, 0.1875, 0.25, 0.625];
    const result = (await anim.run({
      code: SOURCE,
      clip: 'Swing',
      frameTimes: phases,
      measureParts: [{ name: 'Mesh_Slider' }, { name: 'Mesh_Lift' }],
      size: 128,
      detail: 'full',
    })) as {
      ok: boolean;
      error?: string;
      poseBounds: { timeSeconds: number; parts: { name: string; origin: number[] }[] }[];
    };
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.poseBounds.map((pose) => pose.timeSeconds)).toEqual(phases.map((p) => p * 4));
    for (const pose of result.poseBounds) {
      const [slider, lift] = pose.parts;
      expect(slider!.origin[0]).toBeCloseTo(2 + easeIn(clamp01(pose.timeSeconds)), 5);
      expect(lift!.origin[1]).toBeCloseTo(liftHeight(pose.timeSeconds), 5);
    }
  });
});
