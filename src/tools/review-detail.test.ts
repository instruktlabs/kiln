import { describe, expect, it } from 'bun:test';
import { MemoryProgramStore } from '../program-store';
import { ProgramArtifactStore, type ProgramArtifact } from './program-artifacts';
import { createKilnProgramToolRegistry } from './registry';
import {
  COMPACT_FINDINGS_PER_DIMENSION,
  COMPACT_PART_PREVIEW,
  COMPACT_WARNINGS,
  compactEditResult,
  compactReviewResult,
  DEFAULT_RESULT_LIMIT,
  MAX_RESULT_LIMIT,
  resultCharacters,
  WARNING_CHARS,
} from './review-detail';

/** Typed views of tool JSON for assertions. */
interface QaView {
  [key: string]: unknown;
  detail?: string;
  rules?: unknown;
  dimensions: Record<
    string,
    {
      status: string;
      findings: { code: string; message?: string; count?: number }[];
      findingsTotal?: number;
      findingsOmitted?: number;
      omittedByCode?: Record<string, number>;
      metrics?: unknown;
    }
  >;
}
interface ReviewView {
  ok: boolean;
  width: number;
  parts: unknown[];
  qaReport: { detail?: string; rules?: unknown };
}

const finding = (code: string, disposition: string, message = `${code} message`) => ({
  code,
  disposition,
  dimension: 'visualQuality',
  profile: 'asset.requirements.v1',
  message,
  affected: { nodePath: '/Root[0]/Part[0]' },
  measurement: { name: 'overlap', actual: 0.5 },
  viewHints: ['front'],
  repairText: 'Move the part.',
});

const report = () => ({
  kind: 'kiln.asset-qa-report',
  schemaVersion: 2,
  qaProfile: 'asset.requirements.v1',
  policyHash: 'sha256:policy',
  adviceHash: 'sha256:advice',
  acceptance: 'accepted',
  disposition: 'warn',
  dimensions: {
    exportIntegrity: { status: 'pass', findings: [], metrics: { glbBytes: 10 } },
    visualQuality: {
      status: 'warn',
      findings: [
        ...Array.from({ length: 30 }, (_, i) =>
          finding('GEO_PART_SELF_INTERSECTION', 'observe', `pair ${i} overlaps`),
        ),
        finding('GEO_PART_SELF_INTERSECTION_TRUNCATED', 'observe'),
        finding('MATERIAL_BLEND_AREA_BUDGET', 'warn'),
      ],
    },
  },
  rules: [
    { id: 'A', mode: 'enforce', status: 'evaluated' },
    { id: 'B', mode: 'observe', status: 'notEvaluated', reason: 'needs bytes' },
    { id: 'C', mode: 'observe', status: 'notRequested' },
  ],
  unevaluatedRequirements: [],
});

describe('compact review results', () => {
  it('full detail keeps the complete report and leads with the verdict', () => {
    const result = { ok: true, qaReport: report(), warnings: [] };
    const full = compactReviewResult(result, 'full') as Record<string, unknown>;
    expect(Object.keys(full).slice(0, 6)).toEqual([
      'ok',
      'acceptance',
      'disposition',
      'blockers',
      'findings',
      'next',
    ]);
    // The report itself is the input's: nothing grouped, nothing dropped.
    expect(full.qaReport).toBe(result.qaReport);
    expect(full.retainedReport).toBeUndefined();
    expect(
      (
        compactReviewResult(result, 'full', {
          retainedReport: () => ({
            operationId: 'op_1',
            path: '.kiln/review/op_1/evaluation.json',
          }),
        }) as unknown as { retainedReport: unknown }
      ).retainedReport,
    ).toEqual({ operationId: 'op_1', path: '.kiln/review/op_1/evaluation.json' });
  });

  it('groups repeated findings by code, most severe first, and keeps acceptance', () => {
    const full = report();
    const compact = compactReviewResult({ ok: true, qaReport: full, warnings: [] }) as unknown as {
      acceptance: string;
      disposition: string;
      blockers: unknown[];
      findings: Record<string, number>;
      next: string;
      qaReport: Record<string, unknown>;
    };
    expect(compact.acceptance).toBe('accepted');
    expect(compact.disposition).toBe('warn');
    expect(compact.blockers).toEqual([]);
    expect(compact.findings).toEqual({ block: 0, warn: 1, observe: 31 });
    expect(compact.next).toContain('kiln_edit');
    const qa = compact.qaReport as QaView;
    expect(qa.detail).toBe('compact');
    for (const key of ['kind', 'schemaVersion', 'policyHash', 'acceptance', 'disposition'])
      expect(qa[key]).toEqual((full as Record<string, unknown>)[key]);
    const visual = qa.dimensions.visualQuality!;
    expect(visual.status).toBe('warn');
    // One record per code, the warning first, each with the first finding's fields and a count.
    const source = full.dimensions.visualQuality.findings;
    expect(visual.findings).toEqual([
      { ...source[31]!, count: 1 },
      { ...source[0]!, count: 30 },
      { ...source[30]!, count: 1 },
    ]);
    expect(visual.findingsTotal).toBe(32);
    expect(visual.findingsOmitted).toBeUndefined();
    // A dimension with nothing to group is returned exactly.
    expect(qa.dimensions.exportIntegrity).toEqual(full.dimensions.exportIntegrity);
    expect(qa.rules).toBeUndefined();
    // Rules that were not requested are not news; the ones not evaluated are.
    expect(qa.ruleSummary).toEqual({
      evaluated: 1,
      notEvaluated: [{ id: 'B', reason: 'needs bytes' }],
    });
    expect(JSON.stringify(qa)).not.toContain('notRequested');
    expect(qa.fullDetail).toContain("detail: 'full'");
    // The input is never mutated: retained artifacts keep the complete report.
    expect(full.dimensions.visualQuality.findings).toHaveLength(32);
  });

  it('names more affected entities per code and leads with the blockers', () => {
    const full = report();
    full.dimensions.visualQuality.findings = ['A', 'B', 'C', 'D'].map((node) => ({
      ...finding('PART_EMBEDDED', 'block'),
      affected: { nodePath: `/Root[0]/${node}[0]` },
    }));
    const compact = compactReviewResult({ ok: true, qaReport: full }) as unknown as {
      blockers: Record<string, unknown>[];
      next: string;
      qaReport: QaView;
    };
    const [group] = compact.qaReport.dimensions.visualQuality!.findings as Record<
      string,
      unknown
    >[];
    expect(group!['count']).toBe(4);
    expect(group!['affected']).toEqual({ nodePath: '/Root[0]/A[0]' });
    expect(group!['alsoAffected']).toEqual(['/Root[0]/B[0]', '/Root[0]/C[0]']);
    expect(compact.blockers).toEqual([
      {
        code: 'PART_EMBEDDED',
        dimension: 'visualQuality',
        count: 4,
        message: 'PART_EMBEDDED message',
        affected: { nodePath: '/Root[0]/A[0]' },
        alsoAffected: ['/Root[0]/B[0]', '/Root[0]/C[0]'],
        repairText: 'Move the part.',
      },
    ]);
    expect(compact.next).toContain('4 blocking findings');
  });

  it('bounds the finding groups per dimension and counts the rest', () => {
    const full = report();
    full.dimensions.visualQuality.findings = Array.from(
      { length: COMPACT_FINDINGS_PER_DIMENSION + 3 },
      (_, i) => finding(`CODE_${i}`, i % 3 ? 'warn' : 'block'),
    );
    const qa = (compactReviewResult({ ok: true, qaReport: full }) as { qaReport: QaView }).qaReport;
    const visual = qa.dimensions.visualQuality!;
    expect(visual.findings).toHaveLength(COMPACT_FINDINGS_PER_DIMENSION);
    // Most severe first: every block code is kept ahead of the warnings.
    expect(visual.findings.slice(0, 5).map((entry) => entry.code)).toEqual([
      'CODE_0',
      'CODE_3',
      'CODE_6',
      'CODE_9',
      'CODE_12',
    ]);
    expect(visual.findingsOmitted).toBe(3);
    expect(Object.keys(visual.omittedByCode!)).toHaveLength(3);
  });

  it('lean keeps the verdict, the metrics and the fidelity receipt and nothing else', () => {
    const lean = compactReviewResult(
      {
        ok: true,
        qaReport: report(),
        warnings: ['w1', 'w2', 'w3', 'w4', 'w5'],
        tris: 10,
        bbox: { min: [0, 0, 0], max: [1, 1, 1] },
        parts: [{ path: '/R[0]', name: 'R' }],
        partsTotal: 1,
        requirements: { binding: null },
        viewFidelity: { delivered: 'geometry-flat', materialFaithful: false, inputGlbSha256: 'x' },
        viewEvidence: { current: { a: 1 }, lastFaithful: { b: 2 } },
      },
      'lean',
    ) as Record<string, unknown>;
    expect(Object.keys(lean)).toEqual([
      'ok',
      'acceptance',
      'disposition',
      'blockers',
      'findings',
      'next',
      'tris',
      'bbox',
      'viewFidelity',
      'warnings',
      'warningsOmitted',
      'partsTotal',
      'detail',
      'fullDetail',
    ]);
    expect(lean.warnings).toEqual(['w1', 'w2', 'w3']);
    expect(lean.warningsOmitted).toBe(2);
    expect(lean.viewFidelity).toEqual({ delivered: 'geometry-flat', materialFaithful: false });
  });

  it('compact keeps the current view evidence and the hash-only lastFaithful reference', () => {
    const compact = compactReviewResult({
      ok: true,
      warnings: [],
      viewEvidence: {
        version: 'kiln.view-evidence-history.v1',
        current: { a: 1 },
        lastFaithful: { b: 2 },
        faithfulHistory: [{ b: 2 }, { c: 3 }],
      },
    }) as { viewEvidence: unknown };
    expect(compact.viewEvidence).toEqual({ current: { a: 1 }, lastFaithful: { b: 2 } });
    const degraded = compactReviewResult({
      ok: true,
      warnings: [],
      viewEvidence: {
        version: 'kiln.view-evidence-history.v1',
        current: { a: 1 },
        faithfulHistory: [],
      },
    }) as { viewEvidence: unknown };
    expect(degraded.viewEvidence).toEqual({ current: { a: 1 } });
  });

  it('bounds the part preview and points at the next page', () => {
    const parts = Array.from({ length: 80 }, (_, i) => ({ path: `/R[0]/P${i}[0]`, name: `P${i}` }));
    const compact = compactReviewResult({
      ok: true,
      parts,
      partsTotal: 120,
      partsTruncated: true,
      partsNextOffset: 80,
      partsHint: 'old hint listParts:{offset:80}',
      warnings: [],
    }) as {
      parts: unknown[];
      partsTotal: number;
      partsTruncated: boolean;
      partsNextOffset: number;
      partsHint: string;
    };
    expect(compact.parts).toHaveLength(COMPACT_PART_PREVIEW);
    expect(compact.partsTotal).toBe(120);
    expect(compact.partsTruncated).toBe(true);
    expect(compact.partsNextOffset).toBe(COMPACT_PART_PREVIEW);
    expect(compact.partsHint).toContain(`offset:${COMPACT_PART_PREVIEW}`);
  });

  it('keeps short previews exact', () => {
    const parts = [{ path: '/R[0]', name: 'R' }];
    const result = { ok: true, parts, partsTotal: 1, partsTruncated: false, warnings: [] };
    expect(compactReviewResult(result)).toEqual(result);
  });

  it('compact bounds the build warnings by count and by length', () => {
    const warnings = Array.from({ length: COMPACT_WARNINGS + 6 }, (_, i) =>
      `${i}:`.padEnd(WARNING_CHARS + 500, 'x'),
    );
    const compact = compactReviewResult({ ok: true, warnings }) as unknown as {
      warnings: string[];
      warningsOmitted: number;
    };
    expect(compact.warnings).toHaveLength(COMPACT_WARNINGS);
    expect(compact.warningsOmitted).toBe(6);
    for (const [i, warning] of compact.warnings.entries()) {
      expect(warning.startsWith(`${i}:`)).toBe(true);
      expect(warning.length).toBeLessThan(WARNING_CHARS + 40);
      expect(warning).toContain('… (+500 chars)');
    }
    // Short lists stay exact.
    expect(
      (compactReviewResult({ ok: true, warnings: ['a', 'b'] }) as { warnings: string[] }).warnings,
    ).toEqual(['a', 'b']);
    expect(compactReviewResult({ ok: true, warnings: ['a'] })).not.toHaveProperty(
      'warningsOmitted',
    );
  });

  it('full shrinks the warnings before the findings when the hard limit needs it', () => {
    const warnings = Array.from({ length: 300 }, (_, i) => `${i}:`.padEnd(400, 'w'));
    const full = compactReviewResult(
      { ok: true, qaReport: report(), warnings },
      'full',
    ) as unknown as {
      warnings: string[];
      warningsOmitted: number;
      qaReport: QaView & { detail?: string; rules?: unknown };
    };
    expect(resultCharacters(full)).toBeLessThanOrEqual(MAX_RESULT_LIMIT);
    expect(full.warnings).toHaveLength(COMPACT_WARNINGS);
    expect(full.warningsOmitted).toBe(300 - COMPACT_WARNINGS);
    // The findings and rules of a small report survive whole.
    expect(full.qaReport.dimensions.visualQuality!.findings).toHaveLength(
      report().dimensions.visualQuality.findings.length,
    );
    expect(full.qaReport.rules).toBeDefined();
  });

  it('keeps the view fidelity summary exactly and each receipt as what differs from it', () => {
    // f13 (Claude Code chariot, 1 October 2026): a six-shot compact edit of 22,417 characters
    // carried 4,672 of per-view receipts, each repeating the summary's fidelity fields and the
    // camera that cameraShots states under the same name.
    const camera = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], fovDeg: 40 };
    const receipt = (label: string, extra: Record<string, unknown> = {}) => ({
      version: 'kiln.view-fidelity.v1',
      derivativeLabel: label,
      camera,
      cameraFidelity: 'engine-resolved',
      captureCache: { hit: false, reused: 0, total: 1 },
      requested: 'auto',
      delivered: 'geometry-flat',
      materialFaithful: false,
      exactArtifact: false,
      rendererId: 'cpu-raster',
      inputGlbSha256: 'sha256:same',
      degraded: false,
      ...extra,
    });
    const result = {
      ok: true,
      warnings: [],
      viewFidelity: {
        version: 'kiln.view-fidelity.v1',
        requested: 'auto',
        delivered: 'geometry-flat',
        materialFaithful: false,
        exactArtifact: false,
        rendererId: 'cpu-raster',
        inputGlbSha256: 'sha256:same',
        degraded: false,
        reasonCodes: ['IN_LOOP_BUILD_NOT_PERSISTED'],
      },
      cameraShots: [
        { name: 'a', camera, visibility: 'context' },
        { name: 'b', camera, visibility: 'context' },
      ],
      derivativeReceipts: [
        receipt('a'),
        receipt('b', { degraded: true, degradeReason: 'deadline', delivered: 'geometry-flat' }),
      ],
    };
    const compact = compactReviewResult(result) as unknown as typeof result;
    // The summary is the model-visible ViewFidelityV1 contract; compaction never edits it.
    expect(compact.viewFidelity).toEqual(result.viewFidelity);
    expect(compact.cameraShots).toEqual(result.cameraShots);
    expect(compact.derivativeReceipts).toEqual([
      {
        derivativeLabel: 'a',
        cameraFidelity: 'engine-resolved',
        captureCache: { hit: false, reused: 0, total: 1 },
      },
      {
        derivativeLabel: 'b',
        cameraFidelity: 'engine-resolved',
        captureCache: { hit: false, reused: 0, total: 1 },
        degraded: true,
        degradeReason: 'deadline',
      },
    ] as unknown as typeof result.derivativeReceipts);
    const lean = compactReviewResult(result, 'lean') as unknown as typeof result;
    expect(lean.derivativeReceipts).toEqual(compact.derivativeReceipts);
    const full = compactReviewResult(result, 'full') as unknown as typeof result;
    expect(full.derivativeReceipts).toEqual(result.derivativeReceipts);

    // Shot and animation results carry the receipts inside the summary (f13's lean animation
    // result of 8,475 characters held 3,678 of them); the same rule applies there.
    const nested = {
      ok: true,
      viewFidelity: {
        version: 'kiln.derivative-review-fidelity.v1',
        requested: 'auto',
        delivered: 'geometry-flat',
        materialFaithful: false,
        exactArtifact: false,
        degraded: true,
        receipts: [receipt('a'), receipt('b', { degraded: true, degradeReason: 'deadline' })],
      },
    };
    // A field every receipt carries with one value (the renderer, the posed hash) is stated
    // once, on the summary: nine receipts of c37 each repeated an 85-character renderer id.
    for (const detail of ['compact', 'lean'] as const) {
      const { viewFidelity } = compactReviewResult(nested, detail) as unknown as typeof nested & {
        viewFidelity: { rendererId?: string; inputGlbSha256?: string };
      };
      expect(viewFidelity.rendererId).toBe('cpu-raster');
      expect(viewFidelity.receipts).toEqual([
        {
          derivativeLabel: 'a',
          cameraFidelity: 'engine-resolved',
          captureCache: { hit: false, reused: 0, total: 1 },
          degraded: false,
        },
        {
          derivativeLabel: 'b',
          cameraFidelity: 'engine-resolved',
          captureCache: { hit: false, reused: 0, total: 1 },
          degradeReason: 'deadline',
        },
      ] as unknown as typeof nested.viewFidelity.receipts);
      expect(viewFidelity.degraded).toBe(true);
      // Lean keeps the summary's fidelity fields and not its hash, as before.
      expect(viewFidelity.inputGlbSha256).toBe(detail === 'compact' ? 'sha256:same' : undefined);
    }
    expect(compactReviewResult(nested, 'full')).toEqual(nested);
  });

  // c37 (Claude Code Trojan soldier, Opus 5.5, 1 October 2026): a default animation result of
  // 24,223 characters for nine frame times, one custom shot and two measured parts. The shot
  // was repeated per frame (5,666), every number carried 17 digits (4,346 of the total), the
  // `lastFaithful` reference repeated `current` (900) and each receipt the renderer id.
  const soldierCamera = {
    version: 'kiln.camera.v1',
    projection: 'orthographic',
    position: [-5.571529363434595, 2.218511091590594, 3.4934024286978786],
    target: [0.020724887295280714, 1.0799009502757115, 0.26471293166215615],
    up: [0.15038373318043533, 0.9848077530122084, -0.08682408883346518],
    aspect: 1,
    near: 3.2784972368060736,
    far: 10.835491710418221,
    halfHeight: 1.6630639070301758,
  };
  const posed = (i: number) => ({
    min: [-0.4124558048328256 - i * 0.01, 2.2306171937325203e-8, -0.203750004991889],
    max: [0.30097457448828496, 1.9127075120641193 + i * 0.01, 0.8694816053177239],
  });
  const animation = (frames: number, parts: number) => {
    const shots = Array.from({ length: frames }, (_, i) => ({
      name: 'Trojan soldier',
      camera: soldierCamera,
      subject: { path: '/Trojan%20soldier[0]', name: 'Trojan soldier', bounds: posed(i) },
      visibility: 'context',
    }));
    const receipt = (i: number) => ({
      version: 'kiln.view-fidelity.v1',
      derivativeLabel: `${Math.round((100 * i) / (frames - 1))}%`,
      camera: soldierCamera,
      cameraFidelity: 'echo-validated',
      captureCache: { hit: false, reused: 0, total: 1 },
      requested: 'full-preferred',
      delivered: 'full-material',
      materialFaithful: true,
      exactArtifact: false,
      degraded: false,
      rendererId: 'dawn-d3d12:nvidia-geforce-rtx-3070:D3D12 driver version 32.0.16.1074',
      inputGlbSha256: `sha256:${String(i).repeat(64)}`,
    });
    return {
      ok: true,
      frames,
      cameraShots: shots,
      poseBounds: Array.from({ length: frames }, (_, i) => ({
        phase: i / (frames - 1),
        timeSeconds: (1.1 * i) / (frames - 1),
        scene: posed(i),
        parts: Array.from({ length: parts }, (_, p) => ({
          path: `/Trojan%20soldier[0]/TrojanSoldier[0]/Joint_hips[0]/Joint_hip_${p}[0]/Joint_knee_${p}[0]/Joint_ankle_${p}[0]/Mesh_foot_${p}[0]`,
          name: `Mesh_foot_${p}`,
          bounds: posed(i + p),
          origin: [0.095 * p, 0.08500002878599466, 0.14999999282662274],
        })),
      })),
      viewFidelity: {
        version: 'kiln.derivative-review-fidelity.v1',
        requested: 'full-preferred',
        delivered: 'full-material',
        materialFaithful: true,
        exactArtifact: false,
        degraded: false,
        receipts: shots.map((_, i) => receipt(i)),
      },
      viewEvidence: {
        version: 'kiln.view-evidence-history.v1',
        current: {
          sequence: 2,
          surface: 'kiln_screenshot_animation',
          materialFaithful: true,
          inputGlbSha256: shots.map((_, i) => `sha256:${String(i).repeat(64)}`),
        },
        lastFaithful: {
          version: 'kiln.faithful-view-evidence-ref.v1',
          sequence: 2,
          surface: 'kiln_screenshot_animation',
          inputGlbSha256: shots.map((_, i) => `sha256:${String(i).repeat(64)}`),
        },
        faithfulHistory: [],
      },
      warnings: [] as string[],
    };
  };

  it('states a shared animation shot once, rounds to six decimals and drops the evidence repeat', () => {
    const source = animation(9, 1);
    for (const detail of ['compact', 'lean'] as const) {
      const out = compactReviewResult(source, detail) as unknown as {
        cameraShots: Record<string, unknown>[];
        poseBounds: { scene: { min: number[] }; parts: { origin: number[] }[] }[];
        viewFidelity: { rendererId?: string; receipts: Record<string, unknown>[] };
        viewEvidence?: Record<string, unknown>;
      };
      // One resolved shot for the nine frames; poseBounds carries each frame's bounds.
      expect(out.cameraShots).toEqual([
        {
          name: 'Trojan soldier',
          camera: {
            ...soldierCamera,
            position: [-5.571529, 2.218511, 3.493402],
            target: [0.020725, 1.079901, 0.264713],
            up: [0.150384, 0.984808, -0.086824],
            near: 3.278497,
            far: 10.835492,
            halfHeight: 1.663064,
          },
          subject: { path: '/Trojan%20soldier[0]', name: 'Trojan soldier' },
          visibility: 'context',
          frames: 9,
        },
      ]);
      expect(out.poseBounds).toHaveLength(9);
      expect(out.poseBounds[0]!.scene.min).toEqual([-0.412456, 0, -0.20375]);
      expect(out.poseBounds[0]!.parts[0]!.origin).toEqual([0, 0.085, 0.15]);
      expect(JSON.stringify(out)).not.toMatch(/\d\.\d{7}|e-\d/u);
      expect(out.viewFidelity.rendererId).toContain('dawn-d3d12');
      expect(out.viewFidelity.receipts[1]).toEqual({
        derivativeLabel: '13%',
        cameraFidelity: 'echo-validated',
        captureCache: { hit: false, reused: 0, total: 1 },
        inputGlbSha256: `sha256:${'1'.repeat(64)}`,
      });
      expect(resultCharacters(out)).toBeLessThan(resultCharacters(source) / 2);
    }
    const compact = compactReviewResult(source) as unknown as { viewEvidence: unknown };
    expect(compact.viewEvidence).toEqual({ current: source.viewEvidence.current });
    // An earlier faithful view is still named.
    const earlier = animation(2, 1);
    earlier.viewEvidence.lastFaithful.sequence = 1;
    expect(
      (compactReviewResult(earlier) as unknown as { viewEvidence: { lastFaithful?: unknown } })
        .viewEvidence.lastFaithful,
    ).toEqual(earlier.viewEvidence.lastFaithful);
    // Full keeps every frame, every digit and the evidence as they were.
    const full = compactReviewResult(source, 'full') as unknown as typeof source;
    expect(full.cameraShots).toBe(source.cameraShots);
    expect(full.poseBounds).toBe(source.poseBounds);
    expect(full.viewEvidence).toBe(source.viewEvidence);
    // Distinct shots of a static capture stay as they are, bounds included.
    const grid = compactReviewResult({
      ok: true,
      cameraShots: [0, 1].map((i) => ({ ...animation(2, 1).cameraShots[i]!, name: `shot ${i}` })),
    }) as unknown as { cameraShots: { subject: { bounds?: unknown }; frames?: number }[] };
    expect(grid.cameraShots).toHaveLength(2);
    expect(grid.cameraShots[0]!.subject.bounds).toBeDefined();
    expect(grid.cameraShots[0]!.frames).toBeUndefined();
  });

  it('bounds the pose frames when a result would pass its limit, and says what was left out', () => {
    // Nine frame times and sixteen measured parts, the schema's maximum of each.
    const source = animation(9, 16);
    expect(resultCharacters(source)).toBeGreaterThan(MAX_RESULT_LIMIT);
    for (const detail of ['compact', 'lean'] as const) {
      const out = compactReviewResult(source, detail) as unknown as {
        poseBounds: unknown[];
        poseBoundsOmitted?: number;
        poseBoundsHint?: string;
      };
      expect(resultCharacters(out)).toBeLessThanOrEqual(DEFAULT_RESULT_LIMIT);
      expect(out.poseBounds.length).toBeGreaterThan(0);
      expect(out.poseBounds.length).toBeLessThan(9);
      expect(out.poseBoundsOmitted).toBe(9 - out.poseBounds.length);
      expect(out.poseBoundsHint).toContain("detail: 'full'");
    }
    const full = compactReviewResult(source, 'full', {
      retainedReport: () => ({ operationId: 'op_9', path: '.kiln/review/op_9/evaluation.json' }),
    }) as unknown as { poseBounds: unknown[]; poseBoundsOmitted?: number; poseBoundsHint?: string };
    expect(resultCharacters(full)).toBeLessThanOrEqual(MAX_RESULT_LIMIT);
    expect(full.poseBounds.length + full.poseBoundsOmitted!).toBe(9);
    expect(full.poseBoundsHint).toContain('.kiln/review/op_9/evaluation.json');
    // A result that fits keeps every frame and says nothing.
    expect(compactReviewResult(animation(9, 1))).not.toHaveProperty('poseBoundsOmitted');
  });
});

describe('compact edit results', () => {
  // The f07 live session of 1 October 2026: 22 parts renamed on a 49-part chariot put the
  // compact edit at 20,069 characters, 7,191 of them the comparison with bounds per change.
  const bounds = () => ({
    min: [0.73, 0.4, -0.36],
    max: [0.76, 0.52, -0.24],
    size: [0.03, 0.11, 0.12],
  });
  const comparison = () => ({
    version: 'kiln.revision-comparison.v1',
    scope: 'Exact exported static mesh data and rest transforms; named hierarchy paths. '.repeat(6),
    animation: {
      scope: 'Exact exported channel target.'.repeat(8),
      summary: { added: 0, removed: 0, changed: 0, unchanged: 2 },
      changes: [],
      offset: 0,
      nextOffset: null,
    },
    units: 'asset units',
    before: { glbSha256: 'sha256:before', bounds: bounds(), scenePath: '/Chariot[0]' },
    after: { glbSha256: 'sha256:after', bounds: bounds(), scenePath: '/Chariot[0]' },
    summary: { added: 22, removed: 22, changed: 1, unchanged: 27 },
    changes: Array.from({ length: 12 }, (_, i) => ({
      path: `/Chariot[0]/wheel[0]/Mesh_Band${i}[0]`,
      beforePath: `/Chariot[0]/wheel[0]/Mesh_Band${i}[0]`,
      afterPath: i === 0 ? `/Chariot[0]/wheel[0]/Mesh_Band${i}[0]` : null,
      name: `Mesh_Band${i}`,
      status: i === 0 ? 'changed' : 'removed',
      fields: i === 0 ? ['position'] : [],
      beforeBounds: bounds(),
      afterBounds: i === 0 ? bounds() : null,
    })),
    offset: 0,
    nextOffset: 12,
  });
  const edited = () => ({
    programRef: 'p_after',
    parentRef: 'p_before',
    ok: true,
    applied: [{ occurrences: 1 }],
    diff: '-a\n+b\n'.repeat(400),
    preservation: { status: 'compared', comparison: comparison() },
    render: { ok: true, qaReport: report(), warnings: [] as string[] },
  });

  it('compact keeps the comparison counts and the changed paths without the per-part bounds', () => {
    const compact = compactEditResult(edited()) as unknown as {
      changed: { status: string; parts: unknown; changed: string[] };
      preservation: { status: string; comparison: Record<string, unknown> };
    };
    expect(compact.changed.status).toBe('compared');
    expect(compact.changed.parts).toEqual({ added: 22, removed: 22, changed: 1, unchanged: 27 });
    expect(compact.changed.changed).toHaveLength(5);
    const kept = compact.preservation.comparison;
    expect(kept.summary).toEqual({ added: 22, removed: 22, changed: 1, unchanged: 27 });
    expect(kept.before).toEqual(comparison().before);
    expect(kept.after).toEqual(comparison().after);
    expect(kept.nextOffset).toBe(12);
    expect(kept.scope).toBeUndefined();
    expect((kept.animation as Record<string, unknown>).scope).toBeUndefined();
    expect((kept.animation as Record<string, unknown>).summary).toEqual(
      comparison().animation.summary,
    );
    // Each change is its path, its status and the fields that changed: the bounds and the
    // scope prose belong to detail: 'full' and to kiln_inspect compare.
    expect(kept.changes).toEqual([
      {
        path: '/Chariot[0]/wheel[0]/Mesh_Band0[0]',
        name: 'Mesh_Band0',
        status: 'changed',
        fields: ['position'],
      },
      ...Array.from({ length: 11 }, (_, i) => ({
        path: `/Chariot[0]/wheel[0]/Mesh_Band${i + 1}[0]`,
        name: `Mesh_Band${i + 1}`,
        status: 'removed',
      })),
    ]);
    expect(JSON.stringify(compact.preservation).length).toBeLessThan(1_800);
    expect(typeof kept.detail).toBe('string');
    // The input is never mutated, and full keeps the comparison whole.
    const source = edited();
    expect((compactEditResult(source, 'full') as { preservation: unknown }).preservation).toBe(
      source.preservation,
    );
    expect(compactEditResult(edited(), 'lean')).not.toHaveProperty('preservation');
  });

  it('compacts a comparison asked of kiln_inspect the same way, in compact and in lean', () => {
    // f10 (Agy refine, 1 October 2026): a compact `kiln_inspect compare` of 38,952 characters,
    // 32,443 of them a 50-entry page of changes with bounds. The page stays a page; the bounds go.
    const page = {
      ...comparison(),
      programRef: 'p_before',
      changes: Array.from({ length: 50 }, (_, i) => ({
        ...comparison().changes[0]!,
        path: `/Chariot[0]/Mesh_Part${i}[0]`,
        name: `Mesh_Part${i}`,
        status: i % 2 ? 'added' : 'removed',
        fields: [],
      })),
      nextOffset: 50,
    };
    const inspected = { ok: true, programRef: 'p_after', qaReport: report(), comparison: page };
    const compact = compactReviewResult(inspected) as unknown as {
      comparison: Record<string, unknown> & { changes: Record<string, unknown>[] };
    };
    expect(compact.comparison.programRef).toBe('p_before');
    expect(compact.comparison.scope).toBeUndefined();
    expect(compact.comparison.summary).toEqual(page.summary);
    expect(compact.comparison.before).toEqual(page.before);
    expect(compact.comparison.nextOffset).toBe(50);
    expect(compact.comparison.changes).toHaveLength(50);
    expect(compact.comparison.changes[1]).toEqual({
      path: '/Chariot[0]/Mesh_Part1[0]',
      name: 'Mesh_Part1',
      status: 'added',
    });
    expect(JSON.stringify(compact.comparison).length).toBeLessThan(5_500);
    const lean = compactReviewResult(inspected, 'lean') as unknown as { comparison: unknown };
    expect(lean.comparison).toEqual(compact.comparison);
    const full = compactReviewResult(inspected, 'full') as unknown as { comparison: unknown };
    expect(full.comparison).toBe(inspected.comparison);
  });

  it('compact shrinks the diff last so the edit stays inside the default limit', () => {
    const source = edited();
    source.render.warnings = Array.from({ length: COMPACT_WARNINGS }, (_, i) =>
      `${i}:`.padEnd(WARNING_CHARS, 'w'),
    );
    source.diff = '-old line\n+new line\n'.repeat(400); // 8,000 characters, the kiln_edit cap
    const compact = compactEditResult(source) as unknown as {
      diff: string;
      diffOmitted?: number;
      render: { warnings: string[] };
    };
    expect(resultCharacters(compact as unknown as Record<string, unknown>)).toBeLessThanOrEqual(
      DEFAULT_RESULT_LIMIT,
    );
    expect(compact.render.warnings).toHaveLength(COMPACT_WARNINGS);
    expect(compact.diff.length).toBeLessThan(source.diff.length);
    expect(compact.diff.length).toBeGreaterThanOrEqual(2_000);
    expect(compact.diffOmitted).toBe(source.diff.length - compact.diff.length);
    // A short diff is kept whole when the result fits.
    const small = compactEditResult(edited()) as { diff: string; diffOmitted?: number };
    expect(small.diff).toBe(edited().diff);
    expect(small.diffOmitted).toBeUndefined();
  });

  it('full bounds the whole edit inside the hard limit: the diff first, then the comparison', () => {
    // w21 (Agy horse, 1 October 2026): a full edit of 40,533 characters. Its render was bounded
    // at 40,000 on its own; the 8,177-character diff and 10,973-character comparison sat on top.
    const source = edited();
    source.diff = '-old line\n+new line\n'.repeat(400); // 8,000 characters, the kiln_edit cap
    source.preservation.comparison.changes = Array.from({ length: 120 }, (_, i) => ({
      ...comparison().changes[1]!,
      path: `/Chariot[0]/Mesh_Part${i}[0]`,
      beforePath: `/Chariot[0]/Mesh_Part${i}[0]`,
      name: `Mesh_Part${i}`,
    }));
    expect(resultCharacters(source)).toBeGreaterThan(MAX_RESULT_LIMIT);
    const retained = { operationId: 'op_21', path: '.kiln/review/op_21/evaluation.json' };
    const full = compactEditResult(source, 'full', {
      retainedReport: () => retained,
    }) as unknown as {
      diff: string;
      diffOmitted?: number;
      preservation: { comparison: { changes: Record<string, unknown>[]; detail?: string } };
      render: { qaReport: { rules?: unknown }; retainedReport?: unknown };
    };
    expect(resultCharacters(full as unknown as Record<string, unknown>)).toBeLessThanOrEqual(
      MAX_RESULT_LIMIT,
    );
    expect(full.diff).toBe(source.diff.slice(0, 2_000));
    expect(full.diffOmitted).toBe(6_000);
    expect(full.preservation.comparison.changes).toHaveLength(120);
    expect(full.preservation.comparison.changes[0]).toEqual({
      path: '/Chariot[0]/Mesh_Part0[0]',
      name: 'Mesh_Part0',
      status: 'removed',
    });
    expect(full.preservation.comparison.detail).toContain(retained.path);
    // The render kept its complete report: the diff and the comparison were enough.
    expect(Array.isArray(full.render.qaReport.rules)).toBe(true);
    expect(full.render.retainedReport).toEqual(retained);
    // The input is never mutated.
    expect(source.diff).toHaveLength(8_000);
    expect(source.preservation.comparison.changes[0]).toHaveProperty('beforeBounds');
  });
});

describe('review tool detail', () => {
  const stack =
    "const meta = { name: 'Stack', category: 'prop' };\n" +
    'function build() {\n' +
    "  const r = createRoot('Stack');\n" +
    '  for (let i = 0; i < 40; i++)\n' +
    "    createPart('Block' + i, boxGeo(1, 1, 1), gameMaterial(0x888888), { parent: r, position: [i * 0.5, 0.5, 0] });\n" +
    '  return r;\n' +
    '}\n';

  it('is compact by default, full on request, and never compacts the retained artifact', async () => {
    let retained: Omit<ProgramArtifact, 'programRef'> | undefined;
    class Spy extends ProgramArtifactStore {
      override async record(input: Omit<ProgramArtifact, 'programRef'>) {
        retained = input;
        return super.record(input);
      }
    }
    const defs = createKilnProgramToolRegistry({
      programStore: new MemoryProgramStore(),
      programArtifacts: new Spy(),
    });
    const render = defs.find((d) => d.name === 'kiln_render')!;
    const json = (value: unknown) => {
      const { pngBase64: _png, ...rest } = value as Record<string, unknown>;
      return JSON.stringify(rest);
    };
    const compact = (await render.run({ code: stack })) as ReviewView;
    expect(compact.ok).toBe(true);
    expect(compact.qaReport.detail).toBe('compact');
    expect(compact.parts.length).toBeLessThanOrEqual(COMPACT_PART_PREVIEW);
    expect(retained?.review.qaReport).toBeDefined();
    expect((retained!.review.qaReport as { detail?: string }).detail).toBeUndefined();
    expect(Array.isArray((retained!.review.qaReport as { rules?: unknown }).rules)).toBe(true);

    const full = (await render.run({ code: stack, detail: 'full' })) as ReviewView;
    expect(full.qaReport.detail).toBeUndefined();
    expect(Array.isArray(full.qaReport.rules)).toBe(true);
    expect(full.parts.length).toBeGreaterThan(COMPACT_PART_PREVIEW);
    expect(json(compact).length).toBeLessThan(json(full).length / 2);
  }, 60_000); // Two CPU renders of a 40-part program: ~8 s cold on the Windows gate host.

  it('leads with the refs and compacts the render embedded in kiln_edit', async () => {
    const defs = createKilnProgramToolRegistry({ programStore: new MemoryProgramStore() });
    const edit = defs.find((d) => d.name === 'kiln_edit')!;
    const edited = (await edit.run({
      code: stack,
      edits: [{ oldString: 'i * 0.5', newString: 'i * 0.6' }],
    })) as Record<string, unknown> & { render: ReviewView & { partsTruncated?: boolean } };
    expect(edited.ok).toBe(true);
    expect(Object.keys(edited).slice(0, 2)).toEqual(['programRef', 'parentRef']);
    expect(edited.render.qaReport.detail).toBe('compact');
    expect(edited.render.parts.length).toBeLessThanOrEqual(COMPACT_PART_PREVIEW);
    expect(edited.render.partsTruncated).toBe(true);

    const render = defs.find((d) => d.name === 'kiln_render')!;
    const rendered = (await render.run({ programRef: edited.programRef })) as object;
    expect(Object.keys(rendered)[0]).toBe('programRef');
  }, 60_000); // Two CPU renders of a 40-part program plus the edit's static comparison.

  it('compacts animation review results and accepts a frame size', async () => {
    const animated =
      stack.replace("name: 'Stack'", "name: 'Spin'") +
      "function animate() { return [createClip('spin', 1, [rotationTrack('Mesh_Block0', [{ time: 0, rotation: [0, 0, 0] }, { time: 0.5, rotation: [0, 90, 0] }, { time: 1, rotation: [0, 180, 0] }])])]; }\n";
    const defs = createKilnProgramToolRegistry({ programStore: new MemoryProgramStore() });
    const anim = defs.find((d) => d.name === 'kiln_screenshot_animation')!;
    const compact = (await anim.run({ code: animated, clip: 'spin', frames: 2 })) as ReviewView;
    expect(compact.ok).toBe(true);
    expect(compact.qaReport.detail).toBe('compact');
    const larger = (await anim.run({
      code: animated,
      clip: 'spin',
      frames: 2,
      size: 384,
    })) as ReviewView;
    expect(larger.ok).toBe(true);
    expect(larger.width).toBeGreaterThan(compact.width);
    const full = (await anim.run({
      code: animated,
      clip: 'spin',
      frames: 2,
      detail: 'full',
    })) as ReviewView;
    expect(Array.isArray(full.qaReport.rules)).toBe(true);
  }, 60_000); // Three CPU animation reviews: ~10 s cold on the Windows gate host.
});
