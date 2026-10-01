import { GPUFeatureName } from 'three/src/renderers/webgpu/utils/WebGPUConstants.js';

export interface DeviceApi<D> {
  requestAdapter(options: { featureLevel: 'compatibility'; xrCompatible: false }): Promise<{
    features: { has(name: string): boolean };
    requestDevice(descriptor: { requiredFeatures: string[]; requiredLimits: Record<string, number> }): Promise<D>;
  } | null>;
}

/**
 * Chromium on Windows warns on any powerPreference hint, and ignores it.
 * Supply an owned device using the same effective selection/features as r186.
 * Other platforms and failed probes remain on three's native initialization
 * and fallback path. No browser API or console function is replaced.
 */
export async function requestWindowsDevice<D>(options: {
  platform: string;
  forceWebGL: boolean;
  gpu?: DeviceApi<D>;
}): Promise<D | undefined> {
  if (!/^Win/i.test(options.platform) || options.forceWebGL || !options.gpu) return undefined;
  try {
    const adapter = await options.gpu.requestAdapter({ featureLevel: 'compatibility', xrCompatible: false });
    if (!adapter) return undefined;
    const requiredFeatures = Object.values(GPUFeatureName).filter((name) => adapter.features.has(name));
    return await adapter.requestDevice({ requiredFeatures, requiredLimits: {} });
  } catch {
    return undefined;
  }
}
