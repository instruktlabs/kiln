import { createHash } from 'node:crypto';
import { describe, expect, spyOn, test } from 'bun:test';

import * as renderModule from '../../render';
import { trustedInProcessEvaluatorPortV2 } from '../../evaluator';
import type { PbrRenderPort, PbrRenderRequest } from '../../composer/render-port';
import { encodePng } from '../../views';
import {
  createKilnInspectDef,
  createKilnScreenshotAnimationDef,
  createKilnViewInteriorDef,
  type KilnInspectResult,
  type KilnScreenshotAnimationResult,
  type KilnViewInteriorResult,
} from '../registry';

const ANIMATED = `
const meta = { name: 'once', category: 'prop' };
function build() {
  const root = createRoot('Root');
  const pivot = createPivot('Arm', [0, 0, 0], root);
  createPart('Blade', boxGeo(1, 1, 1), gameMaterial('#888888'), { parent: pivot });
  return root;
}
function animate() {
  return [createClip('move', 1, [rotationTrack('Joint_Arm', [
    { time: 0, rotation: [0, 0, 0] }, { time: 1, rotation: [0, 90, 0] }
  ])])];
}`;

const BUILDING = `
const meta = { name: 'hut', category: 'architecture' };
function build() {
  const root = createRoot('Hut');
  const mat = gameMaterial('#caa472');
  room('Shell', mat, { width: 4, depth: 4, height: 2.8, parent: root });
  const roof = createRoofPlanes('Roof', mat, { width: 4, depth: 4, height: 1.2, parent: root });
  roof.root.position.set(0, 2.8, 0);
  return root;
}`;

function solidPng(size: number): Uint8Array {
  const rgb = new Uint8Array(size * size * 3);
  rgb.fill(96);
  return new Uint8Array(encodePng(rgb, size, size));
}

describe('derivative review surfaces', () => {
  test('evaluator GLB preserves a bare pivot-name clip and reports its unresolved track', async () => {
    const result = (await createKilnScreenshotAnimationDef({
      evaluatorPort: trustedInProcessEvaluatorPortV2,
      evaluatorProfile: 'evaluator-required',
    }).run({
      code: ANIMATED.replace("rotationTrack('Joint_Arm'", "rotationTrack('Arm'"),
      clip: 'move',
    })) as KilnScreenshotAnimationResult;
    expect(result.ok).toBe(true);
    expect(result.clip).toBe('move');
    expect(result.frames).toBe(6);
    expect(result.unresolvedTracks).toEqual(['Arm.quaternion']);
  });

  test('animation evaluates once and never re-executes source while binding derivative receipts', async () => {
    const requests: PbrRenderRequest[] = [];
    const port: PbrRenderPort = async (request) => {
      requests.push(request);
      const inputGlbSha256 =
        `sha256:${createHash('sha256').update(request.glb).digest('hex')}` as const;
      return {
        ok: true,
        rendererId: 'gpu:derivative-test',
        cameras: request.cameras,
        width: request.width,
        height: request.height,
        viewsPng: [solidPng(request.width ?? request.size!)],
        derivativeFidelity: { materialFaithful: true, inputGlbSha256 },
      };
    };
    const execute = spyOn(renderModule, 'executeKilnCode');
    try {
      // Whole receipts are full detail; compact keeps what differs from the summary.
      const result = (await createKilnScreenshotAnimationDef({ viewRenderPort: port }).run({
        code: ANIMATED,
        clip: 'move',
        detail: 'full',
      })) as KilnScreenshotAnimationResult;
      expect(result.ok).toBe(true);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(requests).toHaveLength(6);
      expect(result.viewFidelity).toMatchObject({
        delivered: 'full-material',
        materialFaithful: true,
        exactArtifact: false,
        degraded: false,
      });
      expect(result.viewFidelity?.receipts).toHaveLength(6);
      for (let index = 0; index < requests.length; index++) {
        const receipt = result.viewFidelity!.receipts[index]!;
        expect(receipt.exactArtifact).toBe(false);
        expect(receipt.derivativeLabel).toMatch(/%$/);
        expect(receipt.inputGlbSha256).toBe(
          `sha256:${createHash('sha256').update(requests[index]!.glb).digest('hex')}`,
        );
      }
    } finally {
      execute.mockRestore();
    }
  });

  test('GPU failure uses GLB-native geometry-flat frames with stable reasons', async () => {
    const execute = spyOn(renderModule, 'executeKilnCode');
    try {
      // Whole receipts: a compact result states the reason every receipt shares once.
      const result = (await createKilnScreenshotAnimationDef({
        viewRenderPort: async () => ({ ok: false, rendererId: 'gpu:test', error: 'offline' }),
      }).run({ code: ANIMATED, clip: 'move', detail: 'full' })) as KilnScreenshotAnimationResult;
      expect(result.ok).toBe(true);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.viewFidelity).toMatchObject({
        delivered: 'geometry-flat',
        materialFaithful: false,
        exactArtifact: false,
        degraded: true,
        reasonCodes: ['FULL_MATERIAL_RENDER_UNAVAILABLE'],
      });
      expect(
        result.viewFidelity?.receipts.every((receipt) => receipt.degradeReason === 'offline'),
      ).toBe(true);
      const compact = (await createKilnScreenshotAnimationDef({
        viewRenderPort: async () => ({ ok: false, rendererId: 'gpu:test', error: 'offline' }),
      }).run({ code: ANIMATED, clip: 'move' })) as KilnScreenshotAnimationResult & {
        viewFidelity?: { degradeReason?: string };
      };
      expect(compact.viewFidelity?.degradeReason).toBe('offline');
      expect(compact.viewFidelity?.receipts.some((receipt) => 'degradeReason' in receipt)).toBe(
        false,
      );
    } finally {
      execute.mockRestore();
    }
  });

  test('interior cutaway produces one derivative receipt per displayed cell', async () => {
    const requests: PbrRenderRequest[] = [];
    const result = (await createKilnViewInteriorDef({
      viewRenderPort: async (request) => {
        requests.push(request);
        return {
          ok: true,
          rendererId: 'gpu:interior',
          cameras: request.cameras,
          width: request.width,
          height: request.height,
          viewsPng: [solidPng(request.width ?? request.size!)],
          derivativeFidelity: {
            materialFaithful: true,
            inputGlbSha256: `sha256:${createHash('sha256').update(request.glb).digest('hex')}`,
          },
        };
      },
    }).run({ code: BUILDING })) as KilnViewInteriorResult;
    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(3);
    expect(result.viewFidelity?.receipts.map((receipt) => receipt.derivativeLabel)).toEqual([
      'Floor plan',
      'Dollhouse',
      'Eye-level',
    ]);
    expect(result.viewFidelity?.exactArtifact).toBe(false);
  });

  test('contextual part inspect rejects a port without camera acknowledgement', async () => {
    let portCalls = 0;
    const result = (await createKilnInspectDef({
      viewRenderPort: async () => {
        portCalls++;
        return { ok: true, rendererId: 'gpu:inspect', viewsPng: [solidPng(512)] };
      },
    }).run({ code: ANIMATED, part: 'Blade' })) as KilnInspectResult;
    expect(result.ok).toBe(true);
    expect(portCalls).toBe(1);
    expect(result.viewFidelity).toMatchObject({
      delivered: 'geometry-flat',
      materialFaithful: false,
      exactArtifact: false,
      reasonCodes: ['FULL_MATERIAL_RENDER_UNAVAILABLE'],
    });
  });

  test('a later degraded request exposes current failure while retaining only a hash reference', async () => {
    let succeed = true;
    const def = createKilnInspectDef({
      viewRenderPort: async (request) => {
        if (!succeed) return { ok: false, rendererId: 'gpu:inspect', error: 'device lost' };
        return {
          ok: true,
          rendererId: 'gpu:inspect',
          cameras: request.cameras,
          width: request.width,
          height: request.height,
          viewsPng: [solidPng(request.width ?? request.size!)],
          derivativeFidelity: {
            materialFaithful: true,
            inputGlbSha256: `sha256:${createHash('sha256').update(request.glb).digest('hex')}`,
          },
        };
      },
    });
    const first = (await def.run({ code: ANIMATED, isolate: true })) as KilnInspectResult;
    succeed = false;
    const second = (await def.run({ code: ANIMATED, isolate: true })) as KilnInspectResult;

    expect(first.viewEvidence?.current.materialFaithful).toBe(true);
    expect(second.viewEvidence?.current).toMatchObject({
      sequence: 2,
      materialFaithful: false,
      delivered: 'geometry-flat',
      degraded: true,
    });
    expect(second.viewEvidence?.lastFaithful).toMatchObject({
      sequence: 1,
      materialFaithful: true,
      inputGlbSha256: first.viewEvidence?.current.inputGlbSha256,
    });
    expect(JSON.stringify(second.viewEvidence)).not.toContain('png');
  });
});
