import {compileSceneVariants,withVisibleSceneVariants} from './scene-variant-warmup.mjs';
// Precompilation skips shadow rendering in this pinned Three build. Draw those
// variants only to an owned startup target while the live loop is stopped.
export async function warmScenePasses({T,renderer,scene,camera,root=scene,precompile=true,admitVariants=true}){
 if(typeof admitVariants!=='boolean'||(!admitVariants&&precompile)||typeof precompile!=='boolean'||typeof T?.RenderTarget!=='function'||!scene?.isScene||!camera?.isCamera||['compileAsync','render','getRenderTarget','setRenderTarget','getActiveCubeFace','getActiveMipmapLevel'].some(k=>typeof renderer?.[k]!=='function'))throw Error('Invalid scene pass warmup');
 let belongs=false;scene.traverse(n=>{if(n===root)belongs=true;});if(!belongs)throw Error('Invalid scene pass warmup root');
 const prior={target:renderer.getRenderTarget(),cube:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel()},target=new T.RenderTarget(2,2,{type:T.HalfFloatType,format:T.RGBAFormat,colorSpace:T.LinearSRGBColorSpace,samples:renderer.samples,depthBuffer:renderer.depth,stencilBuffer:renderer.stencil,generateMipmaps:false});
 let gpuCompleted=false;
 try{const draw=async()=>{renderer.setRenderTarget(target);renderer.render(scene,camera);const queue=renderer.backend?.device?.queue;if(queue?.onSubmittedWorkDone){await queue.onSubmittedWorkDone();gpuCompleted=true;}};const compiled=precompile?await compileSceneVariants({renderer,scene:root,camera,targetScene:scene,renderPass:draw}):admitVariants?await withVisibleSceneVariants({scene:root,run:draw}):(await draw(),{});return {...compiled,status:'warmed',precompiled:precompile,variantsAdmitted:admitVariants,offscreen:[2,2],gpuCompleted,root:root.name||'scene'};}
 finally{renderer.setRenderTarget(prior.target,prior.cube,prior.mip);target.dispose();scene.traverse(n=>{if(n.isLight&&n.shadow)n.shadow.needsUpdate=true;});}
}
