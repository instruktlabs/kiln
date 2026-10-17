import { expect, test } from 'bun:test';
import { evaluateEvaluatorRequestV2 } from './handler';
import {
  createEvaluatorRequestV2,
  createEvaluatorPortV2,
  decodeEvaluatorResultV2,
} from './protocol';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { renderGLBViaSubprocess } from './subprocess';

const code = `function build(){
  const root=createRoot('PRIVATE_ROOT');
  const group=new THREE.Group();root.add(group);
  for(let i=0;i<6;i++) createPart('PRIVATE_PART_'+i,new THREE.CylinderGeometry(1,1,2,12,1,true),gameMaterial(0x888888),{parent:group});
  requireSolid(group);return root;
}`;
const request = () => createEvaluatorRequestV2({ requestId: 'solid', code }).json;

test('required-solid failures cross the evaluator with bounded measured facts and child indices', async () => {
  const wire = await evaluateEvaluatorRequestV2(request());
  const result = decodeEvaluatorResultV2(wire, 16 * 1024 * 1024);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected rejection');
  expect(result.error).toMatchObject({
    diagnostic: 'REQUIRE_SOLID',
    solid: {
      total: 6,
      truncated: true,
      meshes: [
        { childPath: [0, 0], closed: false, manifold: true, boundaryEdges: 24 },
        { childPath: [0, 1] },
        { childPath: [0, 2] },
        { childPath: [0, 3] },
      ],
    },
  });
  expect(wire).not.toContain('PRIVATE_');
  const port = createEvaluatorPortV2((json) => evaluateEvaluatorRequestV2(json));
  const render = createKilnProgramToolRegistry({ evaluatorPort: port }).find(
    (tool) => tool.name === 'kiln_render',
  )!;
  const output = (await render.run({ code })) as { ok: boolean; error: string };
  expect(output.ok).toBe(false);
  expect(output.error).toContain('root.children[0].children[0]');
  expect(output.error).toContain('boundaryEdges=24');
  expect(output.error).not.toContain('PRIVATE_');
});

test('solid details reject extra text, malformed locators and unbounded counts', async () => {
  const original = JSON.parse(await evaluateEvaluatorRequestV2(request()));
  type MutableFailure = {
    error: {
      diagnostic: string;
      solid: {
        total: number;
        truncated: boolean;
        meshes: Record<string, unknown>[];
      };
    };
  };
  const changes: ((value: MutableFailure) => void)[] = [
    (value) => {
      value.error.solid.meshes[0]!.message = 'PRIVATE';
    },
    (value) => {
      value.error.solid.meshes[0]!.childPath = ['PRIVATE'];
    },
    (value) => {
      value.error.solid.meshes[0]!.boundaryEdges = -1;
    },
    (value) => {
      value.error.solid.total = 1e100;
    },
    (value) => {
      value.error.solid.meshes.push(value.error.solid.meshes[0]!);
    },
    (value) => {
      value.error.diagnostic = 'TUBE_RADIUS';
    },
    (value) => {
      value.error.solid.truncated = false;
    },
    (value) => {
      value.error.solid.meshes[0]!.childPath = Array(65).fill(0);
    },
    (value) => {
      value.error.solid.meshes[0]!.orientation = { toString: 'outward' };
    },
  ];
  for (const change of changes) {
    const value = structuredClone(original);
    change(value);
    expect(() => decodeEvaluatorResultV2(JSON.stringify(value), 16 * 1024 * 1024)).toThrow();
  }
});

test('a thrown lookalike does not forward solid details or authored text', async () => {
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({
      requestId: 'spoof',
      code: `function build(){throw {diagnostic:'REQUIRE_SOLID',solid:{message:'PRIVATE'},message:'PRIVATE'};}`,
    }).json,
  );
  expect(JSON.parse(wire).error.solid).toBeUndefined();
  expect(wire).not.toContain('PRIVATE');
});

test('the built worker retains required-solid measurements through the subprocess error', async () => {
  try {
    await renderGLBViaSubprocess(code);
    throw new Error('expected required-solid rejection');
  } catch (error) {
    expect(error).toMatchObject({
      diagnostic: 'REQUIRE_SOLID',
      solid: { total: 6, truncated: true },
    });
    expect(String(error)).toContain('root.children[0].children[0]');
    expect(String(error)).not.toContain('PRIVATE_');
  }
});
