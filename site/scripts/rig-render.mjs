import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Renders posters and captures under the Kiln review lighting rig. The rig (`review-neutral-v1`) lives in the
 * current engine tree when the rig is present, or an explicitly selected KILN_RIG_ENGINE_DIR, and talks to a
 * render service started from that same worktree. Nothing here starts a service, installs anything or reaches
 * a network beyond the loopback render service. It needs Bun (the engine is TypeScript): `bun scripts/...`.
 */

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RIG_ID = 'review-neutral-v1';
export const RIG_BACKDROP = 'neutral';
export const DEFAULT_ENGINE_DIR = resolve(SITE, '..');
export function resolveRigEngine({ site = SITE, env = process.env, exists = existsSync } = {}) {
  const current = resolve(site, '..');
  if (exists(join(current, 'render-service/src/presentation-presets.mjs'))) return current;
  if (env.KILN_RIG_ENGINE_DIR) return resolve(env.KILN_RIG_ENGINE_DIR);
  throw new Error('This engine tree does not contain the review rig. Set KILN_RIG_ENGINE_DIR to a compatible engine tree.');
}
const hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** The engine worktree's commit, and whether its tracked files differ from it. */
export function engineProvenance(engineDir) {
  const git = (...args) => execFileSync('git', ['-C', engineDir, ...args], { encoding: 'utf8' }).trim();
  return { commit: git('rev-parse', 'HEAD'), subject: git('log', '-1', '--format=%s'), dirty: git('status', '--porcelain', '--untracked-files=no') !== '' };
}

export async function loadRigEngine(engineDir = resolveRigEngine()) {
  if (!existsSync(join(engineDir, 'src/render-service-client.ts'))) throw new Error('No compatible Kiln engine tree. Set KILN_RIG_ENGINE_DIR to a tree containing the review rig.');
  const load = (file) => import(pathToFileURL(join(engineDir, file)).href);
  const [client, mode, camera] = await Promise.all([load('src/render-service-client.ts'), load('src/cli-render-mode.ts'), load('src/views/camera.ts')]);
  return { engineDir, client, mode, camera, provenance: engineProvenance(engineDir) };
}

/**
 * Connect to a render service, refusing one that was not started from this engine's render-service source.
 * The returned `capture()` renders under the rig and returns the PNGs with a receipt; it checks that the
 * renderer attested full-material fidelity for exactly the GLB sent, echoed every camera unchanged, and did
 * not change identity while it worked.
 */
export async function connectRig({ url = process.env.KILN_RENDER_SERVICE_URL ?? 'http://127.0.0.1:8000', token = process.env.RENDER_SERVICE_TOKEN, engineDir } = {}) {
  const engine = await loadRigEngine(engineDir);
  const sourceFingerprint = engine.client.packagedRendererSourceFingerprint();
  const identity = await engine.mode.probeCaptureIdentity(url, token, sourceFingerprint);
  if (!identity) throw new Error(`The render service at ${url} did not provide an exact build identity for this engine (start it from ${engine.engineDir}).`);
  const health = await (await fetch(new URL('/health', url))).json();
  if (!health.capabilities?.includes(`render.profile.${RIG_ID}`)) throw new Error(`The render service at ${url} does not offer the ${RIG_ID} profile.`);
  if (health.instance?.sourceFingerprint !== sourceFingerprint) throw new Error('The render service source differs from the engine worktree.');
  const port = engine.client.makeRemoteRenderPort(url, token, sourceFingerprint);
  const service = {
    url,
    protocol: health.protocol,
    rendererId: health.rendererId,
    backend: health.backend,
    adapter: health.adapter,
    sourceFingerprint,
    buildFingerprint: health.compatibility?.fingerprint,
    dependencies: health.compatibility?.dependencies,
    captureIdentity: JSON.parse(identity),
  };

  async function capture({ glb, cameras, width, height }) {
    const rendered = await port({ glb, cameras, width, height, lightingPresetId: RIG_ID, backdrop: RIG_BACKDROP });
    const inputSha256 = `sha256:${hex(glb)}`;
    if (!rendered.ok || rendered.viewsPng?.length !== cameras.length) throw new Error(`The renderer returned ${rendered.viewsPng?.length ?? 0} views for ${cameras.length} cameras`);
    if (!rendered.derivativeFidelity?.materialFaithful || rendered.derivativeFidelity.inputGlbSha256 !== inputSha256) throw new Error(`The renderer did not attest full-material fidelity for this GLB: ${JSON.stringify({ rendererId: rendered.rendererId, fidelity: rendered.derivativeFidelity })}`);
    if (rendered.width !== width || rendered.height !== height) throw new Error(`The renderer returned ${rendered.width}x${rendered.height}, expected ${width}x${height}`);
    cameras.forEach((camera, index) => {
      if (!isDeepStrictEqual(rendered.cameras?.[index], camera)) throw new Error(`The renderer did not echo camera ${index} unchanged`);
    });
    if ((await engine.mode.probeCaptureIdentity(url, token, sourceFingerprint)) !== identity) throw new Error('The renderer changed identity during the capture');
    return {
      pngs: rendered.viewsPng.map((png) => Buffer.from(png)),
      receipt: {
        lightingPresetId: RIG_ID,
        backdrop: RIG_BACKDROP,
        rendererId: rendered.rendererId,
        materialFaithful: true,
        inputGlbSha256: inputSha256,
        width,
        height,
      },
    };
  }
  return { engine, service, capture };
}

/**
 * The engine's own bounds fit for an orthographic view along `direction` (`cameraFromBounds`), widened to a
 * rectangular target: the engine fixes aspect 1, so the vertical half height is kept and the horizontal
 * coverage grows with the aspect.
 */
export function fitCamera(engine, bounds, direction, { aspect = 1, padding = 1 } = {}) {
  const base = engine.camera.cameraFromBounds({ min: bounds.min, max: bounds.max }, direction, padding);
  if (aspect === 1) return engine.camera.validateResolvedAssetCamera(base);
  // Recompute the two projected extents so a wide target is filled instead of padded.
  const view = normalise(direction);
  const right = normalise(cross([0, 1, 0], view));
  const up = cross(view, right);
  const centre = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2);
  let extentX = 1e-6;
  let extentY = 1e-6;
  for (let corner = 0; corner < 8; corner++) {
    const point = [0, 1, 2].map((axis) => ((corner >> axis) & 1 ? bounds.max[axis] : bounds.min[axis]) - centre[axis]);
    extentX = Math.max(extentX, Math.abs(dot(point, right)));
    extentY = Math.max(extentY, Math.abs(dot(point, up)));
  }
  const halfHeight = (Math.max(extentY, extentX / aspect) * padding) / 0.9;
  return engine.camera.validateResolvedAssetCamera({ ...base, aspect, halfHeight });
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalise = (v) => {
  const length = Math.hypot(...v);
  return v.map((value) => value / length);
};

/** Orbit angles in the engine's convention (`orbitDir`): azimuth about +Y from +X toward +Z, elevation above the horizon. */
export const orbitDirection = (azimuthDeg, elevationDeg) => {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
};

export const sha256Of = hex;
