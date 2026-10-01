import { mountScene } from '@kiln-scenes/scene-kit';
import { M0Scene } from './M0Scene';

// Test-only fixture page: records readiness, errors and backend for the M0 runner.
const params = new URLSearchParams(location.search);
const state = { ready: 0, errors: [] as string[], backend: null as unknown };
(window as unknown as { __m0: typeof state }).__m0 = state;
mountScene(document.getElementById('host')!, M0Scene, {
  assetBase: './assets/', quality: 'high', backend: params.get('backend') === 'webgl2' ? 'webgl2' : 'auto',
  onReady() { state.ready++; },
  onError(error) { state.errors.push(error instanceof Error ? `${(error as Error & { code?: string }).code ?? 'runtime'}: ${error.message}` : String(error)); },
  onBackend(value) { state.backend = value; },
});
