import React, { StrictMode, useCallback, useEffect, useRef } from 'react';
import { createRoot as createDomRoot, type Root as DomRoot } from 'react-dom/client';
import { Canvas, extend, useFrame, useThree, type RootState } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import type { WebGLRenderer } from 'three';
import { color, mix, sin, uv, vec3, viewportSize } from 'three/tsl';
import { requestWindowsDevice, type DeviceApi } from './windows-device';

// Deliberately isolated from the M1 kit: this verifies the pinned renderer and
// reconciler before the public API is implemented.
extend(THREE as unknown as Parameters<typeof extend>[0]);

type ToneName = 'aces' | 'neutral' | 'agx';
type SpikeOptions = {
  backend?: 'auto' | 'webgl2';
  toneMapping?: ToneName;
  shadows?: 'basic' | 'percentage' | 'omitted' | false;
  strict?: boolean;
  deferInit?: boolean;
  rejectInit?: boolean;
  width?: number;
  height?: number;
  dpr?: number;
};
type Memory = { geometries: number; textures: number };
type DeviceLike = {
  adapterInfo?: { vendor?: string; architecture?: string; device?: string; description?: string };
  lost: Promise<{ reason: string; message: string }>;
  destroy(): void;
};
type BackendLike = { isWebGPUBackend?: boolean; isWebGLBackend?: boolean; device?: DeviceLike; gl?: WebGL2RenderingContext };
type RendererRecord = {
  id: number; generation: number; initialized: boolean; factoryReturnedInitialized: boolean;
  backend: string | null; forced: boolean; fellBack: boolean;
  adapter: Record<string, string> | null; disposed: boolean; disposeCalls: number;
  lateInit: boolean; deviceDestroyCalled: boolean; deviceLost: { reason: string; message: string } | null;
  contextLost: boolean | null; beforeObjects: Memory | null; afterObjects: Memory | null;
  afterRenderer: Memory | null; shadowEnabled: boolean | null; shadowType: number | null;
  toneMapping: number | null; renderCalls: number; renderAfterDispose: number;
  windowsDeviceSupplied: boolean;
};
type Scope = {
  id: number; dead: boolean; ready: number; frames: number; built: boolean;
  effectMounts: number; effectCleanups: number; options: Required<SpikeOptions>;
  domEffectMounts: number; domEffectCleanups: number;
  errors: string[]; abortedFactories: number; resourcesCreated: string[]; resourcesDisposed: string[];
  releases: (() => void)[]; state: RootState | null; runtime: Runtime | null;
};
type Runtime = { renderer: THREE.WebGPURenderer; record: RendererRecord; dispose: () => Promise<void> };

const host = document.getElementById('spike-host')!;
const records: RendererRecord[] = [];
let active: Scope | null = null;
let domRoot: DomRoot | null = null;
let serial = 0;

function memory(renderer: THREE.WebGPURenderer): Memory {
  return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
}

function ownRenderer(scope: Scope, canvas: HTMLCanvasElement, suppliedDevice?: GPUDevice): Runtime {
  const renderer = new THREE.WebGPURenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    forceWebGL: scope.options.backend === 'webgl2',
    ...(suppliedDevice ? { device: suppliedDevice } : {}),
  });
  const record: RendererRecord = {
    id: records.length + 1, generation: scope.id, initialized: false,
    factoryReturnedInitialized: false, backend: null, forced: scope.options.backend === 'webgl2',
    fellBack: false, adapter: null, disposed: false, disposeCalls: 0, lateInit: false,
    deviceDestroyCalled: false, deviceLost: null, contextLost: null, beforeObjects: null,
    afterObjects: null, afterRenderer: null, shadowEnabled: null, shadowType: null,
    toneMapping: null, renderCalls: 0, renderAfterDispose: 0,
    windowsDeviceSupplied: Boolean(suppliedDevice),
  };
  records.push(record);
  if (suppliedDevice) void suppliedDevice.lost.then((value) => {
    record.deviceLost = { reason: value.reason, message: value.message };
  });
  const originalDispose = renderer.dispose.bind(renderer);
  const originalRender = renderer.render.bind(renderer);
  renderer.render = (...args: Parameters<THREE.WebGPURenderer['render']>) => {
    if (record.disposed) { record.renderAfterDispose++; return; }
    record.renderCalls++;
    return originalRender(...args);
  };
  let disposal: Promise<void> | null = null;
  const dispose = (): Promise<void> => {
    if (disposal) return disposal;
    if (!record.initialized) {
      if (suppliedDevice) { record.deviceDestroyCalled = true; suppliedDevice.destroy(); }
      record.disposed = true;
      return disposal = Promise.resolve();
    }
    record.disposeCalls++;
    const backend = renderer.backend as unknown as BackendLike;
    // Retain backend handles before renderer.dispose clears its managers.
    const gl = backend.gl;
    const device = backend.device;
    record.afterObjects = memory(renderer);
    // r186 disposal is asynchronous. Its WebGPU backend destroys the owned
    // device; its WebGL backend loses the context. Await before recording.
    record.deviceDestroyCalled = Boolean(device || suppliedDevice);
    disposal = originalDispose().finally(() => {
      // three deliberately leaves caller-supplied devices alive. This handle
      // belongs to this scene, including when initialization fell back to GL.
      suppliedDevice?.destroy();
    }).then(() => {
      if (gl) {
        if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
        record.contextLost = gl.isContextLost();
      }
      record.afterRenderer = memory(renderer);
      record.disposed = true;
    });
    return disposal;
  };
  // R3F later repeats renderer disposal. This wrapper makes that terminal and
  // idempotent, and avoids rendering or disposing disposed GPU objects again.
  renderer.dispose = dispose;
  return { renderer, record, dispose };
}

function detect(runtime: Runtime): void {
  const { renderer, record } = runtime;
  const backend = renderer.backend as unknown as BackendLike;
  if (backend.isWebGPUBackend) {
    record.backend = 'webgpu';
    const info = backend.device?.adapterInfo;
    record.adapter = { vendor: info?.vendor ?? '', architecture: info?.architecture ?? '', device: info?.device ?? '', description: info?.description ?? '' };
    void backend.device?.lost.then((value) => { record.deviceLost = { reason: value.reason, message: value.message }; });
  } else if (backend.isWebGLBackend) {
    record.backend = 'webgl2';
    record.fellBack = !record.forced;
    const gl = backend.gl!;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    record.adapter = { vendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : '', architecture: '', device: '', description: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '' };
  } else throw new Error('Unknown initialized renderer backend');
}

function Fixture({ scope }: { scope: Scope }) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const built = useRef(false);
  const readyRaf = useRef(0);
  useEffect(() => {
    scope.effectMounts++;
    const runtime = scope.runtime!;
    const root = new THREE.Group();
    root.name = 'spike-fixtures';
    const resources: { uuid: string; dispose(): void }[] = [];
    const own = <T extends { uuid: string; dispose(): void }>(resource: T): T => {
      resources.push(resource); scope.resourcesCreated.push(resource.uuid); return resource;
    };
    const cubeGeometry = own(new THREE.BoxGeometry(1.25, 1.25, 1.25));
    const standard = own(new THREE.MeshStandardMaterial({ color: 0xe94127, roughness: 0.48, metalness: 0.05 }));
    const cube = new THREE.Mesh(cubeGeometry, standard);
    cube.name = 'standard-cube'; cube.position.set(-1.3, .65, 0); cube.rotation.y = .25;
    cube.castShadow = cube.receiveShadow = true;
    root.add(cube);
    const nodeMaterial = own(new THREE.MeshStandardNodeMaterial({ roughness: .55, metalness: .05 }));
    // The viewportSize term deliberately exercises r186 buffer-size refresh.
    // Static time makes changed-size versus fresh-size screenshots comparable.
    nodeMaterial.colorNode = mix(color(0x167de6), color(0x31e3a6), sin(uv().x.mul(viewportSize.x.div(80))).mul(.5).add(.5));
    const nodeCube = new THREE.Mesh(cubeGeometry, nodeMaterial);
    nodeCube.name = 'node-cube'; nodeCube.position.set(1.3, .65, 0); nodeCube.rotation.y = -.25;
    nodeCube.castShadow = nodeCube.receiveShadow = true;
    root.add(nodeCube);
    // Unlit linear HDR references make a tone-map change measurable apart from
    // shadows and light transport. They remain geometry in the same renderer.
    const hdrColors = [[4, .2, .05], [.1, 4, .4], [.1, .4, 4]] as const;
    for (let index = 0; index < hdrColors.length; index++) {
      const material = own(new THREE.MeshBasicNodeMaterial());
      material.colorNode = vec3(...hdrColors[index]!);
      const patch = new THREE.Mesh(own(new THREE.BoxGeometry(.7, .7, .1)), material);
      patch.name = `hdr-patch-${index}`;
      patch.position.set((index - 1) * 1.1, 2.35, -.5);
      root.add(patch);
    }
    const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(200, 200)), own(new THREE.MeshStandardMaterial({ color: 0xb3b39c, roughness: .9 })));
    ground.name = 'shadow-ground'; ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    root.add(ground);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x747b67, 1.4);
    const sun = new THREE.DirectionalLight(0xffffff, 2.7);
    sun.name = 'shadow-sun'; sun.position.set(-3, 7, 4); sun.castShadow = true;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -5;
    sun.shadow.camera.right = sun.shadow.camera.top = 5;
    sun.shadow.camera.near = .1; sun.shadow.camera.far = 30;
    sun.shadow.normalBias = .018; sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.updateProjectionMatrix();
    root.add(hemi, sun);
    scene.add(root);
    scene.updateMatrixWorld(true);
    camera.position.set(5, 4, 8);
    camera.lookAt(0, .5, 0);
    built.current = true;
    scope.built = true;
    return () => {
      scope.effectCleanups++;
      built.current = false;
      scope.built = false;
      cancelAnimationFrame(readyRaf.current);
      runtime.record.beforeObjects = memory(runtime.renderer);
      scene.remove(root);
      sun.shadow.dispose();
      for (const item of resources) { item.dispose(); scope.resourcesDisposed.push(item.uuid); }
      runtime.record.afterObjects = memory(runtime.renderer);
    };
  }, [scope, scene, camera]);
  useFrame(() => {
    if (scope.dead || !built.current) return;
    scope.frames++;
    if (scope.ready === 0 && readyRaf.current === 0) {
      readyRaf.current = requestAnimationFrame(() => {
        readyRaf.current = 0;
        if (!scope.dead && built.current && scope.ready === 0) scope.ready++;
      });
    }
  });
  return null;
}

class SpikeBoundary extends React.Component<{ scope: Scope; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    if (!this.props.scope.dead && error.name !== 'AbortError') this.props.scope.errors.push(String(error));
  }
  render() { return this.state.failed ? null : this.props.children; }
}

function Harness({ scope }: { scope: Scope }) {
  useEffect(() => {
    scope.domEffectMounts++;
    return () => { scope.domEffectCleanups++; };
  }, [scope]);
  // R3F 9.8.1 Canvas catches configure rejection and rethrows into this scoped
  // boundary. Its insertion-effect root cleanup survives StrictMode replay.
  const factory = useCallback(async (defaults: { canvas: unknown }) => {
    if (THREE.REVISION !== '186') throw new Error('three-version');
    const suppliedDevice = await requestWindowsDevice<GPUDevice>({
      platform: navigator.platform,
      forceWebGL: scope.options.backend === 'webgl2',
      gpu: navigator.gpu as unknown as DeviceApi<GPUDevice> | undefined,
    });
    let runtime: Runtime;
    try {
      runtime = ownRenderer(scope, defaults.canvas as HTMLCanvasElement, suppliedDevice);
    } catch (error) {
      suppliedDevice?.destroy();
      throw error;
    }
    scope.runtime = runtime;
    const gate = scope.options.deferInit ? new Promise<void>((resolve) => scope.releases.push(resolve)) : Promise.resolve();
    try {
      // The explicit test gate is before renderer.init, so an early unmount
      // occurs while renderer initialization is genuinely incomplete.
      await gate;
      await runtime.renderer.init();
      runtime.record.initialized = runtime.renderer.hasInitialized();
      detect(runtime);
      runtime.renderer.shadowMap.enabled = true;
      runtime.renderer.shadowMap.type = THREE.PCFShadowMap;
      if (scope.dead) {
        runtime.record.lateInit = true;
        scope.abortedFactories++;
        throw new DOMException('Disposed during async factory initialization', 'AbortError');
      }
      if (scope.options.rejectInit) throw new Error('Synthetic factory rejection');
      runtime.record.factoryReturnedInitialized = runtime.renderer.hasInitialized();
      return runtime.renderer as unknown as WebGLRenderer;
    } catch (error) {
      await runtime.dispose();
      throw error;
    }
  }, [scope]);
  const onCreated = useCallback((state: RootState) => {
    if (scope.dead) return;
    scope.state = state;
    const runtime = scope.runtime!;
    const renderer = runtime.renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping }[scope.options.toneMapping];
    renderer.toneMappingExposure = .95;
    state.scene.background = new THREE.Color(0xc0d6d4);
    runtime.record.shadowEnabled = renderer.shadowMap.enabled;
    runtime.record.shadowType = renderer.shadowMap.type;
    runtime.record.toneMapping = renderer.toneMapping;
    // R3F maps boolean/omitted shadows to PCFSoft. r186 deprecates that type
    // even when disabled: record the reset, then normalize before rendering.
    if (renderer.shadowMap.type === THREE.PCFSoftShadowMap) renderer.shadowMap.type = THREE.PCFShadowMap;
    host.dataset.kilnBackend = runtime.record.backend!;
  }, [scope]);
  return <SpikeBoundary scope={scope}>
    <Canvas gl={factory} {...(scope.options.shadows === 'omitted' ? {} : { shadows: scope.options.shadows })}
      dpr={scope.options.dpr} camera={{ fov: 40, near: .02, far: 250 }} frameloop="always" onCreated={onCreated}>
      {scope.options.strict ? <StrictMode><Fixture scope={scope} /></StrictMode> : <Fixture scope={scope} />}
    </Canvas>
  </SpikeBoundary>;
}

function unmount(): void {
  const scope = active;
  if (!scope || scope.dead) return;
  scope.dead = true;
  scope.state?.setFrameloop('never');
  domRoot?.unmount();
  domRoot = null;
  host.replaceChildren();
}

function mount(options: SpikeOptions = {}): number {
  unmount();
  const scope: Scope = {
    id: ++serial, dead: false, ready: 0, frames: 0, built: false,
    effectMounts: 0, effectCleanups: 0,
    domEffectMounts: 0, domEffectCleanups: 0,
    options: { backend: 'auto', toneMapping: 'aces', shadows: 'percentage', strict: false, deferInit: false, rejectInit: false, width: 960, height: 640, dpr: 1, ...options },
    errors: [], abortedFactories: 0, resourcesCreated: [], resourcesDisposed: [], releases: [], state: null, runtime: null,
  };
  active = scope;
  host.style.width = `${scope.options.width}px`;
  host.style.height = `${scope.options.height}px`;
  domRoot = createDomRoot(host);
  const content = <Harness scope={scope} />;
  domRoot.render(scope.options.strict ? <StrictMode>{content}</StrictMode> : content);
  return scope.id;
}

const api = {
  mount,
  unmount,
  releaseInit() { for (const release of active?.releases ?? []) release(); },
  setDpr(dpr: number) { active?.state?.setDpr(dpr); },
  resize(width: number, height: number) {
    host.style.width = `${width}px`; host.style.height = `${height}px`;
    active?.state?.setSize(width, height, 0, 0);
  },
  snapshot() {
    const scope = active;
    const canvas = host.querySelector('canvas');
    return {
      revision: THREE.REVISION,
      generation: scope?.id ?? 0, disposed: scope?.dead ?? true,
      readyCount: scope?.ready ?? 0, frames: scope?.frames ?? 0, built: scope?.built ?? false,
      effectMounts: scope?.effectMounts ?? 0, effectCleanups: scope?.effectCleanups ?? 0,
      domEffectMounts: scope?.domEffectMounts ?? 0, domEffectCleanups: scope?.domEffectCleanups ?? 0,
      errors: scope?.errors ?? [], abortedFactories: scope?.abortedFactories ?? 0,
      resourcesCreated: scope?.resourcesCreated ?? [], resourcesDisposed: scope?.resourcesDisposed ?? [],
      renderers: records.map((record) => ({ ...record })),
      canvasCount: host.querySelectorAll('canvas').length,
      canvas: canvas ? { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight } : null,
      dpr: scope?.state?.viewport.dpr ?? null,
    };
  },
};

declare global { interface Window { __spike: typeof api } }
window.__spike = api;
// The runner explicitly mounts each variant, so loading this page alone creates
// no GPU renderer and submits no frames.
