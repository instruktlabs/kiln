import * as THREE from 'three/webgpu';
export function playerPoseName({weapon,walking=false,reloading=false,swingWeapon=null}){
 if(reloading)return 'Reload';if(swingWeapon==='axe')return 'AxeUse';if(swingWeapon==='shotgun')return 'ShotgunFire';
 if(weapon==='unarmed')return walking?'Walk':'Idle';
 return walking?(weapon==='axe'?'WalkAxe':'WalkShotgun'):(weapon==='axe'?'AxeHold':'GripAim');
}
/** Play authored poses with the authored left-hand flashlight layer. */
export function setPlayerPose(instance,name,{flashlight=false,once=false,restart=false}={}){
 const base=instance.animations.find(c=>c.name===name);if(!base)return false;
 const left=flashlight&&instance.animations.find(c=>c.name==='FlashlightHold'),key=name+(left?':flashlight':'');
 if(instance.poseClipKey===key&&!restart)return true;
 instance.poseClips??=new Map();let clip=base;
 if(left){if(!instance.poseClips.has(key)){const names=new Set(left.tracks.map(t=>t.name));instance.poseClips.set(key,new THREE.AnimationClip(key,base.duration,base.tracks.filter(t=>!names.has(t.name))));}clip=instance.poseClips.get(key);}
 instance.mixer.stopAllAction();const action=instance.mixer.clipAction(clip);action.reset().setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);action.clampWhenFinished=once;action.play();
 if(left){const layer=instance.mixer.clipAction(left);layer.reset().setLoop(THREE.LoopOnce,1);layer.clampWhenFinished=true;layer.play();}
 instance.poseClipKey=key;return true;
}
