import {namedMeshParts,validateActors} from './bake-intake.mjs';
export function createPoseSampler(T,root,clip,actors){
 validateActors(actors);if(!clip||clip.duration<=0)throw Error('Positive clip required');
 const phases=[...new Set(actors.map(a=>a.phase??0))];if(phases.length>64)throw Error('More than 64 exact phase groups');
 const groups=phases.map(phase=>{const clone=root.clone(true),parts=namedMeshParts(clone).map(p=>p.node),mixer=new T.AnimationMixer(clone),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();return {phase,clone,parts,mixer,action};});
 const actorGroups=actors.map(a=>phases.indexOf(a.phase??0));
 return {groupCount:groups.length,poseForActor(i){return groups[actorGroups[i]].parts;},update(time,loop=true){for(const g of groups){const t=Math.max(0,time+g.phase);g.action.paused=false;g.mixer.setTime(loop?t%clip.duration:Math.min(clip.duration,t));g.clone.updateMatrixWorld(true);}},dispose(){for(const g of groups){g.mixer.stopAllAction();g.mixer.uncacheRoot(g.clone);}}};
}
