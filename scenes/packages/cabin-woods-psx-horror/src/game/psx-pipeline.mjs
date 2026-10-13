import {RenderPipeline} from 'three/webgpu';
import {pass,renderOutput,screenCoordinate,vec4} from 'three/tsl';

/** Optional scene presentation. Authored textures and neutral inspection stay unchanged. */
export function createPsxPipeline(renderer,scene,camera){
 const scenePass=pass(scene,camera),display=renderOutput(scenePass);
 const x=screenCoordinate.x.mod(2),y=screenCoordinate.y.mod(2);
 const dither=x.mul(2).add(y.mul(3)).mod(4).div(4).sub(.375);
 const rgb=display.rgb.mul(31).add(dither).add(.5).floor().div(31).clamp(0,1);
 const pipeline=new RenderPipeline(renderer,vec4(rgb,display.a));
 pipeline.outputColorTransform=false;
 return {render(){pipeline.render();},dispose(){pipeline.dispose();scenePass.dispose();}};
}
