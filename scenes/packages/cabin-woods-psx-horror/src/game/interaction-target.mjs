import * as THREE from 'three/webgpu';
import {resolveAssemblyHit} from './assembly-batching.mjs';
import {resolveFurnishingHit} from './furnishing-merge.mjs';
const ignored=new Set(['Scene_player','Scene_fpsArms','Scene_player-axe','Scene_player-shotgun','Scene_effects']);
// Forest cutout cards are decorative and permeable in this game. Trunks and
// solid props still occlude; this is not a renderer or universal material rule.
export function blocksInteraction(hit){const material=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;return !material||material.alphaTest<=0;}
function inspect(node,root){let interaction=null;for(let n=node;n&&n!==root;n=n.parent){if(!n.visible||ignored.has(n.name))return {skip:true};if(n.userData.interaction)interaction=n.userData.interaction;}return {interaction};}
export function pickInteractionTarget(ray,root,volumes=[],intersect=null){
 let surface=null;
 for(const nativeHit of intersect?intersect(ray):ray.intersectObjects(root.children,true)){const hit=resolveFurnishingHit(resolveAssemblyHit(nativeHit));if(!hit)continue;const info=inspect(hit.object,root);if(info.skip||!blocksInteraction(hit))continue;surface={...hit,interaction:info.interaction};break;}
 let best=surface?.interaction?{...surface.interaction,distance:surface.distance,point:surface.point}:null;
 for(const volume of volumes){if(!volume.root.visible)continue;const point=ray.ray.intersectBox(volume.bounds,new THREE.Vector3());if(!point)continue;const distance=point.distanceTo(ray.ray.origin);if(distance>ray.far||distance<ray.near||distance>(surface?.distance??Infinity)+1e-5||distance>(best?.distance??Infinity))continue;best={...volume.root.userData.interaction,distance,point};}
 return best;
}
