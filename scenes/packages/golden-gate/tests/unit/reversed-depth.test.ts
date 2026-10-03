import { expect, test } from 'bun:test';
import { DataTexture, Matrix4, PerspectiveCamera, Scene, Texture, Vector3, WebGLCoordinateSystem, WebGPUCoordinateSystem } from 'three/webgpu';
import type { Atmosphere } from '../../src/world/atmosphere';
import { createAtmosphereUniforms } from '../../src/world/fog';
import { FEATURES } from '../../src/tiers';
import { goldenGateDefinition } from '../../src/definition';
await import('three');
const atmosphereModule = await import('../../src/world/atmosphere');
const { createWater } = await import('../../src/world/water');

test('Golden Gate opts in and its visible/environment skies draw first without depth testing or writing', () => {
  expect(goldenGateDefinition.reversedDepthBuffer).toBe(true);
  for (const environment of [false, true]) {
    const sky = atmosphereModule.createSky(createAtmosphereUniforms(), environment);
    expect(sky.renderOrder).toBeLessThan(0);expect(sky.material.depthTest).toBe(false);expect(sky.material.depthWrite).toBe(false);
    sky.geometry.dispose();sky.material.dispose();
  }
});

function fixture(scene: Scene) {
  const environment=new Texture(), level=()=>({level:'test',bounds:[-10,-10,10,10] as [number,number,number,number],size:[2,2] as [number,number],texture:new DataTexture()});
  const water=createWater(scene,{features:{...FEATURES.high.water,grid:2,levels:2,tile0:8},atmosphere:{uniforms:createAtmosphereUniforms(),environment} as Atmosphere,
    near:level(),mid:level(),midGrid:{bounds:[-10,-10,10,10],width:2,height:2,depth:new Float32Array(4).fill(2),shore:new Float32Array(4).fill(2)}});
  return {water,dispose(){water.dispose();environment.dispose();}};
}
function cameraAt(reversed: boolean, coordinateSystem: typeof WebGPUCoordinateSystem | typeof WebGLCoordinateSystem) {
  const camera=new PerspectiveCamera(60,1,.5,160000);camera.coordinateSystem=coordinateSystem;
  (camera as unknown as {_reversedDepth:boolean})._reversedDepth=reversed;
  camera.position.set(20,50,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();return camera;
}
test('reversed reflection clips below water, retains distant above-water geometry and preserves main/other passes', () => {
  for (const coordinateSystem of [WebGPUCoordinateSystem,WebGLCoordinateSystem]) {
    const scene=new Scene();let called=0;const prior=scene.onBeforeRender=()=>{called++;};const f=fixture(scene);
    try {
      const camera=cameraAt(true,coordinateSystem);f.water.update(camera,0);
      const virtual=f.water.reflectionCamera(camera)! as PerspectiveCamera;
      virtual.position.set(20,-50,100);virtual.up.set(0,-1,0);virtual.lookAt(0,0,0);virtual.updateMatrixWorld();
      scene.updateMatrixWorld();const before=camera.projectionMatrix.clone();
      const call=(c:PerspectiveCamera,reversedDepthBuffer=true)=>scene.onBeforeRender({reversedDepthBuffer} as never,scene,c,null as never);
      call(camera);expect(camera.projectionMatrix.equals(before)).toBe(true);
      const other=camera.clone(),otherBefore=other.projectionMatrix.clone();call(other);expect(other.projectionMatrix.equals(otherBefore)).toBe(true);
      virtual.projectionMatrix.copy(camera.projectionMatrix);const untouched=virtual.projectionMatrix.clone();
      call(virtual,false);expect(virtual.projectionMatrix.equals(untouched)).toBe(true);
      call(virtual);
      const z=(y:number,z=0)=>new Vector3(0,y,z).project(virtual).z;
      expect(z(0)).toBeCloseTo(1,9);expect(z(-10)).toBeGreaterThan(1);
      expect(z(10)).toBeGreaterThan(0);expect(z(10)).toBeLessThan(1);
      expect(z(10,-10000)).toBeGreaterThan(0);expect(z(10,-10000)).toBeLessThan(1);
      expect(new Matrix4().multiplyMatrices(virtual.projectionMatrix,virtual.projectionMatrixInverse).elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-8)).toBe(true);
      expect(camera.projectionMatrix.equals(before)).toBe(true);expect(called).toBe(4);
    }finally{f.dispose();expect(scene.onBeforeRender).toBe(prior);}
  }
});

test('water tile visibility respects both backend depth conventions including reversed near/far planes', () => {
  const scene=new Scene(),f=fixture(scene),counts:number[]=[];
  try {
    for(const system of [WebGLCoordinateSystem,WebGPUCoordinateSystem]) for(const reversed of [false,true]) {
      const camera=cameraAt(reversed,system);camera.position.set(0,10,0);camera.lookAt(0,0,-10);camera.near=4;camera.far=15;camera.updateMatrixWorld();camera.updateProjectionMatrix();
      f.water.update(camera,0);counts.push(f.water.stats.tiles);
    }
    expect(counts[0]).toBeGreaterThan(0);expect(counts).toEqual(Array(4).fill(counts[0]));
  }finally{f.dispose();}
});
