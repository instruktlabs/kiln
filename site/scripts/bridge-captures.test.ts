import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BRIDGE_CAPTURES, BRIDGE_ID, bridgeCaptureFile, bridgeCaptureKey, bridgeCapturePath, bridgeRevisionDir, bridgeTierFiles, cameraFromCaptureFile } from './bridge-captures.mjs';

const shot = (camera: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 'kiln.capture.v1', size: 1024, shots: [{ name: 'deck', camera, ...extra }] });
const explicit = { type: 'explicit', projection: 'perspective', position: [10, 20, 30], target: [0, 5, 0], up: [0, 1, 0], fovDeg: 40, near: 0.5, far: 4000 };

describe('the bridge capture list', () => {
  test('has one poster, five uniquely named views and an alt text for each', () => {
    expect(BRIDGE_CAPTURES.filter((capture) => capture.poster)).toHaveLength(1);
    expect(BRIDGE_CAPTURES[0]).toMatchObject({ name: 'classic', poster: true });
    expect(BRIDGE_CAPTURES.map((capture) => capture.name)).toEqual(['classic', 'water-level', 'deck', 'tower-top', 'elevation']);
    expect(new Set(BRIDGE_CAPTURES.map((capture) => capture.name)).size).toBe(BRIDGE_CAPTURES.length);
    for (const capture of BRIDGE_CAPTURES) {
      expect(capture.alt.length).toBeGreaterThan(40);
      // Alt text describes the picture: no measurements, brand names or claims the render cannot show.
      expect(capture.alt).not.toMatch(/\d/);
    }
  });

  test('keys the poster as the asset and each other view by name, and puts files under the revision', () => {
    const [poster, ...views] = BRIDGE_CAPTURES;
    expect(bridgeCaptureKey(poster)).toBe(`bridge:${BRIDGE_ID}`);
    expect(views.map(bridgeCaptureKey)).toEqual(['water-level', 'deck', 'tower-top', 'elevation'].map((name) => `bridge:${BRIDGE_ID}#${name}`));
    expect(bridgeRevisionDir('r_x')).toBe('standalone/golden-gate-bridge/r_x/');
    expect(bridgeCaptureFile('deck')).toBe('deck-neutral.png');
    expect(bridgeCapturePath('r_x', 'deck')).toBe('standalone/golden-gate-bridge/r_x/captures/deck-neutral.png');
  });

  test('names each tier’s runtime GLB, metadata sidecar and editable archive', () => {
    expect(bridgeTierFiles('full')).toEqual({ glb: 'golden-gate-runtime.glb', metadata: 'golden-gate-runtime.kiln-metadata.json', zip: 'golden-gate-editable.zip' });
    expect(bridgeTierFiles('web')).toEqual({ glb: 'golden-gate-web-runtime.glb', metadata: 'golden-gate-web-runtime.kiln-metadata.json', zip: 'golden-gate-web-editable.zip' });
    expect(bridgeTierFiles('far').zip).toBe('golden-gate-far-editable.zip');
  });
});

describe('turning an author’s capture file into a renderer camera', () => {
  test('maps a perspective shot one to one with its own clip planes and a square aspect', () => {
    expect(cameraFromCaptureFile(shot(explicit))).toEqual({
      camera: { version: 'kiln.camera.v1', projection: 'perspective', position: [10, 20, 30], target: [0, 5, 0], up: [0, 1, 0], aspect: 1, near: 0.5, far: 4000, fovDeg: 40 },
      size: 1024,
      name: 'deck',
    });
  });

  test('maps an orthographic shot with its half height and defaults the target and up', () => {
    const { camera } = cameraFromCaptureFile(shot({ type: 'explicit', projection: 'orthographic', position: [0, 0, 500], halfHeight: 120, near: 1, far: 2000 }));
    expect(camera).toMatchObject({ projection: 'orthographic', halfHeight: 120, target: [0, 0, 0], up: [0, 1, 0] });
    expect('fovDeg' in camera).toBe(false);
  });

  test('copies its vectors so the capture file is not aliased', () => {
    const spec = shot(explicit);
    const { camera } = cameraFromCaptureFile(spec);
    camera.position[0] = -1;
    expect((spec.shots[0].camera as { position: number[] }).position[0]).toBe(10);
  });

  test.each([
    ['a camera that is not explicit', { ...explicit, type: 'orbit' }, /only an explicit camera/],
    ['a camera relative to something else', { ...explicit, relativeTo: 'asset' }, /only a world-space explicit camera/],
    ['a camera framed on a node', { ...explicit, frame: 'Tower' }, /only a world-space explicit camera/],
    ['a camera with a target offset', { ...explicit, targetOffset: [0, 1, 0] }, /only a world-space explicit camera/],
    ['a camera framed to fit', { ...explicit, framing: 'fit' }, /only a world-space explicit camera/],
    ['a camera without near and far', { ...explicit, near: undefined }, /near and far are required/],
  ])('refuses %s', (_label, camera, message) => {
    expect(() => cameraFromCaptureFile(shot(camera as Record<string, unknown>))).toThrow(message);
  });

  test('refuses a file with several shots, another version or a non-integer size', () => {
    expect(() => cameraFromCaptureFile({ ...shot(explicit), shots: [{ camera: explicit }, { camera: explicit }] })).toThrow(/exactly one kiln.capture.v1 shot/);
    expect(() => cameraFromCaptureFile({ ...shot(explicit), version: 'kiln.capture.v2' })).toThrow(/exactly one kiln.capture.v1 shot/);
    expect(() => cameraFromCaptureFile({ ...shot(explicit), size: 512.5 })).toThrow(/size must be a positive integer/);
    expect(() => cameraFromCaptureFile(undefined)).toThrow(/exactly one kiln.capture.v1 shot/);
  });
});

describe('the recorded bridge rig posters', () => {
  test('cover every capture, each with the review’s revision and the author’s camera from a hashed file', async () => {
    const data = JSON.parse(await readFile(join(import.meta.dir, '../src/data/rig-posters.json'), 'utf8'));
    const bridge = JSON.parse(await readFile(join(import.meta.dir, '../src/data/standalone/golden-gate-bridge.json'), 'utf8'));
    for (const capture of BRIDGE_CAPTURES) {
      const record = data.posters[bridgeCaptureKey(capture)];
      expect(record, capture.name).toBeDefined();
      expect(record.revisionId).toBe(bridge.revisionId);
      expect(record.path).toBe(bridgeCapturePath(bridge.revisionId, capture.name));
      expect(record.view.source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.view.camera.aspect).toBe(1);
    }
  });
});
