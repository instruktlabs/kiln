import { expect, test } from 'bun:test';
import { savedRebuildRenderOptions } from './rebuild-options';

const saved = {
  gltfExporter: 'legacy',
  optimize: 'off',
  instance: 'auto',
  geometryPolicy: 'warn',
  indexPolicy: 'indexed',
  // Recorded beside the exporter inputs, but not exporter inputs: an exact rebuild drops them.
  qaMode: 'enforce',
  evaluatorMode: 'subprocess',
  projectId: 'farm-production',
  requirements: { kind: 'kiln.requirements-context.v1' },
};

test('an exact rebuild keeps only the recorded exporter inputs', () => {
  expect(savedRebuildRenderOptions(saved)).toEqual({
    gltfExporter: 'legacy',
    optimize: 'off',
    instance: 'auto',
    geometryPolicy: 'warn',
    indexPolicy: 'indexed',
  });
});

test('the full pipeline version is replay metadata, not an evaluator option', () => {
  expect(
    savedRebuildRenderOptions({ ...saved, optimize: 'full', optimizationPipeline: 'rigid-v1' }),
  ).toEqual({
    gltfExporter: 'legacy',
    optimize: 'full',
    instance: 'auto',
    geometryPolicy: 'warn',
    indexPolicy: 'indexed',
  });
});

test('incomplete or unversioned saved options are refused, never guessed', () => {
  const { gltfExporter: _missing, ...incomplete } = saved;
  expect(() => savedRebuildRenderOptions(incomplete)).toThrow(
    'Saved exporter settings are incomplete',
  );
  expect(() => savedRebuildRenderOptions(undefined)).toThrow(
    'Saved exporter settings are incomplete',
  );
  expect(() => savedRebuildRenderOptions({ ...saved, optimize: 'full' })).toThrow(
    'unversioned full optimization pipeline',
  );
});
