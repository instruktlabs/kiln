import { useEffect } from 'react';
import { CatmullRomCurve3, MathUtils, Vector3 } from 'three/webgpu';
import { registerWorkload, useInput, usePlayMode } from '@kiln-scenes/scene-kit';
import type { Vec3 } from '@kiln-scenes/scene-kit';
import type { FarmSession } from '../state';
import type { FarmWorld } from '../world/build-world';
import { applyTractorPose } from './tractor';

/** The sealed pilot's moving measurement workloads (activity.mjs `ACTIVITY_WORKLOADS`). */
export const FARM_WORKLOADS = ['living-orbit', 'living-route', 'tractor-drive'] as const;
/** M4: workloads the pilot has no sealed measurement for, so X-01 leaves them out; X-05 and X-12 walk (SPEC 20.1). */
export const FARM_REWRITE_WORKLOADS = ['walk'] as const;

/**
 * Test and dev builds only (World.tsx calls this behind the build flags; public builds drop it).
 * Ports of the pilot's measurement workloads for the hub run kit (SPEC 20.3, X-01): activity.mjs
 * `living-orbit` and `living-route` move the overview camera; play.mjs `beginDrivePreview` drives
 * the tractor along its bounded farmyard lane. Each reads the scene clock that the kit passes to a
 * running workload and starts from its first call. Nothing here measures or reads time.
 */
export function useFarmWorkloads(world: FarmWorld | null, session: FarmSession): void {
  const input = useInput(), { setPlaying } = usePlayMode();
  useEffect(() => {
    if (!world) return;
    const polar = Math.PI * .54, lift = new Vector3(0, 2.3, 0), point = new Vector3(), aim = new Vector3();
    const positions = new CatmullRomCurve3(world.layout.route.map(entry => new Vector3(...entry.position).add(lift)));
    const targets = new CatmullRomCurve3(world.layout.route.map(entry => new Vector3(...entry.target)));
    const clockFrom = () => { let origin: number | null = null; return (time: number) => time - (origin ??= time); };
    const orbitElapsed = clockFrom(), routeElapsed = clockFrom();
    const view = (position: Vec3, target: Vec3, fov: number) => session.orbit.current?.setView({ position, target, fov, maxPolar: polar });
    // activity.mjs update(): 35 s per revolution at 82 m, target (0, 1, -2), field of view 48.
    const orbit = (time: number) => {
      const a = .72 + orbitElapsed(time) * Math.PI * 2 / 35;
      view([Math.sin(a) * 82, 40 + 5 * Math.sin(a * .7), Math.cos(a) * 82 - 2], [0, 1, -2], 48);
    };
    // activity.mjs update(): the layout route there and back over 60 s, 2.3 m above it, field of view 65.
    const route = (time: number) => {
      const t = (routeElapsed(time) % 60) / 30, u = t <= 1 ? t : 2 - t;
      positions.getPoint(u, point); targets.getPoint(u, aim);
      view(point.toArray() as Vec3, aim.toArray() as Vec3, 65);
    };
    // play.mjs beginDrivePreview(): tractor at (-3, 0, -5) facing +z, Rowan mounted, then back and
    // forth between x = -3 and x = 13, steering towards z = -5 + .22 sin(.55 t). The kit's input
    // mirror carries the preview's forward and turn (turn is -move.x, as for the keyboard).
    let drive: { phase: 'enter' | 'mount' | 'drive'; origin: number; direction: number; reversals: number } | null = null;
    const tractorDrive = (time: number) => {
      const sim = world.sim, tractor = sim.tractor.object;
      if (!drive) {
        tractor.position.set(-3, 0, -5); tractor.rotation.y = 0; tractor.updateMatrixWorld(true); applyTractorPose(sim.tractorRig, sim.drive);
        drive = { phase: 'enter', origin: time, direction: 1, reversals: 0 }; setPlaying(true); return;
      }
      if (drive.phase === 'enter') {
        if (!sim.active) return;
        sim.player.object.position.set(tractor.position.x + 2, tractor.position.y, tractor.position.z); drive.phase = 'mount'; return;
      }
      if (drive.phase === 'mount') { if (sim.nearestTractor) { sim.interact(); drive.phase = 'drive'; } return; }
      if (!sim.driving) return;
      const elapsed = time - drive.origin, p = tractor.position;
      if (drive.direction > 0 && p.x >= 13) { drive.direction = -1; drive.reversals++; }
      else if (drive.direction < 0 && p.x <= -3) { drive.direction = 1; drive.reversals++; }
      const desiredYaw = drive.direction * MathUtils.clamp((p.z - (-5 + .22 * Math.sin(elapsed * .55))) * .25, -.1, .1);
      input.setMove(-MathUtils.clamp((desiredYaw - tractor.rotation.y) * 4 * drive.direction, -.3, .3), drive.direction, false);
    };
    // M4 `walk` (X-05, X-12): play starts, Rowan is placed at the yard destination, then walks away from the camera for 4 s
    // and back towards it for 4 s, repeatedly, through the kit's input mirror as the keyboard would (the follow camera trails him).
    let walking: { phase: 'enter' | 'walk'; origin: number } | null = null;
    const walk = (time: number) => {
      const sim = world.sim;
      if (!walking) { walking = { phase: 'enter', origin: time }; setPlaying(true); return; }
      if (walking.phase === 'enter') { if (!sim.active) return; sim.visit('yard'); walking = { phase: 'walk', origin: time }; return; }
      input.setMove(0, Math.floor((time - walking.origin) / 4) % 2 === 0 ? 1 : -1, false);
    };
    const stops = [registerWorkload('living-orbit', orbit), registerWorkload('living-route', route), registerWorkload('tractor-drive', tractorDrive), registerWorkload('walk', walk)];
    return () => { for (const stop of stops) stop(); };
  }, [world, session, input, setPlaying]);
}
