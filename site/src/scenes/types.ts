/**
 * The contract between a scene page's shell (src/components/SceneShell.astro) and a scene runtime.
 * A runtime is built separately from the site (scripts/scene-runtime.mjs) and loaded only when a
 * visitor chooses Explore, so nothing here may import scene code.
 */
export interface SceneProgress {
  phase: 'pack' | 'graphics' | 'assets' | 'build' | 'first-frame';
  loaded: number;
  total: number;
  text: string;
}

export interface SceneBackend {
  backend: 'webgpu' | 'webgl2';
  forced: boolean;
  fellBack: boolean;
}

export type SceneTierName = 'minimal' | 'economy' | 'balanced' | 'high';

export interface SceneTierChange {
  kind: 'initial' | 'live' | 'advice';
  tier?: SceneTierName;
  suggestedTier?: SceneTierName;
}

/** What the shell passes to a runtime's `mount`. `assetBase` is the staged, verified scene pack. */
export interface SceneMountProps {
  assetBase: string;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: SceneProgress) => void;
  onBackend?: (backend: SceneBackend) => void;
  onTier?: (change: SceneTierChange) => void;
  onPlayChange?: (playing: boolean) => void;
}

/** A module-kind runtime: `mount` returns the function that unmounts it. */
export interface SceneRuntimeModule {
  mount(element: HTMLElement, props: SceneMountProps): () => void;
  /** three's REVISION as this runtime bundled it; the browser check compares it with `globalThis.__THREE__`. */
  REVISION: string;
}
