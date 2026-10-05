const battlefield={city:false,target:[0,5,160],halfExtent:235};
export function shadowFocus(camera,target){
 if(![camera,target].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))throw Error('Finite shadow camera and target required');
 const city=target[2]>=335&&Math.hypot(...camera.map((v,i)=>v-target[i]))<=220;
 return city?{city:true,target:[target[0],target[1],target[2]],halfExtent:130}:{...battlefield,target:[...battlefield.target]};
}
export function createCityShadowFocus({light,casters,enabled}){
 let state={...battlefield,target:[...battlefield.target]};
 function apply(next){
  const changed=state.city!==next.city||state.target.some((v,i)=>v!==next.target[i]);
  if(changed){light.target.position.set(...next.target);light.position.set(next.target[0]-240,next.target[1]+395,next.target[2]-370);Object.assign(light.shadow.camera,{left:-next.halfExtent,right:next.halfExtent,top:next.halfExtent,bottom:-next.halfExtent});light.shadow.camera.updateProjectionMatrix();}
  for(const node of casters)node.castShadow=enabled&&next.city;state=next;
 }
 return {update(camera,target){apply(enabled?shadowFocus(camera,target):{...battlefield,target:[...battlefield.target]});},warmCityCasters(){for(const node of casters)node.castShadow=Boolean(enabled);},stats:()=>({...state,target:[...state.target],enabled:Boolean(enabled),casters:enabled&&state.city?casters.length:0})};
}
