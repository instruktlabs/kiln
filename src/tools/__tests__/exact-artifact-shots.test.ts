import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { PbrRenderRequest, PbrRenderResult } from '../../composer/render-port';
import { createKilnNativeToolRegistry, createKilnProgramToolRegistry } from '../registry';
import { encodePng } from '../../views/png';

const code =
  "const meta={name:'pair',category:'prop'};function build(){const r=createRoot('Root');" +
  "createPart('Near',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});" +
  "createPart('Far',boxGeo(1,1,1),gameMaterial('#333333'),{parent:r,position:[3,0,0]});" +
  "const hidden=createPart('Cover',boxGeo(9,9,9),gameMaterial('#ff0000'),{parent:r});hidden.visible=false;return r;}";

const sha = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as const;

/** A GPU port that answers every camera, and remembers what it was asked. */
function fixture(
  options: { identity?: string; answer?: (req: PbrRenderRequest) => PbrRenderResult | null } = {},
) {
  const requests: PbrRenderRequest[] = [];
  const telemetry: unknown[] = [];
  const defs = createKilnProgramToolRegistry({
    ...(options.identity ? { captureCacheIdentity: options.identity } : {}),
    onViewsRendered: (drawn: unknown) => telemetry.push(drawn),
    viewRenderPort: async (req: PbrRenderRequest): Promise<PbrRenderResult> => {
      requests.push(req);
      const answered = options.answer?.(req);
      if (answered) return answered;
      const size = req.width ?? 128;
      return {
        ok: true,
        rendererId: 'gpu:test',
        cameras: req.cameras,
        width: req.width,
        height: req.height,
        viewsPng: (req.cameras ?? []).map((_, index) =>
          encodePng(new Uint8Array(size * size * 3).fill(10 + index * 20), size, size),
        ),
        derivativeFidelity: { materialFaithful: true, inputGlbSha256: sha(req.glb) },
      };
    },
  } as never);
  const render = defs.find((def) => def.name === 'kiln_render')!;
  return { render, requests, telemetry };
}

const orbit = (azimuthDeg: number, extra: Record<string, unknown> = {}) => ({
  name: `A${azimuthDeg}`,
  camera: { type: 'orbit', azimuthDeg, elevationDeg: 20 },
  ...extra,
});
interface Rendered {
  ok: boolean;
  error?: string;
  programRef: string;
  captureCache?: { hit: boolean; reused: number; total: number };
  views: string[];
  viewFidelity: {
    exactArtifact: boolean;
    inputGlbSha256: string;
    reasonCodes?: string[];
    materialFaithful: boolean;
    degraded: boolean;
    delivered: string;
  };
  framesBase64?: string[];
  pngBase64?: string;
  derivativeReceipts: {
    exactArtifact: boolean;
    inputGlbSha256: string;
    derivativeLabel: string;
    materialFaithful: boolean;
    degradeReason?: string;
    delivered: string;
    captureCache?: { hit: boolean; reused: number; total: number };
    camera: unknown;
    cameraFidelity: string;
  }[];
  cameraShots: { name: string; camera: unknown }[];
}
const run = async (
  render: ReturnType<typeof fixture>['render'],
  args: Record<string, unknown>,
): Promise<Rendered> => {
  const out = (await render.run({ detail: 'full', ...args })) as Rendered;
  expect(out.error).toBeUndefined();
  return out;
};
const capture = (shots: unknown[], extra: Record<string, unknown> = {}) => ({
  version: 'kiln.capture.v1',
  shots,
  size: 128,
  ...extra,
});

describe('camera-only shots', () => {
  test('go in one request over the exact artifact, and say so', async () => {
    const { render, requests, telemetry } = fixture();
    const shots = [0, 40, 80, 120, 160, 200, 240, 280, 320].map((azimuth) => orbit(azimuth));
    const out = await run(render, { code, capture: capture(shots) });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.cameras).toHaveLength(9);
    expect(sha(requests[0]!.glb)).toBe(out.viewFidelity.inputGlbSha256 as `sha256:${string}`);
    // The same claim as a full-asset grid on a host that keeps no retained artifact.
    expect(out.viewFidelity).toMatchObject({
      exactArtifact: false,
      materialFaithful: true,
      degraded: false,
      delivered: 'full-material',
      reasonCodes: ['IN_LOOP_BUILD_NOT_PERSISTED'],
    });
    expect(out.views).toEqual(shots.map((shot) => shot.name));
    expect(out.derivativeReceipts.map((r) => r.derivativeLabel)).toEqual(out.views);
    for (const [index, receipt] of out.derivativeReceipts.entries()) {
      expect(receipt.exactArtifact).toBe(false);
      expect(receipt.inputGlbSha256).toBe(out.viewFidelity.inputGlbSha256);
      expect(receipt.cameraFidelity).toBe('echo-validated');
      expect(receipt.camera).toEqual(out.cameraShots[index]!.camera);
      expect(receipt.camera).toEqual(requests[0]!.cameras![index]);
    }
    expect(telemetry).toHaveLength(9);
    expect(telemetry[0]).toEqual({ renderer: 'gpu:test', degraded: false, neededPbr: true });
  });

  test('a host that retains the artifact gets the exact claim, as its grids do', async () => {
    const requests: PbrRenderRequest[] = [];
    const defs = createKilnNativeToolRegistry(
      {
        viewRenderPort: async (req: PbrRenderRequest): Promise<PbrRenderResult> => {
          requests.push(req);
          return {
            ok: true,
            rendererId: 'gpu:test',
            cameras: req.cameras,
            width: req.width,
            height: req.height,
            viewsPng: (req.cameras ?? []).map(() =>
              encodePng(new Uint8Array(128 * 128 * 3), 128, 128),
            ),
            derivativeFidelity: { materialFaithful: true, inputGlbSha256: sha(req.glb) },
          };
        },
      } as never,
      {},
    );
    const render = defs.find((def) => def.name === 'kiln_render')!;
    const out = await run(render, { code, capture: capture([orbit(0), orbit(90)]) });
    expect(requests).toHaveLength(1);
    expect(out.viewFidelity.exactArtifact).toBe(true);
    expect(out.viewFidelity.reasonCodes).toEqual([]);
    expect(out.derivativeReceipts.map((r) => r.exactArtifact)).toEqual([true, true]);
    // One isolated shot among them: the sheet as a whole is not the exact artifact.
    const mixed = await run(render, {
      code,
      capture: capture([orbit(0), orbit(90, { visibility: 'isolate' })]),
    });
    expect(mixed.viewFidelity.exactArtifact).toBe(false);
    expect(mixed.viewFidelity.reasonCodes).toEqual(['IN_LOOP_BUILD_NOT_PERSISTED']);
    expect(mixed.derivativeReceipts.map((r) => r.exactArtifact)).toEqual([true, false]);
  });

  test('shots past the service limit split, and the images stay in shot order', async () => {
    const { render, requests } = fixture();
    const shots = [0, 72, 144, 216, 288].map((azimuth) => orbit(azimuth));
    const out = await run(render, {
      code,
      capture: capture(shots, { size: 2048, output: 'separate' }),
    });
    expect(requests.map((req) => req.cameras!.length)).toEqual([4, 1]);
    expect(out.framesBase64).toHaveLength(5);
    expect(out.derivativeReceipts.map((r) => r.derivativeLabel)).toEqual(out.views);
    expect(out.derivativeReceipts[4]!.camera).toEqual(requests[1]!.cameras![0]);
  }, 60_000); // Five 2048 px PNG encodes and decodes.

  test('a subject framed in context is still camera-only', async () => {
    const { render, requests } = fixture();
    const out = await run(render, {
      code,
      capture: capture([orbit(0, { subject: { name: 'Mesh_Near' } }), orbit(90)]),
    });
    expect(requests).toHaveLength(1);
    expect(out.derivativeReceipts[0]!.inputGlbSha256).toBe(out.viewFidelity.inputGlbSha256);
  });

  test('every view in the cache means no request at all, and the counters say which', async () => {
    const { render, requests } = fixture({ identity: 'gpu-fixture' });
    const shots = [orbit(0), orbit(90), orbit(180)];
    const first = await run(render, { code, capture: capture(shots) });
    expect(requests).toHaveLength(1);
    expect(first.captureCache).toEqual({ hit: false, reused: 0, total: 3 });

    const repeat = await run(render, {
      programRef: first.programRef,
      capture: capture(shots),
    });
    expect(requests).toHaveLength(1);
    expect(repeat.captureCache).toEqual({ hit: true, reused: 3, total: 3 });
    for (const receipt of repeat.derivativeReceipts)
      expect(receipt.captureCache).toEqual({ hit: true, reused: 1, total: 1 });
    expect(repeat.pngBase64).toBe(first.pngBase64);

    const partial = await run(render, {
      programRef: first.programRef,
      capture: capture([orbit(0), orbit(45), orbit(180)]),
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.cameras).toHaveLength(1);
    expect(partial.captureCache).toEqual({ hit: false, reused: 2, total: 3 });
    expect(partial.derivativeReceipts.map((r) => r.captureCache?.hit)).toEqual([true, false, true]);
  });

  test('a changed size or backdrop never returns a stale image', async () => {
    const { render, requests } = fixture({ identity: 'gpu-fixture' });
    const shots = [orbit(30)];
    const first = await run(render, { code, capture: capture(shots) });
    const larger = await run(render, {
      programRef: first.programRef,
      capture: capture(shots, { size: 256 }),
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ width: 256, height: 256 });
    expect(larger.captureCache?.hit).toBe(false);

    const dark = await run(render, {
      programRef: first.programRef,
      capture: capture(shots, { backdrop: 'dark' }),
    });
    expect(requests).toHaveLength(3);
    expect(requests[2]!.backdrop).toBe('dark');
    expect(dark.captureCache?.hit).toBe(false);

    const again = await run(render, {
      programRef: first.programRef,
      capture: capture(shots, { backdrop: 'dark' }),
    });
    expect(requests).toHaveLength(3);
    expect(again.captureCache?.hit).toBe(true);
    expect(again.pngBase64).toBe(dark.pngBase64);
  });

  test('a rebuilt asset never returns the old asset image', async () => {
    const { render, requests } = fixture({ identity: 'gpu-fixture' });
    await run(render, { code, capture: capture([orbit(30)]) });
    const changed = code.replace('#888888', '#884444');
    const out = await run(render, { code: changed, capture: capture([orbit(30)]) });
    expect(requests).toHaveLength(2);
    expect(sha(requests[0]!.glb)).not.toBe(sha(requests[1]!.glb));
    expect(out.captureCache?.hit).toBe(false);
  });

  test('separate frames follow the same route', async () => {
    const { render, requests } = fixture();
    const out = await run(render, {
      code,
      capture: capture([orbit(0), orbit(90)], { output: 'separate' }),
    });
    expect(requests).toHaveLength(1);
    expect(out.framesBase64).toHaveLength(2);
    expect(out.pngBase64).toBeUndefined();
  });
});

describe('shots that change what draws', () => {
  test('isolate and hide keep a derivative; the rest still share the exact request', async () => {
    const { render, requests } = fixture();
    const out = await run(render, {
      code,
      capture: capture(
        [
          orbit(0),
          orbit(90, { subject: { name: 'Mesh_Near' }, visibility: 'isolate' }),
          orbit(180),
          orbit(270, { hide: ['Mesh_Far'] }),
        ],
        { version: 'kiln.capture.v2' },
      ),
    });
    expect(out.views).toEqual(['A0', 'A90', 'A180', 'A270']);
    expect(requests).toHaveLength(3);
    expect(requests[0]!.cameras).toHaveLength(2);
    expect(requests[1]!.cameras).toHaveLength(1);
    expect(requests[2]!.cameras).toHaveLength(1);
    const artifact = out.viewFidelity.inputGlbSha256;
    expect(sha(requests[0]!.glb) as string).toBe(artifact);
    expect(sha(requests[1]!.glb) as string).not.toBe(artifact);
    expect(sha(requests[2]!.glb) as string).not.toBe(artifact);
    expect(out.derivativeReceipts.map((r) => r.inputGlbSha256 === artifact)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(out.derivativeReceipts[1]!.camera).toEqual(requests[1]!.cameras![0]);
    expect(out.derivativeReceipts[2]!.camera).toEqual(requests[0]!.cameras![1]);
  });

  test('a lower level of detail keeps a derivative', async () => {
    const lod =
      "const meta={name:'lod',category:'prop'};function build(){const r=createRoot('Root');" +
      "const tiers=['Body_LOD0','Body_LOD1'].map((name)=>{const g=new THREE.Group();g.name=name;r.add(g);return g;});" +
      "createPart('Near',boxGeo(2,2,2),gameMaterial('#888888'),{parent:tiers[0]});" +
      "createPart('Far',boxGeo(1,1,1),gameMaterial('#333333'),{parent:tiers[1]});" +
      'defineLod(tiers,{screenCoverage:[0.2,0]});return r;}';
    const { render, requests } = fixture();
    const out = await run(render, {
      code: lod,
      capture: capture([orbit(0), orbit(90, { subject: { name: 'Body_LOD1' } })]),
    });
    expect(requests).toHaveLength(2);
    const artifact = out.viewFidelity.inputGlbSha256;
    expect(sha(requests[0]!.glb) as string).toBe(artifact);
    expect(sha(requests[1]!.glb) as string).not.toBe(artifact);
    expect(out.derivativeReceipts.map((r) => r.inputGlbSha256 === artifact)).toEqual([true, false]);
  });
});

describe('the batch stays inside the degrade policy', () => {
  test('a failed batch falls back to a cell per shot, which may still succeed', async () => {
    const { render, requests } = fixture({
      answer: (req) =>
        (req.cameras?.length ?? 0) > 1
          ? { ok: false, rendererId: 'gpu:test', error: 'too much at once' }
          : null,
    });
    const out = await run(render, { code, capture: capture([orbit(0), orbit(90)]) });
    expect(requests).toHaveLength(3);
    expect(out.viewFidelity).toMatchObject({ materialFaithful: true, exactArtifact: false });
    const artifact = out.viewFidelity.inputGlbSha256;
    expect(out.derivativeReceipts.map((r) => r.inputGlbSha256 === artifact)).toEqual([
      false,
      false,
    ]);
  });

  test('a port that never answers ends in the CPU degrade with the deadline as its reason', async () => {
    const requests: PbrRenderRequest[] = [];
    const defs = createKilnProgramToolRegistry({
      viewRenderTimeoutMs: 30,
      viewRenderPort: async (req: PbrRenderRequest) => {
        requests.push(req);
        return new Promise<PbrRenderResult>(() => {});
      },
    } as never);
    const out = await run(defs.find((def) => def.name === 'kiln_render')!, {
      code,
      capture: capture([orbit(0), orbit(90)]),
    });
    expect(requests).toHaveLength(3);
    expect(out.viewFidelity).toMatchObject({
      materialFaithful: false,
      delivered: 'geometry-flat',
      degraded: true,
      exactArtifact: false,
    });
    expect(out.derivativeReceipts[0]!.degradeReason).toBe('view render port timed out after 30ms');
  });

  test('required GPU still refuses when batch and cells fail', async () => {
    const defs = createKilnProgramToolRegistry({
      viewRenderRequired: true,
      viewRenderPort: async () => ({ ok: false, rendererId: 'gpu:test', error: 'offline' }),
    } as never);
    const out = (await defs
      .find((def) => def.name === 'kiln_render')!
      .run({ code, capture: capture([orbit(0)]) })) as { ok: boolean; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toContain('Required GPU render failed: offline');
  });

  test('without a port the CPU route is unchanged', async () => {
    const render = createKilnProgramToolRegistry().find((def) => def.name === 'kiln_render')!;
    const out = await run(render, { code, capture: capture([orbit(0), orbit(90)]) });
    expect(out.viewFidelity).toMatchObject({
      delivered: 'geometry-flat',
      exactArtifact: false,
      reasonCodes: ['IN_LOOP_BUILD_NOT_PERSISTED'],
    });
    expect(out.derivativeReceipts.every((r) => r.exactArtifact === false)).toBe(true);
  });

  test('cancellation during a batch ends the call', async () => {
    const controller = new AbortController();
    const defs = createKilnProgramToolRegistry({
      evaluationControls: () => ({ signal: controller.signal }),
      viewRenderPort: async () => {
        controller.abort(new Error('cancelled by the host'));
        return new Promise<PbrRenderResult>(() => {});
      },
    } as never);
    const out = (await defs
      .find((def) => def.name === 'kiln_render')!
      .run({ code, capture: capture([orbit(0), orbit(90)]) })) as { ok: boolean; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toContain('cancelled by the host');
  });
});
