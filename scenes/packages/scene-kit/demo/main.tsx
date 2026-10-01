import { mountScene } from '../src/contract';
import type { SceneHandle, SceneProps } from '../src/contract';
import { DemoScene } from './DemoScene';
import { DemoRenderFailureScene } from './error-fixture';
import { readDevParams, KIT_DEV_PARAMS } from '../src/testing';
import { _roots } from '@react-three/fiber';

const container = document.querySelector<HTMLElement>('#demo')!;
const status = document.querySelector<HTMLElement>('#page-status')!;
const shell = document.querySelector<HTMLElement>('#scene-shell')!;
const base = document.querySelector<HTMLMetaElement>('meta[name="kiln-asset-base"]')?.content ?? './assets/';
const params = (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) ? readDevParams(KIT_DEV_PARAMS) : {};
let handle: SceneHandle | null = null, readyCount = 0, callbacksAfterUnmount = 0, active = false;
let errors: { code: string; message: string }[] = [], backend: unknown = null;
const disposals: unknown[] = [];
let epoch = 0;
type HarnessOptions = Partial<SceneProps> & { width?: number; height?: number; renderFailure?: boolean; failCallback?: string };
function unmount() { active = false; epoch++; handle?.unmount(); handle = null; }
function mount(options: HarnessOptions = {}) {
  unmount(); active = true; const mountEpoch = ++epoch; readyCount = 0; errors = []; backend = null; status.textContent = 'Loading scene…';
  if (options.width !== undefined) container.style.width = `${options.width}px`; else container.style.width = '100%';
  if (options.height !== undefined) container.style.height = `${options.height}px`; else container.style.height = '100%';
  const fault = (name:string) => { if(import.meta.env.KILN_TEST && options.failCallback===name)throw new Error(`Intentional ${name} callback fixture`); };
  handle = mountScene(container, import.meta.env.KILN_TEST && options.renderFailure ? DemoRenderFailureScene : DemoScene, {
    assetBase: options.assetBase ?? (typeof params.assetBase === 'string' ? params.assetBase : base),
    quality: options.quality ?? (typeof params.tier === 'string' ? params.tier as SceneProps['quality'] : 'high'),
    backend: options.backend ?? (params.backend === 'webgl2' ? 'webgl2' : 'auto'),
    dev: options.dev ?? (import.meta.env.KILN_DEV && params.dev === true),
    onReady: () => { if (!active || epoch !== mountEpoch) { callbacksAfterUnmount++; return; } readyCount++; status.textContent = ''; options.onReady?.(); },
    onError: error => { if (!active || epoch !== mountEpoch) { callbacksAfterUnmount++; return; } errors.push({ code: String((error as Error & { code?: string }).code ?? 'runtime'), message: error.message }); status.textContent = `Scene could not start: ${error.message}`; options.onError?.(error); },
    onBackend: value => { backend = value; fault('backend'); options.onBackend?.(value); },
    onProgress: value => { if (active && epoch === mountEpoch) status.textContent = value.text; fault(value.phase); options.onProgress?.(value); },
    onTier: value => {fault('tier');options.onTier?.(value);}, onPlayChange: options.onPlayChange,
  });
}
if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) {
  const harness = { mount, unmount, snapshot: () => ({ readyCount, errors, backend, callbacksAfterUnmount, disposals, fiberRoots:_roots.size, shellEscapes: harness.shellEscapes }), shellEscapes: 0 };
  (window as any).__kilnHarness = harness;
  (window as any).__kilnDisposal = (record: unknown) => disposals.push(record);
  shell.addEventListener('keydown', event => { if (event.key === 'Escape') harness.shellEscapes++; });
}
document.querySelector<HTMLButtonElement>('#exit-scene')!.addEventListener('click', () => { unmount(); status.textContent = 'Scene closed. Reload this page to explore again.'; });
document.querySelector<HTMLButtonElement>('#fullscreen-scene')!.addEventListener('click', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void shell.requestFullscreen(); });
mount();
