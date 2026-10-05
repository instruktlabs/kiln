const meta={name:'van-delivery',role:'vehicle'};
const PAINT=0xebebeb;
const TEST_YAW=0, TEST_ROLL=0;
function materials(){const spec={Paint:[PAINT,.3,0],Trim:[0x181a1c,.7,0],Glass:[0x12161a,.05,0],Chrome:[0xc6cbd0,.2,1],Tyre:[0x222222,.9,0],Rim:[0xa8adb1,.4,1],Headlight:[0xffffff,.3,0,0xffffff,.45],Taillight:[0x9b1616,.4,0,0xff1515,.12],BrakeLight:[0xa92020,.4,0,0xff1515,.25],Plate:[0xe6e6df,.65,0]};const m={};for(const [n,s]of Object.entries(spec)){m[n]=gameMaterial(s[0],{roughness:s[1],metalness:s[2],emissive:s[3]||0,emissiveIntensity:s[4]||0,flatShading:false});m[n].name=n;}return m;}
function group(n,p,pos=[0,0,0]){const g=new THREE.Group();g.name=n;g.position.set(...pos);p.add(g);return g;}
const coverage=(r,d)=>Math.PI*(r/(2*d*Math.tan(25*Math.PI/180)))**2/(16/9);
function prism(profile,depth){const p=[],idx=[];for(const z of [-depth/2,depth/2])for(const [x,y]of profile)p.push(x,y,z);const n=profile.length;for(let i=1;i<n-1;i++){idx.push(0,i+1,i,n,n+i,n+i+1);}for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+j,i,n+j,n+i);}const g=meshGeo({positions:p,indices:idx});const out=g.toNonIndexed();out.computeVertexNormals();return out;}
function build(){const root=createRoot('van-delivery'),m=materials();
function body(parent,lod){const pre='L'+lod+'_';const box=(n,s,p,mat='Trim',rot)=>createPart(pre+n,boxGeo(...s),m[mat],{parent,position:p,rotation:rot});
box('Frame',[5.68,.14,.6],[0,.58,0]);box('BodyMount',[5.76,.24,.72],[0,.74,0]);
if(lod===2)box('Body',[5.74,1.75,1.82],[0,1.725,0],'Paint');else createPart(pre+'BodyShell',prism([[-2.87,.85],[2.85,.85],[2.85,1.7],[2.52,2.56],[2.32,2.6],[-2.87,2.6]],1.82),m.Paint,{parent});
box('FrontBumper',[.12,.28,1.91],[2.94,.79,0]);box('RearBumper',[.12,.28,1.91],[-2.94,.79,0]);
if(lod===2){box('Windshield',[.024,.7,1.64],[2.883,2.08,0],'Glass');return;}
for(const [i,x]of [1.85,-1.85].entries()){box('Axle'+i,[.1,.1,1.75],[x,.36,0]);box('Suspension'+i,[.3,.25,.55],[x,.48,0]);}
box('Windshield',[.024,.77,1.65],[2.719,2.10,0],'Glass',[0,0,20.99]);box('Grille',[.025,.24,1.0],[2.865,1.24,0]);
for(const s of [-1,1]){createPart(pre+'SideGlass'+s,prism([[1.15,1.78],[2.78,1.78],[2.53,2.43],[1.15,2.43]],.015),m.Glass,{parent,position:[0,0,s*.916]});
box('MirrorArm'+s,[.15,.045,.12],[2.35,1.84,s*.943]);box('Mirror'+s,[.09,.22,.08],[2.35,1.91,s*.985]);
box('Headlamp'+s,[.03,.22,.34],[2.866,1.25,s*.64],'Headlight');
box('Tail'+s,[.03,.42,.16],[-2.875,1.38,s*.81],'Taillight');box('Brake'+s,[.03,.18,.16],[-2.875,1.76,s*.81],'BrakeLight');
box('Sill'+s,[5.56,.085,.065],[-.03,.91,s*.917]);
if(lod===0){box('FrontDoorSeam'+s,[.016,1.35,.012],[1.08,1.54,s*.922]);box('CargoDoorFront'+s,[.014,1.56,.012],[.58,1.68,s*.922]);box('CargoDoorRear'+s,[.014,1.56,.012],[-1.72,1.68,s*.922]);box('CargoTrack'+s,[2.42,.025,.014],[-.62,1.86,s*.926]);box('HandleFront'+s,[.18,.055,.028],[1.29,1.62,s*.932]);box('HandleCargo'+s,[.18,.055,.028],[.34,1.64,s*.932]);box('RearHinge'+s,[.025,.11,.08],[-2.875,2.19,s*.75]);}}
box('PlateFront',[.016,.14,.38],[3.005,.82,0],'Plate');box('PlateRear',[.016,.14,.38],[-3.005,1.03,0],'Plate');box('PlateRearMount',[.15,.24,.52],[-2.94,1.03,0],'Paint');
if(lod===0){box('RearDoorSplit',[.014,1.58,.018],[-2.879,1.7,0]);for(const s of [-1,1])box('RearHandle'+s,[.026,.06,.19],[-2.886,1.65,s*.22]);box('WiperL',[.026,.025,.52],[2.857,1.77,-.37],'Trim',[0,0,21]);box('WiperR',[.026,.025,.52],[2.857,1.77,.37],'Trim',[0,0,21]);}
}
const tiers=[0,1,2].map(l=>{const g=group('LOD'+l,root);body(g,l);return g;});const r=new THREE.Box3().setFromObject(tiers[0]).getBoundingSphere(new THREE.Sphere()).radius;defineLod(tiers,{screenCoverage:[coverage(r,80),coverage(r,300),0]});
for(const [a,x]of [['F',1.85],['R',-1.85]])for(const s of [-1,1]){const n='Wheel_'+a+(s<0?'L':'R');const p=group(n,root,[x,.36,s*.88]);const near=group(n+'_LOD0',p),far=group(n+'_LOD1',p);createPart(n+'_Tyre',cylinderGeo(.36,.36,.22,24),m.Tyre,{parent:near,rotation:[90,0,0]});createPart(n+'_Rim',cylinderGeo(.22,.22,.24,16),m.Rim,{parent:near,rotation:[90,0,0]});createPart(n+'_Hub',cylinderGeo(.08,.08,.25,12),m.Trim,{parent:near,rotation:[90,0,0]});defineLod([near,far],{screenCoverage:[coverage(.36,300),0]});p.rotation.set(0,a==='F'?TEST_YAW:0,TEST_ROLL);}return root;}