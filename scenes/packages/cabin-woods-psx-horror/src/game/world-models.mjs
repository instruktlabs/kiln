import * as THREE from 'three/webgpu';
import {mix,texture,uv} from 'three/tsl';
import {createRoleLookup,setClip} from './assets.mjs';
import {SCENE_LAYOUT,STATIONS} from './layout.mjs';
import {solveLeg,stepTarget} from './leg-ik.mjs';
import {mergeStaticAsset} from './static-merge.mjs';
import {PLAYER} from './collision.mjs';
import {createDoorCollisionShape,createDoorClearanceQuery} from './door-collision.mjs';
import {CABIN_BOUNDS,furnitureDefinitions,footprintTransform,wallDressingDefinitions} from './cabin-placement.mjs';
import {nightmanPlayerContact,nightmanBoardContact} from './nightman-contact.mjs';
import {applyStableDemoCamera} from './demo-controller.mjs';
import {optimizeStaticAsset,batchStaticVegetation} from './scene-optimization.mjs';
import {staticInstanceFootprint} from './convex-footprint.mjs';
import {setPlayerPose,playerPoseName} from './player-pose.mjs';
import {createTerrainPathMask} from './terrain-path.mjs';
import {attachAtSocket} from './tool-attachment.mjs';
import {createSkinBoundsUpdater} from './skin-bounds.mjs';
import {batchRigidAssemblies} from './assembly-batching.mjs';
import {mergeStaticFurnishings} from './furnishing-merge.mjs';
import {createSourceArchive} from './source-archive.mjs';
import {createFirstPersonBodyPlacement} from './first-person-body.mjs';

const vector=a=>new THREE.Vector3(...a);
const materialList=root=>{const out=new Set();root.traverse(n=>{for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[])out.add(m);});return out;};

/** Saved assets remain immutable. This graph owns only consuming-scene instances. */
export function resolvedSceneLayout(collection){
 const cabin=collection.manifest.interfaces?.cabin,sockets=cabin?.sockets??[];
 if(!sockets.length)return SCENE_LAYOUT;
 const windows=sockets.filter(s=>/^window_.*_mount$/.test(s.name)).map(s=>({id:s.name,position:s.translation,quaternion:s.rotation}));
 const doors=sockets.filter(s=>/_door_mount$/.test(s.name)).map(s=>({id:s.name,position:s.translation,quaternion:s.rotation,key:s.assetKey??s.key??(['bedroom_door_mount','utility_door_mount'].includes(s.name)?'interiorDoor':'door'),openAngleDegrees:s.openAngleDegrees??-95}));
 return {...SCENE_LAYOUT,cabinBounds:cabin?.nominalFootprint??CABIN_BOUNDS,windows,doors,pickups:SCENE_LAYOUT.pickups.filter(p=>collection.masters.has({shells:'shells',logs:'woodBundle',batteries:'batteries'}[p.kind]))};
}
export function createWorldModels(collection,bindings={},options={}){
 const roleIndexes=new WeakMap(),findRole=(root,name)=>{let lookup=roleIndexes.get(root);if(!lookup){lookup=createRoleLookup(root);roleIndexes.set(root,lookup);}return lookup(name);};
 const mixerTimes=new WeakMap(),setTime=(instance,time)=>{const key=instance.poseClipKey??instance.clipName,previous=mixerTimes.get(instance);if(previous&&previous.time===time&&previous.key===key&&previous.pose===instance.poseKey&&previous.mixerTime===instance.mixer.time)return;instance.mixer.setTime(time);const record=previous??{};record.time=time;record.key=key;record.pose=instance.poseKey;record.mixerTime=instance.mixer.time;if(!previous)mixerTimes.set(instance,record);};
 const emissiveStates=new WeakMap(),setEmissive=(node,color,intensity)=>{if(!node)return;let previous=emissiveStates.get(node);if(!previous){previous={materials:materialList(node)};emissiveStates.set(node,previous);}if(previous.color===color&&previous.intensity===intensity)return;for(const material of previous.materials){material.emissive?.set(color);material.emissiveIntensity=intensity;}previous.color=color;previous.intensity=intensity;};
 const eyePosition=new THREE.Vector3(),eyeQuaternion=new THREE.Quaternion(),viewQuaternion=new THREE.Quaternion(),pitchQuaternion=new THREE.Quaternion(),upAxis=new THREE.Vector3(0,1,0),forwardAxis=new THREE.Vector3(0,0,1),beamQuaternion=new THREE.Quaternion(),beam={on:false,position:new THREE.Vector3(),direction:new THREE.Vector3()};

 const layout=resolvedSceneLayout(collection),cabinContract=collection.manifest.interfaces?.cabin;
 bindings={...bindings,spider:collection.manifest.interfaces?.forest?.spider??bindings.spider,window:{boards:cabinContract?.window?.boardNodes?.map(n=>[n])},door:{hinge:cabinContract?.door?.hingeNode}};
 const root=new THREE.Group(),instances=[],byId=new Map(),ownedGeometry=[],ownedMaterials=[],ownedTextures=[],merges=[],background=[],backgroundRoots=new Set(),optimized=options.optimized!==false;
 const assemblyFamilies=new Set(['windowAssembly','door','interiorDoor']),assemblyInstances=[];
 const staticFurnitureFamilies=['bed','table','bench','deerMount','picture','diningTable','diningChair','kitchenWorktop','incomingLogPile','mapCoatHooks','toolRack','wallShelf','clock','torchBracket','tabletopDressing','kitchenDressing','hearth','choppingBlock'],furnitureInstances=[];
 const preserved=key=>key==='windowAssembly'?cabinContract?.window?.boardNodes??[]:key==='woodStorage'?Array.from({length:9},(_,i)=>`StoredLog_${i}`):key==='plankReserve'?(collection.manifest.interfaces?.plankStack?.layers??[]).flatMap(l=>l.runtimeNodeNames):key==='tv'?['CRT_Screen_Surface']:[];
 const spawn=(key,id,position=[0,0,0],rotationY=0,scale=1,target)=>{
  if(!collection.masters.has(key))return null;
  const isBackground=['pine','birch','bush','rock'].includes(key)&&!target;
  const instance=collection.instantiate(key,{staticPlacement:optimized&&isBackground});instance.assetKey=key;
  if(optimized){if(isBackground){background.push(instance);backgroundRoots.add(instance.root);}else if(assemblyFamilies.has(key))assemblyInstances.push(instance);else if(staticFurnitureFamilies.includes(key))furnitureInstances.push(instance);else if(key==='cabin')merges.push(mergeStaticAsset(instance.root));else merges.push(optimizeStaticAsset(instance.root,{enabled:true,animations:instance.animations,preserveNodes:preserved(key).map(name=>findRole(instance.root,name)).filter(Boolean),cellSize:4}));}
  else if(['cabin','pine','birch','bush','rock','web','stump','hearth','bed','table','bench','deerMount','picture','diningTable','diningChair','kitchenWorktop','incomingLogPile','mapCoatHooks','toolRack','wallShelf'].includes(key)&&instance.animations.length===0)merges.push(mergeStaticAsset(instance.root));
  instance.root.name=`Scene_${id}`;instance.root.position.fromArray(position);instance.root.rotation.y=rotationY;instance.root.scale.setScalar(scale);instance.root.userData.assetKey=key;instance.root.userData.interaction=target??null;root.add(instance.root);instances.push(instance);byId.set(id,instance);return instance;
 };
 spawn('cabin','cabin');
 for(const w of layout.windows){const i=spawn('windowAssembly',w.id,w.position,0,1,{kind:'window',id:w.id,label:'Board or repair window'});if(i&&w.quaternion)i.root.quaternion.fromArray(w.quaternion);}
 for(const d of layout.doors){const i=spawn(d.key??'door',d.id,d.position,0,1,{kind:'door',id:d.id,label:'Open / close door'});if(i&&d.quaternion)i.root.quaternion.fromArray(d.quaternion);}
 const approvedCabin=cabinContract?.nominalFootprint?.maxX===5&&cabinContract?.nominalFootprint?.maxZ===6;
 const furniturePlacements=[];
 if(approvedCabin){
  for(const definition of furnitureDefinitions()){
   const instance=spawn(definition.key,definition.id);if(!instance)throw Error(`Approved cabin requires saved asset: ${definition.key}`);
   const b=new THREE.Box3().setFromObject(instance.root),transform=footprintTransform(definition,{min:b.min.toArray(),max:b.max.toArray()},definition.rotationY);
   instance.root.position.fromArray(transform.position);instance.root.rotation.y=transform.rotationY;instance.root.userData.interaction=definition.interaction;instance.root.userData.solid=definition.solid;instance.root.userData.planId=definition.planId;
   furniturePlacements.push({...definition,...transform});
  }
  for(const definition of wallDressingDefinitions()){
   const instance=spawn(definition.key,definition.id,[0,0,0],definition.rotationY);if(!instance)throw Error(`Approved cabin requires wall dressing: ${definition.key}`);
   const socket=cabinContract.sockets.find(s=>definition.id==='dressing-M1'?s.name==='deer_mount':s.name===`wall_${definition.id.slice(9).toLowerCase()}_mount`);
   const target=definition.mountOverride?.translation??socket?.translation??definition.position;if(socket?.rotation)instance.root.quaternion.fromArray(socket.rotation);
   instance.root.updateMatrixWorld(true);const marker=findRole(instance.root,'wall_mount'),offset=marker?.getWorldPosition(new THREE.Vector3())??new THREE.Vector3();instance.root.position.fromArray(target).sub(offset);
   if(definition.id==='dressing-P1'){instance.root.updateMatrixWorld(true);const pictureBounds=new THREE.Box3().setFromObject(instance.root),windowBounds=new THREE.Box3().setFromObject(byId.get('window_w4_mount').root);instance.root.position.x+=Math.max(0,windowBounds.max.x+.1-pictureBounds.min.x);}
  }
  const stand=byId.get('tvStand');stand.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(stand.root),center=bounds.getCenter(new THREE.Vector3());
  const tv=spawn('tv','tv',[0,0,0],0,1,{kind:'tv',id:'tv',label:'Switch television'});if(!tv)throw Error('Approved cabin requires saved television');
  const tvBounds=new THREE.Box3().setFromObject(tv.root),tvCenter=tvBounds.getCenter(new THREE.Vector3());tv.root.rotation.y=Math.PI;tv.root.position.set(center.x+tvCenter.x,bounds.max.y-tvBounds.min.y,center.z+tvCenter.z);tv.root.userData.solid=true;
  for(const [key,id,position,yaw] of [['wallShelf','kitchen-shelf',[2.12,1.45,4.3],0],['clock','living-clock',[-4.8,1.95,-1.1],0],['torchBracket','workyard-torch',[1.7,1.65,6],-Math.PI/2]]){
   const i=spawn(key,id,[0,0,0],yaw);if(!i)continue;i.root.updateMatrixWorld(true);const marker=findRole(i.root,'wall_mount'),offset=marker?.getWorldPosition(new THREE.Vector3())??new THREE.Vector3();i.root.position.fromArray(position).sub(offset);
  }
  for(const [key,id,parent,yaw,offsetX,offsetZ] of [['tabletopDressing','dining-dressing','dining-table',0,-.12,0],['kitchenDressing','kitchen-dressing','kitchen-worktop',Math.PI/2,0,-.04]]){
   const support=byId.get(parent);support.root.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(support.root),c=b.getCenter(new THREE.Vector3()),i=spawn(key,id,[0,0,0],yaw);if(!i)continue;i.root.updateMatrixWorld(true);const ib=new THREE.Box3().setFromObject(i.root),ic=ib.getCenter(new THREE.Vector3());i.root.position.set(c.x+offsetX-ic.x,b.max.y-ib.min.y,c.z+offsetZ-ic.z);
  }
 }else{
 for(const [key,id,position,rotationY,label] of [
  ['choppingBlock','chop',STATIONS.chop,0,'Split a log into firewood'],['sawingStation','saw',STATIONS.saw,0,'Saw a log into boards'],
  ['woodStorage','storage',STATIONS.storage,Math.PI,'Store wood / take supplies'],['hearth','fire',STATIONS.fire,Math.PI/2,'Add firewood'],['tv','tv',STATIONS.tv,-Math.PI/2,'Switch television'],
  ['deerMount','deer',[.7,2.05,-3.75],Math.PI/2,null],['picture','picture',[1.5,1.55,3.75],-Math.PI/2,null]
 ]){const i=spawn(key,id,position,rotationY,1,label?{kind:id,id,label}:null),socketName={storage:'storage_mount',fire:'hearth_mount',tv:'crt_mount',deer:'deer_mount',picture:'picture_mount'}[id],socket=cabinContract?.sockets.find(s=>s.name===socketName);if(i&&socket){i.root.position.fromArray(socket.translation);i.root.quaternion.fromArray(socket.rotation);}}
 for(const [key,placement] of Object.entries(cabinContract?.furniture?.proposedPlacements??{}))spawn(key,key,placement.translation,placement.rotationYDegrees*Math.PI/180);
 const tv=byId.get('tv');if(tv&&collection.masters.has('table')){const stand=spawn('table','tvStand',[tv.root.position.x,0,tv.root.position.z],Math.PI/2);stand.root.updateMatrixWorld(true);tv.root.position.y=new THREE.Box3().setFromObject(stand.root).max.y;}
 const deer=byId.get('deer');if(deer)deer.root.position.y=1.55;
 }
 for(const t of layout.trees){spawn(t.key??'pine',t.id,t.position,t.rotationY??(Number(t.id.match(/\d+$/)?.[0]??0)*1.7),t.scale,t.harvest?{kind:'tree',id:t.id,label:'Chop tree'}:null);if(t.harvest){const stump=spawn('stump',`stump-${t.id}`,t.position,0,t.scale);if(stump)stump.root.visible=false;}}
 for(const r of layout.rockPlacements??layout.rocks.map((position,i)=>({id:`rock-${i}`,position,rotationY:i*1.3,scale:.7+(i%3)*.2})))spawn('rock',r.id,r.position,r.rotationY,r.scale);
 layout.bushes.forEach((p,i)=>spawn('bush',`bush-${i}`,p,i*2.1,.8+(i%3)*.15));
 layout.webs.forEach((w,i)=>{const s=spawn('web',`web-${i}`,w.position);if(s)s.root.rotation.fromArray(w.rotation);});
 for(const s of layout.spiders)spawn('spider',s.id,s.position,0,.65,{kind:'spider',id:s.id,label:'Spider'});
 spawn('nightman','nightman',layout.nightmanSpawn,Math.PI,1,{kind:'nightman',id:'nightman',label:'Stone Golem'});
 const body=spawn('caretaker','player'),arms=spawn('fpsArms','fpsArms'),axe=spawn('axe','player-axe'),shotgun=spawn('shotgun','player-shotgun'),handLight=spawn('flashlight','player-flashlight');
 const bodyPlacement=body&&createFirstPersonBodyPlacement(body.root);
 if(body){for(const name of ['HeadSkin',...(bindings.caretaker?.hideOwnHead??['Head','Cap','CapBrim','Nose','EarLeft','EarRight','Beard','Neck'])]){const node=findRole(body.root,name);if(node)node.visible=false;}}
 // FPS arms use the same authored rig translated so camera_eye is the origin.
 if(body&&arms){for(const name of ['ArmsSkin',...(bindings.caretaker?.armParts??['SleeveLeft','SleeveRight','HandLeft','HandRight',...Array.from({length:4},(_,i)=>`FingerLeft${i}`),...Array.from({length:4},(_,i)=>`FingerRight${i}`),'ThumbLeft','ThumbRight'])]){const n=findRole(body.root,name);if(n)n.visible=false;}}
 for(const [tool,anchor,marker] of [[axe,'grip_right_axe','grip_dominant'],[shotgun,'grip_right','grip_dominant'],[handLight,'grip_left_flashlight','grip_left']]){
  const socket=findRole((arms??body)?.root??root,anchor),toolGrip=tool&&findRole(tool.root,marker);
  if(tool&&socket&&toolGrip)attachAtSocket(socket,tool.root,toolGrip);else if(tool)tool.root.visible=false;
 }

 // Terrain uses standalone authored material resources. Geometry belongs to this scene.
 const grass=collection.surfaceMaterials.get('grass'),path=collection.surfaceMaterials.get('path');
 if(grass){
  const geometry=new THREE.PlaneGeometry(180,180);geometry.rotateX(-Math.PI/2);
  let material=grass;
  if(path){
   const mask=createTerrainPathMask(layout.pathNetwork),maskTexture=new THREE.DataTexture(mask.data,mask.size,mask.size,THREE.RGBAFormat);
   maskTexture.magFilter=THREE.LinearFilter;maskTexture.minFilter=THREE.LinearFilter;maskTexture.generateMipmaps=false;maskTexture.needsUpdate=true;
   material=new THREE.MeshStandardNodeMaterial({roughness:1});
   material.colorNode=mix(texture(grass.map,uv().mul(180)),texture(path.map,uv().mul(180)),texture(maskTexture,uv()).r);
   ownedMaterials.push(material);ownedTextures.push(maskTexture);
  }else{const attr=geometry.getAttribute('uv');for(let i=0;i<attr.count;i++)attr.setXY(i,attr.getX(i)*180,attr.getY(i)*180);}
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Scene_woodland_ground';mesh.userData.assetKey='scene:ground';mesh.position.y=-.018;root.add(mesh);ownedGeometry.push(geometry);
 }
 const skinBounds=createSkinBoundsUpdater(root);
 const pickupInstances=new Map();let sawEvent=0,vegetationBatch=null,assemblyBatch=null;
 const update=(state,dt,{position,heading,pitch,walking,running,swing,reload,camera,firstPerson=true})=>{
  let assembliesDirty=false;
  const rack=byId.get('storage');if(rack){const fill=Math.min(9,Math.ceil((state.storage.logs+state.storage.firewood)/2));for(let i=0;i<9;i++){const log=findRole(rack.root,`StoredLog_${i}`);if(log)log.visible=i<fill;}}
  const reserve=byId.get('plank-reserve');if(reserve)for(const layer of collection.manifest.interfaces?.plankStack?.layers??[])for(const name of layer.runtimeNodeNames){const node=findRole(reserve.root,name);if(node)node.visible=layer.index<Math.min(9,state.storage.planks);}
  const saw=byId.get('saw');if(saw){if(state.lastAction?.type==='saw'&&state.lastAction.sequence!==sawEvent){sawEvent=state.lastAction.sequence;setClip(saw,'SawStroke',{once:true,restart:true});saw.mixer.setTime(0);}saw.mixer.update(dt);}
  let vegetationVisibilityChanged=false;for(const tree of state.trees){const pine=byId.get(tree.id),stump=byId.get(`stump-${tree.id}`);if(pine&&pine.root.visible!==!tree.felled){pine.root.visible=!tree.felled;if(backgroundRoots.has(pine.root))vegetationVisibilityChanged=true;}if(stump)stump.root.visible=tree.felled;}if(vegetationVisibilityChanged)vegetationBatch?.sync();
  layout.webs.forEach((w,i)=>{const web=byId.get(`web-${i}`);if(web)web.root.visible=!state.trees.find(t=>t.id===w.treeId)?.felled;});
  for(const p of state.pickups){if(!pickupInstances.has(p.id)&&p.active){const key={logs:'woodBundle',shells:'shells',batteries:'batteries'}[p.kind];if(key){const instance=spawn(key,`pickup-${p.id}`,p.position,0,p.kind==='batteries'?2.5:1);if(instance)pickupInstances.set(p.id,instance);}}const i=pickupInstances.get(p.id);if(i){i.root.visible=p.active;i.root.position.y=p.position[1]+.17+Math.sin(state.time*2+p.id.length)*.045;i.root.rotation.y=state.time*.45;}}
  for(const w of state.windows){const i=byId.get(w.id);if(!i)continue;for(let j=0;j<3;j++){const names=bindings.window?.boards?.[j]??[`Board_${String(j+1).padStart(2,'0')}`,`Board${j+1}`];for(const name of names){const n=findRole(i.root,name);if(n){const next=w.boards[j]>0;if(n.visible!==next)assembliesDirty=true;n.visible=next;}}}}
  for(const d of state.doors){const i=byId.get(d.id);if(!i)continue;const hinge=findRole(i.root,bindings.door?.hinge??'door_hinge');if(hinge){const previous=hinge.rotation.y,target=d.open?(d.openAngleDegrees??-95)*Math.PI/180:0;if(!i.doorInitialized){hinge.rotation.y=target;i.doorInitialized=true;}else hinge.rotation.y+=Math.max(-dt*3.5,Math.min(dt*3.5,target-hinge.rotation.y));if(hinge.rotation.y!==previous)assembliesDirty=true;}}
  const pose=playerPoseName({weapon:state.weapon,walking,reloading:!!reload,swingWeapon:swing?.weapon}),action=reload??swing;
  if(body)body.root.visible=firstPerson;if(arms)arms.root.visible=firstPerson;
  if(body&&firstPerson){bodyPlacement.place(position,heading);setPlayerPose(body,pose,{flashlight:state.flashlight&&!reload,once:!!action,restart:!!action&&body.poseKey!==action});body.poseKey=action;if(action)setTime(body,action.time);else if(walking)body.mixer.update(dt*(running?1.615:1));else setTime(body,1);body.root.updateMatrixWorld(true);}
  if(firstPerson)applyStableDemoCamera(camera,{position,heading,pitch});
  if(arms&&firstPerson){
   setPlayerPose(arms,pose,{flashlight:state.flashlight&&!reload,once:!!action,restart:!!action&&arms.poseKey!==action});arms.poseKey=action;if(action)setTime(arms,action.time);else if(walking)arms.mixer.update(dt*(running?1.615:1));else setTime(arms,1);
   // The asset already subtracts the rest eye. Compensate animated eye motion
   // before placing the view rig, retaining authored hand/tool relationships.
   arms.root.position.set(0,0,0);arms.root.quaternion.identity();arms.root.updateMatrixWorld(true);
   const eye=findRole(arms.root,'camera_eye');eyePosition.set(0,0,0);eyeQuaternion.identity();if(eye){eye.getWorldPosition(eyePosition);eye.getWorldQuaternion(eyeQuaternion);}
   const view=viewQuaternion.setFromAxisAngle(upAxis,-heading).multiply(pitchQuaternion.setFromAxisAngle(forwardAxis,swing?.action==='chop'?0:pitch));
   arms.root.quaternion.copy(view).multiply(eyeQuaternion.invert());arms.root.position.copy(camera.position).sub(eyePosition.applyQuaternion(arms.root.quaternion));arms.root.updateMatrixWorld(true);
  }
  if(axe)axe.root.visible=firstPerson&&state.weapon==='axe';if(shotgun)shotgun.root.visible=firstPerson&&state.weapon==='shotgun';
  if(shotgun){setClip(shotgun,reload?'Reload':'Idle',{once:!!reload,restart:shotgun.poseKey!==reload});shotgun.poseKey=reload;if(reload)setTime(shotgun,reload.time);else setTime(shotgun,0);}
  if(handLight){handLight.root.visible=firstPerson&&state.flashlight&&!reload&&!!findRole(arms?.root??body?.root??root,'grip_left_flashlight');setEmissive(findRole(handLight.root,'Flashlight_RecessedLens'),'#e8e3c4',handLight.root.visible?1.2:0);}
  const n=byId.get('nightman');if(n){n.root.position.fromArray(state.nightman.position);const facing=state.nightman.mode==='retreat'?state.nightman.spawn:state.nightman.facing??position;n.root.rotation.y=-Math.atan2(facing[2]-n.root.position.z,facing[0]-n.root.position.x);const clip={watch:'Idle',approach:'Lumber',windup:'Telegraph',strike:'Strike',recover:'Recover',stagger:'Recover',retreat:'Lumber',gone:'Idle'}[state.nightman.mode];setClip(n,clip,{once:['windup','strike','recover','stagger'].includes(state.nightman.mode)});setTime(n,state.nightman.clock);n.root.visible=state.nightman.mode!=='gone';for(const name of bindings.nightman?.eyes??['Mesh_EyeLeft','Mesh_EyeRight']){setEmissive(findRole(n.root,name),'#fa1005',3.5);}}
  for(const s of state.spiders){const instance=byId.get(s.id);if(!instance)continue;instance.root.position.fromArray(s.position);if(s.health<=0){instance.root.rotation.z=1.2;continue;}if(s.moving){instance.root.rotation.y=-Math.atan2(position[2]-s.position[2],position[0]-s.position[0]);instance.mixer.update(dt);}
   for(let index=0;index<(bindings.spider?.legs?.length??0);index++){const leg=bindings.spider.legs[index],hip=findRole(instance.root,leg.bones[0]),knee=findRole(instance.root,leg.bones[1]);if(!hip||!knee)continue;if(!s.moving){hip.quaternion.identity();knee.quaternion.identity();continue;}const target=stepTarget(leg.foot,(s.phase*1.2+(index%2)*.5)%1,.1,.06),solved=solveLeg(leg.hip,leg.knee,leg.foot,target);const restUpper=vector(leg.knee).sub(vector(leg.hip)).normalize(),desiredUpper=vector(solved.knee).sub(vector(leg.hip)).normalize();hip.quaternion.setFromUnitVectors(restUpper,desiredUpper);const lower=vector(solved.foot).sub(vector(solved.knee)).normalize().applyQuaternion(hip.quaternion.clone().invert());knee.quaternion.setFromUnitVectors(vector(leg.foot).sub(vector(leg.knee)).normalize(),lower);}
  }
  root.updateMatrixWorld(true);
  if(assembliesDirty)assemblyBatch?.sync();
  skinBounds.update();
 };
 // Read-only to callers: static rows and moving-door proxies retain identity.
 let collisionCache=null;const movingCollision=[],doorQueries=new Map();
 function updateDoorCollider(record){
  const {node,shape,matrix}=record;node.updateWorldMatrix(true,false);
  if(record.initialized&&matrix.equals(node.matrixWorld))return;
  matrix.copy(node.matrixWorld);record.initialized=true;shape.update(matrix);
 }
 const colliders=()=>{
  if(collisionCache){for(const record of movingCollision)updateDoorCollider(record);return collisionCache;}
  root.updateMatrixWorld(true);const out=[];
  const box=(node,definition,id,oriented=false)=>{if(!node)return;const localBounds=new THREE.Box3().setFromCenterAndSize(vector(definition.center),vector(definition.size));
   if(oriented){const shape=createDoorCollisionShape(definition,id),record={node,shape,row:shape.collider,matrix:new THREE.Matrix4(),initialized:false};movingCollision.push(record);updateDoorCollider(record);out.push(record.row);}
   else{const bounds=localBounds.applyMatrix4(node.matrixWorld);out.push({id,type:'box',minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y,minZ:bounds.min.z,maxZ:bounds.max.z});}
  };
  const cabin=byId.get('cabin');if(cabin)for(const [index,c] of (cabinContract?.colliders??[]).entries()){if(c.role.includes('floor'))continue;box(findRole(cabin.root,c.node),c,`cabin-${index}`);}
  if(cabin&&approvedCabin)cabin.root.traverse(node=>{if(!/^Porch_Post_(?:-?\d+)$/.test(node.name))return;const b=new THREE.Box3().setFromObject(node);out.push({id:`porch-post-${node.name}`,type:'box',minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z});});
  for(const d of layout.doors){const i=byId.get(d.id);if(!i)continue;const contract=d.key==='interiorDoor'?cabinContract?.interiorDoor:cabinContract?.door;for(const [index,c] of (contract?.jambColliders??[]).entries())box(i.root,c,`${d.id}-jamb-${index}`);const leaf=contract?.leafCollider;if(leaf)box(findRole(i.root,leaf.node),leaf,`${d.id}-leaf`,true);}
  for(const [id,i] of byId){if(!i.root.userData.solid&&!(!approvedCabin&&['chop','saw','storage','fire','tv','tvStand','bed','table','bench'].includes(id)))continue;const b=new THREE.Box3().setFromObject(i.root);out.push({id,type:'box',minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z});}
  for(const t of layout.trees)if(byId.has(t.id))out.push({id:t.id,type:'circle',x:t.position[0],z:t.position[2],radius:t.colliderRadius??.22*t.scale,minY:0,maxY:t.height??6.3*t.scale});
  for(const [id,instance] of byId)if(id.startsWith('rock-'))out.push({id,type:'convex',...staticInstanceFootprint(instance)});
  collisionCache=out.filter(c=>!c.id.endsWith('-leaf'));for(const record of movingCollision)collisionCache.push(record.row);return collisionCache;
 };
 const canToggleDoor=(id,position,open)=>{
  const door=layout.doors.find(d=>d.id===id),instance=byId.get(id);if(!door||!instance)return false;
  let query=doorQueries.get(id);
  if(!query){const contract=door.key==='interiorDoor'?cabinContract?.interiorDoor:cabinContract?.door,hinge=findRole(instance.root,contract?.hingeNode??bindings.door?.hinge??'door_hinge'),leaf=contract?.leafCollider&&findRole(instance.root,contract.leafCollider.node);if(!hinge||!leaf)return false;query=createDoorClearanceQuery(hinge,leaf,contract.leafCollider);doorQueries.set(id,query);}
  return query(position,open?(door.openAngleDegrees??-95)*Math.PI/180:0);
 };
 const attackContact=(input,state)=>{
  const i=byId.get('nightman');if(!i)return false;i.root.position.fromArray(state.nightman.position);const facing=state.nightman.facing??input.position;i.root.rotation.y=-Math.atan2(facing[2]-i.root.position.z,facing[0]-i.root.position.x);setClip(i,'Strike',{once:true});i.mixer.setTime(input.time);root.updateMatrixWorld(true);
  const wrists=Object.fromEntries(['Nightman_L_Wrist','Nightman_R_Wrist'].map(name=>[name,findRole(i.root,name)?.matrixWorld])),forward=new THREE.Vector3(1,0,0).applyQuaternion(i.root.quaternion),frame={position:i.root.position,forward};
  if(input.kind==='player')return nightmanPlayerContact({wrists,root:frame,feet:input.position,player:PLAYER});
  const window=state.windows.find(w=>w.id===input.targetId),node=findRole(byId.get(input.targetId)?.root??root,cabinContract.window.boardNodes[input.index]);if(!window||!node)return false;
  return nightmanBoardContact({wrists,root:frame,target:window.position,boardBox:new THREE.Box3().setFromObject(node),boardVisible:node.visible&&window.boards[input.index]>0});
 };
 root.updateMatrixWorld(true);
 if(optimized){
  assemblyBatch=batchRigidAssemblies(assemblyInstances,{enabled:true,parent:root,cellSize:12,controlledNodes:{windowAssembly:cabinContract?.window?.boardNodes??['Board_1','Board_2','Board_3'],door:[cabinContract?.door?.hingeNode??'Door_Hinge'],interiorDoor:[cabinContract?.interiorDoor?.hingeNode??cabinContract?.door?.hingeNode??'Door_Hinge']}});merges.push(assemblyBatch);
  const rejected=new Set(assemblyBatch.stats.rejections.map(row=>row.root));for(const instance of assemblyInstances)if(rejected.has(instance.root.name))merges.push(optimizeStaticAsset(instance.root,{enabled:true,animations:instance.animations,preserveNodes:preserved(instance.assetKey).map(name=>findRole(instance.root,name)).filter(Boolean),cellSize:4}));
 }
 if(optimized){merges.push(mergeStaticFurnishings(furnitureInstances,{parent:root,cellSize:12}));for(const instance of furnitureInstances)merges.push(optimizeStaticAsset(instance.root,{enabled:true,cellSize:4}));}
 if(optimized){vegetationBatch=batchStaticVegetation(background,{enabled:true,parent:root,cellSize:12,strategy:options.vegetationStrategy??'family-frustum'});merges.push(vegetationBatch);}
 // Background transforms are immutable in this demo. Visibility is not frozen.
 for(const instance of background)instance.root.traverse(node=>{node.matrixAutoUpdate=false;node.matrixWorldAutoUpdate=false;});
 // Compact placement roots stay attached so a source-rendering fallback is live.
 // Only legacy full graphs need parking outside renderer traversal.
 const sourceArchive=createSourceArchive(background.filter(instance=>!instance.sourceRoot).map(instance=>instance.root),root);
 const interactionVolumes=instances.filter(i=>['storage','chop','saw','window'].includes(i.root.userData.interaction?.kind)).map(i=>({root:i.root,bounds:new THREE.Box3().setFromObject(i.root)}));
 const flashlightBeam=()=>{const socket=handLight&&findRole(handLight.root,'beam_origin');if(!socket)return null;beam.on=handLight.root.visible;socket.getWorldPosition(beam.position);beam.direction.set(1,0,0).applyQuaternion(socket.getWorldQuaternion(beamQuaternion));return beam;};
 return {root,layout,byId,instances,sourceArchive,furniturePlacements,update,cullVegetation(camera){sourceArchive.sync();vegetationBatch?.cull(camera);},colliders,canToggleDoor,attackContact,interactionVolumes,flashlightBeam,merges,dispose(){sourceArchive.dispose();for(const instance of instances){instance.mixer.stopAllAction();instance.mixer.uncacheRoot(instance.root);if(instance.releaseSource)instance.releaseSource();else for(const material of materialList(instance.root))material.dispose();}for(const merge of merges)merge.dispose();for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();root.clear();}};
}
