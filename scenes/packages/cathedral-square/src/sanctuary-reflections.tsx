import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PMREMGenerator, RendererUtils, Vector3 } from 'three/webgpu';
import type { CubeRenderTarget } from 'three/webgpu';
import { asWebGPU } from '@kiln-scenes/scene-kit';
import { currentSun } from './lighting';
import { squareGold } from './world';

/** One real sanctuary radiance capture, scoped to its gold rather than the scene environment. */
export function SanctuaryReflections() {
  const renderer = asWebGPU(useThree(state => state.gl)), scene = useThree(state => state.scene);
  const installed = useRef<{ binding: NonNullable<typeof squareGold>; light: NonNullable<ReturnType<typeof currentSun>>; target: CubeRenderTarget } | null>(null);
  const failed = useRef<{ binding: NonNullable<typeof squareGold>; light: NonNullable<ReturnType<typeof currentSun>> } | null>(null);
  const release = () => { installed.current?.binding.setEnvironment(null); installed.current?.target.dispose(); installed.current = null; };
  useEffect(() => { failed.current = null; return release; }, [renderer, scene]);
  // Capture before the AO render owner, outside all main-scene material evaluation.
  useFrame(() => {
    const binding = squareGold, light = currentSun();
    if (installed.current && (installed.current.binding !== binding || installed.current.light !== light)) release();
    if (!binding || !light || installed.current || scene.getObjectById(light.light.id) !== light.light) return;
    if (failed.current?.binding === binding && failed.current.light === light) return;
    if (!binding.materialCount) { failed.current = { binding, light }; console.warn('Sanctuary reflection capture found no selected gold materials.'); return; }
    const generator = new PMREMGenerator(renderer);
    const rendererState = RendererUtils.saveRendererState(renderer), sceneState = RendererUtils.saveSceneState(scene);
    const xrEnabled = renderer.xr.enabled, contextNode = renderer.contextNode;
    const restoreVisibility = binding.hideForCapture(scene);
    let target: CubeRenderTarget | null = null;
    try {
      scene.updateMatrixWorld(true);
      target = generator.fromScene(scene, 0, .1, 150, { size: 256, position: new Vector3(-55.8, 7.5, 0) });
      binding.setEnvironment(target.texture);
      installed.current = { binding, light, target };
    } catch (error) {
      binding.setEnvironment(null); target?.dispose(); failed.current = { binding, light };
      console.warn('Sanctuary reflections unavailable; retaining authored materials without a reflection capture.', error);
    } finally {
      restoreVisibility(); generator.dispose();
      RendererUtils.restoreRendererState(renderer, rendererState); RendererUtils.restoreSceneState(scene, sceneState);
      renderer.xr.enabled = xrEnabled; renderer.contextNode = contextNode;
    }
  }, .9);
  return null;
}
