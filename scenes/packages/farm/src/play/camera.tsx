import { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { FollowRig, OrbitRig, SystemOrder, usePlayMode, useSystem, useRegisterTestHooks, defineDevParams, readDevParams } from '@kiln-scenes/scene-kit';
import type { RigHandle, Vec3 } from '@kiln-scenes/scene-kit';
import { useFarmSession } from '../state';
import { FARM_CAMERA } from '../constants';
import { landscapeHeight } from '../world/landscape';
import type { FarmLayout } from '../world/types';
import type { FarmSim } from './sim';

/**
 * Overview `OrbitRig` (3 to 160 m) and the play `FollowRig` (1.6 to 10 m), which follows Rowan on foot and the
 * tractor while driving. Each mode owns camera input exclusively. Named review views are
 * test/dev only; one closer than 3 m relaxes the floor to its own distance so its pose is exact.
 */
export function FarmCameras({ layout, sim }: { layout: FarmLayout; sim: FarmSim }) {
  const session = useFarmSession(), initialized = useRef(false), follow = useRef<RigHandle | null>(null);
  const camera = useThree(state => state.camera) as PerspectiveCamera;
  const { playing } = usePlayMode(), wasPlaying = useRef(playing);
  const params = useMemo(() => readDevParams(defineDevParams({ view: { kind: 'enum', values: Object.keys(layout.views) } })), [layout]);
  const setView = (name: string) => {
    const view = layout.views[name], rig = session.orbit.current;
    if (!view) throw new Error(`Unknown Farm view: ${name}`);
    if (!rig) return;
    const [px, py, pz] = view.position, [tx, ty, tz] = view.target;
    rig.controls.minDistance = Math.min(FARM_CAMERA.minDistance, Math.hypot(px - tx, py - ty, pz - tz));
    rig.setView({ position: [px, py, pz], target: [tx, ty, tz], fov: view.fov ?? FARM_CAMERA.fov,
      maxPolar: view.interior ? FARM_CAMERA.interiorMaxPolar : FARM_CAMERA.maxPolar });
    session.view = name;
  };
  useSystem('farm-initial-camera', SystemOrder.path, () => {
    if (!initialized.current && session.orbit.current) { setView(typeof params.view === 'string' ? params.view : 'hero'); initialized.current = true; }
  });
  // Leaving play keeps the pilot's camera: the overview orbits the last follow target from the
  // current position, with the play field of view and polar limit until Reset or another view.
  useLayoutEffect(() => {
    const rig = session.orbit.current, target = sim.follow.subject.current;
    if (wasPlaying.current && !playing && rig && target) {
      rig.controls.minDistance = FARM_CAMERA.minDistance;
      rig.setView({ position: camera.position.toArray() as Vec3, target: target.position.toArray() as Vec3, fov: camera.fov, maxPolar: FARM_CAMERA.playMaxPolar });
    }
    wasPlaying.current = playing;
  }, [playing, camera, sim, session]);
  const obstruction = useMemo(() => ({
    ray: (from: Vector3, to: Vector3) => sim.world.rayDistance(from, to, sim.follow.ignore),
    pad: FARM_CAMERA.playPad, minDistance: FARM_CAMERA.playMinPull,
    // play.mjs hides Rowan unless the raw hit distance exceeds 1.25 m; the kit compares the padded distance.
    hideSubjectBelow: FARM_CAMERA.playHideRay - FARM_CAMERA.playPad,
    onSubjectVisible: (visible: boolean) => { if (sim.active || visible) sim.player.object.visible = visible; },
  }), [sim]);
  const offset = useMemo(() => () => [...sim.follow.offset] as Vec3, [sim]);
  const hooks = useMemo(() => ({ setView, cameraPose: () => (playing ? follow.current : session.orbit.current)?.pose, viewNames: () => Object.keys(layout.views) }), [layout, session, playing]);
  useRegisterTestHooks(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV ? hooks : {});
  return <>
    <OrbitRig rigRef={session.orbit} active={!playing} target={[0, 0, -2]} minDistance={FARM_CAMERA.minDistance} maxDistance={FARM_CAMERA.maxDistance}
      maxPolar={FARM_CAMERA.maxPolar} damping={false} pan floor={landscapeHeight} clearance={.25}/>
    <FollowRig rigRef={follow} active={playing} subject={sim.follow.subject} targetHeight={0} offset={offset} fov={FARM_CAMERA.playFov}
      maxPolar={FARM_CAMERA.playMaxPolar} minDistance={FARM_CAMERA.playMinDistance} maxDistance={FARM_CAMERA.playMaxDistance} obstruction={obstruction}/>
  </>;
}
