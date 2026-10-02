/**
 * Output-boundary detail for review tool results (v1 contract rules 7 and 8).
 *
 * A full `kiln_render` result carried about 35k characters of JSON on a modest
 * asset and 79k on a busy one, most of it the same QA finding repeated per
 * part with the same 300-character repair text, plus an 80-path part preview
 * and a view-evidence history. Codex cuts a result near 40,000 characters and
 * Agy writes anything over about 4,000 to a file the model then reads back.
 *
 * Every detail leads with the signal: `ok`, `acceptance`, `disposition`, the
 * blocking findings, the finding counts and the next call. `compact` (the
 * default) then groups repeated findings by code with the repair text once,
 * keeps every acceptance field, every rule that was not evaluated, the current
 * view-fidelity receipt, a bounded part preview and bounded build warnings.
 * `lean` keeps the signal, the metrics and the fidelity receipt and nothing
 * else. Both state a shot shared by every frame once, round every number to
 * six decimals and keep the sampled frames inside the default limit. `full`
 * keeps every finding, rule, part, frame and digit that fits the hard limit
 * and names the retained report file for the rest.
 *
 * Compaction never mutates its input and runs only where a result leaves the
 * tool: the retained reviewed artifact (kiln_save, kiln_finish) and Live Review
 * record the complete report before this function sees it.
 */
import { z } from 'zod';

export type ReviewDetail = 'lean' | 'compact' | 'full';

/** Part paths shown in a compact result; kiln_inspect listParts pages the rest. */
export const COMPACT_PART_PREVIEW = 24;
/** Finding groups per dimension in a compact result, most severe first. */
export const COMPACT_FINDINGS_PER_DIMENSION = 12;
/** Blocking findings named at the top of a result. */
export const LEAD_BLOCKERS = 8;
/** Build warnings kept verbatim in a lean result. */
export const LEAN_WARNINGS = 3;
/** Build warnings kept in a compact result, and the characters each keeps. */
export const COMPACT_WARNINGS = 12;
export const WARNING_CHARS = 1_000;
/** Rule 7: the default result size, and the size no detail value may exceed. */
export const DEFAULT_RESULT_LIMIT = 20_000;
export const MAX_RESULT_LIMIT = 40_000;
/** Decimals a compact or lean number keeps: a micrometre on a metre-scale asset. */
export const COMPACT_DECIMALS = 6;

export const reviewDetailInput = z
  .enum(['lean', 'compact', 'full'])
  .optional()
  .describe(
    'compact (default) groups findings by code; lean: verdict, blockers, metrics only; full: every finding, rule and part plus the retained report path',
  );

/** The detail a call asked for, else the host default, else compact. */
export function requestedDetail(input: unknown, fallback: ReviewDetail = 'compact'): ReviewDetail {
  const detail = (input as { detail?: unknown } | null)?.detail;
  return detail === 'full' || detail === 'lean' || detail === 'compact' ? detail : fallback;
}

/** How to page the part paths a preview left out. */
export const partsHint = (offset: number): string =>
  `For remaining paths use kiln_inspect with image:false and listParts:{offset:${offset}}. listParts.query filters names/paths; follow partListing.nextOffset on the same programRef and query.`;

/** Where the complete report of this operation was written, when a host retains one. */
export interface RetainedReport {
  operationId: string;
  /** Relative to the workspace root; pretty-printed so line-based file tools can read it. */
  path: string;
}

export interface DetailOptions {
  /** The current observation, when the host records one (`LiveReviewPort.currentOperation`). */
  retainedReport?: () => RetainedReport | undefined;
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const SEVERITY: Record<string, number> = { block: 0, warn: 1, observe: 2 };
const severity = (finding: unknown): number =>
  (isRecord(finding) && typeof finding.disposition === 'string' && SEVERITY[finding.disposition]) ||
  (isRecord(finding) && finding.disposition === 'block' ? 0 : 3);

/** The node, material, texture or clip a finding names, for the grouped examples. */
function affectedLabel(finding: Json): string | undefined {
  const affected = finding.affected;
  if (!isRecord(affected)) return undefined;
  for (const key of ['nodePath', 'node', 'material', 'texture', 'clip', 'track', 'attribute'])
    if (typeof affected[key] === 'string') return affected[key] as string;
  return undefined;
}

export interface FindingGroup extends Json {
  code: string;
  count: number;
}

/**
 * One record per code: the first finding verbatim (message, repair text,
 * measurement and the first affected entity), the number of findings behind it
 * and up to two more affected entities. Most severe first, else first seen.
 */
export function groupFindings(findings: readonly unknown[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const finding of findings) {
    if (!isRecord(finding)) continue;
    const code = typeof finding.code === 'string' ? finding.code : 'UNKNOWN';
    const label = affectedLabel(finding);
    const group = groups.get(code);
    if (!group) {
      groups.set(code, { ...finding, code, count: 1 });
      continue;
    }
    group.count++;
    if (label && label !== affectedLabel(group)) {
      const more = Array.isArray(group.alsoAffected) ? (group.alsoAffected as string[]) : [];
      if (more.length < 2 && !more.includes(label)) group.alsoAffected = [...more, label];
    }
  }
  return [...groups.values()].sort((a, b) => severity(a) - severity(b));
}

/** Findings by disposition across every dimension of a report. */
export function countFindings(report: unknown): { block: number; warn: number; observe: number } {
  const counts = { block: 0, warn: 0, observe: 0 };
  if (!isRecord(report) || !isRecord(report.dimensions)) return counts;
  for (const dimension of Object.values(report.dimensions)) {
    if (!isRecord(dimension) || !Array.isArray(dimension.findings)) continue;
    for (const finding of dimension.findings) {
      const disposition = isRecord(finding) ? finding.disposition : undefined;
      if (disposition === 'block' || disposition === 'warn' || disposition === 'observe')
        counts[disposition]++;
    }
  }
  return counts;
}

/** The blocking findings, grouped by code and dimension, that lead a result. */
export function leadBlockers(report: unknown): Json[] {
  if (!isRecord(report) || !isRecord(report.dimensions)) return [];
  const blockers: Json[] = [];
  for (const [name, dimension] of Object.entries(report.dimensions)) {
    if (!isRecord(dimension) || !Array.isArray(dimension.findings)) continue;
    for (const group of groupFindings(dimension.findings)) {
      if (group.disposition !== 'block') continue;
      blockers.push({
        code: group.code,
        dimension: name,
        count: group.count,
        message: group.message,
        ...(group.affected !== undefined ? { affected: group.affected } : {}),
        ...(group.alsoAffected !== undefined ? { alsoAffected: group.alsoAffected } : {}),
        ...(group.repairText !== undefined ? { repairText: group.repairText } : {}),
      });
    }
  }
  return blockers;
}

function compactDimension(dimension: unknown, limit = COMPACT_FINDINGS_PER_DIMENSION): unknown {
  if (!isRecord(dimension) || !Array.isArray(dimension.findings)) return dimension;
  const groups = groupFindings(dimension.findings);
  const kept = groups.slice(0, limit);
  const dropped = groups.slice(limit);
  const out: Json = { ...dimension, findings: kept };
  if (dimension.findings.length !== kept.length) out.findingsTotal = dimension.findings.length;
  if (dropped.length) {
    out.findingsOmitted = dropped.reduce((sum, group) => sum + group.count, 0);
    out.omittedByCode = Object.fromEntries(dropped.map((group) => [group.code, group.count]));
  }
  return out;
}

/**
 * Acceptance, dispositions and each finding code stay exact; repeats become
 * counts. The rule records collapse to a summary unless `keepRules` asks for
 * them whole, as a bounded full result does.
 */
export function compactQaReport(
  report: unknown,
  limit = COMPACT_FINDINGS_PER_DIMENSION,
  keepRules = false,
): unknown {
  if (!isRecord(report) || !isRecord(report.dimensions)) return report;
  const { dimensions, rules, ...rest } = report;
  const compact: Json = {
    ...rest,
    detail: 'compact',
    dimensions: Object.fromEntries(
      Object.entries(dimensions).map(([name, value]) => [name, compactDimension(value, limit)]),
    ),
  };
  if (keepRules && rules !== undefined) compact.rules = rules;
  else if (Array.isArray(rules)) {
    let evaluated = 0;
    const notEvaluated: { id: unknown; reason?: unknown }[] = [];
    for (const rule of rules) {
      if (!isRecord(rule)) continue;
      if (rule.status === 'evaluated') evaluated++;
      else if (rule.status !== 'notRequested')
        notEvaluated.push({ id: rule.id, ...(rule.reason ? { reason: rule.reason } : {}) });
    }
    compact.ruleSummary = { evaluated, notEvaluated };
  }
  compact.fullDetail = "Every finding and rule: detail: 'full'.";
  return compact;
}

/** The sentence that names the next call for a reviewed result. */
export function nextStep(result: Json): string {
  if (result.ok === false) {
    if (
      typeof result.error === 'string' &&
      /GPU render|render service|renderer/u.test(result.error)
    )
      return 'The source may be fine; the renderer is not. Set KILN_RENDER=auto (CLI --render auto) for CPU geometry views, or repair the render service and call kiln_renderer { action: "reprobe" }, then kiln_render this programRef again.';
    return 'Fix the error in the source: kiln_edit with this programRef, or kiln_render with corrected code.';
  }
  const report = result.qaReport;
  const counts = countFindings(report);
  if (counts.block)
    return `Fix the ${counts.block} blocking finding${counts.block === 1 ? '' : 's'} with kiln_edit on this programRef, then kiln_render again.`;
  if (counts.warn)
    return 'Review the warnings; fix what matters with kiln_edit on this programRef, or kiln_save it when accepted.';
  return 'kiln_save this programRef when done, or kiln_edit to refine.';
}

/** Rule 8: the fields a reader needs first, in order, ahead of everything else. */
function lead(result: Json): Json {
  const report = isRecord(result.qaReport) ? result.qaReport : undefined;
  const {
    ok,
    acceptance: _acceptance,
    disposition: _disposition,
    blockers: _blockers,
    findings: _findings,
    next: _next,
    ...rest
  } = result;
  const blockers = leadBlockers(report);
  return {
    ok,
    ...(report && typeof report.acceptance === 'string' ? { acceptance: report.acceptance } : {}),
    ...(report && typeof report.disposition === 'string'
      ? { disposition: report.disposition }
      : {}),
    ...(report
      ? {
          blockers: blockers.slice(0, LEAD_BLOCKERS),
          ...(blockers.length > LEAD_BLOCKERS
            ? { blockersOmitted: blockers.length - LEAD_BLOCKERS }
            : {}),
          findings: countFindings(report),
        }
      : {}),
    ...(report || ok === false ? { next: nextStep(result) } : {}),
    ...rest,
  };
}

/**
 * Every non-integer number to COMPACT_DECIMALS. The 17-digit doubles of bounds,
 * cameras and origins were 4,346 of a 24,223-character compact animation result
 * and 1,514 of a 20,556-character compact edit on 1 October 2026; a model edits
 * in millimetres. `full` and the retained artifact keep every digit.
 */
function roundNumbers<T>(value: T): T {
  if (typeof value === 'number')
    return (
      Number.isInteger(value) || !Number.isFinite(value)
        ? value
        : Number(value.toFixed(COMPACT_DECIMALS))
    ) as T;
  if (Array.isArray(value)) return value.map(roundNumbers) as T;
  if (isRecord(value)) {
    const out: Json = {};
    for (const [key, entry] of Object.entries(value)) out[key] = roundNumbers(entry);
    return out as T;
  }
  return value;
}

/**
 * The current view and the hash-only `lastFaithful` reference stay: a degraded
 * render must still say which earlier artifact the faithful views belong to.
 * When the current view is that artifact the reference only repeats it (nine
 * posed hashes twice, 900 characters, in c37), and the faithful history behind
 * them is only ever a repeat of that reference.
 */
function withCurrentEvidence(result: Json): Json {
  const evidence = result.viewEvidence;
  if (!isRecord(evidence) || !('current' in evidence)) return result;
  const { current, lastFaithful } = evidence;
  const repeated =
    isRecord(current) &&
    isRecord(lastFaithful) &&
    typeof current.sequence === 'number' &&
    lastFaithful.sequence === current.sequence;
  return {
    ...result,
    viewEvidence: {
      current,
      ...(lastFaithful !== undefined && !repeated ? { lastFaithful } : {}),
    },
  };
}

/** Receipt fields that identify one view; never shared with the summary. */
const RECEIPT_IDENTITY = new Set([
  'version',
  'camera',
  'derivativeLabel',
  'cameraFidelity',
  'captureCache',
]);

/**
 * A per-view receipt in compact and lean detail: its label, camera fidelity and
 * capture cache, and whatever differs from the result's fidelity summary. The
 * resolved camera is stated once, by `cameraShots` under the same name. Six
 * receipts were 4,672 of a 22,417-character compact edit on 1 October 2026,
 * each repeating the summary and the camera; `full` keeps them whole.
 */
function compactReceipt(receipt: unknown, summary: Json): unknown {
  if (!isRecord(receipt)) return receipt;
  const out: Json = {};
  for (const [key, value] of Object.entries(receipt)) {
    if (key === 'version' || key === 'camera') continue;
    if (
      key === 'derivativeLabel' ||
      key === 'cameraFidelity' ||
      key === 'captureCache' ||
      JSON.stringify(summary[key]) !== JSON.stringify(value)
    )
      out[key] = value;
  }
  return out;
}

/**
 * The fields every receipt carries with one value and the summary does not
 * state: nine receipts of c37 each repeated an 85-character renderer id.
 */
function sharedReceiptFields(receipts: readonly unknown[], summary: Json): Json {
  const shared: Json = {};
  const [first, ...rest] = receipts;
  if (!isRecord(first) || !rest.every(isRecord)) return shared;
  for (const [key, value] of Object.entries(first)) {
    if (RECEIPT_IDENTITY.has(key) || summary[key] !== undefined) continue;
    const json = JSON.stringify(value);
    if (rest.every((receipt) => JSON.stringify(receipt[key]) === json)) shared[key] = value;
  }
  return shared;
}

/**
 * The receipts beside the summary and the ones inside it, compacted against
 * the summary, which first takes what every receipt shares.
 */
function withCompactReceipts(result: Json): Json {
  const fidelity = isRecord(result.viewFidelity) ? result.viewFidelity : undefined;
  const { receipts, ...rest } = fidelity ?? {};
  const list = Array.isArray(receipts)
    ? receipts
    : Array.isArray(result.derivativeReceipts)
      ? result.derivativeReceipts
      : undefined;
  if (!list) return result;
  const summary: Json = { ...rest, ...(fidelity ? sharedReceiptFields(list, rest) : {}) };
  let out = result;
  if (fidelity)
    out = {
      ...out,
      viewFidelity: Array.isArray(receipts)
        ? { ...summary, receipts: receipts.map((r) => compactReceipt(r, summary)) }
        : summary,
    };
  if (Array.isArray(result.derivativeReceipts))
    out = {
      ...out,
      derivativeReceipts: result.derivativeReceipts.map((r) => compactReceipt(r, summary)),
    };
  return out;
}

/**
 * Frames of an animation that resolve to one shot state it once, with the
 * frame count: nine frames of c37 repeated a 631-character orthographic camera
 * and subject, 5,666 of a 24,223-character result. `poseBounds` carries each
 * frame's bounds, so a shared shot drops the per-frame `subject.bounds`. The
 * distinct shots of a static capture stay whole.
 */
function withSharedShots(result: Json): Json {
  const shots = result.cameraShots;
  if (!Array.isArray(shots) || shots.length < 2 || !shots.every(isRecord)) return result;
  const groups = new Map<string, Json>();
  for (const shot of shots) {
    const entry: Json = {};
    for (const [key, value] of Object.entries(shot)) {
      if (key === 'subject' && isRecord(value)) {
        const { bounds: _bounds, ...identity } = value;
        entry.subject = identity;
      } else entry[key] = value;
    }
    const key = JSON.stringify(entry);
    const group = groups.get(key);
    if (group) group.frames = (group.frames as number) + 1;
    else groups.set(key, { ...entry, frames: 1 });
  }
  if (groups.size === shots.length) return result;
  return { ...result, cameraShots: [...groups.values()] };
}

/** How a bounded animation result names the frames it left out. */
const poseFramesHint = (retained: RetainedReport | undefined): string =>
  retained
    ? `Every frame: read ${retained.path} (pretty-printed), or ask fewer frameTimes or measureParts per call.`
    : "Every frame: detail: 'full' (inside the 40,000-character limit), or fewer frameTimes or measureParts per call.";

/**
 * The sampled frames go last and whole: nine frame times with sixteen measured
 * parts, the schema's maximum of each, are 60,000 characters of `poseBounds`.
 * A result that still passes its limit keeps the leading frames and counts the
 * rest, so the model keeps what it asked for, in order, and knows what is missing.
 */
function boundPoseBounds(result: Json, limit: number, hint: string): Json {
  const poses = result.poseBounds;
  if (!Array.isArray(poses) || poses.length < 2 || resultCharacters(result) <= limit) return result;
  for (let kept = poses.length - 1; kept >= 1; kept--) {
    const out: Json = {
      ...result,
      poseBounds: poses.slice(0, kept),
      poseBoundsOmitted: poses.length - kept,
      poseBoundsHint: hint,
    };
    if (resultCharacters(out) <= limit || kept === 1) return out;
  }
  return result;
}

function withPartPreview(result: Json, limit = COMPACT_PART_PREVIEW): Json {
  if (!Array.isArray(result.parts) || result.parts.length <= limit) return result;
  return {
    ...result,
    parts: result.parts.slice(0, limit),
    partsTruncated: true,
    partsNextOffset: limit,
    partsHint: partsHint(limit),
  };
}

/** The first `count` warnings, each cut at WARNING_CHARS; the rest are counted. */
function boundWarnings(result: Json, count: number): Json {
  const all = result.warnings;
  if (!Array.isArray(all)) return result;
  const warnings = all
    .slice(0, count)
    .map((warning) =>
      typeof warning === 'string' && warning.length > WARNING_CHARS
        ? `${warning.slice(0, WARNING_CHARS)}… (+${warning.length - WARNING_CHARS} chars)`
        : warning,
    );
  const omitted = all.length - warnings.length;
  if (omitted === 0 && warnings.every((warning, i) => warning === all[i])) return result;
  return { ...result, warnings, ...(omitted > 0 ? { warningsOmitted: omitted } : {}) };
}

/** The characters a result costs on the wire: its JSON without the image bytes. */
export function resultCharacters(result: unknown): number {
  if (!isRecord(result)) return JSON.stringify(result).length;
  const { pngBase64: _png, framesBase64: _frames, ...rest } = result;
  return JSON.stringify(rest).length;
}

const LEAN_KEYS = [
  'tris',
  'meshes',
  'materials',
  'distinctMaterials',
  'bbox',
  'lowestPart',
  'views',
  'capture',
  'gridWidth',
  'gridHeight',
  'width',
  'height',
  'cameraShot',
  'cameraShots',
  'loopClosure',
  'poseBounds',
  'roofsHidden',
  'partListing',
  'measurement',
  'surfaceMeasurements',
  'comparison',
  'materialContract',
  'error',
  'pngBase64',
  'framesBase64',
  'derivativeReceipts',
] as const;

function leanFidelity(fidelity: unknown): unknown {
  if (!isRecord(fidelity)) return fidelity;
  const keep: Json = {};
  for (const key of [
    'delivered',
    'materialFaithful',
    'rendererId',
    'exactArtifact',
    'degraded',
    'degradeReason',
    'receipts',
  ])
    if (fidelity[key] !== undefined) keep[key] = fidelity[key];
  return keep;
}

/** Verdict, blockers, metrics, fidelity and the next step: nothing a later call cannot fetch. */
function leanReviewResult(source: Json): Json {
  const result = withSharedShots(withCompactReceipts(source));
  const led = lead(result);
  const out: Json = {};
  for (const key of [
    'ok',
    'acceptance',
    'disposition',
    'blockers',
    'blockersOmitted',
    'findings',
    'next',
  ])
    if (led[key] !== undefined) out[key] = led[key];
  for (const key of LEAN_KEYS) if (result[key] !== undefined) out[key] = result[key];
  if (isRecord(out.comparison)) out.comparison = withCompactComparison(out).comparison;
  if (result.viewFidelity !== undefined) out.viewFidelity = leanFidelity(result.viewFidelity);
  const { warnings, warningsOmitted } = boundWarnings(result, LEAN_WARNINGS);
  if (warnings !== undefined) out.warnings = warnings;
  if (warningsOmitted !== undefined) out.warningsOmitted = warningsOmitted;
  if (Array.isArray(result.parts)) out.partsTotal = result.partsTotal ?? result.parts.length;
  out.detail = 'lean';
  out.fullDetail = "Findings, parts and receipts: detail: 'compact' or 'full'.";
  return boundPoseBounds(roundNumbers(out), DEFAULT_RESULT_LIMIT, poseFramesHint(undefined));
}

/**
 * Everything, inside the hard limit. When the complete report does not fit,
 * repetition goes first: the warnings are bounded, then findings that share a
 * code group with their counts (every rule kept). Only then does the part list
 * shrink to the preview and the finding groups halve per dimension, and last
 * the sampled frames; the retained report keeps the rest.
 */
function fullReviewResult(
  result: Json,
  retained: RetainedReport | undefined,
  limit = MAX_RESULT_LIMIT,
): Json {
  let out = lead(result);
  if (retained) out = { ...out, retainedReport: retained };
  const fits = (candidate: Json) => resultCharacters(candidate) <= limit;
  if (fits(out)) return out;
  out = boundWarnings(out, COMPACT_WARNINGS);
  if (fits(out)) return out;
  const withGroups = (groups: number): Json => {
    const report = out.qaReport;
    if (!isRecord(report) || !isRecord(report.dimensions)) return out;
    return {
      ...out,
      qaReport: {
        ...(compactQaReport(report, groups, true) as Json),
        detail: 'full-bounded',
        fullDetail: retained
          ? `Every finding: read ${retained.path} (pretty-printed).`
          : 'Every finding is in the retained artifact when the host records one.',
      },
    };
  };
  let bounded = withGroups(512);
  if (fits(bounded)) return bounded;
  out = withPartPreview(out);
  for (let groups = 512; ; groups = Math.floor(groups / 2)) {
    bounded = withGroups(groups);
    if (fits(bounded)) return bounded;
    if (groups <= 1) return boundPoseBounds(bounded, limit, poseFramesHint(retained));
  }
}

/** Apply the requested detail to a review tool result. */
export function compactReviewResult<T>(
  result: T,
  detail: ReviewDetail = 'compact',
  options: DetailOptions = {},
): T {
  if (!isRecord(result)) return result;
  if (detail === 'lean') return leanReviewResult(result) as T;
  if (detail === 'full') return fullReviewResult(result, options.retainedReport?.()) as T;
  const out = boundWarnings(
    withCompactReceipts(
      withCompactComparison(withPartPreview(withSharedShots(withCurrentEvidence(lead(result))))),
    ),
    COMPACT_WARNINGS,
  );
  if (out.qaReport !== undefined) out.qaReport = compactQaReport(out.qaReport);
  return boundPoseBounds(roundNumbers(out), DEFAULT_RESULT_LIMIT, poseFramesHint(undefined)) as T;
}

/** The static comparison in a sentence of counts, for the edit result's lead. */
function changeSummary(result: Json): Json {
  const preservation = isRecord(result.preservation) ? result.preservation : undefined;
  const comparison =
    preservation && isRecord(preservation.comparison) ? preservation.comparison : undefined;
  const out: Json = { status: preservation?.status ?? 'not_assessed' };
  if (comparison) {
    if (comparison.summary !== undefined) out.parts = comparison.summary;
    if (comparison.animationSummary !== undefined) out.animation = comparison.animationSummary;
    if (Array.isArray(comparison.changes))
      out.changed = comparison.changes
        .slice(0, 5)
        .map((change) =>
          isRecord(change)
            ? `${change.path ?? '?'}: ${change.status ?? ''}${Array.isArray(change.fields) && change.fields.length ? ` (${change.fields.join(', ')})` : ''}`
            : String(change),
        );
  } else if (preservation?.reason !== undefined) out.reason = preservation.reason;
  return out;
}

/** The diff a lean edit keeps, and the least a compact edit shrinks its diff to. */
export const LEAN_DIFF = 2000;
/** Changes a compact edit names; kiln_inspect compare pages the rest. */
export const COMPACT_COMPARISON_CHANGES = 12;

/**
 * A static comparison as the counts, the artifact before and after, and each
 * change as its path, status and changed fields. The bounds of every change and
 * the scope prose belong to `full`: they were 7,191 of the 20,069 characters of
 * a live compact edit and 32,443 of a 38,952-character compact kiln_inspect
 * compare on 1 October 2026. An edit keeps its first `limit` changes; a compare
 * keeps the page that was asked for.
 */
function compactComparison(comparison: Json, hint: string, limit?: number): Json {
  const out: Json = {};
  for (const key of ['programRef', 'version', 'units', 'summary', 'before', 'after', 'subtrees'])
    if (comparison[key] !== undefined) out[key] = comparison[key];
  if (isRecord(comparison.animation)) {
    const { scope: _scope, ...animation } = comparison.animation;
    out.animation = animation;
  }
  if (comparison.animationSummary !== undefined) out.animationSummary = comparison.animationSummary;
  if (Array.isArray(comparison.changes)) {
    const changes = limit === undefined ? comparison.changes : comparison.changes.slice(0, limit);
    out.changes = changes.map((change) => {
      if (!isRecord(change)) return change;
      const kept: Json = { path: change.path };
      if (typeof change.name === 'string') kept.name = change.name;
      kept.status = change.status;
      if (Array.isArray(change.fields) && change.fields.length > 0) kept.fields = change.fields;
      return kept;
    });
  }
  for (const key of ['offset', 'nextOffset'])
    if (comparison[key] !== undefined) out[key] = comparison[key];
  out.detail = hint;
  return out;
}

const COMPARE_HINT =
  "Bounds per change and the comparison scope: detail: 'full'. compare.offset pages the changes.";

/** The compact comparison of a kiln_inspect compare page, in place. */
function withCompactComparison(result: Json): Json {
  if (!isRecord(result.comparison)) return result;
  return { ...result, comparison: compactComparison(result.comparison, COMPARE_HINT) };
}

function compactPreservation(preservation: unknown): unknown {
  if (!isRecord(preservation) || !isRecord(preservation.comparison)) return preservation;
  return {
    ...preservation,
    comparison: compactComparison(
      preservation.comparison,
      "Bounds per change and the comparison scope: detail: 'full'. More changes: kiln_inspect compare on this programRef.",
      COMPACT_COMPARISON_CHANGES,
    ),
  };
}

/**
 * A full edit inside the hard limit. w21 (Agy horse, 1 October 2026) was 40,533
 * characters: its render bounded at 40,000 on its own, the 8,177-character diff
 * and the 10,973-character comparison on top. The diff goes first, down to the
 * lean length (the model wrote the change), then the bounds of each change (the
 * retained report keeps them), then the render is bounded again with what is left.
 */
function boundFullEdit(
  edited: Json,
  render: Json | undefined,
  retained: RetainedReport | undefined,
): Json {
  const fits = (candidate: Json) => resultCharacters(candidate) <= MAX_RESULT_LIMIT;
  if (fits(edited)) return edited;
  let out = edited;
  if (typeof out.diff === 'string' && out.diff.length > LEAN_DIFF) {
    out = { ...out, diff: out.diff.slice(0, LEAN_DIFF), diffOmitted: out.diff.length - LEAN_DIFF };
    if (fits(out)) return out;
  }
  if (isRecord(out.preservation) && isRecord(out.preservation.comparison)) {
    out = {
      ...out,
      preservation: {
        ...out.preservation,
        comparison: compactComparison(
          out.preservation.comparison,
          `Bounds per change and the comparison scope: ${retained ? `read ${retained.path} (pretty-printed)` : 'kiln_inspect compare on this programRef'}; compare.offset pages the changes.`,
        ),
      },
    };
    if (fits(out)) return out;
  }
  if (render && isRecord(out.render)) {
    const budget = MAX_RESULT_LIMIT - (resultCharacters(out) - resultCharacters(out.render));
    out = { ...out, render: fullReviewResult(render, retained, budget) };
  }
  return out;
}

/**
 * kiln_edit nests the render of the patched program. The edit result leads
 * with what applied, what changed and the next step; the render takes the
 * requested detail, a lean edit keeps the diff but not the comparison, and a
 * compact edit shrinks its diff (the model's own change) before anything else
 * when the whole would pass the default limit. A full edit stays inside the
 * hard limit as a whole.
 */
export function compactEditResult<T>(
  result: T,
  detail: ReviewDetail = 'compact',
  options: DetailOptions = {},
): T {
  if (!isRecord(result)) return result;
  const { ok, applied, diff, preservation, render, ...rest } = result;
  const reviewed = isRecord(render) ? compactReviewResult(render, detail, options) : undefined;
  const next =
    ok === false
      ? 'Copy the exact text from kiln_source and send the edit again with this programRef.'
      : reviewed
        ? reviewed.next
        : 'kiln_render this programRef to review the change.';
  const out: Json = {
    ok,
    ...(applied !== undefined ? { applied } : {}),
    ...(ok === false ? {} : { changed: changeSummary(result) }),
    next,
  };
  if (typeof diff === 'string') {
    if (detail === 'lean' && diff.length > LEAN_DIFF) {
      out.diff = diff.slice(0, LEAN_DIFF);
      out.diffOmitted = diff.length - LEAN_DIFF;
    } else out.diff = diff;
  }
  if (preservation !== undefined) {
    if (detail === 'full') out.preservation = preservation;
    else if (detail === 'compact') out.preservation = compactPreservation(preservation);
  }
  if (reviewed) out.render = reviewed;
  if (detail === 'full')
    return boundFullEdit(
      { ...out, ...rest },
      isRecord(render) ? render : undefined,
      options.retainedReport?.(),
    ) as T;
  const edited: Json = roundNumbers({ ...out, ...rest });
  if (detail === 'compact' && typeof edited.diff === 'string' && edited.diff.length > LEAN_DIFF) {
    // Every raw character cut removes at least one JSON character; 40 covers the omitted count.
    const over = resultCharacters(edited) - DEFAULT_RESULT_LIMIT + 40;
    if (over > 0) {
      const keep = Math.max(LEAN_DIFF, edited.diff.length - over);
      edited.diffOmitted = edited.diff.length - keep;
      edited.diff = edited.diff.slice(0, keep);
    }
  }
  return edited as T;
}
