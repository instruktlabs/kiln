// SPDX-License-Identifier: MIT
// One Foundry Floor mount: the twin, the presentation clock and the HUD store. The HUD writes requests here; the
// frame systems inside the canvas apply them, so the twin is only touched from one place. The camera controller
// (Cameras.tsx) registers itself here so the HUD can start and stop the walk, the tour and follow-a-wafer.
import { createContext, useContext } from 'react';
import { createHudStore } from '@kiln-scenes/scene-kit';
import type { RigHandle } from '@kiln-scenes/scene-kit';
import { createClock } from '../sim/clock';
import type { PresentationClock } from '../sim/clock';
import type { Fab } from '../sim/index';
import type { FabKpis, FabMode } from '../sim/fab';
import type { NamedView } from '../sim/data';
import type { FollowInfo, InfoPanel, LotChoice } from './panels';

/** The layout's named views (data VIEW_NAMES): landing, overview and the tour stops. */
export type ViewName = NamedView;
/** Who drives the camera: the orbit (named views), the free walk, the tour or follow-a-wafer. */
export type CameraMode = 'orbit' | 'walk' | 'tour' | 'follow';
export interface TourHud { stop: number; stops: number; label: string; phase: 'cut' | 'hold' | 'fly' | 'done'; lines: string[] }
export interface FoundryHudState {
  mode: FabMode;
  scale: number;
  simMs: number;
  synthetic: number;
  kpis: FabKpis | null;
  view: ViewName;
  about: boolean;
  camera: CameraMode;
  /** The walker's whereabouts (walk mode), or empty. */
  status: string;
  tour: TourHud | null;
  /** The tapped tool's or stocker's panel, refreshed from state. */
  panel: InfoPanel | null;
  follow: FollowInfo | null;
  /** The lots offered to follow (derived from state when the picker opens), or null when closed. */
  picker: LotChoice[] | null;
  floor: { delivered: number; collected: number; queued: number; active: string; followLot: number | null } | null;
}
export interface CameraControl {
  readonly mode: CameraMode;
  startTour(atSeconds?: number): void;
  stopTour(): void;
  follow(lot: number): void;
  unfollow(): void;
  openPicker(): void;
  closePicker(): void;
  openPanel(id: string): boolean;
  closePanel(): void;
}

export function createFoundrySession(options: { reducedMotion?: boolean } = {}) {
  const reduced = options.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const initialScale = reduced ? 0 : 1;
  const hud = createHudStore<FoundryHudState>({
    mode: 'megafab', scale: initialScale, simMs: 0, synthetic: 0, kpis: null, view: 'landing', about: false,
    camera: 'orbit', status: '', tour: null, panel: null, follow: null, picker: null, floor: null,
  });
  return {
    hud,
    fab: null as Fab | null,
    clock: createClock(0, initialScale) as PresentationClock,
    orbit: { current: null as RigHandle | null },
    camera: null as CameraControl | null,
    /** Set once the first named view has been applied (the scene reports built after it). */
    viewReady: false,
    /** Requests from the HUD, applied by the frame systems. */
    requests: { mode: null as FabMode | null, scale: null as number | null, view: null as ViewName | null },
    setScale(scale: number) { this.requests.scale = scale; hud.set({ scale }); },
    setMode(mode: FabMode) { this.requests.mode = mode; },
    setView(view: ViewName) { this.requests.view = view; hud.set({ view }); },
    setAbout(open: boolean) { hud.set({ about: open }); },
    dispose() { hud.dispose(); this.fab = null; this.orbit.current = null; this.camera = null; },
  };
}
export type FoundrySession = ReturnType<typeof createFoundrySession>;
export const FoundryContext = createContext<FoundrySession | null>(null);
export function useFoundrySession(): FoundrySession {
  const session = useContext(FoundryContext);
  if (!session) throw new Error('Foundry Floor component requires its session provider');
  return session;
}
