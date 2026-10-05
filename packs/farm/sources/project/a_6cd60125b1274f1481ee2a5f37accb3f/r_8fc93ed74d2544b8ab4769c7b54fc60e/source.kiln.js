const meta={name:"Pumpkin plant",role:"prop"};

function bucket(){return {p:[],uv:[]};}
function tri(b,a,c,d){for(const v of [a,c,d]){b.p.push(...v);b.uv.push(v[0]/0.5,v[1]);}}
function addGeo(b,g){const p=g.getAttribute('position'),ix=g.index;for(let i=0;i<(ix?ix.count:p.count);i++){let j=ix?ix.getX(i):i;const x=p.getX(j),y=p.getY(j),z=p.getZ(j);b.p.push(x,y,z);b.uv.push(x/0.5,y);}g.dispose();}
function rod(b,a,c,r0,r1,n=5){const av=new THREE.Vector3(...a),cv=new THREE.Vector3(...c),d=cv.clone().sub(av);const g=new THREE.CylinderGeometry(r1,r0,d.length(),n,1,false);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...av.add(cv).multiplyScalar(.5).toArray());addGeo(b,g);}
function finish(b,name,mat,parent){return createPart(name,meshGeo({positions:b.p,uvs:b.uv}),mat,{parent});}
function solid(color){return new THREE.MeshStandardMaterial({color,roughness:0.92,metalness:0,flatShading:true});}
function mound(b,rx,rz,h,n=12){const low=[],high=[];for(let i=0;i<n;i++){const t=i*2*Math.PI/n,rr=1+0.055*Math.sin(i*2.7);low.push([rx*Math.cos(t)*rr,0,rz*Math.sin(t)*rr]);high.push([rx*.77*Math.cos(t)*rr,h*.73,rz*.77*Math.sin(t)*rr]);}for(let i=0;i<n;i++){let j=(i+1)%n;tri(b,[0,0,0],low[i],low[j]);tri(b,low[i],high[i],low[j]);tri(b,low[j],high[i],high[j]);tri(b,high[i],[0,h,0],high[j]);}}
function thickLeaf(b,origin,angle,L,W,rise){const outline=[[0,0],[.23,-.40],[.48,-.52],[.65,-.35],[1,0],[.65,.35],[.48,.52],[.23,.40]];const cv=(u,v,y)=>[origin[0]+Math.cos(angle)*u*L-Math.sin(angle)*v*W,origin[1]+y+u*rise,origin[2]+Math.sin(angle)*u*L+Math.cos(angle)*v*W];const center=cv(.45,0,.024),bottom=cv(.45,0,.012);for(let i=0;i<outline.length;i++){let j=(i+1)%outline.length;const a=cv(...outline[i],0),c=cv(...outline[j],0),ad=[a[0],a[1]-.008,a[2]],cd=[c[0],c[1]-.008,c[2]];tri(b,center,c,a);tri(b,bottom,ad,cd);tri(b,a,c,ad);tri(b,c,cd,ad);}}

function fruit(b,cx,cz,r,h,phase){
 const rings=[[.22,0],[.68,.06],[.95,.25],[1,.52],[.87,.78],[.54,.96],[.16,.91]],n=24,vs=[];
 for(let k=0;k<rings.length;k++){const [rr,yy]=rings[k];vs.push([]);for(let i=0;i<n;i++){let a=i*2*Math.PI/n+phase,lobe=1+.11*Math.cos(8*(a-phase));vs[k].push([cx+r*rr*lobe*Math.cos(a),.030+h*yy,cz+r*rr*lobe*Math.sin(a)]);}}
 for(let k=0;k<vs.length-1;k++)for(let i=0;i<n;i++){let j=(i+1)%n;tri(b,vs[k][i],vs[k+1][i],vs[k][j]);tri(b,vs[k][j],vs[k+1][i],vs[k+1][j]);}
 for(let i=0;i<n;i++){let j=(i+1)%n;tri(b,[cx,.030,cz],vs[0][i],vs[0][j]);tri(b,[cx,.030+h*.90,cz],vs[6][j],vs[6][i]);}
}
async function build(){
 const root=createRoot('PumpkinPlant'),plant=createRoot('Plant');root.add(plant);
 const soil=bucket(),vines=bucket(),leaves=bucket(),big=bucket(),small=bucket();
 mound(soil,.70,.46,.04,14);
 const path=[[-.61,.052,-.05],[-.43,.065,.055],[-.21,.06,-.075],[.04,.068,.015],[.26,.06,.075],[.48,.05,-.02],[.61,.044,.08]];
 for(let i=0;i<path.length-1;i++)rod(vines,path[i],path[i+1],.014-i*.001,.013-i*.001,5);
 const fruits=[[-.28,.19,.235,.34,0],[.35,-.18,.172,.255,.13]];
 fruits.forEach((f,i)=>{
 const [x,z,r,h,ph]=f;fruit(i?small:big,x,z,r,h,ph);
 const crown=[x,.030+h*.92,z],stemtop=[x-.03,.030+h+ .065,z-.018],shoulder=[x-.09,.030+h*.84,z-.105],foot=[x-.15,.062,z-.16];
 rod(vines,crown,stemtop,.027*(i?.8:1),.018,6);rod(vines,stemtop,shoulder,.018,.015,5);rod(vines,shoulder,foot,.015,.012,5);
 const connect=i?path[4]:path[2];rod(vines,foot,connect,.012,.013,5);
 });
 const specs=[[1,2.8,.25,.31,.055],[1,4.2,.28,.34,.09],[2,3.3,.27,.33,.14],[2,4.9,.29,.35,.13],[3,.9,.29,.35,.11],[4,1.6,.29,.34,.18],[4,.1,.29,.32,.10],[5,.05,.17,.26,.09],[5,.65,.24,.29,.07]];
 specs.forEach(([i,a,L,W,rise])=>{const p=path[i],o=[p[0]+Math.cos(a)*.05,p[1]+.055,p[2]+Math.sin(a)*.05];rod(vines,p,o,.009,.006,5);thickLeaf(leaves,o,a,L,W,rise);});
 finish(soil,'Soil',solid(0x785334),root);finish(vines,'ConnectedVineAndFruitStems',solid(0x586332),plant);
 finish(leaves,'ThickOliveLeaves',solid(0x72803e),plant);const orange=solid(0xc66d28);finish(big,'LargeLobedPumpkin',orange,plant);finish(small,'SmallLobedPumpkin',orange,plant);
 return root;
}