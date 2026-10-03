import type { ComponentType, ReactNode } from 'react';
import type { TierName, TierTable, TierChange } from '../quality';
import type { BackendInfo, RendererLook } from '../renderer';
import type { DisposeRegistry } from '../lifecycle/core';
export interface SceneOptions { assetBase: string; onReady?: () => void; onError?: (e: Error) => void }
export interface SceneExtras {
  quality?: 'auto' | TierName; backend?: 'auto' | 'webgl2'; dev?: boolean;
  onProgress?: (p: SceneProgress) => void; onBackend?: (b: BackendInfo) => void;
  onTier?: (c: TierChange) => void; onPlayChange?: (playing: boolean) => void;
}
export type SceneProps = SceneOptions & SceneExtras;
export interface SceneProgress { phase: 'pack' | 'graphics' | 'assets' | 'build' | 'first-frame'; loaded: number; total: number; text: string }
export interface SceneHandle { unmount(): void; readonly disposed: boolean }
export interface SceneDataPreparationContext { readonly signal: AbortSignal; readonly registry: DisposeRegistry }
export interface SceneDefinition {
  id: string; label: string; description: string; tiers: TierTable; look: RendererLook;
  hud?: ReactNode; devPanel?: ReactNode;
  camera?: { position?: [number,number,number]; fov?: number; near?: number; far?: number };
  /** Default false. The scene must adapt skies, oblique reflection planes and polygon offsets to the effective backend setting. */
  reversedDepthBuffer?: boolean;
  /** Optional initial model subset. Omitted models remain integrity-checked through usePackReader when requested. */
  startupModel?: (model:{id:string;path:string})=>boolean;
  /** Synchronous, idempotent CPU preparation as verified data arrives. Register owned resources immediately; the current mount owns their disposal. */
  prepareData?: (data: ReadonlyMap<string, ArrayBuffer>, context: SceneDataPreparationContext) => void;
}
export type SceneComponent = ComponentType<SceneProps>;
