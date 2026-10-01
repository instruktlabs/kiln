import { expect, test } from 'bun:test';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { createHash } from 'node:crypto';
import { renderCaptureGrid } from '../camera-capture';
import { rasterizeCamera, withCameraVisibility } from '../camera';
import { decodePng, encodePng } from '../png';
import { renderSceneToGLB } from '../../render';
import { captureViewsViaPort } from '../port';
import { createGltfIO } from '../../gltf-io';
import type { CaptureConfig } from '../capture';
import { annotateViewCell } from '../annotate';
import { renderGlbViewGrid } from '../index';

function scene() {
  const root = new Group();
  root.name = 'Root';
  const group = new Group();
  group.name = 'Cover';
  root.add(group);
  const body = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  body.name = 'Body';
  root.add(body);
  const cover = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  cover.position.x = 2;
  cover.name = 'Panel';
  group.add(cover);
  return root;
}
const config = (hide: string[], version = 'kiln.capture.v2') =>
  ({ version, size: 128, shots: [{ hide }] }) as CaptureConfig;

test('capture v2 hides exact names/subtrees and restores visibility even after failure', async () => {
  const root = scene();
  const result = await renderCaptureGrid(root, config(['Cover']));
  expect(result.cameraShots[0]!.hide).toEqual(['/Root[0]/Cover[0]']);
  root.getObjectByName('Cover')!.visible = false;
  const expected = rasterizeCamera(root, result.cameraShots[0]!.camera, 128, true, 'neutral');
  root.getObjectByName('Cover')!.visible = true;
  const shot = result.cameraShots[0]!;
  annotateViewCell(expected, 128, {
    name: shot.name,
    dir: shot.camera.position.map((n, i) => n - shot.camera.target[i]!) as [number, number, number],
  });
  expect(decodePng(result.perFramePngs[0]!).rgb).toEqual(expected);
  await expect(
    withCameraVisibility(root, result.cameraShots[0]!, async () => {
      throw new Error('render failed');
    }),
  ).rejects.toThrow('render failed');
  expect(root.getObjectByName('Cover')!.visible).toBe(true);
  expect(root.getObjectByName('Panel')!.visible).toBe(true);
});

test('hide requires v2 and rejects missing or ambiguous names before drawing', async () => {
  const root = scene();
  await expect(renderCaptureGrid(root, config(['Cover'], 'kiln.capture.v1'))).rejects.toThrow(/v2/);
  await expect(renderCaptureGrid(root, config(['Missing']))).rejects.toThrow(/Missing/);
  const second = new Group();
  second.name = 'Cover';
  root.add(second);
  await expect(renderCaptureGrid(root, config(['Cover']))).rejects.toThrow(/ambiguous/);
  expect((await renderCaptureGrid(root, config(['/Root[0]/Cover[0]']))).cameraShots).toHaveLength(
    1,
  );
});

test('v2 GPU derivative carries exactly the visible meshes and echoes hidden paths', async () => {
  const source = await renderSceneToGLB(scene());
  const sent: string[][] = [];
  const result = await captureViewsViaPort(
    async (request) => {
      const doc = await createGltfIO().readBinary(request.glb);
      sent.push(
        doc
          .getRoot()
          .listNodes()
          .filter((n) => n.getMesh())
          .map((n) => n.getName().split(':primitive-')[0]!),
      );
      return {
        ok: true,
        rendererId: 'gpu:test',
        cameras: request.cameras,
        width: request.width,
        height: request.height,
        viewsPng: [encodePng(new Uint8Array(128 * 128 * 3), 128, 128)],
        derivativeFidelity: {
          materialFaithful: true,
          inputGlbSha256: `sha256:${createHash('sha256').update(request.glb).digest('hex')}`,
        },
      };
    },
    source.bytes,
    5000,
    config(['Cover']),
  );
  expect(result.ok).toBe(true);
  expect(sent).toEqual([['Body']]);
});

test('post-loop CPU fallback resolves subject paths and hide from exact GLB bytes', async () => {
  const source = await renderSceneToGLB(scene());
  const result = await renderGlbViewGrid(source.bytes, {
    capture: {
      version: 'kiln.capture.v2',
      size: 128,
      shots: [{ subject: { name: 'Body' }, hide: ['Cover'] }],
    },
  });
  expect(result.cameraShots?.[0]?.subject.name).toBe('Body');
  expect(result.inputGlbSha256).toBe(source.artifactGlbSha256);
});
