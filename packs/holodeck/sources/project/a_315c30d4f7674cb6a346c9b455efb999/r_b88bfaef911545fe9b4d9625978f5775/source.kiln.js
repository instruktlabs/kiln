const meta={name:'Winter mountainside / marker',role:'fill'};
const CFG={"id": "wmc-trail-marker", "kind": "marker"};

function rng(s){return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function bins(){return{rock:[],snow:[],wood:[],end:[],iron:[],grass:[]};}
function add(B,k,g,p=[0,0,0],rot=[0,0,0],sc=[1,1,1],tone=1){
 g=g.index?g.toNonIndexed():g.clone();const q=rot.isQuaternion?rot:new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p),q,new THREE.Vector3(...sc)));
 const ps=g.getAttribute('position'),ns=g.getAttribute('normal'),old=g.getAttribute('uv'),uv=[],c=[];
 for(let i=0;i<ps.count;i++){let x=ps.getX(i),y=ps.getY(i),z=ps.getZ(i),nx=Math.abs(ns.getX(i)),ny=Math.abs(ns.getY(i)),nz=Math.abs(ns.getZ(i));let u,v;if(k==='wood'){u=z*6+x*2;v=y*.7+x*.15;}else if(ny>nx&&ny>nz){u=x;v=z;}else if(nx>nz){u=z;v=y;}else{u=x;v=y;}let scale=k==='snow'?5:k==='rock'?1.8:k==='grass'?7:1;uv.push(u*scale,v*scale);c.push(Math.min(1,tone),Math.min(1,tone),Math.min(1,tone));}
 g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));B[k].push(g);
}
function finish(root,B,M){for(const k of Object.keys(B)){if(!B[k].length)continue;const p=[],n=[],u=[],c=[];for(const g of B[k]){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);u.push(...g.attributes.uv.array);c.push(...g.attributes.color.array);}const g=new THREE.BufferGeometry();for(const [key,a,s]of[['position',p,3],['normal',n,3],['uv',u,2],['color',c,3]])g.setAttribute(key,new THREE.Float32BufferAttribute(a,s));M[k].vertexColors=true;createPart(k,g,M[k],{parent:root});}}
function geo(p,ix){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return g;}
function grid(fn,n,m){const p=[],ix=[];for(let j=0;j<=m;j++)for(let i=0;i<=n;i++)p.push(...fn(i/n,j/m));for(let j=0;j<m;j++)for(let i=0;i<n;i++){let a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;ix.push(a,c,b,b,c,d);}return geo(p,ix);}
function rod(B,k,a,b,r0,r1,n=7,tone=1){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);add(B,k,new THREE.CylinderGeometry(r1,r0,d.length(),n,1),va.add(vb).multiplyScalar(.5).toArray(),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()),[1,1,1],tone);}
function rock(B,p,s,seed,n=18,levels=5){const rr=rng(seed),rad=Array.from({length:n},(_,i)=>.89+.11*Math.sin(i*2.1+seed)+rr()*.09),vs=[],ix=[];for(let j=0;j<=levels;j++)for(let i=0;i<n;i++){const a=i/n*Math.PI*2,t=j/levels,fac=Math.sin(.15+t*2.85)**.30;vs.push(Math.cos(a)*s[0]*.5*rad[i]*fac+.06*s[0]*Math.sin(t*4+seed),s[1]*(t+.016*Math.sin(a*3+seed)*Math.sin(t*Math.PI)),Math.sin(a)*s[2]*.5*rad[i]*fac);}for(let j=0;j<levels;j++)for(let i=0;i<n;i++){let a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;ix.push(a,c,b,b,c,d);}let bottom=vs.length/3;vs.push(0,0,0);let top=vs.length/3;vs.push(0,s[1],0);for(let i=0;i<n;i++){ix.push(bottom,i,(i+1)%n);ix.push(top,levels*n+(i+1)%n,levels*n+i);}let g=geo(vs,ix);g=g.toNonIndexed();g.computeVertexNormals();add(B,'rock',g,p,[0,0,0],[1,1,1],.89+(seed%6)*.026);}
function drift(B,p,s,seed,n=16,m=8){const g=grid((u,v)=>{const x=(u-.5)*2,z=(v-.5)*2,r=Math.max(Math.abs(x),Math.abs(z)),f=Math.max(0,1-r*r);return[x*s[0]/2*(.94+.06*Math.sin(v*11+seed)),s[1]*Math.pow(f,.65)*(1+.13*Math.sin(x*4+z*6+seed)+.07*Math.sin(x*15-z*11))+s[1]*-.08,z*s[2]/2*(.95+.05*Math.sin(u*13+seed))];},n,m);add(B,'snow',g,p);}
async function mats(){
 const rt=proceduralTexture({schemaVersion:2,size:512,name:'Schist fractured grain 560mm',layers:[{op:'noise',colorA:0x626b70,colorB:0x919795,scale:22,octaves:5,seed:329},{op:'noise',colorA:0x38434a,colorB:0xc5c5bd,scale:85,octaves:3,seed:551,opacity:.29,blend:'multiply'},{op:'stripes',colorA:0xa7aca7,colorB:0x757e81,count:66,angleDeg:18,opacity:.13,blend:'overlay'}]});
 const st=proceduralTexture({schemaVersion:2,size:256,name:'Dry settled snow fine aggregate 200mm',layers:[{op:'noise',colorA:0xdce4e9,colorB:0xf1f2ed,scale:57,octaves:3,seed:907}]});
 const wt=proceduralTexture({schemaVersion:2,size:256,name:'Weathered silver fir bark',layers:[{op:'noise',colorA:0x4d4943,colorB:0x81796b,scale:14,octaves:4,seed:53},{op:'stripes',colorA:0x403e39,colorB:0xa5a194,count:52,opacity:.32,blend:'multiply'}]});
 const et=proceduralTexture({schemaVersion:2,size:256,name:'Dry grey endgrain mottling',layers:[{op:'noise',colorA:0x8d8877,colorB:0xb2aa92,scale:50,octaves:4,seed:69}]});
 const rockM=pbrMaterial({albedo:rt,normal:normalMapFromHeight(rt,{strength:1.7}),roughness:.91,metalness:0});rockM.normalScale.set(.65,.65);
 const snow=pbrMaterial({albedo:st,normal:normalMapFromHeight(st,{strength:.7}),roughness:.98,metalness:0});snow.normalScale.set(.27,.27);snow.side=THREE.DoubleSide;
 const wood=pbrMaterial({albedo:wt,normal:normalMapFromHeight(wt,{strength:2}),roughness:.96,metalness:0});wood.normalScale.set(.8,.8);
 return{rock:rockM,snow,wood,end:pbrMaterial({albedo:et,roughness:.94,metalness:0}),iron:gameMaterial(0x363d3e,{roughness:.65,metalness:.65}),grass:gameMaterial(0x77766a,{roughness:1,flatShading:false})};
}
async function shelf(B){
 // Worn seating plane is deliberately level y=.48, 1.72 x .56 m clear.
 // The same long low schist extrusion can be embedded/scaled into an outcrop.
 const outline=[[-1.13,-.29],[-.96,-.43],[-.51,-.46],[.02,-.40],[.64,-.44],[1.11,-.32],[1.17,-.08],[1.09,.30],[.82,.42],[.31,.40],[-.30,.43],[-.98,.38],[-1.15,.18]];
 const vs=[],ix=[],N=outline.length,levels=[[0,.91,.02],[.13,1,0],[.21,.95,.025],[.36,1.01,0],[.455,.98,0],[.48,.93,0]];
 for(const [y,sc,shift]of levels)for(const [x,z]of outline)vs.push(x*sc+shift,y,z*sc);
 for(let j=0;j<levels.length-1;j++)for(let i=0;i<N;i++){let a=j*N+i,b=j*N+(i+1)%N,c=a+N,d=b+N;ix.push(a,c,b,b,c,d);}let ci=vs.length/3;vs.push(0,.48,0);for(let i=0;i<N;i++)ix.push(ci,(levels.length-1)*N+(i+1)%N,(levels.length-1)*N+i);ci=vs.length/3;vs.push(0,0,0);for(let i=0;i<N;i++)ix.push(ci,i,(i+1)%N);let g=geo(vs,ix).toNonIndexed();g.computeVertexNormals();add(B,'rock',g);
 // Fine broken bedding seams and attached chips remain below the sitting surface.
 for(let i=0;i<7;i++)rock(B,[-.91+i*.29,.045+(i%2)*.09,.315],[.40,.13,.20],51+i,9,2);
 drift(B,[.15,.476,-.36],[1.78,.085,.18],19,18,4);drift(B,[-1.03,.46,-.18],[.24,.06,.34],31,6,5);
}
async function boulder(B){rock(B,[-.04,-.06,.01],[1.72,1.05,1.25],84,18,5);rock(B,[.60,-.04,-.05],[.62,.45,.66],75,12,3);drift(B,[-.13,.92,-.08],[1.26,.18,.83],91,18,9);drift(B,[.57,.36,-.04],[.49,.07,.44],51,8,5);}
async function bank(B){drift(B,[0,0,0],[3.6,.57,1.55],71,26,12);rock(B,[-1.25,-.055,.36],[.49,.21,.30],16,9,2);rock(B,[.89,-.055,.50],[.32,.15,.27],19,8,2);}
async function clump(B){for(let i=0;i<9;i++){const a=i*2.399,r=.04+.018*(i%4),h=.17+.04*(i%5),x=Math.cos(a)*r,z=Math.sin(a)*r;const p=[x,0,z,x+.006,.01,z+.008,x+Math.cos(a)*.07,h*.62,z+Math.sin(a)*.07,x+Math.cos(a)*.075+.008,h*.65,z+Math.sin(a)*.075,x+Math.cos(a)*.13,h,z+Math.sin(a)*.13];add(B,'grass',geo(p,[0,2,1,1,2,3,2,4,3]));}rock(B,[.05,-.025,-.04],[.19,.08,.15],27,7,2);drift(B,[-.02,.008,-.02],[.28,.045,.20],17,5,3);}
async function log(B){
 const path=[[-1.65,.23,.05],[-.75,.26,-.04],[.15,.21,0],[1.53,.18,.05]],r=[.20,.23,.19,.14];for(let i=0;i<3;i++)rod(B,'wood',path[i],path[i+1],r[i],r[i+1],13,.89+i*.035);
 for(const [p,rad,rot]of[[path[0],.189,Math.PI/2],[path[3],.133,Math.PI/2]])add(B,'end',new THREE.CylinderGeometry(rad,rad,.006,17),p,[0,0,rot]);
 for(let i=0;i<5;i++){const x=-1.1+i*.47,z=i%2?.13:-.12;rod(B,'wood',[x,.25,z],[x+.18,.45+.05*(i%3),z*2.5],.045,.016,7);}
 // Supported drifts follow the actual log's upper arc, below crest by 20 mm.
 drift(B,[-.58,.425,-.02],[1.76,.10,.23],15,18,5);drift(B,[.79,.343,.03],[.90,.075,.19],27,12,4);
 for(let i=0;i<7;i++)rod(B,'wood',[-1.62,.13+i*.029,-.05],[-1.79+.03*(i%3),.15+i*.025,-.06],.013,.004,5,.91);
}
function mountain(B,ridge=false){
 const W=ridge?106:104,D=ridge?37:72,H=ridge?27:66,N=ridge?42:48,M=ridge?23:36;
 const peaks=ridge?[[-.41,.10,.70],[-.19,-.12,.94],[.13,.06,.72],[.39,-.02,.55]]:[[-.34,.04,.69],[-.06,-.07,1],[.20,.12,.77],[.39,.01,.46]];
 function height(x,z){let h=0;for(const [px,pz,ph]of peaks){const dx=x-px,dz=z-pz,diamond=Math.abs(dx)*2.2+Math.abs(dz)*1.18;let v=Math.max(0,1-diamond);h=Math.max(h,ph*Math.pow(v,1.25));}const edge=Math.pow(Math.max(0,1-Math.pow(Math.abs(x)*2,10)),.5)*Math.pow(Math.max(0,1-Math.pow(Math.abs(z)*2,8)),.6);const ribs=(.035*Math.sin(x*73+z*17)+.023*Math.sin(x*123-z*31)+.012*Math.sin(x*211+z*79))*(.3+h)*Math.sin(Math.PI*(z+.5));return H*Math.max(0,h+ribs)*edge;}
 const g=grid((u,v)=>{let x=u-.5,z=v-.5;return[x*W,height(x,z),z*D];},N,M).toNonIndexed();g.computeVertexNormals();const pp=g.attributes.position,nn=g.attributes.normal;
 const pR=[],pS=[];for(let i=0;i<pp.count;i+=3){let cx=0,cy=0,cz=0;for(let j=0;j<3;j++){cx+=pp.getX(i+j)/3;cy+=pp.getY(i+j)/3;cz+=pp.getZ(i+j)/3;}let snow=nn.getY(i)>(ridge?.72:.62)+.11*Math.sin(cx*.18+cz*.24) && cy>H*.12;const a=snow?pS:pR;for(let j=0;j<3;j++)a.push(pp.getX(i+j),pp.getY(i+j),pp.getZ(i+j));}for(const [k,p]of[['rock',pR],['snow',pS]]){const h=new THREE.BufferGeometry();h.setAttribute('position',new THREE.Float32BufferAttribute(p,3));h.computeVertexNormals();add(B,k,h,[0,0,0],[0,0,0],[1,1,1],ridge?.79:1);}
}
function supportTop(B,k,x,z){let top=-100;for(const g of B[k]){const p=g.attributes.position;for(let i=0;i<p.count;i+=3){const ax=p.getX(i),az=p.getZ(i),bx=p.getX(i+1),bz=p.getZ(i+1),cx=p.getX(i+2),cz=p.getZ(i+2),den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-9)continue;const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,w=1-u-v;if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6)top=Math.max(top,u*p.getY(i)+v*p.getY(i+1)+w*p.getY(i+2));}}return top;}
function loadSnow(B,k,x,z,w,d,h,seed,N=28,R=7){const p=[],ix=[],center=supportTop(B,k,x,z);p.push(x,center+h,z);for(let j=1;j<=R;j++){const r=j/R;for(let i=0;i<N;i++){const a=i/N*Math.PI*2,rr=r*(1+.055*Math.sin(a*5+seed)+.025*Math.sin(a*9));const xx=x+Math.cos(a)*w*.5*rr,zz=z+Math.sin(a)*d*.5*rr,base=supportTop(B,k,xx,zz);p.push(xx,Math.max(center-h*3,base)+h*Math.pow(Math.max(0,1-r*r),.68)*(1+.14*Math.sin(a*4+seed))-.007,zz);}}for(let i=0;i<N;i++)ix.push(0,1+(i+1)%N,1+i);for(let j=0;j<R-1;j++)for(let i=0;i<N;i++){let a=1+j*N+i,b=1+j*N+(i+1)%N,c=a+N,d=b+N;ix.push(a,b,c,b,d,c);}add(B,'snow',geo(p,ix));}
async function marker(B){
 add(B,'wood',await roundedBoxGeo(.14,.85,.14,.004,{style:'chamfer'}),[0,.425,0]);
 add(B,'wood',await roundedBoxGeo(.34,.10,.17,.005,{style:'chamfer'}),[0,.80,0]);
 // Recessed dark iron arrow in the cap, legible without loud labels.
 const sh=new THREE.Shape();for(const [i,p]of [[-.11,-.012],[.035,-.012],[.035,-.032],[.108,0],[.035,.032],[.035,.012],[-.11,.012]].entries())i?sh.lineTo(...p):sh.moveTo(...p);sh.closePath();add(B,'iron',new THREE.ShapeGeometry(sh),[0,.80,.086]);
 loadSnow(B,'wood',0,0,.32,.15,.035,47,16,3);
}
const BUILD={shelf,boulder,bank,clump,log,massif:B=>mountain(B,false),ridge:B=>mountain(B,true),marker};
async function build(){const root=createRoot(CFG.id),B=bins();await BUILD[CFG.kind](B);finish(root,B,await mats());return root;}
