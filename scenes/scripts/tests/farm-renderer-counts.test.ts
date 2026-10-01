import { expect, test } from 'bun:test';
import { projectRendererCounts, projectShaderClock } from '../farm-renderer-counts';

function renderer() {
  return { backend: { isWebGPUBackend: true }, domElement: { width: 1280, height: 720 }, info: { autoReset: false, frame: 17,
    render: { drawCalls: 123, triangles: 456789, points: 0, lines: 0, frameCalls: 2, get timestamp(): never { throw new Error('Timing must never be accessed'); } },
    memory: { geometries: 42, textures: 24, programs: 70, attributes: 128, attributesSize: 2048, indexAttributes: 32, indexAttributesSize: 64,
      indirectStorageAttributes: 0, indirectStorageAttributesSize: 0, programsSize: 4096, readbackBuffers: 0, readbackBuffersSize: 0,
      renderTargets: 2, storageAttributes: 0, storageAttributesSize: 0, texturesSize: 8192, uniformBuffers: 35, uniformBuffersSize: 1024, total: 15424 } },
    _pipelines: { caches: new Map(Array.from({ length: 31 }, (_, n) => [n, {}])), programs: { vertex: new Map(Array.from({ length: 35 }, (_, n) => [n, {}])), fragment: new Map(Array.from({ length: 35 }, (_, n) => [n, {}])), compute: new Map() } } };
}
test('count projection reports total submitted geometry and actual pipelines without reading timestamps', () => {
  const source = renderer(), result = projectRendererCounts(source);
  expect(result.render).toEqual({ drawCalls: 123, triangles: 456789, points: 0, lines: 0, frameCalls: 2 });
  expect(result.pipelines).toBe(31); expect(result.memory.programs).toBe(70);
  expect(result.shaderStages).toEqual({ vertex: 35, fragment: 35, compute: 0 });
  expect(result.backend).toBe('webgpu'); expect(result.drawingBuffer).toEqual({ width: 1280, height: 720 });
  expect(JSON.stringify(result)).not.toContain('timestamp');
});
test('CDP-serialized projection is self-contained and malformed counts cannot silently pass', () => {
  const remote = new Function('renderer', `return (${projectRendererCounts.toString()})(renderer);`);
  expect(remote(renderer())).toEqual(projectRendererCounts(renderer()));
  const source = renderer(); source.info.render.drawCalls = NaN;
  expect(() => projectRendererCounts(source)).toThrow(/drawCalls/);
  const unknown = renderer(); unknown.backend.isWebGPUBackend = false;
  expect(() => projectRendererCounts(unknown)).toThrow(/backend/);
});

test('the sealed shader clock projection reads only the node-frame time and id, validated', () => {
  expect(projectShaderClock({ _nodes: { nodeFrame: { time: 12.5, frameId: 700, deltaTime: .016 } } })).toEqual({ time: 12.5, frameId: 700 });
  const remote = new Function('renderer', `return (${projectShaderClock.toString()})(renderer);`);
  expect(remote({ _nodes: { nodeFrame: { time: 3, frameId: 4 } } })).toEqual({ time: 3, frameId: 4 });
  for (const frame of [undefined, { time: -1, frameId: 1 }, { time: NaN, frameId: 1 }, { time: 1, frameId: 1.5 }, { time: '1', frameId: 1 }])
    expect(() => projectShaderClock({ _nodes: { nodeFrame: frame } })).toThrow(/node-frame/);
});
