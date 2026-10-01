import { useRuntime } from '../internal/runtime';
import type { RootState } from '@react-three/fiber';
import {
  WebGPURenderer, SRGBColorSpace, PCFShadowMap, PCFSoftShadowMap, Color, Fog, FogExp2, PMREMGenerator, REVISION,
} from 'three/webgpu';
import type { ColorRepresentation, ToneMapping, Texture, Node } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SceneError } from '../contract/core';
import { requestWindowsDevice } from './windows-device';
import { installRendererTextureCleanup } from './texture-cleanup';
export type FogSpec = { kind?: 'linear'; color: ColorRepresentation; near: number; far: number } | { kind: 'exp2'; color: ColorRepresentation; density: number } | { kind: 'node'; node: Node };
export type EnvironmentSpec = { kind: 'room'; blur: number; intensity: number } | { kind: 'texture'; texture: Texture; intensity: number };
export interface RendererLook { toneMapping: ToneMapping; exposure: number; background: ColorRepresentation; fog?: FogSpec; environment?: EnvironmentSpec }
export interface BackendInfo { backend: 'webgpu' | 'webgl2'; forced: boolean; fellBack: boolean; adapter?: { vendor: string; architecture: string; device: string; description: string } }
export interface GlDefaults { canvas: HTMLCanvasElement | OffscreenCanvas; powerPreference: 'high-performance'; antialias: boolean; alpha: boolean }
export interface RendererFactoryOptions {
  forceWebGL?: boolean; antialias?: boolean; alpha?: boolean; onBackend?: (b: BackendInfo) => void; isDisposed: () => boolean;
  makeRenderer?: (options: ConstructorParameters<typeof WebGPURenderer>[0]) => WebGPURenderer;
}
type Device = { destroy(): void; lost: Promise<{reason: string; message: string}>; adapterInfo?: Partial<NonNullable<BackendInfo['adapter']>> };
type Backend = { isWebGPUBackend?: boolean; isWebGLBackend?: boolean; device?: Device; gl?: WebGL2RenderingContext };
const owned = new WeakMap<WebGPURenderer, { dead: boolean; dispose(): Promise<void> }>();
const textureCleanup = new WeakMap<WebGPURenderer, () => void>();
export function ownRenderer(renderer: WebGPURenderer, suppliedDevice?: Device) {
  const existing = owned.get(renderer); if (existing) return existing;
  const nativeDispose = renderer.dispose.bind(renderer); let pending: Promise<void> | null = null;
  const entry = {
    dead: false,
    dispose(): Promise<void> {
      if (pending) return pending;
      entry.dead = true;
      pending = (async () => {
        const backend = renderer.backend as unknown as Backend;
        try {
          try { textureCleanup.get(renderer)?.(); }
          finally {
            textureCleanup.delete(renderer);
            if (renderer.hasInitialized?.()) await nativeDispose();
            else backend.gl?.getExtension('WEBGL_lose_context')?.loseContext();
          }
        } finally { suppliedDevice?.destroy(); owned.delete(renderer); }
      })();
      return pending;
    },
  };
  renderer.dispose = entry.dispose; owned.set(renderer,entry); return entry;
}
export function createGlFactory(o: RendererFactoryOptions): (defaults: GlDefaults) => Promise<WebGPURenderer> {
  return async defaults => {
    if (REVISION !== '186') throw new SceneError('three-version','Scene kit requires three revision 186');
    let renderer: WebGPURenderer | undefined, supplied: Device | undefined;
    try {
      if (!o.makeRenderer && typeof navigator !== 'undefined') supplied = await requestWindowsDevice({ platform:navigator.platform,forceWebGL:!!o.forceWebGL,gpu:(navigator as unknown as {gpu?: Parameters<typeof requestWindowsDevice<Device>>[0]['gpu']}).gpu });
      const params = { canvas:defaults.canvas,antialias:o.antialias ?? true,alpha:o.alpha ?? false,powerPreference:'high-performance' as const,forceWebGL:!!o.forceWebGL,...(supplied ? {device:supplied as unknown as GPUDevice} : {}) };
      renderer = o.makeRenderer ? o.makeRenderer(params) : new WebGPURenderer(params);
      ownRenderer(renderer,supplied);
      await renderer.init();
      textureCleanup.set(renderer, installRendererTextureCleanup(renderer));
      if (o.isDisposed()) { await renderer.dispose(); throw new DOMException('Scene disposed during graphics initialization','AbortError'); }
      const backend=detectBackend(renderer,!!o.forceWebGL); o.onBackend?.(backend); return renderer;
    } catch (e) {
      if (renderer) await renderer.dispose(); else supplied?.destroy();
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw e instanceof SceneError ? e : new SceneError('renderer-init','Could not initialize scene graphics',e);
    }
  };
}
export function detectBackend(renderer: WebGPURenderer, forced: boolean): BackendInfo {
  const backend = renderer.backend as unknown as Backend;
  if (backend.isWebGPUBackend) {
    const a=backend.device?.adapterInfo;
    return { backend:'webgpu',forced:false,fellBack:false,adapter:{vendor:a?.vendor ?? '',architecture:a?.architecture ?? '',device:a?.device ?? '',description:a?.description ?? ''} };
  }
  if (backend.isWebGLBackend) {
    const gl=backend.gl, debug=gl?.getExtension('WEBGL_debug_renderer_info');
    return { backend:'webgl2',forced,fellBack:!forced,adapter:{vendor:debug?String(gl!.getParameter(debug.UNMASKED_VENDOR_WEBGL)):'',architecture:'',device:'',description:debug?String(gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL)):''} };
  }
  throw new SceneError('renderer-init','Unknown renderer backend');
}
export function asWebGPU(gl: RootState['gl']): WebGPURenderer {
  if (!(gl as unknown as {isWebGPURenderer?:boolean}).isWebGPURenderer) throw new SceneError('renderer-init','Expected initialized WebGPURenderer');
  return gl as unknown as WebGPURenderer;
}
export function useBackend(): BackendInfo { const b=useRuntime().backend; if(!b)throw new SceneError('renderer-init','Backend not initialized');return b; }
export function buildRoomEnvironment(renderer: WebGPURenderer, o: { blur: number; intensity: number }) {
  const generator=new PMREMGenerator(renderer), room=new RoomEnvironment();
  try { const target=generator.fromScene(room,o.blur); let disposed=false; return { texture:target.texture,dispose(){if(!disposed){disposed=true;target.dispose();}} }; }
  finally { generator.dispose();room.dispose(); }
}
const roomEnvironments = new WeakMap<object, { texture: Texture; dispose(): void }>();
export function releaseRendererLook(state: RootState) { roomEnvironments.get(state.scene)?.dispose();roomEnvironments.delete(state.scene);state.scene.environment=null; }
export function configureRenderer(state: RootState, look: RendererLook): void {
  const renderer=asWebGPU(state.gl);
  renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=look.toneMapping;renderer.toneMappingExposure=look.exposure;
  if(renderer.shadowMap.type===PCFSoftShadowMap)renderer.shadowMap.type=PCFShadowMap;
  state.scene.background=new Color(look.background); state.scene.fog=null;state.scene.fogNode=null;
  if(look.fog?.kind==='node')state.scene.fogNode=look.fog.node;
  else if(look.fog?.kind==='exp2')state.scene.fog=new FogExp2(look.fog.color,look.fog.density);
  else if(look.fog)state.scene.fog=new Fog(look.fog.color,look.fog.near,look.fog.far);
  if(look.environment?.kind==='room'){
    let environment=roomEnvironments.get(state.scene);
    if(!environment){environment=buildRoomEnvironment(renderer,look.environment);roomEnvironments.set(state.scene,environment);}
    state.scene.environment=environment.texture;state.scene.environmentIntensity=look.environment.intensity;
  } else if(look.environment?.kind==='texture') {
    roomEnvironments.get(state.scene)?.dispose();roomEnvironments.delete(state.scene);
    state.scene.environment=look.environment.texture;state.scene.environmentIntensity=look.environment.intensity;
  }
}
