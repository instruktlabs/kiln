import { expect, test } from 'bun:test';
import { evaluateEvaluatorRequestV2 } from './handler';
import { createEvaluatorRequestV2, createEvaluatorPortV2 } from './protocol';

const cases = [
  {
    diagnostic: 'BONE_CHAIN_ARGUMENT',
    code: `function build(){return createBoneChain('PRIVATE_CHAIN',[{role:'PRIVATE_ROLE',offset:[0,0,0]}]).root;}`,
    advice: /createBoneChain.*unique.*rest/,
  },
  {
    diagnostic: 'SKIN_BINDING_ARGUMENT',
    code: `function build(){const root=createRoot('PRIVATE_ROOT');const b=createBoneChain('B',[{role:'base',offset:[0,0,0]}],{parent:root});createSkinnedPart('PRIVATE_SKIN',boxGeo(1,1,1),gameMaterial(0x888888),{parent:root,bones:b.nodes,indices:[],weights:[]});return root;}`,
    advice: /createSkinnedPart.*four.*weights.*rest/,
  },
];
for (const entry of cases) {
  test(`${entry.diagnostic} handler and decoder retain repair advice without authored identifiers`, async () => {
    const wire = await evaluateEvaluatorRequestV2(
      createEvaluatorRequestV2({ requestId: 'skin', code: entry.code }).json,
    );
    expect(JSON.parse(wire).error.diagnostic).toBe(entry.diagnostic);
    expect(wire).not.toContain('PRIVATE_');
    const port = createEvaluatorPortV2((request) => evaluateEvaluatorRequestV2(request));
    await expect(port.render(entry.code)).rejects.toThrow(entry.advice);
  });
}
