import * as THREE from 'three/webgpu';

export const ROOM_OCCLUSION_LIMITS=Object.freeze({rooms:4,meshes:512,occluders:512,sceneNodes:100000,positionValues:3000000,instances:4096});
export const CABIN_ROOM_MEMBER_IDS=Object.freeze(Object.fromEntries(Object.entries({
 living:['fire','hearth-bench','tv-bench','tvStand','dining-table','chair-1','chair-2','chair-3','chair-4','tv','dining-dressing','living-clock','dressing-M1','dressing-M2','dressing-P1','dressing-A1'],
 bedroom:['bed','bedroom-cabinet','dressing-P2'],
 supply:['storage','plank-reserve','supply-chest','tall-cabinet','dressing-A2'],
 kitchen:['kitchen-worktop','kitchen-cupboard','kitchen-shelf','kitchen-dressing']
}).map(([id,members])=>[id,Object.freeze(members)])));
const finiteBox=b=>!b.isEmpty()&&[...b.min.toArray(),...b.max.toArray()].every(Number.isFinite);
const affine=matrix=>matrix.elements.every(Number.isFinite)&&Math.abs(matrix.elements[3])+Math.abs(matrix.elements[7])+Math.abs(matrix.elements[11])+Math.abs(matrix.elements[15]-1)<1e-10;
const defaultBefore=THREE.Object3D.prototype.onBeforeRender,defaultAfter=THREE.Object3D.prototype.onAfterRender;
function supported(n,occluder=false){
 const g=n.geometry,m=n.material;
 return !!n.isMesh&&!n.isSkinnedMesh&&!n.isBatchedMesh&&affine(n.matrixWorld)&&!Array.isArray(m)&&(m?.isMeshStandardMaterial||m?.isMeshBasicMaterial)&&!m.isNodeMaterial&&m.visible&&!m.transparent&&!m.transmission&&!m.displacementMap&&!m.alphaHash&&!m.alphaToCoverage&&!m.polygonOffset&&!m.wireframe&&m.opacity===1&&Number.isFinite(m.alphaTest)&&m.alphaTest>=0&&m.alphaTest<=1&&m.depthTest&&m.depthFunc===THREE.LessEqualDepth&&(!occluder||m.depthWrite)&&!m.clippingPlanes?.length&&n.onBeforeRender===defaultBefore&&n.onAfterRender===defaultAfter&&m.onBeforeRender===THREE.Material.prototype.onBeforeRender&&m.onBeforeCompile===THREE.Material.prototype.onBeforeCompile&&!n.customDepthMaterial&&!n.customDistanceMaterial&&g?.attributes.position?.itemSize===3&&!Object.keys(g.morphAttributes??{}).length;
}
const textureStamp=t=>t?[t.uuid,t.version,...t.matrix.elements,...t.offset.toArray(),...t.repeat.toArray(),...t.center.toArray(),t.rotation,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.flipY]:[];
function stamp(n,identity){const g=n.geometry,m=n.material,p=g?.attributes.position;return [n.uuid,...n.matrixWorld.elements,identity(g),identity(p),p?.version,p?.data?.version,identity(g?.index),g?.index?.version,g?.drawRange.start,g?.drawRange.count,identity(n.instanceMatrix),n.instanceMatrix?.version,n.count,m?.uuid,m?.version,m?.alphaTest,m?.depthFunc,m?.side,...textureStamp(m?.map),...textureStamp(m?.alphaMap)];}
function ancestorsZero(n,scene){let count=0;for(let p=n.parent;p;p=p.parent){if(++count>256||p.isGroup&&p.renderOrder!==0)return false;if(p===scene)return true;}return false;}
function outsideNear(box,camera,pad){
 const eye=new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);if(box.clone().expandByScalar(pad).containsPoint(eye))return false;
 // Every box point must be beyond the camera near plane. The affine eye-space
 // corner maximum is sufficient and works for perspective/orthographic cameras.
 let maxZ=-Infinity;for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])maxZ=Math.max(maxZ,new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse).z);
 return maxZ<-(camera.near+pad);
}

/** Optional MAIN-WORLD render-only culling. No gameplay root visibility changes.
 * Explicit meshes are already the selected renderer derivatives; hidden source
 * meshes are not re-enabled. render(fn) must wrap ONE synchronous world draw,
 * after final camera/door/board updates. This arms Scene.onBeforeRender only for
 * the known renderer+scene+camera and restores its owned layer bit in finally.
 * Other layer bits and semantic visible flags are untouched. The renderLayer
 * channel must be exclusively owned during this synchronous scope.
 *
 * Opaque sorting must be Three's default (sortObjects=true, no custom sorter).
 * Existing Group renderOrder must be zero and other objects' orders >=0. Stable
 * opaqueOccluders are temporarily order -2, queries -1, all other objects retain
 * their nonnegative orders. Thus moving actors/cullable props never cause a
 * cached zero. Occluders may include rigid door/board derivatives: their actual
 * transforms/material/visibility are part of the epoch, not only an open flag.
 *
 * getEpochToken returns a finite number/string identifying application settings,
 * source membership/graph generation and stable occluder geometry/material state
 * not covered by built-in stamps. Changing it refreshes the bounded order cache.
 * Geometry arrays and shader code remain immutable; upload-version changes are
 * detected, arbitrary unannounced raw array mutation is unsupported. Unknown
 * shaders/blends/morph/skin/clipping/overrides fail visible. Instance batches need
 * explicit complete per-capacity batchMembership of one identical room ID.
 *
 * Public isOccluded has no serial/readiness API. New identities never consume a
 * first-frame true. Completed same-epoch true can be reused while another query
 * is pending. Any exact camera/depth/settings/occluder change creates fresh
 * identities and restores members; camera movement therefore stays fail-visible.
 * No shadow/reflection/XR/secondary-pass reuse. No engine/global policy changes.
 */
export function createRoomOcclusion(options){
 const {scene,renderer,camera,rooms,opaqueOccluders=[],getEpochToken,batchMembership=new Map(),renderLayer=0}=options??{};
 if(!scene?.isScene||!camera?.isCamera||!renderer||typeof getEpochToken!=='function'||!Array.isArray(rooms)||rooms.length>ROOM_OCCLUSION_LIMITS.rooms||!Array.isArray(opaqueOccluders)||opaqueOccluders.length>ROOM_OCCLUSION_LIMITS.occluders||!Number.isInteger(renderLayer)||renderLayer<0||renderLayer>31)throw new TypeError('Bounded room inputs, scene/camera, epoch token and render layer required');
 const bit=1<<renderLayer,ids=new Set(),members=new Set(),normalized=[];let meshCount=0;
 for(const room of rooms){
  if(!room||typeof room.id!=='string'||!room.id||ids.has(room.id)||!Array.isArray(room.meshes)||!room.meshes.length||(meshCount+=room.meshes.length)>ROOM_OCCLUSION_LIMITS.meshes)throw new TypeError('Unique bounded nonempty room meshes required');ids.add(room.id);
  const meshes=[...room.meshes];for(const n of meshes){if(!n?.isMesh||members.has(n)||opaqueOccluders.includes(n))throw new TypeError('Room meshes must have one unique owner, separate from occluders');members.add(n);
   if(n.isInstancedMesh){const names=batchMembership.get(n);if(!Array.isArray(names)||names.length!==n.instanceMatrix.count||names.length>ROOM_OCCLUSION_LIMITS.instances||names.some(id=>id!==room.id))throw new TypeError('Instance batch requires complete single-room membership');}
  }
  if(room.bounds&&(!room.bounds.isBox3||!finiteBox(room.bounds)))throw new TypeError('Room bounds must be a finite nonempty Box3');normalized.push({id:room.id,meshes,envelope:room.bounds?.clone()});
 }
 if(new Set(opaqueOccluders).size!==opaqueOccluders.length||opaqueOccluders.some(n=>!n?.isMesh))throw new TypeError('Unique mesh occluders required');
 const prior=scene.onBeforeRender,proxies=[],roomBounds=new Map(),geometryCache=new WeakMap(),owned=new Set(),orderCache=[],identities=new WeakMap();let identitySerial=0;
 const identity=value=>{if(!value||typeof value!=='object')return null;if(!identities.has(value))identities.set(value,++identitySerial);return identities.get(value);};
 const diagnostics={enabled:options.enabled===true,epochs:0,queries:0,hiddenRooms:[],reasons:[],lastEpoch:null};
 const boxGeometry=new THREE.BoxGeometry(1,1,1);boxGeometry.clearGroups();const queryMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,colorWrite:false,depthWrite:false,depthTest:true,fog:false});
 let enabled=options.enabled===true,disposed=false,armed=false,seen=false,epoch=null,tokenPrevious,restores=[],positionValues=0;
 function clearEpoch(){for(const p of proxies){owned.delete(p);p.removeFromParent();}proxies.length=0;roomBounds.clear();epoch=null;diagnostics.lastEpoch=null;diagnostics.queries=0;diagnostics.hiddenRooms=[];}
 function restore(){for(const r of restores.reverse()){if(r.kind==='layer')r.node.layers.mask|=bit;else if(r.node.renderOrder===r.assigned)r.node.renderOrder=r.before;}restores=[];}
 function refreshOrderCache(){orderCache.length=0;const stack=[scene],seenNodes=new Set();while(stack.length){const n=stack.pop();if(seenNodes.has(n)||seenNodes.size>=ROOM_OCCLUSION_LIMITS.sceneNodes)throw Error('Bounded scene graph required');seenNodes.add(n);if(owned.has(n))continue;if(n.isGroup||n.material)orderCache.push(n);stack.push(...n.children);} }
 function fail(reason){diagnostics.reasons.push(reason);restore();clearEpoch();}
 function localBox(n){const g=n.geometry,p=g.attributes.position,key=[p,p.version,p.data?.version,p.count];let cached=geometryCache.get(g);if(!cached||key.some((v,i)=>v!==cached.key[i])){const values=p.count*3;if(!Number.isSafeInteger(values)||values<0||(positionValues+=values)>ROOM_OCCLUSION_LIMITS.positionValues)throw Error('Geometry position work bound exceeded');const box=new THREE.Box3().setFromBufferAttribute(p);if(!finiteBox(box))throw Error('Invalid member geometry bounds');cached={key,box};geometryCache.set(g,cached);}return cached.box;}
 function worldBox(n){const local=localBox(n);if(!n.isInstancedMesh)return local.clone().applyMatrix4(n.matrixWorld);if(!Number.isInteger(n.count)||n.count<0||n.count>n.instanceMatrix.count||n.count>ROOM_OCCLUSION_LIMITS.instances)throw Error('Instance count bound exceeded');const box=new THREE.Box3(),matrix=new THREE.Matrix4();for(let i=0;i<n.count;i++){n.getMatrixAt(i,matrix);box.union(local.clone().applyMatrix4(matrix).applyMatrix4(n.matrixWorld));}return box;}
 function before(r,s,c,target){
  if(typeof prior==='function')prior.call(this,r,s,c,target);
  if(!armed||!enabled||disposed)return;
  diagnostics.hiddenRooms=[];diagnostics.reasons=[];
  if(seen){fail('More than one world callback in the render scope');return;}seen=true;
  if(r!==renderer||s!==scene||c!==camera||!renderer.backend?.isWebGPUBackend||typeof renderer.isOccluded!=='function'||!renderer.sortObjects||renderer.contextNode||renderer.getRenderObjectFunction?.()||renderer.xr?.isPresenting||camera.isArrayCamera||!affine(camera.matrixWorld)||!affine(scene.matrixWorld)||scene.overrideMaterial||scene.clippingPlanes?.length||renderer.clippingPlanes?.length||!Number.isFinite(camera.near)||camera.near<=0||!Number.isFinite(camera.far)||camera.far<=camera.near||(target?target.depthBuffer===false:renderer.depth===false)){fail('Unsupported world renderer/camera/depth state');return;}
  try{
   const token=getEpochToken();if(typeof token!=='string'&&!(typeof token==='number'&&Number.isFinite(token)))throw Error('Epoch token must be a string or finite number');if(token!==tokenPrevious||!orderCache.length){refreshOrderCache();tokenPrevious=token;}
   if(orderCache.some(n=>!owned.has(n)&&(n.isGroup?n.renderOrder!==0:n.renderOrder<0||!Number.isFinite(n.renderOrder))))throw Error('Unsupported group/opaque ordering');
   const cameraMask=camera.layers.mask,active=normalized.flatMap(room=>room.meshes);
   if(active.some(n=>!supported(n)||!ancestorsZero(n,scene)||(n.layers.mask&cameraMask&~bit)!==0)||opaqueOccluders.some(n=>!supported(n,true)||!ancestorsZero(n,scene)))throw Error('Unsupported room/occluder shader, ownership or layer state');
   const viewport=target?.viewport?.toArray?.()??renderer.getViewport?.(new THREE.Vector4())?.toArray?.()??[],scissor=target?.scissor?.toArray?.()??renderer.getScissor?.(new THREE.Vector4())?.toArray?.()??[];
   const key=JSON.stringify([token,identity(renderer.backend),identity(renderer.backend.device),...scene.matrixWorld.elements,...camera.matrixWorld.elements,...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements,camera.near,camera.far,camera.coordinateSystem,camera.reversedDepth,cameraMask,identity(target),target?.width,target?.height,target?.depthBuffer,target?.samples??renderer.samples,...(renderer.getDrawingBufferSize?.(new THREE.Vector2())?.toArray?.()??[]),renderer.getPixelRatio?.(),...viewport,...scissor,target?.scissorTest??renderer.getScissorTest?.(),identity(renderer.getMRT?.()),renderer.logarithmicDepthBuffer,renderer.reversedDepthBuffer,...opaqueOccluders.map(n=>[...stamp(n,identity),n.visible,n.layers.mask,...ancestorVisibility(n)]),...active.map(n=>[...stamp(n,identity),n.layers.mask,...ancestorVisibility(n)])]);
   if([...camera.matrixWorld.elements,...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements].some(v=>!Number.isFinite(v)))throw Error('Nonfinite camera matrix');
   let fresh=false;
   if(key!==epoch){clearEpoch();positionValues=0;if(!Number.isFinite(scene.matrixWorld.determinant())||scene.matrixWorld.determinant()===0)throw Error('Singular scene frame');const sceneInverse=scene.matrixWorld.clone().invert();for(const room of normalized){const actual=new THREE.Box3();for(const n of room.meshes)actual.union(worldBox(n));if(!finiteBox(actual))throw Error('Invalid room bounds');const envelope=room.envelope;if(envelope&&!envelope.containsBox(actual))throw Error('Room envelope does not enclose member geometry');const b=(envelope??actual).clone(),pad=1e-5+Math.max(...b.min.toArray().map(Math.abs),...b.max.toArray().map(Math.abs))*2e-7;b.expandByScalar(pad);roomBounds.set(room.id,b);const p=new THREE.Mesh(boxGeometry,queryMaterial);p.name='SceneRoomQuery_'+room.id;p.userData.assetKey='scene:room-query';p.matrixAutoUpdate=false;p.matrix.copy(sceneInverse).multiply(new THREE.Matrix4().compose(b.getCenter(new THREE.Vector3()),new THREE.Quaternion(),b.getSize(new THREE.Vector3())));p.layers.set(renderLayer);p.renderOrder=-1;p.frustumCulled=false;p.occlusionTest=true;p.raycast=()=>{};p.castShadow=false;p.receiveShadow=false;scene.add(p);p.updateMatrixWorld(true);owned.add(p);proxies.push(p);}epoch=key;diagnostics.lastEpoch=key;diagnostics.epochs++;fresh=true;}
   for(const n of opaqueOccluders){restores.push({kind:'order',node:n,before:n.renderOrder,assigned:-2});n.renderOrder=-2;}
   diagnostics.queries=proxies.length;
   for(let i=0;i<normalized.length;i++){const room=normalized[i],b=roomBounds.get(room.id);proxies[i].visible=true;if(fresh||!outsideNear(b,camera,1e-5)||renderer.isOccluded(proxies[i])!==true)continue;diagnostics.hiddenRooms.push(room.id);for(const n of room.meshes)if(n.layers.mask&bit){restores.push({kind:'layer',node:n});n.layers.mask&=~bit;}}
  }catch(error){fail(error.message??String(error));}
 }
 // Occluder/member ancestor visibility belongs to the epoch; controller flags
 // stay untouched. Fixed scene graph ordering is refreshed by getEpochToken.
 function ancestorVisibility(n){const out=[];let count=0;for(let p=n.parent;p;p=p.parent){if(++count>256)throw Error('Ancestor bound exceeded');out.push(p.visible);if(p===scene)break;}return out;}
 scene.onBeforeRender=before;
 return {proxies,roomBounds,diagnostics,
  render(fn){if(typeof fn!=='function')throw new TypeError('Synchronous world draw required');if(armed)throw Error('Nested room render scope is unsupported');if(disposed||!enabled)return fn();armed=true;seen=false;try{const value=fn();if(value?.then)throw Error('Asynchronous world draw is unsupported');return value;}catch(error){fail('World draw failed');throw error;}finally{armed=false;restore();}},
  setEnabled(value){if(disposed)return;enabled=!!value;diagnostics.enabled=enabled;if(!enabled){restore();clearEpoch();}},
  dispose(){if(disposed)return;enabled=false;diagnostics.enabled=false;restore();clearEpoch();disposed=true;if(scene.onBeforeRender===before)scene.onBeforeRender=prior;boxGeometry.dispose();queryMaterial.dispose();}
 };
}
