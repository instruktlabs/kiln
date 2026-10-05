const meta={name:'truck-tractor',role:'vehicle'};
const PAINT=0xebebeb;
const TEST_YAW=0, TEST_ROLL=0;
function materials(){const spec={Paint:[PAINT,.3,0],Trim:[0x181a1c,.7,0],Glass:[0x12161a,.05,0],Chrome:[0xc6cbd0,.2,1],Tyre:[0x222222,.9,0],Rim:[0xa8adb1,.4,1],Headlight:[0xffffff,.3,0,0xffffff,.45],Taillight:[0x9b1616,.4,0,0xff1515,.12],BrakeLight:[0xa92020,.4,0,0xff1515,.25],Plate:[0xe6e6df,.65,0]};const m={};for(const [n,s]of Object.entries(spec)){m[n]=gameMaterial(s[0],{roughness:s[1],metalness:s[2],emissive:s[3]||0,emissiveIntensity:s[4]||0,flatShading:false});m[n].name=n;}return m;}
function group(n,p,pos=[0,0,0]){const g=new THREE.Group();g.name=n;g.position.set(...pos);p.add(g);return g;}
const coverage=(r,d)=>Math.PI*(r/(2*d*Math.tan(25*Math.PI/180)))**2/(16/9);
function prism(profile,depth){const p=[],idx=[];for(const z of [-depth/2,depth/2])for(const [x,y]of profile)p.push(x,y,z);const n=profile.length;for(let i=1;i<n-1;i++){idx.push(0,i+1,i,n,n+i,n+i+1);}for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+j,i,n+j,n+i);}const g=meshGeo({positions:p,indices:idx});const out=g.toNonIndexed();out.computeVertexNormals();return out;}
function build(){const root=createRoot('truck-tractor'),m=materials();
function body(parent,lod){const pre='L'+lod+'_';const box=(n,s,p,mat='Trim',rot)=>createPart(pre+n,boxGeo(...s),m[mat],{parent,position:p,rotation:rot});
box('Frame',[6.56,.24,.76],[0,.94,0]);box('CabMount',[2.8,.27,.74],[1.8,1.18,0]);box('FifthMount',[.65,.15,.7],[-1.65,1.115,0]);if(lod<2){for(const [i,x] of [2.15,-1.475,-2.825].entries()){box('Axle'+i,[.15,.15,1.85],[x,.52,0]);box('Suspension'+i,[.45,.34,.62],[x,.71,0]);}for(const s of [-1,1])box('GuardBracket'+s,[1.7,.1,.7],[-2.15,1.08,s*.6]);}box('Cab', [2.15,2.05,2.12],[1.175,2.325,0],'Paint');
if(lod<2){parent.remove(parent.children[parent.children.length-1]);createPart(pre+'CabShell',prism([[.1,1.3],[2.3,1.3],[2.3,2.2],[1.92,3.35],[.1,3.35]],2.12),m.Paint,{parent});}
box('Hood',[1.0,.66,1.72],[2.78,1.61,0],'Paint');
box('FrontBumper',[.24,.25,2.3],[3.28,.88,0]);
box('RearBumper',[.16,.18,2.1],[-3.32,.8,0]);
box('FifthWheel',[.9,.12,.95],[-1.65,1.19,0]);
if(lod===2){box('Windshield',[.05,.8,1.8],[2.276,2.7,0],'Glass',[0,0,0]);return;}
box('Windshield',[.025,.87,1.84],[2.093,2.8,0],'Glass',[0,0,18.3]);
for(const s of [-1,1]){const side=s<0?'L':'R';createPart(pre+'SideGlass'+side,prism([[.29,2.35],[2.2,2.35],[1.91,3.17],[.29,3.17]],.02),m.Glass,{parent,position:[0,0,s*1.069]});
box('Step'+side,[1.25,.16,.25],[.9,1.23,s*1.14]);
box('MirrorArm'+side,[.22,.055,.26],[2.03,2.54,s*1.13]);
box('Mirror'+side,[.13,.35,.1],[2.07,2.69,s*1.2]);
box('Headlamp'+side,[.035,.18,.39],[3.292,1.48,s*.58],'Headlight');
box('Tail'+side,[.025,.13,.22],[-3.413,.88,s*.82],'Taillight');
box('Brake'+side,[.025,.13,.22],[-3.413,.88,s*.54],'BrakeLight');
box('RearMudguard'+side,[2.18,.1,.66],[-2.15,1.12,s*.91],'Paint');
box('FuelTank'+side,[.8,.32,.38],[-.43,.9,s*.58],'Rim');
if(lod===0){box('DoorSeam'+side,[.025,.92,.012],[.28,1.87,s*1.073]);box('DoorHandle'+side,[.22,.065,.035],[.53,2.15,s*1.088]);box('StepTread'+side,[1.16,.025,.22],[.9,1.32,s*1.14]);box('Mudflap'+side,[.05,.4,.6],[-3.23,.82,s*.91]);}}
box('PlateFront',[.025,.16,.42],[3.412,.9,0],'Plate');box('PlateRear',[.025,.16,.42],[-3.413,.83,0],'Plate');
box('Grille',[.025,.38,.95],[3.292,1.59,0]);
if(lod===0){for(let i=0;i<5;i++)box('GrilleSlat'+i,[.028,.023,.88],[3.31,1.44+i*.074,0],'Rim');box('HoodSeam',[.74,.008,.018],[2.78,1.945,0]);box('RoofVent',[.6,.045,.48],[.78,3.372,0],'Trim');box('Catwalk',[1.0,.045,.68],[-.57,1.084,0]);}
createPart(pre+'Exhaust',cylinderGeo(.065,.065,2.6,lod?8:16),m.Chrome,{parent,position:[-.04,2.6,-.96]});
box('ExhaustMount',[.24,.15,.2],[.015,1.37,-.96]);}
const tiers=[0,1,2].map(l=>{const g=group('LOD'+l,root);body(g,l);return g;});const b=new THREE.Box3().setFromObject(tiers[0]);const r=b.getBoundingSphere(new THREE.Sphere()).radius;defineLod(tiers,{screenCoverage:[coverage(r,80),coverage(r,300),0]});
const axes=[['F',2.15,false],['R',-1.475,true],['R2',-2.825,true]];
for(const [a,x,dual]of axes)for(const s of [-1,1]){const n=a==='R2'?'Wheel_R'+(s<0?'L':'R')+'2':'Wheel_'+a+(s<0?'L':'R');const p=group(n,root,[x,.52,s*(dual?.94:1.03)]);const near=group(n+'_LOD0',p),far=group(n+'_LOD1',p);const zs=dual?[-.17,.17]:[0];zs.forEach((z,i)=>{createPart(n+'_Tyre'+i,cylinderGeo(.52,.52,dual?.26:.32,24),m.Tyre,{parent:near,position:[0,0,z],rotation:[90,0,0]});createPart(n+'_Rim'+i,cylinderGeo(.29,.29,dual?.28:.34,16),m.Rim,{parent:near,position:[0,0,z],rotation:[90,0,0]});createPart(n+'_Hub'+i,cylinderGeo(.11,.11,dual?.3:.36,12),m.Trim,{parent:near,position:[0,0,z],rotation:[90,0,0]});});defineLod([near,far],{screenCoverage:[coverage(.52,300),0]});p.rotation.set(0,a==='F'?TEST_YAW:0,TEST_ROLL);}
group('FifthWheel',root,[-1.65,1.25,0]);return root;}