import records from '../data/gallery-verified.json';

/** The bar these records were judged against. A record for another version is refused. */
export const VERIFIED_BAR_VERSION = 1;
export const VERIFIED_BAR_HREF =
  'https://github.com/instruktlabs/kiln/blob/main/docs/gallery-verified.md';

const BACKDROPS = ['neutral', 'dark', 'light'];
const RESOLUTIONS = ['fixed', 'accepted'];

export interface VerifiedFinding {
  code: string;
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

function validateReview(value: unknown, at: string): VerifiedReview {
  const fail = (message: string): never => {
    throw new Error(`gallery-verified.json ${at}: ${message}`);
  };
  if (!value || typeof value !== 'object') return fail('not an object');
  const review = value as VerifiedReview;
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
  if (review.verdict === 'verified') {
    if (flush.pairs !== 0 || flush.truncated)
      fail('verified needs a complete flush-face check with no pair');
    if (!views.materialFaithful) fail('verified needs material-faithful views');
    if (!views.exactArtifact) fail('verified needs views drawn from the exact pinned bytes');
  }
  if (review.note !== undefined && typeof review.note !== 'string') fail('note must be text');
  return review;
}

/** Throws on the first record that is malformed or claims verified without meeting the bar. */
export function validateVerifiedReviews(input: unknown): VerifiedReview[] {
  const file = input as { bar?: unknown; reviews?: unknown };
  if (file?.bar !== VERIFIED_BAR_VERSION)
    throw new Error(`gallery-verified.json: bar must be ${VERIFIED_BAR_VERSION}`);
  if (!Array.isArray(file.reviews))
    throw new Error('gallery-verified.json: reviews must be a list');
  const seen = new Set<string>();
  return file.reviews.map((value, index) => {
    const review = validateReview(value, `reviews[${index}]`);
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
