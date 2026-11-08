import { createHash } from 'node:crypto';
import { describe, expect, spyOn, test } from 'bun:test';

import * as renderModule from '../../render';
import type { PbrRenderPort, PbrRenderRequest } from '../../composer/render-port';
import { encodePng } from '../../views';
import { createKilnProgramToolRegistry, type KilnToolContext } from '../registry';
import { ProgramArtifactStore } from '../program-artifacts';

/** A host that retains reviewed artifacts, so a view of the artifact bytes is `exactArtifact`. */
function tool(name: string, context: KilnToolContext = {}) {
  const def = createKilnProgramToolRegistry({
    programArtifacts: new ProgramArtifactStore(),
    ...context,
  }).find((candidate) => candidate.name === name);
  if (!def) throw new Error(`no ${name}`);
  return def;
}

const code = (name: string) => `
const meta = { name: '${name}', category: 'prop' };
function build() {
  const root = createRoot('Root');
  createPart('Left', boxGeo(1, 1, 1), gameMaterial('#cc3333'), { parent: root, position: [-1, 0, 0] });
  createPart('Right', boxGeo(1, 1, 1), gameMaterial('#3333cc'), { parent: root, position: [1, 0, 0] });
  return root;
}`;

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function gpuPort(requests: PbrRenderRequest[]): PbrRenderPort {
  return async (request) => {
    requests.push(request);
    const size = request.width ?? request.size!;
    return {
      ok: true,
      rendererId: 'gpu:exact-inspect',
      ...(request.cameras ? { cameras: request.cameras, width: size, height: size } : {}),
      viewsPng: (request.cameras ?? request.viewDirs ?? []).map(() =>
        encodePng(new Uint8Array(size * size * 3).fill(90), size, size),
      ),
      derivativeFidelity: {
        materialFaithful: true,
        inputGlbSha256: sha(request.glb) as `sha256:${string}`,
      },
    };
  };
}

interface Receipt {
  exactArtifact: boolean;
  inputGlbSha256: string;
  delivered: string;
  materialFaithful: boolean;
  rendererId: string;
  captureCache?: { hit: boolean };
  reasonCodes?: string[];
}
interface Result {
  ok: boolean;
  error?: string;
  programRef?: string;
  pngBase64?: string;
  framesBase64?: string[];
  viewFidelity?: { exactArtifact: boolean; inputGlbSha256?: string; receipts?: Receipt[] };
  derivativeReceipts?: Receipt[];
}

describe('kiln_inspect draws camera-only shots from the artifact', () => {
  test('a shot sends the artifact itself, and its receipt says so', async () => {
    const requests: PbrRenderRequest[] = [];
    const exports = spyOn(renderModule, 'renderReviewDerivativeGlb');
    try {
      const inspect = tool('kiln_inspect', {
        viewRenderPort: gpuPort(requests),
        captureCacheIdentity: 'exact-inspect-1',
      });
      const result = (await inspect.run({
        code: code('exact-inspect-a'),
        shot: { name: 'insp', camera: { type: 'orbit', azimuthDeg: 41, elevationDeg: 22 } },
        detail: 'full',
      })) as Result;
      expect(result.ok).toBe(true);
      expect(exports).toHaveBeenCalledTimes(0);
      expect(requests).toHaveLength(1);
      const receipt = result.viewFidelity!.receipts![0]!;
      expect(receipt.inputGlbSha256).toBe(sha(requests[0]!.glb));
      expect(receipt.exactArtifact).toBe(true);
      expect(result.viewFidelity!.exactArtifact).toBe(true);
    } finally {
      exports.mockRestore();
    }
  });

  test('a host that retains no artifact says the bytes are an in-loop build', async () => {
    const requests: PbrRenderRequest[] = [];
    const inspect = tool('kiln_inspect', {
      programArtifacts: undefined,
      viewRenderPort: gpuPort(requests),
      captureCacheIdentity: 'exact-inspect-3',
    });
    const result = (await inspect.run({
      code: code('exact-inspect-c'),
      shot: { name: 'insp', camera: { type: 'orbit', azimuthDeg: 41, elevationDeg: 22 } },
      detail: 'full',
    })) as Result;
    const receipt = result.viewFidelity!.receipts![0]!;
    expect(receipt.inputGlbSha256).toBe(sha(requests[0]!.glb));
    expect(receipt.exactArtifact).toBe(false);
    expect(receipt.reasonCodes).toContain('IN_LOOP_BUILD_NOT_PERSISTED');
    expect(result.viewFidelity!.exactArtifact).toBe(false);
  });

  test('the legacy whole-asset view takes the same route; an isolated view still exports', async () => {
    const requests: PbrRenderRequest[] = [];
    const exports = spyOn(renderModule, 'renderReviewDerivativeGlb');
    try {
      const inspect = tool('kiln_inspect', {
        viewRenderPort: gpuPort(requests),
        captureCacheIdentity: 'exact-inspect-2',
      });
      const whole = (await inspect.run({
        code: code('exact-inspect-b'),
        azimuthDeg: 30,
        elevationDeg: 20,
        detail: 'full',
      })) as Result;
      expect(whole.ok).toBe(true);
      expect(exports).toHaveBeenCalledTimes(0);
      expect(whole.viewFidelity!.exactArtifact).toBe(true);
      const framed = (await inspect.run({
        code: code('exact-inspect-b'),
        part: 'Left',
        detail: 'full',
      })) as Result;
      expect(framed.viewFidelity!.exactArtifact).toBe(true);
      expect(exports).toHaveBeenCalledTimes(0);
      const isolated = (await inspect.run({
        code: code('exact-inspect-b'),
        part: 'Left',
        isolate: true,
        detail: 'full',
      })) as Result;
      expect(isolated.ok).toBe(true);
      expect(exports).toHaveBeenCalledTimes(1);
      expect(isolated.viewFidelity!.exactArtifact).toBe(false);
    } finally {
      exports.mockRestore();
    }
  });
});

describe('the CPU route draws camera-only shots from the artifact', () => {
  test('no export, the artifact hash on the receipt, and a cached repeat', async () => {
    const exports = spyOn(renderModule, 'renderReviewDerivativeGlb');
    try {
      const render = tool('kiln_render');
      const capture = {
        version: 'kiln.capture.v1',
        size: 128,
        output: 'separate',
        shots: [0, 120, 240].map((azimuthDeg) => ({
          name: `S${azimuthDeg}`,
          camera: { type: 'orbit', azimuthDeg, elevationDeg: 20 },
        })),
      };
      const first = (await render.run({
        code: code('exact-cpu-a'),
        capture,
        detail: 'full',
      })) as Result;
      expect(first.ok).toBe(true);
      expect(exports).toHaveBeenCalledTimes(0);
      const receipts = first.derivativeReceipts!;
      expect(receipts).toHaveLength(3);
      for (const receipt of receipts) {
        expect(receipt.delivered).toBe('geometry-flat');
        expect(receipt.materialFaithful).toBe(false);
        expect(receipt.exactArtifact).toBe(true);
        expect(receipt.reasonCodes).toContain('FULL_MATERIAL_RENDER_UNAVAILABLE');
      }
      for (const receipt of receipts)
        expect(receipt.inputGlbSha256).toBe(first.viewFidelity!.inputGlbSha256!);
      const again = (await render.run({
        programRef: first.programRef!,
        capture,
        detail: 'full',
      })) as Result;
      expect(again.derivativeReceipts!.every((receipt) => receipt.captureCache?.hit)).toBe(true);
      expect(again.framesBase64).toEqual(first.framesBase64!);
    } finally {
      exports.mockRestore();
    }
  });

  test('an isolated CPU shot still draws its derivative', async () => {
    const exports = spyOn(renderModule, 'renderReviewDerivativeGlb');
    try {
      const result = (await tool('kiln_render').run({
        code: code('exact-cpu-b'),
        capture: {
          version: 'kiln.capture.v1',
          size: 128,
          shots: [
            {
              name: 'iso',
              subject: { path: '/exact-cpu-b[0]/Root[0]/Mesh_Left[0]' },
              visibility: 'isolate',
            },
          ],
        },
        detail: 'full',
      })) as Result;
      expect(result.ok).toBe(true);
      expect(exports).toHaveBeenCalledTimes(1);
      expect(result.derivativeReceipts![0]!.exactArtifact).toBe(false);
    } finally {
      exports.mockRestore();
    }
  });
});
