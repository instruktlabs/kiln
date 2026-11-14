import { useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { BackSide, BufferAttribute, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, PointLight, SphereGeometry, SRGBColorSpace, Vector3 } from 'three/webgpu';
import type { MeshStandardMaterial } from 'three/webgpu';
import { asWebGPU, SystemOrder, useBuilt, useQuality, useReducedMotion, useSystem } from '@kiln-scenes/scene-kit';
import { cachedSunShadow, shadowOncePerFrame } from '@kiln-scenes/scene-kit/shadows';
import type { CachedSunShadow } from '@kiln-scenes/scene-kit/shadows';
import { nearestLanterns } from './glow';
import type { Lantern } from './glow';
import { blendHours, DAY, DUSK, LANTERN, SHADOW } from './light';
import type { Hour } from './light';
import type { TownSession } from './session';
import { skyAt, skyPaint } from './sky';
import type { Rgb } from './sky';

export interface SunRig {
  light: DirectionalLight;
  cache: CachedSunShadow | null;
  once: { update(): void; restore(): void } | null;
}

export interface Glow { material: MeshStandardMaterial; base: number }

/** Seconds for the light to move from one hour to the other. */
const TURN = 1.8;

/** Inside the far plane, and it follows the eye, so the sky is never clipped. */
const SKY_RADIUS = 850;

/** A dome painted per vertex: the horizon colour low down, the zenith overhead, and a glow round the sun. */
function createSky(): { mesh: Mesh; paint(hour: Hour): void; dispose(): void } {
  const geometry = new SphereGeometry(1, 48, 24);
  const directions = geometry.getAttribute('position');
  const colors = new Float32Array(directions.count * 3);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const material = new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false, depthTest: false });
  material.name = 'sky';
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Sky';
  mesh.scale.setScalar(SKY_RADIUS);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  const rgb: Rgb = [0, 0, 0];
  return {
    mesh,
    paint(hour) {
      const paint = skyPaint(hour);
      for (let i = 0; i < directions.count; i++) {
        skyAt(paint, directions.getX(i), directions.getY(i), directions.getZ(i), rgb);
        colors.set(rgb, i * 3);
      }
      geometry.getAttribute('color').needsUpdate = true;
    },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}

/** One sun, a sky fill, a painted sky and one cached shadow map, blended between day and dusk. */
export function TownLighting({ session }: { session: TownSession }) {
  const state = useThree();
  const quality = useQuality(), reduced = useReducedMotion();
  const hour = useRef<{ from: Hour; to: Hour; t: number; revision: number; applied: Hour | null; reflected: number }>({ from: DAY, to: DAY, t: 1, revision: -1, applied: null, reflected: 1 });
  const lights = useBuilt(() => {
    const renderer = asWebGPU(state.gl);
    const previousExposure = renderer.toneMappingExposure;
    const root = new Group();
    root.name = 'Seed town lighting';
    const hemisphere = new HemisphereLight(0xffffff, 0xffffff, 1);
    hemisphere.name = 'Sky fill';
    const sun = new DirectionalLight(0xffffff, 1);
    sun.name = 'Sun';
    const shadows = quality.knobs.shadows.enabled;
    sun.castShadow = shadows;
    const size = Math.min(SHADOW.mapSize, quality.knobs.shadows.mapSize);
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = SHADOW.bias;
    sun.shadow.normalBias = SHADOW.normalBias;
    sun.shadow.radius = SHADOW.radius;
    let cache: CachedSunShadow | null = null;
    let once: SunRig['once'] = null;
    if (shadows) {
      // The kit's once-per-frame shadow needs a shadow camera layer above 0.
      sun.shadow.camera.layers.enable(1);
      once = shadowOncePerFrame(sun);
      cache = cachedSunShadow({ light: sun, settleFrames: 30 });
    }
    state.scene.environment = null;
    const sky = createSky();
    // A fixed handful of lights that move to the lanterns nearest the eye; the rest of the town is lit by its pools.
    const lanterns = Array.from({ length: LANTERN.count[quality.tier] ?? 0 }, (_, i) => {
      const light = new PointLight(0xffffff, 0, LANTERN.distance, 2);
      light.name = `Lantern ${i}`;
      light.color.setRGB(LANTERN.color[0], LANTERN.color[1], LANTERN.color[2], SRGBColorSpace);
      return light;
    });
    root.add(hemisphere, sun, sun.target, sky.mesh, ...lanterns);
    const rig: SunRig = { light: sun, cache, once };
    session.sun = rig;
    // A fresh rig starts on the hour the session is at, without a turn.
    const now = session.getState().dusk ? DUSK : DAY;
    hour.current = { from: now, to: now, t: 1, revision: -1, applied: null, reflected: 1 };
    return { root, rig, hemisphere, renderer, sky, lanterns, slots: new Int32Array(lanterns.length).fill(-1), strength: new Float32Array(lanterns.length), dispose() {
      if (session.sun === rig) session.sun = null;
      root.removeFromParent();
      once?.restore();
      cache?.dispose();
      sun.shadow.dispose();
      sky.dispose();
      for (const light of lanterns) light.dispose();
      renderer.toneMappingExposure = previousExposure;
      root.clear();
    } };
  }, value => value.dispose(), [state.gl, state.scene, session, quality.tier, quality.knobs.shadows.enabled, quality.knobs.shadows.mapSize]);

  useSystem('seed-town-hour', SystemOrder.sim, dt => {
    if (!lights) return;
    const blend = hour.current, target = session.getState().dusk ? DUSK : DAY;
    const changed = target !== blend.to;
    if (changed) {
      blend.from = blend.applied ?? blend.to;
      blend.to = target;
      // With reduced motion the hour changes at once, and that one step still has to be applied.
      blend.t = reduced ? 1 : 0;
      blend.reflected = 0;
    }
    const turning = blend.t < 1, resized = blend.revision !== session.revision;
    if (!turning && !resized && !changed && blend.applied) return;
    if (turning) blend.t = Math.min(1, blend.t + dt / TURN);
    const now = blendHours(blend.from, blend.to, blend.t);
    blend.applied = now;
    blend.revision = session.revision;
    const { light: sun, cache } = lights.rig;
    const frame = session.frame, reach = frame ? Math.hypot(frame.halfX, frame.halfZ) + SHADOW.margin : 80;
    sun.position.set(now.sun[0] * SHADOW.distance, now.sun[1] * SHADOW.distance, now.sun[2] * SHADOW.distance);
    sun.target.position.set(0, 0, 0);
    sun.color.setRGB(now.sunColor[0], now.sunColor[1], now.sunColor[2], SRGBColorSpace);
    sun.intensity = now.sunIntensity;
    const camera = sun.shadow.camera;
    Object.assign(camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: SHADOW.near, far: SHADOW.far });
    camera.updateProjectionMatrix();
    lights.hemisphere.color.setRGB(now.skyColor[0], now.skyColor[1], now.skyColor[2], SRGBColorSpace);
    lights.hemisphere.groundColor.setRGB(now.groundColor[0], now.groundColor[1], now.groundColor[2], SRGBColorSpace);
    lights.hemisphere.intensity = now.hemisphereIntensity;
    const background = state.scene.background;
    if (background instanceof Color) background.setRGB(now.horizon[0], now.horizon[1], now.horizon[2], SRGBColorSpace);
    const fog = state.scene.fog;
    if (fog instanceof Fog) {
      fog.color.setRGB(now.horizon[0], now.horizon[1], now.horizon[2], SRGBColorSpace);
      fog.near = now.fogNear;
      fog.far = now.fogFar;
    }
    lights.renderer.toneMappingExposure = now.exposure;
    lights.sky.paint(now);
    // The glass's picture is filtered again each time it changes, so it follows a turn in a few steps.
    if (blend.reflected < 1 && (blend.t >= 1 || blend.t - blend.reflected >= 0.25)) {
      blend.reflected = blend.t;
      session.reflection?.paint(now);
    }
    session.pools = now.pools;
    session.sunDir = now.sun;
    for (const item of session.glow) item.material.emissiveIntensity = item.base * now.glow;
    cache?.invalidate('hour');
  });

  // After the camera has moved: the sky stays round the eye and the lantern lights go to the nearest lit lanterns.
  const eye = useRef({ at: new Vector3(), seen: new Vector3(Infinity, 0, 0), list: null as Lantern[] | null });
  useSystem('seed-town-sky', SystemOrder.camera + 10, (_dt, _elapsed, frame) => {
    if (!lights) return;
    const { at, seen } = eye.current;
    frame.camera.getWorldPosition(at);
    lights.sky.mesh.position.copy(at);
    if (!lights.lanterns.length) return;
    const list = session.lanterns;
    if (list !== eye.current.list) {
      eye.current.list = list;
      lights.slots.fill(-1);
      seen.set(Infinity, 0, 0);
    }
    if (!(at.distanceToSquared(seen) < 0.0025)) {
      seen.copy(at);
      nearestLanterns(list, [at.x, at.y, at.z], lights.slots, lights.strength);
    }
    lights.lanterns.forEach((light, s) => {
      const lantern = list[lights.slots[s]!];
      light.intensity = lantern ? LANTERN.intensity * session.pools * lights.strength[s]! : 0;
      if (lantern) light.position.set(lantern.x, lantern.y, lantern.z);
    });
  });

  useSystem('seed-town-shadow', SystemOrder.shadows, () => {
    lights?.rig.once?.update();
    lights?.rig.cache?.update();
  });
  return lights ? <primitive object={lights.root} dispose={null} /> : null;
}
