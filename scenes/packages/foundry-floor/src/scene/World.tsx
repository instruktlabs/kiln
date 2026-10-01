// SPDX-License-Identifier: MIT
// The running fab inside the canvas: the twin built from the pack's data (layout, rail graph, route and tools are pack
// data entries, D-21; only the sim config is bundled) and restored from the stored warm start (warmup.json records
// why: a fresh 30-day warm-up takes seconds, over the 1 s budget), the fab drawn from the accepted GLBs through the
// asset map (pack data `asset-map`), the frame system that advances presentation time, steps the twin and poses the
// world, the draw system after the camera (culling, LOD, instance buffers), the cameras (Cameras.tsx: the orbit and named
// views, the free walk, the tour, tool panels and follow-a-wafer) and the test hooks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { SystemOrder, useLoadedPack, useQuality, useReducedMotion, useRegisterTestHooks, useSceneBuilt, useSceneClock, useSystem } from '@kiln-scenes/scene-kit';
import { createClock, tick } from '../sim/clock';
import { fabDataFromPack, SIM_CONFIG } from '../sim/config';
import { createFabFrom } from '../sim/create';
import type { Fab } from '../sim/create';
import type { FabMode } from '../sim/fab';
import { ASSET_MAP_ID, parseAssetMap } from './assets/asset-map';
import { FoundryCameras } from './Cameras';
import { useFoundrySession } from './session';
import type { FoundrySession, ViewName } from './session';
import { VIEW_NAMES } from '../sim/data';
import { buildGlbWorld } from './world/glb-world';
import type { GlbWorld } from './world/glb-world';
import { prepareModelLevels } from './glb/model-levels';

const TEST = !!(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV);
/** The pack data entry holding the stored day-30 warm start for the default seed. */
export const WARM_START_ID = `warm-seed-${SIM_CONFIG.seeds.default}`;
const HUD_INTERVAL_MS = 250;
const RULES = SIM_CONFIG.scales;
/** The draw system runs after the camera rigs, so culling and LOD see this frame's camera. */
const DRAW_ORDER = SystemOrder.camera + 50;

function syntheticCount(fab: Fab): number {
  let n = 0;
  for (const v of fab.sim.S.vehicles) if (v.alive && v.syn) n++;
  return n;
}

function publishHud(session: FoundrySession, fab: Fab): void {
  const floor = fab.sim.S.floor, a = floor.active;
  const phases = { WAIT_STOCKER: 'waiting at its station', TO_PICKUP: 'approaching stocker', PICK: 'picking up', TO_DROP: 'carrying a FOUP', DROP: 'setting down', RETURN: 'returning to station' };
  session.hud.set({ mode: fab.sim.S.mode, scale: session.clock.scale, simMs: fab.now(), synthetic: syntheticCount(fab), kpis: fab.kpis(),
    floor: { delivered: floor.delivered, collected: floor.collected, queued: floor.queue.length,
      active: a ? `AMR ${a.station + 1}: ${phases[a.phase]}` : 'AMRs waiting for a production transfer', followLot: a && (a.carrying || a.phase === 'PICK') ? a.lot : null } });
}

export function FoundryWorld() {
  const pack = useLoadedPack(), quality = useQuality(), clock = useSceneClock(), markBuilt = useSceneBuilt(), session = useFoundrySession();
  const reduced = useReducedMotion();
  useEffect(() => { if (reduced) session.setScale(0); }, [reduced, session]);
  const scene = useThree(state => state.scene), camera = useThree(state => state.camera) as PerspectiveCamera;
  const [world, setWorld] = useState<GlbWorld | null>(null), [failure, setFailure] = useState<unknown>(null);
  const lastWall = useRef<number | null>(null), hudAt = useRef(-Infinity), built = useRef<GlbWorld | null>(null);
  const phone = quality.device.form === 'phone';
  const data = useMemo(() => fabDataFromPack(id => pack.data.get(id)), [pack]);
  const map = useMemo(() => { const bytes = pack.data.get(ASSET_MAP_ID); return bytes ? parseAssetMap(bytes) : null; }, [pack]);
  if (failure) throw failure;

  useEffect(() => {
    let glb: GlbWorld | null = null, alive = true;
    void (async () => {
    try {
      const bytes = pack.data.get(WARM_START_ID);
      if (!bytes) throw new Error(`The scene pack has no ${WARM_START_ID} data entry`);
      if (!map) throw new Error(`The scene pack has no ${ASSET_MAP_ID} data entry`);
      await Promise.all(Object.keys(map.entities).filter(id => pack.models.has(id)).map(id => prepareModelLevels(pack.models.get(id)!)));
      if (!alive) return;
      // Sim-spec 7: the page opens in megafab mode at 1x (the session's initial HUD state); the headless API defaults to pilot.
      const opening = session.hud.getSnapshot();
      const fab = createFabFrom(data, { snapshot: new TextDecoder().decode(bytes), mode: opening.mode });
      session.fab = fab;
      session.clock = createClock(fab.now(), opening.scale);
      glb = buildGlbWorld(pack.models, map, fab.sim, { phone, data });
      scene.add(glb.root);
      glb.update(fab.sim, session.clock);
      publishHud(session, fab);
      setWorld(glb);
    } catch (error) { if (alive) setFailure(error); }
    })();
    return () => {
      alive = false;
      glb?.dispose();
      session.fab = null;
      setWorld(null); built.current = null; session.viewReady = false; lastWall.current = null; markBuilt(false);
    };
  }, [pack, data, map, scene, session, markBuilt, phone]);

  useSystem('foundry-floor-sim', SystemOrder.sim, () => {
    const fab = session.fab;
    if (!world || !fab) return;
    const now = performance.now();
    // The kit's time scale 0 (a frozen capture) holds the fab; otherwise the presentation clock caps the wall delta.
    const wallDelta = lastWall.current === null || clock.timeScale === 0 ? 0 : now - lastWall.current;
    lastWall.current = now;
    const req = session.requests;
    if (req.scale !== null) { session.clock.scale = req.scale; req.scale = null; }
    if (req.mode !== null) { fab.setMode(req.mode); req.mode = null; hudAt.current = -Infinity; }
    fab.step(Math.max(fab.now(), tick(session.clock, wallDelta, RULES)));
    world.update(fab.sim, session.clock);
    if (now - hudAt.current >= HUD_INTERVAL_MS) { hudAt.current = now; publishHud(session, fab); }
  });

  useSystem('foundry-floor-draw', DRAW_ORDER, (_dt, _elapsed, state) => {
    if (!world) return;
    world.draw(state.camera);
    // Built once the world is drawn from the first named view (applied by the cameras).
    if (built.current !== world && session.viewReady) { built.current = world; markBuilt(true); }
  });

  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!world || !TEST) return {};
    const target = new Vector3();
    return {
      ffState: () => {
        const fab = session.fab;
        if (!fab) return null;
        const rig = session.orbit.current;
        if (rig) target.copy(rig.controls.target);
        return {
          simMs: fab.now(), mode: fab.sim.S.mode, scale: session.clock.scale, view: session.hud.getSnapshot().view,
          hash: fab.hash(), kpis: fab.kpis(), synthetic: syntheticCount(fab), world: world.stats(),
          camera: { position: camera.position.toArray(), target: target.toArray(), fov: camera.fov },
        };
      },
      ffSetScale: (scale: number) => { if (!RULES.values.includes(scale)) throw new Error(`Unknown scale ${scale}`); session.setScale(scale); return scale; },
      ffSetMode: (mode: FabMode) => { if (mode !== 'pilot' && mode !== 'megafab') throw new Error(`Unknown mode ${String(mode)}`); session.setMode(mode); return mode; },
      ffSetView: (name: ViewName) => { if (!VIEW_NAMES.includes(name)) throw new Error(`Unknown view ${String(name)}`); session.setView(name); return name; },
      /** Steps the twin forward by ms of sim time at once (for captures with the kit clock frozen). */
      ffAdvance: (ms: number) => {
        const fab = session.fab;
        if (!fab) return null;
        fab.step(fab.now() + Math.max(0, Math.floor(ms)));
        session.clock.simMs = fab.now();
        world.update(fab.sim, session.clock);
        publishHud(session, fab);
        return fab.now();
      },
      /** The drawn people per people class (FF3 captures: a humanoid on a walkway). */
      ffPeople: () => world.people(),
      /** Production floor ownership and the rendered pose are exposed together for review captures. */
      ffFloor: () => {
        const a = session.fab?.sim.S.floor.active;
        return { state: session.fab?.sim.S.floor ?? null, foup: a ? world.foups().find(f => f.lot === a.lot) ?? null : null };
      },
      /** Instance, draw and triangle counts per entity for the kit's stats hook. */
      counts: () => { const s = world.stats(); return { instances: s.instances, drawnInstances: s.drawn, lod1Instances: s.lod1, pulses: s.pulses, people: s.people }; },
    };
  }, [world, session, camera]);
  useRegisterTestHooks(hooks);

  return map ? <FoundryCameras world={world} data={data} map={map}/> : null;
}
