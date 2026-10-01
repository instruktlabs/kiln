import assert from 'node:assert/strict';
import type { Page } from 'puppeteer-core';
import { assertOwnedUrl } from '../packages/scene-kit/src/testing/node';

/** Self-contained because CDP invokes its source in the page. Never enumerate broad info objects. */
export function projectRendererCounts(renderer: any) {
  const count = (value: unknown, name: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid renderer count: ' + name);
    return value;
  };
  const info = renderer.info;
  if (!info || typeof info.autoReset !== 'boolean') throw new Error('Missing renderer.info shape');
  const backend = renderer.backend?.isWebGPUBackend ? 'webgpu' : renderer.backend?.isWebGLBackend ? 'webgl2' : null;
  if (!backend) throw new Error('Unknown renderer backend');
  const memory: Record<string, number> = {};
  for (const name of ['geometries', 'textures', 'programs', 'attributes', 'attributesSize', 'indexAttributes', 'indexAttributesSize',
    'indirectStorageAttributes', 'indirectStorageAttributesSize', 'programsSize', 'readbackBuffers', 'readbackBuffersSize', 'renderTargets',
    'storageAttributes', 'storageAttributesSize', 'texturesSize', 'uniformBuffers', 'uniformBuffersSize', 'total']) memory[name] = count(info.memory?.[name], 'memory.' + name);
  return {
    backend, frame: count(info.frame, 'frame'), autoReset: info.autoReset,
    drawingBuffer: { width: count(renderer.domElement.width, 'canvas.width'), height: count(renderer.domElement.height, 'canvas.height') },
    render: { drawCalls: count(info.render.drawCalls, 'render.drawCalls'), triangles: count(info.render.triangles, 'render.triangles'),
      points: count(info.render.points, 'render.points'), lines: count(info.render.lines, 'render.lines'), frameCalls: count(info.render.frameCalls, 'render.frameCalls') },
    memory, pipelines: count(renderer._pipelines?.caches?.size, '_pipelines.caches.size'),
    shaderStages: { vertex: count(renderer._pipelines?.programs?.vertex?.size, 'vertex programs'), fragment: count(renderer._pipelines?.programs?.fragment?.size, 'fragment programs'), compute: count(renderer._pipelines?.programs?.compute?.size, 'compute programs') },
  };
}

/**
 * Count-only inspection of the sole connected pilot renderer. Dynamic import retrieves the
 * already-loaded sealed module; querying its specific prototype neither patches nor starts it.
 */
export async function readPilotRendererCounts(page: Page, ownedPorts: ReadonlySet<number>) {
  assertOwnedUrl(page.url(), ownedPorts);
  const moduleUrl = new URL('/three/three.webgpu.js', page.url()).href; assertOwnedUrl(moduleUrl, ownedPorts);
  const client = await page.createCDPSession(), objectGroup = 'kiln-pilot-count-reader';
  try {
    const prototype = await client.send('Runtime.evaluate', { expression: `import(${JSON.stringify(moduleUrl)}).then(module => module.WebGPURenderer.prototype)`, awaitPromise: true, objectGroup });
    assert(!prototype.exceptionDetails, 'Could not read the sealed WebGPURenderer prototype'); assert(prototype.result.objectId, 'Renderer prototype was not an object');
    const queried = await client.send('Runtime.queryObjects', { prototypeObjectId: prototype.result.objectId, objectGroup });
    assert(queried.objects.objectId, 'Renderer query did not return an object collection');
    const result = await client.send('Runtime.callFunctionOn', {
      objectId: queried.objects.objectId,
      functionDeclaration: `function () {
        const canvas = document.querySelector('#canvas');
        const renderers = this.filter(renderer => renderer.domElement === canvas && canvas && canvas.isConnected);
        if (renderers.length !== 1) throw new Error('Expected exactly one connected sealed renderer; found ' + renderers.length);
        return (${projectRendererCounts.toString()})(renderers[0]);
      }`, returnByValue: true,
    });
    assert(!result.exceptionDetails, 'Could not inspect the sealed renderer counts: ' + (result.exceptionDetails?.exception?.description ?? result.exceptionDetails?.text ?? ''));
    const counts = result.result.value as ReturnType<typeof projectRendererCounts>;
    assert.equal(counts.autoReset, false, 'Pilot must reset info once around the full frame, including shadow passes');
    return { ...counts, scope: 'All renderer.info submissions in the current frame, including shadows; not DOM main-only triangles',
      sources: { moduleUrl, info: 'three.webgpu.js:32325–32505', pipelines: 'three.webgpu.js:33042–33102', pilotReset: 'viewer.mjs:149' },
      timing: 'No timing property, measurement object, benchmark or performance report read' };
  } finally {
    try { await client.send('Runtime.releaseObjectGroup', { objectGroup }); } finally { await client.detach(); }
  }
}

/**
 * The shader clock that drives the sealed pilot's grass wind and stream (`nodeFrame.time`, the
 * seconds accumulated by its render loop; the TSL `time` uniform reads it on every render).
 * Read so a frozen rewrite capture can be placed at the same wind and water phase. It is an
 * animation phase, not a performance measurement; nothing is timed or compared as speed.
 */
export function projectShaderClock(renderer: any) {
  const frame = renderer?._nodes?.nodeFrame, time = frame?.time, frameId = frame?.frameId;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) throw new Error('Invalid sealed node-frame time');
  if (typeof frameId !== 'number' || !Number.isInteger(frameId) || frameId < 0) throw new Error('Invalid sealed node-frame id');
  return { time, frameId };
}
export async function readPilotShaderClock(page: Page, ownedPorts: ReadonlySet<number>) {
  assertOwnedUrl(page.url(), ownedPorts);
  const moduleUrl = new URL('/three/three.webgpu.js', page.url()).href; assertOwnedUrl(moduleUrl, ownedPorts);
  const client = await page.createCDPSession(), objectGroup = 'kiln-pilot-clock-reader';
  try {
    const prototype = await client.send('Runtime.evaluate', { expression: `import(${JSON.stringify(moduleUrl)}).then(module => module.WebGPURenderer.prototype)`, awaitPromise: true, objectGroup });
    assert(!prototype.exceptionDetails, 'Could not read the sealed WebGPURenderer prototype'); assert(prototype.result.objectId, 'Renderer prototype was not an object');
    const queried = await client.send('Runtime.queryObjects', { prototypeObjectId: prototype.result.objectId, objectGroup });
    assert(queried.objects.objectId, 'Renderer query did not return an object collection');
    const result = await client.send('Runtime.callFunctionOn', {
      objectId: queried.objects.objectId,
      functionDeclaration: `function () {
        const canvas = document.querySelector('#canvas');
        const renderers = this.filter(renderer => renderer.domElement === canvas && canvas && canvas.isConnected);
        if (renderers.length !== 1) throw new Error('Expected exactly one connected sealed renderer; found ' + renderers.length);
        return (${projectShaderClock.toString()})(renderers[0]);
      }`, returnByValue: true,
    });
    assert(!result.exceptionDetails, 'Could not read the sealed shader clock: ' + (result.exceptionDetails?.exception?.description ?? result.exceptionDetails?.text ?? ''));
    return { ...(result.result.value as ReturnType<typeof projectShaderClock>), source: 'three.webgpu.js NodeFrame.update (56464-56476), advanced once per render' };
  } finally {
    try { await client.send('Runtime.releaseObjectGroup', { objectGroup }); } finally { await client.detach(); }
  }
}
