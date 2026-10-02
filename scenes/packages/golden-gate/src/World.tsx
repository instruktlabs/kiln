import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera, WebGPURenderer } from 'three/webgpu';
import { readDevParams, SystemOrder, useLoadedPack, usePackReader, usePresets, useQuality, useReducedMotion, useRegisterTestHooks, useSceneBuilt, useSceneClock, useSystem } from '@kiln-scenes/scene-kit';
import type { Vec3 } from '@kiln-scenes/scene-kit';
import { buildGoldenGateWorld } from './world/build-world';
import type { GoldenGateWorld } from './world/build-world';
import { useGoldenGateSession } from './state';
import { PRESETS } from './presets';
import type { GoldenGatePreset, PresetName } from './presets';
import type { GoldenGateKnobs, TrafficDensity } from './tiers';
import { LAYERS, POSTCARD } from './constants';
import { readGoldenGateParams, WATER_DEBUG_VIEWS } from './params';
import type { FlightName } from './params';
import { WATER_DEBUG } from './world/water-material';
import { sightlineClearance, surfaceHeight } from './world/heightfield';
import { GoldenGateCameras } from './camera/GoldenGateCameras';
import { Driving } from './play/Driving';
import { LAYOUT } from './data';
import type { DrawOptions } from './world/draw-options';

const TEST = !!(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV);
/** Test and dev builds: draw optimisation switches for A/B counts and parity captures (./world/draw-options; each defaults on where its pass exists, shadowCache off). */
function drawOverrides(): Partial<DrawOptions> {
  if (!TEST) return {};
  const B = { kind: 'boolean' } as const, p = readDevParams({ bridgeMerge: B, shadowOnce: B, standIns: B, reflectionStandIns: B, shadowCache: B });
  return { merge: p.bridgeMerge, once: p.shadowOnce, depth: p.standIns, reflection: p.reflectionStandIns, cache: p.shadowCache };
}

export function GoldenGateWorldContent() {
  const pack = useLoadedPack(), reader = usePackReader(), quality = useQuality<GoldenGateKnobs>(), markBuilt = useSceneBuilt(), session = useGoldenGateSession(), reduced = useReducedMotion(), clock = useSceneClock();
  const gl = useThree(state => state.gl) as unknown as WebGPURenderer, scene = useThree(state => state.scene), camera = useThree(state => state.camera) as PerspectiveCamera;
  const size = useThree(state => state.size);
  const params = useMemo(() => readGoldenGateParams(), []), draw = useMemo(drawOverrides, []);
  // The kit applies the development-only `preset` URL parameter (WATER-SPEC determinism) on mount.
  const presets = usePresets<GoldenGatePreset>(PRESETS, 'day');
  const [world, setWorld] = useState<GoldenGateWorld | null>(null), [failure, setFailure] = useState<unknown>(null);
  const presetDirty = useRef(true), ready = useRef<GoldenGateWorld | null>(null);
  if (failure) throw failure;

  useEffect(() => session.motion.setReduced(reduced), [session, reduced]);
  useSystem('golden-gate-motion', SystemOrder.input - 10, () => session.motion.advance(clock.delta, clock.time));

  useEffect(() => {
    session.presets = presets; session.hud.set({ preset: presets.target as PresetName });
    const off = presets.onChange(name => { session.hud.set({ preset: name as PresetName }); presetDirty.current = true; });
    return () => { off(); if (session.presets === presets) session.presets = null; };
  }, [presets, session]);
  useEffect(() => { camera.layers.enable(LAYERS.water); camera.layers.enable(LAYERS.dynamic); }, [camera]);

  useEffect(() => {
    const abort = new AbortController(); let built: GoldenGateWorld | null = null;
    buildGoldenGateWorld({ pack, reader, renderer: gl, scene, camera, knobs: quality.knobs, signal: abort.signal, draw,
      traffic: { enabled: params.traffic !== false, density: typeof params.density === 'string' ? params.density as TrafficDensity : undefined },
      onProgress: (loaded, total, text) => session.progress?.({ phase: 'build', loaded, total, text }) })
      .then(value => {
        if (abort.signal.aborted) { value.dispose(); return; }
        built = value; session.world = value;
        if (typeof params.tide === 'number') value.water.uniforms.tide.value = Math.max(-1, Math.min(1, params.tide));
        if (typeof params.waterDebug === 'string') value.water.uniforms.debug.value = WATER_DEBUG[params.waterDebug as keyof typeof WATER_DEBUG];
        value.applyPreset(presets.current, true); presetDirty.current = false;
        setWorld(value);
      })
      .catch(error => { if (!abort.signal.aborted) setFailure(error); });
    return () => {
      abort.abort(); built?.dispose();
      if (session.world === built) session.world = null;
      setWorld(null); ready.current = null; markBuilt(false);
    };
  }, [pack, reader, gl, scene, camera, quality.knobs, session, markBuilt]); // eslint-disable-line react-hooks/exhaustive-deps

  useSystem('golden-gate-presets', SystemOrder.path + 60, () => {
    if (!world) return;
    if (presets.blending || presetDirty.current) { world.applyPreset(presets.current, !presets.blending); presetDirty.current = false; }
  });
  useSystem('golden-gate-world', SystemOrder.camera + 50, () => {
    if (!world) return;
    world.update(camera, session.motion.time, presets.current.banks, session.motion.delta);
    if (ready.current !== world && session.orbit.current && session.camera) { ready.current = world; markBuilt(true); }
  });

  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!world || !TEST) return {};
    const v = new Vector3();
    return {
      ggStats: () => ({ ...world.stats, tier: quality.tier, device: quality.device, knobs: { feature: quality.knobs.gg.feature, shadows: quality.knobs.shadows.enabled, pixelRatio: quality.live.pixelRatio },
        environmentRenders: world.atmosphere.stats.environmentRenders, usingFarBridge: world.bridge.usingFar, preset: presets.target, blending: presets.blending,
        camera: { position: camera.position.toArray(), fov: camera.fov, near: camera.near, far: camera.far, mode: session.camera?.mode ?? null,
          orbitDistance: session.orbit.current ? camera.position.distanceTo(session.orbit.current.controls.target) : null },
        toneMapping: gl.toneMapping, exposure: gl.toneMappingExposure, samples: (gl as unknown as { samples?: number }).samples ?? null }),
      setPreset: (name: string) => { presets.set(name, { immediate: true }); world.applyPreset(presets.current, true); presetDirty.current = false; return presets.target; },
      /** Calibration only: applies the current preset with some values replaced, until the next preset change. */
      tunePreset: (values: Partial<GoldenGatePreset>) => { world.applyPreset({ ...presets.current, ...values }, true); presetDirty.current = false; return { ...presets.current, ...values }; },
      setView: (name: string) => { session.camera?.setView(name); return session.camera?.mode; },
      setPose: (pose: { position: Vec3; target: Vec3; fov?: number }) => { session.camera?.setPose({ position: pose.position, target: pose.target, fov: pose.fov ?? POSTCARD.fov }); return session.camera?.mode; },
      playFlight: (name: FlightName) => session.camera?.playFlight(name) ?? false,
      stopFlight: () => session.camera?.stopFlight(),
      flights: () => session.camera ? Object.values(session.camera.flights.info) : [],
      setWaterDebug: (name: string) => { if (!(WATER_DEBUG_VIEWS as readonly string[]).includes(name)) throw new Error(`Unknown water view ${name}`); world.water.uniforms.debug.value = WATER_DEBUG[name as keyof typeof WATER_DEBUG]; return name; },
      setTide: (value: number) => { world.water.uniforms.tide.value = Math.max(-1, Math.min(1, value)); return world.water.uniforms.tide.value; },
      heightAt: (x: number, z: number) => surfaceHeight(world.field, x, z),
      /** Rendered terrain height (ray cast against the loaded tiles), for checking against the maps. */
      terrainHeight: (x: number, z: number) => { const r = new Raycaster(new Vector3(x, 2000, z), new Vector3(0, -1, 0)); const hit = r.intersectObject(world.terrain.root, true)[0]; return hit ? { y: hit.point.y, tile: hit.object.name, uv: hit.uv?.toArray() ?? null } : null; },
      clearance: (from: Vec3, to: Vec3) => sightlineClearance(world.field, from, to, .55),
      /** Diagnostics: hide or show one part of the world. */
      setPartVisible: (part: 'terrain' | 'bridge' | 'water' | 'banks' | 'sky' | 'traffic', visible: boolean) => {
        const target = { terrain: world.terrain.root, bridge: world.bridge.root, water: world.water.mesh, banks: world.banks?.sprite, sky: world.atmosphere.sky, traffic: world.traffic.root }[part];
        if (!target) return false; target.visible = visible; return true;
      },
      /** Count-probe systems (scene-kit testing/probe.ts): the setPartVisible parts, with the bridge split into its web and
       *  far models, the approaches and the vegetation carried under the near approaches. */
      probeSystems: () => ({ terrain: world.terrain.root, vegetation: world.terrain.vegetation.root, bridge: world.bridge.views.web, 'bridge-far': world.bridge.views.far,
        approaches: [world.bridge.approachMeshes.near.group, world.bridge.approachMeshes.far.group], water: world.water.mesh, banks: world.banks?.sprite ?? null,
        sky: world.atmosphere.sky, traffic: world.traffic.root }),
      /** The point on the water plane (y = 0) under a screen pixel, or null above the horizon. */
      groundPoint: (sx: number, sy: number) => { camera.updateMatrixWorld(); v.set(sx / size.width * 2 - 1, 1 - sy / size.height * 2, .5).unproject(camera).sub(camera.position); if (v.y >= 0) return null; const t = -camera.position.y / v.y; return [camera.position.x + v.x * t, camera.position.z + v.z * t]; },
      project: (point: Vec3) => { camera.updateMatrixWorld(); v.fromArray(point).project(camera); return [(v.x + 1) / 2 * size.width, (1 - v.y) / 2 * size.height, v.z]; },
      trafficStats: () => ({ ...world.traffic.stats(), models: world.stats.vehicles }),
      motionState: () => ({ paused: session.motion.paused, time: session.motion.time, delta: session.motion.delta }),
      trafficSample: (limit?: number) => world.traffic.sample(limit),
      advanceTraffic: (seconds: number) => { world.traffic.advance(seconds); return world.traffic.sim.time; },
      setTrafficDensity: (density: TrafficDensity) => { world.traffic.setDensity(density); return world.traffic.density; },
      waterStats: () => ({ ...world.water.stats, uniforms: { wind: world.water.uniforms.wind.value, tide: world.water.uniforms.tide.value, debug: world.water.uniforms.debug.value, displaceRadius: world.water.uniforms.displaceRadius.value } }),
    };
  }, [world, quality, presets, session, camera, gl, size]);
  useRegisterTestHooks(hooks);

  return world ? <>
    <GoldenGateCameras world={world} initialView={typeof params.cam === 'string' ? params.cam : LAYOUT.cameras.default}
      initialFlight={typeof params.flight === 'string' ? params.flight as FlightName : undefined} initialFlightAt={typeof params.flightAt === 'number' ? params.flightAt : 0}/>
    <Driving world={world}/>
  </> : null;
}
