const meta={name:'trailer-flatbed',role:'vehicle'};
const PAINT=0xebebeb;
const TEST_YAW=0, TEST_ROLL=0;
function materials(){const spec={Paint:[PAINT,.3,0],Trim:[0x181a1c,.7,0],Glass:[0x12161a,.05,0],Chrome:[0xc6cbd0,.2,1],Tyre:[0x222222,.9,0],Rim:[0xa8adb1,.4,1],Headlight:[0xffffff,.3,0,0xffffff,.45],Taillight:[0x9b1616,.4,0,0xff1515,.12],BrakeLight:[0xa92020,.4,0,0xff1515,.25],Plate:[0xe6e6df,.65,0],CargoBox:[0xe8e9e7,.5,0]};const m={};for(const [n,s]of Object.entries(spec)){m[n]=gameMaterial(s[0],{roughness:s[1],metalness:s[2],emissive:s[3]||0,emissiveIntensity:s[4]||0,flatShading:false});m[n].name=n;}return m;}
function group(n,p,pos=[0,0,0]){const g=new THREE.Group();g.name=n;g.position.set(...pos);p.add(g);return g;}
const coverage=(r,d)=>Math.PI*(r/(2*d*Math.tan(25*Math.PI/180)))**2/(16/9);
function prism(profile,depth){const p=[],idx=[];for(const z of [-depth/2,depth/2])for(const [x,y]of profile)p.push(x,y,z);const n=profile.length;for(let i=1;i<n-1;i++){idx.push(0,i+1,i,n,n+i,n+i+1);}for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+j,i,n+j,n+i);}const g=meshGeo({positions:p,indices:idx});const out=g.toNonIndexed();out.computeVertexNormals();return out;}
function build(){const root=createRoot('trailer-flatbed'),m=materials();
function body(parent,lod){const pre='L'+lod+'_';const box=(n,s,p,mat='Trim',rot)=>createPart(pre+n,boxGeo(...s),m[mat],{parent,position:p,rotation:rot});box('Frame',[13.6,.2,.78],[-5.6,1.16,0]);box('Deck',[13.6,.2,2.55],[-5.6,1.4,0],'Paint');
box('Underride',[.12,.18,2.3],[-12.37,.64,0]);for(const s of [-1,1]){box('UnderridePost'+s,[.11,.53,.08],[-12.37,.94,s*.86]);}
if(lod<2){box('RearLightBeam',[.12,.24,2.55],[-12.4,1.27,0],'Paint');box('MudflapBeam',[.12,.28,2.4],[-11.85,1.15,0]);for(const [i,x]of [-9.825,-11.175].entries()){box('Axle'+i,[.14,.14,1.9],[x,.52,0]);box('Suspension'+i,[.45,.57,.65],[x,.82,0]);}
const gear=group(lod===0?'LandingGear':'LandingGear_L'+lod,parent);for(const s of [-1,1]){createPart(pre+'GearLeg'+s,boxGeo(.17,.46,.17),m.Trim,{parent:gear,position:[-2.5,.99,s*.75]});createPart(pre+'GearFoot'+s,boxGeo(.3,.08,.35),m.Trim,{parent:gear,position:[-2.5,.79,s*.75]});}box('GearCrossmember',[.2,.13,1.7],[-2.5,1.17,0]); 
for(const s of [-1,1]){box('Tail'+s,[.025,.14,.22],[-12.443,1.28,s*.94],'Taillight');box('Brake'+s,[.025,.14,.22],[-12.443,1.28,s*.62],'BrakeLight');box('Mudflap'+s,[.055,.42,.6],[-11.85,.84,s*.94]);}box('Plate',[.025,.18,.45],[-12.443,1.25,0],'Plate');}

for(let i=0;i<4;i++){const x=-.6-i*3.2;const crate=box('Crate'+(i+1),[2.4,2.2,2.4],[x,2.6,0],'CargoBox');if(lod===0)crate.name='Crate'+(i+1);if(lod<2){for(const dx of [-.72,.72]){box('StrapTop'+i+'_'+dx,[.09,.025,2.42],[x+dx,3.7125,0]);for(const s of [-1,1])box('StrapSide'+i+'_'+dx+'_'+s,[.09,2.22,.025],[x+dx,2.6,s*1.2125]);}
if(lod===0){for(const s of [-1,1]){for(const dx of [-1.12,1.12])box('CrateCorner'+i+'_'+s+'_'+dx,[.07,2.13,.02],[x+dx,2.6,s*1.208],'CargoBox');box('CrateBase'+i+'_'+s,[2.4,.12,.025],[x,1.57,s*1.21],'CargoBox');}for(const dx of [-.85,.85])box('CrateSkid'+i+'_'+dx,[.14,.045,2.3],[x+dx,1.5225,0],'Trim');}
}}
if(lod===0){for(let i=0;i<12;i++)box('TieDown'+i,[.1,.07,2.57],[.8-i*1.1,1.4,0],'Rim');}
}
const tiers=[0,1,2].map(l=>{const g=group('LOD'+l,root);body(g,l);return g;});const r=new THREE.Box3().setFromObject(tiers[0]).getBoundingSphere(new THREE.Sphere()).radius;defineLod(tiers,{screenCoverage:[coverage(r,80),coverage(r,300),0]});const axes=[['R',-9.825],['R2',-11.175]];
for(const [a,x]of axes)for(const s of [-1,1]){const n='Wheel_R'+(s<0?'L':'R')+(a==='R2'?'2':'');const p=group(n,root,[x,.52,s*.94]);const near=group(n+'_LOD0',p),far=group(n+'_LOD1',p);[-.17,.17].forEach((z,i)=>{createPart(n+'_Tyre'+i,cylinderGeo(.52,.52,.26,24),m.Tyre,{parent:near,position:[0,0,z],rotation:[90,0,0]});createPart(n+'_Rim'+i,cylinderGeo(.29,.29,.28,16),m.Rim,{parent:near,position:[0,0,z],rotation:[90,0,0]});createPart(n+'_Hub'+i,cylinderGeo(.11,.11,.3,12),m.Trim,{parent:near,position:[0,0,z],rotation:[90,0,0]});});defineLod([near,far],{screenCoverage:[coverage(.52,300),0]});p.rotation.z=TEST_ROLL;}
group('Kingpin',root,[0,1.25,0]);return root;}