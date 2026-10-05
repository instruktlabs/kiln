import {createResourceScope} from './resource-scope.mjs';
import {createFleetResources} from './fleet-resources.mjs';
import {createRigidClipPlayback} from './runtime/fleet-v1/rigid-playback.mjs';
import {createFramedPoseInstances} from './framed-pose-instances.mjs';
import {createOarPlayback} from './runtime/landing-v11/web/oar-playback.mjs';
import {sampleFleetShip} from './fleet-plan.mjs';
export async function createFleetRowing(T,{rosters,resources=null,sampleShip=sampleFleetShip,poseDraw='reference'}){
 const scope=createResourceScope();try{
 if(!rosters.length)throw Error('Empty fleet');
 const ownResources=!resources;resources??=await createFleetResources(T);if(ownResources)scope.use(resources,'fleet sources');const {record,bytes,ship,human}=resources,group=new T.Group();group.name='offshore-rowing-fleet';
 const crews=[],ships=rosters.map(roster=>{
  const root=ship.clone(true);root.position.fromArray(record.ship.position);root.scale.fromArray(record.ship.scale);root.getObjectByName('BoardingPlankPivot').rotation.x=Math.PI/2;root.getObjectByName('BoardingPlankFold').rotation.x=Math.PI;
  const frame=new T.Group();frame.add(root);frame.updateMatrixWorld(true);const oars=createOarPlayback(T,{ship:root,rows:roster.crew});
  const matrix=new T.Matrix4();for(const a of roster.crew)crews.push({...a,matrix:matrix.clone(),time:0,loop:true});
  return {roster,root,frame,oars,matrix,last:null};
 });
 const baked=scope.use(createRigidClipPlayback(human,{manifest:record.manifest,clips:record.clips,bytes},crews,{texturePool:resources.texturePool}),'rowing playback'),boats=scope.use(createFramedPoseInstances(ships.map(s=>s.root),ships.map(()=>new T.Matrix4()),{mode:poseDraw}),'boat poses');group.add(baked.group,boats.group);let lastTime=-1,visibleShips=ships.length;const boatDirty=new Set(),shipBounds=ships.map(()=>new T.Box3());
 function update(time){if(!Number.isFinite(time)||time<0)throw Error('Invalid fleet time');if(time===lastTime)return;lastTime=time;const transforms=[],poses=[];
  for(const [index,s]of ships.entries()){const state=sampleShip(s.roster,time);if(s.last&&state.rowingTime===s.last.rowingTime&&state.position.every((v,i)=>v===s.last.position[i]))continue;s.last=state;s.frame.position.set(state.position[0],state.position[1]-record.ship.position[1],state.position[2]);s.frame.rotation.y=state.yaw;s.frame.updateMatrixWorld(true);s.oars.update(state.rowingTime);s.matrix.copy(s.frame.matrixWorld);shipBounds[index].setFromObject(s.root).expandByScalar(.001);boatDirty.add(index);
   for(const a of s.roster.crew){transforms.push({id:a.id,matrix:s.matrix});poses.push({id:a.id,clip:a.clip,time:state.rowingTime,loop:true});}
  }
  baked.updateActorTransforms(transforms);baked.updateActorPoses(poses);
 }
 function applyVisibility(culler){const active=ships.map((_,i)=>i).filter(i=>!culler||culler.visible(shipBounds[i]));boats.update(active,[...boatDirty]);boatDirty.clear();visibleShips=active.length;}
 update(0);applyVisibility(null);
 return {group,update,applyVisibility,stats(){return {time:lastTime,visibleShips,ships:ships.map(s=>({id:s.roster.id,...s.last,actorIds:s.roster.crew.map(a=>a.id)})),actorIds:crews.map(a=>a.id),crewBatches:baked.group.children.length,shipBatches:boats.partCount,atlasBytes:bytes.byteLength,characterRigEvaluations:0,scope:'Four offshore approaches; no beaching or unloading routes for these ships yet',performanceQualification:false};},dispose:scope.close};
 }catch(error){return scope.fail(error);}
}
