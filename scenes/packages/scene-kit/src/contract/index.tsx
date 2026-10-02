import { Component, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { ComponentType, JSX, ReactNode } from 'react';
import { createRoot as createDomRoot } from 'react-dom/client';
import { createRoot, events, unmountComponentAtNode, _roots } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import type { WebGPURenderer } from 'three/webgpu';
import { RuntimeContext, useRuntime } from '../internal/runtime';
import type { SceneRuntime } from '../internal/runtime';
import { createReadyGate, asSceneError, SceneError } from './core';
import { bindFiberErrors } from './react-errors';
import { notifySafely, safeMount } from './mount-core';
import { prepareSceneData } from './prepare-data';
import type { SceneDefinition, SceneHandle, SceneProps } from './types';
import { createSceneClock, createSystemLoop, DisposeRegistry, SceneSystemLoop, usePauseWhenHidden, useReducedMotion } from '../lifecycle';
import { configureRenderer, createGlFactory, releaseRendererLook } from '../renderer';
import { installMsaaStorePolicy, resolveMsaaDiscard } from '../renderer/msaa-store';
import { createQualityController, probeDevice } from '../quality';
import { createPackReader, disposeLoadedModels, loadPack } from '../assets';
import { createInputApi, InputProvider } from '../input';
import { createFadeController, createHudStore, FadeOverlay, HudLayer, SceneStyles } from '../ui';
import { applyProbeOverride, installTestHooks, KIT_DEV_PARAMS, readDevParams, registerTestHooks } from '../testing';
export * from './core';
export * from './types';

class Boundary extends Component<{ onError: (error: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.onError(asSceneError(error)); }
  render() { return this.state.failed ? null : this.props.children; }
}
export function SceneErrorBoundary(props: { onError: (error: Error) => void; children: ReactNode }): JSX.Element { return <Boundary {...props} />; }
export function useSceneBuilt(): (built: boolean) => void { return useRuntime().setBuilt; }
/** Shared play state drives page callbacks and the first-Escape rule. */
export function usePlayMode(): { playing: boolean; setPlaying(on: boolean): void } {
  const runtime=useRuntime();useSyncExternalStore(runtime.subscribe,runtime.getSnapshot,runtime.getSnapshot);
  return {playing:runtime.playing,setPlaying:runtime.setPlaying};
}
export function useSceneRootRef() { return useRuntime().rootRef; }

/** Own a child root so delegated React DOM listeners leave with the mount. */
export function mountScene(container: HTMLElement, Scene: ComponentType<SceneProps>, props: SceneProps): SceneHandle {
  if (!container || typeof container.appendChild !== 'function') {
    try { props.onError?.(new SceneError('no-container', 'A scene container is required')); } catch { /* Consumer callback. */ }
    return {disposed:true,unmount(){}};
  }
  return safeMount({
    createHost(){const element=container.ownerDocument.createElement('div');element.style.cssText='width:100%;height:100%';return element;},
    appendHost:element=>container.appendChild(element),removeHost:element=>element.remove(),
    createRoot:(element,onError)=>createDomRoot(element,{onCaughtError:onError,onUncaughtError:onError,onRecoverableError:onError}),
    render:(root,callbacks)=>root.render(<SceneErrorBoundary onError={callbacks.onError}><Scene {...props} {...callbacks}/></SceneErrorBoundary>),
    unmountRoot:root=>root.unmount(),scheduleFailureCleanup:cleanup=>queueMicrotask(cleanup),
    onReady:props.onReady,onError:props.onError,
  });
}

function RuntimeDom({ runtime }: { runtime: SceneRuntime }) {
  useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const { paused } = usePauseWhenHidden(runtime.rootRef, runtime.ready), reduced = useReducedMotion();
  useEffect(() => {
    if (runtime.disposed) return;
    runtime.paused = paused;
    runtime.input.clear();
    runtime.data.set('discardDelta', true);
    runtime.state?.setFrameloop(paused ? 'never' : 'always');
    runtime.quality?.step(0, { paused });
    runtime.notify();
  }, [runtime, paused]);
  useEffect(() => { runtime.motion.reduced = reduced; runtime.notify(); }, [runtime, reduced]);
  return <RuntimeContext.Provider value={runtime}><InputProvider target={runtime.rootRef}>
    <SceneErrorBoundary onError={runtime.fatal}>
      <HudLayer>{runtime.definition.hud}{import.meta.env.KILN_DEV && runtime.options.dev ? runtime.definition.devPanel : null}</HudLayer>
      <FadeOverlay />
    </SceneErrorBoundary>
  </InputProvider></RuntimeContext.Provider>;
}

export function SceneRoot({ options, definition, children }: { options: SceneProps; definition: SceneDefinition; children: ReactNode }): JSX.Element {
  const params = readDevParams(KIT_DEV_PARAMS);
  options = { ...options, ...(typeof params.assetBase === 'string' ? { assetBase: params.assetBase } : {}), ...(params.tier ? { quality: params.tier as SceneProps['quality'] } : {}), ...(params.backend === 'webgl2' ? { backend: 'webgl2' as const } : {}), ...(params.dev ? { dev: true } : {}) };
  const rootRef = useRef<HTMLDivElement>(null), hostRef = useRef<HTMLDivElement>(null), descriptionId = useId();
  const optionsRef = useRef(options), childrenRef = useRef(children);
  optionsRef.current = options; childrenRef.current = children;
  const [runtime, setRuntime] = useState<SceneRuntime | null>(null);

  useEffect(() => {
    const host = hostRef.current!, element = rootRef.current!;
    const canvas = element.ownerDocument.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    canvas.setAttribute('aria-hidden', 'true'); host.appendChild(canvas);
    const abort = new AbortController(), clock = createSceneClock(), registry = new DisposeRegistry();
    const listeners = new Set<() => void>(); let revision = 0, started = false, rootConfigured = false, cleaned = false;
    let fiber: ReturnType<typeof createRoot> | undefined, deviceLost = false, deviceLoss: Promise<unknown> | undefined, released = false;
    let restoreRender = () => {};
    let unbindFiberErrors = () => {};
    const motion = { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
    const notify = () => { revision++; notifySafely(listeners,error=>registry.errors.push(error)); };
    const callback = <K extends keyof SceneProps>(key: K, value?: unknown) => {
      if (rt.disposed || rt.failed) return;
      if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) (rt.data.get('events') as unknown[] | undefined)?.push({ type: key.replace(/^on/, '').toLowerCase(), value });
      const fn = optionsRef.current[key];
      if (typeof fn === 'function') try { (fn as (arg?: unknown) => void)(value); } catch (error) { rt.fatal(error); }
    };
    const gate = createReadyGate({
      schedule: fn => requestAnimationFrame(fn), cancel: id => cancelAnimationFrame(id),
      ready() {
        if(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV){const start=rt.data.get('startupAt');if(typeof start==='number')rt.data.set('readyMs',performance.now()-start);}
        rt.ready = true; rt.quality?.ready(); notify(); callback('onReady');
      },
      error(error) {
        if (rt.disposed || rt.failed) return;
        rt.failed = true;
        try { optionsRef.current.onError?.(error); } catch { /* Errors in page callbacks cannot escape. */ }
        notify(); cleanup(); setRuntime(null);
      },
    });
    const rt: SceneRuntime = {
      options, definition, rootRef, clock, registry, systems: createSystemLoop(clock, error => rt.fatal(error)), motion,
      paused: false, playing: false, disposed: false, built: false, ready: false, failed: false,
      pack: null, reader: null, backend: null, quality: null, input: createInputApi(),
      hud: createHudStore<Record<string, unknown>>({}), fade: createFadeController(() => motion.reduced),
      state: null, renderer: null, devParams: {}, data: new Map(), testHooks: {}, workloads: new Map(),
      setPlaying(on) { if (rt.disposed || rt.failed || rt.playing === on) return; rt.playing = on; rt.input.setEnabled(on); rt.hud.set({ playing: on }); callback('onPlayChange', on); notify(); },
      setBuilt(on) { if (!rt.disposed && !rt.failed) { rt.built = on; notify(); } },
      fatal(error) { gate.fail(error); }, notify, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }, getSnapshot: () => revision,
    };
    const enter = (event: KeyboardEvent) => { if (event.target === element && event.code === 'Enter' && !rt.playing && rt.ready) { event.preventDefault(); event.stopPropagation(); rt.setPlaying(true); } };
    element.addEventListener('keydown', enter);
    const lost = (event: Event) => { event.preventDefault(); if (!rt.disposed) rt.fatal(new SceneError('context-lost', 'Graphics context lost')); };
    canvas.addEventListener('webglcontextlost', lost);
    let offHooks = () => {};
    const observer = new ResizeObserver(() => {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height || rt.disposed) return;
      if (!started) { started = true; void start(bounds.width, bounds.height); }
      else if (rt.state) try{rt.state.setSize(bounds.width, bounds.height, bounds.top, bounds.left);}catch(error){rt.fatal(error);}
    });
    observer.observe(element);
    offHooks = installTestHooks(rt);

    function releaseResources() {
      if(released)return;released=true;
      restoreRender();
      registry.disposeAll();
      if (rt.state) try{releaseRendererLook(rt.state);}catch(error){registry.errors.push(error);}
      if (rt.pack) {
        try{disposeLoadedModels(rt.pack.models.values());}catch(error){registry.errors.push(error);}
        finally{rt.pack.models.clear();rt.pack.data.clear();rt.pack.imageHashes.clear();}
      }
      rt.data.clear(); listeners.clear();
    }

    function cleanup() {
      if (cleaned) return; cleaned = true;
      rt.disposed = true; notify(); gate.dispose(); abort.abort();
      unbindFiberErrors();
      rt.state?.setFrameloop('never'); rt.input.clear();
      observer.disconnect(); element.removeEventListener('keydown', enter); canvas.removeEventListener('webglcontextlost', lost);
      rt.systems.clear(); rt.input.dispose(); rt.quality?.dispose(); rt.hud.dispose(); rt.fade.dispose();
      offHooks();
      const reportDisposal = () => {
        releaseResources();
        if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) {
          void Promise.resolve(deviceLoss).then(() => {
            const gl = (rt.renderer?.backend as unknown as { gl?: WebGL2RenderingContext } | undefined)?.gl;
            (window as unknown as { __kilnDisposal?: (record: unknown) => void }).__kilnDisposal?.({ backend: rt.backend?.backend ?? null, disposed: true, deviceLost, contextLost: gl?.isContextLost() ?? false, resources: registry.size });
            rt.pack=null;rt.reader=null;rt.state=null;rt.renderer=null;
          });
        } else {rt.pack=null;rt.reader=null;rt.state=null;rt.renderer=null;}
      };
      if (fiber) unmountComponentAtNode(canvas, reportDisposal);
      else if (rt.renderer) void rt.renderer.dispose().catch(() => {});
      else reportDisposal();
      canvas.remove(); element.removeAttribute('data-kiln-backend');
    }

    async function start(width: number, height: number) {
      try {
        callback('onProgress', { phase: 'graphics', loaded: 0, total: 1, text: 'Initializing graphics' });
        if (rt.disposed) return;
        const prepareData=definition.prepareData;
        const packPromise = loadPack(options.assetBase, {
          signal: abort.signal, onProgress: progress => callback('onProgress', progress),
          ...(definition.startupModel ? {startupModel:definition.startupModel} : {}),
          ...(prepareData ? { onData: (data: ReadonlyMap<string,ArrayBuffer>) => prepareSceneData(prepareData,data,{signal:abort.signal,registry}) } : {}),
        });
        // Attach rejection handling immediately, before waiting for the async renderer.
        const packTask = packPromise.then(pack => {
          if (rt.disposed) { disposeLoadedModels(pack.models.values()); return null; }
          rt.pack = pack; rt.reader = createPackReader(options.assetBase, pack.manifest); return pack;
        });
        void packTask.catch(error => { if (!rt.disposed) rt.fatal(error); });
        if (rt.disposed) return;
        fiber = createRoot(canvas);
        unbindFiberErrors = bindFiberErrors(_roots.get(canvas)?.fiber, rt.fatal);
        const factory = createGlFactory({ forceWebGL: options.backend === 'webgl2', isDisposed: () => rt.disposed, onBackend: backend => {
          rt.backend = backend; element.dataset.kilnBackend = backend.backend; callback('onBackend', backend);
        } });
        await fiber.configure({
          gl: async defaults => {
            const renderer = await factory(defaults as Parameters<typeof factory>[0]);
            if(rt.disposed){await renderer.dispose();throw new DOMException('Scene disposed during graphics initialization','AbortError');}
            rt.renderer = renderer;
            const dispose = renderer.dispose.bind(renderer);
            // R3F calls this only after reconciler/effect cleanup. Release shared
            // pack resources and registries before the terminal backend disposal.
            renderer.dispose = async () => { renderer.dispose=dispose;try{releaseResources();}finally{await dispose();} };
            return renderer;
          },
          size: { width, height, top: 0, left: 0 }, frameloop: 'never', dpr: 1, shadows: false, events,
          camera: { fov: 40, near: .02, far: 500, position: [12, 10, 16], ...definition.camera },
          onCreated: state => {
            if (rt.disposed) { state.setFrameloop('never'); return; }
            rt.state = state; configureRenderer(state, definition.look); state.setFrameloop(rt.paused ? 'never' : 'always');
          },
        });
        rootConfigured = true;
        if (rt.disposed) return;
        const renderer = rt.renderer!;
        let probe = probeDevice({ gl: renderer } as unknown as RootState);
        if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) { probe = applyProbeOverride(probe); rt.data.set('probe', probe); }
        const quality = createQualityController(definition.tiers, probe, {
          quality: options.quality, sceneId: definition.id, motion, onTier: tier => { callback('onTier', tier); notify(); },
        });
        if(rt.disposed){quality.dispose();return;}
        rt.quality = quality;
        const tier = rt.quality.knobs;
        await fiber.configure({ dpr: rt.quality.live.pixelRatio, shadows: tier.shadows.enabled ? tier.shadows.type === 'basic' ? 'basic' : 'percentage' : false,
          camera: { fov: 40, near: .02, far: tier.drawDistance.far, position: [12, 10, 16], ...definition.camera },
          onCreated: state => { if(rt.disposed){state.setFrameloop('never');return;}rt.state=state;configureRenderer(state,definition.look);state.setFrameloop(rt.paused?'never':'always'); },
        });
        if(rt.disposed)return;
        const device = (renderer.backend as unknown as { device?: { lost: Promise<{ reason: string }> } }).device;
        deviceLoss = device?.lost.then(() => { deviceLost = true; if (!rt.disposed) rt.fatal(new SceneError('context-lost', 'Graphics device lost')); }).catch(error => { if (!rt.disposed) rt.fatal(error); });
        // OD-10: the MSAA store policy is decided once per mount from the structural tier, before the first frame.
        let forced: 'store' | 'discard' | undefined;
        if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) forced = readDevParams({ msaa: { kind: 'enum', values: ['store', 'discard'] } } as const).msaa as typeof forced;
        const discard = resolveMsaaDiscard(tier, forced);
        const msaa = installMsaaStorePolicy(renderer, _roots.get(canvas)!.store.getState().scene, { discard, onTrip: reason => {
          // A trip can fire inside three's pass, so the failure waits for it; public builds recover silently with store.
          if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) queueMicrotask(() => rt.fatal(new SceneError('msaa-discard', `MSAA discard tripped: ${reason}`)));
        } });
        // Its remover is in place from here, and a failing remove cannot skip the rest of the release.
        const removeMsaa = () => { try { msaa.remove(); } catch (error) { registry.errors.push(error); } };
        restoreRender = removeMsaa;
        if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) registerTestHooks({ msaaPolicy: () => ({ discard, active: msaa.active, tripped: msaa.tripped }) }, rt);
        // Catch only this renderer's synchronous submission errors; no global handler.
        const render = renderer.render.bind(renderer);
        restoreRender = () => { renderer.render=render; removeMsaa(); };
        renderer.render = ((...args: Parameters<WebGPURenderer['render']>) => {
          if (rt.disposed || rt.failed || rt.paused) return;
          let began = 0;
          if ((import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) && rt.data.get('measure')) began = performance.now();
          try { msaa.beforeRender(args[0]); return render(...args); } catch (error) { rt.fatal(error); }
          finally {
            try { msaa.afterRender(); } catch (error) { rt.fatal(error); }
            if ((import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) && began) (rt.data.get('cpuRecorder') as {push(ms:number):void} | undefined)?.push(performance.now()-began);
          }
        }) as WebGPURenderer['render'];
        await packTask;
        if (rt.disposed) return;
        callback('onProgress', { phase: 'build', loaded: 0, total: 1, text: 'Building scene' });
        if(rt.disposed)return;
        fiber.render(<RuntimeContext.Provider value={rt}><SceneErrorBoundary onError={rt.fatal}>
          {childrenRef.current}<SceneSystemLoop afterFrame={() => {
            if (!rt.built || !rt.pack || !rootConfigured) return;
            gate.frame(true);
          }} />
        </SceneErrorBoundary></RuntimeContext.Provider>);
        setRuntime(rt);
        // onCreated runs during R3F commit; the initial non-rendering frame mode is
        // switched by RuntimeDom after the root has committed.
      } catch (error) { if (!rt.disposed) rt.fatal(error); }
    }
    return () => { cleanup(); };
  }, [options.assetBase, options.quality, options.backend, definition]);

  return <div ref={rootRef} className="ks-root" role="region" aria-label={definition.label} aria-describedby={descriptionId} tabIndex={0}>
    <SceneStyles /><span id={descriptionId} className="ks-sr-only">{definition.description}</span>
    <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
    {runtime && <RuntimeDom runtime={runtime} />}
  </div>;
}
