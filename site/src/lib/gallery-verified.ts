import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import records from '../data/gallery-verified.json';

/** The bar these records were judged against. A record for another version is refused. */
export const VERIFIED_BAR_VERSION = 1;
export const VERIFIED_BAR_HREF =
  'https://github.com/instruktlabs/kiln/blob/main/docs/gallery-verified.md';
/** What a stored QA report is: the measurements one review made on the pinned GLB. */
export const QA_EVIDENCE_KIND = 'kiln.gallery-verified-qa';
/** Stored QA reports live here, relative to `site/src/data`. */
export const QA_REPORT_DIR = 'gallery-verified/qa/';

const BACKDROPS = ['neutral', 'dark', 'light'];
const RESOLUTIONS = ['fixed', 'accepted'];
const DISPOSITIONS = ['block', 'warn', 'observe'];
/** The entity a finding names, in the order the engine's own result summaries pick it. */
const SUBJECT_KEYS = ['nodePath', 'node', 'material', 'texture', 'clip', 'track', 'attribute'];

export interface VerifiedFinding {
  code: string;
  /** The entity the QA finding names (its node path, node, material and so on), when it names one. */
  subject?: string;
  /** `accepted` settles a finding the stored QA report carries; `fixed` records one it no longer does. */
  resolution: 'fixed' | 'accepted';
  note: string;
}

/**
 * One owner review of one exact revision, as served: the GLB a gallery card pins. Saved revisions
 * are immutable, so the review is a separate record keyed by their identity and the bytes' hash.
 */
export interface VerifiedReview {
  collection: string;
  assetId: string;
  revisionId: string;
  /** SHA-256 of the GLB the gallery serves for this revision (hex, no prefix). */
  glbSha256: string;
  bar: number;
  verdict: 'verified' | 'rejected';
  /** YYYY-MM-DD, as written by the reviewer. */
  date: string;
  /** A role, such as owner, never a personal detail. */
  reviewer: string;
  /** Skinned, morphed and instanced meshes are not measured; the count says how many. */
  flushFaces: { pairs: number; truncated: boolean; unexaminedParts: number };
  /** The QA report the review used, a file under `site/src/data`, and that file's SHA-256. */
  qaReport: { path: string; sha256: string };
  findings: VerifiedFinding[];
  views: {
    shots: string;
    backdrop: string;
    rendererId: string;
    delivered: string;
    materialFaithful: boolean;
    exactArtifact: boolean;
  };
  note?: string;
}

/** A finding the bar counts: a QA error (`block`) or warning (`warn`), never an informational note. */
export interface QaErrorOrWarning {
  code: string;
  subject?: string;
  disposition: 'block' | 'warn';
  message: string;
}

/** Reads a stored QA report's bytes by its path under `site/src/data`. */
export type ReadQaFile = (path: string) => Uint8Array;
/** Pages build from `site/`, like the other build-time reads of site files. */
const readStoredQaFile: ReadQaFile = (path) => readFileSync(resolve('src/data', path));

/** The identity a card offers: its revision, its asset when known, and the GLB it serves. */
export interface VerifiableCard {
  revisionId: string;
  assetId?: string;
  runtimeDownload: { sha256: string };
  runtimeModelDownload?: { sha256: string };
}

/** The served model: packs with archives name their GLB separately from the runtime download. */
export const modelSha256 = (card: VerifiableCard) =>
  (card.runtimeModelDownload ?? card.runtimeDownload).sha256;

const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** The node path, node, material, texture, clip, track or attribute a QA finding names. */
export function findingSubject(finding: unknown): string | undefined {
  const affected = record(finding) ? finding.affected : undefined;
  if (!record(affected)) return undefined;
  for (const key of SUBJECT_KEYS) if (text(affected[key])) return affected[key] as string;
  return undefined;
}

/** The engine QA report inside a stored QA report, or undefined when it is not one. */
function engineFindings(evidence: unknown): Record<string, unknown>[] | undefined {
  const qa = record(evidence) ? evidence.qa : undefined;
  if (!record(qa) || qa.kind !== 'kiln.asset-qa-report' || qa.schemaVersion !== 2) return undefined;
  if (!record(qa.dimensions)) return undefined;
  const findings: Record<string, unknown>[] = [];
  for (const dimension of Object.values(qa.dimensions)) {
    if (!record(dimension) || !Array.isArray(dimension.findings)) return undefined;
    for (const finding of dimension.findings) {
      if (
        !record(finding) ||
        !text(finding.code) ||
        !DISPOSITIONS.includes(String(finding.disposition))
      )
        return undefined;
      findings.push(finding);
    }
  }
  return findings;
}

/** Every QA error and warning in a stored QA report, in report order. Informational notes are left out. */
export function qaErrorsAndWarnings(evidence: unknown): QaErrorOrWarning[] {
  return (engineFindings(evidence) ?? [])
    .filter((finding) => finding.disposition === 'block' || finding.disposition === 'warn')
    .map((finding) => {
      const subject = findingSubject(finding);
      return {
        code: finding.code as string,
        ...(subject === undefined ? {} : { subject }),
        disposition: finding.disposition as 'block' | 'warn',
        message: String(finding.message ?? ''),
      };
    });
}

const findingKey = (finding: { code: string; subject?: string }) =>
  `${finding.code}\u0000${finding.subject ?? ''}`;
const findingLabel = (finding: { code: string; subject?: string }) =>
  finding.subject === undefined ? finding.code : `${finding.code} on ${finding.subject}`;
const count = <T>(items: readonly T[], key: (item: T) => string) => {
  const counts = new Map<string, { item: T; count: number }>();
  for (const item of items) {
    const entry = counts.get(key(item));
    if (entry) entry.count++;
    else counts.set(key(item), { item, count: 1 });
  }
  return counts;
};

/** Read, hash and check the stored QA report a record names; returns the report. */
function storedQaReport(
  review: VerifiedReview,
  readQaFile: ReadQaFile,
  fail: (message: string) => never,
): Record<string, unknown> {
  const ref = review.qaReport;
  if (!record(ref)) return fail('qaReport must name the stored QA report and its SHA-256');
  const path = String(ref.path);
  if (
    !path.startsWith(QA_REPORT_DIR) ||
    !/^[A-Za-z0-9._-]+\.json$/.test(path.slice(QA_REPORT_DIR.length)) ||
    path.includes('..')
  )
    fail(`qaReport.path must be a JSON file in ${QA_REPORT_DIR}`);
  if (!/^[0-9a-f]{64}$/.test(String(ref.sha256))) fail('qaReport.sha256 must be 64 hex digits');
  let bytes: Uint8Array;
  try {
    bytes = readQaFile(path);
  } catch {
    return fail(`qaReport ${path} could not be read`);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== ref.sha256)
    fail(`qaReport ${path} does not match its SHA-256`);
  let evidence: unknown;
  try {
    evidence = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail(`qaReport ${path} is not JSON`);
  }
  if (!record(evidence) || evidence.kind !== QA_EVIDENCE_KIND || evidence.version !== 1)
    fail(`qaReport ${path} is not a gallery QA report (${QA_EVIDENCE_KIND} version 1)`);
  const report = evidence as Record<string, unknown>;
  if (report.glbSha256 !== review.glbSha256)
    fail(`the QA report is for other GLB bytes (${String(report.glbSha256)})`);
  if (!engineFindings(report))
    fail(`qaReport ${path} does not hold an engine QA report (qa.dimensions with findings)`);
  const measured = record(report.flushFaces) ? report.flushFaces : {};
  const flush = review.flushFaces;
  if (
    measured.pairs !== flush.pairs ||
    measured.truncated !== flush.truncated ||
    measured.unexaminedParts !== flush.unexaminedParts
  )
    fail(
      `flushFaces differs from the QA report's measurement (${measured.pairs} pairs, truncated ${measured.truncated}, ${measured.unexaminedParts} unexamined)`,
    );
  return report;
}

/** Every QA error and warning must be accepted with a note; an accepted note must answer one. */
function checkFindingsSettled(
  review: VerifiedReview,
  report: Record<string, unknown>,
  fail: (message: string) => never,
): void {
  const reported = count(qaErrorsAndWarnings(report), findingKey);
  const accepted = count(
    review.findings.filter((finding) => finding.resolution === 'accepted'),
    findingKey,
  );
  const fixed = new Set(
    review.findings.filter((finding) => finding.resolution === 'fixed').map(findingKey),
  );
  for (const [key, { item, count: wanted }] of reported) {
    const label = findingLabel(item);
    if (fixed.has(key))
      fail(`${label} is still reported, so it is not fixed; accept it with a note`);
    const settled = accepted.get(key)?.count ?? 0;
    if (settled === 0) fail(`${label} is not settled: accept it with a note saying why it stays`);
    if (settled !== wanted)
      fail(`${wanted} ${label} finding${wanted === 1 ? '' : 's'}, ${settled} settled`);
  }
  const notes = new Set(
    (engineFindings(report) ?? []).map((finding) =>
      findingKey({ code: String(finding.code), subject: findingSubject(finding) }),
    ),
  );
  for (const [key, { item }] of accepted) {
    if (reported.has(key)) continue;
    fail(
      `accepts ${findingLabel(item)}, which the QA report does not carry${notes.has(key) ? ' as an error or warning: informational notes need no resolution' : ''}`,
    );
  }
}

function validateReview(value: unknown, at: string, readQaFile: ReadQaFile): VerifiedReview {
  const fail = (message: string): never => {
    throw new Error(`gallery-verified.json ${at}: ${message}`);
  };
  if (!value || typeof value !== 'object') return fail('not an object');
  const review = value as VerifiedReview;
  if ('status' in review)
    fail('is a pending record: the owner sets the verdict and removes status before it is kept');
  if (!text(review.collection)) fail('collection is required');
  if (!/^a_[0-9a-f]{32}$/.test(String(review.assetId)))
    fail('assetId must be a_ and 32 hex digits');
  if (!/^r_[0-9a-f]{32}$/.test(String(review.revisionId)))
    fail('revisionId must be r_ and 32 hex digits');
  if (!/^[0-9a-f]{64}$/.test(String(review.glbSha256))) fail('glbSha256 must be 64 hex digits');
  if (review.bar !== VERIFIED_BAR_VERSION) fail(`bar must be ${VERIFIED_BAR_VERSION}`);
  if (review.verdict !== 'verified' && review.verdict !== 'rejected')
    fail('verdict must be verified or rejected');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(review.date))) fail('date must be YYYY-MM-DD');
  if (!text(review.reviewer)) fail('reviewer role is required');
  const flush = review.flushFaces;
  if (!flush || !Number.isInteger(flush.pairs) || typeof flush.truncated !== 'boolean')
    fail('flushFaces needs a pair count and whether the check was truncated');
  if (!Number.isInteger(flush.unexaminedParts))
    fail('flushFaces.unexaminedParts must record how many parts the check could not measure');
  if (!Array.isArray(review.findings)) fail('findings must be a list');
  for (const finding of review.findings) {
    if (!text(finding?.code)) fail('every finding needs its code');
    if (finding.subject !== undefined && !text(finding.subject))
      fail(`finding ${finding.code}: subject, when given, names what the finding is about`);
    if (!RESOLUTIONS.includes(finding.resolution))
      fail(`finding ${finding.code}: resolution must be fixed or accepted`);
    if (!text(finding.note)) fail(`finding ${finding.code}: a written note is required`);
  }
  const views = review.views;
  if (!views || typeof views !== 'object') fail('views are required');
  if (!text(views.shots)) fail('views.shots must say which views were looked at');
  if (!BACKDROPS.includes(views.backdrop)) fail('views.backdrop must be neutral, dark or light');
  if (!text(views.rendererId)) fail('views.rendererId is required');
  if (!text(views.delivered)) fail('views.delivered is required');
  if (typeof views.materialFaithful !== 'boolean' || typeof views.exactArtifact !== 'boolean')
    fail('views need materialFaithful and exactArtifact from viewFidelity');
  if (review.note !== undefined && typeof review.note !== 'string') fail('note must be text');
  const report = storedQaReport(review, readQaFile, fail);
  if (review.verdict === 'verified') {
    if (flush.pairs !== 0 || flush.truncated)
      fail('verified needs a complete flush-face check with no pair');
    if (!views.materialFaithful) fail('verified needs material-faithful views');
    if (!views.exactArtifact) fail('verified needs views drawn from the exact pinned bytes');
    checkFindingsSettled(review, report, fail);
  }
  return review;
}

/** Throws on the first record that is malformed or claims verified without meeting the bar. */
export function validateVerifiedReviews(
  input: unknown,
  { readQaFile = readStoredQaFile }: { readQaFile?: ReadQaFile } = {},
): VerifiedReview[] {
  const file = input as { bar?: unknown; reviews?: unknown };
  if (file?.bar !== VERIFIED_BAR_VERSION)
    throw new Error(`gallery-verified.json: bar must be ${VERIFIED_BAR_VERSION}`);
  if (!Array.isArray(file.reviews))
    throw new Error('gallery-verified.json: reviews must be a list');
  const seen = new Set<string>();
  return file.reviews.map((value, index) => {
    const review = validateReview(value, `reviews[${index}]`, readQaFile);
    const key = `${review.revisionId}:${review.glbSha256}`;
    if (seen.has(key))
      throw new Error(`gallery-verified.json reviews[${index}]: duplicate review of ${key}`);
    seen.add(key);
    return review;
  });
}

export const verifiedReviews = validateVerifiedReviews(records);

/** The verified review of exactly these bytes of this revision, if the owner recorded one. */
export function verifiedReviewFor(
  card: VerifiableCard,
  reviews: readonly VerifiedReview[] = verifiedReviews,
): VerifiedReview | undefined {
  const sha = modelSha256(card);
  return reviews.find(
    (review) =>
      review.verdict === 'verified' &&
      review.revisionId === card.revisionId &&
      review.glbSha256 === sha &&
      (card.assetId === undefined || review.assetId === card.assetId),
  );
}
