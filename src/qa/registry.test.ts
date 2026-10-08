import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

import { createAssetIntentV1 } from '../contracts';
import {
  calibrationReportEvidenceSha256,
  conformancePromotionAuthorization,
  QaRegistry,
  QA_026_CALIBRATION_THRESHOLD_ID,
  QA_026_CALIBRATION_THRESHOLD_SHA256,
  QA_026_HELD_OUT_SET_SHA256,
  QA_026_HELD_OUT_SET_VERSION,
  QA_026_REVIEW_AUTHORITY_KEY_ID,
  QA_026_REVIEW_AUTHORITY_PUBLIC_KEY_SHA256,
  QA_026_REVIEW_AUTHORITY_SCHEME,
  type QaCalibrationPromotionAuthorization,
  type QaCalibrationReportEvidenceV1,
  type QaRule,
  type QaRuleOwner,
} from './registry';
import { DETERMINISTIC_QA_REGISTRY } from './run';
import {
  createAssetQaReportV1,
  createLegacyUnassessedQaReportV1,
  isQaFinding,
  type QaFinding,
} from './types';

const finding = (code: string, disposition: QaFinding['disposition'] = 'block'): QaFinding => ({
  code,
  disposition,
  dimension: 'categoryReadiness',
  profile: 'test',
  message: code,
});

const TEST_EVIDENCE_SHA = 'a'.repeat(64);
const TEST_OWNER: QaRuleOwner = { id: 'qa-test-owner', authority: 'named' };

const rule = (overrides: Partial<QaRule> & Pick<QaRule, 'id' | 'scope'>): QaRule => ({
  profile: 'test',
  ruleClass: 'exact',
  owner: TEST_OWNER,
  promotion: conformancePromotionAuthorization(
    'qa-test-fixtures-v1',
    'src/qa/registry.test.ts',
    TEST_EVIDENCE_SHA,
    TEST_OWNER,
  ),
  defaultMode: 'enforce',
  evaluate: () => [finding(overrides.id)],
  ...overrides,
});

interface CalibrationOptions {
  source?: QaCalibrationReportEvidenceV1['source'];
  authorizedMode?: QaCalibrationPromotionAuthorization['authorizedMode'];
  report?: Partial<QaCalibrationReportEvidenceV1>;
  authorization?: Partial<QaCalibrationPromotionAuthorization>;
}

function calibrationReport(
  ruleCode: string,
  options: CalibrationOptions = {},
): QaCalibrationReportEvidenceV1 {
  const authorizedMode = options.authorizedMode ?? 'warn';
  const source = options.source ?? 'deterministic-heuristic';
  const enforce = authorizedMode === 'enforce';
  const validExamples = enforce ? 30 : 10;
  const defectiveExamples = enforce ? 30 : 10;
  const truePositive = enforce ? 27 : 9;
  const falsePositive = enforce ? 0 : 1;
  const trueNegative = validExamples - falsePositive;
  const falseNegative = defectiveExamples - truePositive;
  return {
    schemaVersion: 1,
    reportId: `qa-026:${ruleCode.toLowerCase()}:v1`,
    thresholdId: QA_026_CALIBRATION_THRESHOLD_ID,
    thresholdSha256: QA_026_CALIBRATION_THRESHOLD_SHA256,
    heldOutSetVersion: QA_026_HELD_OUT_SET_VERSION,
    heldOutSetSha256: QA_026_HELD_OUT_SET_SHA256,
    reviewAuthorityScheme: QA_026_REVIEW_AUTHORITY_SCHEME,
    reviewAuthorityKeyId: QA_026_REVIEW_AUTHORITY_KEY_ID,
    reviewAuthorityPublicKeySha256: QA_026_REVIEW_AUTHORITY_PUBLIC_KEY_SHA256,
    ruleCode,
    source,
    generatedAt: '2026-07-09T12:00:00.000Z',
    labeledCases: validExamples + defectiveExamples,
    evaluatedCases: validExamples + defectiveExamples,
    insufficientEvidenceCases: 0,
    humanDisagreementCases: 0,
    validExamples,
    defectiveExamples,
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    precision: enforce ? 1 : 0.9,
    recall: 0.9,
    meanConfidence: source === 'vlm' ? 0.9 : null,
    styles: enforce ? 3 : 2,
    falseBlocks: 0,
    ...options.report,
  };
}

function calibration(
  owner: QaRuleOwner,
  ruleCode: string,
  options: CalibrationOptions = {},
): QaCalibrationPromotionAuthorization {
  const report = calibrationReport(ruleCode, options);
  return {
    basis: 'qa-026-calibration',
    authorizedMode: options.authorizedMode ?? 'warn',
    packetId: report.reportId,
    evidenceSha256: calibrationReportEvidenceSha256(report),
    frozenAt: '2026-07-09T13:00:00.000Z',
    authorizedBy: owner.id,
    rendererId: 'cpu-raster:legacy',
    report,
    ...options.authorization,
  };
}

describe('QaRegistry', () => {
  const context = {
    intent: createAssetIntentV1({
      category: 'vehicle',
      subtype: 'wheeled',
      capabilities: ['driveable', 'grounded'],
    }),
  };

  test('composes universal, category, subtype, and capability rules', () => {
    const registry = new QaRegistry([
      rule({ id: 'TEST_UNIVERSAL', scope: { kind: 'universal' } }),
      rule({ id: 'TEST_CATEGORY', scope: { kind: 'category', category: 'vehicle' } }),
      rule({
        id: 'TEST_SUBTYPE',
        scope: { kind: 'subtype', category: 'vehicle', subtype: 'wheeled' },
      }),
      rule({ id: 'TEST_CAPABILITY', scope: { kind: 'capability', capability: 'driveable' } }),
      rule({ id: 'TEST_WRONG_CATEGORY', scope: { kind: 'category', category: 'character' } }),
    ]);

    expect(registry.run(context).executedRules).toEqual([
      'TEST_UNIVERSAL',
      'TEST_CATEGORY',
      'TEST_SUBTYPE',
      'TEST_CAPABILITY',
    ]);
  });

  test('applies off, observe, warn, and enforce deterministically', () => {
    const registry = new QaRegistry([
      rule({ id: 'TEST_OFF', scope: { kind: 'universal' } }),
      rule({ id: 'TEST_OBSERVE', scope: { kind: 'universal' } }),
      rule({ id: 'TEST_WARN', scope: { kind: 'universal' } }),
      rule({ id: 'TEST_ENFORCE', scope: { kind: 'universal' } }),
    ]);
    const result = registry.run(context, {
      byRule: {
        TEST_OFF: 'off',
        TEST_OBSERVE: 'observe',
        TEST_WARN: 'warn',
        TEST_ENFORCE: 'enforce',
      },
    });

    expect(result.skippedRules).toEqual(['TEST_OFF']);
    expect(result.findings.map((item) => [item.code, item.disposition])).toEqual([
      ['TEST_OBSERVE', 'observe'],
      ['TEST_WARN', 'warn'],
      ['TEST_ENFORCE', 'block'],
    ]);
    expect(result.decisions.map(({ ruleId, mode }) => [ruleId, mode])).toEqual([
      ['TEST_OFF', 'off'],
      ['TEST_OBSERVE', 'observe'],
      ['TEST_WARN', 'warn'],
      ['TEST_ENFORCE', 'enforce'],
    ]);
  });

  test('requires a stable named or delegated owner on every rule', () => {
    expect(
      () =>
        new QaRegistry([
          {
            ...rule({ id: 'TEST_MISSING_OWNER', scope: { kind: 'universal' } }),
            owner: undefined,
          } as unknown as QaRule,
        ]),
    ).toThrow('must name a stable rule owner');
    expect(
      () =>
        new QaRegistry([
          rule({
            id: 'TEST_UNKNOWN_OWNER',
            scope: { kind: 'universal' },
            owner: { id: 'unknown', authority: 'named' },
          }),
        ]),
    ).toThrow('must name a stable rule owner');
  });

  test('allows exact warn/enforce only with owner-authorized conformance evidence', () => {
    expect(
      () =>
        new QaRegistry([
          rule({
            id: 'TEST_EXACT_WITHOUT_FIXTURES',
            scope: { kind: 'universal' },
            promotion: undefined,
          }),
        ]),
    ).toThrow('without frozen promotion evidence');
    expect(
      () =>
        new QaRegistry([
          rule({
            id: 'TEST_EXACT_WRONG_AUTHORIZER',
            scope: { kind: 'universal' },
            promotion: {
              ...conformancePromotionAuthorization(
                'qa-test-fixtures-v1',
                'src/qa/registry.test.ts',
                TEST_EVIDENCE_SHA,
                TEST_OWNER,
              ),
              authorizedBy: 'someone-else',
            },
          }),
        ]),
    ).toThrow('authorized by its named rule owner');
  });

  test('keeps an uncalibrated heuristic observe-only, then permits owner-approved QA-026 warn', () => {
    const observeOnly = rule({
      id: 'TEST_HEURISTIC',
      scope: { kind: 'universal' },
      ruleClass: 'heuristic',
      defaultMode: 'observe',
      promotion: undefined,
    });
    const registry = new QaRegistry([observeOnly]);
    expect(registry.run(context).findings[0]?.disposition).toBe('observe');
    expect(() => registry.run(context, { byRule: { TEST_HEURISTIC: 'warn' } })).toThrow(
      'without frozen promotion evidence',
    );

    const delegatedOwner: QaRuleOwner = { id: 'qa-delegate:motion', authority: 'delegated' };
    const calibrated = new QaRegistry([
      rule({
        id: 'TEST_CALIBRATED_HEURISTIC',
        scope: { kind: 'universal' },
        ruleClass: 'heuristic',
        owner: delegatedOwner,
        defaultMode: 'warn',
        promotion: calibration(delegatedOwner, 'TEST_CALIBRATED_HEURISTIC'),
      }),
    ]);
    expect(calibrated.run(context).findings[0]?.disposition).toBe('warn');
    expect(() =>
      calibrated.run(context, { byRule: { TEST_CALIBRATED_HEURISTIC: 'enforce' } }),
    ).toThrow('authorizes warn, not enforce');
  });

  test('allows a calibrated VLM warning but never VLM enforcement', () => {
    const owner: QaRuleOwner = { id: 'qa-delegate:vlm', authority: 'delegated' };
    const vlm = rule({
      id: 'TEST_VLM',
      scope: { kind: 'universal' },
      ruleClass: 'vlm',
      owner,
      defaultMode: 'warn',
      promotion: calibration(owner, 'TEST_VLM', { source: 'vlm' }),
    });
    const registry = new QaRegistry([vlm]);
    expect(registry.run(context).findings[0]?.disposition).toBe('warn');
    expect(() => registry.run(context, { byRule: { TEST_VLM: 'enforce' } })).toThrow(
      'VLM findings are never blockers',
    );
  });

  test('rejects zero-sample calibration and threshold/report identity mismatches', () => {
    const owner: QaRuleOwner = { id: 'qa-delegate:strict', authority: 'delegated' };
    const id = 'TEST_STRICT_CALIBRATION';
    const zeroSample = calibration(owner, id, {
      report: {
        labeledCases: 0,
        evaluatedCases: 0,
        validExamples: 0,
        defectiveExamples: 0,
        truePositive: 0,
        falsePositive: 0,
        trueNegative: 0,
        falseNegative: 0,
        precision: 0,
        recall: 0,
        styles: 0,
      },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: zeroSample,
          }),
        ]),
    ).toThrow('warn promotion minimums');

    const wrongThreshold = calibration(owner, id, {
      report: {
        thresholdId:
          'kiln.asset-quality-calibration.thresholds.forged' as typeof QA_026_CALIBRATION_THRESHOLD_ID,
      },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: wrongThreshold,
          }),
        ]),
    ).toThrow('threshold identity mismatch');

    const packetMismatch = calibration(owner, id, {
      authorization: { packetId: 'qa-026:different-report:v1' },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: packetMismatch,
          }),
        ]),
    ).toThrow('packet/report identity mismatch');
  });

  test('rejects test and caller-selected review authorities for warn and enforce', () => {
    const owner: QaRuleOwner = { id: 'qa-delegate:authority', authority: 'delegated' };
    const id = 'TEST_REVIEW_AUTHORITY';
    const untrustedAuthorities: Array<{
      label: string;
      report: Partial<QaCalibrationReportEvidenceV1>;
    }> = [
      {
        label: 'test authority',
        report: {
          reviewAuthorityKeyId:
            'kiln-studio.asset-quality-review.test.v1' as typeof QA_026_REVIEW_AUTHORITY_KEY_ID,
          reviewAuthorityPublicKeySha256: 'b'.repeat(
            64,
          ) as typeof QA_026_REVIEW_AUTHORITY_PUBLIC_KEY_SHA256,
        },
      },
      {
        label: 'caller authority',
        report: {
          reviewAuthorityKeyId:
            'caller-selected.review-authority.v1' as typeof QA_026_REVIEW_AUTHORITY_KEY_ID,
          reviewAuthorityPublicKeySha256: 'c'.repeat(
            64,
          ) as typeof QA_026_REVIEW_AUTHORITY_PUBLIC_KEY_SHA256,
        },
      },
    ];

    for (const { label, report } of untrustedAuthorities) {
      for (const authorizedMode of ['warn', 'enforce'] as const) {
        const promotion = calibration(owner, id, { authorizedMode, report });
        expect(
          () =>
            new QaRegistry([
              rule({
                id,
                scope: { kind: 'universal' },
                ruleClass: 'heuristic',
                owner,
                defaultMode: authorizedMode,
                promotion,
              }),
            ]),
          `${label}/${authorizedMode}`,
        ).toThrow('review authority identity mismatch');
      }
    }

    const wrongScheme = calibration(owner, id, {
      report: {
        reviewAuthorityScheme: 'hmac-sha256' as typeof QA_026_REVIEW_AUTHORITY_SCHEME,
      },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: wrongScheme,
          }),
        ]),
    ).toThrow('review authority identity mismatch');
  });

  test('binds review authority fields into the report hash and rejects tampering', () => {
    const owner: QaRuleOwner = { id: 'qa-delegate:authority-hash', authority: 'delegated' };
    const id = 'TEST_REVIEW_AUTHORITY_HASH';
    const report = calibrationReport(id);
    const canonicalHash = calibrationReportEvidenceSha256(report);
    const authorityMutations: Array<Partial<QaCalibrationReportEvidenceV1>> = [
      {
        reviewAuthorityScheme: 'other-scheme' as typeof QA_026_REVIEW_AUTHORITY_SCHEME,
      },
      {
        reviewAuthorityKeyId: 'other.key.v1' as typeof QA_026_REVIEW_AUTHORITY_KEY_ID,
      },
      {
        reviewAuthorityPublicKeySha256: 'd'.repeat(
          64,
        ) as typeof QA_026_REVIEW_AUTHORITY_PUBLIC_KEY_SHA256,
      },
    ];
    for (const mutation of authorityMutations) {
      expect(calibrationReportEvidenceSha256({ ...report, ...mutation })).not.toBe(canonicalHash);
    }

    const tamperedAuthority = calibration(owner, id);
    tamperedAuthority.report.reviewAuthorityPublicKeySha256 = 'e'.repeat(
      64,
    ) as typeof QA_026_REVIEW_AUTHORITY_PUBLIC_KEY_SHA256;
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: tamperedAuthority,
          }),
        ]),
    ).toThrow('review authority identity mismatch');

    const tamperedHash = calibration(owner, id, {
      authorization: { evidenceSha256: 'f'.repeat(64) },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: tamperedHash,
          }),
        ]),
    ).toThrow('report SHA-256 mismatch');
  });

  test('rejects missing held-out identity, bad evidence hashes, and forged metrics', () => {
    const owner: QaRuleOwner = { id: 'qa-delegate:evidence', authority: 'delegated' };
    const id = 'TEST_EVIDENCE_CALIBRATION';
    const missingHeldOut = calibration(owner, id, {
      report: {
        heldOutSetVersion: undefined as unknown as typeof QA_026_HELD_OUT_SET_VERSION,
      },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: missingHeldOut,
          }),
        ]),
    ).toThrow('held-out set identity mismatch');

    const hashMismatch = calibration(owner, id, {
      authorization: { evidenceSha256: 'f'.repeat(64) },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: hashMismatch,
          }),
        ]),
    ).toThrow('report SHA-256 mismatch');

    const forgedMetrics = calibration(owner, id, { report: { precision: 0.99 } });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: forgedMetrics,
          }),
        ]),
    ).toThrow('metrics do not match confusion counts');
  });

  test('requires the stronger enforcement bar and rejects false blocks', () => {
    const owner: QaRuleOwner = { id: 'qa-delegate:enforce', authority: 'delegated' };
    const id = 'TEST_ENFORCED_HEURISTIC';
    const excessiveFalseBlocks = calibration(owner, id, {
      authorizedMode: 'enforce',
      report: { falseBlocks: 1 },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'enforce',
            promotion: excessiveFalseBlocks,
          }),
        ]),
    ).toThrow('enforce promotion minimums');

    const registry = new QaRegistry([
      rule({
        id,
        scope: { kind: 'universal' },
        ruleClass: 'heuristic',
        owner,
        defaultMode: 'enforce',
        promotion: calibration(owner, id, { authorizedMode: 'enforce' }),
      }),
    ]);
    expect(registry.run(context).findings[0]?.disposition).toBe('block');
  });

  test('requires resolved evidence and calibrated VLM confidence', () => {
    const owner: QaRuleOwner = { id: 'qa-delegate:resolution', authority: 'delegated' };
    const id = 'TEST_RESOLVED_HEURISTIC';
    const unresolved = calibration(owner, id, {
      report: { labeledCases: 21, insufficientEvidenceCases: 1 },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id,
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: unresolved,
          }),
        ]),
    ).toThrow('unresolved evidence or human disagreement');

    const vlmId = 'TEST_LOW_CONFIDENCE_VLM';
    const lowConfidence = calibration(owner, vlmId, {
      source: 'vlm',
      report: { meanConfidence: 0.5 },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id: vlmId,
            scope: { kind: 'universal' },
            ruleClass: 'vlm',
            owner,
            defaultMode: 'warn',
            promotion: lowConfidence,
          }),
        ]),
    ).toThrow('confidence is below the warn minimum');

    const vlmEnforce = calibration(owner, vlmId, {
      source: 'vlm',
      authorizedMode: 'enforce',
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id: vlmId,
            scope: { kind: 'universal' },
            ruleClass: 'vlm',
            owner,
            defaultMode: 'observe',
            promotion: vlmEnforce,
          }),
        ]),
    ).toThrow('permanently capped at warn');
  });

  test('requires a rendererId on promotion evidence and rejects missing/malformed values', () => {
    // Valid: the checked-in helper stamps legacy evidence and passes.
    const valid = conformancePromotionAuthorization(
      'qa-test-fixtures-v1',
      'src/qa/registry.test.ts',
      TEST_EVIDENCE_SHA,
      TEST_OWNER,
    );
    expect(valid.rendererId).toBe('cpu-raster:legacy');
    expect(
      () => new QaRegistry([rule({ id: 'TEST_RENDERER_OK', scope: { kind: 'universal' } })]),
    ).not.toThrow();

    // Valid: an explicit non-legacy rendererId with a family prefix.
    expect(
      () =>
        new QaRegistry([
          rule({
            id: 'TEST_RENDERER_EXPLICIT',
            scope: { kind: 'universal' },
            promotion: conformancePromotionAuthorization(
              'qa-test-fixtures-v1',
              'src/qa/registry.test.ts',
              TEST_EVIDENCE_SHA,
              TEST_OWNER,
              undefined,
              'enforce',
              'cpu-raster:0.6.0',
            ),
          }),
        ]),
    ).not.toThrow();

    // Missing rendererId throws with an actionable message.
    expect(
      () =>
        new QaRegistry([
          rule({
            id: 'TEST_RENDERER_MISSING',
            scope: { kind: 'universal' },
            promotion: {
              ...valid,
              rendererId: undefined,
            } as unknown as QaRule['promotion'],
          }),
        ]),
    ).toThrow('must name its producing rendererId');
    expect(
      () =>
        new QaRegistry([
          rule({
            id: 'TEST_RENDERER_EMPTY',
            scope: { kind: 'universal' },
            promotion: { ...valid, rendererId: '   ' },
          }),
        ]),
    ).toThrow('must name its producing rendererId');

    // Malformed prefix (no family ':' separator / illegal characters) throws.
    for (const bad of ['cpu-raster', 'CPU-RASTER:legacy', 'gpu_render:x', ':nvidia']) {
      expect(
        () =>
          new QaRegistry([
            rule({
              id: 'TEST_RENDERER_MALFORMED',
              scope: { kind: 'universal' },
              promotion: { ...valid, rendererId: bad },
            }),
          ]),
        bad,
      ).toThrow('renderer family prefix');
    }

    // Calibration evidence carries the same requirement.
    const owner: QaRuleOwner = { id: 'qa-delegate:renderer', authority: 'delegated' };
    const noRenderer = calibration(owner, 'TEST_RENDERER_CALIBRATION', {
      authorization: { rendererId: 'not-prefixed' },
    });
    expect(
      () =>
        new QaRegistry([
          rule({
            id: 'TEST_RENDERER_CALIBRATION',
            scope: { kind: 'universal' },
            ruleClass: 'heuristic',
            owner,
            defaultMode: 'warn',
            promotion: noRenderer,
          }),
        ]),
    ).toThrow('renderer family prefix');
  });

  test('appearance rules register at observe but can never exceed it', () => {
    const owner: QaRuleOwner = { id: 'qa-delegate:appearance', authority: 'delegated' };
    const appearance = rule({
      id: 'TEST_APPEARANCE',
      scope: { kind: 'universal' },
      ruleClass: 'appearance',
      owner,
      defaultMode: 'observe',
      promotion: undefined,
    });
    const registry = new QaRegistry([appearance]);
    expect(registry.run(context).findings[0]?.disposition).toBe('observe');

    // Off also registers (below observe).
    expect(
      () =>
        new QaRegistry([
          rule({
            id: 'TEST_APPEARANCE_OFF',
            scope: { kind: 'universal' },
            ruleClass: 'appearance',
            owner,
            defaultMode: 'off',
            promotion: undefined,
          }),
        ]),
    ).not.toThrow();

    // Any mode above observe throws at registration — even with calibration
    // evidence a heuristic could use (stricter than the VLM warn cap).
    for (const defaultMode of ['warn', 'enforce'] as const) {
      expect(
        () =>
          new QaRegistry([
            rule({
              id: 'TEST_APPEARANCE_PROMOTED',
              scope: { kind: 'universal' },
              ruleClass: 'appearance',
              owner,
              defaultMode,
              promotion: calibration(owner, 'TEST_APPEARANCE_PROMOTED', {
                authorizedMode: defaultMode,
              }),
            }),
          ]),
        defaultMode,
      ).toThrow('cannot exceed observe');
    }

    // A runtime policy escalation is rejected the same way.
    expect(() => registry.run(context, { byRule: { TEST_APPEARANCE: 'warn' } })).toThrow(
      'cannot exceed observe',
    );
    expect(() => registry.describePolicy({ byRule: { TEST_APPEARANCE: 'enforce' } })).toThrow(
      'cannot exceed observe',
    );
  });

  test('rejects unknown runtime rollout modes before blocker severity can survive', () => {
    const registry = new QaRegistry([
      rule({ id: 'TEST_RUNTIME_MODE', scope: { kind: 'universal' } }),
    ]);
    expect(() =>
      registry.run(context, {
        byRule: { TEST_RUNTIME_MODE: 'not-a-mode' as never },
      }),
    ).toThrow('unsupported rollout mode');
  });

  test('publishes a stable auditable state and owner for every checked-in rule', () => {
    const decisions = DETERMINISTIC_QA_REGISTRY.describePolicy();
    // 28 -> 29 with UNIVERSAL_MESH_TOPOLOGY_RULE. The count means a rule can
    // never join the deterministic registry without someone noticing.
    expect(decisions).toHaveLength(29);
    expect(
      decisions
        .filter((item) => item.ruleClass === 'exact')
        .every((item) => item.mode === 'enforce'),
    ).toBe(true);
    expect(
      decisions
        .filter((item) => item.ruleClass !== 'exact')
        .every((item) => item.mode === 'observe'),
    ).toBe(true);
    expect(decisions.every((item) => item.owner.id === 'kiln-engine-maintainers')).toBe(true);
    expect(
      decisions
        .filter((item) => item.ruleClass === 'exact')
        .every((item) => item.promotionBasis === 'conformance'),
    ).toBe(true);
    expect(
      decisions.some(
        (item) => item.ruleClass !== 'exact' && (item.mode === 'warn' || item.mode === 'enforce'),
      ),
    ).toBe(false);
  });

  test('keeps mixed architecture and vehicle advisories outside exact conformance promotion', () => {
    for (const ruleId of ['ARCHITECTURE_ADVISORY_PROFILE', 'VEHICLE_ADVISORY_PROFILE']) {
      const ruleEntry = DETERMINISTIC_QA_REGISTRY.list().find((item) => item.id === ruleId);
      expect(ruleEntry).toMatchObject({ ruleClass: 'heuristic', defaultMode: 'observe' });
      expect(ruleEntry?.promotion).toBeUndefined();
      expect(() =>
        DETERMINISTIC_QA_REGISTRY.describePolicy({ byRule: { [ruleId]: 'warn' } }),
      ).toThrow('without frozen promotion evidence');
    }
  });

  test('pins every checked-in conformance authorization to the actual fixture bytes', async () => {
    for (const rule of DETERMINISTIC_QA_REGISTRY.list()) {
      if (rule.promotion?.basis !== 'conformance') continue;
      const bytes = await Bun.file(rule.promotion.fixturePath).arrayBuffer();
      const actual = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
      expect(actual, `${rule.id}: ${rule.promotion.fixturePath}`).toBe(
        rule.promotion.evidenceSha256,
      );
    }
  });

  test('rejects unstable or duplicate rule ids', () => {
    expect(() => new QaRegistry([rule({ id: 'bad-id', scope: { kind: 'universal' } })])).toThrow();
    const duplicate = rule({ id: 'TEST_DUPLICATE', scope: { kind: 'universal' } });
    expect(() => new QaRegistry([duplicate, duplicate])).toThrow('Duplicate QA rule id');
  });
});

describe('AssetQaReportV1', () => {
  test('keeps all five dimensions separate and marks unrun dimensions notEvaluated', () => {
    const intent = createAssetIntentV1({ category: 'prop' });
    const report = createAssetQaReportV1(intent, {
      evaluatedDimensions: ['exportIntegrity', 'runtimeCost'],
      findings: [
        {
          code: 'TEST_WARNING',
          disposition: 'warn',
          dimension: 'runtimeCost',
          profile: 'test',
          message: 'cost warning',
        },
      ],
    });

    expect(report.disposition).toBe('warn');
    expect(report.dimensions.exportIntegrity.status).toBe('pass');
    expect(report.dimensions.runtimeCost.status).toBe('warn');
    expect(report.dimensions.promptAlignment.status).toBe('notEvaluated');
    expect(report.dimensions.visualQuality.status).toBe('notEvaluated');
    expect(Object.keys(report.dimensions)).toHaveLength(5);
  });

  test('validates stable structured findings', () => {
    expect(isQaFinding(finding('TEST_STABLE_CODE'))).toBe(true);
    expect(isQaFinding({ ...finding('TEST_STABLE_CODE'), code: 'not-stable' })).toBe(false);
  });

  test('represents historical rows honestly as legacy-unassessed', () => {
    const report = createLegacyUnassessedQaReportV1('prop');
    expect(report.disposition).toBe('legacy-unassessed');
    expect(
      Object.values(report.dimensions).every((dimension) => dimension.status === 'notEvaluated'),
    ).toBe(true);
  });
});
