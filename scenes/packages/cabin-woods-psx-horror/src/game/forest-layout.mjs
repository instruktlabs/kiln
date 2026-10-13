/** Deterministic consumer woodland, measured against exact selected asset footprints.
 * Saved assets/materials are immutable. Circle admission uses complete projected
 * canopies/props; player collision uses solid nominal trunk and rock proxies.
 */
export const FOREST_ASSETS={
  "pine": {
    "radius": 2.26042158411639,
    "trunkRadius": 0.26000000988021804,
    "height": 6.211400124926224,
    "bounds": {
      "min": [
        -2.2260946251852665,
        0,
        -2.014127432454717
      ],
      "max": [
        2.042889846337027,
        6.211400124926224,
        2.2320944988865747
      ]
    },
    "pin": {
      "assetId": "a_24330aa1ba4b46cdb552f3d33519c547",
      "revisionId": "r_d1da744f36f846caad2451023f95a8a6",
      "sha256": "1ae6f9d27c2ea9e2d9a6662d8f47630ea025f8fb3661afad2a1898039f9e7d7f"
    }
  },
  "birch": {
    "radius": 3.1321018916049956,
    "trunkRadius": 0.23105151446868324,
    "height": 7.864383220672607,
    "bounds": {
      "min": [
        -2.7012882232666016,
        0,
        -2.5560903549194336
      ],
      "max": [
        2.937908887863159,
        7.864383220672607,
        2.398845911026001
      ]
    },
    "pin": {
      "assetId": "a_914e104ce91042489cb006753c7390ff",
      "revisionId": "r_f9ef1649dfcd4c498aae87242bcf7d7e",
      "sha256": "10628c8c8b039e97ff6f678e948273916a35c38cab368b4ce11a45f51b96fec0"
    }
  },
  "rock": {
    "radius": 0.942716228310804,
    "trunkRadius": 0,
    "height": 0.9200000166893005,
    "bounds": {
      "min": [
        -0.7292035818099976,
        0,
        -0.5946806073188782
      ],
      "max": [
        0.9425692558288574,
        0.9200000166893005,
        0.5324239134788513
      ]
    },
    "pin": {
      "assetId": "a_90ce1af32ada4c4a90ecbcf73b61f1d3",
      "revisionId": "r_2521822586d84bbaae40dcce9a91e649",
      "sha256": "e50b2a05c909575e6ca9894ebb345c0ca1ca683746100281892329f0d47e9e5d"
    }
  },
  "bush": {
    "radius": 0.6238453194804062,
    "trunkRadius": 0,
    "height": 1.3271299986374032,
    "bounds": {
      "min": [
        -0.5974748672230781,
        -0.07581447460142571,
        -0.6011762960354612
      ],
      "max": [
        0.6074043115357028,
        1.2513155240359775,
        0.5872944352478532
      ]
    },
    "pin": {
      "assetId": "a_c72f32ed22a045c5b1f7337247635790",
      "revisionId": "r_e4ccf94b9b3b44519316304ef009ed82",
      "sha256": "503e045d02672d12def276a5a510147b1ec8f143567b52c5e3d5ede3ba23629d"
    }
  },
  "woodBundle": {
    "radius": 0.3400000111776241,
    "trunkRadius": 0,
    "height": 0.26232421901047354,
    "bounds": {
      "min": [
        -0.30000001192092896,
        -0.14166311879083518,
        -0.18006311879083514
      ],
      "max": [
        0.30000001192092896,
        0.12066110021963837,
        0.16700000021606684
      ]
    },
    "pin": {
      "assetId": "a_30e84d7c2e2a444494a11b1929db07ba",
      "revisionId": "r_81f9675a0a35485686c6bc97ce8f862d",
      "sha256": "f9eb5b12440ad49c8cb389b1766f4aee726612518ad3a6d3c15af0a26abde0b6"
    }
  },
  "shells": {
    "radius": 0.030799999676644804,
    "trunkRadius": 0,
    "height": 0.06380000099306926,
    "bounds": {
      "min": [
        -0.0307999996766448,
        2.0209699040131535e-11,
        -0.01217352319508791
      ],
      "max": [
        0.030799999676644804,
        0.06380000101327896,
        0.01217352319508791
      ]
    },
    "pin": {
      "assetId": "a_679acc21bed649dcb48b93b5b4a6798a",
      "revisionId": "r_a46643a06a8d403baba730724211f696",
      "sha256": "1fa3fd658cfafc32f0a0a4ea251bba2ff336a506e4dba6313c7d3e6cdaab9a15"
    }
  }
};
export const FOREST_RESERVATIONS=Object.freeze([{id:'cabin-porch-overhang',minX:-5.320000171661377,maxX:7.150000095367432,minZ:-6.320000171661377,maxZ:7.600000011920929},{id:'workyard-stations-and-use',minX:-1.9,maxX:7,minZ:5.8,maxZ:12.5}]);
export function pathCenter(x){return .2+Math.sin((x-5.3)/.625*.09)*1.1;}
export function pointSegmentDistance(p,a,b){const dx=b[0]-a[0],dz=b[2]-a[2],length=dx*dx+dz*dz,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/length)):0;return Math.hypot(p[0]-a[0]-dx*t,p[2]-a[2]-dz*t);}
export function rectangleDistance(p,b){return Math.hypot(Math.max(b.minX-p[0],0,p[0]-b.maxX),Math.max(b.minZ-p[2],0,p[2]-b.maxZ));}
const mainPoints=Array.from({length:18},(_,i)=>{const x=5.3+i*3;return[x,0,pathCenter(x)];});
export function createPathNetwork(){return[{id:'main',label:'Cabin to woodland trail',halfWidth:1.05,points:mainPoints.map(p=>[...p])},{id:'harvest-loop',label:'Harvest and deep woodland loop',halfWidth:.9,loop:true,points:[[12,0,pathCenter(12)],[11,0,-4],[9.2,0,-8],[10,0,-12.3],[17.5,0,-13],[25,0,-17],[31,0,-16],[38,0,-18],[47,0,-18],[47,0,-10],[40,0,-5],[37,0,pathCenter(37)],[31,0,pathCenter(31)],[25,0,pathCenter(25)],[19,0,pathCenter(19)],[12,0,pathCenter(12)]]},{id:'yard-link',label:'Workyard to eastern woodland',halfWidth:.95,points:[[.5,0,6.5],[3,0,12.9],[8.2,0,14],[12.8,0,12.5],[14.2,0,10.5],[14.2,0,7.7],[15,0,4],[19.5,0,4],[22,0,pathCenter(22)]]},{id:'southern-loop',label:'Mixed birch return loop',halfWidth:.85,loop:true,points:[[22,0,pathCenter(22)],[23,0,8],[28,0,14],[37,0,17],[45,0,11],[48,0,6],[49,0,pathCenter(49)],[43,0,pathCenter(43)],[36,0,pathCenter(36)],[29,0,pathCenter(29)],[22,0,pathCenter(22)]]},{id:'harvest-access-1',harvestId:'pine-harvest-1',label:'Pine trunk approach',halfWidth:.3,points:[[9.2,0,-8],[12.2,0,-8]]},{id:'harvest-access-2',harvestId:'pine-harvest-2',label:'Workyard pine approach',halfWidth:.3,points:[[14.2,0,8],[17.2,0,8]]},{id:'harvest-access-3',harvestId:'pine-harvest-3',label:'Deep pine approach',halfWidth:.3,points:[[25,0,pathCenter(25)],[25,0,-8],[27.2,0,-8]]},{id:'harvest-access-4',harvestId:'pine-harvest-4',label:'Return trail pine approach',halfWidth:.3,points:[[40,0,-5],[40,0,-12],[42.2,0,-12]]},{id:'harvest-access-5',harvestId:'pine-harvest-5',label:'Eastern pine approach',halfWidth:.3,points:[[49,0,pathCenter(49)],[49,0,8],[51.2,0,8]]},{id:'harvest-access-6',harvestId:'pine-harvest-6',label:'Southern pine approach',halfWidth:.3,points:[[28,0,14],[25,0,22],[27.2,0,22]]},{id:'battery-cache-link',label:'Small supply cache branch',halfWidth:.8,points:[[17,0,pathCenter(17)],[17,0,-4.5]]}];}
export function nearestForestPath(position,paths=createPathNetwork()){let distance=Infinity,path=null;for(const p of paths)for(let i=1;i<p.points.length;i++){const d=pointSegmentDistance(position,p.points[i-1],p.points[i]);if(d<distance){distance=d;path=p;}}return{distance,path};}
/** Compatibility query: centre clearance to path, not a footprint guarantee. */
export function forestClearance(position,centrePathClearance=3.2){return FOREST_RESERVATIONS.every(b=>rectangleDistance(position,b)>=3)&&nearestForestPath(position).distance>=centrePathClearance;}
function transformedBounds(asset,p,scale,yaw){const c=Math.cos(yaw),s=Math.sin(yaw),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const x of[asset.bounds.min[0],asset.bounds.max[0]])for(const y of[asset.bounds.min[1],asset.bounds.max[1]])for(const z of[asset.bounds.min[2],asset.bounds.max[2]]){const v=[p[0]+scale*(c*x+s*z),p[1]+scale*y,p[2]+scale*(-s*x+c*z)];for(let i=0;i<3;i++){min[i]=Math.min(min[i],v[i]);max[i]=Math.max(max[i],v[i]);}}return{min,max};}
export function createForestLayout(options={}){
 const targetTrees=options.targetTrees??305;if(!Number.isInteger(targetTrees)||targetTrees<6||targetTrees>600)throw new TypeError('targetTrees6..600 integer');let seed=options.seed??82419;const unit=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},paths=createPathNetwork(),nightmanSpawn=[34,0,-26];
 const pickups=[{id:'battery-cache',kind:'batteries',amount:1,position:[17,0,-4.5],clearanceRadius:1.4,presentationScale:2.5},{id:'shell-cache',kind:'shells',amount:4,position:[24,0,1.8],clearanceRadius:1.4},{id:'wood-cache-near',kind:'logs',amount:2,position:[15.7,0,1.45],clearanceRadius:1.4},{id:'wood-cache-deep',kind:'logs',amount:2,position:[39,0,-9.5],clearanceRadius:1.4},{id:'shell-cache-ridge',kind:'shells',amount:4,position:[47,0,-18],clearanceRadius:1.4}];
 const creaturePads=[{id:'spider-path',position:[15,0,2.2],radius:1},{id:'spider-tree',position:[21,0,-4],radius:1},{id:'stone-golem',position:nightmanSpawn,radius:1}];const clumpCentres=[[-30,-29],[-13,-34],[8,-32],[22,-24],[34,-30],[52,-29],[64,-13],[55,14],[40,29],[17,28],[-7,29],[-28,15],[-36,-3],[-15,-15],[31,9]].map(([x,z],i)=>({id:'clump-'+i,position:[x,0,z],radius:7+unit()*4}));
 function footprintClear(p,radius,harvestId=null,trunkRadius=0){if(!FOREST_RESERVATIONS.every(b=>rectangleDistance(p,b)>=radius+3))return false;for(const path of paths)for(let i=1;i<path.points.length;i++)if(pointSegmentDistance(p,path.points[i-1],path.points[i])<path.halfWidth+(path.harvestId===harvestId&&harvestId?trunkRadius:radius)+.22)return false;if(creaturePads.some(q=>Math.hypot(p[0]-q.position[0],p[2]-q.position[2])<q.radius+radius))return false;if(pickups.some(q=>Math.hypot(p[0]-q.position[0],p[2]-q.position[2])<q.clearanceRadius+radius))return false;return true;}
 const trees=[];function tree(id,key,position,scale,harvest,clumpId=null){const a=FOREST_ASSETS[key];return{id,key,position,scale,harvest,clumpId,rotationY:unit()*Math.PI*2,canopyRadius:a.radius*scale,colliderRadius:a.trunkRadius*scale,height:a.height*scale};}
 for(const[id,p,scale]of[['pine-harvest-1',[13,0,-8],1],['pine-harvest-2',[18,0,8],1.05],['pine-harvest-3',[28,0,-8],.98],['pine-harvest-4',[43,0,-12],1.04],['pine-harvest-5',[52,0,8],1.03],['pine-harvest-6',[28,0,22],.95]]){const t=tree(id,'pine',p,scale,true);if(!footprintClear(p,t.canopyRadius,id,t.colliderRadius))throw Error('Harvest footprint no longer clear '+id);trees.push(t);}
 function acceptsTree(p,scale,key){if(!footprintClear(p,FOREST_ASSETS[key].radius*scale))return false;if(Math.hypot(p[0]-nightmanSpawn[0],p[2]-nightmanSpawn[2])<2.2)return false;return trees.every(t=>Math.hypot(p[0]-t.position[0],p[2]-t.position[2])>=2.75);}
 const screen=tree('woodland-screen-1','pine',[29.2,0,-21.45],1.03,false,'screen-line');if(!acceptsTree(screen.position,screen.scale,screen.key))throw Error('Screen tree clearance');trees.push(screen);
 // Irregular local cohorts create overlapping upper crowns with clear solid trunks.
 for(let attempt=0;attempt<22000&&trees.length<targetTrees;attempt++){const cluster=clumpCentres[attempt%clumpCentres.length],clustered=attempt<1600||unit()<.7,angle=unit()*Math.PI*2,r=Math.sqrt(unit())*cluster.radius,position=clustered?[cluster.position[0]+Math.cos(angle)*r,0,cluster.position[2]+Math.sin(angle)*r]:[-40+unit()*112,0,-46+unit()*94],key=unit()<.4?'birch':'pine',scale=.84+unit()*.29;if(!acceptsTree(position,scale,key))continue;trees.push(tree('woodland-'+trees.length,key,position,scale,false,clustered?cluster.id:null));}
 const rocks=[],bushes=[],rockPlacements=[],bushPlacements=[];
 function placeProp(key,points,placements,target){for(let attempts=0;attempts<10000&&points.length<target;attempts++){const i=points.length,scale=key==='rock'?.7+(i%3)*.2:.8+(i%3)*.15,yaw=i*(key==='rock'?1.3:2.1),p=[-35+unit()*101,0,-42+unit()*88],radius=FOREST_ASSETS[key].radius*scale;if(!footprintClear(p,radius)||Math.hypot(p[0]-34,p[2]+26)<2.2+radius)continue;if(trees.some(t=>Math.hypot(p[0]-t.position[0],p[2]-t.position[2])<t.colliderRadius+radius+.45))continue;if([...rockPlacements,...bushPlacements].some(q=>Math.hypot(p[0]-q.position[0],p[2]-q.position[2])<q.footprintRadius+radius+.45))continue;points.push(p);placements.push({id:key+'-'+i,key,position:p,scale,rotationY:yaw,footprintRadius:radius,colliderRadius:key==='rock'?radius:0,bounds:transformedBounds(FOREST_ASSETS[key],p,scale,yaw)});}}
 placeProp('rock',rocks,rockPlacements,42);placeProp('bush',bushes,bushPlacements,55);
 return{version:'woodland.layout.v2',seed:options.seed??82419,trees,rocks,bushes,rockPlacements,bushPlacements,nightmanSpawn,pathNetwork:paths,clumpCentres,pickups,creaturePads,reservations:FOREST_RESERVATIONS.map(b=>({...b})),placementPolicy:{houseAndWorkyardClearance:3,trunkCentreMinimum:2.75,pathMargin:.22,footprintAdmission:'Exact saved full projected radius, scale applied; bounds are transformed conservative sourceAABBs',colliders:'Pine nominal trunk.260m,birch.231m lowertrunk envelope; full rock radius.943m. Canopy/branches are not solid actor collision.'}};
}
