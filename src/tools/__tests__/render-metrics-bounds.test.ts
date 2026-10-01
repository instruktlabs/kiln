import { describe, expect, test } from 'bun:test';
import { kilnRenderViewsDef, type KilnRenderViewsResult } from '../registry';

describe('render metrics from exported vertices', () => {
  for (const capture of [undefined, { version: 'kiln.capture.v2', shots: [{}], size: 128 }]) {
    test(`render exposes the index buffer receipt (${capture ? 'versioned' : 'default'} capture)`, async () => {
      const result = (await kilnRenderViewsDef.run({
        code: `function build() {
        return createPart('Panel', planeGeo(2, 2).toNonIndexed(), gameMaterial('#888888'));
      }`,
        ...(capture ? { capture } : {}),
      })) as KilnRenderViewsResult;
      expect(result.ok).toBe(true);
      expect((result as unknown as { indexBuffers?: unknown }).indexBuffers).toMatchObject({
        version: 'kiln.index-buffers.v1',
        policy: 'indexed',
        primitivesConverted: 1,
      });
    });
  }
  for (const indexed of [false, true]) {
    test(`rotated triangle excludes empty box corners (${indexed ? 'indexed' : 'unindexed'})`, async () => {
      const code = `
function build() {
  const root = createRoot('Root');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(
    [-1, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  ${indexed ? 'g.setIndex([0, 1, 2]);' : ''}
  g.computeVertexNormals();
  createPart('Leaf', g, gameMaterial('#335522'), { rotation: [0, 0, 45], parent: root });
  return root;
}`;
      const result = (await kilnRenderViewsDef.run({ code })) as KilnRenderViewsResult;
      expect(result.ok).toBe(true);
      const half = Math.SQRT1_2;
      expect(result.bbox).toBeDefined();
      for (const axis of [0, 1]) {
        expect(result.bbox!.min[axis]).toBeCloseTo(-half, 6);
        expect(result.bbox!.max[axis]).toBeCloseTo(half, 6);
        expect(result.bbox!.size[axis]).toBeCloseTo(2 * half, 6);
      }
      expect(result.bbox!.min[2]).toBe(0);
      expect(result.bbox!.max[2]).toBe(0);
      expect(result.lowestPart?.y).toBeCloseTo(-half, 6);
    });
  }

  test('lowest-part attribution uses vertices rather than empty box corners', async () => {
    const result = (await kilnRenderViewsDef.run({
      code: `function build() {
        const root = createRoot('Root');
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(
          [-1, 0, 0, 1, 0, 0, 0, -1, 0], 3));
        g.computeVertexNormals();
        createPart('Leaf', g, gameMaterial('#335522'),
          { rotation: [0, 0, 45], parent: root });
        createPart('Support', boxGeo(.2, .2, .2), gameMaterial('#777777'),
          { position: [0, -.9, 0], parent: root });
        return root;
      }`,
    })) as KilnRenderViewsResult;
    expect(result.ok).toBe(true);
    expect(result.lowestPart?.name).toStartWith('Mesh_Support');
    expect(result.lowestPart?.y).toBeCloseTo(-1, 6);
    expect(result.bbox!.max[1]).toBeCloseTo(Math.SQRT1_2, 6);
  });
});
