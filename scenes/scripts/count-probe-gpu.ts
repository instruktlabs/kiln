// GPU-level half of the count probe (S1): installed with evaluateOnNewDocument before any page script, it records every
// render pass three encodes while armed, stamped with the scene clock's frame (`__kilnScene.frame`), so the Node runner
// can join it to the JS-level probe by frame and by RenderContext id (three labels its command encoders
// 'renderContext_<id>', WebGPUBackend.js:1080). Per pass: attachments with size, samples, format, load and store ops and
// resolve; direct draws (the four draw variants); setPipeline calls and distinct pipelines; executeBundles and the
// draws inside the bundles (three's mipmap passes, invisible to renderer.info). Uncaptured device errors are kept.
// Counts only: no clock is read. The join itself (crossCheck) and the record types live in scene-kit testing/probe-report.ts.
import type { Page } from 'puppeteer-core';
import type { GpuFrame } from '../packages/scene-kit/src/testing/probe-report';
export type { GpuAttachment, GpuFrame, GpuPass } from '../packages/scene-kit/src/testing/probe-report';

/** Self-contained: serialized into the page. */
export function installGpuCounters(): void {
  const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (w.__kilnGpuProbe || !w.GPUCommandEncoder) return;
  const G: any = w.__kilnGpuProbe = { armed: false, keep: 32, frames: {}, errors: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const views = new WeakMap<object, object>(), bundleDraws = new WeakMap<object, number>(), encoderDraws = new WeakMap<object, number>();
  const frameNow = () => { try { const f = w.__kilnScene?.frame; return typeof f === 'number' ? f : -1; } catch { return -1; } };
  const slot = () => {
    const f = frameNow(), entry = G.frames[f] ??= { passes: [], copies: 0, submits: 0 };
    const keys = Object.keys(G.frames).map(Number).sort((a, b) => a - b);
    while (keys.length > G.keep) delete G.frames[keys.shift()!];
    return { f, entry };
  };
  const wrap = (proto: any, name: string, make: (original: any) => any) => { const original = proto?.[name]; if (typeof original === 'function') proto[name] = make(original); }; // eslint-disable-line @typescript-eslint/no-explicit-any
  wrap(w.GPUTexture.prototype, 'createView', original => function (this: any, d?: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const view = original.call(this, d);
    views.set(view, { w: this.width, h: this.height, samples: this.sampleCount, format: this.format, mip: d?.baseMipLevel ?? 0 });
    return view;
  });
  wrap(w.GPUCommandEncoder.prototype, 'beginRenderPass', original => function (this: any, d: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const pass = original.call(this, d);
    if (G.armed) {
      const { f, entry } = slot(), z = d?.depthStencilAttachment;
      const color = [...(d?.colorAttachments ?? [])].filter(Boolean).map((c: any) => ({ ...(views.get(c.view) ?? {}), loadOp: c.loadOp, storeOp: c.storeOp, resolve: !!c.resolveTarget })); // eslint-disable-line @typescript-eslint/no-explicit-any
      const rec = { frame: f, encoder: String(this.label ?? ''), color, depth: z ? { ...(views.get(z.view) ?? {}), depthLoadOp: z.depthLoadOp, depthStoreOp: z.depthStoreOp, stencilLoadOp: z.stencilLoadOp, stencilStoreOp: z.stencilStoreOp } : null,
        draws: 0, setPipeline: 0, pipelines: new Set(), bundles: 0, bundledDraws: 0 };
      entry.passes.push(rec); pass.__kilnPass = rec;
    }
    return pass;
  });
  wrap(w.GPUCommandEncoder.prototype, 'copyTextureToTexture', original => function (this: any, ...args: any[]) { if (G.armed) slot().entry.copies++; return original.apply(this, args); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  wrap(w.GPUQueue.prototype, 'submit', original => function (this: any, ...args: any[]) { if (G.armed) slot().entry.submits++; return original.apply(this, args); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const P = w.GPURenderPassEncoder.prototype, B = w.GPURenderBundleEncoder?.prototype;
  for (const name of ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect']) {
    wrap(P, name, original => function (this: any, ...args: any[]) { if (this.__kilnPass) this.__kilnPass.draws++; return original.apply(this, args); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (B) wrap(B, name, original => function (this: any, ...args: any[]) { encoderDraws.set(this, (encoderDraws.get(this) ?? 0) + 1); return original.apply(this, args); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  if (B) wrap(B, 'finish', original => function (this: any, ...args: any[]) { const bundle = original.apply(this, args); bundleDraws.set(bundle, encoderDraws.get(this) ?? 0); return bundle; }); // eslint-disable-line @typescript-eslint/no-explicit-any
  wrap(P, 'setPipeline', original => function (this: any, pipeline: any) { const r = this.__kilnPass; if (r) { r.setPipeline++; r.pipelines.add(pipeline); } return original.call(this, pipeline); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  wrap(P, 'executeBundles', original => function (this: any, bundles: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const r = this.__kilnPass;
    if (r) for (const bundle of bundles ?? []) { r.bundles++; r.bundledDraws += bundleDraws.get(bundle) ?? 0; }
    return original.call(this, bundles);
  });
  wrap(w.GPUAdapter?.prototype, 'requestDevice', original => async function (this: any, ...args: any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const device = await original.apply(this, args);
    device.addEventListener?.('uncapturederror', (event: any) => { if (G.errors.length < 50) G.errors.push(String(event?.error?.message ?? event).slice(0, 400)); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    return device;
  });
}

export const armGpu = (page: Page, armed: boolean) => page.evaluate(on => { const g = (window as any).__kilnGpuProbe; if (g) { g.armed = on; if (on) g.frames = {}; } return !!g; }, armed); // eslint-disable-line @typescript-eslint/no-explicit-any
/** The recorded passes of one frame with pipeline sets reduced to counts, plus device errors so far. */
export function readGpuFrame(page: Page, frame: number): Promise<{ frame: GpuFrame | null; errors: string[] }> {
  return page.evaluate(f => {
    const g = (window as any).__kilnGpuProbe, entry = g?.frames[f]; // eslint-disable-line @typescript-eslint/no-explicit-any
    return { frame: entry ? { copies: entry.copies, submits: entry.submits, passes: entry.passes.map((p: any) => ({ ...p, pipelines: p.pipelines.size })) } : null, errors: g ? [...g.errors] : [] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }, frame);
}
