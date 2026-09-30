import { renderDisplayTarget } from './display-output.mjs';
import { packRgbaReadback } from './readback.mjs';
// GLB bytes -> PBR PNG views. Headless three.js WebGPURenderer, RenderTarget-only.
//
// B1a engineering notes encoded here:
// - bare 'three' is aliased to 'three/webgpu' via module hooks (see register-hooks.mjs);
//   loading this module without the hooks would split three's class identity.
// - Renderer.init() starts an internal loop via self.requestAnimationFrame — shimmed.
// - GLTFLoader's ImageBitmapLoader path yields fake bitmaps that Dawn uploads as
//   black; decoded images are converted to DataTexture (writeTexture path).
// - WebGPU readback rows are already top-down: no Y flip.
import { PNG } from 'pngjs';
import { acquireGpu } from './gpu.mjs';
import { validateRenderMode } from './contract.mjs';
import { selfContainedResourceUrl, validateSelfContainedGlb } from './glb-input.mjs';
import {
  DEFAULT_PRESENTATION_PRESET_ID,
  PRESENTATION_PRESET_IDS,
  SHADOW_FILTERS,
  getPresentationPreset,
} from './presentation-presets.mjs';
import { BACKDROP_HEX } from './backdrops.mjs';
import { backdropClearColor } from './display-transform.mjs';
import { reviewNeutralToneMapping } from './review-tone-mapping.mjs';

export { MAX_VIEW_DIRS, validateViewDirs } from './contract.mjs';
import { beautyCameraSpec, orthoDepth, orthoHalfExtent } from './framing.mjs';
import { applyNodeVisibility, expandByDrawnObject } from './node-visibility.mjs';

globalThis.self = globalThis;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// PNG-only decode. Admission rejects other formats before GLTFLoader can
// silently discard a map on decode failure.
globalThis.createImageBitmap = async (blob) => {
  const buf = Buffer.from(await blob.arrayBuffer());
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('only PNG images supported in GLB');
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data), close() {} };
};

const THREE = await import('three/webgpu');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

/**
 * Fixed, versioned presentation profile for every GPU view sheet. The GPU path
 * is the intentional beauty/inspection upgrade; it does not try to imitate the
 * flat CPU fallback. Keep these values deterministic so sheets remain directly
 * comparable across models and runs.
 */
export const PRESENTATION_PROFILE_ID = DEFAULT_PRESENTATION_PRESET_ID;
const defaultPresentation = getPresentationPreset(PRESENTATION_PROFILE_ID);
// Compatibility exports mirror the selected default. Versioned legacy values
// remain available from getPresentationPreset('neutral-studio-v1').
export const PRESENTATION_EXPOSURE = defaultPresentation.exposure;
export const PRESENTATION_LIGHTS = Object.freeze({
  hemisphere: Object.freeze({
    sky: defaultPresentation.ambient.sky,
    ground: defaultPresentation.ambient.ground,
    intensity: defaultPresentation.ambient.intensity,
  }),
  ...Object.fromEntries(
    ['key', 'fill', 'rim'].map((role) => [
      role,
      Object.freeze({
        color: defaultPresentation[role].color,
        intensity: defaultPresentation[role].intensity,
        position: defaultPresentation[role].position,
      }),
    ]),
  ),
});

/**
 * Ceiling on views per request. One render target is pooled per view at each
 * size, and the caller pays for every extra render, so this is a real resource
 * bound rather than a formality. The engine caps its own grid at 9 cells; the
 * headroom is for a caller that wants a few diagnostic angles alongside.
 */
let ctx = null;

/**
 * Render sizes a caller may ask for. Pools are keyed by size, hold MSAA targets,
 * and are never evicted — so a free 64..2048 range would let a caller mint ~1985
 * of them (hundreds of MB apiece at the top end) and exhaust VRAM on a warm
 * worker. Requests snap UP to the next allowed size, so a caller always gets at
 * least the detail it asked for. Add a rung only if a real consumer needs it.
 */
export const ALLOWED_RENDER_SIZES = Object.freeze([128, 256, 384, 512, 768, 1024, 2048]);

/** Snap to the smallest allowed size that is >= requested (largest if beyond). */
export function snapRenderSize(requested) {
  const n = Number.isFinite(requested) ? requested : 384;
  return ALLOWED_RENDER_SIZES.find((s) => s >= n) ?? ALLOWED_RENDER_SIZES.at(-1);
}

const _rtPools = new Map();
function rtPool(size, count) {
  const pool = _rtPools.get(size) ?? [];
  while (pool.length < count)
    pool.push(new THREE.RenderTarget(size, size, { depthBuffer: true, samples: 4 }));
  _rtPools.set(size, pool);
  return pool.slice(0, count);
}

export async function initRenderer(opts = {}) {
  if (ctx) return ctx;
  const gpuState = await acquireGpu(opts);
  const fakeCanvas = {
    width: 4,
    height: 4,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    getContext() {
      throw new Error('default canvas context requested — RT-only expectation violated');
    },
  };
  const renderer = new THREE.WebGPURenderer({
    canvas: fakeCanvas,
    device: gpuState.device,
    antialias: false,
    samples: 4,
    outputBufferType: THREE.HalfFloatType,
  });
  await renderer.init();
  renderer.library.addToneMapping(reviewNeutralToneMapping, THREE.CustomToneMapping);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = PRESENTATION_EXPOSURE;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environments = new Map(
    PRESENTATION_PRESET_IDS.map((id) => {
      const preset = getPresentationPreset(id);
      return [id, pmrem.fromScene(new RoomEnvironment(), preset.environment.sigma).texture];
    }),
  );
  const environment = environments.get(PRESENTATION_PROFILE_ID);

  const loader = new GLTFLoader();
  loader.manager.setURLModifier(selfContainedResourceUrl);
  ctx = { renderer, environment, environments, loader, gpuState, device: gpuState.device };
  return ctx;
}

function toDataTextures(root) {
  root.traverse((o) => {
    for (const mat of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      for (const slot of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'emissiveMap',
      ]) {
        const tex = mat[slot];
        if (tex?.image?.data && !tex.isDataTexture) {
          const dt = new THREE.DataTexture(
            tex.image.data,
            tex.image.width,
            tex.image.height,
            THREE.RGBAFormat,
          );
          dt.colorSpace = tex.colorSpace;
          dt.flipY = tex.flipY;
          dt.wrapS = tex.wrapS;
          dt.wrapT = tex.wrapT;
          dt.magFilter = tex.magFilter;
          dt.minFilter = THREE.LinearMipmapLinearFilter;
          dt.generateMipmaps = true;
          dt.needsUpdate = true;
          mat[slot] = dt;
          mat.needsUpdate = true;
        }
      }
    }
  });
}

/**
 * Release the GPU resources this request's parse allocated. `ctx.environment` is
 * seeded into the visited set because it is shared across every request and
 * disposing it would break every later render; pooled render targets are never
 * reached from here for the same reason. three removes its own dispose listener
 * on the first call, so re-disposing a shared texture is a no-op.
 */
function disposeGltf(gltf) {
  const seen = new Set(ctx?.environments?.values() ?? [ctx?.environment]);
  const dispose = (r) => {
    if (!r || seen.has(r)) return;
    seen.add(r);
    r.dispose();
  };
  for (const root of gltf.scenes?.length ? gltf.scenes : [gltf.scene]) {
    root?.traverse((o) => {
      dispose(o.geometry);
      for (const mat of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        if (seen.has(mat)) continue;
        for (const v of Object.values(mat)) if (v?.isTexture) dispose(v);
        dispose(mat);
      }
    });
  }
}

/**
 * Preset filter name -> three constant. The schema owns the names because it validates
 * them; this owns the constants because it is the module that imports three.
 *
 * The two have to cover each other, so that is checked here rather than remembered: a
 * name the validator accepts and this map lacks would set `shadowMap.type` to undefined
 * at render time, which is not a crash -- just a quietly different image. Note the
 * comparison is against undefined, since BasicShadowMap is 0.
 */
const SHADOW_MAP_TYPES = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  vsm: THREE.VSMShadowMap,
};
for (const name of SHADOW_FILTERS) {
  if (SHADOW_MAP_TYPES[name] === undefined) {
    throw new Error(`presentation preset shadow filter '${name}' has no three constant`);
  }
}

function applyPresentationPreset(renderer, scene, root, preset, environment, backdrop) {
  renderer.toneMappingExposure = preset.exposure;
  renderer.toneMapping =
    preset.toneMapping === 'review-neutral' ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = preset.shadows.enabled;
  if (preset.shadows.enabled) renderer.shadowMap.type = SHADOW_MAP_TYPES[preset.shadows.type];
  // The backdrop is cleared into the HDR framebuffer and tone-mapped with the
  // asset, so it is set as the linear colour that comes out of that pass as
  // exactly the table's bytes -- the value the CPU rasterizer paints. Reflections
  // come from `environment`, never from the backdrop.
  scene.background = new THREE.Color().setRGB(
    ...backdropClearColor(BACKDROP_HEX[backdrop], preset.exposure, preset.toneMapping),
    THREE.LinearSRGBColorSpace,
  );
  scene.environment = environment;
  scene.environmentIntensity = preset.environment.intensity ?? 1;

  const ambient = preset.ambient;
  scene.add(new THREE.HemisphereLight(ambient.sky, ambient.ground, ambient.intensity));
  for (const role of ['sun', 'key', 'fill', 'rim']) {
    const lightSpec = preset[role];
    if (!lightSpec.enabled) continue;
    const light = new THREE.DirectionalLight(lightSpec.color, lightSpec.intensity);
    light.position.set(...lightSpec.position);
    light.castShadow = preset.shadows.enabled && lightSpec.castsShadow;
    if (light.castShadow) {
      light.shadow.mapSize.set(...preset.shadows.mapSize);
      light.shadow.bias = preset.shadows.bias;
      light.shadow.normalBias = preset.shadows.normalBias;
      light.shadow.radius = preset.shadows.radius;
    }
    scene.add(light);
  }
  if (preset.shadows.enabled) {
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }
}

/**
 * Camera for one view. The fit itself lives in `framing.mjs`, which is pure
 * arithmetic and therefore testable without a GPU; see the note there for why
 * the old `max(sizes) * 0.72` had to go.
 */
function orthoCam(center, min, max, dir) {
  const half = orthoHalfExtent(min, max, dir);
  const { distance, far } = orthoDepth(min, max, half);
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, far);
  cam.position.copy(
    center.clone().add(new THREE.Vector3(...dir).normalize().multiplyScalar(distance)),
  );
  cam.lookAt(center);
  cam.updateMatrixWorld();
  return cam;
}

function exactPerspectiveCam(spec) {
  const cam =
    spec.projection === 'orthographic'
      ? new THREE.OrthographicCamera(
          -spec.halfHeight * spec.aspect,
          spec.halfHeight * spec.aspect,
          spec.halfHeight,
          -spec.halfHeight,
          spec.near,
          spec.far,
        )
      : new THREE.PerspectiveCamera(spec.fovDeg, spec.aspect, spec.near, spec.far);
  cam.position.set(...spec.position);
  cam.up.set(...spec.up);
  cam.lookAt(new THREE.Vector3(...spec.target));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

async function readPng(renderer, rt, w, h) {
  const pixels = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
  const png = new PNG({ width: w, height: h });
  packRgbaReadback(pixels, w, h).copy(png.data);
  // Fast encode: deflate 1 + no row filtering is ~10x quicker than the adaptive
  // default and consumers read pixels, not bytes (image tokens scale with
  // dimensions, not file size).
  return PNG.sync.write(png, { deflateLevel: 1, filterType: 0 });
}

/**
 * Render a GLB into PNG views.
 * @param {Buffer} glbBytes
 * @param {{size?: number, viewDirs?: number[][], beautySize?: number, backdrop?: string,
 *   cameras?: object[], width?: number, height?: number, lightingPresetId?: string}} opts
 * @returns {Promise<{views: Buffer[], beauty: Buffer|null, timings: object,
 *   cameras?: object[], width?: number, height?: number, lightingPresetId?: string}>}
 */
export async function renderGlb(glbBytes, opts = {}) {
  validateSelfContainedGlb(glbBytes);
  const { renderer, environments, loader } = await initRenderer();
  const renderMode = validateRenderMode({
    cameras: opts.cameras,
    width: opts.width,
    height: opts.height,
    lighting_preset_id: opts.lightingPresetId,
    views: opts.viewDirs,
    size: opts.size,
    beauty_size: opts.beautySize,
    backdrop: opts.backdrop,
  });
  // Snapped, not clamped: pooled render targets are keyed by size and never
  // evicted, so an unbounded key space is a caller-controlled VRAM leak. The
  // beauty target below is allocated per request and disposed, so it keeps a
  // plain clamp — it has no pool to poison.
  const size = renderMode.mode === 'legacy' ? snapRenderSize(renderMode.size ?? 384) : null;
  const beautySize =
    renderMode.mode === 'legacy' && renderMode.beautySize
      ? Math.min(Math.max(renderMode.beautySize, 128), 4096)
      : null;
  const viewDirs = renderMode.mode === 'legacy' ? renderMode.viewDirs : null;
  const presentationPresetId =
    renderMode.mode === 'camera' ? renderMode.lightingPresetId : PRESENTATION_PROFILE_ID;
  const presentation = getPresentationPreset(presentationPresetId);

  const t0 = performance.now();
  const ab = glbBytes.buffer.slice(glbBytes.byteOffset, glbBytes.byteOffset + glbBytes.byteLength);
  const gltf = await new Promise((res, rej) => loader.parse(ab, '', res, rej));
  let scene = null;
  const requestTargets = [];
  try {
    const hiddenNodes = applyNodeVisibility(gltf);
    toDataTextures(gltf.scene);
    const tLoad = performance.now();

    scene = new THREE.Scene();
    applyPresentationPreset(
      renderer,
      scene,
      gltf.scene,
      presentation,
      environments.get(presentationPresetId),
      renderMode.backdrop,
    );
    scene.add(gltf.scene);

    if (renderMode.mode === 'camera') {
      // Exact milestone targets are deliberately request-owned and rectangular;
      // unlike the bounded square legacy pool, no camera dimensions survive the
      // request. Submit every camera first, then read back in request order.
      for (const camera of renderMode.cameras) {
        const target = new THREE.RenderTarget(renderMode.width, renderMode.height, {
          depthBuffer: true,
          samples: 4,
        });
        requestTargets.push(target);
        renderDisplayTarget(renderer, scene, exactPerspectiveCam(camera), target);
      }
      const views = [];
      for (const target of requestTargets) {
        views.push(await readPng(renderer, target, renderMode.width, renderMode.height));
      }
      const tEnd = performance.now();
      return {
        views,
        beauty: null,
        cameras: renderMode.cameras,
        width: renderMode.width,
        height: renderMode.height,
        lightingPresetId: renderMode.lightingPresetId,
        timings: {
          loadMs: +(tLoad - t0).toFixed(1),
          viewsMs: +(tEnd - tLoad).toFixed(1),
          beautyMs: 0,
          totalMs: +(tEnd - t0).toFixed(1),
        },
      };
    }

    // Frame what draws: a subtree KHR_node_visibility hides is not in the sheet.
    const box = hiddenNodes
      ? expandByDrawnObject(new THREE.Box3(), new THREE.Box3(), gltf.scene)
      : new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const sizes = box.getSize(new THREE.Vector3());
    const boxMin = [box.min.x, box.min.y, box.min.z];
    const boxMax = [box.max.x, box.max.y, box.max.z];

    // One RT per view, pooled across requests (alloc is pure overhead). Submit
    // every render first, then read back — a mid-loop readback forces a full GPU
    // sync per view.
    const rts = rtPool(size, viewDirs.length);
    viewDirs.forEach((dir, i) => {
      renderDisplayTarget(renderer, scene, orthoCam(center, boxMin, boxMax, dir), rts[i]);
    });
    const views = [];
    for (const vrt of rts) {
      views.push(await readPng(renderer, vrt, size, size));
    }
    const tViews = performance.now();

    let beauty = null;
    if (beautySize) {
      const rtB = new THREE.RenderTarget(beautySize, beautySize, { depthBuffer: true, samples: 4 });
      requestTargets.push(rtB);
      renderDisplayTarget(
        renderer,
        scene,
        exactPerspectiveCam(beautyCameraSpec(center.toArray(), sizes.length() * 0.62 + 1e-3)),
        rtB,
      );
      beauty = await readPng(renderer, rtB, beautySize, beautySize);
    }
    const tEnd = performance.now();

    return {
      views,
      beauty,
      timings: {
        loadMs: +(tLoad - t0).toFixed(1),
        viewsMs: +(tViews - tLoad).toFixed(1),
        beautyMs: beauty ? +(tEnd - tViews).toFixed(1) : 0,
        totalMs: +(tEnd - t0).toFixed(1),
      },
    };
  } finally {
    // Every request parses its own copy and toDataTextures uploads fresh GPU
    // textures for it; a warm worker that skips this accumulates every asset it
    // has ever rendered. Readback is complete by here, so nothing in flight can
    // still reference what we release. Runs on the throwing path too.
    //
    // Swallowed deliberately: this runs after the response value is built, so
    // letting cleanup throw would turn a completed render into a 500. A leak is
    // the better failure than losing work already paid for on the GPU.
    try {
      renderer.setRenderTarget(null);
      for (const target of requestTargets) target.dispose();
      scene?.clear();
      disposeGltf(gltf);
    } catch (e) {
      console.warn(JSON.stringify({ evt: 'dispose-failed', error: String(e?.message ?? e) }));
    }
  }
}
