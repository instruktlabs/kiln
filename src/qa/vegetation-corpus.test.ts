import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';
import type * as THREE from 'three';

import { bindLegacyFixtureRequirements } from '../__tests__/helpers/requirements-fixture';
import { renderSceneToGLB } from '../render';
import { evaluateVegetationAdvisoryQa, evaluateVegetationContactQa } from './vegetation';
import {
  W7_VEGETATION_CORPUS,
  W7_VEGETATION_CORPUS_VERSION,
  w7VegetationCorpusDescriptor,
} from './vegetation-corpus';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('VEG-019 helper-independent vegetation regression corpus', () => {
  test('freezes the exact requested control and adversary surface', () => {
    expect(W7_VEGETATION_CORPUS_VERSION).toBe('kiln.vegetation.helper-independent.v1');
    expect(W7_VEGETATION_CORPUS.map((fixture) => fixture.id)).toEqual([
      'oak-control',
      'conifer-control',
      'palm-control',
      'shrub-control',
      'grass-tuft-control',
      'vine-control',
      'mushroom-control',
      'flower-control',
      'succulent-control',
      'bare-tree-control',
      'aquatic-control',
      'sparse-adversary',
      'floating-adversary',
      'base-clutter-adversary',
    ]);
    const descriptor = JSON.stringify(w7VegetationCorpusDescriptor());
    expect(sha256(new TextEncoder().encode(descriptor))).toMatch(/^[a-f0-9]{64}$/);
  });

  test('executes semantic/fallback validators with stable expected and forbidden codes', () => {
    for (const fixture of W7_VEGETATION_CORPUS) {
      const payload = fixture.build();
      const findings = [
        ...evaluateVegetationContactQa(payload),
        ...evaluateVegetationAdvisoryQa(payload),
      ];
      const codes = findings.map((finding) => finding.code);
      for (const code of fixture.expectedCodes) expect(codes).toContain(code);
      for (const code of fixture.forbiddenCodes) expect(codes).not.toContain(code);
      expect(
        findings.every((finding) => finding.measurement || finding.code === 'VEG_SCOPE_EXTRA'),
      ).toBe(true);
    }
  });

  test('contains only finite renderable geometry', () => {
    for (const fixture of W7_VEGETATION_CORPUS) {
      const payload = fixture.build();
      let renderables = 0;
      payload.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const position = mesh.geometry.getAttribute('position');
        expect(position?.count ?? 0).toBeGreaterThan(0);
        for (const value of position!.array) expect(Number.isFinite(value)).toBe(true);
        renderables++;
      });
      expect(renderables).toBeGreaterThan(0);
    }
  });

  test('serializes nonblocking cases byte-stably and rejects the exact floating blocker', async () => {
    for (const fixture of W7_VEGETATION_CORPUS) {
      const firstPayload = fixture.build();
      const repeatPayload = fixture.build();
      if (fixture.id === 'floating-adversary') {
        await expect(
          renderSceneToGLB(firstPayload.scene, {
            requirements: bindLegacyFixtureRequirements(firstPayload.intent),
            optimize: 'off',
          }),
        ).rejects.toThrow('VEG_CONTACT_FLOATING');
        continue;
      }
      const first = await renderSceneToGLB(firstPayload.scene, {
        requirements: bindLegacyFixtureRequirements(firstPayload.intent),
        optimize: 'off',
      });
      const repeat = await renderSceneToGLB(repeatPayload.scene, {
        requirements: bindLegacyFixtureRequirements(repeatPayload.intent),
        optimize: 'off',
      });
      expect(first.gltfValidation.issues.numErrors).toBe(0);
      expect(first.gltfValidation.issues.numWarnings).toBe(0);
      expect(sha256(first.bytes)).toBe(sha256(repeat.bytes));
    }
  }, 60_000); // Corpus build: 2.7 s in CI, past its old budget at load 20 on 5 November 2026.
});
