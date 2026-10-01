import { createContext, useContext } from 'react';
import type { RefObject } from 'react';
import type { RootState } from '@react-three/fiber';
import type { WebGPURenderer } from 'three/webgpu';
import type { SceneProps, SceneDefinition } from '../contract/types';
import type { SceneClock, DisposeRegistry, createSystemLoop } from '../lifecycle/core';
import type { LoadedPack, PackReader } from '../assets';
import type { BackendInfo } from '../renderer';
import type { QualityController } from '../quality';
import type { InputApi } from '../input';
import type { HudStore, FadeController } from '../ui';
export interface SceneRuntime {
  options: SceneProps; definition: SceneDefinition; rootRef: RefObject<HTMLElement | null>;
  clock: SceneClock; registry: DisposeRegistry; systems: ReturnType<typeof createSystemLoop>;
  motion: { reduced: boolean }; paused: boolean; playing: boolean; disposed: boolean; built: boolean; ready: boolean; failed: boolean;
  pack: LoadedPack | null; reader: PackReader | null; backend: BackendInfo | null;
  quality: QualityController | null; input: InputApi & { endFrame?(): void };
  hud: HudStore<Record<string, unknown>>; fade: FadeController;
  state: RootState | null; renderer: WebGPURenderer | null;
  devParams: Record<string, unknown>; data: Map<string, unknown>;
  setPlaying(on: boolean): void; setBuilt(on: boolean): void; fatal(error: unknown): void;
  notify(): void; subscribe(fn: () => void): () => void; getSnapshot(): number;
  testHooks: Record<string, (...args: any[]) => unknown>; workloads: Map<string, (phase: number) => void>;
}
export const RuntimeContext = createContext<SceneRuntime | null>(null);
export function useRuntime(): SceneRuntime { const runtime = useContext(RuntimeContext); if (!runtime) throw new Error('Scene kit hook requires SceneRoot'); return runtime; }
