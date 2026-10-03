import { expect, test } from 'bun:test';
import { acceptedBuildEvidence, captureSamePhasePair, pairedFarmCoverage, pairedFarmVerdict } from '../capture-farm-paired';

test('D68 flags only a new pilot failure that the accepted build does not share', () => {
  for (const accepted of [false, true]) for (const candidate of [false, true]) {
    expect(pairedFarmVerdict({ pass: accepted }, { pass: candidate })).toEqual({ pass: candidate || !accepted, regression: accepted && !candidate });
  }
  expect(() => pairedFarmVerdict({ pass: undefined } as any, { pass: false })).toThrow();
});

test('both captures use the same finite pilot phase and the same untouched pilot pair', async () => {
  const image = () => ({ width: 1280, height: 720, data: new Uint8Array(1280 * 720 * 4).fill(255) });
  const first = image(), repeat = image();
  const calls: unknown[] = [];
  const capture = async (side: string, phase: number) => { calls.push({ side, phase }); return { png: image(), stats: { side } }; };
  const result = await captureSamePhasePair({ pilot: { first, repeat, phase: 12.345 }, capture });
  expect(calls).toEqual([{ side: 'accepted', phase: 12.345 }, { side: 'candidate', phase: 12.345 }]);
  expect(result).toMatchObject({ phase: 12.345, verdict: { pass: true, regression: false } });
  expect(result.accepted.metric.scope).toBe('b06-d18');
  expect(result.candidate.metric.scope).toBe('b06-d18');
  await expect(captureSamePhasePair({ pilot: { first, repeat, phase: NaN }, capture })).rejects.toThrow('phase');
  await expect(captureSamePhasePair({ pilot: { first, repeat, phase: 0 }, capture: async () => { throw new Error('capture failed'); } })).rejects.toThrow('capture failed');
});

test('release qualification needs every named and play view on both backends, without duplicate substitution', () => {
  const views = ['hero', 'play-yard'];
  const rows = views.flatMap(view => ['webgpu', 'webgl2'].map(backend => ({ view, backend, status: 'pass' })));
  expect(pairedFarmCoverage(views, rows, true)).toMatchObject({ releaseQualified: true, expected: 4, checked: 4 });
  expect(pairedFarmCoverage(views, rows.slice(0, 3), true)).toMatchObject({ releaseQualified: false, missing: ['play-yard/webgl2'] });
  expect(pairedFarmCoverage(views, [...rows, rows[0]], true)).toMatchObject({ releaseQualified: false });
  expect(pairedFarmCoverage(views, rows.map((row, i) => i ? row : { ...row, status: 'error' }), true)).toMatchObject({ releaseQualified: false });
});

test('all passing pairs without exact accepted-build evidence remain a diagnostic reconstruction', () => {
  const rows = ['webgpu', 'webgl2'].map(backend => ({ view: 'hero', backend, status: 'pass' }));
  expect(pairedFarmCoverage(['hero'], rows)).toMatchObject({ releaseQualified: false, acceptedBuildVerified: false });
  expect(acceptedBuildEvidence(undefined, 'a'.repeat(64))).toMatchObject({ verified: false, status: 'unknown' });
  const receipt = { schema: 'kiln.farm-accepted-build/1', ownerAccepted: true, decision: 'Explicit owner decision for fixture build', buildSha256: 'a'.repeat(64) };
  expect(acceptedBuildEvidence(receipt, receipt.buildSha256)).toMatchObject({ verified: true, status: 'recorded' });
  expect(() => acceptedBuildEvidence(receipt, 'b'.repeat(64))).toThrow('exact build');
  expect(() => acceptedBuildEvidence({ ...receipt, ownerAccepted: false }, receipt.buildSha256)).toThrow();
  expect(() => acceptedBuildEvidence({ ...receipt, decision: '' }, receipt.buildSha256)).toThrow();
});
