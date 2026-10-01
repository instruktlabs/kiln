import {expect,test} from 'bun:test';
import {uniform} from 'three/tsl';
import {Matrix4} from 'three/webgpu';
import {createGrassLayer} from '../../vendor/field-grass/src/three/grassLayer';
test('Field Grass uses the supplied scene clock for every wind term and releases its instance buffers',()=>{
 const clock=uniform(7);let multiplies=0;
 const layer=createGrassLayer({count:1,matrices:new Float32Array(new Matrix4().elements),tufts:new Float32Array([0,0,.5,1])},{timeNode:{mul(value:unknown){multiplies++;return(clock as any).mul(value);}}});
 expect(multiplies).toBe(5);expect(layer.material.positionNode).toBeDefined();
 const disposed:string[]=[];layer.mesh.addEventListener('dispose',()=>disposed.push('mesh'));layer.mesh.geometry.addEventListener('dispose',()=>disposed.push('geometry'));layer.material.addEventListener('dispose',()=>disposed.push('material'));
 layer.dispose();expect(disposed).toEqual(['mesh','geometry','material']);
});
