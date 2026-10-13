import * as THREE from 'three/webgpu';

/** Fuel is remaining burn time. Saturation keeps a heavily fed hearth contained. */
export function writeFireEnvelope(out,fuel,time){
 const seconds=Number.isFinite(fuel)?Math.max(0,fuel):0;
 const strength=seconds/(seconds+45),alive=Math.min(1,seconds/5);
 const flicker=1+.065*Math.sin(time*8.7)+.035*Math.sin(time*17.3+1.7);
 out.height=alive*(.12+.52*strength);out.width=alive*(.17+.24*strength);
 out.light=alive*(.07+1.2*strength)*flicker;out.embers=alive*strength;
 return out;
}

/** One small draw: eighteen flame tongues and six drifting embers, reused in place. */
export function createHearthFire(){
 const geometry=new THREE.PlaneGeometry(1,1);geometry.translate(0,.5,0);
 // A tiny authored procedural alpha shape gives curved, broken flame edges, not a glow disk.
 const pixels=new Uint8Array(32*64*4);
 for(let y=0;y<64;y++)for(let x=0;x<32;x++){
  const v=y/63,u=x/31-.5,center=.12*Math.sin(v*8)*v;
  const half=.46*Math.pow(1-v,.78)*(.86+.14*Math.sin(v*17));
  const alpha=Math.max(0,Math.min(1,(half-Math.abs(u-center))*24))*Math.min(1,(1-v)*18);
  const core=Math.max(0,1-Math.abs(u-center)/Math.max(.001,half))*(1-v),i=(y*32+x)*4;
  pixels[i]=255;pixels[i+1]=Math.round(75+125*(1-v)+55*core);pixels[i+2]=Math.round(8+125*core*core);pixels[i+3]=Math.round(alpha*255);
 }
 const map=new THREE.DataTexture(pixels,32,64,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.NearestFilter;map.minFilter=THREE.NearestFilter;map.needsUpdate=true;
 const material=new THREE.MeshBasicMaterial({map,transparent:true,opacity:.88,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,blending:THREE.NormalBlending});
 const mesh=new THREE.InstancedMesh(geometry,material,24);mesh.name='Scene_HearthFlames';mesh.userData.assetKey='scene:effects';mesh.castShadow=false;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 const pose=new THREE.Object3D(),color=new THREE.Color(),cameraRotation=new THREE.Quaternion(),target={},state={height:0,width:0,light:0,embers:0};
 for(let i=0;i<24;i++){color.setRGB(1,i<6?.78:1,i<6?.65:1);mesh.setColorAt(i,color);}
 const channels=['height','width','light','embers'];let initialized=false,clock=0;
 return {mesh,state,update(game,dt,camera){
  clock+=Math.max(0,dt);writeFireEnvelope(target,game.fire,clock);const blend=initialized?1-Math.exp(-Math.max(0,dt)*5):1;initialized=true;
  for(const key of channels)state[key]+=(target[key]-state[key])*blend;
  mesh.visible=state.height>.001;if(!mesh.visible)return;
  camera.getWorldQuaternion(cameraRotation);
  for(let i=0;i<24;i++){
   const phase=i*2.3999632297;
   if(i<18){const j=i%6,life=(clock*(.7+j*.075)+i/18)%1,rising=i>=6;
    const pulse=.82+.1*Math.sin(clock*(7+j*.37)+phase),envelope=rising?Math.sin(Math.PI*life):1;
    pose.position.set(Math.cos(phase)*state.width*.43+Math.sin(clock*3+phase)*state.width*.08,rising?life*state.height*.6:0,Math.sin(phase)*state.width*.34);
    pose.scale.set(state.width*(rising?.38:.5)*envelope,state.height*pulse*(rising?.66:.68)*envelope,1);
   }else{const life=(clock*(.34+state.embers*.32)+(i-18)/6)%1;
    pose.position.set(Math.sin(phase+life*2)*state.width*.42,state.height*(.3+life*1.15),Math.cos(phase+life)*state.width*.3);
    const size=.035*state.embers*Math.sin(Math.PI*life);pose.scale.set(size,size*1.8,1);
   }
   pose.quaternion.copy(cameraRotation);pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;
 },dispose(){geometry.dispose();material.dispose();map.dispose();mesh.removeFromParent();}};
}
