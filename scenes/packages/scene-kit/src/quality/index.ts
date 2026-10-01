import type { RootState } from '@react-three/fiber';
import { useRuntime } from '../internal/runtime';
import { detectBackend, asWebGPU } from '../renderer';
import type { DeviceProbe, QualityController, TierKnobs } from './core';
export * from './core';

export function probeDevice(state: RootState, win: Window = window): DeviceProbe {
  const renderer = asWebGPU(state.gl), backend = detectBackend(renderer, false);
  const nav = win.navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const gpuRenderer = renderer as unknown as { backend: { gl?: WebGL2RenderingContext; device?: { limits?: { maxTextureDimension2D?: number } } } };
  const gl = gpuRenderer.backend.gl;
  return {
    backend: backend.backend, adapter: backend.adapter, hardwareConcurrency: nav.hardwareConcurrency ?? 1,
    deviceMemory: nav.deviceMemory, devicePixelRatio: win.devicePixelRatio || 1,
    screenWidth: win.screen?.width || win.innerWidth, screenHeight: win.screen?.height || win.innerHeight,
    coarsePointer: win.matchMedia('(pointer: coarse)').matches, mobileUA: /Android|iPhone|iPad|Mobile/i.test(nav.userAgent),
    saveData: !!nav.connection?.saveData, prefersReducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches,
    maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) as number : gpuRenderer.backend.device?.limits?.maxTextureDimension2D,
  };
}
export function useQuality<K extends TierKnobs = TierKnobs>(): QualityController<K> {
  const controller = useRuntime().quality;
  if (!controller) throw new Error('Quality is unavailable before renderer initialization');
  return controller as QualityController<K>;
}
