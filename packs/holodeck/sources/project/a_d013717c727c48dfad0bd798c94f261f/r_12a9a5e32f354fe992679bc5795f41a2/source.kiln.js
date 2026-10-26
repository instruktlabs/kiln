const meta={name:'Winter spruce / middle grove',role:'fill'};
const CFG={species:'spruce',tier:'middle',seed:73151,height:12.1,radius:2.35,branches:48,load:.51};

function rng(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function bucket(){return{p:[],n:[],uv:[],c:[]};}
function add(b,g,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1],tint=1){
 const q=rot.isQuaternion?rot:new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
 const geo=g.index?g.toNonIndexed():g.clone();geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),q,new THREE.Vector3(...scale)));
 const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),u=geo.getAttribute('uv');
 for(let i=0;i<p.count;i++){b.p.push(p.getX(i),p.getY(i),p.getZ(i));b.n.push(n.getX(i),n.getY(i),n.getZ(i));b.uv.push(u?u.getX(i):0,u?u.getY(i):0);b.c.push(tint,tint,tint);}
}
function mesh(root,name,b,m){const g=new THREE.BufferGeometry();for(const[k,a,s]of[['position',b.p,3],['normal',b.n,3],['uv',b.uv,2],['color',b.c,3]])g.setAttribute(k,new THREE.Float32BufferAttribute(a,s));m.vertexColors=true;return createPart(name,g,m,{parent:root});}
function tube(points,r0,r1,sides=5){
 const p=[],uv=[],ix=[];
 for(let j=0;j<points.length;j++){
  const v=new THREE.Vector3(...points[j]);const d=new THREE.Vector3(...points[Math.min(j+1,points.length-1)]).sub(new THREE.Vector3(...points[Math.max(0,j-1)])).normalize();
  const a=new THREE.Vector3(0,1,0);if(Math.abs(d.y)>.93)a.set(1,0,0);a.cross(d).normalize();const c=new THREE.Vector3().crossVectors(d,a).normalize();
  for(let k=0;k<sides;k++){const t=k/sides*Math.PI*2,r=r0+(r1-r0)*j/(points.length-1);const w=v.clone().addScaledVector(a,Math.cos(t)*r).addScaledVector(c,Math.sin(t)*r);p.push(...w.toArray());uv.push(k/sides*Math.max(.18,2*Math.PI*r0/.7),j/(points.length-1)*Math.max(.1,new THREE.Vector3(...points[0]).distanceTo(new THREE.Vector3(...points[points.length-1]))/.7));}
 }
 for(let j=0;j<points.length-1;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides,c=a+sides,d=b+sides;ix.push(a,b,c,b,d,c);}
 // Closed bark tubes face outward: reverse both the sides and end caps together.
 for(let k=1;k<sides-1;k++){ix.push(0,k+1,k);const q=(points.length-1)*sides;ix.push(q,q+k,q+k+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
function snowLobe(length,width,depth,seed,sides=7){
 // Existing ring/side budget: blunt settled ends, unequal shoulders, flat bough contact.
 const medium=sides===5;if(medium)sides=4;const p=[],uv=[],ix=[],rings=medium?4:sides>=7?5:3;
 for(let j=0;j<rings;j++){const u=j/(rings-1),t=.5-.5*Math.cos(Math.PI*u),f=(rings===5?[.30,.84,1,.76,.24]:rings===4?[.24,.90,.84,.20]:[.38,1,.30])[j];
  for(let k=0;k<sides;k++){
   const a=k/sides*Math.PI*2,yy=Math.cos(a),asym=1+.10*Math.sin(seed*.37+j*2.17)+.065*Math.sin(k*2.2+seed);
   const side=Math.sin(a),shoulder=1+.12*side*Math.sin(seed*.23+j*1.7);
   p.push(t*length+width*.085*Math.sin(a+seed)*Math.sin(.35+u*Math.PI),
     yy>=0?Math.pow(yy,.72)*depth*f*asym:-depth*.22*(.8+.2*f),
     side*width*f*asym*shoulder+width*.12*Math.sin(t*4+seed)*Math.sin(Math.PI*t));
   uv.push(t,k/sides);
  }
 }
 for(let j=0;j<rings-1;j++)for(let k=0;k<sides;k++){let a=j*sides+k,b=j*sides+(k+1)%sides,c=a+sides,d=b+sides;ix.push(a,b,c,b,d,c);}
 for(let k=1;k<sides-1;k++){ix.push(0,k+1,k);const q=(rings-1)*sides;ix.push(q,q+k,q+k+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
// Branch-frame correction shared by all seven authored-distance families.
// Every spray and snow load derives from the same supporting world-space segment.
function branchFrame(a,b,roll=0){
 const x=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
 let y=new THREE.Vector3(0,1,0).addScaledVector(x,-x.y).normalize();
 if(y.lengthSq()<.01)y=new THREE.Vector3(0,0,1).addScaledVector(x,-x.z).normalize();
 const z=new THREE.Vector3().crossVectors(x,y).normalize();
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),roll));
}
function needleMaterial(){
 const R=rng(94519),operations=[{op:'paint',shape:{kind:'line',from:[8,512],to:[1010,512],width:5},rgba:[59,64,43,255]}];
 // Fine terminal needle combs overlap on a shared rachis. Narrow individual tips
 // and discontinuous gaps replace broad leaf-shaped polygons in the first study.
 for(let j=0;j<42;j++){
  const sx=12+j*23+R()*12,sy=512+(R()-.5)*18,side=j%2?1:-1;
  const angle=side*(.78+R()*.62),len=(210+R()*180)*(1-j/85),half=27+R()*23,points=[];
  for(const ss of [1,-1])for(let k=0;k<10;k++){
   const ii=ss===1?k:9-k,x=ii*len/10;
   for(const v of [[x,ss*3],[x+len/28,ss*half*(.52+R()*.66)],[x+len/11,ss*3]])points.push([Math.round(sx+Math.cos(angle)*v[0]-Math.sin(angle)*v[1]),Math.round(sy+Math.sin(angle)*v[0]+Math.cos(angle)*v[1])]);
  }
  const g=76+Math.round(R()*42);
  operations.push({op:'paint',shape:{kind:'polygon',points},rgba:[Math.round(g*.67),g,Math.round(g*.76),255]});
  if(j%4===0)operations.push({op:'paint',shape:{kind:'line',from:[Math.round(sx),Math.round(sy)],to:[Math.round(sx+Math.cos(angle)*len),Math.round(sy+Math.sin(angle)*len)],width:2},rgba:[56,68,46,255]});
 }
 for(const op of operations){const s=op.shape;if(s.points)s.points=s.points.map(p=>p.map(v=>Math.round(v*.5)));if(s.from)s.from=s.from.map(v=>Math.round(v*.5));if(s.to)s.to=s.to.map(v=>Math.round(v*.5));if(s.width)s.width=Math.max(1,Math.round(s.width*.5));}
 const albedo=proceduralTexture({schemaVersion:3,width:512,height:512,name:'M4_FineConnectedNeedleCombs512_RGBA',usage:'albedo',background:[0,0,0,0],operations});
 return pbrMaterial({albedo,roughness:.94,metalness:0,alphaMode:'mask',alphaCutoff:.32,doubleSided:true});
}
function foldedSpray(){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-.5, 0,0,.5, .48,.065,-.5, .48,.065,.5, 1,-.025,-.42, 1,-.025,.42],3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,0,0,.48,1,.48,0,1,1,1,0],2));
 g.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]);g.computeVertexNormals();return g;
}
async function build(){
 const root=createRoot(CFG.species==='fir'?'WinterFirBranchFrame':'WinterSpruceBranchFrame'),R=rng(CFG.seed);
 const near=CFG.tier==='near',mid=CFG.tier==='middle',sap=CFG.height<4,bg=!near&&!mid&&!sap,spruce=CFG.species==='spruce';
 const bark=await materialRecipe('kiln.material.bark.v1',{baseColor:'#b7b4aa',roughness:.94,textureResources:{baseColor:'kiln.texture.bark-brown-01-albedo.v1',normal:'kiln.texture.bark-brown-01-normal.v1'}});
 const snowTex=proceduralTexture({schemaVersion:2,size:128,name:'DrySnowFine',layers:[{op:'noise',colorA:0xe4e8e8,colorB:0xf9faf7,scale:42,octaves:2,seed:392}]});
 const snow=pbrMaterial({albedo:snowTex,roughness:.96,metalness:0}),needle=needleMaterial();
 const wood=bucket(),green=bucket(),white=bucket(),H=CFG.height;
 const trunk=[];for(let j=0;j<9;j++)trunk.push([.065*Math.sin(j*.67)*H/11,j*H/8,.048*Math.sin(j*.91)*H/11]);
 add(wood,tube(trunk,.24*H/10.65,.009,near?9:5));
 if(near||sap)for(let i=0;i<6;i++){const a=i*1.047+R()*.5,L=(.39+R()*.37)*Math.min(1,H/7);add(wood,tube([[0,.3*H/11,0],[Math.cos(a)*L*.45,.10*H/11,Math.sin(a)*L*.45],[Math.cos(a)*L,.008,Math.sin(a)*L]],.12*H/11,.015*H/11,5));}
 const card=new THREE.PlaneGeometry(1,1);card.rotateX(-Math.PI/2);card.translate(.5,0,0);
 const cheapCard=new THREE.PlaneGeometry(1,1);cheapCard.rotateX(-Math.PI/2);cheapCard.translate(.5,0,0);
 const spray=(a,b,width,roll,tint,cheap=false)=>{const L=new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));add(green,cheap?cheapCard:card,a,branchFrame(a,b,roll),[L,1,width],tint);};
 const wp=(v,theta,pos)=>new THREE.Vector3(...v).applyAxisAngle(new THREE.Vector3(0,1,0),-theta).add(new THREE.Vector3(...pos)).toArray();
 for(let i=0;i<CFG.branches;i++){
  const t=i/(CFG.branches-1),floor=sap?.3:spruce?1.6:1.2,cluster=1-Math.pow(1-t,1.34)+.011*Math.sin(i*2.17)+.006*Math.sin(i*.81),h=Math.max(floor,Math.min(H-.14,floor+(H-floor-.16)*cluster+(R()-.5)*.29));
  const theta=i*2.39996+(R()-.5)*1.10,len=CFG.radius*Math.pow(Math.max(.006,1-cluster),.52)*(.73+R()*.34)+.08;
  const droop=(spruce?.52:.22)*len*(.65+R()*.5),lift=(spruce?.1:.16)*len;
  const by=s=>lift*Math.sin(s*Math.PI)-droop*s*s;
  const pos=[.05*Math.sin(h)*H/11,h,.04*Math.cos(h)*H/11],rotation=[0,-theta,0];
  const at=s=>wp([s*len,by(s),.045*Math.sin(s*4+i)*s],theta,pos);
  const primary=[];for(let j=0;j<4;j++)primary.push(at(j/3));
  if(!bg)add(wood,tube(primary,(.033*(1-t)+.006)*Math.min(1,H/7),.003,near?5:3));
  const tint=.79+R()*.21;
  if(bg){
   // Two true local-axis planes preserve volume from every horizontal azimuth.
   const a=at(.12),b=at(1.04),w=len*(spruce?.56:.77);
   spray(a,b,w,.55,tint,true);spray(a,b,w,-.68,tint*.94,true);
   if(R()<CFG.load){const q=branchFrame(at(.2),at(.93));const p=at(.2);p[1]+=.02;add(white,snowLobe(len*.58,w*.30,(.10+.10*R())*(1-.6*t),CFG.seed+i*73,4),p,q);}
   continue;
  }
  const pairs=near?4:mid?2:1;
  for(let j=0;j<pairs;j++)for(const side of [-1,1]){
   const s=.18+j*(.68/pairs)+(R()-.5)*.055,L=len*(.38-.09*s)*(.78+R()*.42),ang=side*(.52+R()*.4),pend=(spruce?.57:.2)*L;
   const a=at(s),end=wp([s*len+Math.cos(ang)*L,by(s)-pend,.045*Math.sin(s*4+i)*s+Math.sin(ang)*L],theta,pos);
   const d=new THREE.Vector3(...end).sub(new THREE.Vector3(...a));
   if(near||sap)add(wood,tube([a,end],.010*Math.min(1,H/8),.002,3));
   const width=L*(spruce?1.25:1.46)*(.90+.35*t);
   spray(a,end,width,.63+(R()-.5)*.25,tint);
   spray(a,end,width,-.67+(R()-.5)*.3,tint*.95);
   // Smaller terminal shoots originate on the exact twig centerline.
   if(near)for(let f=1;f<=2;f++)for(const ss of [-1,1]){
    const p=new THREE.Vector3(...a).addScaledVector(d,f/3),yaw=theta+ang+ss*(.54+R()*.32),l=Math.min(.43,L*(.43+R()*.2));
    const e=p.clone().add(new THREE.Vector3(Math.cos(yaw)*l,-l*(spruce?.48:.1),Math.sin(yaw)*l));
    if(f===2)add(wood,tube([p.toArray(),e.toArray()],.004,.001,3));
    spray(p.toArray(),e.toArray(),l*.70,(R()-.5)*1.8,tint*.96);
   }
   if(R()<CFG.load*(near?1:.78)){
    const p=new THREE.Vector3(...a).addScaledVector(d,.13);
    const q=branchFrame(a,end),thick=(.10+R()*.09)*(1-.50*t)*Math.min(1,H/6);p.y+=.018+thick*.22;
    add(white,snowLobe(L*(.64+R()*.19),width*(.21+R()*.10),thick,CFG.seed+i*131+j*11+side,near?7:5),p.toArray(),q,[1,1,1],.96+R()*.04);
   }
  }
  // Several overlapping fine sprays stay on the curved primary wood, including tips.
  const pieces=near?4:mid?2:2;
  for(let k=0;k<pieces;k++){const s=.08+k*.80/pieces,e=Math.min(1.06,s+.42),a=at(s),b=at(e),w=len*(spruce?.42:.50)*(.90+.35*t);spray(a,b,w,.7,tint);spray(a,b,w,-.7,tint*.94);}
  if(R()<CFG.load*.5){const a=at(.18),b=at(.68);a[1]+=.018+(.09*(1-t)+.025)*.22;add(white,snowLobe(len*.47,.12*(1-t)+.028,.09*(1-t)+.025,CFG.seed+i*71,near?7:5),a,branchFrame(a,b));}
 }
 // Fine needles continue into the asymmetric vertical leader; no naked wire crown.
 for(let i=0;i<5;i++){const y=H-.55+i*.12,a=[0,y,0],theta=i*2.4,L=.26*(1-i*.13);spray(a,[Math.cos(theta)*L,y+.12,Math.sin(theta)*L],.19,.5,1,true);spray(a,[Math.cos(theta)*L,y+.12,Math.sin(theta)*L],.19,-.6,.94,true);}
 if(near)for(let i=0;i<4;i++){const a=i*1.57+.3;add(white,snowLobe(.38,.16,.065,23+i,5),[Math.cos(a)*.18,.02,Math.sin(a)*.18],[0,-a,0]);}
 mesh(root,'BarkStructure',wood,bark);mesh(root,'NeedleSprays',green,needle);mesh(root,'SupportedSnowLoads',white,snow);
 return root;
}
