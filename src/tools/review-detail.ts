/**
 * Output-boundary detail for review tool results.
 *
 * A full `kiln_render` result carried about 35k characters of JSON on a modest
 * asset, most of it repeated observe-level QA findings and an 80-path part
 * preview, so a harness with a 25k-token tool-output limit truncated parallel
 * renders. Compact results keep every acceptance field, every warn/block
 * finding, the first finding of each observed code and the complete view
 * fidelity receipts; repeated findings are counted by code. `detail: 'full'`
 * returns the complete result.
 *
 * Compaction never mutates its input and runs only where a result leaves the
 * tool: the retained reviewed artifact (kiln_save, kiln_finish) and Live Review
 * record the complete report before this function sees it.
 */
import { z } from 'zod';

export type ReviewDetail = 'compact' | 'full';

/** Part paths shown in a compact result; kiln_inspect listParts pages the rest. */
export const COMPACT_PART_PREVIEW = 24;
/** Verbatim findings per dimension: warn/block findings, and first findings of observed codes. */
export const COMPACT_FINDINGS_PER_DIMENSION = 12;

export const reviewDetailInput = z
  .enum(['compact', 'full'])
  .optional()
  .describe('compact (default) counts repeated findings; full returns every finding and rule');

/** How to page the part paths a preview left out. */
export const partsHint = (offset: number): string =>
  `For remaining paths use kiln_inspect with image:false and listParts:{offset:${offset}}. listParts.query filters names/paths; follow partListing.nextOffset on the same programRef and query.`;

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function compactDimension(dimension: unknown): unknown {
  if (!isRecord(dimension) || !Array.isArray(dimension.findings)) return dimension;
  const findings: unknown[] = [];
  const omittedByCode: Record<string, number> = {};
  const observedCodes = new Set<string>();
  let actionable = 0;
  let omitted = 0;
  for (const finding of dimension.findings) {
    const code = isRecord(finding) && typeof finding.code === 'string' ? finding.code : 'UNKNOWN';
    let keep: boolean;
    if (isRecord(finding) && finding.disposition === 'observe') {
      keep = !observedCodes.has(code) && observedCodes.size < COMPACT_FINDINGS_PER_DIMENSION;
      if (keep) observedCodes.add(code);
    } else keep = actionable++ < COMPACT_FINDINGS_PER_DIMENSION;
    if (keep) findings.push(finding);
    else {
      omitted++;
      omittedByCode[code] = (omittedByCode[code] ?? 0) + 1;
    }
  }
  if (omitted === 0) return dimension;
  return { ...dimension, findings, findingsOmitted: omitted, omittedByCode };
}

/** Acceptance, dispositions and each finding code stay exact; repeats and rule rows become counts. */
export function compactQaReport(report: unknown): unknown {
  if (!isRecord(report) || !isRecord(report.dimensions)) return report;
  const { dimensions, rules, ...rest } = report;
  const compact: Json = {
    ...rest,
    detail: 'compact',
    dimensions: Object.fromEntries(
      Object.entries(dimensions).map(([name, value]) => [name, compactDimension(value)]),
    ),
  };
  if (Array.isArray(rules)) {
    let evaluated = 0;
    let notRequested = 0;
    const notEvaluated: { id: unknown; reason?: unknown }[] = [];
    for (const rule of rules) {
      if (!isRecord(rule)) continue;
      if (rule.status === 'evaluated') evaluated++;
      else if (rule.status === 'notRequested') notRequested++;
      else notEvaluated.push({ id: rule.id, ...(rule.reason ? { reason: rule.reason } : {}) });
    }
    compact.ruleSummary = { evaluated, notEvaluated, notRequested };
  }
  compact.fullDetail = "Every finding and rule: kiln_render with detail: 'full'.";
  return compact;
}

/** Apply the requested detail to a review tool result. `full` returns the input itself. */
export function compactReviewResult<T>(result: T, detail: ReviewDetail = 'compact'): T {
  if (detail === 'full' || !isRecord(result)) return result;
  const out: Json = { ...result };
  if (out.qaReport !== undefined) out.qaReport = compactQaReport(out.qaReport);
  if (Array.isArray(out.parts) && out.parts.length > COMPACT_PART_PREVIEW) {
    out.parts = out.parts.slice(0, COMPACT_PART_PREVIEW);
    out.partsTruncated = true;
    out.partsNextOffset = COMPACT_PART_PREVIEW;
    out.partsHint = partsHint(COMPACT_PART_PREVIEW);
  }
  return out as T;
}

/** kiln_edit nests the render of the patched program; it takes the compact default too. */
export function compactEditResult<T>(result: T): T {
  if (!isRecord(result) || !isRecord(result.render)) return result;
  return { ...result, render: compactReviewResult(result.render) } as T;
}
