import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { asWebGPU, assertInstancingSafe, defineDevParams, readDevParams, SystemOrder, useBuilt, useLoadedPack, useQuality, useRegisterTestHooks, useSceneBuilt, useSceneClock, useSystem } from '@kiln-scenes/scene-kit';
import { buildFarmWorld } from './world/build-world';
import { useFarmSession } from './state';
import { FarmCameras } from './play/camera';
import { useFarmPlaySystems } from './play/systems';
import { useFarmWorkloads } from './play/workloads';
import { bindFarmFrameGraph } from './world/frame-graph';
import { startWarmPass, type WarmPass } from './world/prewarm';
import { installInstanceAttributes, type InstanceAttributeRenderer } from './world/instance-attributes';
import { farmProbeHooks } from './world/probe-systems';
import type { FarmWorld } from './world/build-world';

export function FarmWorldContent() {
  const pack = useLoadedPack(), quality = useQuality(), clock = useSceneClock(), markBuilt = useSceneBuilt(), session = useFarmSession();
  const scene = useThree(state => state.scene), gl = useThree(state => state.gl), camera = useThree(state => state.camera), readyWorld = useRef<FarmWorld | null>(null);
  // SPEC 6.4 warm pass (owner decision 2026-09-29 22:05): the first world of a mount stays hidden until its pipelines are compiled.
  const warm = useRef<{ world: FarmWorld; pass: WarmPass } | null>(null), revealed = useRef(false);
  const params = useMemo(() => readDevParams(defineDevParams({ woodlandTangents: { kind: 'boolean' }, staticBaseline: { kind: 'boolean' }, instanceUniforms: { kind: 'boolean' }, warmConcurrency: { kind: 'number' } })), []);
  // M4 item 1: instanced meshes read their matrices as vertex attributes (shared programs; uploads only when they change).
  // Test and dev builds keep three's per-mesh uniform buffers with ?instanceUniforms=1, and take ?warmConcurrency=<n>
  // (chains the warm pass compiles at once, default WARM_CONCURRENCY), for A/B checks.
  useLayoutEffect(() => params.instanceUniforms === true ? undefined : installInstanceAttributes(asWebGPU(gl) as unknown as InstanceAttributeRenderer), [gl, params]);
  const world = useBuilt(() => {
    const built = buildFarmWorld(pack, quality.knobs, clock, { woodlandTangents: params.woodlandTangents !== false, prepared: session.prepared, optimize: params.staticBaseline !== true });
    if (!revealed.current) built.root.visible = false;
    return built;
  }, value => value.dispose(), [pack, quality.knobs, clock]);
  const frameGraph = useBuilt(() => world?.optimization ? bindFarmFrameGraph(scene, { root: world.root, registry: world.registry, optimization: world.optimization }, () => !!scene.getObjectByName('Farm lighting')) : null, binding => binding?.dispose(), [world, scene]);
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
        warm.current = { world, pass: startWarmPass(asWebGPU(gl), scene, camera, world.root, { reveal: !revealed.current, concurrency: params.warmConcurrency }) };
      }
      if (!warm.current.pass.step() || !session.orbit.current) return;
      readyWorld.current = world; revealed.current = true; markBuilt(true);
    }
  });
  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { if (!world) return {}; return {
    counts: () => ({ ...world.stats,
      optimization: world.optimization ? { ...world.optimization.stats, frameGraph: frameGraph?.worldRoot === world.root ? frameGraph.stats : null } : null,
      frameGraph: frameGraph?.worldRoot === world.root ? frameGraph.stats : null, tangentOffenders: assertInstancingSafe(world.root),
      warmPass: warm.current?.world === world ? { phase: warm.current.pass.phase, ...warm.current.pass.stats } : null }),
    setAmbient: (enabled: boolean) => { session.ambientEnabled = enabled; if (!enabled) world.herd.stop(); },
    initialClips: () => world.placements.initialClips,
    // Count-probe systems and asset names (scene-kit testing/probe.ts); folds away in public builds.
    ...(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV ? farmProbeHooks(world) : {}),
  }; }, [world, session, frameGraph]);
  useRegisterTestHooks(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV ? hooks : {});
  return world ? <><primitive object={world.root} dispose={null}/><FarmCameras layout={world.layout} sim={world.sim}/></> : null;
}
