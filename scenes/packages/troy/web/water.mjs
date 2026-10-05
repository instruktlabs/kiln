import * as T from 'three';
import {positionLocal,positionWorld,uniform,texture,vec2,float,sin,cos,mix,color,vec3,smoothstep,transformNormalToView,normalView,positionView,cameraPosition,reflect} from 'three/tsl';
import {makeWaterNoise} from './water-noise.mjs';
import {WATER_TIERS} from './water-quality.mjs';
import {WATER,waterGrid,shoreGround} from './water-model.mjs';
export function createWater(tier='balanced',{extent=2600}={}){
 const quality=WATER_TIERS[tier];if(!quality)throw Error('Unknown water tier');
 const noise=new T.DataTexture(makeWaterNoise(),128,128,T.RGBAFormat);noise.wrapS=noise.wrapT=T.RepeatWrapping;noise.minFilter=T.LinearMipmapLinearFilter;noise.magFilter=T.LinearFilter;noise.generateMipmaps=true;noise.colorSpace=T.NoColorSpace;noise.needsUpdate=true;
 const time=uniform(0),{xs,zs}=waterGrid(tier,{extent}),positions=[],indices=[];
 for(const z of zs)for(const x of xs)positions.push(x,Math.max(WATER.base,shoreGround(Math.max(0,z))+WATER.filmLift),z);
 for(let j=0;j<zs.length-1;j++)for(let i=0;i<xs.length-1;i++){const a=j*xs.length+i,b=a+1,c=a+xs.length,d=c+1;indices.push(a,c,b,b,c,d);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();geo.computeBoundingSphere();geo.boundingSphere.radius+=1;
 const phase=(x,z,w)=>x.mul(w.x).add(z.mul(w.z)).sub(time.mul(w.speed));
 const damp=z=>smoothstep(-650,-200,z).mul(smoothstep(-22,0,z).oneMinus());
 const vx=positionLocal.x,vz=positionLocal.z;
 let height=positionLocal.y;
 for(const w of WATER.waves)height=height.add(sin(phase(vx,vz,w)).mul(w.amplitude).mul(damp(vz)));
 const mat=new T.MeshStandardNodeMaterial({roughness:.27,metalness:.08});
 mat.positionNode=vec3(vx,height,vz);
 const x=positionWorld.x,z=positionWorld.z;
 const sampleA=texture(noise,vec2(x.mul(.011).add(time.mul(.006)),z.mul(.011).sub(time.mul(.008))));
 let dx=sampleA.r.sub(.5).mul(.25),dz=sampleA.g.sub(.5).mul(.25);
 if(quality.ripples>=1){const sampleB=texture(noise,vec2(x.mul(.021).add(z.mul(.013)).sub(time.mul(.009)),z.mul(.021).sub(x.mul(.013)).sub(time.mul(.011))));dx=dx.add(sampleB.r.sub(.5).mul(.14));dz=dz.add(sampleB.g.sub(.5).mul(.14));}
 if(quality.ripples>=2){const sampleC=texture(noise,vec2(x.mul(-.041).add(z.mul(.017)).add(time.mul(.016)),z.mul(.041).add(x.mul(.017)).sub(time.mul(.007))));dx=dx.add(sampleC.r.sub(.5).mul(.075));dz=dz.add(sampleC.g.sub(.5).mul(.075));}
 for(const w of WATER.waves){const slope=cos(phase(x,z,w)).mul(w.amplitude).mul(damp(z));dx=dx.add(slope.mul(w.x));dz=dz.add(slope.mul(w.z));}
 const waterNormal=vec3(dx.negate(),1,dz.negate()).normalize();
 mat.normalNode=transformNormalToView(waterNormal);
 const front=sin(time.mul(.57).add(sin(x.mul(.031)).mul(1.8)).add(sin(x.mul(.009)).mul(.7))).mul(.30).add(sin(time.mul(.913).add(x.mul(.052)).add(1.3)).mul(.14)).add(sin(time.mul(.283).sub(x.mul(.017)).add(2.1)).mul(.06)).add(.5).mul(WATER.swashRange).add(WATER.swashBase);
 const breakup=texture(noise,vec2(x.mul(.035).add(time.mul(.002)),z.mul(.085).sub(time.mul(.006)))).b;
 const edge=front.sub(z),wash=smoothstep(0,.24,edge).mul(smoothstep(.45,1.9,edge).oneMinus()).mul(mix(.3,.9,breakup));
 const breaker=smoothstep(.72,.94,sin(z.mul(.28).sub(time.mul(.83)).add(sin(x.mul(.019)).mul(2.4)).add(breakup.mul(3)))).mul(smoothstep(-25,-7,z)).mul(smoothstep(-4,1,z).oneMinus()).mul(.38).mul(smoothstep(.4,.65,breakup));
 const shallowCoordinate=z.add(sampleA.b.sub(.5).mul(22));
 let base=mix(color('#164c60'),color('#427f82'),smoothstep(-240,-8,shallowCoordinate));
 base=mix(base,color('#869b89'),smoothstep(-6,14,shallowCoordinate));
 // Approximate shallow sand colour within one opaque pass; no refraction texture.
 const fresnel=positionView.negate().normalize().dot(normalView).clamp(0,1).oneMinus().pow(4);
 const reflected=reflect(cameraPosition.sub(positionWorld).normalize().negate(),waterNormal);
 const skyReflection=mix(color('#c0d0cc'),color('#416d86'),smoothstep(-.05,.55,reflected.y));
 base=mix(base,skyReflection,fresnel.mul(.78));
 const glint=reflected.dot(vec3(-240,400,-210).normalize()).clamp(0,1).pow(110);
 mat.emissiveNode=color('#fff0d8').mul(glint.mul(.8));
 mat.colorNode=mix(base,color('#dce7d4'),wash.add(breaker).clamp(0,1));
 mat.roughnessNode=mix(.25,.72,wash.add(breaker).clamp(0,1));
 mat.maskNode=z.lessThan(front);const mesh=new T.Mesh(geo,mat);mesh.name='world-space-shore-water';mesh.frustumCulled=false;
 // Wet sand is part of the existing terrain draw, not another transparent layer.
 const wet=smoothstep(-2,1,positionWorld.z).mul(smoothstep(12,19,positionWorld.z).oneMinus());
 const wetSandColor=mix(color('#ccb17d'),color('#95856c'),wet.mul(.7));
 return {mesh,time,wetSandColor,metrics:{tier,draws:1,triangles:indices.length/3,vertices:positions.length/3,textureBytes:87380,reflectionPasses:0,simulationPasses:0},dispose(){geo.dispose();mat.dispose();noise.dispose();}};
}
