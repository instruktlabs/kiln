import { beforeAll, describe, expect, test } from 'bun:test';

import {
  runW6MaterialVegetationExperiments,
  type W6MaterialVegetationExperimentReportV1,
} from './w6-material-vegetation';

let report: W6MaterialVegetationExperimentReportV1;

beforeAll(async () => {
  report = await runW6MaterialVegetationExperiments();
}, 60_000); // Runs every experiment arm: 5.5 s in CI, past 20 s at load 20+ on 5 November 2026.

function allArms() {
  return [
    ...report.branch.baseline,
    ...report.branch.candidate,
    ...report.canopy.baseline,
    ...report.canopy.candidate,
    ...report.frond.baseline,
    ...report.frond.candidate,
    ...report.proceduralMaterial.baseline,
    ...report.proceduralMaterial.candidate,
  ];
}

describe('W6 material and vegetation experiment gate', () => {
  test('MAT-019 records nonzero correct portable recipe use without helper words in user prompts', () => {
    expect(report.providerCalls).toBe(0);
    expect(report.materialPromptAblation).toMatchObject({
      baselineCorrect: 0,
      candidateCorrect: 10,
      total: 10,
      nonzeroCorrectRecipeUsage: true,
      portablePbrUsage: 10,
    });
    expect(
      report.materialPromptAblation.cases.every(
        (value) =>
          !value.prompt.includes('materialRecipe') &&
          value.candidateRecipeId === value.expectedRecipeId,
      ),
    ).toBe(true);
  });

  test('VEG-005 candidate closes branch gaps and adds monotonic taper with measured cost', () => {
    for (let index = 0; index < report.branch.baseline.length; index++) {
      const baseline = report.branch.baseline[index]!;
      const candidate = report.branch.candidate[index]!;
      expect(baseline.structural.attachmentPassRate).toBe(0);
      expect(candidate.structural.attachmentPassRate).toBe(1);
      expect(baseline.structural.monotonicTaperPassRate).toBe(0);
      expect(candidate.structural.monotonicTaperPassRate).toBe(1);
      expect(candidate.runtime.triangles).toBeGreaterThan(baseline.runtime.triangles);
    }
  });

  test('VEG-009 candidate lifts multi-view occupancy/profile pass but stays preference-gated', () => {
    const baselinePasses = report.canopy.baseline.filter(
      (value) => value.structural.structuralProfilePass,
    ).length;
    const candidatePasses = report.canopy.candidate.filter(
      (value) => value.structural.structuralProfilePass,
    ).length;
    expect(candidatePasses).toBeGreaterThan(baselinePasses);
    for (let index = 0; index < report.canopy.baseline.length; index++) {
      const baseline = report.canopy.baseline[index]!;
      const candidate = report.canopy.candidate[index]!;
      expect(candidate.structural.frontOccupancy as number).toBeGreaterThan(
        baseline.structural.frontOccupancy as number,
      );
      expect(candidate.structural.sideOccupancy as number).toBeGreaterThan(
        baseline.structural.sideOccupancy as number,
      );
      expect(candidate.structural.topOccupancy as number).toBeGreaterThan(
        baseline.structural.topOccupancy as number,
      );
    }
  });

  test('VEG-012 candidate resolves attachment/arc/droop but does not become a public helper', () => {
    for (let index = 0; index < report.frond.baseline.length; index++) {
      const baseline = report.frond.baseline[index]!;
      const candidate = report.frond.candidate[index]!;
      expect(baseline.structural.arcAndDroopPassRate).toBe(0);
      expect(candidate.structural.arcAndDroopPassRate).toBe(1);
      expect(candidate.structural.attachmentPassRate).toBe(1);
      expect(candidate.runtime.triangles).toBeGreaterThan(baseline.runtime.triangles);
    }
    expect(report.frond.gate).toBe('closed');
  });

  test('MAT-020 procedural candidates are seamless and round-trip, but preference evidence closes the gate', () => {
    for (const candidate of report.proceduralMaterial.candidate) {
      expect(candidate.structural.tileableSeamMismatch).toBe(0);
      expect(candidate.structural.valueStandardDeviation as number).toBeGreaterThan(0);
      expect(candidate.runtime.roundTrip.textureCount).toBe(1);
    }
    expect(report.proceduralMaterial.gate).toBe('closed');
  });

  test('every exact artifact is byte-stable and round-trips with nonzero geometry', () => {
    expect(allArms()).toHaveLength(32);
    for (const arm of allArms()) {
      expect(arm.runtime.byteStable, arm.id).toBe(true);
      expect(arm.runtime.glbSha256, arm.id).toMatch(/^[a-f0-9]{64}$/);
      expect(arm.runtime.glbSha256, arm.id).toBe(arm.runtime.repeatGlbSha256);
      expect(arm.runtime.validatorErrors, arm.id).toBe(0);
      expect(arm.runtime.roundTrip.meshCount, arm.id).toBeGreaterThan(0);
      expect(arm.runtime.parity, arm.id).toEqual({
        triangleCount: true,
        materialCount: true,
        textureCount: true,
      });
      expect(arm.runtime.triangles, arm.id).toBeGreaterThan(0);
      expect(arm.runtime.glbBytes, arm.id).toBeGreaterThan(1_000);
    }
  });

  test('all optional promotions use honest insufficientEvidence rather than model preference', () => {
    for (const comparison of [
      report.branch,
      report.canopy,
      report.frond,
      report.proceduralMaterial,
    ]) {
      expect(comparison.preference).toMatchObject({
        status: 'insufficientEvidence',
        delegatedHumanLabels: 0,
      });
      expect(comparison.gate).toBe('closed');
      expect(comparison.baselineCodeSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(comparison.candidateCodeSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(report.reportSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
