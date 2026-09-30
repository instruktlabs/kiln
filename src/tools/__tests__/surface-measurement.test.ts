import { expect, test } from 'bun:test';
import { createKilnProgramToolRegistry, type KilnInspectResult } from '../registry';

const code = `const meta={name:'Surface gap'};function build(){const root=createRoot('Root');
createPart('A',boxGeo(1,1,1),gameMaterial('#888888'),{parent:root});
createPart('B',boxGeo(1,1,1),gameMaterial('#888888'),{parent:root,position:[1.001,0,0]});return root;}`;

test('inspection measures exported surfaces and retains anchor semantics without changing QA acceptance', async () => {
  const inspect = createKilnProgramToolRegistry().find((t) => t.name === 'kiln_inspect')!;
  const endpoints = { from: { subject: { name: 'Mesh_A' } }, to: { subject: { name: 'Mesh_B' } } };
  const result = (await inspect.run({
    code,
    part: 'A',
    measure: { mode: 'surface', ...endpoints },
  })) as KilnInspectResult & { programRef: string };
  expect(result.ok).toBe(true);
  expect(result.measurement?.method).toBe('triangle-surface distance');
  if (result.measurement?.method !== 'triangle-surface distance')
    throw new Error('Missing surface result');
  expect(result.measurement.status).toBe('complete');
  expect(result.measurement.distance).toBeCloseTo(0.001, 7);
  expect(result.measurement.closest?.from.path).toContain('Mesh_A');
  expect(result.qaReport).toMatchObject({ acceptance: 'accepted' });
  const anchors = (await inspect.run({
    programRef: result.programRef,
    measure: endpoints,
  })) as KilnInspectResult;
  expect(anchors.measurement?.distance).toBeCloseTo(1.001, 7);
  expect(anchors.measurement?.method).toBe('straight-line anchor distance');
  const invalid = (await inspect.run({
    programRef: result.programRef,
    measure: { mode: 'surface', ...endpoints, from: { ...endpoints.from, point: [0, 0, 0] } },
  })) as KilnInspectResult;
  expect(invalid.ok).toBe(false);
  expect(invalid.error).toMatch(/point/);
});

test('numeric batch inspection retains every requested pair and spends no image budget', async () => {
  let renders = 0;
  const inspect = createKilnProgramToolRegistry({
    captureLimits: { maxTotalPixels: 1, maxOutputBytes: 1 },
    viewRenderPort: async () => {
      renders++;
      throw new Error('unexpected render');
    },
  }).find((t) => t.name === 'kiln_inspect')!;
  const a = '/Surface%20gap[0]/Root[0]/Mesh_A[0]',
    b = '/Surface%20gap[0]/Root[0]/Mesh_B[0]';
  const output = (await inspect.run({
    code,
    image: false,
    surfacePairs: [
      [a, b],
      [a, a],
      [a, '/Missing[0]'],
      [b, a],
    ],
  })) as KilnInspectResult;
  expect(output.ok).toBe(true);
  expect(output.surfaceMeasurements!.status).toBe('partial');
  expect(output.surfaceMeasurements!.results).toHaveLength(4);
  const results = output.surfaceMeasurements!.results;
  expect(results[0]!.error).toBeUndefined();
  expect(results[0]!.measurement?.distance).toBeCloseTo(0.001, 7);
  expect(results[1]!.error).toContain('shared nodes');
  expect(results[2]!.error).toBeString();
  expect(results[3]!.measurement?.distance).toBeCloseTo(0.001, 7);
  expect(output.pngBase64).toBeUndefined();
  expect(output.viewFidelity).toBeUndefined();
  expect(inspect.media!(output)).toBeUndefined();
  expect(renders).toBe(0);
  for (const controls of [
    {},
    { part: 'A' },
    { surfacePairs: [[a, b]], shot: { subject: { path: a }, camera: { type: 'orbit' } } },
  ]) {
    const invalid = (await inspect.run({ code, image: false, ...controls })) as KilnInspectResult;
    expect(invalid.ok).toBe(false);
  }
  for (const surfacePairs of [[], [[a]], [[a, b, a]], Array.from({ length: 13 }, () => [a, b])])
    await expect(inspect.run({ code, image: false, surfacePairs })).rejects.toThrow();
  const normal = (await inspect.run({ code, surfacePairs: [[a, b]] })) as KilnInspectResult;
  expect(normal.error).toContain('pixel budget');
});

test('surface pairs take exact paths or unambiguous names, as measure subjects do', async () => {
  const inspect = createKilnProgramToolRegistry().find((t) => t.name === 'kiln_inspect')!;
  const a = '/Surface%20gap[0]/Root[0]/Mesh_A[0]',
    b = '/Surface%20gap[0]/Root[0]/Mesh_B[0]';
  const output = (await inspect.run({
    code,
    image: false,
    surfacePairs: [
      ['Mesh_A', 'Mesh_B'],
      ['Mesh_A', b],
      ['Mesh', b],
      ['/Wrong[0]/Root[0]/Mesh_A[0]', b],
      [a, b],
    ],
  })) as KilnInspectResult;
  expect(output.ok).toBe(true);
  const [named, mixed, missing, misrooted, good] = output.surfaceMeasurements!.results;
  for (const measured of [named, mixed, good]) {
    expect(measured!.error).toBeUndefined();
    expect(measured!.measurement?.distance).toBeCloseTo(0.001, 7);
  }
  expect(missing!.error).toContain('No node is named "Mesh"');
  expect(missing!.error).toContain(a);
  expect(misrooted!.error).toContain('No node has path "/Wrong[0]/Root[0]/Mesh_A[0]"');
  expect(misrooted!.error).toContain('Paths start with /Surface%20gap[0]');
  expect(misrooted!.error).toContain(a);
  const twins = (await inspect.run({
    code: code.replace("'B',", "'A',"),
    image: false,
    surfacePairs: [['Mesh_A', '/Surface%20gap[0]/Root[0]/Mesh_A[1]']],
  })) as KilnInspectResult;
  const [ambiguous] = twins.surfaceMeasurements!.results;
  expect(ambiguous!.error).toContain('2 nodes are named "Mesh_A"');
  expect(ambiguous!.error).toContain('/Surface%20gap[0]/Root[0]/Mesh_A[1]');
  for (const failed of [missing, misrooted, ambiguous])
    expect(failed!.error!.length).toBeLessThan(400);
});
