// Measurement workloads for the performance plan (SPEC 20; PERFORMANCE.md). Test and dev builds only:
// GoldenGateCameras calls this hook behind the build flags, so public builds drop it, and the kit's
// registerWorkload is a no-op elsewhere. The kit calls a running workload once a frame with the scene
// clock; each workload starts from its first call. Nothing here measures or reads wall time.
//   orbit    the hero orbit: the orbit rig circles the bridge once a minute (HERO_ORBIT)
//   flyover  the guided flyovers in turn, each played to its end by the kit's PathRig
//   drive    registered by play/Driving.tsx: enters the sedan and drives the deck at full throttle
import { useEffect, useRef } from 'react';
import { registerWorkload, usePlayMode } from '@kiln-scenes/scene-kit';
import type { Vec3 } from '@kiln-scenes/scene-kit';
import { CAMERA } from '../constants';
import type { FlightName } from '../params';
import type { GoldenGateSession } from '../state';
import type { CameraControl } from './GoldenGateCameras';

export const GG_WORKLOADS = ['orbit', 'flyover', 'drive'] as const;
export type GoldenGateWorkload = typeof GG_WORKLOADS[number];

/**
 * The hero orbit: 1,000 m around (0, 90, -100), between the towers, at 240 m, one revolution in 60 s,
 * so a 60 s sample covers exactly one revolution whatever its start. On the staged collision grid the
 * camera stays at least 97 m above the terrain and its sightline to the target at least 90 m clear
 * (checked by tests/unit/workloads.test.ts).
 */
export const HERO_ORBIT = { center: [0, 90, -100] as Vec3, radius: 1000, height: 240, seconds: 60, fov: 55 } as const;
/** The flyovers in the order the workload plays them; the fog roll plays only under the Fog preset. */
export const FLYOVER_ORDER: readonly FlightName[] = ['postcard-sweep', 'tower-rise', 'deck-run', 'fog-roll'];

/** The hero orbit's camera position after `elapsed` seconds. */
export function heroOrbitPosition(elapsed: number): Vec3 {
  const a = elapsed * Math.PI * 2 / HERO_ORBIT.seconds, c = HERO_ORBIT.center;
  return [c[0] + Math.sin(a) * HERO_ORBIT.radius, HERO_ORBIT.height, c[2] + Math.cos(a) * HERO_ORBIT.radius];
}

export function useGoldenGateWorkloads(control: CameraControl, session: GoldenGateSession): void {
  const { playing, setPlaying } = usePlayMode(), playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => {
    let origin: number | null = null, next = 0;
    // Leaves the car or hands a review pose or flyover back to the orbit; true while that is still under way.
    const toOrbit = () => {
      if (playingRef.current) { setPlaying(false); return true; }
      if (control.mode !== 'orbit') { control.toOrbit(); return true; }
      return false;
    };
    const orbit = (time: number) => {
      if (toOrbit()) return;
      session.orbit.current?.setView({ position: heroOrbitPosition(time - (origin ??= time)), target: HERO_ORBIT.center, fov: HERO_ORBIT.fov, maxPolar: CAMERA.orbit.maxPolar });
    };
    const flyover = () => {
      if (playingRef.current) { setPlaying(false); return; }
      if (control.mode === 'flight') return;
      // A flight that cannot play now (the fog roll outside the Fog preset) is skipped.
      for (let tries = 0; tries < FLYOVER_ORDER.length; tries++) if (control.playFlight(FLYOVER_ORDER[next++ % FLYOVER_ORDER.length]!)) return;
    };
    const stops = [registerWorkload('orbit', orbit), registerWorkload('flyover', flyover)];
    return () => { for (const stop of stops) stop(); };
  }, [control, session, setPlaying]);
}
