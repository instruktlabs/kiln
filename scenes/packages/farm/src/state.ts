import { createContext, useContext } from 'react';
import { createHudStore } from '@kiln-scenes/scene-kit';
import type { RigHandle } from '@kiln-scenes/scene-kit';
import type { FarmWorld } from './world/build-world';
import type { PreparedFarm } from './world/prepare';
import { FARM_STRINGS } from './ui/strings';

export interface FarmHudState { status: string; interact: string; canInteract: boolean; driving: boolean }
export function createFarmSession() {
  const hud = createHudStore<FarmHudState>({ status: '', interact: FARM_STRINGS.approach, canInteract: false, driving: false });
  return {
    hud, world: null as FarmWorld | null, prepared: null as PreparedFarm | null, orbit: { current: null as RigHandle | null },
    view: 'hero', ambientEnabled: true,
    dispose() { hud.dispose(); this.world = null; this.orbit.current = null; },
  };
}
export type FarmSession = ReturnType<typeof createFarmSession>;
export const FarmContext = createContext<FarmSession | null>(null);
export function useFarmSession(): FarmSession {
  const session = useContext(FarmContext);
  if (!session) throw new Error('Farm component requires its session provider');
  return session;
}
