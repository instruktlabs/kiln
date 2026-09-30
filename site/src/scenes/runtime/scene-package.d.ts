/**
 * The scene package as the site consumes it. The runtime build aliases this specifier to the scenes
 * workspace source (scripts/scene-source.mjs), so the site's own type check stays independent of a
 * checkout; scripts/typecheck-scenes.mjs checks the real sources when a workspace is present. The
 * shape follows the scene kit's SceneProps and SceneHandle.
 */
declare module '@kiln-scenes/farm' {
  export interface FarmSceneProps {
    assetBase: string;
    onReady?: () => void;
    onError?: (error: Error) => void;
    onProgress?: (progress: {
      phase: 'pack' | 'graphics' | 'assets' | 'build' | 'first-frame';
      loaded: number;
      total: number;
      text: string;
    }) => void;
    onBackend?: (backend: {
      backend: 'webgpu' | 'webgl2';
      forced: boolean;
      fellBack: boolean;
    }) => void;
    onTier?: (change: {
      kind: 'initial' | 'live' | 'advice';
      tier?: 'minimal' | 'economy' | 'balanced' | 'high';
      suggestedTier?: 'minimal' | 'economy' | 'balanced' | 'high';
    }) => void;
    onPlayChange?: (playing: boolean) => void;
  }
  export interface SceneHandle {
    unmount(): void;
    readonly disposed: boolean;
  }
  export function mountFarmScene(element: HTMLElement, props: FarmSceneProps): SceneHandle;
}

/** Build-time module: which scene runtimes are staged (scripts/scene-source.mjs). */
declare module 'virtual:kiln-scenes' {
  export const sceneRuntimes: Record<
    string,
    {
      kind: 'module' | 'frame';
      url: string;
      file: string;
      bytes: number;
      gzipBytes: number;
      sha256: string;
      /** Read from the served, verified pack.json at build time. */
      pack: {
        release: string | null;
        models: Record<string, { path: string; bytes: number; sha256: string }>;
        source: Record<string, unknown> | null;
      };
    } | null
  >;
}
