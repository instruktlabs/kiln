import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { createKilnProgramToolRegistry } from '../registry';
import { encodePng } from '../../views';
import type { PbrRenderRequest } from '../../composer/render-port';
const code =
  "const meta={name:'box',category:'prop'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});return r;}";
test('public references render mixed exact cameras and expose separate images', async () => {
  const defs = createKilnProgramToolRegistry();
  const render = defs.find((d) => d.name === 'kiln_render')!;
  const first = (await render.run({
    code,
    capture: {
      version: 'kiln.capture.v1',
      shots: [
        {},
        {
          subject: { name: 'Mesh_Body' },
          visibility: 'isolate',
          camera: {
            type: 'explicit',
            projection: 'perspective',
            position: [3, 2, 3],
            target: [0, 0, 0],
          },
        },
      ],
      size: 128,
      output: 'separate',
    },
  })) as Record<string, unknown>;
  expect(first).toMatchObject({ ok: true });
  expect(first.cameraShots).toHaveLength(2);
  expect(first.framesBase64).toHaveLength(2);
  expect(render.mediaMulti?.(first)?.pngs).toHaveLength(2);
  const second = (await render.run({
    programRef: first.programRef,
    capture: { preset: '1x1' },
  })) as Record<string, unknown>;
  expect(second.ok).toBe(true);
});
test('GPU inspect honors padding and contextual framing with explicit camera receipt', async () => {
  const requests: PbrRenderRequest[] = [];
  const defs = createKilnProgramToolRegistry({
    viewRenderPort: async (req) => {
      requests.push(req);
      return {
        ok: true,
        rendererId: 'gpu:test',
        cameras: req.cameras,
        width: req.width,
        height: req.height,
        viewsPng: [encodePng(new Uint8Array(512 * 512 * 3), 512, 512)],
        derivativeFidelity: {
          materialFaithful: true,
          inputGlbSha256: `sha256:${createHash('sha256').update(req.glb).digest('hex')}`,
        },
      };
    },
  });
  const inspect = defs.find((d) => d.name === 'kiln_inspect')!;
  const result = (await inspect.run({ code, part: 'Body', zoom: 4 })) as Record<string, unknown>;
  expect(result.ok).toBe(true);
  expect(requests[0]?.cameras?.[0]).toMatchObject({
    projection: 'orthographic',
    halfHeight: expect.any(Number),
  });
  expect(result.viewFidelity).toMatchObject({ materialFaithful: true });
});

test('inspection shares strict shot selection; animation locks explicit frame and samples requested phases', async () => {
  const defs = createKilnProgramToolRegistry();
  const inspect = defs.find((d) => d.name === 'kiln_inspect')!;
  const close = (await inspect.run({
    code,
    shot: {
      subject: { name: 'Mesh_Body' },
      camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 90 },
    },
  })) as Record<string, unknown>;
  expect(close.cameraShot).toMatchObject({ subject: { name: 'Mesh_Body' } });
  const animated =
    "const meta={name:'motion',category:'prop'};function build(){const r=createRoot('Root');const p=createPivot('Body',[0,0,0],r);createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'),{parent:p});return r;}function animate(){return [createClip('move',1,[positionTrack('Joint_Body',[{time:0,position:[0,0,0]},{time:1,position:[4,0,0]}])])];}";
  const anim = defs.find((d) => d.name === 'kiln_screenshot_animation')!;
  const out = (await anim.run({
    code: animated,
    clip: 'move',
    frameTimes: [0, 0.25, 1],
    shot: { camera: { type: 'orbit', azimuthDeg: 90, elevationDeg: 0 } },
    perFrame: true,
  })) as Record<string, unknown>;
  expect(out).toMatchObject({ ok: true, frames: 3, frameTimes: [0, 0.25, 1] });
  // Locked: the compact result states the one shot once, for all three frames.
  const shots = out.cameraShots as { camera: unknown; frames?: number }[];
  expect(shots).toHaveLength(1);
  expect(shots[0]!.frames).toBe(3);
  const full = (await anim.run({
    code: animated,
    clip: 'move',
    frameTimes: [0, 0.25, 1],
    shot: { camera: { type: 'orbit', azimuthDeg: 90, elevationDeg: 0 } },
    perFrame: true,
    detail: 'full',
  })) as Record<string, unknown>;
  const cameras = (full.cameraShots as { camera: unknown }[]).map((s) => s.camera);
  expect(cameras).toHaveLength(3);
  expect(cameras[0]).toEqual(cameras[2]);
});
test('required GPU does not return CPU success when camera attestation is missing', async () => {
  const defs = createKilnProgramToolRegistry({
    viewRenderRequired: true,
    viewRenderPort: async () => ({ ok: false, rendererId: 'gpu:test', error: 'offline' }),
  } as never);
  const result = (await defs
    .find((d) => d.name === 'kiln_inspect')!
    .run({ code, zoom: 4 })) as Record<string, unknown>;
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/GPU/);
});
test('public CPU grids and derivative inspection reuse cells and expose counters', async () => {
  const defs = createKilnProgramToolRegistry();
  const render = defs.find((d) => d.name === 'kiln_render')!;
  const first = (await render.run({ code, capture: { preset: '1x1' } })) as Record<string, unknown>;
  const second = (await render.run({
    programRef: first.programRef,
    capture: { preset: '2x1' },
  })) as Record<string, unknown>;
  expect(second.captureCache).toMatchObject({ reused: 1, total: 2 });
  const inspect = defs.find((d) => d.name === 'kiln_inspect')!;
  await inspect.run({ programRef: first.programRef, zoom: 4 });
  const close = (await inspect.run({ programRef: first.programRef, zoom: 4 })) as {
    viewFidelity: { receipts: { captureCache?: { hit: boolean } }[] };
  };
  expect(close.viewFidelity.receipts[0]?.captureCache?.hit).toBe(true);
});
test('public GPU derivative cells reuse only with declared backend identity', async () => {
  let calls = 0;
  const defs = createKilnProgramToolRegistry({
    captureCacheIdentity: 'gpu-fixture',
    viewRenderPort: async (req: PbrRenderRequest) => {
      calls++;
      return {
        ok: true,
        rendererId: 'gpu:fixture',
        cameras: req.cameras,
        width: req.width,
        height: req.height,
        viewsPng: [encodePng(new Uint8Array(512 * 512 * 3), 512, 512)],
        derivativeFidelity: {
          materialFaithful: true,
          inputGlbSha256: `sha256:${createHash('sha256').update(req.glb).digest('hex')}`,
        },
      };
    },
  } as never);
  const inspect = defs.find((d) => d.name === 'kiln_inspect')!;
  await inspect.run({ code, zoom: 4 });
  const out = (await inspect.run({ code, zoom: 4 })) as {
    viewFidelity: { receipts: { captureCache?: { hit: boolean } }[] };
  };
  expect(calls).toBe(1);
  expect(out.viewFidelity.receipts[0]?.captureCache?.hit).toBe(true);
});
test('inspect exposes subject frames and measures exact part-local anchors', async () => {
  const defs = createKilnProgramToolRegistry();
  const out = (await defs
    .find((d) => d.name === 'kiln_inspect')!
    .run({
      code,
      shot: { subject: { name: 'Mesh_Body' } },
      measure: {
        from: { subject: { name: 'Mesh_Body' } },
        to: { subject: { name: 'Mesh_Body' }, point: [0, 2, 0] },
      },
    })) as { ok: boolean; measurement: unknown; subjectFrame: { worldMatrix: number[] } };
  expect(out.ok).toBe(true);
  expect(out.measurement).toMatchObject({ distance: 2, units: 'asset units', frame: 'world' });
  expect(out.subjectFrame.worldMatrix).toHaveLength(16);
});

/** Count meshes in the JSON chunk of a GLB, without decoding buffers. */
function glbMeshCount(glb: Uint8Array): number {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  return (json.meshes ?? []).length;
}

test('isolate hides surrounding geometry on the GPU path, not only the CPU rasterizer', async () => {
  // Two meshes far enough apart that context framing keeps both in view, so the
  // only thing that can remove one from the GPU request is isolation itself.
  const twoPart =
    "const meta={name:'pair',category:'prop'};function build(){const r=createRoot('Root');" +
    "createPart('Near',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});" +
    "createPart('Far',boxGeo(1,1,1),gameMaterial('#333333'),{parent:r,position:[3,0,0]});return r;}";
  const requests: PbrRenderRequest[] = [];
  const defs = createKilnProgramToolRegistry({
    viewRenderPort: async (req) => {
      requests.push(req);
      return {
        ok: true,
        rendererId: 'gpu:test',
        cameras: req.cameras,
        width: req.width,
        height: req.height,
        viewsPng: (req.cameras ?? [null]).map(() =>
          encodePng(new Uint8Array(256 * 256 * 3), 256, 256),
        ),
        derivativeFidelity: {
          materialFaithful: true,
          inputGlbSha256: `sha256:${createHash('sha256').update(req.glb).digest('hex')}`,
        },
      };
    },
  });
  const render = defs.find((d) => d.name === 'kiln_render')!;
  const shot = (visibility: 'context' | 'isolate') => ({
    subject: { name: 'Mesh_Near' },
    visibility,
    camera: {
      type: 'explicit' as const,
      projection: 'perspective' as const,
      position: [6, 4, 6],
      target: [0, 0, 0],
    },
  });
  const run = async (visibility: 'context' | 'isolate') => {
    requests.length = 0;
    const out = (await render.run({
      code: twoPart,
      capture: { version: 'kiln.capture.v1', shots: [shot(visibility)], size: 256 },
    })) as Record<string, unknown>;
    expect(out.ok).toBe(true);
    expect(requests).toHaveLength(1);
    return glbMeshCount(requests[0]!.glb);
  };
  // Isolation is per shot, so one isolate shot must not strip geometry from a
  // later context shot in the same capture. Both mechanisms mutate shared
  // `.visible` state, which is what makes the ordering worth pinning.
  requests.length = 0;
  const mixed = (await render.run({
    code: twoPart,
    capture: {
      version: 'kiln.capture.v1',
      shots: [shot('isolate'), shot('context')],
      size: 256,
      output: 'separate',
    },
  })) as Record<string, unknown>;
  expect(mixed.ok).toBe(true);
  expect(requests.map((r) => glbMeshCount(r.glb))).toEqual([1, 2]);
  expect(await run('context')).toBe(2);
  // The CPU rasterizer culls on `mesh.visible` (views/raster.ts), but a GLB has no
  // per-mesh visibility, so an unfiltered serialization makes isolate a silent
  // no-op on exactly the material-faithful path it is most useful on.
  expect(await run('isolate')).toBe(1);
});

test('legacy kiln_inspect isolate keeps its occlusion promise on the GPU path', async () => {
  const twoPart =
    "const meta={name:'pair',category:'prop'};function build(){const r=createRoot('Root');" +
    "createPart('Near',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});" +
    "createPart('Far',boxGeo(1,1,1),gameMaterial('#333333'),{parent:r,position:[3,0,0]});return r;}";
  const requests: PbrRenderRequest[] = [];
  const defs = createKilnProgramToolRegistry({
    viewRenderPort: async (req) => {
      requests.push(req);
      return {
        ok: true,
        rendererId: 'gpu:test',
        cameras: req.cameras,
        width: req.width,
        height: req.height,
        viewsPng: (req.cameras ?? [null]).map(() =>
          encodePng(new Uint8Array(512 * 512 * 3), 512, 512),
        ),
        derivativeFidelity: {
          materialFaithful: true,
          inputGlbSha256: `sha256:${createHash('sha256').update(req.glb).digest('hex')}`,
        },
      };
    },
  });
  const inspect = defs.find((d) => d.name === 'kiln_inspect')!;
  const seen = await inspect.run({ code: twoPart, part: 'Near', isolate: true });
  expect((seen as Record<string, unknown>).ok).toBe(true);
  // The result text promises "nothing in this image occludes it". Before the
  // derivative GLB was filtered that sentence was false whenever a GPU service
  // was attached, which is the one case where the close-up is worth taking.
  expect(requests).toHaveLength(1);
  expect(glbMeshCount(requests[0]!.glb)).toBe(1);
});
