/**
 * The scene package as the site consumes it. The build aliases this specifier to the scenes
 * workspace source (scripts/scene-source.mjs), so the site's type check stays independent of a
 * checkout. The shape follows the scene kit's SceneProps: the site passes assetBase, onReady,
 * onError and onProgress.
 */
declare module '@kiln-scenes/farm' {
  export interface FarmSceneProgress {
    phase: 'pack' | 'graphics' | 'assets' | 'build' | 'first-frame';
    loaded: number;
    total: number;
    text: string;
  }
  export interface FarmSceneProps {
    assetBase: string;
    onReady?: () => void;
    onError?: (error: Error) => void;
    onProgress?: (progress: FarmSceneProgress) => void;
  }
  export function FarmScene(props: FarmSceneProps): import('react').JSX.Element | null;
}

/** Build-time flag: true when this build includes the scene source and a staged pack. */
declare module 'virtual:kiln-farm-scene' {
  export const farmSceneIncluded: boolean;
}
