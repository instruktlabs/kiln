import * as THREE from 'three';
import {createResourceScope,ownObjectResources} from './resource-scope.mjs';
import {positionWorld,uniform,sin,mix,color} from 'three/tsl';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {initialWaterTier,WaterQualityController,WATER_TIERS} from './water-quality.mjs';
import {phaseForActor,partitionActors} from './crowd-layout.mjs';
import {createRigidPlayback} from './runtime/rigid-v3/rigid-playback.mjs';
import {createPoseTexturePool} from './pose-texture-pool.mjs';
import {createRigidInstancing} from './runtime/rigid-v2/rigid-instancing.mjs';
import {createWater} from './water.mjs';
import {createFleetRosters} from './fleet-plan.mjs';
import {createShoreRosters} from './shore-plan.mjs';
import {createViewCuller} from './view-culling.mjs';
import {depthRendererOptions,configureDepthCamera,DEFAULT_SCENE_DEPTH} from './scene-depth.mjs';
import {DEFAULT_TERRAIN_SURFACE} from './terrain-texture.mjs';
import {createTerrainDetail} from './terrain-materials.mjs';
import {createTerrainCoverage,COVERAGE,limitOrbitEnvelope,DEFAULT_ENVIRONMENT} from './terrain-coverage.mjs';
import {createLayout,groundHeight,views,WALL_Z} from './layout.mjs';
import {wallCoverMatrix,archerPhase,resolveArcherMode} from './archer-plan.mjs';
import {ARCHER_RUNTIME_PATH,ARCHER_SOURCE_PATHS} from './archer-sources.mjs';
import {createHeroDuel} from './hero-duel.mjs';
import {createHeroPlay} from './hero-play.mjs';
import {framePresetView} from './view-framing.mjs';
import {createGridGround} from './grid-ground.mjs';
import {createCityGate} from './city-gate.mjs';
import {createWorldContacts} from './world-contacts.mjs';
import {createHeroExplorePlay} from './hero-explore-play.mjs';
import {createStructureFoundations} from './structure-foundations.mjs';
import {connectCityCourtyards} from './city-routes.mjs';
import {compileSceneVariants} from './scene-variant-warmup.mjs';
import {warmScenePasses} from './scene-pass-warmup.mjs';
import {warmProductionPhase} from './production-phase-warmup.mjs';
import {createSceneControls} from './scene-controls.mjs';
import {renderTierSettings} from './render-tier.mjs';
import {createCityShadowFocus} from './city-shadow-focus.mjs';
import {startupDrawPolicy} from './startup-draw-policy.mjs';
import {runtimeQuery} from './runtime-policy.mjs';
import {runtimeReader,readRuntimeBytes} from './runtime-transport.mjs';
const mobileDevice=navigator.userAgentData?.mobile===true||/Android|iPhone|iPad/i.test(navigator.userAgent);
const sceneQuery=runtimeQuery(new URLSearchParams(location.search),{mobile:mobileDevice});
const waterDevice=mobileDevice?{cores:4,memory:4}:{cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory};

const diagnostics={stage:'Troy fleet and landing prototype',errors:[],limitations:['Formations idle; shore crews row, unload and idle. Regrouping, archery and duel remain pending','Ship contacts have scoped sampled evidence; wall traversal remains pending','Battlefield-only shadows; city shadow coverage and impostors still pending','Native scene-kit/site integration and physical mobile qualification pending']};
try{await start();}catch(e){diagnostics.errors.push(String(e.stack||e));document.querySelector('#error').textContent=String(e);document.querySelector('#error').style.display='block';console.error(e);}
async function start(){
 const scope=createResourceScope();scope.defer(()=>runtimeReader().close(),'runtime transport');let poseTextures=null;const startupStats=()=>({...diagnostics,lifecycle:scope.stats(),poseTextures:poseTextures?.stats()??null});window.troy={ready:false,stats:startupStats,dispose:scope.close};try{
 const rejection=e=>diagnostics.errors.push(String(e.reason));window.addEventListener('unhandledrejection',rejection);scope.defer(()=>window.removeEventListener('unhandledrejection',rejection),'rejection listener');
 poseTextures=createPoseTexturePool(THREE,{mode:sceneQuery.get('poseTextures')||'shared'});
 scope.defer(()=>poseTextures.close(),'pose textures');
 const archerMode=resolveArcherMode(sceneQuery.get('archers'));let archerReference=null,archerRuntime=null;const archerReferences=[],archerId='wall-guard-12',archerEnabled=archerMode!=='off',archerSync=sceneQuery.get('archerSync')==='1';
 const shoreFleetEnabled=sceneQuery.get('shorefleet')==='1',fleetEnabled=shoreFleetEnabled||sceneQuery.get('fleet')==='1',landingEnabled=fleetEnabled||sceneQuery.get('landing')==='1';let landingRuntime=null,fleetRuntime=null;const fleetResources=[];const sceneViews={...views,...(landingEnabled?{landing:{label:'Landing crew',position:[74,11,-14],target:[54,5,9]},shipApproach:{label:'Rowing ship',position:[140,30,-36],target:[54,4,-36]},...(shoreFleetEnabled?{idleCrew:{label:'Landed crew',position:[68,3,34],target:[62.5,1.2,28]},...(['reference','packed'].includes(sceneQuery.get('regroup'))?{marchingCrew:{label:'Marching crew',position:[60,5,74],target:[50,1.6,62]},reserveCrew:{label:'Reserve formation',position:[48,7,137],target:[36,5,120]}}:{})}:{})}:{})};
 const poseDrawMode=sceneQuery.get('poseDraw')||'reference';if(!['reference','shared','merged'].includes(poseDrawMode))throw Error('Invalid framed pose draw mode');diagnostics.poseDrawMode=poseDrawMode;
 const lookupMode=sceneQuery.get('nodeLookup')||'reference';if(!['reference','cached'].includes(lookupMode))throw Error('Invalid fixed rig lookup mode');diagnostics.nodeLookupMode=lookupMode;
 const crowdMode=sceneQuery.get('crowd')||'baked';if(!['baked','instanced','static'].includes(crowdMode))throw Error('Unsupported crowd representation');diagnostics.crowdMode=crowdMode;
 const canvas=document.querySelector('#view'),forceWebGL=sceneQuery.get('backend')==='webgl2';
 const depthMode=sceneQuery.get('depth')||DEFAULT_SCENE_DEPTH;
 const renderer=scope.use(new THREE.WebGPURenderer({canvas,antialias:true,forceWebGL,...depthRendererOptions(depthMode),trackTimestamp:sceneQuery.has('timings')}),'renderer');await renderer.init();
 diagnostics.depth={requested:depthMode,reversed:renderer.reversedDepthBuffer,logarithmic:renderer.logarithmicDepthBuffer};
 const renderTier=renderTierSettings(sceneQuery.get('renderTier')||'reference',devicePixelRatio);diagnostics.renderTier=renderTier;
 renderer.setPixelRatio(renderTier.pixelRatio);renderer.setSize(innerWidth,innerHeight);
 renderer.shadowMap.enabled=renderTier.shadows;renderer.shadowMap.type=THREE.PCFShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
 const actual=renderer.backend.isWebGPUBackend?'webgpu':'webgl2';diagnostics.backend=actual;
 if(actual==='webgpu'){const a=renderer.backend.device?.adapterInfo;diagnostics.adapter={vendor:a?.vendor,architecture:a?.architecture,device:a?.device,description:a?.description};}
 else {const gl=renderer.backend.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');diagnostics.adapter=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';}
 const environmentMode=sceneQuery.get('environment')||DEFAULT_ENVIRONMENT;if(!['legacy','continuous'].includes(environmentMode))throw Error('Invalid environment mode');const continuous=environmentMode==='continuous';diagnostics.environment={mode:environmentMode,...(continuous?COVERAGE:{})};
 const scene=new THREE.Scene();scene.background=new THREE.Color('#b3c8ca');scene.fog=new THREE.Fog('#b3c8ca',1600,continuous?COVERAGE.fogFar:6200);
 const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.2,6000);configureDepthCamera(camera,renderer);
 const controls=scope.use(new OrbitControls(camera,canvas),'orbit controls');controls.enableDamping=true;controls.dampingFactor=.08;controls.maxPolarAngle=Math.PI*.495;controls.minDistance=2;controls.maxDistance=1800;
 controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
 scene.add(new THREE.HemisphereLight('#fff0d8','#7d7259',1.5));
 const sun=new THREE.DirectionalLight('#fff0d0',2.4);sun.position.set(-240,400,-210);sun.target.position.set(0,5,160);sun.castShadow=renderTier.shadows;sun.shadow.mapSize.set(renderTier.shadowMapSize,renderTier.shadowMapSize);Object.assign(sun.shadow.camera,{left:-235,right:235,top:235,bottom:-235,near:1,far:1100});sun.shadow.bias=-.00005;sun.shadow.normalBias=.035;scene.add(sun,sun.target);diagnostics.shadowScope=renderTier.shadows?`${renderTier.shadowMapSize} directional map; battlefield and close city route windows`:'Reduced device tier without directional shadows';
 let fleetCulling=sceneQuery.get('fleetCulling')==='on';const viewCuller=createViewCuller(THREE,{receiverFloorY:-16,lightDirection:sun.target.position.clone().sub(sun.position)});const prepareFleetVisibility=()=>{viewCuller.prepare(camera);landingRuntime?.applyVisibility?.(fleetCulling?viewCuller:null);fleetRuntime?.applyVisibility?.(fleetCulling?viewCuller:null);};
 const layout=createLayout({archers:archerEnabled}),inputs=await (await fetch('./inputs.json')).json();diagnostics.cityRoutes=connectCityCourtyards({layout,inputs,groundHeight});diagnostics.inputs=inputs.assets.map(({slug,revisionId,sha256})=>({slug,revisionId,sha256}));
 const shoreRosters=shoreFleetEnabled?createShoreRosters(layout.ships):[];if(shoreFleetEnabled){const ids=new Set(shoreRosters.map(s=>s.id));layout.ships=layout.ships.filter(s=>!ids.has(s.id));layout.actors=layout.actors.filter(a=>!ids.has(a.shipId)&&a.state!=='staging');}
 else if(landingEnabled){layout.ships=layout.ships.filter(p=>p.id!=='ship-1-2');layout.actors=layout.actors.filter(p=>p.shipId!=='ship-1-2');}
 const fleetRosters=fleetEnabled?createFleetRosters(layout.ships):[],fleetIds=new Set(fleetRosters.map(s=>s.id));if(fleetEnabled){layout.ships=layout.ships.filter(s=>!fleetIds.has(s.id));layout.actors=layout.actors.filter(a=>!fleetIds.has(a.shipId));}
 const assets=new Map(),loader=new GLTFLoader();
 async function sha256(data){return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');}
 // Fetches overlap under the reader's global bound; GLB parsing stays ordered
 // so failures cannot leave concurrently parsed, unowned GPU resources behind.
 const pendingAssets=inputs.assets.map(input=>readRuntimeBytes(input.url).then(async bytes=>{if(await sha256(bytes)!==input.sha256)throw Error(`Asset hash mismatch: ${input.slug}`);return bytes;}));
 for(const pending of pendingAssets)pending.catch(()=>{});
 for(const [i,input] of inputs.assets.entries()){const bytes=await pendingAssets[i],gltf=await loader.parseAsync(bytes,new URL('assets/',location.href).href);ownObjectResources(scope,gltf.scene,input.slug);gltf.scene.updateMatrixWorld(true);assets.set(input.slug,gltf);}
 if(shoreFleetEnabled){const {createFleetResources}=await import('./fleet-resources.mjs');fleetResources.push(scope.use(await createFleetResources(THREE,{poseTextures}),'fleet sources'));if(sceneQuery.get('fleetResources')==='separate')fleetResources.push(scope.use(await createFleetResources(THREE,{poseTextures}),'fleet sources'));const {createShoreFleet}=await import('./shore-fleet.mjs');landingRuntime=await createShoreFleet(THREE,{rosters:shoreRosters,poseDraw:poseDrawMode,lookupMode,resources:fleetResources[0],boundsMode:sceneQuery.get('bounds')||'cached',poseMode:sceneQuery.get('crewPose')||'subtree',idleMode:sceneQuery.get('shoreIdle')||'gpu',regroupMode:sceneQuery.get('regroup')||'off',formationIdleMode:sceneQuery.get('formationIdle')||undefined,walkingMode:sceneQuery.get('walk')||undefined,walkingOffscreenMode:sceneQuery.get('walkOffscreen')||'shadowSafe'});scope.use(landingRuntime,'landing runtime');scene.add(landingRuntime.group);sceneViews.landing={label:'Landing crew',position:[80,11,32],target:[62,3,10]};sceneViews.shoreFleet={label:'Shore fleet',position:[100,120,-210],target:[-20,2,12]};sceneViews.rowingHands={label:'Rowing hands',position:[107.44519938520314,1.982,-51.11732888871325],target:[106.97039173170651,1.532,-48.840366506024196]};}
 else if(landingEnabled){const {createTroyLanding}=await import((fleetEnabled||sceneQuery.get('gpurow')==='1')?'./runtime/landing-v11/controller.mjs':sceneQuery.get('dryshore')==='1'?'./runtime/landing-v9/controller.mjs':sceneQuery.get('equipment')==='1'?'./runtime/landing-v8/controller.mjs':sceneQuery.get('arrival')==='1'?'./runtime/landing-v6/controller.mjs':sceneQuery.get('gait')==='paired'?'./runtime/landing-v3/controller.mjs':'./runtime/landing-v5/controller.mjs');landingRuntime=await createTroyLanding(THREE,{mode:sceneQuery.get('landingRender')||((fleetEnabled||sceneQuery.get('gpurow')==='1')?'hybrid':'instances')});scope.use(landingRuntime,'landing runtime');scene.add(landingRuntime.group);if(landingRuntime.stats().dryShore){sceneViews.landing={label:'Landing crew',position:[80,11,32],target:[62,3,10]};sceneViews.shipApproach={label:'Rowing ship',position:[135,35,-40],target:[83,4,-20]};}diagnostics.stage='Troy with one continuous landing prototype';diagnostics.limitations[0]='Idle formations; one continuous landing prototype; archery and duel pending';}
 if(fleetEnabled){const lateLandings=shoreFleetEnabled&&sceneQuery.get('lateLandings')==='1',factory=lateLandings?(await import('./late-landings.mjs')).createLateLandings:(await import('./fleet-rowing.mjs')).createFleetRowing;fleetRuntime=await factory(THREE,{rosters:fleetRosters,poseDraw:poseDrawMode,lookupMode,resources:fleetResources.at(-1),poseMode:sceneQuery.get('crewPose')||'subtree',...(lateLandings?{regroupMode:sceneQuery.get('regroup')==='packed'?'packed':'off',formationIdleMode:sceneQuery.get('formationIdle')||undefined,walkingMode:sceneQuery.get('walk')||undefined,walkingOffscreenMode:sceneQuery.get('walkOffscreen')||'shadowSafe'}:{}),boundsMode:sceneQuery.get('bounds')||'cached'});if(lateLandings){landingRuntime.duration=Math.max(landingRuntime.duration,fleetRuntime.duration);sceneViews.lateLanding={label:'Later landing wave',position:[330,12,36],target:[302,3,9]};if(sceneQuery.get('regroup')==='packed')sceneViews.lateReserve={label:'Later reserves',position:[235,20,153],target:[192,5,120]};}scope.use(fleetRuntime,'later fleet runtime');scene.add(fleetRuntime.group);sceneViews.fleet={label:'Rowing fleet',position:[230,180,-360],target:[0,0,-125]};diagnostics.stage=shoreFleetEnabled?'Troy with four offshore ships and eight shore crews':'Troy with four offshore rowing ships and one landing ship';if(lateLandings)diagnostics.stage='Troy twelve-ship landing trial';diagnostics.limitations[0]=shoreFleetEnabled?(['reference','packed'].includes(sceneQuery.get('regroup'))?(lateLandings?'Twelve landing trial; archery, duel, complete-scene/device qualification and later crew regrouping remain pending':'Packed regrouping supports shared distant walking; offshore landings, archery, duel and full-device qualification pending'):'Offshore crews hold at sea; optional regrouping reference available; archery and duel pending'):'Seven shore ships remain placeholders; fleet unloading, archery and duel pending';}
 const terrainDetail=scope.use(createTerrainDetail(sceneQuery.get('surface')||DEFAULT_TERRAIN_SURFACE,{joinStart:continuous?COVERAGE.joinZ:null}),'terrain detail');diagnostics.terrainDetail=terrainDetail.metrics;
 const coverage=continuous?createTerrainCoverage():null,gridGeometry=data=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geo.setIndex(new THREE.BufferAttribute(data.indices,1));return geo;};
 const sand=scope.use(new THREE.MeshStandardNodeMaterial({color:'#ccb17d',roughness:1}),'sand material');if(terrainDetail.sandRoughness)sand.roughnessNode=terrainDetail.sandRoughness;
 const groundGeo=continuous?gridGeometry(coverage.sand):new THREE.PlaneGeometry(2400,2400,192,192);if(!continuous){groundGeo.rotateX(-Math.PI/2);groundGeo.translate(0,0,650);}
 scope.use(groundGeo,'sand geometry');
 const gp=groundGeo.attributes.position;for(let i=0;i<gp.count;i++)gp.setY(i,groundHeight(gp.getX(i),gp.getZ(i)));groundGeo.computeVertexNormals();
 const contactGround=createGridGround(groundGeo);diagnostics.groundContact={mode:'original-indexed-triangles',bounds:contactGround.bounds};
 terrainDetail.applyGeometry(groundGeo,'sand');sand.vertexColors=['hybrid','lod'].includes(terrainDetail.metrics.mode);groundGeo.computeBoundingBox();
 const terrain=new THREE.Mesh(groundGeo,sand);terrain.receiveShadow=true;scene.add(terrain);
 const waveTime=uniform(0),waterMat=new THREE.MeshStandardNodeMaterial({roughness:.32,metalness:.15});
 scope.use(waterMat,'flat water material');
 const ripple=sin(positionWorld.x.mul(.19).add(positionWorld.z.mul(.055)).sub(waveTime.mul(.4))).mul(.5).add(.5);
 waterMat.colorNode=mix(color('#266777'),color('#39838a'),ripple.mul(.32));
 const water=new THREE.Mesh(new THREE.PlaneGeometry(continuous?COVERAGE.extent*2:5200,continuous?COVERAGE.extent:3000),waterMat);water.rotation.x=-Math.PI/2;water.position.set(0,.02,continuous?-COVERAGE.extent/2:-1500);scene.add(water);
 let qualityMode='auto',qualityController=new WaterQualityController(initialWaterTier(waterDevice));
 const waterOptions={extent:continuous?COVERAGE.extent:2600};let shoreWater=createWater(qualityController.tier,waterOptions);scope.defer(()=>shoreWater.dispose(),'shore water');scope.use(water.geometry,'flat water geometry');scene.add(shoreWater.mesh);sand.colorNode=terrainDetail.sandColor(shoreWater.wetSandColor);water.visible=false;
 const sandFar=terrainDetail.metrics.mode==='lod'?new THREE.MeshStandardNodeMaterial({roughness:1,vertexColors:true}):null;
 if(sandFar)scope.use(sandFar,'far sand material');
 if(sandFar){sandFar.colorNode=shoreWater.wetSandColor;sand.colorNode=terrainDetail.sandNearColor(shoreWater.wetSandColor);}
 const applyWaterTier=tier=>{if(tier===shoreWater.metrics.tier)return;const old=shoreWater;shoreWater=createWater(tier,waterOptions);shoreWater.time.value=old.time.value;shoreWater.mesh.visible=old.mesh.visible;scene.add(shoreWater.mesh);scene.remove(old.mesh);old.dispose();diagnostics.water=shoreWater.metrics;document.querySelector('#tier').textContent=tier;};
 const setWaterQuality=mode=>{if(mode!=='auto'&&!WATER_TIERS[mode])throw Error('Invalid water quality');qualityMode=mode;qualityController=new WaterQualityController(mode==='auto'?initialWaterTier(waterDevice):mode);applyWaterTier(qualityController.tier);document.querySelector('#water-quality').value=mode;diagnostics.waterQualityMode=mode;};
 scope.defer(()=>{document.querySelector('#water-quality').onchange=null;},'water controls');
 document.querySelector('#water-quality').onchange=e=>setWaterQuality(e.target.value);
 const tierLabel=document.createElement('label');tierLabel.className='water-quality';tierLabel.textContent='Scene quality ';const tierSelect=document.createElement('select');tierSelect.id='render-tier';tierSelect.setAttribute('aria-label','Scene quality; changing restarts the scene');for(const [value,label]of [['balanced','Balanced'],['economy','Reduced with shadows'],['minimal','Reduced'],['reference','Reference']]){const option=document.createElement('option');option.value=value;option.textContent=label;tierSelect.append(option);}tierSelect.value=renderTier.name;tierSelect.onchange=()=>{const url=new URL(location.href);url.searchParams.set('renderTier',tierSelect.value);url.searchParams.set('view',sceneViews[diagnostics.view]?diagnostics.view:'heroes');location.assign(url.href);};tierLabel.append(tierSelect);document.querySelector('nav').prepend(tierLabel);scope.defer(()=>tierLabel.remove(),'render tier control');document.querySelector('#tier').textContent=shoreWater.metrics.tier;diagnostics.waterQualityMode=qualityMode;
 const setWaterMode=mode=>{if(!['flat','waves'].includes(mode))throw Error('Invalid water mode');water.visible=mode==='flat';shoreWater.mesh.visible=mode==='waves';diagnostics.waterMode=mode;};setWaterMode('waves');diagnostics.water=shoreWater.metrics;
 // Deterministic distant terrain; scene geometry, not a new standalone mountain asset.
 const mountainGeo=continuous?gridGeometry(coverage.rock):new THREE.PlaneGeometry(4000,900,96,30);if(!continuous){mountainGeo.rotateX(-Math.PI/2);mountainGeo.translate(0,0,2200);}
 scope.use(mountainGeo,'mountain geometry');
 const mp=mountainGeo.attributes.position;
 if(!continuous)for(let i=0;i<mp.count;i++){
  const x=mp.getX(i),z=mp.getZ(i);let h=groundHeight(x,z);
  for(const [cx,cz,height,sx,sz] of [[-910,2200,210,390,270],[-430,2310,290,310,320],[130,2150,230,290,230],[590,2350,260,300,320],[1100,2190,230,430,280]]){
   const r=Math.sqrt(((x-cx)/sx)**2+((z-cz)/sz)**2);h+=height*Math.max(0,1-r*.6)*(1+.07*Math.sin(x*.035+z*.03));
  }mp.setY(i,h);
 }mountainGeo.computeVertexNormals();mountainGeo.computeBoundingBox();terrainDetail.applyGeometry(mountainGeo,'rock');terrainDetail.rock.vertexColors=['hybrid','lod'].includes(terrainDetail.metrics.mode);const mountains=new THREE.Mesh(mountainGeo,terrainDetail.rock);scene.add(mountains);
 diagnostics.environment.geometry={sandVertices:gp.count,rockVertices:mp.count,triangles:groundGeo.index.count/3+mountainGeo.index.count/3};
 const foundationMat=scope.use(new THREE.MeshStandardMaterial({color:'#b29a70',roughness:1}),'foundation material');
 const foundations=createStructureFoundations(THREE,{buildings:layout.buildings,inputs,groundHeight,material:foundationMat});scope.use(foundations.geometry,'foundation geometry');scope.use(foundations,'foundation instances');scene.add(foundations);
 // Static environment batching remains separate from the animated actor representation.
 if(archerEnabled){
  const record=await(await fetch('./'+ARCHER_RUNTIME_PATH+'inputs.json')).json(),models=new Map();
  for(const entry of record.files){const url=entry.path.replace(/^web\//,'./');const bytes=await readRuntimeBytes(url);if((await sha256(bytes)).slice(7)!==entry.sha256)throw Error('Archer source hash mismatch');if(!entry.path.endsWith('trojan-soldier.glb'))models.set(entry.path,ownObjectResources(scope,(await loader.parseAsync(bytes,new URL(url,location.href).href)).scene,'archer source'));}
  const {createArcherReference}=await import('./archer-reference.mjs'),create=()=>createArcherReference(THREE,{human:assets.get('trojan-soldier').scene,hands:models.get('web/'+ARCHER_SOURCE_PATHS.hands),equipment:models.get('web/'+ARCHER_SOURCE_PATHS.equipment)});
  const p=layout.actors.find(p=>p.id===archerId),placements=archerMode==='reference'?[p]:layout.actors.filter(p=>p.state==='archer');
  if(archerMode==='packed'){
   archerReference=scope.use(create(),'archer reference');archerReference.sample(0);const base='./'+ARCHER_RUNTIME_PATH,manifest=await(await fetch(base+'bank.json')).json();
   if(JSON.stringify(manifest.inputs)!==JSON.stringify(record.files))throw Error('Archer bank input mismatch');
   for(const [file,expected] of Object.entries(manifest.sourceHashes)){if(!file.startsWith('web/'))continue;const sourceBytes=await readRuntimeBytes(file.replace(/^web\//,'./'));if(await sha256(sourceBytes)!==expected)throw Error('Archer bank source mismatch '+file);}
   const bytes=[];for(const key of ['transforms','vertices']){const b=await readRuntimeBytes(base+manifest.data[key].file);if(await sha256(b)!==manifest.data[key].sha256)throw Error('Archer bank hash mismatch');bytes.push(b);}
   const actors=placements.map(p=>({id:p.id,phase:archerSync?0:p.phaseOffset,matrix:new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw),new THREE.Vector3().setScalar(p.scale))}));
   const {createArcherPlayback}=await import('./archer-playback.mjs');archerRuntime=scope.use(createArcherPlayback(archerReference,manifest,...bytes,actors),'archer playback');scene.add(archerRuntime.group);
  }else for(const placement of placements){const a=scope.use(create(),'archer reference');a.group.position.fromArray(placement.position);a.group.rotation.y=placement.yaw;a.group.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});scene.add(a.group);archerReferences.push({a,id:placement.id,phase:archerMode==='reference'||archerSync?0:placement.phaseOffset});if(placement.id===archerId)archerReference=a;}
  sceneViews.archer={label:'Archer reference',position:[p.position[0]-2.6,p.position[1]+1.9,p.position[2]+2.5],target:[p.position[0],p.position[1]+1.3,p.position[2]-.2]};
  diagnostics.archers={mode:archerMode,active:placements.length,remainingPlaceholders:48-placements.length,id:archerId,inputs:record,sync:archerSync};diagnostics.limitations.push(archerMode==='reference'?'One equipped CPU archer reference; 47 sword placeholders remain':'48 equipped archer trial; full equipment, culling, shadows and performance qualification remain pending');
 }
 const renderActors=archerMode==='packed'||archerMode==='cpu'?layout.actors.filter(p=>p.state!=='archer'):archerReference?layout.actors.filter(p=>p.id!==archerId):layout.actors;
 const heroRuntime=scope.use(createHeroDuel(THREE,{models:Object.fromEntries(layout.heroes.map(p=>[p.asset,assets.get(p.asset).scene])),placements:layout.heroes,groundHeight:contactGround.heightAt,lookupMode}),'hero pair');scene.add(heroRuntime.group);let heroPlay=null,heroExplore=null;
 const heroY=contactGround.heightAt(0,250);sceneViews.heroes={label:'Face-off',position:[10,heroY+5,239],target:[0,heroY+1.1,250]};sceneViews.heroDuel={label:'Duel close-up',position:[3.8,heroY+2.2,248],target:[0,heroY+1.1,250]};
 sceneViews.gate={label:'Gate entrance',position:[15,20,338],target:[0,20,362]};
 for(const [name,label,z] of [['greekRanks','Greek ranks',153.3],['trojanRanks','Trojan ranks',302]]){const y=groundHeight(0,z);sceneViews[name]={label,position:[8,y+2.3,z+(name==='greekRanks'?8:-5)],target:[0,y+1.1,z]};}
 diagnostics.limitations[0]='Packed landings/regrouping and equipped archers in review; optional paired hero duel is a choreography trial. Later packed reserve routes are integrated; city journey and complete-scene/device qualification remain pending';
 const all=[...layout.walls,...layout.buildings,...layout.plants,...(crowdMode==='static'?renderActors:[]),...layout.ships];
 const byAsset=new Map(),gateBatches=new Map(),staticContacts=[foundations];for(const p of all){if(!byAsset.has(p.asset))byAsset.set(p.asset,[]);byAsset.get(p.asset).push(p);}
 const placement=new THREE.Matrix4(),q=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0),scale=new THREE.Vector3(),translation=new THREE.Vector3(),matrix=new THREE.Matrix4();
 for(const [slug,placements] of byAsset){
  const model=assets.get(slug).scene;
  model.traverse(node=>{
   if(!node.isMesh)return;
   let geo=node.geometry;
   const materials=Array.isArray(node.material)?node.material:[node.material];
   if(geo.hasAttribute('tangent')&&materials.some(m=>m.normalMap)){geo=scope.use(geo.clone(),'static tangent geometry');geo.deleteAttribute('tangent');}
   const batch=scope.use(new THREE.InstancedMesh(geo,node.material,placements.length),'static instances');batch.receiveShadow=true;batch.castShadow=['greek-soldier','trojan-soldier','achilles','hector','war-galley'].includes(slug);batch.name=`${slug}/${node.name}`;
   placements.forEach((p,i)=>{placement.compose(translation.fromArray(p.position),q.setFromAxisAngle(axis,p.yaw),scale.setScalar(p.scale));matrix.multiplyMatrices(placement,node.matrixWorld);if(archerReference&&slug==='wall-section')matrix.copy(wallCoverMatrix(THREE,node,p));batch.setMatrixAt(i,matrix);});
   batch.computeBoundingBox();batch.computeBoundingSphere();scene.add(batch);if(slug==='city-gate')gateBatches.set(node.name,batch);else if(!['greek-soldier','trojan-soldier','achilles','hector','war-galley'].includes(slug))staticContacts.push(batch);
  });
 }
 const cityGate=scope.use(createCityGate(THREE,{model:assets.get('city-gate').scene,placement:layout.walls.find(p=>p.id==='gate'),batches:gateBatches}),'city gate controller');
 const crowds=[];
 if(crowdMode!=='static')for(const [faction,placements] of Object.entries(partitionActors(renderActors))){
  const gltf=assets.get(`${faction}-soldier`),clip=gltf.animations.find(c=>c.name==='idle');if(!clip)throw Error('Missing idle clip');
  const actors=placements.map(p=>({id:p.id,phase:phaseForActor(p.id,clip.duration),matrix:new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position),new THREE.Quaternion().setFromAxisAngle(axis,p.yaw),new THREE.Vector3().setScalar(p.scale))}));
  let runtime;
  if(crowdMode==='baked'){
   const base=`./runtime/infantry-v5/${faction}/`,manifest=await(await fetch(base+'manifest.json')).json(),bytes=await readRuntimeBytes(base+manifest.data.file);
   if(manifest.source.sha256!==inputs.assets.find(a=>a.slug===`${faction}-soldier`).sha256||await sha256(bytes)!==manifest.data.sha256)throw Error('Crowd derivative identity mismatch');
   const texturePool=await poseTextures.register(manifest,bytes);runtime=createRigidPlayback(gltf.scene,manifest,bytes,actors,{texturePool});runtime.loop.value=1;
  }else runtime=createRigidInstancing(gltf.scene,clip,actors);
  scope.use(runtime,'infantry playback');runtime.group.name=`${faction}-crowd`;scene.add(runtime.group);crowds.push(runtime);
 }
 const updateCrowds=time=>{landingRuntime?.prepareView?.(camera,canvas.width,canvas.height,{receiverFloorY:-16,lightDirection:sun.target.position.clone().sub(sun.position)},{offscreenEnabled:fleetCulling});landingRuntime?.update(time);fleetRuntime?.prepareView?.(camera,canvas.width,canvas.height,{receiverFloorY:-16,lightDirection:sun.target.position.clone().sub(sun.position)},{offscreenEnabled:fleetCulling});fleetRuntime?.update(time);if(!heroPlay?.active()&&!heroExplore?.active())heroRuntime.sample(time);for(const {a,id,phase} of archerReferences){const pose=a.sample(time,phase);if(id===archerId)diagnostics.archers.pose=pose;}if(archerRuntime){archerRuntime.update(time);diagnostics.archers.runtime=archerRuntime.stats();diagnostics.archers.pose=archerPhase(time,archerSync?0:layout.actors.find(p=>p.id===archerId).phaseOffset);}for(const runtime of crowds){if(runtime.time)runtime.time.value=time;else runtime.update(time,true);}};
 diagnostics.animatedActors=crowdMode==='static'?0:layout.actors.length;
 const status=document.querySelector('#status');status.innerHTML=`Troy Ãƒâ€š\u00b7 ${actual.toUpperCase()}<br>${layout.actors.filter(a=>a.faction==='greek').length+(shoreFleetEnabled?224:landingRuntime?28:0)+(fleetRuntime?112:0)} Greeks Ãƒâ€š\u00b7 ${layout.actors.filter(a=>a.faction==='trojan').length} Trojans Ãƒâ€š\u00b7 ${layout.ships.length+(shoreFleetEnabled?8:landingRuntime?1:0)+(fleetRuntime?4:0)} ships<br>${crowdMode==='static'?'Static comparison':'Animated idle formations'}; ${shoreFleetEnabled?(fleetRuntime.playbackPhase?'twelve landing ships':'four offshore ships; eight shore crews'):fleetRuntime?'four rowing ships; one landing':landingRuntime?'one landing ship active':'landing in development'}. ${archerMode==='reference'?'One equipped archer; 47 placeholders.':archerEnabled?'48 archers.':'Archers pending.'}<br>Drag to orbit Ãƒâ€š\u00b7 scroll or pinch to zoom`;
 const updateControls=()=>{if(continuous)limitOrbitEnvelope(camera.position,controls.target);controls.update();if(continuous)limitOrbitEnvelope(camera.position,controls.target);};
 const setView=name=>{const v=sceneViews[name];if(!v)throw Error(`Unknown view ${name}`);if(heroExplore?.active())heroExplore.stop();const framed=framePresetView(v,camera.aspect);camera.position.fromArray(framed.position);controls.target.fromArray(framed.target);updateControls();diagnostics.view=name;for(const b of document.querySelectorAll('nav button'))b.setAttribute('aria-pressed',String(b.dataset.view===name));};
 for(const [id,v] of Object.entries(sceneViews)){const b=document.createElement('button');b.textContent=v.label;b.dataset.view=id;b.addEventListener('click',()=>{if(heroPlay?.active())heroPlay.stop();setView(id);});document.querySelector('nav').append(b);scope.defer(()=>b.remove(),'view button');}
 setView(sceneQuery.get('view')||'arrival');
 const cityShadows=createCityShadowFocus({light:sun,casters:staticContacts,enabled:renderTier.shadows});
 const updateShadowFocus=()=>cityShadows.update(camera.position.toArray(),controls.target.toArray());
 const updateTerrainDetail=()=>{terrainDetail.updateLod(camera,terrain,mountains,sand,sandFar);updateShadowFocus();};
 if(sandFar){for(const material of [sand,sandFar]){terrain.material=material;await renderer.compileAsync(terrain,camera,scene);}for(const material of [terrainDetail.rock,terrainDetail.rockFar]){mountains.material=material;await renderer.compileAsync(mountains,camera,scene);}updateTerrainDetail();}
 const variantWarmup=sceneQuery.get('warmup')||'reference';if(!['reference','variants','passes','draws','landingPasses','landingDraw','handoffDraw'].includes(variantWarmup))throw Error('Invalid scene variant warmup');
 if(['passes','draws','variants'].includes(variantWarmup))cityShadows.warmCityCasters();
 diagnostics.variantWarmup={mode:variantWarmup};if(variantWarmup!=='reference'){const started=performance.now();let result;if(variantWarmup==='handoffDraw'){if(!fleetRuntime?.stats().lateLandings)throw Error('Handoff warmup needs later landings');result=await warmProductionPhase({sample:time=>{updateCrowds(time);prepareFleetVisibility();},time:260,restoreTime:0,draw:()=>warmScenePasses({T:THREE,renderer,scene,camera,precompile:false,admitVariants:false})});}else result=await (['passes','draws','landingPasses','landingDraw'].includes(variantWarmup)?warmScenePasses({T:THREE,renderer,scene,camera,root:startupDrawPolicy(variantWarmup).root==='scene'?scene:scene.getObjectByName('later-landing-wave'),precompile:startupDrawPolicy(variantWarmup).precompile}):compileSceneVariants({renderer,scene,camera}));diagnostics.variantWarmup={mode:variantWarmup,...result,elapsedMs:performance.now()-started};}
 updateShadowFocus();runtimeReader().release();
 let frozen=false,t=0,last=performance.now(),qualityStart=last;
 const setSceneTime=value=>{if(!Number.isFinite(value)||value<0)throw Error('Invalid scene time');t=value;waveTime.value=t;shoreWater.time.value=t;updateCrowds(t);};
 let landingControls=null;
 if(landingRuntime){
  const panel=document.createElement('section');panel.className='landing-controls';panel.setAttribute('aria-label','Landing playback');
  const play=document.createElement('button'),replay=document.createElement('button'),label=document.createElement('label'),range=document.createElement('input'),readout=document.createElement('output');
  play.textContent='Pause';play.onclick=()=>{frozen=!frozen;};replay.textContent='Replay landing';replay.onclick=()=>{setSceneTime(0);frozen=false;};
  range.type='range';range.min='0';range.max=String(landingRuntime.duration);range.step='any';range.value='0';range.setAttribute('aria-label','Landing time');range.oninput=()=>{frozen=true;setSceneTime(Number(range.value));};
  label.append('Landing time ',range);panel.append(play,replay,label,readout);document.body.append(panel);scope.defer(()=>panel.remove(),'landing panel');landingControls={play,range,readout,last:''};
 }
 const refreshLandingControls=()=>{if(!landingControls)return;const c=landingControls,shown=Math.min(t,landingRuntime.duration),complete=shown>=landingRuntime.duration,second=complete?Math.ceil(shown):Math.floor(shown),key=second+':'+complete;if(c.last!==key){c.readout.textContent=`${second} / ${Math.ceil(landingRuntime.duration)} s Ãƒâ€š\u00b7 ${fleetRuntime?.playbackPhase?.()??landingRuntime.stats().sequence.phase}`;c.last=key;}c.range.value=String(shown);c.play.textContent=frozen?'Play':'Pause';};
 const heroPanel=document.createElement('section');scope.defer(()=>heroPanel.remove(),'hero panel');heroPanel.className='hero-controls';heroPanel.setAttribute('aria-label','Hero duel playback');
 const heroPlayButton=document.createElement('button'),heroReset=document.createElement('button'),heroLabel=document.createElement('label'),heroRange=document.createElement('input'),heroReadout=document.createElement('output');
 heroPlay=scope.use(createHeroPlay(THREE,{canvas,pair:heroRuntime,groundHeight:contactGround.heightAt,camera,controls,onBeforeStart:()=>heroExplore?.stop(),onStart:()=>{frozen=false;},onStop:()=>heroRuntime.reset(t),onPause:()=>{frozen=true;},onResume:()=>{frozen=false;},isPaused:()=>frozen}),'hero controls');
 heroPlayButton.id='hero-play';heroPlayButton.onclick=()=>{heroExplore?.stop();if(heroPlay.active())heroPlay.stop();const s=heroRuntime.stats();if(s.mode==='face-off'||s.complete){heroRuntime.start(t);frozen=false;setView('heroDuel');}else frozen=!frozen;};
 heroReset.id='hero-reset';heroReset.textContent='Reset face-off';heroReset.onclick=()=>{heroExplore?.stop();if(heroPlay.active())heroPlay.stop();heroRuntime.reset(t);};
 heroRange.type='range';heroRange.min='0';heroRange.max=String(heroRuntime.stats().duration);heroRange.step='any';heroRange.id='hero-time';heroRange.setAttribute('aria-label','Hero duel time');heroRange.oninput=()=>{frozen=true;heroRuntime.seek(Number(heroRange.value),t);};
 heroLabel.append('Duel time ',heroRange);heroPanel.append(heroPlayButton,heroReset,heroLabel,heroReadout,heroPlay.element);document.body.append(heroPanel);
 let sceneControls=null;for(const node of[heroPlayButton,heroReset,heroLabel,heroReadout])node.classList.add('duel-playback');
 const refreshHeroControls=()=>{const s=heroRuntime.stats(),exploring=heroExplore?.active();sceneControls?.update(exploring?'explore':heroPlay.active()?'fight':'overview');heroPanel.classList.toggle('exploring',Boolean(exploring));heroPlayButton.textContent=heroPlay.active()||exploring?'Watch paired duel':s.mode==='face-off'?'Start duel':s.complete?'Replay duel':frozen?'Play duel':'Pause duel';heroRange.disabled=heroPlay.active()||exploring;heroLabel.hidden=Boolean(exploring);heroRange.value=String(s.elapsed);heroReadout.textContent=exploring?'Exploring Troy':heroPlay.active()?'Playable arena Ãƒâ€š\u00b7 Leave fight to return to face-off':`${s.elapsed.toFixed(1)} / ${s.duration.toFixed(1)} s Ãƒâ€š\u00b7 ${s.phase}`;};
 if(sceneQuery.get('duel')==='1')heroRuntime.start(0);refreshHeroControls();
 let worldContacts=null,exploreReturnView=null,worldContactsClosed=false;const getWorldContacts=()=>{if(worldContactsClosed)throw Error('Exploration contacts closed');if(!worldContacts){scene.updateMatrixWorld(true);worldContacts=createWorldContacts(THREE,{staticMeshes:staticContacts,dynamicMeshes:()=>[...gateBatches.values()]});}return worldContacts;};const explorationWorld=scope.use({blocked:box=>getWorldContacts().blocked(box),cameraDistance:(...args)=>getWorldContacts().cameraDistance(...args),stats:()=>worldContacts?.stats()??{staticRecords:0,cells:0,queries:0,triangleChecks:0,disposed:worldContactsClosed},dispose(){worldContactsClosed=true;worldContacts?.dispose();worldContacts=null;}},'exploration contacts');
 heroExplore=scope.use(createHeroExplorePlay(THREE,{canvas,pair:heroRuntime,groundHeight:contactGround.heightAt,world:explorationWorld,gate:cityGate,camera,controls,onBeforeStart:()=>{if(heroPlay.active())heroPlay.stop();},onStart:()=>{frozen=false;exploreReturnView=diagnostics.view;diagnostics.view='exploring';for(const b of document.querySelectorAll('nav button'))b.setAttribute('aria-pressed','false');},onStop:()=>{heroRuntime.reset(t);diagnostics.view=exploreReturnView??'heroes';for(const b of document.querySelectorAll('nav button'))b.setAttribute('aria-pressed',String(b.dataset.view===diagnostics.view));},onPause:()=>{frozen=true;},onResume:()=>{frozen=false;},isPaused:()=>frozen}),'exploration controls');heroPanel.append(heroExplore.element);
 const gatePanel=document.createElement('section');gatePanel.className='gate-controls';gatePanel.setAttribute('aria-label','Troy gate');const gateButton=document.createElement('button'),gateReadout=document.createElement('output');gateButton.textContent='Open gate';gateButton.onclick=()=>{cityGate.setOpen(!cityGate.stats().targetOpen);};gatePanel.append(gateButton,gateReadout);document.body.append(gatePanel);scope.defer(()=>gatePanel.remove(),'gate panel');
 let gateUiKey='';const refreshGateControls=()=>{const s=cityGate.stats(),key=[s.targetOpen,s.moving,s.openness===1,s.blockedByOccupant,diagnostics.view==='gate'].join(':');if(key===gateUiKey)return;gateUiKey=key;gateButton.textContent=s.targetOpen?'Close gate':'Open gate';gateReadout.textContent=s.moving?(s.blockedByOccupant?'Gate waiting Ãƒâ€š\u00b7 step clear':s.targetOpen?'Opening':'Closing'):s.openness===1?'Gate open':'Gate closed';gatePanel.hidden=diagnostics.view!=='gate';};refreshGateControls();
 sceneControls=scope.use(createSceneControls({canvas,heroPanel,nav:document.querySelector('nav'),status,landingPanel:document.querySelector('.landing-controls'),gatePanel,onExplore:()=>heroExplore.active()?heroExplore.stop():heroExplore.start(heroPlay.stats().player??'achilles'),onFight:()=>heroPlay.active()?heroPlay.stop():heroPlay.start(heroExplore.stats().player??'achilles')}),'scene HUD');
 const animate=()=>{const now=performance.now(),dt=Math.min(.05,(now-last)/1000);if(!frozen&&qualityMode==='auto'&&document.visibilityState==='visible')applyWaterTier(qualityController.sample(now-last,now-qualityStart));last=now;if(!frozen)t+=dt;waveTime.value=t;shoreWater.time.value=t;updateControls();heroPlay.update(frozen?0:dt);heroExplore.update(frozen?0:dt);cityGate.update(dt);updateTerrainDetail();updateCrowds(t);refreshLandingControls();refreshHeroControls();refreshGateControls();prepareFleetVisibility();renderer.render(scene,camera);diagnostics.renderedFrames=(diagnostics.renderedFrames??0)+1;diagnostics.renderedTime=t;};
 scope.defer(()=>renderer.setAnimationLoop(null),'animation loop');renderer.setAnimationLoop(animate);
 const onResize=()=>{const preset=sceneViews[diagnostics.view],old=preset&&framePresetView(preset,camera.aspect),untouched=old&&camera.position.distanceTo(new THREE.Vector3(...old.position))<1e-5&&controls.target.distanceTo(new THREE.Vector3(...old.target))<1e-5;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(untouched)setView(diagnostics.view);};addEventListener('resize',onResize);scope.defer(()=>removeEventListener('resize',onResize),'resize listener');
 async function measureWater(mode,view,frames=120){
  if(!Number.isInteger(frames)||frames<1||frames>600)throw Error('Bounded sample count required');
  renderer.setAnimationLoop(null);frozen=true;
  if(typeof view==='object'&&view!==null){
   if(![view.position,view.target].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))throw Error('Invalid measurement camera');
   camera.position.fromArray(view.position);controls.target.fromArray(view.target);updateControls();
  }else setView(view);
  setWaterMode(mode);
  const gpuSupported=renderer.backend.trackTimestamp===true,cpu=[],gpu=[],cpuUpdate=[],cpuSceneWork=[];
  if(gpuSupported)await renderer.resolveTimestampsAsync();
  try{for(let i=0;i<frames+20;i++){
   await new Promise(r=>requestAnimationFrame(r));const updateBegin=performance.now();t=i/60;waveTime.value=t;shoreWater.time.value=t;controls.update();updateCrowds(t);prepareFleetVisibility();
   updateTerrainDetail();const begin=performance.now();renderer.render(scene,camera);const elapsed=performance.now()-begin;
   const duration=gpuSupported?await renderer.resolveTimestampsAsync():null;
   if(i>=20){const updateMs=begin-updateBegin;cpu.push(elapsed);cpuUpdate.push(updateMs);cpuSceneWork.push(updateMs+elapsed);gpu.push(Number.isFinite(duration)&&duration>0?duration:null);}
  }}finally{last=performance.now();renderer.setAnimationLoop(animate);}
  return {mode,view,frames,cpuUpdateMs:cpuUpdate,cpuSubmissionMs:cpu,cpuSceneWorkMs:cpuSceneWork,gpuRenderMs:gpu,gpuSupported,scope:'Warmed whole-scene CPU update/render work and GPU timestamps with per-frame readback; excludes readback wait and natural frame pacing; not final qualification'};
 }
 diagnostics.stage='Troy';diagnostics.limitations=['Army formations are environment motion; projectile damage and army collision are outside this scene.','Ground routes and hinged gates are supported; ship boarding and wall climbing are outside the interaction.','Naval crews retain their rowing equipment and hip swords; shielded infantry and both heroes are separate roles.','Reduced device quality omits directional shadows. Recorded desktop and tablet timings have explicit workload scopes.'];
 window.troy={ready:true,
  setGateOpen:value=>cityGate.setOpen(value),
  setFleetCulling(value){fleetCulling=Boolean(value);prepareFleetVisibility();},verifyShoreBindings:()=>landingRuntime?.verifyBindings?.(),
  measureWater,setView,setWaterQuality,setWaterMode,setTime:setSceneTime,
  startDuel(){heroExplore.stop();if(heroPlay.active())heroPlay.stop();return heroRuntime.start(t);},resetDuel(){heroExplore.stop();if(heroPlay.active())heroPlay.stop();return heroRuntime.reset(t);},setDuelTime(value){heroExplore.stop();if(heroPlay.active())heroPlay.stop();return heroRuntime.seek(value,t);},
  exploreHero:side=>heroExplore.start(side),leaveExploration:()=>heroExplore.stop(),advanceExploration:(dt,input)=>heroExplore.advance(dt,input),explorationCamera:value=>heroExplore.setCameraIntent(value),
  playHero(side){return heroPlay.start(side);},leaveFight:()=>heroPlay.stop(),fightAttack:kind=>heroPlay.attack(kind),advanceFight:dt=>heroPlay.update(dt),followFight:value=>heroPlay.setFollow(value),
  heroPose:()=>heroPlay.poseSnapshot(),
 environmentShaders:()=>Promise.all([renderer.debug.getShaderAsync(scene,camera,terrain),renderer.debug.getShaderAsync(scene,camera,mountains)]),
  cameraTransform:()=>({quaternion:camera.quaternion.toArray(),world:camera.matrixWorld.toArray(),view:camera.matrixWorldInverse.toArray(),projection:camera.projectionMatrix.toArray()}),
  setCamera(position,target){heroExplore.stop();if(heroPlay.active())heroPlay.setFollow(false);camera.position.fromArray(position);controls.target.fromArray(target);updateControls();},freeze(value=true){frozen=value;},
  stats(){return {...diagnostics,shadowFocus:cityShadows.stats(),lifecycle:scope.stats(),gate:cityGate.stats(),exploration:heroExplore.stats(),fleetCulling,fleetResources:fleetResources.map(r=>r.stats()),poseTextures:poseTextures.stats(),rendererMemory:{...renderer.info.memory},landing:landingRuntime?.stats()??null,fleet:fleetRuntime?.stats()??null,heroes:heroRuntime.stats(),combat:heroPlay.stats(),counts:Object.fromEntries(Object.entries(layout).map(([k,v])=>[k,v.length])),render:structuredClone(renderer.info.render),camera:{position:camera.position.toArray(),target:controls.target.toArray(),near:camera.near,far:camera.far,reversedDepth:camera.reversedDepth},canvas:{width:canvas.width,height:canvas.height},motionTime:t};},
  dispose:scope.close
 };
 }catch(error){await scope.close().catch(cleanup=>{diagnostics.cleanupError=String(cleanup.stack||cleanup);});window.troy={ready:false,stats:startupStats,dispose:scope.close};throw error;}
}

