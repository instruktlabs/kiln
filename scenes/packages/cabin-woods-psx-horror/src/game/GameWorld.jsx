import React,{useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {createGameState,act,tick,RULES} from './state.mjs';
import {createWorldModels} from './world-models.mjs';
import {resolvePlayer,crossesBoardedOpening} from './collision.mjs';
import {beginAttack,advanceAttack,canChopAt} from './action-timing.mjs';
import {createEffects} from './effects.mjs';
import {createPsxPipeline} from './psx-pipeline.mjs';
import {pickInteractionTarget} from './interaction-target.mjs';
import {createRaycastIndex} from './raycast-index.mjs';
import {createSimulationFrame} from './simulation-frame.mjs';
import {START,REVIEW_VIEWS,reviewViewPose} from './layout.mjs';
import {installDemoControls} from './demo-controller.mjs';
import {installFrameProfile} from './frame-profile.mjs';
import {beginReload,advanceReload} from './reload-demo.mjs';
import {createFrameRecorder} from './frame-recorder.mjs';
import {applyBenchmarkPreset,buildBenchmarkInventory} from './benchmark-scene.mjs';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {OVERVIEW_CAMERA,applyOverviewCamera} from './view-camera.mjs';
import {resolveAssemblyHit} from './assembly-batching.mjs';

const visible=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};
export function GameWorld({collection,controls,lighting,psx,cameraMode='caretaker',playEntry=0,optimized=true,vegetationStrategy='family-frustum',benchmark=false,benchmarkPreset=null,reviewViews=REVIEW_VIEWS,onInventory,onHud,onProof}){
 const {camera,gl,scene,size}=useThree();
 const models=useMemo(()=>createWorldModels(collection,{}, {optimized,vegetationStrategy}),[collection,optimized,vegetationStrategy]);
 const queryIndex=useMemo(()=>createRaycastIndex(models.root,{ignore:node=>/^Scene_(player|fpsArms|effects)/.test(node.name),dynamic:node=>node.name==='SceneAssemblyBatches'||node.name==='SceneOptimized_Vegetation'||/^Scene_(pickup-|spider|nightman)/.test(node.name)||models.instances.some(i=>i.root===node&&i.animations.length>0)}),[models]);
 const aimCenter=useMemo(()=>new THREE.Vector2(0,0),[]);
 const simulationFrame=useMemo(()=>createSimulationFrame(),[]);
 const effects=useMemo(()=>createEffects(models),[models]);
 const post=useMemo(()=>createPsxPipeline(gl,scene,camera),[gl,scene,camera]);
 const profile=useMemo(()=>installFrameProfile(gl.info),[gl]);
 const recorder=useMemo(()=>createFrameRecorder(benchmark),[benchmark]);
 const {state,preset}=useMemo(()=>{const state=createGameState(models.layout),preset=applyBenchmarkPreset(state,benchmarkPreset??'axeFlash',{enabled:benchmark});return {state,preset};},[models,benchmark,benchmarkPreset]);
 const manualEntryState=useRef(null);
 useEffect(()=>{if(playEntry>0){if(manualEntryState.current!==state){state.weapon='unarmed';manualEntryState.current=state;}if(state.battery>0)state.flashlight=true;}},[playEntry,state]);
 const inventorySent=useRef(false);
 const player=useRef({position:[...START],heading:Math.PI,pitch:0,swing:null,reload:null,reviewTravel:0});
 const input=useRef(null),orbit=useRef(null);
 const ray=useMemo(()=>new THREE.Raycaster(),[]),sun=useRef(),flashlight=useRef(),flashTarget=useMemo(()=>new THREE.Object3D(),[]),fire=useRef();
 const timer=useRef(0),frames=useRef(0),lastEvent=useRef(0);
 useEffect(()=>()=>{effects.dispose();models.dispose();},[models,effects]);
 useEffect(()=>()=>post.dispose(),[post]);
 useEffect(()=>()=>profile.dispose(),[profile]);
 useEffect(()=>{const owned=new OrbitControls(camera,gl.domElement);owned.target.fromArray(OVERVIEW_CAMERA.target);owned.minDistance=8;owned.maxDistance=95;owned.minPolarAngle=.12;owned.maxPolarAngle=Math.PI*.47;owned.enableDamping=false;owned.autoRotate=false;owned.enablePan=false;owned.enabled=false;orbit.current=owned;return()=>{orbit.current=null;owned.dispose();};},[camera,gl]);
 useEffect(()=>{if(cameraMode==='caretaker'){camera.fov=70;camera.near=.025;camera.far=lighting==='game'?76:125;camera.zoom=1;camera.updateProjectionMatrix();}else {input.current?.pause();applyOverviewCamera(camera,lighting);orbit.current?.target.fromArray(OVERVIEW_CAMERA.target);}if(orbit.current)orbit.current.enabled=cameraMode==='orbit';},[camera,cameraMode,lighting]);
 useEffect(()=>{scene.background=new THREE.Color(lighting==='neutral'?'#808e83':'#121d19');scene.fog=new THREE.Fog(lighting==='neutral'?'#808e83':'#121d19',lighting==='neutral'?50:17,lighting==='neutral'?125:76);return()=>{scene.fog=null;};},[lighting,scene]);
 useEffect(()=>{
  const owned=installDemoControls({element:gl.domElement,document,window,controls,getPlayer:()=>player.current,canPlay:()=>controls.cameraMode==='caretaker'}),request=()=>owned.requestPlay();input.current=owned;if(typeof owned.requestPlay==='function')controls.requestPlay=request;controls.pause=owned.pause;controls.getRequestStatus=owned.getRequestStatus;controls.requestKeyboardPlay=owned.requestKeyboardPlay;
  return()=>{owned.dispose();if(input.current===owned)input.current=null;if(controls.requestPlay===request)delete controls.requestPlay;if(controls.pause===owned.pause)delete controls.pause;if(controls.getRequestStatus===owned.getRequestStatus)delete controls.getRequestStatus;if(controls.requestKeyboardPlay===owned.requestKeyboardPlay)delete controls.requestKeyboardPlay;};
 },[gl,controls]);
 const target=()=>{
  if(cameraMode!=='caretaker')return null;
  ray.setFromCamera(aimCenter,camera);ray.far=state.weapon==='shotgun'?22:RULES.reach+.35;
  return pickInteractionTarget(ray,models.root,models.interactionVolumes,queryIndex.intersect);
 };
 const use=(aim,alternate)=>{if(!aim||aim.distance>RULES.reach+.35){state.message='Look at something within reach.';return;}const action={window:'board',door:'door',chop:'chop',saw:'saw',storage:alternate?'withdraw':'store',fire:'fire',tv:'tv'}[aim.kind];if(action==='door'&&!models.canToggleDoor(aim.id,player.current.position,!state.doors.find(d=>d.id===aim.id)?.open)){state.message='Step clear of the door swing.';return;}if(action==='chop'){const p=player.current;if(p.swing)return;if(!canChopAt(p.position,models.byId.get('chop')?.root.position.toArray())){state.message='Stand closer to the chopping block.';return;}if(state.weapon!=='axe'){state.message='Equip the axe to split wood.';return;}if(!state.inventory.logs){state.message='Bring a log bundle to the block.';return;}p.swing=beginAttack(state,{duration:models.byId.get('fpsArms')?.animations.find(c=>c.name==='AxeUse')?.duration??1.4,action:'chop',targetId:aim.id});return;}if(action)act(state,action,{position:player.current.position,targetId:aim.id,kind:alternate??undefined});};
 useFrame((_,rawDt)=>{
 const frameStart=benchmark?performance.now():0;
 const simulation=simulationFrame(rawDt),dt=simulation.elapsed,p=player.current;frames.current++;const keys=controls.keys;
  let walking=false;const colliders=models.colliders(),collisionEnd=benchmark?performance.now():0;
  if(controls.active)for(let step=0;step<simulation.count&&state.health>0;step++){
   const dt=simulation.step;
   const turn=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);p.heading+=turn*dt*1.5;
   if(keys.has('PageUp'))p.pitch=Math.min(1.2,p.pitch+dt);if(keys.has('PageDown'))p.pitch=Math.max(-1.35,p.pitch-dt);
   const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),norm=Math.hypot(forward,side)||1,speed=keys.has('ShiftLeft')?RULES.runSpeed:RULES.walkSpeed;
   const reviewStep=Math.sign(p.reviewTravel)*Math.min(Math.abs(p.reviewTravel),RULES.walkSpeed*dt);p.reviewTravel-=reviewStep;
   const delta=[(Math.cos(p.heading)*forward-Math.sin(p.heading)*side)*speed*dt/norm+Math.cos(p.heading)*reviewStep,0,(Math.sin(p.heading)*forward+Math.cos(p.heading)*side)*speed*dt/norm+Math.sin(p.heading)*reviewStep];walking=!!(forward||side||reviewStep);p.position=resolvePlayer(p.position,delta,colliders);p.position[0]=Math.max(-65,Math.min(80,p.position[0]));p.position[2]=Math.max(-65,Math.min(65,p.position[2]));
   tick(state,dt,p.position,{attackContact:input=>models.attackContact(input,state),move:(position,delta,radius,height)=>resolvePlayer(position,delta,colliders,{radius,height}),windowTarget:(from,to)=>{
    const b=models.layout.cabinBounds;if(to[0]<b.minX||to[0]>b.maxX||to[2]<b.minZ||to[2]>b.maxZ)return null;
    return state.windows.filter(w=>w.boards.some(h=>h>0)).map(w=>{const instance=models.byId.get(w.id),normal=new THREE.Vector3(1,0,0).applyQuaternion(instance.root.quaternion);return {id:w.id,position:w.position,approach:[w.position[0]+normal.x*1.3,0,w.position[2]+normal.z*1.3]};}).sort((a,b)=>Math.hypot(a.approach[0]-from[0],a.approach[2]-from[2])-Math.hypot(b.approach[0]-from[0],b.approach[2]-from[2]))[0]??null;
   },canReach:(from,to)=>{
    if(crossesBoardedOpening(from,to,state.windows.map(w=>({...w,halfWidth:.68,normal:new THREE.Vector3(1,0,0).applyQuaternion(models.byId.get(w.id).root.quaternion).toArray()}))))return false;
    const a=new THREE.Vector3(from[0],from[1]+1,from[2]),b=new THREE.Vector3(to[0],to[1]+1,to[2]),direction=b.clone().sub(a),distance=direction.length();ray.set(a,direction.normalize());ray.far=distance;
    return !queryIndex.intersect(ray,node=>node.name==='Scene_cabin'||node.name==='SceneAssemblyBatches'||['door','window'].includes(node.userData.interaction?.kind)).some(nativeHit=>{const hit=resolveAssemblyHit(nativeHit);if(!hit||!visible(hit.object))return false;for(let n=hit.object;n;n=n.parent)if(n.name==='Scene_cabin'||['door','window'].includes(n.userData.interaction?.kind))return true;return false;});
   }});
   if(p.swing){advanceAttack(p.swing,state,dt,()=>{const aim=target();return {position:p.position,targetId:aim?.id,near:!!aim&&(p.swing.action==='chop'?canChopAt(p.position,models.byId.get('chop')?.root.position.toArray()):aim.distance<RULES.reach+.35)};});if(p.swing.done)p.swing=null;}
  }
  for(const command of controls.commands.splice(0)){
   if(command==='begin'){controls.active=cameraMode==='caretaker';continue;}
   if(command==='pause'){input.current?.pause();break;}
   if(command==='attack'&&controls.active&&!p.swing&&!p.reload){const clip=models.byId.get('fpsArms')?.animations.find(c=>c.name===(state.weapon==='axe'?'AxeUse':'ShotgunFire'));p.swing=beginAttack(state,{duration:clip?.duration??(state.weapon==='axe'?1.4:.32),impactPhase:.58});if(p.swing?.weapon==='shotgun')advanceAttack(p.swing,state,0,()=>({position:p.position,targetId:target()?.id}));}
   else if(command==='use')use(target());
   else if(command.startsWith('take-'))use(target(),command.slice(5));
   else if(['unarmed','axe','shotgun'].includes(command)){if(!p.swing&&!p.reload)act(state,'equip',{kind:command});}
   else if(command==='reload'&&!p.swing&&!p.reload)p.reload=beginReload(state,{duration:models.byId.get('fpsArms')?.animations.find(c=>c.name==='Reload')?.duration??2.4});
   else if(command==='flashlight'){if(!p.reload)act(state,command);}
   else if(command==='battery'||command==='encounter')act(state,command);
   else if(command==='breach'){const aim=target();if(aim?.kind==='window'&&aim.distance<2.4)act(state,'breach',{targetId:aim.id});}
   else if(command==='look-down')p.pitch=-1.15;
   else if(command==='look-level')p.pitch=0;
   else if(command==='step-forward'&&controls.active)p.reviewTravel=1;
   else if(command==='step-back'&&controls.active)p.reviewTravel=-1;
   else if(command==='turn-left')p.heading-=Math.PI/4;
   else if(command==='turn-right')p.heading+=Math.PI/4;
   else if(command.startsWith('view:')){const view=reviewViews[command.slice(5)];if(view){p.position=resolvePlayer(view.position,[0,0,0],colliders);Object.assign(p,reviewViewPose(view,p.position));p.reviewTravel=0;p.swing=null;p.reload=null;}}
  }
  if(preset.playerPitch!==undefined)p.pitch=preset.playerPitch;
  if(p.reload){advanceReload(p.reload,state,dt);if(p.reload.done)p.reload=null;}
  const simulationEnd=benchmark?performance.now():0;
  models.update(state,controls.active?dt:0,{...p,walking,running:walking&&keys.has('ShiftLeft'),camera,firstPerson:cameraMode==='caretaker'});
  if(cameraMode==='orbit')orbit.current?.update();
  models.cullVegetation(camera);
  if(benchmark&&!inventorySent.current){onInventory?.(buildBenchmarkInventory(models,collection));inventorySent.current=true;}
  const modelsEnd=benchmark?performance.now():0;
  effects.update(state,controls.active?dt:0,camera,target);
  if(flashlight.current){const beam=models.flashlightBeam();if(beam){flashlight.current.position.copy(beam.position);flashTarget.position.copy(beam.position).addScaledVector(beam.direction,10);flashlight.current.intensity=beam.on?80*state.battery:0;}else flashlight.current.intensity=0;}
  if(fire.current){fire.current.position.copy(effects.firePosition);fire.current.intensity=effects.fireLightIntensity;}
  const effectsEnd=benchmark?performance.now():0;
  profile.begin();if(psx&&lighting==='game')post.render();else gl.render(scene,camera);if(benchmark){const renderEnd=performance.now();recorder.record(frames.current,{frameTimestamp:frameStart,collidersMs:collisionEnd-frameStart,simulationMs:simulationEnd-collisionEnd,modelsUpdateMs:modelsEnd-simulationEnd,effectsAndAimMs:effectsEnd-modelsEnd,renderSubmitMs:renderEnd-effectsEnd});}timer.current+=dt;if(timer.current>.1){timer.current=0;const aim=target();onHud({health:state.health,inventory:{...state.inventory},storage:{...state.storage},weapon:state.weapon,loadedShells:state.loadedShells,reloading:!!p.reload,fire:Math.ceil(state.fire),battery:Math.round(state.battery*100),message:state.message,target:aim&&aim.distance<2.4?{...aim,point:undefined}:null,active:controls.active,pointerLockError:controls.getRequestStatus?.().lastError??null,keyboardMode:controls.getRequestStatus?.().keyboardMode??false,nightman:state.nightman.mode});const buffer=gl.getDrawingBufferSize(new THREE.Vector2());onProof({schemaVersion:1,candidateId:collection.manifest.release??'review-01',manifestSha256:collection.manifestSha256,optimized,vegetationStrategy:optimized?vegetationStrategy:'source',mode:'scene',cameraMode,orbitEnabled:orbit.current?.enabled===true,lighting,psx,controlsActive:controls.active,frameSerial:frames.current,isWebGPUBackend:gl.backend.isWebGPUBackend,adapterInfo:gl.backend.device.adapterInfo?Object.fromEntries(['vendor','architecture','device','description','isFallbackAdapter'].map(k=>[k,gl.backend.device.adapterInfo[k]])):null,viewport:{cssWidth:size.width,cssHeight:size.height,dpr:gl.getPixelRatio(),bufferWidth:buffer.x,bufferHeight:buffer.y},cameraPose:{position:camera.position.toArray(),heading:cameraMode==='caretaker'?p.heading:Math.atan2(camera.getWorldDirection(new THREE.Vector3()).z,camera.getWorldDirection(new THREE.Vector3()).x),pitch:cameraMode==='caretaker'?p.pitch:Math.asin(camera.getWorldDirection(new THREE.Vector3()).y),quaternion:camera.quaternion.toArray(),fov:camera.fov,near:camera.near,far:camera.far},...(benchmark?{benchmarkPreset:preset.preset,fireFuelSeconds:state.fire,fireLightIntensity:effects.fireLightIntensity,weapon:state.weapon,flashlight:state.flashlight,pointerLockStatus:controls.getRequestStatus?.()??null,frameSamples:recorder.snapshot()}:{}),backend:gl.backend.isWebGPUBackend?'WebGPUBackend':'unsupported',frames:frames.current,draws:gl.info.render.drawCalls,triangles:gl.info.render.triangles,renderPasses:gl.info.render.frameCalls,drawsByAsset:profile.snapshot(),position:p.position.map(v=>Number(v.toFixed(3))),pitch:Number(p.pitch.toFixed(3)),buffer:[buffer.x,buffer.y],camera:camera.position.toArray(),fov:camera.fov,colliderCount:colliders.length,events:state.events.slice(-10),creature:{mode:state.nightman.mode,position:state.nightman.position}});}
 },1);
 return <><primitive object={models.root}/><hemisphereLight args={[lighting==='neutral'?'#e5efdf':'#7d998c','#222f24',lighting==='neutral'?2.2:.85]}/><directionalLight ref={sun} position={[-8,14,10]} color={lighting==='neutral'?'#fff5dc':'#94b6c2'} intensity={lighting==='neutral'?2:1.7}/><pointLight position={[5.25,2.25,.1]} color="#ffcf91" intensity={lighting==='game'&&cameraMode!=='caretaker'?14:0} distance={8} decay={2}/><pointLight ref={fire} position={[.2,.7,-3.15]} color="#ffc36d" intensity={4} distance={8} decay={2}/><spotLight ref={flashlight} target={flashTarget} color="#e8e3c4" intensity={0} distance={22} angle={.42} penumbra={.4} decay={2} castShadow={false}/><primitive object={flashTarget}/></>;
}
