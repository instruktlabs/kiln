import { expect, test } from 'bun:test';
import { compareRows, type CountRow } from '../count-probe';
import { packProblems } from '../build-scene';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The runner's pure helpers (GPU join, standard what-ifs, provenance) are tested in scene-kit tests/testing/probe-report.test.ts.
test('X-02 rows check pipelines only between fresh-page runs', () => {
  const row = (draws: number, pipelineCache: number): CountRow => ({ scene: 'farm', tier: 'high', fixture: 'hero', draws, triangles: 1000, pipelineCache, programs: 0, memory: { geometries: 1, textures: 1 } });
  const [fresh] = compareRows([row(100, 70)], [row(100, 60)], true), [shared] = compareRows([row(100, 70)], [row(100, 60)], false);
  expect([fresh!.pass, fresh!.pipelinesComparable, shared!.pass, shared!.pipelinesComparable]).toEqual([false, true, true, false]);
  expect(compareRows([row(103, 60)], [row(100, 60)], false)[0]!.pass).toBe(false); // draws +3% still fails
  expect(compareRows([row(100, 60)], [{ ...row(100, 60), fixture: 'top' }], true)).toEqual([]);
});

const sealed = resolve(import.meta.dir, '../../.cache/site-inputs/golden-gate/standalone/assets');
test.skipIf(!existsSync(sealed))('a sealed site pack verifies apart from its own code chunks', () => {
  const pack = sealed;
  expect(packProblems(pack)).toEqual([]);
  expect(packProblems(resolve(import.meta.dir, 'missing-pack')).length).toBe(1);
});
