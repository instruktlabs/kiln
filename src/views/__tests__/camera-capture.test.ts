import { test, expect } from 'bun:test';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { renderCaptureGrid, validateAdvancedCapture } from '../camera-capture';
import { createKilnRenderViewsDef } from '../../tools/registry';
test('mixed part sheet resolves exact identities and restores visibility', async () => {
  const root = new Group();
  root.name = 'Root';
  for (let i = 0; i < 2; i++) {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.name = `Part${i}`;
    mesh.position.x = i * 4;
    root.add(mesh);
  }
  const out = await renderCaptureGrid(root, {
    version: 'kiln.capture.v1',
    shots: [{}, { subject: { name: 'Part1' }, visibility: 'isolate' }],
    cols: 2,
    size: 128,
    output: 'separate',
  });
  expect(out.cameraShots).toHaveLength(2);
  expect(out.perFramePngs).toHaveLength(2);
  expect(out.cameraShots[1]?.subject.path).toBe('/Root[0]/Part1[0]');
  expect(root.children.every((n) => n.visible)).toBe(true);
  await expect(
    renderCaptureGrid(root, { version: 'kiln.capture.v1', shots: [], size: 128 }),
  ).rejects.toThrow(/1..9/);
});

test('per-shot size reaches 2048 px and the pixel budget still bounds the sheet', async () => {
  const shot = { version: 'kiln.capture.v1' as const, shots: [{}] };
  expect(() => validateAdvancedCapture({ ...shot, size: 2048 })).not.toThrow();
  expect(() => validateAdvancedCapture({ ...shot, size: 2049 })).toThrow(
    'capture.size must be 128..2048',
  );
  const schema = createKilnRenderViewsDef().inputSchema;
  expect(schema.safeParse({ code: 'x', capture: { ...shot, size: 2048 } }).success).toBe(true);
  expect(schema.safeParse({ code: 'x', capture: { ...shot, size: 2049 } }).success).toBe(false);
  // Nine 2048 px shots exceed the default 24M-pixel budget before anything renders.
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  await expect(
    renderCaptureGrid(root, { version: 'kiln.capture.v1', shots: Array(9).fill({}), size: 2048 }),
  ).rejects.toThrow(/pixel/i);
});

test('the capture receipt echoes the delivered output mode', async () => {
  const root = new Group();
  root.name = 'Root';
  const part = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  part.name = 'Part1';
  root.add(part);
  for (const output of ['separate', 'grid'] as const) {
    const out = await renderCaptureGrid(root, {
      version: 'kiln.capture.v1',
      shots: [{}, {}],
      size: 128,
      output,
    });
    expect(out.capture?.output).toBe(output);
  }
  const unspecified = await renderCaptureGrid(root, {
    version: 'kiln.capture.v1',
    shots: [{}],
    size: 128,
  });
  expect(unspecified.capture?.output).toBe('grid');
});
