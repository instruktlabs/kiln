import { expect, test } from 'bun:test';
import { evaluateEvaluatorRequestV2 } from './handler';
import { createEvaluatorRequestV2, createEvaluatorPortV2 } from './protocol';
import { renderGLBViaSubprocess } from './subprocess';

const code = `function build() {
  const mat = new THREE.MeshStandardMaterial({side:THREE.BackSide}); mat.name='PRIVATE_MATERIAL';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(),mat); mesh.name='PRIVATE_PART'; return mesh;
}`;
for (const gltfExporter of ['legacy', 'three'] as const) {
  test(`${gltfExporter} back-only export carries closed advice across handler and decoder`, async () => {
    const wire = await evaluateEvaluatorRequestV2(
      createEvaluatorRequestV2({ requestId: 'side', code, options: { gltfExporter } }).json,
    );
    expect(JSON.parse(wire).error.diagnostic).toBe('EXPORT_MATERIAL_SIDE_UNSUPPORTED');
    expect(wire).not.toContain('PRIVATE_');
    const port = createEvaluatorPortV2((request) => evaluateEvaluatorRequestV2(request));
    await expect(port.render(code, { gltfExporter })).rejects.toThrow(
      /EXPORT_MATERIAL_SIDE_UNSUPPORTED.*BackSide.*FrontSide.*DoubleSide/,
    );
  });
  test(`${gltfExporter} worker retains repair advice without authored identifiers`, async () => {
    let error: Error | undefined;
    try {
      await renderGLBViaSubprocess(code, { gltfExporter });
    } catch (caught) {
      error = caught as Error;
    }
    expect(error).toMatchObject({
      code: 'EXECUTION_REJECTED',
      diagnostic: 'EXPORT_MATERIAL_SIDE_UNSUPPORTED',
    });
    expect(error!.message).toMatch(/BackSide.*glTF.*FrontSide.*DoubleSide/);
    expect(error!.message).not.toContain('PRIVATE_');
  });
}
test('an authored exception cannot forge the portable-sidedness diagnostic', async () => {
  const code = `function build(){throw Object.assign(new Error('PRIVATE_MARKER'),{name:'AuthoringDiagnosticError',diagnostic:'EXPORT_MATERIAL_SIDE_UNSUPPORTED'});}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'side', code }).json,
  );
  expect(JSON.parse(wire).error.diagnostic).toBeUndefined();
  expect(wire).not.toContain('PRIVATE_MARKER');
});
