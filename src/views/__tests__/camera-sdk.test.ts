import { test, expect } from 'bun:test';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { renderSceneToGLB } from '../../render';
import { captureViewsViaPort } from '../port';
import { encodePng } from '../png';
import { createHash } from 'node:crypto';
test('SDK advanced capture sends isolated derivative with explicit cameras and returns receipts', async () => {
  const root = new Group();
  root.name = 'Root';
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.name = 'Body';
  root.add(mesh);
  const rendered = await renderSceneToGLB(root, { derivative: true });
  let calls = 0;
  const out = await captureViewsViaPort(
    async (req) => {
      calls++;
      return {
        ok: true,
        rendererId: 'gpu:test',
        cameras: req.cameras,
        width: req.width,
        height: req.height,
        viewsPng: [encodePng(new Uint8Array(128 * 128 * 3), 128, 128)],
        derivativeFidelity: {
          materialFaithful: true,
          inputGlbSha256: `sha256:${createHash('sha256').update(req.glb).digest('hex')}`,
        },
      };
    },
    rendered.bytes,
    5000,
    { version: 'kiln.capture.v1', shots: [{}], size: 128 },
  );
  expect(out.ok).toBe(true);
  expect(calls).toBe(1);
  if (out.ok) expect(out.derivativeReceipts?.[0]?.cameraFidelity).toBe('echo-validated');
});

test('an isolated shot sends the GPU only the subject geometry', async () => {
  const root = new Group();
  root.name = 'Car';
  const lod = new Group();
  lod.name = 'LOD1';
  const body = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  body.name = 'Body';
  lod.add(body);
  root.add(lod);
  const wheel = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial());
  wheel.name = 'Wheel_FL';
  wheel.position.set(1, 0, 0);
  root.add(wheel);
  const rendered = await renderSceneToGLB(root, { derivative: true });
  const meshNodes = (glb: Uint8Array) => {
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const json = JSON.parse(
      new TextDecoder().decode(glb.subarray(20, 20 + view.getUint32(12, true))),
    ) as { nodes?: { name?: string; mesh?: number }[] };
    return (json.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
  };
  const sent: string[][] = [];
  for (const visibility of ['isolate', 'context'] as const) {
    const out = await captureViewsViaPort(
      async (req) => {
        sent.push(meshNodes(req.glb));
        return {
          ok: true,
          rendererId: 'gpu:test',
          cameras: req.cameras,
          width: req.width,
          height: req.height,
          viewsPng: [encodePng(new Uint8Array(128 * 128 * 3), 128, 128)],
          derivativeFidelity: {
            materialFaithful: true,
            inputGlbSha256: `sha256:${createHash('sha256').update(req.glb).digest('hex')}`,
          },
        };
      },
      rendered.bytes,
      5000,
      { version: 'kiln.capture.v1', shots: [{ subject: { name: 'LOD1' }, visibility }], size: 128 },
    );
    expect(out.ok).toBe(true);
  }
  expect(sent[0]!.some((name) => name.startsWith('Body'))).toBe(true);
  expect(sent[0]!.some((name) => name.startsWith('Wheel_FL'))).toBe(false);
  expect(sent[1]!.some((name) => name.startsWith('Wheel_FL'))).toBe(true);
});
