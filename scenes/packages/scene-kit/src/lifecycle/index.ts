import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { DependencyList, RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRuntime } from '../internal/runtime';
import type { SceneClock, SystemFn } from './core';
import { shouldPauseScene } from './core';
export * from './core';
export * from './time';
export function useBuilt<T>(factory: () => T, dispose: (value: T) => void, deps: readonly unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => { const built = factory(); setValue(built); return () => { dispose(built); }; }, deps as DependencyList);
  return value;
}
export function useSystem(name: string, order: number, fn: SystemFn): void {
  const runtime = useRuntime(), id = useId(), callback = useRef(fn);
  useLayoutEffect(() => { callback.current = fn; });
  useEffect(() => runtime.systems.add(name + ':' + id, order, (dt, elapsed, state) => callback.current(dt, elapsed, state)), [runtime,name,id,order]);
}
export function useSceneClock(): SceneClock { return useRuntime().clock; }
export function SceneSystemLoop({ afterFrame }: { afterFrame(): void }) {
  const runtime = useRuntime();
  useFrame((state, delta) => {
    if (runtime.disposed || runtime.failed || runtime.paused) return;
    try {
      if (runtime.data.get('discardDelta')) { delta = 0; runtime.data.delete('discardDelta'); }
      runtime.systems.step(delta, state, false, runtime.motion.reduced);
      if (runtime.input.state.cancel && runtime.playing) runtime.setPlaying(false);
      runtime.input.endFrame?.();
      runtime.fade.step(Math.min(.1, delta) * 1000);
      if (runtime.ready && !runtime.data.get('syntheticGovernor') && (!import.meta.env.KILN_TEST || runtime.data.get('measure'))) runtime.quality?.step(delta * 1000, { hidden: false, paused: false });
      if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) {
        const recorder = runtime.data.get('recorder') as { push(ms:number):void } | undefined;
        recorder?.push(delta * 1000);
        const workload = runtime.data.get('workload');
        if (typeof workload === 'string') runtime.workloads.get(workload)?.(runtime.clock.time);
      }
      afterFrame();
    } catch (e) { runtime.fatal(e); }
  }, 0);
  return null;
}
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches); update(); query.addEventListener('change',update);
    return () => query.removeEventListener('change',update);
  }, []);
  return reduced;
}
export function usePauseWhenHidden(root: RefObject<HTMLElement | null>, ready = true): { paused: boolean } {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let outside = false, pageHidden = false;
    const update = () => setPaused(shouldPauseScene({ outside, ready, documentHidden: document.hidden, pageHidden }));
    const hide = () => { pageHidden = true; update(); };
    const show = () => { pageHidden = false; update(); };
    const observer = new IntersectionObserver(entries => { outside = entries[0]?.isIntersecting === false; update(); });
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', update, { passive: true });
    window.addEventListener('pagehide',hide, { passive: true }); window.addEventListener('pageshow',show, { passive: true });
    update();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange',update); window.removeEventListener('pagehide',hide); window.removeEventListener('pageshow',show); };
  }, [root, ready]);
  return { paused };
}
