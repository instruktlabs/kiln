import { createHash } from 'node:crypto';
import { describe, expect, spyOn, test } from 'bun:test';

import * as renderModule from '../../render';
import { TIERED_CAR } from '../../__tests__/helpers/lod-fixture';
import type { PbrRenderPort, PbrRenderRequest } from '../../composer/render-port';
import { encodePng } from '../../views';
import * as glbModule from '../../views/glb';
import { reviewSceneCache } from '../../views/review-scene-cache';
import { createKilnProgramToolRegistry, type KilnToolContext } from '../registry';
import { ProgramArtifactStore } from '../program-artifacts';

/**
 * A host that retains the artifacts `kiln_render` reviews. A view of the artifact bytes is
 * `exactArtifact` only once that revision has been retained.
 */
function host(context: KilnToolContext = {}) {
  const tools = createKilnProgramToolRegistry({
    programArtifacts: new ProgramArtifactStore(),
    ...context,
  });
  return (name: string) => {
    const def = tools.find((candidate) => candidate.name === name);
    if (!def) throw new Error(`no ${name}`);
    return def;
  };
}

function tool(name: string, context: KilnToolContext = {}) {
  return host(context)(name);
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
  test('a shot sends the artifact itself; it is exact only once kiln_render retained it', async () => {
    const requests: PbrRenderRequest[] = [];
    const exports = spyOn(renderModule, 'renderReviewDerivativeGlb');
    try {
      const tools = host({
        viewRenderPort: gpuPort(requests),
        captureCacheIdentity: 'exact-inspect-1',
      });
      const shot = { name: 'insp', camera: { type: 'orbit', azimuthDeg: 41, elevationDeg: 22 } };
      const before = (await tools('kiln_inspect').run({
        code: code('exact-inspect-a'),
        shot,
        detail: 'full',
      })) as Result;
      expect(before.ok).toBe(true);
      expect(exports).toHaveBeenCalledTimes(0);
      expect(requests).toHaveLength(1);
      const unretained = before.viewFidelity!.receipts![0]!;
      expect(unretained.inputGlbSha256).toBe(sha(requests[0]!.glb));
      // The host retains reviewed artifacts, but not this one: kiln_finish would reject it.
      expect(unretained.exactArtifact).toBe(false);
      expect(unretained.reasonCodes).toContain('IN_LOOP_BUILD_NOT_PERSISTED');
      expect(before.viewFidelity!.exactArtifact).toBe(false);
      const rendered = (await tools('kiln_render').run({
        code: code('exact-inspect-a'),
      })) as Result;
      expect(rendered.ok).toBe(true);
      const after = (await tools('kiln_inspect').run({
        programRef: rendered.programRef!,
        shot,
        detail: 'full',
      })) as Result;
      const retained = after.viewFidelity!.receipts![0]!;
      expect(retained.inputGlbSha256).toBe(unretained.inputGlbSha256);
      expect(retained.exactArtifact).toBe(true);
      expect(retained.reasonCodes ?? []).not.toContain('IN_LOOP_BUILD_NOT_PERSISTED');
      expect(after.viewFidelity!.exactArtifact).toBe(true);
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
      const tools = host({
        viewRenderPort: gpuPort(requests),
        captureCacheIdentity: 'exact-inspect-2',
      });
      expect(
        ((await tools('kiln_render').run({ code: code('exact-inspect-b') })) as Result).ok,
      ).toBe(true);
      const inspect = tools('kiln_inspect');
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

  test('a legacy part that names a lower level of detail keeps its derivative', async () => {
    const exports = spyOn(renderModule, 'renderReviewDerivativeGlb');
    try {
      const tools = host();
      expect(((await tools('kiln_render').run({ code: TIERED_CAR })) as Result).ok).toBe(true);
      const level = (await tools('kiln_inspect').run({
        code: TIERED_CAR,
        part: 'Body_LOD1',
        detail: 'full',
      })) as Result;
      expect(level.ok).toBe(true);
      expect(exports).toHaveBeenCalledTimes(1);
      expect(level.viewFidelity!.exactArtifact).toBe(false);
      // The same tool on LOD0 is drawn from the artifact.
      const base = (await tools('kiln_inspect').run({
        code: TIERED_CAR,
        part: 'Body_LOD0',
        detail: 'full',
      })) as Result;
      expect(exports).toHaveBeenCalledTimes(1);
      expect(base.viewFidelity!.exactArtifact).toBe(true);
      expect(base.pngBase64).not.toBe(level.pngBase64);
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

  test('a new camera on a reused scene draws what a fresh load draws', async () => {
    const loads = spyOn(glbModule, 'loadGlbReviewScene');
    try {
      const shot = (azimuthDeg: number) => ({
        version: 'kiln.capture.v1',
        size: 128,
        output: 'separate',
        shots: [{ name: 'S', camera: { type: 'orbit', azimuthDeg, elevationDeg: 20 } }],
      });
      const render = tool('kiln_render');
      const first = (await render.run({ code: code('exact-cpu-c'), capture: shot(10) })) as Result;
      const loaded = loads.mock.calls.length;
      const reused = (await render.run({
        programRef: first.programRef!,
        capture: shot(200),
        detail: 'full',
      })) as Result;
      expect(loads.mock.calls.length).toBe(loaded);
      expect(reused.derivativeReceipts![0]!.captureCache?.hit).toBe(false);
      reviewSceneCache.clear();
      const fresh = (await tool('kiln_render', { cacheCaptures: false }).run({
        code: code('exact-cpu-c'),
        capture: shot(200),
      })) as Result;
      expect(loads.mock.calls.length).toBe(loaded + 1);
      expect(fresh.framesBase64).toEqual(reused.framesBase64!);
    } finally {
      loads.mockRestore();
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
