import { BackSide, DoubleSide, FrontSide, Mesh } from 'three/webgpu';
import type { Camera, Group, Scene, WebGPURenderer } from 'three/webgpu';

/**
 * Prepare the hidden contact quad before the world becomes ready. Its first nearby traffic view
 * otherwise creates two WebGPU pipelines during interaction. Compile only this material/geometry:
 * water and fog-bank depth bindings cannot be compiled by a blanket world pass.
 *
 * Three's queued compileAsync sees DoubleSide after its temporary back/front side changes have
 * been restored. Explicit sides on separate cache owners retain both actual render variants.
 */
export async function prewarmContactShadows(renderer: WebGPURenderer, traffic: Group, scene: Scene, camera: Camera, signal: AbortSignal): Promise<{ dispose(): void }> {
  signal.throwIfAborted();
  const proxies: Mesh[] = [];
  const preparation = { dispose() {
    const failures: unknown[] = [];
    for (const proxy of proxies.splice(0)) { try { proxy.dispose(); } catch (error) { failures.push(error); } }
    if (failures.length) throw new AggregateError(failures, 'Golden Gate contact-shadow preparation cleanup failed');
  } };
  // The measured native pipeline stall is WebGPU-only; leave the WebGL fallback unchanged.
  if (!('isWebGPUBackend' in renderer.backend) || renderer.backend.isWebGPUBackend !== true) return preparation;
  const target = traffic.children.find(child => child.name === 'traffic-contact-shadows');
  if (!target) return preparation; // Shadow-map tiers have no contact quad.
  if (!(target instanceof Mesh) || Array.isArray(target.material) || target.material.name !== 'golden-gate-contact-shadows' ||
      target.material.side !== DoubleSide || target.material.forceSinglePass || target.visible || !camera.layers.test(target.layers)) {
    throw new Error('Golden Gate contact-shadow preparation requires the hidden double-sided traffic quad on the active camera layer');
  }
  const material = target.material, originalSide = material.side;
  target.updateWorldMatrix(true, false);
  let sideName = 'back';
  try {
    try {
      for (const [name, side] of [['back', BackSide], ['front', FrontSide]] as const) {
        signal.throwIfAborted(); sideName = name;
        const proxy = target.clone(false);
        proxy.name = `traffic-contact-shadows-prewarm-${name}`; proxy.visible = true;
        proxy.matrixAutoUpdate = false; proxy.matrix.copy(target.matrixWorld); proxy.matrixWorld.copy(target.matrixWorld);
        proxies.push(proxy);
        material.side = side;
        await renderer.compileAsync(proxy, camera, scene);
        signal.throwIfAborted();
      }
    } finally {
      material.side = originalSide;
      // No needsUpdate/version rewrite and no index-array rewind: WebGPU may initialize the
      // existing index attribute as Uint32 while preserving all six index values.
    }
    return preparation;
  } catch (error) {
    try { preparation.dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Golden Gate contact-shadow preparation and cleanup failed'); }
    signal.throwIfAborted();
    throw new Error(`Golden Gate contact-shadow ${sideName} pipeline preparation failed`, { cause: error });
  }
}
