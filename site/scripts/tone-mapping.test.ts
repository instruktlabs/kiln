import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { REVIEW_RIG } from '../src/lib/review-rig';
import {
  DEFAULT_TONE_MAPPING,
  TONE_MAPPINGS,
  applyToneMapping,
  reviewToneMapping,
  toneMappingChoice,
} from '../src/lib/review-rig-three';

describe('the tone mappings the 3D view offers', () => {
  test('offers Neutral, ACES and Linear, each once', () => {
    expect(TONE_MAPPINGS.map((choice) => choice.id)).toEqual(['neutral', 'aces', 'linear']);
    expect(new Set(TONE_MAPPINGS.map((choice) => choice.label)).size).toBe(3);
  });

  test('the default is the rig own mapping at the rig exposure, so nothing changes until a visitor chooses', () => {
    const [first] = TONE_MAPPINGS;
    expect(DEFAULT_TONE_MAPPING).toBe('neutral');
    expect(first.id).toBe(DEFAULT_TONE_MAPPING);
    expect(first.mapping).toBe(reviewToneMapping);
    expect(first.exposure).toBe(REVIEW_RIG.exposure);
    expect(first.label).toContain('default');
  });

  test('ACES and Linear are three built-in mappings at exposure 1', () => {
    expect(toneMappingChoice('aces')).toMatchObject({ mapping: THREE.ACESFilmicToneMapping, exposure: 1 });
    expect(toneMappingChoice('linear')).toMatchObject({ mapping: THREE.LinearToneMapping, exposure: 1 });
  });

  test('a name that is not one of them means the default', () => {
    expect(toneMappingChoice('filmic-2000').id).toBe(DEFAULT_TONE_MAPPING);
    expect(toneMappingChoice('').id).toBe(DEFAULT_TONE_MAPPING);
  });

  test('the list cannot be changed by a caller', () => {
    expect(Object.isFrozen(TONE_MAPPINGS)).toBe(true);
    expect(TONE_MAPPINGS.every((choice) => Object.isFrozen(choice))).toBe(true);
  });
});

describe('putting the renderer on a tone mapping', () => {
  const renderer = () => ({ toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }) as unknown as THREE.WebGLRenderer;
  const sceneWithMaterials = () => {
    const scene = new THREE.Scene();
    const single = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const several = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]);
    scene.add(single, several, new THREE.Group(), new THREE.DirectionalLight());
    return { scene, materials: [single.material as THREE.Material, ...(several.material as THREE.Material[])] };
  };

  test('sets the mapping and its exposure', () => {
    const target = renderer();
    applyToneMapping(target, new THREE.Scene(), 'aces');
    expect(target.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(target.toneMappingExposure).toBe(1);
    applyToneMapping(target, new THREE.Scene(), 'neutral');
    expect(target.toneMapping).toBe(reviewToneMapping);
    expect(target.toneMappingExposure).toBe(REVIEW_RIG.exposure);
  });

  test('rebuilds every material in the scene, one or several per mesh, and skips objects without one', () => {
    const { scene, materials } = sceneWithMaterials();
    const before = materials.map((material) => material.version);
    applyToneMapping(renderer(), scene, 'linear');
    expect(materials.map((material) => material.version)).toEqual(before.map((version) => version + 1));
  });
});
