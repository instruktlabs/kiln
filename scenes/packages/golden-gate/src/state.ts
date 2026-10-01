import { createContext, useContext } from 'react';
import { createHudStore } from '@kiln-scenes/scene-kit';
import type { PresetBlender, RigHandle, SceneProgress } from '@kiln-scenes/scene-kit';
import type { GoldenGatePreset, PresetName } from './presets';
import type { GoldenGateWorld } from './world/build-world';
import type { FlightName } from './params';
import type { CameraControl } from './camera/GoldenGateCameras';
import { createGoldenGateMotion } from './motion';

export interface GoldenGateHudState {
  preset: PresetName;
  status: string;
  flight: FlightName | null;
  driving: boolean;
  speedKmh: number;
  /** Near the road end ahead while driving: the turn-around prompt shows in the status line. */
  atRoadEnd: boolean;
  paused: boolean;
}
export function createGoldenGateSession() {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hud = createHudStore<GoldenGateHudState>({ preset: 'day', status: '', flight: null, driving: false, speedKmh: 0, atRoadEnd: false, paused: reduced });
  const motion = createGoldenGateMotion(reduced, paused => hud.set({ paused }));
  return {
    hud,
    motion,
    world: null as GoldenGateWorld | null,
    presets: null as PresetBlender<GoldenGatePreset> | null,
    orbit: { current: null as RigHandle | null },
    /** Camera modes (orbit, review pose, flight, drive), published by the cameras component. */
    camera: undefined as CameraControl | undefined,
    /** Finer build progress than the kit's single 'build' phase (the Farm pattern). */
    progress: null as ((progress: SceneProgress) => void) | null,
    /** Requests from the HUD, consumed by systems inside the canvas. */
    requests: { flight: null as FlightName | null, stopFlight: false, turnAround: false },
    dispose() { hud.dispose(); this.world = null; this.presets = null; this.orbit.current = null; this.progress = null; this.camera = undefined; },
  };
}
export type GoldenGateSession = ReturnType<typeof createGoldenGateSession>;
export const GoldenGateContext = createContext<GoldenGateSession | null>(null);
export function useGoldenGateSession(): GoldenGateSession {
  const session = useContext(GoldenGateContext);
  if (!session) throw new Error('Golden Gate component requires its session provider');
  return session;
}
