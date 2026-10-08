import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { boxGeo } from '../primitives';
import { summarizeAxisAlignedFacets } from './axis-aligned-facet';

describe('summarizeAxisAlignedFacets', () => {
  test('flags a box with dominant axis-aligned faces', () => {
    const geo = boxGeo(1, 0.4, 0.6);
    const summary = summarizeAxisAlignedFacets(geo, 0.08);
    expect(summary).toBeDefined();
    expect(summary!.areaFraction).toBeGreaterThan(0.15);
  });

  test('does not flag a smooth sphere', () => {
    const geo = new THREE.SphereGeometry(0.2, 24, 16);
    expect(summarizeAxisAlignedFacets(geo, 0.1)).toBeUndefined();
  });
});
