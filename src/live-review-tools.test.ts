import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLiveReview } from './live-review-node';
import { createKilnProgramToolRegistry } from './tools/registry';
import { renderGLBInProcess } from './render';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

test('separate capture frames and image-free inspection retain their exact evaluated artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-live-frames-'));
  roots.push(root);
  const liveReview = new FileLiveReview(root);
  const registry = createKilnProgramToolRegistry({ liveReview });
  const rendered = (await registry
    .find((def) => def.name === 'kiln_render')!
    .run({
      code: source,
      capture: {
        version: 'kiln.capture.v1',
        shots: [{ name: 'First' }, { name: 'Second' }],
        size: 128,
        output: 'separate',
      },
    })) as { ok: boolean };
  expect(rendered.ok).toBe(true);
  const inspected = (await registry
    .find((def) => def.name === 'kiln_inspect')!
    .run({ code: source, image: false, listParts: { limit: 10 } })) as { ok: boolean };
  expect(inspected.ok).toBe(true);
  await liveReview.flush();
  const operations = (await liveReview.snapshot()).operations;
  expect(operations.find((op) => op.tool === 'kiln_render')?.captures).toHaveLength(2);
  expect(operations.find((op) => op.tool === 'kiln_inspect')?.artifact).toBeDefined();
});
const source =
  "const meta={name:'Fixture'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#778899'),{parent:r});return r;}";
test('shared render and edit tools publish exact builds and capture evidence without extra evaluation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-live-tools-'));
  roots.push(root);
  const liveReview = new FileLiveReview(root);
  let evaluations = 0;
  const registry = createKilnProgramToolRegistry({
    liveReview,
    evaluatorPort: {
      render: async (code, options) => {
        evaluations++;
        return renderGLBInProcess(code, options);
      },
    },
  });
  const render = registry.find((def) => def.name === 'kiln_render')!;
  const result = (await render.run({ code: source })) as { ok: boolean; programRef: string };
  expect(result.ok).toBe(true);
  await liveReview.flush();
  let operations = (await liveReview.snapshot()).operations;
  expect(operations).toHaveLength(1);
  expect(operations[0]?.artifact).toBeDefined();
  expect(operations[0]?.captures).toHaveLength(1);
  expect(operations[0]?.programRef).toBe(result.programRef);
  expect(evaluations).toBe(1);
  await registry
    .find((def) => def.name === 'kiln_edit')!
    .run({
      programRef: result.programRef,
      edits: [{ oldString: '#778899', newString: '#225577' }],
    });
  await liveReview.flush();
  operations = (await liveReview.snapshot()).operations;
  expect(operations).toHaveLength(2);
  const edited = operations.find((operation) => operation.tool === 'kiln_edit')!;
  expect(edited.status).toBe('complete');
  expect(
    new TextDecoder().decode(await liveReview.readFile(edited.operationId, 'source.kiln.js')),
  ).toContain('#225577');
  expect(edited.artifact?.sha256).not.toBe(
    operations.find((op) => op.tool === 'kiln_render')?.artifact?.sha256,
  );
});
