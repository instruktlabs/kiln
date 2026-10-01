import { _roots } from '@react-three/fiber';
import { mountScene, readDevParams, KIT_DEV_PARAMS } from '@kiln-scenes/scene-kit';
import type { SceneHandle, SceneProps } from '@kiln-scenes/scene-kit';
import { FoundryFloorScene } from '../src/FoundryFloorScene';

const container = document.querySelector<HTMLElement>('#foundry-floor')!;
const status = document.querySelector<HTMLElement>('#page-status')!;
const shell = document.querySelector<HTMLElement>('#scene-shell')!;
const base = document.querySelector<HTMLMetaElement>('meta[name="kiln-asset-base"]')?.content ?? './assets/';
const params = (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) ? readDevParams(KIT_DEV_PARAMS) : {};
// Review captures (test builds only): the page chrome is hidden so the scene fills the viewport.
if ((import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) && new URLSearchParams(location.search).get('capture') === '1') document.body.classList.add('capture');
let handle: SceneHandle | null = null, readyCount = 0, callbacksAfterUnmount = 0, active = false, epoch = 0;
let errors: { code: string; message: string; cause?: string }[] = [], backend: unknown = null;
const disposals: unknown[] = [], progress: { phase: string; loaded: number; total: number; text: string; at: number }[] = [], tiers: unknown[] = [];
type HarnessOptions = Partial<SceneProps> & { width?: number; height?: number; failCallback?: string };
function unmount() { active = false; epoch++; handle?.unmount(); handle = null; }
function mount(options: HarnessOptions = {}) {
  unmount(); active = true; const mountEpoch = ++epoch; readyCount = 0; errors = []; backend = null; progress.length = 0; tiers.length = 0; status.textContent = 'Loading scene…';
  status.dataset.state = 'loading'; delete status.dataset.errorCode;
  container.style.width = options.width === undefined ? '100%' : `${options.width}px`;
  container.style.height = options.height === undefined ? '100%' : `${options.height}px`;
  const fault = (name: string) => { if (import.meta.env.KILN_TEST && options.failCallback === name) throw new Error(`Intentional ${name} callback fixture`); };
  handle = mountScene(container, FoundryFloorScene, {
    assetBase: options.assetBase ?? (typeof params.assetBase === 'string' ? params.assetBase : base),
    quality: options.quality ?? (typeof params.tier === 'string' ? params.tier as SceneProps['quality'] : 'auto'),
    backend: options.backend ?? (params.backend === 'webgl2' ? 'webgl2' : 'auto'),
    dev: options.dev ?? (import.meta.env.KILN_DEV && params.dev === true),
    onReady() { if (!active || epoch !== mountEpoch) { callbacksAfterUnmount++; return; } readyCount++; status.dataset.state = 'ready'; status.textContent = ''; options.onReady?.(); },
    onError(error) { if (!active || epoch !== mountEpoch) { callbacksAfterUnmount++; return; } errors.push({ code: String((error as Error & { code?: string }).code ?? 'runtime'), message: error.message });
      // Test and dev builds keep the underlying cause (a renderer that could not start says why; the hub runner records it).
      if ((import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) && error.cause !== undefined) errors[errors.length - 1]!.cause = String((error.cause as Error)?.stack ?? (error.cause as Error)?.message ?? error.cause).slice(0, 2000);
      status.dataset.state = 'error'; status.dataset.errorCode = String((error as Error & { code?: string }).code ?? 'runtime');
      status.textContent = `Scene could not start: ${error.message}`; options.onError?.(error); },
    onBackend(value) { backend = value; fault('backend'); options.onBackend?.(value); },
    onProgress(value) { if (active && epoch === mountEpoch) { status.textContent = value.text; progress.push({ ...value, at: performance.now() }); } fault(value.phase); options.onProgress?.(value); },
    onTier(value) { if (active && epoch === mountEpoch) tiers.push(value); fault('tier'); options.onTier?.(value); }, onPlayChange: options.onPlayChange,
  });
}
if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) {
  const harness = { mount, unmount, snapshot: () => ({ readyCount, errors, backend, callbacksAfterUnmount, disposals, progress, tiers, fiberRoots: _roots.size, shellEscapes: harness.shellEscapes }), shellEscapes: 0 };
  (window as any).__kilnHarness = harness;
  (window as any).__kilnDisposal = (record: unknown) => disposals.push(record);
  shell.addEventListener('keydown', event => { if (event.key === 'Escape') harness.shellEscapes++; });
}
document.querySelector<HTMLButtonElement>('#exit-scene')!.addEventListener('click', () => { unmount(); status.textContent = 'Scene closed. Reload this page to explore again.'; });
document.querySelector<HTMLButtonElement>('#fullscreen-scene')!.addEventListener('click', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void shell.requestFullscreen(); });
mount();
