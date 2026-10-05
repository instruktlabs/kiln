import * as T from 'three/webgpu';
import {positionWorld,positionView,texture,vec2,mix,color,Fn,If,float,smoothstep,uniform} from 'three/tsl';
import {makeTerrainTexture,bakeTerrainTint,terrainDetailPolicy,DEFAULT_TERRAIN_SURFACE} from './terrain-texture.mjs';

// Optional scene candidate: one texture read per material, shared packed bytes.
// World coordinates preserve phase while the camera or outer terrain moves.
export function createTerrainDetail(mode=DEFAULT_TERRAIN_SURFACE,{joinStart=null}={}){
 if(!['flat','procedural','hybrid','lod'].includes(mode))throw Error('Invalid terrain surface mode');
 const enabled=mode!=='flat',hybrid=mode==='hybrid',lodMode=mode==='lod',vertexTint=hybrid||lodMode;let packed=null,vertexColorBytes=0;
 if(enabled){
  packed=new T.DataTexture(makeTerrainTexture(),256,256,T.RGBAFormat);
  packed.wrapS=packed.wrapT=T.RepeatWrapping;
  packed.magFilter=T.LinearFilter;packed.minFilter=T.LinearMipmapLinearFilter;
  packed.generateMipmaps=true;packed.colorSpace=T.NoColorSpace;packed.needsUpdate=true;
 }
 const sandUv=vec2(positionWorld.x.mul(.125),positionWorld.z.mul(.125));
 const sandSample=enabled?texture(packed,sandUv):null;
 // Oblique XZ + height projection gives steep rock faces variation with one
 // fetch; it is deliberately not a three-fetch triplanar material.
 const rockUv=vec2(positionWorld.x.mul(.014).add(positionWorld.z.mul(.010)),positionWorld.y.mul(.032).add(positionWorld.z.mul(.006)));
 const rockSample=enabled?texture(packed,rockUv):null;
 const closeDetail=(uv,channel)=>Fn(()=>{
  const detail=float(1).toVar(),distance=positionView.length();
  // Derivatives outside divergent flow; explicit mip level inside the branch.
  const lod=uv.fwidth().mul(256).length().log2().clamp(0,8).toVar();
  If(distance.lessThan(220),()=>{const sample=texture(packed,uv).level(lod);detail.assign(mix(1,mix(.90,1.10,sample[channel]),smoothstep(160,220,distance).oneMinus()));});
  return detail;
 })();
 const rock=enabled||joinStart!==null?new T.MeshStandardNodeMaterial({color:'#938e7b',roughness:1,flatShading:true}):new T.MeshStandardMaterial({color:'#938e7b',roughness:1,flatShading:true});
 if(enabled){rock.colorNode=color('#938e7b').mul(hybrid?closeDetail(rockUv,'b'):mix(.78,1.14,rockSample.b));if(!vertexTint)rock.roughnessNode=mix(.85,1,rockSample.g);}
 const sandBlend=uniform(1),rockBlend=uniform(1),rockFar=lodMode?(joinStart!==null?new T.MeshStandardNodeMaterial({color:'#938e7b',roughness:1,flatShading:true,vertexColors:true}):new T.MeshStandardMaterial({color:'#938e7b',roughness:1,flatShading:true,vertexColors:true})):null;
 if(lodMode){rock.vertexColors=true;rock.colorNode=color('#938e7b').mul(mix(1,mix(.90,1.10,rockSample.b),rockBlend));}
 if(joinStart!==null){const blend=smoothstep(joinStart,joinStart+250,positionWorld.z),sandBase=color('#ccb17d');rock.colorNode=mix(lodMode?sandBase.mul(mix(1,mix(.90,1.10,sandSample.r),rockBlend)):enabled?sandBase.mul(mix(.88,1.10,sandSample.r)):sandBase,rock.colorNode||color('#938e7b'),blend);if(rockFar)rockFar.colorNode=mix(sandBase,color('#938e7b'),blend);}
 if(joinStart!==null){rock.flatShading=false;if(rockFar)rockFar.flatShading=false;}
 const metrics={mode,generatedTextures:enabled?1:0,baseTextureBytes:enabled?262144:0,estimatedTextureBytesWithMipmaps:enabled?349524:0,maxAdditionalTextureReadsPerMaterial:enabled?(joinStart!==null?2:1):0,textureFadeMetres:vertexTint?[160,220]:null,additionalDraws:0,displacement:false,performanceQualified:false,vertexColorBytes};
 return {rock,sandColor:base=>enabled?base.mul(hybrid?closeDetail(sandUv,'r'):mix(.88,1.10,sandSample.r)):base,
  sandRoughness:enabled&&!vertexTint?mix(.88,1,sandSample.g):null,
  applyGeometry(geometry,kind){if(vertexTint){const data=bakeTerrainTint(geometry.attributes.position.array,kind,{joinStart});geometry.setAttribute('color',new T.Float32BufferAttribute(data,3));metrics.vertexColorBytes+=data.byteLength;}},
  sandNearColor:base=>base.mul(mix(1,mix(.90,1.10,sandSample.r),sandBlend)),
  rockFar,
  updateLod(camera,terrain,mountains,sandNear,sandFar){
   if(!lodMode)return;
   const s=terrainDetailPolicy(terrain.geometry.boundingBox.distanceToPoint(camera.position)),r=terrainDetailPolicy(mountains.geometry.boundingBox.distanceToPoint(camera.position));
   sandBlend.value=s.blend;rockBlend.value=r.blend;
   terrain.material=s.near?sandNear:sandFar;mountains.material=r.near?rock:rockFar;
   metrics.lod={sand:s,rock:r};
  },
  metrics,
  dispose(){rock.dispose();rockFar?.dispose();packed?.dispose();}};
}
