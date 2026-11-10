import { Layers, RenderPipeline, RendererUtils } from 'three/webgpu';
import type { Camera, Mesh, Node, Object3D, Scene, WebGPURenderer } from 'three/webgpu';
import { builtinAOContext, float, mix, mrt, normalView, pass, screenUV, uniform } from 'three/tsl';
import { ssao } from 'three/addons/tsl/display/SSAONode.js';

const AO_LAYER = 3; // Scene-owned; the kit's cached shadows use layers 30 and 31.
export const INTERIOR_AO_STRENGTH = .7;
export const interiorAoEnabled = (tier: string, backend: string): boolean => backend === 'webgpu' && ['economy', 'balanced', 'high'].includes(tier);
export function interiorAoBlend(previous: number, cameraWeight: number, delta: number): number {
  if (cameraWeight <= .001) return 0; // Exterior keeps the original single render path.
  const target = Math.min(1, cameraWeight / .35);
  return previous + (target - previous) * (1 - Math.exp(-Math.max(0, Math.min(.1, delta)) * 7));
}

/** Add only a dedicated prepass bit; restoring it must not overwrite live shadow-cache bits. */
export function markInteriorOccluders(roots: readonly Object3D[]) {
  const marked = new Map<Object3D, boolean>();
  for (const root of roots) root.traverse(node => {
    if (!(node as Mesh).isMesh || marked.has(node)) return;
    marked.set(node, node.layers.isEnabled(AO_LAYER)); node.layers.enable(AO_LAYER);
  });
  return () => { for (const [node, had] of marked) if (!had) node.layers.disable(AO_LAYER); marked.clear(); };
}

/** SSAO is material indirect occlusion, never a multiplication over direct sun or final colour. */
export function buildInteriorAo(renderer: WebGPURenderer, scene: Scene, camera: Camera, interiorWeight: Node<'float'>, roots: readonly Object3D[] = [], tier = 'high') {
  const restoreLayers = markInteriorOccluders(roots);
  const owned: { dispose(): void }[] = [];
  try {
  const layers = new Layers(); layers.set(AO_LAYER);
  // Three keys render lists by scene + camera. The filtered nested pass must not
  // truncate the main camera's list while its material AO context is evaluated.
  const preCamera = new (camera.constructor as new () => Camera)().copy(camera, false);
  preCamera.matrixAutoUpdate = false; preCamera.matrixWorldAutoUpdate = false;
  const prePass = pass(scene, preCamera, { samples: 0 });
  owned.push(prePass);
  prePass.transparent = false; prePass.setLayers(layers);
  prePass.setMRT(mrt({ output: normalView }));
  const ao = ssao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera);
  owned.push(ao);
  ao.resolutionScale = .5; ao.radius.value = .3; ao.samples.value = tier === 'economy' ? 8 : 16; ao.intensity.value = 2;
  ao.blurEnabled = true; ao.blurSharpness.value = 3;
  const strength = uniform(INTERIOR_AO_STRENGTH);
  const maskedAo = mix(float(1), ao.getTextureNode().sample(screenUV).r, interiorWeight.clamp().mul(strength));
  const scenePass = pass(scene, camera, { samples: renderer.samples });
  owned.push(scenePass);
  scenePass.contextNode = builtinAOContext(maskedAo);
  const pipeline = new RenderPipeline(renderer, scenePass);
  owned.push(pipeline);
  let disposed = false, savedRenderer: Parameters<typeof RendererUtils.saveRendererState>[1], savedScene: Parameters<typeof RendererUtils.saveSceneState>[1];
  return {
    pipeline, prePass, scenePass, ao, maskedAo, strength,
    render() {
      if (disposed) return;
      camera.updateWorldMatrix(true, false);
      preCamera.copy(camera, false);
      // Keep the copied world transform even if the main camera has a parent.
      preCamera.matrixAutoUpdate = false; preCamera.matrixWorldAutoUpdate = false;
      savedRenderer = RendererUtils.saveRendererState(renderer, savedRenderer);
      savedScene = RendererUtils.saveSceneState(scene, savedScene);
      const cameraLayers = camera.layers.mask, contextNode = renderer.contextNode, xrEnabled = renderer.xr.enabled, matrixWorldAutoUpdate = scene.matrixWorldAutoUpdate;
      try { pipeline.render(); }
      catch (error) {
        RendererUtils.restoreRendererState(renderer, savedRenderer); RendererUtils.restoreSceneState(scene, savedScene);
        camera.layers.mask = cameraLayers; renderer.contextNode = contextNode; renderer.xr.enabled = xrEnabled; scene.matrixWorldAutoUpdate = matrixWorldAutoUpdate;
        throw error;
      }
    },
    dispose() { if (disposed) return; disposed = true; pipeline.dispose(); scenePass.dispose(); ao.dispose(); prePass.dispose(); restoreLayers(); },
  };
  } catch (error) {
    for (const resource of owned.reverse()) resource.dispose();
    restoreLayers(); throw error;
  }
}
