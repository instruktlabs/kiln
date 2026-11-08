import { test, expect, spyOn } from 'bun:test';
import { createKilnProgramToolRegistry } from '../../tools/registry';
import { enforceCapturePixels } from '../capture-limits';
import * as gridModule from '../grid';
import { PAD } from '../grid';
const code =
  "const meta={name:'limit',category:'prop'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#e24433'),{parent:r});return r;}";
test('host pixel limits reject CPU and GPU requests before evaluation or rendering', async () => {
  let called = 0;
  const defs = createKilnProgramToolRegistry({
    captureLimits: { maxTotalPixels: 100 },
    viewRenderPort: async () => {
      called++;
      throw Error('must not call');
    },
  });
  for (const name of [
    'kiln_render',
    'kiln_inspect',
    'kiln_view_interior',
    'kiln_screenshot_animation',
  ]) {
    const out = (await defs.find((d) => d.name === name)!.run({ code, clip: 'idle' })) as {
      ok: boolean;
      error: string;
    };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/pixel budget/);
  }
  expect(called).toBe(0);
});
test('host output byte limits reject returned grid and separate images', async () => {
  const defs = createKilnProgramToolRegistry({ captureLimits: { maxOutputBytes: 10 } });
  for (const output of ['grid', 'separate']) {
    const out = (await defs
      .find((d) => d.name === 'kiln_render')!
      .run({ code, capture: { version: 'kiln.capture.v1', shots: [{}], size: 128, output } })) as {
      ok: boolean;
      error: string;
      pngBase64?: string;
    };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/byte budget/);
    expect(out.pngBase64).toBeUndefined();
  }
});

test('low-level capture limits reject before invoking a GPU adapter', async () => {
  const { captureViewsViaPort } = await import('../port');
  let called = false;
  const out = await captureViewsViaPort(
    async () => {
      called = true;
      throw Error('unexpected');
    },
    new Uint8Array(),
    100,
    undefined,
    { maxTotalPixels: 100 },
  );
  expect(out.ok).toBe(false);
  expect(called).toBe(false);
});
test('models cannot raise default host limits', async () => {
  const { resolveCaptureLimits, DEFAULT_CAPTURE_LIMITS } = await import('../capture-limits');
  expect(resolveCaptureLimits({ maxTotalPixels: Number.MAX_SAFE_INTEGER })).toEqual(
    DEFAULT_CAPTURE_LIMITS,
  );
});
test('GPU image headers are bounded before decompression', async () => {
  const { captureViewPngsViaPort } = await import('../port');
  const { encodePng } = await import('../png');
  const png = Uint8Array.from(encodePng(new Uint8Array(3), 1, 1));
  new DataView(png.buffer).setUint32(16, 100000);
  new DataView(png.buffer).setUint32(20, 100000);
  const out = await captureViewPngsViaPort(
    async () => ({ ok: true, rendererId: 'gpu:test', viewsPng: [png] }),
    new Uint8Array(),
    100,
    [[1, 0, 0]],
    128,
  );
  expect(out).toMatchObject({ ok: false, reason: expect.stringMatching(/pixel budget/) });
});

test('the pixel budget names what to change', () => {
  const charged = () => enforceCapturePixels(6, 1800, 3, undefined, true, true);
  expect(charged).toThrow(
    'capture pixel budget exceeded: 39002592 pixels against a limit of 24000000 (6 shots at size 1800, plus their grid sheet). Largest size that fits: 1411 as a grid, 2000 with output: "separate".',
  );
  expect(() => enforceCapturePixels(9, 2048, 3, undefined, false, true)).toThrow(
    'capture pixel budget exceeded: 37748736 pixels against a limit of 24000000 (9 shots at size 2048). Largest size that fits: 1632.',
  );
  // Nothing at the smallest capture size fits: the only change left is fewer shots.
  expect(() => enforceCapturePixels(9, 128, 3, { maxTotalPixels: 1000 }, true, true)).toThrow(
    /Use fewer shots\.$/,
  );
  // Tools without a size to change keep the plain statement.
  expect(() => enforceCapturePixels(6, 384, 3, { maxTotalPixels: 100 })).toThrow(
    /^capture pixel budget exceeded: \d+ pixels against a limit of 100\.$/,
  );
});

test('separate images are not charged for a sheet nobody receives', async () => {
  const separateOnly = 6 * 128 * 128;
  const defs = createKilnProgramToolRegistry({ captureLimits: { maxTotalPixels: separateOnly } });
  const render = defs.find((d) => d.name === 'kiln_render')!;
  const shots = Array.from({ length: 6 }, (_, index) => ({
    camera: { type: 'orbit', azimuthDeg: index * 60 },
  }));
  const out = (await render.run({
    code,
    capture: { version: 'kiln.capture.v1', shots, size: 128, output: 'separate' },
  })) as { ok: boolean; error?: string; framesBase64?: string[]; gridWidth?: number };
  expect(out.error).toBeUndefined();
  expect(out.ok).toBe(true);
  expect(out.framesBase64).toHaveLength(6);
  expect(out.gridWidth).toBe(3 * 128 + 4 * PAD);
  const grid = (await render.run({
    code,
    capture: { version: 'kiln.capture.v1', shots, size: 128 },
  })) as { ok: boolean; error: string };
  expect(grid.ok).toBe(false);
  expect(grid.error).toContain('capture pixel budget exceeded');
  expect(grid.error).toContain('with output: "separate"');
});

test('a separate capture never composes its sheet', async () => {
  const grids = spyOn(gridModule, 'compositeCellGrid');
  try {
    const render = createKilnProgramToolRegistry().find((d) => d.name === 'kiln_render')!;
    const capture = { version: 'kiln.capture.v1', shots: [{}], size: 128 };
    await render.run({ code, capture: { ...capture, output: 'separate' } });
    expect(grids).not.toHaveBeenCalled();
    await render.run({ code, capture });
    expect(grids).toHaveBeenCalledTimes(1);
  } finally {
    grids.mockRestore();
  }
});
