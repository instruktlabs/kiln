import { Object3D, type Mesh } from 'three';
import { readSweepAnalysis } from '../sweep-analysis';
import { KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

export function inspectSweepGeometry(scene: unknown): QaFinding[] {
  const findings: QaFinding[] = [];
  if (!(scene instanceof Object3D)) return findings;
  scene.traverseVisible((node) => {
    const geometry = (node as Mesh).geometry;
    if (!geometry) return;
    const evidence = readSweepAnalysis(geometry);
    if (!evidence) return;
    for (const finding of evidence.findings.slice(0, 16))
      findings.push({
        code: 'SWEEP_SELF_INTERSECTION',
        disposition: 'observe',
        dimension: 'exportIntegrity',
        profile: 'geometry.sweep',
        affected: { node: node.name },
        message:
          finding.kind === 'curvature'
            ? `Station ${finding.station}: curvature radius ${finding.radius} is below profile half-extent ${finding.halfExtent}.`
            : `Station ${finding.station}: its ring intersects ring ${finding.otherStation}.`,
        measurement: {
          name: finding.kind === 'curvature' ? 'curvatureRadius' : 'intersectingRings',
          actual: finding.radius ?? 1,
          ...(finding.halfExtent !== undefined ? { threshold: finding.halfExtent, unit: 'm' } : {}),
          breakdown: {
            station: finding.station,
            ...(finding.otherStation !== undefined ? { otherStation: finding.otherStation } : {}),
          },
        },
        repairText:
          'Inspect the named station; widen its turn, reduce the profile, or separate intersecting rings. This local check does not certify distant segments.',
      });
    if (!evidence.complete || evidence.findings.length > 16)
      findings.push({
        code: 'SWEEP_SELF_INTERSECTION_PARTIAL',
        disposition: 'observe',
        dimension: 'exportIntegrity',
        profile: 'geometry.sweep',
        affected: { node: node.name },
        message:
          'Sweep/loft analysis or its finding list reached the bounded budget; unchecked geometry remains.',
        measurement: {
          name: 'ringPairsChecked',
          actual: evidence.ringPairsChecked,
          breakdown: {
            stationsChecked: evidence.stationsChecked,
            tests: evidence.tests,
            omittedFindings: Math.max(0, evidence.findings.length - 16),
          },
        },
      });
  });
  return findings;
}

export const SWEEP_QA_RULE: QaRule = Object.freeze({
  id: 'SWEEP_SELF_INTERSECTION',
  profile: 'geometry.sweep',
  scope: { kind: 'universal' as const },
  ruleClass: 'heuristic',
  defaultMode: 'observe',
  owner: KILN_ENGINE_QA_OWNER,
  evaluate: (context: QaContext) => inspectSweepGeometry(context.scene),
});
