import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three/webgpu';
import { SystemOrder, useInput, useQuality, useRegisterTestHooks, useSceneClock, useSystem } from '@kiln-scenes/scene-kit';
import type { FarmSession } from '../state';
import type { FarmWorld } from '../world/build-world';
import { FARM_DESTINATION_NAMES, isFarmDestination } from './destinations';
import { applyTractorPose } from './tractor';

const cameraForward = new Vector3();
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Mixers (400) and the play simulation (500), in the pilot's frame order: clips first, then
 * doors, walking or driving, then the frame graph (600) and the follow rig (700).
 * `input.enabled` is the kit's synchronous mirror of `playing` (set inside `setPlaying`), so the
 * simulation never lags a React render behind the page's play state.
 */
export function useFarmPlaySystems(world: FarmWorld | null, session: FarmSession): void {
  const input = useInput(), quality = useQuality(), clock = useSceneClock(), camera = useThree(state => state.camera);
  const patch = useMemo(() => ({ status: '', interact: '', canInteract: false, driving: false }), []);
  useSystem('farm-mixers', SystemOrder.mixers, dt => {
    if (!world) return;
    const player = world.sim.active ? world.sim.player : undefined;
    if (quality.knobs.effects.ambientAnimation && !quality.motion.reduced) world.placements.updateMixers(clock.delta, player);
    // Walking is user-initiated motion (SPEC 13.4): it animates without ambient animation, on
    // the unscaled step. A frozen test/dev clock (time scale 0) holds the current clip at its
    // present time, so a clip chosen while frozen (Idle on entering play) still poses Rowan.
    if (player?.action) world.sim.updateAnimation(clock.timeScale > 0 ? Math.min(.1, dt) : 0);
  });
  useSystem('farm-sim', SystemOrder.sim, dt => {
    const sim = world?.sim; if (!sim) return;
    const state = input.state, playing = input.enabled;
    sim.setTouch(state.lastPointer === 'touch' || state.lastPointer === 'pen');
    if (playing && !sim.active) sim.start();
    else if (!playing && sim.active) sim.stop(true);
    if (sim.active) {
      // Pilot Escape: leaving play first leaves the tractor; with every exit blocked play continues.
      if (state.cancel) { if (!sim.stop()) state.cancel = false; }
      else if (state.interact) sim.interact();
    }
    camera.getWorldDirection(cameraForward);
    sim.update(dt, state, cameraForward, quality.motion.reduced);
    patch.status = sim.status; patch.interact = sim.prompt; patch.canInteract = sim.canInteract; patch.driving = sim.driving;
    session.hud.set(patch);
  });
  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => {
    if (!world) return {};
    const sim = world.sim, player = sim.player.object, tractor = sim.tractor.object;
    return {
      simState: () => ({
        active: sim.active, driving: sim.driving, status: sim.status, prompt: sim.prompt, canInteract: sim.canInteract,
        player: { position: player.position.toArray().map(round), yaw: round(player.rotation.y), visible: player.visible, clip: sim.currentClip,
          forkVisible: player.getObjectByName('Joint_Pitchfork')?.visible ?? null, velocityY: round(sim.velocityY) },
        tractor: { position: tractor.position.toArray().map(round), yaw: round(tractor.rotation.y), speed: round(sim.drive.speed), steer: round(sim.drive.steer), travel: round(sim.drive.travel) },
        nearest: sim.driving ? 'driving' : sim.nearestTractor ? 'tractor' : sim.nearestDoor ? sim.nearestDoor.instance.id : null,
        doors: sim.doors.map(door => ({ id: door.instance.id, label: door.label, amount: round(door.amount), target: door.target })),
        drivenMeters: round(sim.drivenMeters), blockedSteps: sim.blockedSteps,
        camera: { position: camera.position.toArray().map(round), quaternion: camera.quaternion.toArray().map(round), fov: round((camera as { fov?: number }).fov ?? 0) },
        destinations: FARM_DESTINATION_NAMES,
      }),
      teleport: (name: string) => { if (!isFarmDestination(name)) throw new Error(`Unknown Farm destination: ${name}`); return sim.visit(name); },
      resetFarmer: () => sim.reset(),
      /** Places Rowan exactly (no collision resolve), for scripted B-08 fixtures only. */
      placePlayer: (x: number, y: number, z: number, yaw: number) => { player.position.set(x, y, z); player.rotation.y = yaw; if (sim.active) sim.resetCamera(); },
      /** Places the tractor exactly; while driving Rowan stays seated (the next fixed step re-seats him) and the camera resets. */
      placeTractor: (x: number, y: number, z: number, yaw: number) => {
        tractor.position.set(x, y, z); tractor.rotation.y = yaw; tractor.updateMatrixWorld(true); applyTractorPose(world.sim.tractorRig, sim.drive);
        if (sim.driving) sim.resetCamera();
      },
      toggleDoor: (id: string) => { const door = sim.doors.find(entry => entry.instance.id === id); if (!door) throw new Error(`Unknown Farm door: ${id}`); door.target = door.target > .5 ? 0 : 1; return door.target; },
      colliderStats: () => ({ ...world.colliders.stats, keys: world.colliders.world.colliders.map(c => ({ key: c.key, dynamic: c.dynamic, triangles: c.geometry.getAttribute('position').count / 3 })) }),
    };
  }, [world, camera]);
  useRegisterTestHooks(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV ? hooks : {});
}
