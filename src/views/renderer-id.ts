/**
 * Deterministic identity of the pure-CPU rasterizer view producer.
 *
 * Mirrors the external render-service `rendererId` contract
 * ("<family>:<identity...>", e.g. "dawn-vulkan:nvidia-rtx-a4500:NVIDIA: 550.100")
 * so QA evidence and generation results can always name the honest producer of a
 * view artifact. The engine version is read from package.json ONCE at module
 * load — never per call — keeping the constant deterministic for a given build.
 */

import { readFileSync } from 'node:fs';

function engineVersion(): string {
  // Source lives in src/views; Node bundles live directly in dist. Never use
  // a consuming application's package version as the engine identity.
  for (const path of ['../package.json', '../../package.json']) {
    try {
      const raw = readFileSync(new URL(path, import.meta.url), 'utf8');
      const pkg = JSON.parse(raw) as { name?: unknown; version?: unknown };
      if (pkg.name === '@instruktlabs/kiln' && typeof pkg.version === 'string' && pkg.version) {
        return pkg.version;
      }
    } catch {
      // Try the other supported source/bundle layout.
    }
  }
  return 'unknown';
}

/** e.g. "cpu-raster:0.6.0" — the CPU rasterizer's deterministic rendererId. */
export const CPU_RASTER_RENDERER_ID = `cpu-raster:${engineVersion()}`;
