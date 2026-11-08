import { createHash } from 'node:crypto';
import { describe, expect, spyOn, test } from 'bun:test';

import * as renderModule from '../../render';
import * as pngModule from '../../views/png';
import type { PbrRenderPort, PbrRenderRequest } from '../../composer/render-port';
import { encodePng } from '../../views';
import { captureViewsViaPort } from '../../views/port';
import {
  createKilnProgramToolRegistry,
  type KilnInspectResult,
  type KilnRenderViewsResult,
  type KilnToolContext,
} from '../registry';

/** The host's tool set, so the capture cache wraps the port as it does in a session. */
function tool(name: string, context: KilnToolContext) {
  const def = createKilnProgramToolRegistry(context).find((candidate) => candidate.name === name);
  if (!def) throw new Error(`no ${name}`);
  return def;
}

const CODE = `
const meta = { name: 'pair', category: 'prop' };
function build() {
  const root = createRoot('Root');
  createPart('Left', boxGeo(1, 1, 1), gameMaterial('#cc3333'), { parent: root, position: [-1, 0, 0] });
  createPart('Right', boxGeo(1, 1, 1), gameMaterial('#3333cc'), { parent: root, position: [1, 0, 0] });
  return root;
}`;

function framePng(size: number, seed: number): Uint8Array {
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i + seed * 13) % 251;
  return new Uint8Array(encodePng(rgb, size, size));
}

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** Frames carry `salt`, so one test's frames are never already decoded by another's. */
function gpuPort(requests: PbrRenderRequest[], salt = 0): PbrRenderPort {
  return async (request) => {
    requests.push(request);
    return {
      ok: true,
      rendererId: 'gpu:derivative-reuse',
      cameras: request.cameras,
      width: request.width,
      height: request.height,
      viewsPng: (request.cameras ?? []).map((_, i) =>
        framePng(request.width!, salt * 1000 + requests.length * 10 + i),
      ),
      derivativeFidelity: {
        materialFaithful: true,
        inputGlbSha256: sha(request.glb) as `sha256:${string}`,
      },
    };
  };
}

const orbit = (azimuthDeg: number, extra: Record<string, unknown> = {}) => ({
  name: `S${azimuthDeg}`,
  camera: { type: 'orbit', azimuthDeg, elevationDeg: 20 },
  ...extra,
});

describe('one derivative export per scene state', () => {
  test('isolated shots of one part share one export, and a later call on the same artifact reuses it', async () => {
    const requests: PbrRenderRequest[] = [];
    const def = tool('kiln_render', {
      viewRenderPort: gpuPort(requests),
      captureCacheIdentity: 'derivative-reuse-1',
    });
    const exportSpy = spyOn(renderModule, 'renderReviewDerivativeGlb');
    try {
      const isolate = (az: number, part = 'Left') =>
        orbit(az, { subject: { path: `/pair[0]/Root[0]/Mesh_${part}[0]` }, visibility: 'isolate' });
      const first = (await def.run({
        code: CODE,
        capture: {
          version: 'kiln.capture.v1',
          size: 128,
          shots: [isolate(30), isolate(60), isolate(90), isolate(30, 'Right')],
        },
      })) as KilnRenderViewsResult;
      expect(first.ok).toBe(true);
      expect(requests).toHaveLength(4);
      // The left part three times and the right part once: two scene states, two exports.
      expect(exportSpy).toHaveBeenCalledTimes(2);
      const hashes = requests.map((request) => sha(request.glb));
      expect(new Set(hashes.slice(0, 3)).size).toBe(1);
      expect(hashes[3]).not.toBe(hashes[0]);

      // A new call loads the artifact again; a new camera on a known state exports nothing.
      const second = (await def.run({
        programRef: (first as { programRef?: string }).programRef!,
        capture: { version: 'kiln.capture.v1', size: 128, shots: [isolate(120)] },
      })) as KilnRenderViewsResult;
      expect(second.ok).toBe(true);
      expect(exportSpy).toHaveBeenCalledTimes(2);
      expect(sha(requests[4]!.glb)).toBe(hashes[0]!);
    } finally {
      exportSpy.mockRestore();
    }
  });

  test('a shot that hides a part, or draws back faces, exports its own state', async () => {
    const requests: PbrRenderRequest[] = [];
    const def = tool('kiln_render', {
      viewRenderPort: gpuPort(requests),
      captureCacheIdentity: 'derivative-reuse-2',
    });
    const result = (await def.run({
      code: CODE,
      capture: {
        version: 'kiln.capture.v2',
        size: 128,
        shots: [orbit(0), orbit(0, { name: 'hidden', hide: ['/pair[0]/Root[0]/Mesh_Right[0]'] })],
      },
    })) as KilnRenderViewsResult;
    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(sha(requests[0]!.glb)).not.toBe(sha(requests[1]!.glb));
  });

  test('a repeated kiln_inspect shot reuses the export and decodes its frame once', async () => {
    const requests: PbrRenderRequest[] = [];
    const def = tool('kiln_inspect', {
      viewRenderPort: gpuPort(requests, 3),
      captureCacheIdentity: 'derivative-reuse-3',
    });
    const shot = orbit(41);
    const decodeSpy = spyOn(pngModule, 'decodePng');
    let exportSpy: ReturnType<typeof spyOn> | undefined;
    try {
      const first = (await def.run({ code: CODE, shot, detail: 'full' })) as KilnInspectResult;
      expect(first.ok).toBe(true);
      // The cache check, the port's trust check and the annotator read one new frame: one decode.
      expect(decodeSpy).toHaveBeenCalledTimes(1);
      exportSpy = spyOn(renderModule, 'renderReviewDerivativeGlb');
      const second = (await def.run({ code: CODE, shot, detail: 'full' })) as KilnInspectResult;
      expect(second.ok).toBe(true);
      expect(second.viewFidelity?.receipts[0]?.captureCache?.hit).toBe(true);
      expect(second.pngBase64).toBe(first.pngBase64);
      expect(exportSpy).toHaveBeenCalledTimes(0);
      expect(decodeSpy).toHaveBeenCalledTimes(1);
    } finally {
      exportSpy?.mockRestore();
      decodeSpy.mockRestore();
    }
  });
});

describe('one derivative export per scene state, generation path', () => {
  test('captureViewsViaPort exports each hidden-part state once', async () => {
    const source = await renderModule.renderSceneToGLB(
      (await renderModule.executeKilnCode(CODE)).root,
    );
    const requests: PbrRenderRequest[] = [];
    const exportSpy = spyOn(renderModule, 'renderReviewDerivativeGlb');
    try {
      const hideRight = (azimuthDeg: number) => ({
        name: `H${azimuthDeg}`,
        camera: { type: 'orbit' as const, azimuthDeg, elevationDeg: 20 },
        hide: ['Mesh_Right'],
      });
      const result = await captureViewsViaPort(gpuPort(requests), source.bytes, 5000, {
        version: 'kiln.capture.v2',
        size: 128,
        shots: [hideRight(0), hideRight(90), { ...hideRight(180), hide: ['Mesh_Left'] }],
      });
      expect(result.ok).toBe(true);
      expect(requests).toHaveLength(3);
      expect(exportSpy).toHaveBeenCalledTimes(2);
      expect(sha(requests[0]!.glb)).toBe(sha(requests[1]!.glb));
      expect(sha(requests[2]!.glb)).not.toBe(sha(requests[0]!.glb));
    } finally {
      exportSpy.mockRestore();
    }
  });
});
