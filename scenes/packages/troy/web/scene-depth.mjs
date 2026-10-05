// Scene-only renderer comparison. Read the effective flag after backend init:
// WebGL2 may reject reversed depth when EXT_clip_control is unavailable.
export const DEFAULT_SCENE_DEPTH='reversed';
export function depthRendererOptions(mode=DEFAULT_SCENE_DEPTH){
 if(!['standard','reversed','logarithmic'].includes(mode))throw Error('Invalid scene depth mode');
 return {reversedDepthBuffer:mode==='reversed',logarithmicDepthBuffer:mode==='logarithmic'};
}
export function configureDepthCamera(camera,renderer){
 camera.coordinateSystem=renderer.coordinateSystem;
 // three r186 exposes a readonly getter; Renderer uses this same backing flag.
 // Set it before the scene's pre-render frustum/projection consumers run.
 camera._reversedDepth=renderer.reversedDepthBuffer===true;
 camera.updateProjectionMatrix();
}
