import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Mesh } from 'three/webgpu';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { parseCampus } from '../../src/campus/data';
import { buildCampusGround } from '../../src/campus/exterior/ground';
import { groundLayers } from '../../src/campus/roads';

const campus=parseCampus(readFileSync(new URL('../../data/campus.json',import.meta.url),'utf8'));

// Execute the actual small TSL colour graph on CPU, supplying independent fragment
// attributes/derivatives. This checks its result against the old painted ground triangles,
// rather than testing a second copy of the new underlay formula.
function colourGraph(node:any,position:number[],dx:number,dy:number,paint=[.8,.7,.6]):number[]{
  const vector=(x:number|number[])=>Array.isArray(x)?x:[x];
  const each=(a:number[],b:number[],f:(a:number,b:number)=>number)=>Array.from({length:Math.max(a.length,b.length)},(_,i)=>f(a[i%a.length]!,b[i%b.length]!));
  const evaluate=(n:any):number[]=>{
    if(n.isConstNode)return n.value?.toArray?n.value.toArray():vector(n.value);
    if(n._attributeName)return n._attributeName==='position'?position:n._attributeName==='color'?paint:[0];
    if(n.isSplitNode){const v=evaluate(n.node);return [...n.components].map((c:string)=>v['xyzw'.indexOf(c)]!);}
    if(n.node)return evaluate(n.node);
    if(n.nodes)return n.nodes.flatMap(evaluate);
    if(n.method==='dFdx')return [dx];if(n.method==='dFdy')return [dy];
    const a=evaluate(n.aNode),b=n.bNode?evaluate(n.bNode):[],c=n.cNode?evaluate(n.cNode):[];
    if(n.isOperatorNode)return each(a,b,(a,b)=>n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'?a*b:a/b);
    if(n.method==='length')return [Math.hypot(...a)];
    if(n.method==='abs')return a.map(Math.abs);
    if(n.method==='min')return each(a,b,Math.min);if(n.method==='max')return each(a,b,Math.max);
    if(n.method==='clamp')return each(each(a,b,Math.max),c,Math.min);
    if(n.method==='step')return each(a,b,(edge,x)=>x<edge?0:1);
    if(n.method==='mix')return each(each(a,b,(a,b)=>b-a),c,(d,t)=>d*t).map((v,i)=>v+a[i%a.length]!);
    if(n.method==='smoothstep'){const t=Math.max(0,Math.min(1,(c[0]!-a[0]!)/(b[0]!-a[0]!)));return [t*t*(3-2*t)];}
    throw new Error(`Unsupported colour node ${n.constructor.name} ${n.method}`);
  };
  return evaluate(node);
}

function originalUnderlay(x:number,z:number):number[]{
  let colour:number[]|undefined;
  for(const layer of groundLayers(campus.roads,campus.parking).filter(l=>l.name!=='markings')){
    const {positions:p,indices:ids,colors:c}=layer.mesh;
    for(let i=0;i<ids.length;i+=3){
      const a=ids[i]!*3,b=ids[i+1]!*3,d=ids[i+2]!*3;
      const det=(p[b+2]!-p[d+2]!)*(p[a]!-p[d]!)+(p[d]!-p[b]!)*(p[a+2]!-p[d+2]!);if(Math.abs(det)<1e-9)continue;
      const u=((p[b+2]!-p[d+2]!)*(x-p[d]!)+(p[d]!-p[b]!)*(z-p[d+2]!))/det;
      const v=((p[d+2]!-p[a+2]!)*(x-p[d]!)+(p[a]!-p[d]!)*(z-p[d+2]!))/det,w=1-u-v;
      if(u< -1e-8||v< -1e-8||w< -1e-8)continue;
      colour=[0,1,2].map(k=>u*c[a+k]!+v*c[b+k]!+w*c[d+k]!);
    }
  }
  if(!colour)throw new Error('No authored underlay');return colour;
}

test('actual marking colour graph preserves road-end gradients and orientation-independent coverage',()=>{
  const ground=buildCampusGround(campus,campus.tiers.high);
  try{
    const material=(ground.root.getObjectByName('ground-markings') as Mesh).material as any;
    for(const sign of [-1,1])for(const step of [0,25,50,75,100,125,150]){
      for(const [x,z]of [[sign*(4150+step),8],[8,sign*(1000+step)]]){
        const actual=colourGraph(material.colorNode,[x!,0,z!],100,0);
        const expected=originalUnderlay(x!,z!);
        expected.forEach((v,i)=>expect(actual[i]).toBeCloseTo(v,6));expect(actual[3]).toBe(1);
      }
    }
    for(const radius of [84.5,86]){const actual=colourGraph(material.colorNode,[radius,0,0],100,0);originalUnderlay(radius,0).forEach((v,i)=>expect(actual[i]).toBeCloseTo(v,6));}
    const paint=[.8,.7,.6],underlay=originalUnderlay(-2800,7.25);
    for(const angle of [0,Math.PI/4,Math.PI/2])for(const [width,fraction]of [[.1,0],[.625,.5],[2,1]]){
      const actual=colourGraph(material.colorNode,[-2800,0,7.25],Math.cos(angle)/width!,Math.sin(angle)/width!,paint);
      paint.forEach((v,i)=>expect(actual[i]).toBeCloseTo(underlay[i]!+(v-underlay[i]!)*fraction!,6));
    }
  }finally{ground.dispose();}
});

test('markings filter subpixel paint without changing opaque ground ordering or authored road geometry',()=>{
  const ground=buildCampusGround(campus,campus.tiers.high);
  try {
    const marking=ground.root.getObjectByName('ground-markings') as Mesh;
    const material=marking.material as any;
    expect(material.isMeshStandardNodeMaterial).toBe(true);
    expect(material.transparent).toBe(false);expect(material.depthTest).toBe(false);expect(material.depthWrite).toBe(false);
    expect(marking.renderOrder).toBe(-10);
    expect(material).not.toBe((ground.root.getObjectByName('ground-paved') as Mesh).material);
    const methods:string[]=[];material.colorNode.traverse((n:any)=>{if(n.method)methods.push(n.method);});
    // Euclidean derivative length is rotation independent; L1 fwidth alone biases diagonal paint.
    expect(methods).toContain('dFdx');expect(methods).toContain('dFdy');expect(methods).toContain('length');expect(methods).toContain('smoothstep');
    for(const layer of groundLayers(campus.roads,campus.parking)){
      const mesh=ground.root.getObjectByName(`ground-${layer.name}`) as Mesh;
      expect(mesh.geometry.attributes.position!.array).toEqual(layer.mesh.positions);
      expect(mesh.geometry.attributes.color!.array).toEqual(layer.mesh.colors);
      expect(mesh.geometry.index!.array).toEqual(layer.mesh.indices);
    }
  }finally{ground.dispose();}
});

test('cross-ribbon coordinates measure horizontal, diagonal and foreshortened screen widths',()=>{
  const ground=buildCampusGround(campus,campus.tiers.high);
  try{
    const marking=ground.root.getObjectByName('ground-markings') as Mesh;
    const cross=marking.geometry.attributes.markAcross;
    expect(cross).toBeDefined();
    expect(cross!.count).toBe(marking.geometry.attributes.position!.count);
    for(let i=0;i<cross!.count;i+=4)expect([0,1,2,3].map(k=>cross!.getX(i+k))).toEqual([.5,-.5,-.5,.5]);
    // Use actual attribute values on an independently projected quarter-metre ribbon. The
    // gradient of its interpolated coordinate must recover perpendicular pixel width,
    // including a short-looking edge under perspective, without depending on screen rotation.
    const camera=new PerspectiveCamera(50,1280/720,.1,10000);camera.position.set(0,100,300);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    for(const heading of [0,Math.PI/4,Math.PI/2])for(const z of [0,-1500]){
      const rotate=new Matrix4().makeRotationY(heading),p=[[-.125,0,-2],[.125,0,-2],[.125,0,2]].map(v=>new Vector3(...v).applyMatrix4(rotate).add(new Vector3(0,0,z)).project(camera));
      const a=p[0]!,b=p[1]!,c=p[2]!;
      const bx=(b.x-a.x)*640,by=(b.y-a.y)*360,cx=(c.x-a.x)*640,cy=(c.y-a.y)*360,det=bx*cy-cx*by;
      const qb=cross!.getX(1)-cross!.getX(0),qc=cross!.getX(2)-cross!.getX(0);
      const dx=(qb*cy-qc*by)/det,dy=(bx*qc-cx*qb)/det;
      const recovered=1/Math.hypot(dx,dy),edgeX=(c.x-b.x)*640,edgeY=(c.y-b.y)*360;
      const perpendicular=Math.abs(bx*edgeY-by*edgeX)/Math.hypot(edgeX,edgeY);
      expect(recovered).toBeCloseTo(perpendicular,8);
      expect(recovered).toBeGreaterThan(0);
      if(z===-1500)expect(recovered).toBeLessThan(.25);
    }
  }finally{ground.dispose();}
});
