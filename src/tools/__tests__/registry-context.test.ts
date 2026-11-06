import { describe, expect, test } from 'bun:test';

import { createAssetRequirementsV1 } from '../../contracts/requirements';
import { createAssetRequirementsStore } from '../../requirements-store';
import type { AssetRequirementsQaReportV2 } from '../../qa/requirements-report';
import {
  createKilnRenderViewsDef,
  createKilnScreenshotAnimationDef,
  createKilnProgramToolRegistry,
  createKilnViewInteriorDef,
} from '../registry';

const SIDEWAYS_FALSE_PROP_CODE = `
const meta = { name: 'sideways', category: 'prop' };
function build() {
  const root = createRoot('Root');
  const frame = createVehicleFrame('VehicleFrame', {
    axles: [
      { id: 'front', position: [0.3, 0.35, 0] },
      { id: 'rear', position: [-0.3, 0.35, 0] },
    ],
    parent: root,
  });
  createPart('Body', boxGeo(1, 0.7, 4), gameMaterial('#aa3333'), {
    parent: frame.root,
    position: [0, 0.5, 0],
  });
  const rubber = gameMaterial('#111111', { roughness: 0.95 });
  const metal = gameMaterial('#888888', { metalness: 0.8 });
  const geometries = createWheelGeometrySet(0.35, 0.18);
  for (const [index, x] of [['front', 0.3], ['rear', -0.3]]) {
    for (const [side, z] of [['left', -1.6], ['right', 1.6]]) {
      createWheelAssembly(index + side, { tire: rubber, rim: metal }, {
        radius: 0.35, width: 0.18, side, index,
        position: [x, 0.35, z], steering: index === 'front', geometries, parent: frame.root,
      });
    }
  }
  return root;
}
`;

const FALSE_PROP_BUDGET_CODE = `
const meta = { name: 'budget', category: 'prop' };
function build() {
  const root = createRoot('Root');
  for (let i = 0; i < 30; i++) {
    createPart('Part_' + i, sphereGeo(1, 32, 24), gameMaterial('#777777'), { parent: root });
  }
  return root;
}
`;

const find = (registry: ReturnType<typeof createKilnProgramToolRegistry>, name: string) => {
  const def = registry.find((candidate) => candidate.name === name);
  if (!def) throw new Error(`Missing tool ${name}`);
  return def;
};

const warningStrings = (output: unknown): string[] =>
  ((output as { warnings?: string[] }).warnings ?? []).map(String);

function binding(label: string, mobility = false) {
  return createAssetRequirementsStore().host.bind(
    { taskId: 'context', lineageId: label },
    createAssetRequirementsV1({
      labels: [label],
      requirements: mobility
        ? {
            mobility: {
              state: 'requested',
              value: { wheelCount: 4, axleCount: 2, supportPolicy: 'grounded' },
            },
          }
        : {},
    }),
    { actor: 'owner', reason: 'Requested fixture', source: 'brief' },
  );
}
const orientation = (output: unknown) => {
  const result = output as { qaReport: AssetRequirementsQaReportV2 };
  return result.qaReport.dimensions.requirementReadiness.findings.find(
    (f) => f.code === 'VEH_ORIENTATION_SIDEWAYS',
  );
};

describe('trusted neutral tool context', () => {
  test('a dense asset draws no triangle budget warning regardless of descriptive labels', async () => {
    for (const requirements of [binding('vehicle'), binding('prop'), undefined]) {
      const def = find(createKilnProgramToolRegistry({ requirements }), 'kiln_validate');
      const warnings = warningStrings(await def.run({ code: FALSE_PROP_BUDGET_CODE }));
      expect(warnings.some((warning) => warning.includes('TRI_BUDGET'))).toBe(false);
      expect(warnings.some((warning) => /triangle/i.test(warning))).toBe(false);
    }
  });

  test('shared source render paths use host mobility requirements despite false source labels', async () => {
    const registry = createKilnProgramToolRegistry({
      requirements: binding('mobility', true),
    });
    for (const name of ['kiln_render']) {
      const output = await find(registry, name).run({
        code: SIDEWAYS_FALSE_PROP_CODE,
      });
      expect(orientation(output)).toMatchObject({
        disposition: 'observe',
        measurement: { name: 'boundsSpanZToSpanX' },
      });
    }
  });

  test('render, animation and interior definitions retain the same requested measurement evidence', async () => {
    const context = { requirements: binding('mobility', true) };
    const outputs = await Promise.all([
      createKilnRenderViewsDef(context).run({ code: SIDEWAYS_FALSE_PROP_CODE }),
      createKilnScreenshotAnimationDef(context).run({
        code: SIDEWAYS_FALSE_PROP_CODE,
        clip: 'missing',
      }),
      createKilnViewInteriorDef(context).run({
        code: SIDEWAYS_FALSE_PROP_CODE,
      }),
    ]);
    for (const output of outputs)
      expect(orientation(output)).toMatchObject({ disposition: 'observe' });
  }, 60_000); // Evaluator worker runs: 1.5 s in CI, past its old budget at load 20+ on 5 November 2026.

  test('unbound source registry remains neutral regardless of source metadata', async () => {
    const output = await find(createKilnProgramToolRegistry(), 'kiln_render').run({
      code: SIDEWAYS_FALSE_PROP_CODE.replace("category: 'prop'", "category: 'vehicle'"),
    });
    expect(orientation(output)).toBeUndefined();
  });
});
