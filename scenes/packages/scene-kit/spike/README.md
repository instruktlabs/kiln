# M0 compatibility spike

This fixture uses the pinned React, R3F and `three/webgpu` packages. It deliberately
contains no shared-kit implementation. The browser runner owns its server and
browser processes; loading the page alone does not create a renderer.

From the workspace root, build with `bun run spike:build` and run the recorded
browser suite with `bun run spike:test`. The spike bundles React's development
build so the StrictMode check actually replays effects. Its byte size is not the
M1 public bundle baseline.

The test-only `window.__spike` interface is:

```ts
mount({
  backend: 'auto' | 'webgl2',
  toneMapping: 'aces' | 'neutral' | 'agx',
  shadows: 'basic' | 'percentage' | 'omitted' | false,
  strict: boolean,
  deferInit: boolean,
  rejectInit: boolean,
  width: number,
  height: number,
  dpr: number,
}): number; // omitted options use deterministic defaults; returns generation
unmount(): void;
releaseInit(): void;
setDpr(dpr: number): void;
resize(width: number, height: number): void;
snapshot(): object;
```

Wait for `readyCount === 1`, `frames >= n`, and the expected `canvas` dimensions,
using a generous correctness timeout. No timing sample is collected. Renderer
records are retained across mounts so the runner can verify that every earlier
generation completed disposal. Resource UUIDs make dispose/recreate visible and
prove that resize checks use the existing materials rather than fresh copies.

`deferInit` holds renderer initialization behind an explicit gate. Unmount while
the record says `initialized: false`, then `releaseInit()`, proves the late result is disposed
and the AbortError is handled by R3F. `rejectInit` is a synthetic factory error
for targeted boundary tests; React development may print its caught-error
diagnostic, so it is separate from the normal warning-free variants.

The fixture contains a red standard-material cube, a blue/green node-material
cube whose stripes explicitly depend on the viewport-size uniform, a receiving
ground plane, a directional shadow caster, and three unlit linear HDR patches.
The HDR patches distinguish ACES, Neutral and AgX independently of lighting.
The content is static so changed-size and fresh-size captures are comparable.

Source observations checked against the installed pins:

- R3F `dist/react-three-fiber.esm.js`: Canvas catches configuration rejections
  with `catch(setError)`, routes them through a React boundary, and uses insertion
  cleanup to preserve its root across StrictMode effect replay.
- R3F `dist/events-9ce18a08.esm.js`: omitted shadows reset enabled to false;
  boolean shadow settings choose the deprecated PCFSoft type. The spike captures
  that value in its record, then selects supported PCF before the first render.
- three `src/renderers/common/Renderer.js`: disposal is asynchronous in r186.
  The spike's wrapper shares one disposal promise and records memory after it.
- three `src/renderers/webgpu/WebGPUBackend.js` destroys an owned device;
  `src/renderers/webgl-fallback/WebGLBackend.js` loses its context. The spike
  observes `device.lost` or the context's actual state after disposal.

Two compatibility adjustments avoid warning causes without suppressing console
diagnostics or modifying dependencies:

- R3F constructs deprecated `THREE.Clock` before any user configuration runs.
  The bare-three alias now targets `three-runtime.ts`, which re-exports the same
  WebGPU build and supplies a Timer-backed Clock interface. Its elapsed fields
  remain writable for R3F's manual-advance and pause paths. Timer never connects
  to the document, so it adds no visibility listener. A classic-renderer sentinel
  fails clearly if a caller omits the required async factory.
- Chromium unconditionally warns about and ignores WebGPU's adapter
  `powerPreference` on Windows ([source](https://chromium.googlesource.com/chromium/src/+/master/third_party/blink/renderer/modules/webgpu/gpu.cc)).
  `windows-device.ts` selects the same effective adapter without that ineffective
  hint and requests exactly r186's supported feature intersection and limits.
  The renderer constructor retains `powerPreference: 'high-performance'`.
  The scene owns the supplied device and destroys it after renderer disposal,
  including after a fallback. Other platforms and failed requests use three's
  own initialization and fallback. A failure that returns to native adapter
  selection on Windows can still produce the platform warning; no diagnostic
  is hidden.

`bun test packages/scene-kit/spike/tests/compatibility.test.ts` covers these
adjustments with deterministic clock samples and a fake GPU API. The tests were
run before the implementation (missing-module failure) and after it (six pass).

Result evidence belongs in the root `evidence/m0/` directory and `PROGRESS.md`.
Passing this synthetic resize fixture does not substitute for the full-scene
stream and grass check B-13.
