import { describe, expect, test } from 'bun:test';
import { PerspectiveCamera, RenderTarget, Scene } from 'three/webgpu';
import { installMsaaStorePolicy, resolveMsaaDiscard, type MsaaStorePolicy } from '../../src/renderer/msaa-store';
import type { TierKnobs } from '../../src/quality/core';

// OD-10 on fake objects. `frame` mirrors r186 Renderer._renderScene for the canvas path, in the order the contract
// test pins in three.webgpu.js: _getFrameBufferTarget resets the flags, setRenderTarget, scene.onBeforeRender, texture
// creation and beginRender read the flags, the pass ends, setRenderTarget(null), scene.onAfterRender. The kit's render
// wrapper brackets it: beforeRender first, afterRender in its finally.
class FakeRenderer {
  backend: object = { isWebGPUBackend: true }; samples = 4; stencil = false; toneMapped = true; output: RenderTarget | null = null;
  autoClear = true; autoClearColor = true; autoClearDepth = true; autoClearStencil = true;
  target: RenderTarget | null = null; log: string[] = [];
  get needsFrameBufferTarget() { return this.toneMapped && (this.target === null || this.target === this.output); }
  getRenderTarget() { return this.target; }
  setRenderTarget(t: RenderTarget | null) { this.target = t; }
  getOutputRenderTarget() { return this.output; }
  copyFramebufferToTexture(_texture: unknown) { this.log.push('copy'); }
  clear(_c = true, _d = true, _s = true) { this.log.push('clear'); }
  clearColor() { this.log.push('clearColor'); this.clear(true, false, false); }
  clearDepth() { this.log.push('clearDepth'); this.clear(false, true, false); }
  clearStencil() { this.log.push('clearStencil'); this.clear(false, false, true); }
}
const camera = new PerspectiveCamera();
function setup(o: { discard?: boolean; webgpu?: boolean; samples?: number } = {}) {
  const r = new FakeRenderer(), scene = new Scene(), trips: string[] = [];
  if (o.webgpu === false) r.backend = { isWebGLBackend: true };
  if (o.samples !== undefined) r.samples = o.samples;
  const fb = Object.assign(new RenderTarget(4, 4, { samples: r.samples }), { isPostProcessingRenderTarget: true });
  fb.addEventListener('dispose', () => r.log.push('dispose'));
  let p: MsaaStorePolicy;
  const install = () => (p = installMsaaStorePolicy(r as any, scene, { discard: o.discard ?? true, onTrip: reason => trips.push(reason) }));
  const policy = install();
  const reset = () => { fb.storeMultisampledColorBuffer = fb.storeMultisampledDepthBuffer = fb.storeMultisampledStencilBuffer = true; };
  const ops = () => [fb.storeMultisampledColorBuffer, fb.storeMultisampledDepthBuffer, fb.storeMultisampledStencilBuffer].map(s => s ? 'store' : 'discard').join('/');
  const frame = (during?: () => void) => {
    p.beforeRender(scene);
    try {
      reset(); r.setRenderTarget(fb); scene.onBeforeRender(r as any, scene, camera, fb as any, null as any, null as any);
      const encoded = ops(); during?.(); r.log.push('pass-end');
      r.setRenderTarget(null); scene.onAfterRender(r as any, scene, camera, fb as any, null as any, null as any);
      return encoded;
    } finally { p.afterRender(); }
  };
  return { r, scene, fb, trips, policy, install, frame, reset, ops };
}

describe('OD-10 MSAA store policy', () => {
  test('default is store: only an explicit knob (or a test override) discards', () => {
    const base = {} as TierKnobs;
    expect(resolveMsaaDiscard(base)).toBe(false);
    expect(resolveMsaaDiscard({ ...base, multisample: { discard: false } })).toBe(false);
    expect(resolveMsaaDiscard({ ...base, multisample: { discard: true } })).toBe(true);
    expect(resolveMsaaDiscard({ ...base, multisample: { discard: true } }, 'store')).toBe(false);
    expect(resolveMsaaDiscard(base, 'discard')).toBe(true);
  });

  test('flags go false on the canvas frame-buffer target every frame, after three resets them; callbacks chain', () => {
    const r = new FakeRenderer(), scene = new Scene(), before: unknown[][] = [], after: unknown[][] = [];
    scene.onBeforeRender = (...args: unknown[]) => { before.push(args); };
    scene.onAfterRender = (...args: unknown[]) => { after.push(args); };
    const fb = Object.assign(new RenderTarget(4, 4, { samples: 4 }), { isPostProcessingRenderTarget: true });
    const policy = installMsaaStorePolicy(r as any, scene, { discard: true, onTrip: () => { throw new Error('no trip expected'); } });
    for (let i = 0; i < 2; i++) {
      fb.storeMultisampledColorBuffer = fb.storeMultisampledDepthBuffer = fb.storeMultisampledStencilBuffer = true;
      r.setRenderTarget(fb); scene.onBeforeRender(r as any, scene, camera, fb as any, null as any, null as any);
      expect([fb.storeMultisampledColorBuffer, fb.storeMultisampledDepthBuffer, fb.storeMultisampledStencilBuffer]).toEqual([false, false, false]);
      r.setRenderTarget(null); scene.onAfterRender(r as any, scene, camera, fb as any, null as any, null as any);
    }
    expect(before.length).toBe(2); expect(after.length).toBe(2); expect(before[0]![3]).toBe(fb); expect(after[1]![0]).toBe(r);
    expect(policy.active).toBe(true); expect(policy.tripped).toBeNull();
  });

  test('other targets keep store: user targets, single-sample, an output render target set', () => {
    const { r, scene, fb } = setup();
    const user = new RenderTarget(4, 4, { samples: 4 }), single = Object.assign(new RenderTarget(4, 4), { isPostProcessingRenderTarget: true });
    for (const t of [user, single]) { r.setRenderTarget(t); scene.onBeforeRender(r as any, scene, camera, t as any, null as any, null as any); expect(t.storeMultisampledColorBuffer).toBe(true); }
    r.output = new RenderTarget(4, 4); r.setRenderTarget(fb); scene.onBeforeRender(r as any, scene, camera, fb as any, null as any, null as any);
    expect([fb.storeMultisampledColorBuffer, fb.storeMultisampledDepthBuffer]).toEqual([true, true]);
  });

  test('autoClear off trips at the frame start: disposes before texture creation and encodes store, never declines silently', () => {
    for (const key of ['autoClear', 'autoClearColor', 'autoClearDepth'] as const) {
      const { r, frame, trips, policy } = setup();
      expect(frame()).toBe('discard/discard/discard');
      r[key] = false; r.log.length = 0;
      expect(frame()).toBe('store/store/store');
      expect(r.log).toEqual(['dispose', 'pass-end']); expect(trips).toEqual(['autoClear']);
      expect(policy.active).toBe(false); expect(policy.tripped).toBe('autoClear');
      r[key] = true; expect(frame()).toBe('store/store/store'); expect(trips.length).toBe(1);
    }
    const stencil = setup(); stencil.r.stencil = true; stencil.r.autoClearStencil = false;
    expect(stencil.frame()).toBe('store/store/store'); expect(stencil.trips).toEqual(['autoClear']);
  });

  test('a mid-pass framebuffer copy still runs, and the target is disposed only after the frame', () => {
    const { r, frame, trips, policy } = setup();
    frame(); r.log.length = 0;
    expect(frame(() => r.copyFramebufferToTexture({}))).toBe('discard/discard/discard');
    expect(r.log).toEqual(['copy', 'pass-end', 'dispose']); expect(trips).toEqual(['copyFramebufferToTexture']); expect(policy.active).toBe(false);
    r.log.length = 0; expect(frame(() => r.copyFramebufferToTexture({}))).toBe('store/store/store');
    expect(r.log).toEqual(['copy', 'pass-end']); expect(trips.length).toBe(1);
  });

  test('a nested render into another target (a reflector) never disposes mid-pass; the next frame start does if onAfterRender was missed', () => {
    const { r, scene, fb, frame, policy } = setup(), mirror = new RenderTarget(4, 4);
    frame(); r.log.length = 0;
    frame(() => {
      r.copyFramebufferToTexture({});
      // ReflectorBaseNode.updateBefore: its own target, a clear, then the scene through the kit wrapper.
      r.setRenderTarget(mirror); r.clear(); policy.beforeRender(scene);
      scene.onBeforeRender(r as any, scene, camera, mirror as any, null as any, null as any);
      scene.onAfterRender(r as any, scene, camera, mirror as any, null as any, null as any); policy.afterRender(); r.setRenderTarget(fb);
    });
    expect(r.log).toEqual(['copy', 'clear', 'pass-end', 'dispose']);
    const other = setup(); other.frame(); other.r.log.length = 0;
    other.reset(); other.r.setRenderTarget(other.fb); other.scene.onBeforeRender(other.r as any, other.scene, camera, other.fb as any, null as any, null as any);
    other.r.copyFramebufferToTexture({}); other.r.log.push('pass-end'); other.r.setRenderTarget(null); // the frame threw: no onAfterRender
    other.frame(); expect(other.r.log).toEqual(['copy', 'pass-end', 'dispose', 'pass-end']);
  });

  test('a frame that throws after a mid-pass trip: the wrapper\'s afterRender restores store and disposes before any later clear', () => {
    const { r, scene, fb, frame, reset, ops, policy, trips } = setup();
    frame(); r.log.length = 0;
    policy.beforeRender(scene); reset(); r.setRenderTarget(fb); scene.onBeforeRender(r as any, scene, camera, fb as any, null as any, null as any);
    r.copyFramebufferToTexture({}); // the frame then throws: no pass end, no onAfterRender, and three leaves the target bound
    policy.afterRender();
    expect(r.log).toEqual(['copy', 'dispose']); expect(ops()).toBe('store/store/store');
    r.clear(); expect(r.log).toEqual(['copy', 'dispose', 'clear']); expect(trips).toEqual(['copyFramebufferToTexture']);
  });

  test('a later non-chaining overwrite of scene.onBeforeRender trips hook-lost when that frame ends: store again, target disposed', () => {
    const { r, scene, frame, trips, policy } = setup();
    expect(frame()).toBe('discard/discard/discard'); r.log.length = 0;
    scene.onBeforeRender = () => {};
    expect(frame()).toBe('store/store/store'); // three's reset, unhooked, encodes store onto attachments created transient
    expect(r.log).toEqual(['pass-end', 'dispose']); expect(trips).toEqual(['hook-lost']); expect(policy.tripped).toBe('hook-lost');
    expect(policy.active).toBe(false); expect(frame()).toBe('store/store/store'); expect(trips.length).toBe(1);
  });

  test('hook-lost needs an outermost canvas render of the hooked scene: a pipeline quad around a scene pass, or a user target, never trips', () => {
    const { r, scene, frame, trips, policy } = setup(), quad = new Scene(), user = new RenderTarget(4, 4);
    frame(); r.log.length = 0;
    const into = (target: RenderTarget) => {
      const before = r.getRenderTarget(); r.setRenderTarget(target); policy.beforeRender(scene);
      scene.onBeforeRender(r as any, scene, camera, target as any, null as any, null as any);
      scene.onAfterRender(r as any, scene, camera, target as any, null as any, null as any); policy.afterRender(); r.setRenderTarget(before);
    };
    r.toneMapped = false; policy.beforeRender(quad); into(user); policy.afterRender(); r.toneMapped = true; // RenderPipeline: quad, then its scene pass
    into(user); // the scene into a user target at the top level
    expect(trips).toEqual([]); expect(r.log).toEqual([]); expect(frame()).toBe('discard/discard/discard');
  });

  test('a canvas-path clear (each of the four) or an out-of-pass copy disposes before the call', () => {
    for (const call of ['clear', 'clearColor', 'clearDepth', 'clearStencil', 'copyFramebufferToTexture'] as const) {
      const { r, frame, trips } = setup();
      frame(); r.log.length = 0;
      (r[call] as (arg?: unknown) => void)({});
      expect(r.log[0]).toBe('dispose'); expect(r.log.filter(entry => entry === 'dispose').length).toBe(1);
      expect(trips).toEqual([call]);
      expect(frame()).toBe('store/store/store');
    }
  });

  test('clears and copies elsewhere do not trip: into a user target, or a canvas without the frame-buffer target', () => {
    const { r, frame, trips } = setup();
    frame(); r.log.length = 0;
    r.setRenderTarget(new RenderTarget(4, 4)); r.clear(); r.copyFramebufferToTexture({});
    r.setRenderTarget(null); r.toneMapped = false; r.clearColor(); r.copyFramebufferToTexture({}); r.toneMapped = true;
    expect(trips).toEqual([]); expect(r.log).not.toContain('dispose'); expect(frame()).toBe('discard/discard/discard');
  });

  test('inside the kit render wrapper: a canvas render of another object trips and disposes first; the hooked scene, render targets and a pipeline quad do not', () => {
    const { r, scene, frame, trips, policy } = setup();
    frame(); r.log.length = 0;
    const render = (object: Scene) => { policy.beforeRender(object); policy.afterRender(); };
    frame(); r.log.length = 0; // the hooked scene, through the wrapper
    r.setRenderTarget(new RenderTarget(4, 4)); render(new Scene()); r.setRenderTarget(null);
    r.toneMapped = false; render(new Scene()); r.toneMapped = true; // RenderPipeline renders its quad untone-mapped
    expect(trips).toEqual([]); expect(r.log).toEqual([]);
    render(new Scene());
    expect(r.log).toEqual(['dispose']); expect(trips).toEqual(['render']); expect(frame()).toBe('store/store/store');
  });

  test('WebGL, single-sample and store decisions install nothing', () => {
    for (const o of [{ webgpu: false }, { samples: 1 }, { samples: 0 }, { discard: false }]) {
      const { r, scene, frame, policy } = setup(o);
      expect(Object.hasOwn(scene, 'onBeforeRender')).toBe(false);
      for (const key of ['copyFramebufferToTexture', 'clear', 'clearColor', 'clearDepth', 'clearStencil']) expect(Object.hasOwn(r, key)).toBe(false);
      expect(frame()).toBe('store/store/store'); expect(policy.active).toBe(false); expect(policy.tripped).toBeNull();
      policy.beforeRender(new Scene()); policy.afterRender(); policy.remove();
    }
  });

  test('idempotent across the two configure calls: one chain, one policy', () => {
    const r = new FakeRenderer(), scene = new Scene(), fb = Object.assign(new RenderTarget(4, 4, { samples: 4 }), { isPostProcessingRenderTarget: true });
    let before = 0, after = 0;
    scene.onBeforeRender = () => { before++; }; scene.onAfterRender = () => { after++; };
    const install = () => installMsaaStorePolicy(r as any, scene, { discard: true, onTrip: () => {} });
    const policy = install(), hook = scene.onBeforeRender, clear = r.clear;
    expect(install()).toBe(policy); expect(scene.onBeforeRender).toBe(hook); expect(r.clear).toBe(clear);
    r.setRenderTarget(fb); scene.onBeforeRender(r as any, scene, camera, fb as any, null as any, null as any);
    r.setRenderTarget(null); scene.onAfterRender(r as any, scene, camera, fb as any, null as any, null as any);
    expect([before, after]).toEqual([1, 1]); expect(fb.storeMultisampledColorBuffer).toBe(false);
  });

  test('compileAsync: onBeforeRender without a pass or onAfterRender, on a sub-object, is harmless', () => {
    const { r, scene, fb, frame, reset, ops, trips } = setup(), mesh = new Scene();
    reset(); scene.onBeforeRender(r as any, mesh, camera, fb as any, null as any, null as any);
    expect(ops()).toBe('discard/discard/discard'); // three creates the attachments transient here
    expect(trips).toEqual([]); expect(r.log).toEqual([]);
    expect(frame()).toBe('discard/discard/discard'); expect(trips).toEqual([]);
  });

  test('remove restores three, disposes the discard target and is final', () => {
    const { r, scene, frame, policy, install, trips } = setup();
    frame(); r.log.length = 0;
    policy.remove(); policy.remove();
    expect(r.log).toEqual(['dispose']);
    expect(Object.hasOwn(scene, 'onBeforeRender')).toBe(false); expect(Object.hasOwn(scene, 'onAfterRender')).toBe(false);
    for (const key of ['copyFramebufferToTexture', 'clear', 'clearColor', 'clearDepth', 'clearStencil']) expect(Object.hasOwn(r, key)).toBe(false);
    expect(policy.active).toBe(false); expect(frame()).toBe('store/store/store'); r.clear(); policy.beforeRender(new Scene()); policy.afterRender();
    expect(trips).toEqual([]);
    const again = install(); expect(again).not.toBe(policy); expect(frame()).toBe('discard/discard/discard'); again.remove();
  });

  test('a wrapper added on top after install survives remove, and ours passes through', () => {
    const { scene, frame, policy } = setup();
    const ours = scene.onBeforeRender, seen: string[] = [];
    scene.onBeforeRender = function (...args: Parameters<Scene['onBeforeRender']>) { seen.push('outer'); return ours.apply(this, args); };
    policy.remove();
    expect(seen.length).toBe(0); expect(frame()).toBe('store/store/store'); expect(seen).toEqual(['outer']);
  });
});
