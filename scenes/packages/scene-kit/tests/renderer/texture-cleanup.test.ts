import { test, expect } from 'bun:test';
import { DataTexture } from 'three/webgpu';
import { installRendererTextureCleanup } from '../../src/renderer/texture-cleanup';
test('r186 shared texture releases only this renderer listeners and backend data',()=>{
  const shared=new DataTexture(),local=new DataTexture(),data=new Map<any,{onDispose:()=>void}>(),destroyed:unknown[]=[];
  let cpuDisposed=0;shared.addEventListener('dispose',()=>cpuDisposed++);
  const other=()=>{};shared.addEventListener('dispose',other);
  const manager={updateTexture(texture:any){if(data.has(texture))return;const onDispose=()=>manager._destroyTexture(texture);data.set(texture,{onDispose});texture.addEventListener('dispose',onDispose);},_destroyTexture(texture:any){const d=data.get(texture);if(d){texture.removeEventListener('dispose',d.onDispose);destroyed.push(texture);data.delete(texture);}}};
  const originalUpdate=manager.updateTexture,originalDestroy=manager._destroyTexture;
  const release=installRendererTextureCleanup({_textures:manager} as any);
  manager.updateTexture(shared);manager.updateTexture(shared);manager.updateTexture(local);local.dispose();
  release();release();
  expect(destroyed).toEqual([local,shared]);expect(cpuDisposed).toBe(0);expect(shared.hasEventListener('dispose',other)).toBe(true);expect(data.size).toBe(0);
  expect(manager.updateTexture).toBe(originalUpdate);expect(manager._destroyTexture).toBe(originalDestroy);
  // Another renderer may use the still-live CPU texture after this one ends.
  manager.updateTexture(shared);expect(data.has(shared)).toBe(true);manager._destroyTexture(shared);
});
test('two renderer managers share a live texture without cross-disposal',()=>{
  const texture=new DataTexture();let cpuDisposed=0;texture.addEventListener('dispose',()=>cpuDisposed++);
  const create=()=>{const callbacks=new Map<any,()=>void>();const manager={updates:0,updateTexture(t:any){manager.updates++;if(callbacks.has(t))return;const fn=()=>manager._destroyTexture(t);callbacks.set(t,fn);t.addEventListener('dispose',fn);},_destroyTexture(t:any){const fn=callbacks.get(t);if(fn)t.removeEventListener('dispose',fn);callbacks.delete(t);}};return{manager,callbacks,release:installRendererTextureCleanup({_textures:manager} as any)};};
  const a=create(),b=create();a.manager.updateTexture(texture);b.manager.updateTexture(texture);a.release();
  expect(a.callbacks.size).toBe(0);expect(b.callbacks.size).toBe(1);b.manager.updateTexture(texture);expect(b.manager.updates).toBe(2);expect(cpuDisposed).toBe(0);b.release();expect(b.callbacks.size).toBe(0);
});
