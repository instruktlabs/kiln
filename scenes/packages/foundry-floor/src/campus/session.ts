// SPDX-License-Identifier: MIT
// One campus mount (FF-C1): where the viewer is (the exterior or the interior twin), the exterior's camera mode and
// named view, and the Enter and Exit requests. The HUD writes requests here; the campus world (World.tsx) runs the
// fade and swaps the places, so the swap happens in one place. Inside, the interior is FF2's own session, created
// fresh on every Enter (a fresh twin from the pack's warm start, so its hashes are FF2's) and disposed on Exit.
import { createContext, useContext } from 'react';
import { createHudStore } from '@kiln-scenes/scene-kit';
import type { RigHandle } from '@kiln-scenes/scene-kit';
import type { FoundrySession } from '../scene/session';
import type { CampusViewName } from './data';

export type CampusPlace = 'exterior' | 'interior';
/** Who drives the exterior camera: the orbit (named views) or the car. */
export type CampusCamera = 'orbit' | 'drive';
export interface CampusHudState {
  place: CampusPlace;
  /** True while the fade between the places runs (the HUD holds its controls). */
  moving: boolean;
  camera: CampusCamera;
  view: CampusViewName;
  /** Proximity diagnostic for the original arrival zone; persistent Enter no longer depends on this. */
  canEnter: boolean;
  /** The polite status line (the place just entered, the way in while driving). */
  status: string;
  speedKmh: number;
  about: boolean;
  /** The drive is loaded (the pack's driving data and vehicles). */
  driveReady: boolean;
  /** The car faces a road end within the prompt distance (the turn-around prompt). */
  atRoadEnd: boolean;
  paused: boolean;
}

/** The car's state kept across a visit inside (the drive restores it on Exit). */
export interface CarMemory { u: number; v: number; heading: number }

export function createCampusSession() {
  const hud = createHudStore<CampusHudState>({
    place: 'exterior', moving: false, camera: 'orbit', view: 'campus', canEnter: false, status: '', speedKmh: 0, about: false,
    driveReady: false, atRoadEnd: false, paused: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  return {
    hud,
    /** FF2's session while inside, else null. */
    interior: null as FoundrySession | null,
    orbit: { current: null as RigHandle | null },
    /** How the viewer went in: Exit returns to it (the orbit at the canopy view, or the car stopped at the drop-off). */
    cameFrom: 'orbit' as CampusCamera,
    car: null as CarMemory | null,
    /** Set by Exit when the viewer went in from the car: restores the saved car location and takes the camera. */
    resumeDrive: false,
    /** Set once the exterior applied its first view (the scene reports built after it). */
    viewReady: false,
    /** Requests from the HUD, applied by the frame systems. */
    requests: { view: null as CampusViewName | null, camera: null as CampusCamera | null, place: null as CampusPlace | null },
    setView(view: CampusViewName) { this.requests.view = view; hud.set({ view }); },
    setCamera(camera: CampusCamera) { this.requests.camera = camera; },
    enter() {
      const h = hud.getSnapshot();
      if (h.place !== 'exterior' || h.moving) return;
      this.cameFrom = h.camera;
      this.requests.place = 'interior';
    },
    exit() { if (hud.getSnapshot().place === 'interior' && !hud.getSnapshot().moving) this.requests.place = 'exterior'; },
    setAbout(open: boolean) { hud.set({ about: open }); },
    setPaused(paused: boolean) { hud.set({ paused }); },
    dispose() { hud.dispose(); this.interior?.dispose(); this.interior = null; this.orbit.current = null; },
  };
}
export type CampusSession = ReturnType<typeof createCampusSession>;
export const CampusContext = createContext<CampusSession | null>(null);
export function useCampusSession(): CampusSession {
  const session = useContext(CampusContext);
  if (!session) throw new Error('Foundry Floor campus component requires its session provider');
  return session;
}
