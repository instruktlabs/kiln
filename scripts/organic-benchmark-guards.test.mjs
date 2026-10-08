import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import {
  assertSeahorseAfterGuards,
  assertBboxWithinReference,
  SEAHORSE_REFERENCE_BBOX,
} from './organic-benchmark-guards.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEAHORSE_AFTER = join(
  HERE,
  '..',
  'benchmark',
  'organic-comparison',
  'after',
  'seahorse.kiln.js',
);

describe('organic benchmark guards', () => {
  test('seahorse after stays within reference bounds and has no clip facets', async () => {
    const code = await readFile(SEAHORSE_AFTER, 'utf8');
    await assertSeahorseAfterGuards(code);
  });

  test('reference bbox guard rejects obvious blow-up', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(...SEAHORSE_REFERENCE_BBOX.min),
      new THREE.Vector3(...SEAHORSE_REFERENCE_BBOX.max),
    );
    box.expandByScalar(0.05);
    expect(() => assertBboxWithinReference(box, SEAHORSE_REFERENCE_BBOX)).toThrow();
  });
});
