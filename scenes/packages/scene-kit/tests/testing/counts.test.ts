import { expect, test } from 'bun:test';
import { rendererProgramCounts } from '../../src/testing/counts';

test('actual r186 pipeline cache is distinct from shader-stage program count', () => {
  const renderer = { _pipelines: { caches: new Map([['render-a', {}], ['render-b', {}], ['compute-c', {}]]), pipelines: new Map([['obsolete-shape', {}]]) }, info: { memory: { programs: 7 } } };
  expect(rendererProgramCounts(renderer)).toEqual({ pipelines: 3, programs: 7 });
});
test('missing pipeline cache is not replaced by an unrelated program metric', () => {
  expect(rendererProgramCounts({ info: { memory: { programs: 9 } } })).toEqual({ pipelines: 0, programs: 9 });
  expect(rendererProgramCounts(undefined)).toEqual({ pipelines: 0, programs: 0 });
});
