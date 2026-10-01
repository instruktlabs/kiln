import { expect, test } from 'bun:test';
import { plantLod } from '../../src/campus/exterior/plant-lod';

test('large silhouette changes happen below a small projected height, independent of species size',()=>{
  for(const height of [6,10,15,20])for(const fov of [50,63,75]){
    let level=2;const changes:{level:number;pixels:number}[]=[];
    for(let depth=3000;depth>30;depth-=.5){const projected=height/(2*depth*Math.tan(fov*Math.PI/360));const next=plantLod(projected,1,level);if(next!==level)changes.push({level:next,pixels:projected*720});level=next;}
    expect(changes.map(c=>c.level)).toEqual([1,0]);
    expect(changes.find(c=>c.level===0)!.pixels).toBeLessThan(42);
    expect(changes.find(c=>c.level===1)!.pixels).toBeLessThan(11);
  }
  expect(plantLod(.003,1,0)).toBe(2); // distant foliage still uses the authored coarse model
  expect(plantLod(.2,.5,2)).toBe(0); // close trees never trade away their silhouette
});

test('small camera/FOV oscillations around a detail boundary do not flap levels',()=>{
  for(const base of [.05,.012])for(const initial of [0,1,2]){
    let level=plantLod(base,1,initial),changes=0;
    for(let frame=0;frame<600;frame++){const next=plantLod(base*(1+.04*Math.sin(frame/7)),1,level);if(next!==level)changes++;level=next;}
    expect(changes).toBe(0);
  }
});
