import type { Object3D, RenderTarget, Scene, WebGPURenderer } from 'three/webgpu';
import type { TierKnobs } from '../quality/core';
/**
 * OD-10. With antialias and tone mapping, three r186 renders the canvas through an internal 4x frame-buffer target
 * and resets its public storeMultisampled* flags to `true` on every call (Renderer._getFrameBufferTarget); nothing
 * public reaches that target. Storing is three's conservative default, needed only when a mid-pass framebuffer copy
 * splits the pass (viewport depth/texture nodes, transmission). For a scene whose main pass is never split, this
 * policy writes the flags `false` from scene.onBeforeRender, which runs after that reset and before texture creation
 * and beginRender: the pass resolves, then discards, and three creates the 4x attachments transient. Public members,
 * private contract; tests/renderer/msaa-contract.test.ts pins the order in three.webgpu.js.
 * Transient attachments allow only clear/discard passes, so anything that would load or store them trips the policy
 * for the rest of the mount, restores store and disposes the target (three recreates storable attachments): mid-pass,
 * after the frame; otherwise before the call. So does an outermost canvas render of the scene that never reached the
 * hook (a later non-chaining onBeforeRender), once that frame ends. A trip is never a silent decline.
 */
type Target = RenderTarget & { isPostProcessingRenderTarget?: boolean };
type Renderer = WebGPURenderer & { needsFrameBufferTarget: boolean; stencil: boolean };
type Hook = (this: unknown, ...args: unknown[]) => unknown;
export type MsaaTrip = 'autoClear' | 'copyFramebufferToTexture' | 'clear' | 'clearColor' | 'clearDepth' | 'clearStencil' | 'render' | 'hook-lost';
export interface MsaaStorePolicy {
  readonly active: boolean; readonly tripped: MsaaTrip | null;
  /** The kit's renderer.render wrapper brackets every render: beforeRender first, afterRender in its finally. */
  beforeRender(object: Object3D): void;
  afterRender(): void;
  remove(): void;
}
export interface MsaaStoreOptions { discard: boolean; onTrip(reason: MsaaTrip): void }
/** Store unless the structural tier opts in; KILN_TEST/KILN_DEV may force either way. */
export function resolveMsaaDiscard(knobs: TierKnobs, forced?: 'store' | 'discard'): boolean {
  return forced ? forced === 'discard' : knobs.multisample?.discard === true;
}
function patch<T extends object>(object: T, key: keyof T & string, wrap: (original: Hook) => Hook): () => void {
  const own = Object.prototype.hasOwnProperty.call(object, key), original = object[key] as unknown as Hook, wrapped = wrap(original);
  (object as Record<string, unknown>)[key] = wrapped;
  return () => { if ((object as Record<string, unknown>)[key] !== wrapped) return; if (own) (object as Record<string, unknown>)[key] = original; else delete (object as Record<string, unknown>)[key]; };
}
const policies = new WeakMap<WebGPURenderer, MsaaStorePolicy>();
/** Once per renderer: a second call returns the first policy, so it is decided once per mount and never toggled. */
export function installMsaaStorePolicy(renderer: WebGPURenderer, scene: Scene, o: MsaaStoreOptions): MsaaStorePolicy {
  const existing = policies.get(renderer); if (existing) return existing;
  const r = renderer as Renderer;
  if (!o.discard || (r.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend !== true || !(r.samples > 1)) {
    const inert: MsaaStorePolicy = { active: false, tripped: null, beforeRender() {}, afterRender() {}, remove() { if (policies.get(renderer) === inert) policies.delete(renderer); } };
    policies.set(renderer, inert); return inert;
  }
  let current: Target | null = null, pending: Target | null = null, tripped: MsaaTrip | null = null, removed = false;
  // Wrapper depth; whether the outermost render is the scene on the canvas path, and whether the hook saw its target.
  let depth = 0, canvasFrame = false, hooked = false;
  const live = () => !removed && tripped === null;
  const onCanvas = () => r.getRenderTarget() === null && r.getOutputRenderTarget() === null && r.needsFrameBufferTarget;
  // Store again before disposing: a clear or copy that recreates the attachments outside _getFrameBufferTarget reads these.
  const release = (target: Target | null) => {
    if (!target) return;
    target.storeMultisampledColorBuffer = target.storeMultisampledDepthBuffer = target.storeMultisampledStencilBuffer = true; target.dispose();
  };
  const trip = (reason: MsaaTrip, midPass: boolean) => {
    tripped = reason; const target = current; current = null;
    if (midPass) pending = target; else release(target);
    o.onTrip(reason);
  };
  const guard = (reason: MsaaTrip) => {
    if (!live()) return;
    if (current !== null && r.getRenderTarget() === current) trip(reason, true);
    else if (onCanvas()) trip(reason, false);
  };
  // Only at the canvas target's own frame boundaries: a nested render into another target (a reflector) runs mid-pass.
  const settle = (target: unknown) => { if (pending !== null && target === pending) { pending = null; release(target as Target); } };
  const restores = [
    patch(scene, 'onBeforeRender', before => function (this: unknown, ...args: unknown[]) {
      settle(args[3]);
      const t = args[3] as Target | null | undefined;
      if (live() && t?.isPostProcessingRenderTarget === true && t.samples > 1 && r.getOutputRenderTarget() === null) {
        hooked = true;
        if (!(r.autoClear && r.autoClearColor && r.autoClearDepth && (r.autoClearStencil || !r.stencil))) trip('autoClear', false);
        else { t.storeMultisampledColorBuffer = t.storeMultisampledDepthBuffer = t.storeMultisampledStencilBuffer = false; current = t; }
      }
      return before.apply(this, args);
    }),
    patch(scene, 'onAfterRender', after => function (this: unknown, ...args: unknown[]) {
      try { return after.apply(this, args); } finally { settle(args[3]); }
    }),
    ...(['copyFramebufferToTexture', 'clear', 'clearColor', 'clearDepth', 'clearStencil'] as const).map(key =>
      patch(r, key, original => function (this: unknown, ...args: unknown[]) { guard(key); return original.apply(this, args); })),
  ];
  const policy: MsaaStorePolicy = {
    get active() { return live(); }, get tripped() { return tripped; },
    beforeRender(object) {
      if (removed) return;
      if (depth++ === 0) { hooked = false; canvasFrame = object === scene && onCanvas(); }
      if (object !== scene) guard('render');
    },
    // The outermost render is over, even one that threw: a pending target goes now, and a canvas frame of the scene
    // that the hook never saw encoded three's store onto transient attachments.
    afterRender() {
      if (removed || depth === 0 || --depth > 0) return;
      settle(pending);
      if (canvasFrame && live() && !hooked) trip('hook-lost', false);
    },
    remove() {
      if (removed) return; removed = true; policies.delete(renderer);
      for (const restore of restores) restore();
      const target = pending ?? current; pending = current = null; release(target);
    },
  };
  policies.set(renderer, policy); return policy;
}
