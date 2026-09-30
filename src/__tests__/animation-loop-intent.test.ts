import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { createClip, rotationTrack } from '../primitives';
import { renderSceneToGLB } from '../render';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { MemoryProgramStore } from '../program-store';
import { loadGlbReviewScene } from '../views/glb';

function glbJson(bytes: Uint8Array): Record<string, unknown> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

function door() {
  const root = new THREE.Group();
  root.name = 'Door';
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1), new THREE.MeshStandardMaterial());
  leaf.name = 'Leaf';
  root.add(leaf);
  return root;
}

const swing = () =>
  rotationTrack('Leaf', [
    { time: 0, rotation: [0, 0, 0] },
    { time: 1, rotation: [0, 90, 0] },
  ]);

describe('clip loop intent', () => {
  test('createClip records loop intent and rejects unknown options', () => {
    expect(createClip('a', 1, [swing()], { loop: true }).userData.kilnLoopIntent).toBe('loop');
    expect(createClip('b', 1, [swing()], { loop: false }).userData.kilnLoopIntent).toBe('once');
    expect(createClip('c', 1, [swing()]).userData.kilnLoopIntent).toBeUndefined();
    expect(() => createClip('d', 1, [swing()], { loop: 'yes' } as never)).toThrow(/loop/);
    expect(() => createClip('e', 1, [swing()], { repeat: true } as never)).toThrow(/repeat/);
  });

  test('loop intent is a glTF animation extra that review loading reads back', async () => {
    const clips = [
      createClip('spin', 1, [swing()], { loop: true }),
      createClip('open', 1, [swing()], { loop: false }),
      createClip('plain', 1, [swing()]),
    ];
    const { bytes: glb } = await renderSceneToGLB(door(), { clips });
    const json = glbJson(glb) as {
      animations: { name: string; extras?: Record<string, unknown> }[];
    };
    const extras = Object.fromEntries(json.animations.map((a) => [a.name, a.extras]));
    expect(extras.spin).toEqual({ kilnLoopIntent: 'loop' });
    expect(extras.open).toEqual({ kilnLoopIntent: 'once' });
    expect(extras.plain).toBeUndefined();
    const review = await loadGlbReviewScene(glb);
    const intent = Object.fromEntries(
      review.clips.map((clip) => [clip.name, clip.userData.kilnLoopIntent]),
    );
    expect(intent).toEqual({ spin: 'loop', open: 'once', plain: undefined });
  });

  test('complete native clips carry no review copy; unresolved tracks keep one', async () => {
    const native = await renderSceneToGLB(door(), { clips: [createClip('spin', 1, [swing()])] });
    const nativeJson = glbJson(native.bytes) as { scenes: { extras?: Record<string, unknown> }[] };
    expect(nativeJson.scenes[0]!.extras?.kilnReviewClipsV1).toBeUndefined();
    const missing = rotationTrack('Ghost', [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1, rotation: [0, 90, 0] },
    ]);
    const partial = await renderSceneToGLB(door(), {
      clips: [createClip('spin', 1, [swing(), missing], { loop: true })],
    });
    const partialJson = glbJson(partial.bytes) as {
      scenes: { extras?: { kilnReviewClipsV1?: { clips: { loopIntent?: string }[] } } }[];
    };
    const reviewCopy = partialJson.scenes[0]!.extras?.kilnReviewClipsV1;
    expect(reviewCopy?.clips[0]?.loopIntent).toBe('loop');
    const review = await loadGlbReviewScene(partial.bytes);
    expect(review.clips[0]!.tracks).toHaveLength(2);
    expect(review.clips[0]!.userData.kilnLoopIntent).toBe('loop');
  });

  test('animation review reports the declared intent and flags an open loop', async () => {
    const code = `const meta = { name: 'Door', category: 'prop' };
function build() {
  const root = createRoot('Door');
  createPart('Leaf', boxGeo(1, 2, 0.1), gameMaterial(0x888888), { parent: root, position: [0, 1, 0] });
  return root;
}
function animate() {
  const keys = [{ time: 0, rotation: [0, 0, 0] }, { time: 1, rotation: [0, 90, 0] }];
  return [
    createClip('spin', 1, [rotationTrack('Mesh_Leaf', keys)], { loop: true }),
    createClip('open', 1, [rotationTrack('Mesh_Leaf', keys)], { loop: false }),
  ];
}
`;
    const anim = createKilnProgramToolRegistry({ programStore: new MemoryProgramStore() }).find(
      (d) => d.name === 'kiln_screenshot_animation',
    )!;
    type Out = {
      ok: boolean;
      warnings: string[];
      loopClosure: { status: string; loopIntent: string };
    };
    const spin = (await anim.run({ code, clip: 'spin', frames: 2 })) as Out;
    expect(spin.ok).toBe(true);
    expect(spin.loopClosure).toMatchObject({ status: 'open', loopIntent: 'loop' });
    expect(spin.warnings.some((w) => w.includes('LOOP_NOT_CLOSED'))).toBe(true);
    const open = (await anim.run({ code, clip: 'open', frames: 2 })) as Out;
    expect(open.loopClosure).toMatchObject({ status: 'open', loopIntent: 'once' });
    expect(open.warnings.some((w) => w.includes('LOOP_NOT_CLOSED'))).toBe(false);
  }, 60_000); // Two CPU animation reviews: ~6 s cold on the Windows gate host.
});
