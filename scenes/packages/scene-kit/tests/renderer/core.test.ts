import { expect, test } from 'bun:test';
import { Scene, Color, ACESFilmicToneMapping, NeutralToneMapping, AgXToneMapping, SRGBColorSpace, PerspectiveCamera, WebGPURenderer } from 'three/webgpu';
import { configureRenderer, detectBackend, asWebGPU, createGlFactory } from '../../src/renderer';
test('renderer configuration sets tone mapping, output, fog and environment intensity', () => {
  const renderer = { isWebGPURenderer: true, shadowMap: { enabled:false, type:2 } };
  const state = { gl:renderer,scene:new Scene(),camera:new PerspectiveCamera() } as any;
  for (const toneMapping of [ACESFilmicToneMapping,NeutralToneMapping,AgXToneMapping]) {
    configureRenderer(state,{toneMapping,exposure:.95,background:0x123456,fog:{kind:'exp2',color:0x123456,density:.03}});
    expect(state.gl.toneMapping).toBe(toneMapping); expect(state.gl.outputColorSpace).toBe(SRGBColorSpace); expect(state.scene.fog.density).toBe(.03);
  }
  expect((state.scene.background as Color).getHex()).toBe(0x123456);
});
test('checked backend/cast and force/fallback reporting', () => {
  const renderer = { isWebGPURenderer:true, backend:{isWebGPUBackend:true,device:{adapterInfo:{vendor:'fixture'}}} } as unknown as WebGPURenderer;
  expect(asWebGPU(renderer as any)).toBe(renderer); expect(detectBackend(renderer,false).backend).toBe('webgpu');
  expect(()=>asWebGPU({} as any)).toThrow('WebGPURenderer');
  expect(()=>detectBackend({backend:{}} as any,false)).toThrow('Unknown');
  expect(detectBackend({backend:{isWebGLBackend:true}} as any,false).fellBack).toBe(true);
});
test('factory awaits init and drops late results with terminal disposal', async () => {
  let finish!:()=>void; let disposed=false;
  const pending = new Promise<void>(r=>finish=r);
  const renderer = { backend:{isWebGLBackend:true}, init:()=>pending,hasInitialized:()=>true,dispose:async()=>{disposed=true;} } as any;
  const factory=createGlFactory({isDisposed:()=>true,makeRenderer:()=>renderer});
  const result=factory({canvas:{} as any,powerPreference:'high-performance',antialias:true,alpha:false});
  finish(); await expect(result).rejects.toHaveProperty('name','AbortError'); expect(disposed).toBe(true);
});
