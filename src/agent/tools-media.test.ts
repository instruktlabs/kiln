/**
 * Strands tool skin: kiln_render returns [ImageBlock, JsonBlock] so the
 * model literally sees the rendered views; plain tools keep their JSON output.
 */
import { describe, expect, test } from 'bun:test';
import { ImageBlock, JsonBlock } from '@strands-agents/sdk';

import { makeKilnNativeTools } from './tools';
import { MemoryProgramStore } from '../program-store';
import { createGenerationCallBudget } from './call-budget';

const BOX_CODE = `
const meta = { name: 'test-box', category: 'prop' };
function build() {
  const root = createRoot('Root');
  createPart('Mesh_Box', boxGeo(1, 1, 1), gameMaterial('#ff0000'), { parent: root, position: [0, 0.5, 0] });
  return root;
}
`;

function findTool(tools: ReturnType<typeof makeKilnNativeTools>, name: string) {
  const t = tools.find((x) => x.name === name) as
    | { invoke(input: unknown): Promise<unknown> }
    | undefined;
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe('makeKilnNativeTools media handling', () => {
  test('numeric inspection uses the shared controls without invoking the image observer', async () => {
    let calls = 0;
    const tools = makeKilnNativeTools(
      {},
      {
        renderObservationPort: async () => {
          calls++;
          return {};
        },
        captureLimits: { maxTotalPixels: 1 },
      },
    );
    const out = (await findTool(tools, 'kiln_inspect').invoke({
      code: BOX_CODE,
      image: false,
      measure: {
        from: { subject: { name: 'Mesh_Mesh_Box' } },
        to: { subject: { name: 'Mesh_Mesh_Box' }, point: [0, 1, 0] },
      },
    })) as { ok: boolean; error?: string; measurement: { distance: number }; pngBase64?: string };
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(out.measurement.distance).toBe(1);
    expect(out.pngBase64).toBeUndefined();
    expect(calls).toBe(0);
  });
  test('forwards the global budget so the observer port can debit actual dispatches', async () => {
    const budget = createGenerationCallBudget(1);
    expect(budget.tryConsume('author')).toBe(true);
    let observerCalls = 0;
    const tools = makeKilnNativeTools(
      {},
      {
        generationCallBudget: budget,
        renderObservationPort: async (input) => {
          observerCalls++;
          expect(input.generationCallBudget).toBe(budget);
          return { verdict: 'ready' };
        },
      },
    );

    const result = await findTool(tools, 'kiln_render').invoke({ code: BOX_CODE });
    expect(observerCalls).toBe(1);
    expect(JSON.stringify(result)).toContain('ready');
    expect(budget.receipt()).toMatchObject({ consumed: 1, denied: 0 });
  });

  test('exposes shared source tools and a native terminal action', () => {
    expect(makeKilnNativeTools({}, {}).map((t) => t.name)).toEqual([
      'kiln_discover',
      'kiln_renderer_status',
      'kiln_renderer',
      'kiln_validate',
      'kiln_render',
      'kiln_screenshot_animation',
      'kiln_view_interior',
      'kiln_inspect',
      'kiln_edit',
      'kiln_source',
      'kiln_finish',
    ]);
  });

  test('kiln_render returns [ImageBlock, JsonBlock] with the base64 stripped', async () => {
    const tools = makeKilnNativeTools({}, {});
    const out = (await findTool(tools, 'kiln_render').invoke({ code: BOX_CODE })) as unknown[];
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeInstanceOf(ImageBlock);
    expect((out[0] as ImageBlock).format).toBe('png');
    expect(out[1]).toBeInstanceOf(JsonBlock);
    const json = (out[1] as JsonBlock).json as Record<string, unknown>;
    expect(json['ok']).toBe(true);
    expect('pngBase64' in json).toBe(false);
  });

  test('a host observer replaces screenshot pixels with a structured visual observation', async () => {
    const calls: Array<{ toolName: string; pngs: readonly Uint8Array[] }> = [];
    const tools = makeKilnNativeTools(
      {},
      {
        renderObservationPort: async (input) => {
          calls.push({ toolName: input.toolName, pngs: input.pngs });
          return {
            schemaVersion: 1,
            verdict: 'continue',
            findings: [{ criterionId: 'silhouette', summary: 'The box is visible.' }],
          };
        },
      },
    );
    const out = (await findTool(tools, 'kiln_render').invoke({ code: BOX_CODE })) as unknown[];

    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(JsonBlock);
    const json = (out[0] as JsonBlock).json as Record<string, unknown>;
    expect(json['ok']).toBe(true);
    expect(json['visualObservation']).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        verdict: 'continue',
        findings: [{ criterionId: 'silhouette', summary: 'The box is visible.' }],
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.toolName).toBe('kiln_render');
    expect(calls[0]?.pngs).toHaveLength(1);
  });

  test('an observer failure degrades to explicit unavailable JSON and never leaks pixels', async () => {
    const tools = makeKilnNativeTools(
      {},
      {
        renderObservationPort: async () => {
          throw new Error('provider detail must stay host-only');
        },
      },
    );
    const out = (await findTool(tools, 'kiln_render').invoke({ code: BOX_CODE })) as unknown[];

    expect(out).toHaveLength(1);
    expect(out[0]).toBeInstanceOf(JsonBlock);
    const json = (out[0] as JsonBlock).json as Record<string, unknown>;
    expect(json['visualObservation']).toEqual({ ok: false, reason: 'observer-unavailable' });
    expect(JSON.stringify(json)).not.toContain('provider detail');
  });

  test('kiln_render on broken code falls back to the plain JSON error output', async () => {
    const tools = makeKilnNativeTools({}, {});
    const out = (await findTool(tools, 'kiln_render').invoke({ code: 'nope(' })) as {
      ok: boolean;
      error?: string;
    };
    expect(Array.isArray(out)).toBe(false);
    expect(out.ok).toBe(false);
    expect(out.error).toBeDefined();
  });

  test('kiln_validate keeps its plain JSON output (no media wrapping)', async () => {
    const tools = makeKilnNativeTools({}, {});
    const out = (await findTool(tools, 'kiln_validate').invoke({ code: BOX_CODE })) as {
      valid: boolean;
    };
    expect(Array.isArray(out)).toBe(false);
    expect(out.valid).toBe(true);
  });
});

test('native render reads the explicit retained reference and returns image blocks', async () => {
  const programStore = new MemoryProgramStore();
  const programRef = await programStore.put(BOX_CODE);
  const tools = makeKilnNativeTools({}, { programStore });
  const out = (await findTool(tools, 'kiln_render').invoke({ programRef })) as unknown[];
  expect(out[0]).toBeInstanceOf(ImageBlock);
  expect(out[1]).toBeInstanceOf(JsonBlock);
});
