import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { asWebGPU, assertInstancingSafe, SystemOrder, useBuilt, useLoadedPack, useQuality, useRegisterTestHooks, useSceneBuilt, useSceneClock, useSystem } from '@kiln-scenes/scene-kit';
import { buildFarmWorld } from './world/build-world';
import { useFarmSession } from './state';
import { FarmCameras } from './play/camera';
import { useFarmPlaySystems } from './play/systems';
import { useFarmWorkloads } from './play/workloads';
import { bindFarmFrameGraph } from './world/frame-graph';
import { startWarmPass, type WarmPass } from './world/prewarm';
import { installInstanceAttributes, type InstanceAttributeRenderer } from './world/instance-attributes';
import { farmProbeHooks } from './world/probe-systems';
import { bindFarmShadow, farmShadowOptions } from './world/shadows';
import { readFarmDevParams } from './dev-params';
import type { FarmWorld } from './world/build-world';

export function FarmWorldContent() {
  const pack = useLoadedPack(), quality = useQuality(), clock = useSceneClock(), markBuilt = useSceneBuilt(), session = useFarmSession();
  const scene = useThree(state => state.scene), gl = useThree(state => state.gl), camera = useThree(state => state.camera), readyWorld = useRef<FarmWorld | null>(null);
  // SPEC 6.4 warm pass (owner decision 2026-09-29 22:05): the first world of a mount stays hidden until its pipelines are compiled.
  const warm = useRef<{ world: FarmWorld; pass: WarmPass } | null>(null), revealed = useRef(false);
  const params = useMemo(readFarmDevParams, []), shadowOptions = useMemo(() => farmShadowOptions(params), [params]);
  // M4 item 1: instanced meshes read their matrices as vertex attributes (shared programs; uploads only when they change).
  // Test and dev builds keep three's per-mesh uniform buffers with ?instanceUniforms=1, and take ?warmConcurrency=<n>
  // (chains the warm pass compiles at once, default WARM_CONCURRENCY), for A/B checks.
  useLayoutEffect(() => params.instanceUniforms === true ? undefined : installInstanceAttributes(asWebGPU(gl) as unknown as InstanceAttributeRenderer), [gl, params]);
  const world = useBuilt(() => {
    // S4b/S4 (OD-18, OD-4): hero merge and, on tiers with shadows, stand-ins and the small-caster threshold; ?heroMerge=0,
    // ?standIns=0 and ?casterTexels=0 turn them off for A/B counts.
    const built = buildFarmWorld(pack, quality.knobs, clock, { woodlandTangents: params.woodlandTangents !== false, prepared: session.prepared, optimize: params.staticBaseline !== true,
      heroMerge: params.heroMerge !== false, shadow: { standIns: shadowOptions.standIns, minCasterTexels: shadowOptions.minCasterTexels } });
    if (!revealed.current) built.root.visible = false;
    return built;
  }, value => value.dispose(), [pack, quality.knobs, clock]);
  const frameGraph = useBuilt(() => world?.optimization ? bindFarmFrameGraph(scene, { root: world.root, registry: world.registry, optimization: world.optimization }, () => !!scene.getObjectByName('Farm lighting')) : null, binding => binding?.dispose(), [world, scene]);
  // OD-9: the lights' cached sun shadow (session.shadow, tiers with shadows) tracks this world once it shows.
  const shadow = useMemo(() => world ? bindFarmShadow(world, () => session.shadow) : null, [world, session]);
  useEffect(() => () => shadow?.dispose(), [shadow]);
  useEffect(() => { session.world = world; return () => { if (session.world === world) session.world = null; readyWorld.current = null; markBuilt(false); }; }, [world, session, markBuilt]);
  useEffect(() => () => { if (warm.current && warm.current.world === world) { warm.current.pass.dispose(); warm.current = null; } }, [world]);
  useSystem('farm-herd', SystemOrder.herd, () => {
    if (!world) return;
    if (session.ambientEnabled && quality.knobs.effects.ambientAnimation && !quality.motion.reduced && clock.delta > 0) { world.herd.start(); world.herd.update(clock.delta); }
    else world.herd.stop();
  });
  useFarmPlaySystems(world, session);
  // Build-time constant: test and dev builds register the hub-kit workloads; public builds drop them.
  if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) useFarmWorkloads(world, session);
  useSystem('farm-static-world', SystemOrder.frameGraph, () => {
    if (!world) return;
    world.grass.setDensity(quality.live.vegetationDensity);
    if (world.optimization) {
      if (frameGraph?.worldRoot !== world.root || !frameGraph.update()) return;
    } else {
      // Explicit test/developer baseline reproduces the64-cell woodland A/B.
      world.root.updateMatrixWorld(true);
    }
    if (readyWorld.current !== world) {
      // The warm pass needs the lights in the scene (pipelines depend on them); ready also needs the camera rig.
      if (warm.current?.world !== world) {
        if (!scene.getObjectByName('Farm lighting')) return;
        warm.current?.pass.dispose();
        // The drawing frame is the reveal: the cached shadow re-arms its static map and draws every caster into its live map
        // once, so both maps' pipelines exist before ready (a later door, drive or walk compiles nothing).
        warm.current = { world, pass: startWarmPass(asWebGPU(gl), scene, camera, world.root, { reveal: !revealed.current, concurrency: params.warmConcurrency, onDraw: () => shadow?.prime() }) };
      }
      if (!warm.current.pass.step() || !session.orbit.current) return;
      readyWorld.current = world; revealed.current = true; markBuilt(true);
    }
  });
  // After every motion and visibility change of the frame (the follow rig hides Rowan at SystemOrder.camera).
  useSystem('farm-shadow', SystemOrder.shadows, () => { shadow?.update(); });
  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { if (!world) return {}; return {
    counts: () => ({ ...world.stats,
      optimization: world.optimization ? { ...world.optimization.stats, frameGraph: frameGraph?.worldRoot === world.root ? frameGraph.stats : null } : null,
      frameGraph: frameGraph?.worldRoot === world.root ? frameGraph.stats : null, tangentOffenders: assertInstancingSafe(world.root),
      warmPass: warm.current?.world === world ? { phase: warm.current.pass.phase, ...warm.current.pass.stats } : null,
      shadow: session.shadow ? { ...session.shadow.stats, reasons: { ...session.shadow.stats.reasons } } : null }),
    setAmbient: (enabled: boolean) => { session.ambientEnabled = enabled; if (!enabled) world.herd.stop(); },
    initialClips: () => world.placements.initialClips,
    // Count-probe systems and asset names (scene-kit testing/probe.ts), and a static-map re-arm so a probe can count one
    // static render; both fold away in public builds.
    ...(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV ? { ...farmProbeHooks(world), shadowRearm: () => { session.shadow?.invalidate('probe'); return !!session.shadow; } } : {}),
  }; }, [world, session, frameGraph]);
  useRegisterTestHooks(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV ? hooks : {});
  return world ? <><primitive object={world.root} dispose={null}/><FarmCameras layout={world.layout} sim={world.sim}/></> : null;
}
