import * as THREE from 'three/webgpu';
import {findRole} from './assets.mjs';
import {createHearthFire} from './hearth-fire.mjs';

/** Runtime effects attach to authored surfaces/anchors. They are not saved asset substitutes. */
export function createEffects(models){
 const owned=[],group=new THREE.Group();group.name='Scene_effects';group.userData.assetKey='scene:effects';models.root.add(group);
 const glowCanvas=document.createElement('canvas');glowCanvas.width=32;glowCanvas.height=32;const ctx=glowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(16,16,0,16,16,15);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.18,'rgba(255,255,255,.7)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);const glowMap=new THREE.CanvasTexture(glowCanvas);glowMap.colorSpace=THREE.SRGBColorSpace;owned.push(glowMap);
 const sprite=(color,scale)=>{const material=new THREE.SpriteMaterial({map:glowMap,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});owned.push(material);const sprite=new THREE.Sprite(material);sprite.scale.setScalar(scale);return sprite;};
 const eyes=[],nightman=models.byId.get('nightman');if(nightman)for(const name of ['Mesh_EyeLeft','Mesh_EyeRight']){const eye=findRole(nightman.root,name);if(!eye?.isMesh)continue;const glow=sprite('#ff2008',.19);group.add(glow);eyes.push({eye,glow});}
 const muzzle=sprite('#ffc87b',.25);muzzle.visible=false;group.add(muzzle);const impact=sprite('#ffcf81',.12);impact.visible=false;group.add(impact);
 const shotLight=new THREE.PointLight('#ffd090',0,5,2);group.add(shotLight);
 const hearth=models.byId.get('fire'),hearthFire=hearth?createHearthFire():null,flame=hearthFire?.mesh;if(flame){group.add(flame);models.root.updateMatrixWorld(true);const socket=findRole(hearth.root,'fire_socket');if(socket)socket.getWorldPosition(flame.position);else flame.position.copy(hearth.root.position).add(new THREE.Vector3(0,.32,.12));}
 const firePosition=flame?flame.position.clone().add(new THREE.Vector3(.16,.16,0).applyQuaternion(hearth.root.getWorldQuaternion(new THREE.Quaternion()))):new THREE.Vector3();
 const tv=models.byId.get('tv'),screen=tv?findRole(tv.root,'CRT_Screen_Surface'):null;
 const tvCanvas=document.createElement('canvas');tvCanvas.width=64;tvCanvas.height=48;const tvContext=tvCanvas.getContext('2d'),tvTexture=new THREE.CanvasTexture(tvCanvas);tvTexture.colorSpace=THREE.SRGBColorSpace;tvTexture.magFilter=THREE.NearestFilter;tvTexture.minFilter=THREE.NearestFilter;tvTexture.flipY=false;tvTexture.repeat.x=-1;tvTexture.offset.x=1;owned.push(tvTexture);
 const originalScreenMaterial=screen?.material;let screenMaterial=null;if(screen?.isMesh){screenMaterial=new THREE.MeshBasicMaterial({map:tvTexture});owned.push(screenMaterial);screen.material=screenMaterial;}
 const tvLight=new THREE.PointLight('#a7cad1',0,4,2);if(screen){models.root.updateMatrixWorld(true);new THREE.Box3().setFromObject(screen).getCenter(tvLight.position);tvLight.position.addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(tv.root.quaternion),.15);}group.add(tvLight);
 const center=new THREE.Vector3(),point=new THREE.Vector3(),direction=new THREE.Vector3();let seenEvent=0,shotAge=10,impactAge=10,videoFrame=null;
 return {firePosition,get fireLightIntensity(){return hearthFire?.state.light??0;},update(state,dt,camera,queryTarget){
  for(const {eye,glow} of eyes){center.set(0,0,0);const count=eye.geometry.getAttribute('position').count;for(let i=0;i<count;i++){eye.getVertexPosition(i,point);center.add(point);}center.multiplyScalar(1/count).applyMatrix4(eye.matrixWorld);glow.position.copy(center);glow.visible=nightman.root.visible;}
  shotAge+=dt;impactAge+=dt;
  const event=state.lastAction;if(event&&event.sequence!==seenEvent){seenEvent=event.sequence;if(event.weapon==='shotgun'&&['shot','nightman-hit','spider-hit'].includes(event.type)){shotAge=0;const gun=models.byId.get('player-shotgun'),anchor=gun?findRole(gun.root,'muzzle'):null;if(anchor)anchor.getWorldPosition(muzzle.position);else muzzle.position.copy(camera.position).addScaledVector(camera.getWorldDirection(direction),.7);shotLight.position.copy(muzzle.position);}if(['tree-hit','tree-felled','nightman-hit','spider-hit'].includes(event.type)){const hitPoint=queryTarget?.()?.point;if(hitPoint){impactAge=0;impact.position.copy(hitPoint);}}}
  muzzle.visible=shotAge<.085;muzzle.scale.setScalar(.25*(1-Math.min(1,shotAge/.085)));shotLight.intensity=shotAge<.09?9*(1-shotAge/.09):0;impact.visible=impactAge<.14;
  hearthFire?.update(state,dt,camera);
  tvLight.intensity=state.tv?1.4:0;const frame=Math.floor(state.time*8),videoKey=state.tv?frame:-1;if(videoKey!==videoFrame&&screenMaterial){videoFrame=videoKey;tvContext.fillStyle=state.tv?'#526465':'#050909';tvContext.fillRect(0,0,64,48);if(state.tv){for(let y=0;y<48;y+=2){const grey=50+((y*37+frame*19)%95);tvContext.fillStyle=`rgb(${grey},${Math.min(255,grey+22)},${Math.min(255,grey+27)})`;tvContext.fillRect(0,y,64,1);}tvContext.fillStyle='#c1d4c8';tvContext.font='8px monospace';tvContext.fillText('SIGNAL',15,22);tvContext.fillRect((frame*7)%64,33,14,2);}tvTexture.needsUpdate=true;}
 },dispose(){hearthFire?.dispose();if(screen&&originalScreenMaterial)screen.material=originalScreenMaterial;for(const resource of owned)resource.dispose();group.removeFromParent();}};
}
