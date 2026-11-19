import { expect, test } from 'bun:test';
import { buildGallery } from '../src/lib/gallery';
import { browseGallery } from '../src/lib/gallery-browse';
import galleryOrder from '../src/data/gallery-order.json';
import shipped from '../src/data/gallery-verified.json';
import {
  VERIFIED_BAR_HREF,
  VERIFIED_BAR_VERSION,
  modelSha256,
  validateVerifiedReviews,
  verifiedReviewFor,
  verifiedReviews,
  type VerifiedReview,
} from '../src/lib/gallery-verified';

const cards = buildGallery(true);
const card = (href: string) => cards.find((asset) => asset.href === href)!;
const fountain = card('/gallery/holodeck/plaza-fountain/');

const review = (overrides: Partial<VerifiedReview> = {}): VerifiedReview => ({
  collection: 'project',
  assetId: fountain.assetId!,
  revisionId: fountain.revisionId,
  glbSha256: modelSha256(fountain),
  bar: VERIFIED_BAR_VERSION,
  verdict: 'verified',
  date: '2026-11-19',
  reviewer: 'owner',
  flushFaces: { pairs: 0, truncated: false, unexaminedParts: 0 },
  findings: [
    { code: 'GEO_PART_CONNECTIVITY', resolution: 'accepted', note: 'The spouts float by design.' },
  ],
  views: {
    shots: 'default six views',
    backdrop: 'neutral',
    rendererId: 'gpu:example',
    delivered: 'full-material',
    materialFaithful: true,
    exactArtifact: true,
  },
  ...overrides,
});
const file = (reviews: unknown[]) => ({ bar: VERIFIED_BAR_VERSION, reviews });

test('cards show the label only when marked, and the gallery says what the mark means only when one is', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
  const assetCard = await source('../src/components/AssetCard.astro');
  expect(assetCard).toContain('data-verified={asset.verified ? "" : undefined}');
  expect(assetCard).toMatch(/\{asset\.verified && \([\s\S]*?href=\{VERIFIED_BAR_HREF\}>Verified<\/a>/);
  const index = await source('../src/pages/gallery/index.astro');
  expect(index).toMatch(/\{verifiedCount > 0 && \([\s\S]*?href=\{VERIFIED_BAR_HREF\}[\s\S]*?Unmarked assets have not been reviewed\./);
  // The client re-sort reads the same mark the static order used.
  expect(index).toContain('verified: element.dataset.verified !== undefined');
});

test('the shipped record file is valid and marks nothing until the owner signs off', () => {
  expect(validateVerifiedReviews(shipped)).toEqual([]);
  expect(verifiedReviews).toEqual([]);
  expect(cards.filter((asset) => asset.verified)).toEqual([]);
  expect(VERIFIED_BAR_HREF).toBe('https://github.com/instruktlabs/kiln/blob/main/docs/gallery-verified.md');
});

test('a review that meets every item of the bar validates', () => {
  expect(validateVerifiedReviews(file([review()]))).toEqual([review()]);
  expect(validateVerifiedReviews(file([review({ findings: [] })]))).toHaveLength(1);
});

test('a verified review is refused when any item of the bar is unmet or unrecorded', () => {
  const refused = (overrides: Record<string, unknown>, pattern: RegExp) =>
    expect(() => validateVerifiedReviews(file([{ ...review(), ...overrides }]))).toThrow(pattern);
  refused({ flushFaces: { pairs: 1, truncated: false, unexaminedParts: 0 } }, /flush/i);
  refused({ flushFaces: { pairs: 0, truncated: true, unexaminedParts: 0 } }, /flush/i);
  refused({ flushFaces: { pairs: 0, truncated: false } }, /unexamined/i);
  refused({ findings: [{ code: 'X', resolution: 'accepted', note: ' ' }] }, /note/i);
  refused({ findings: [{ code: 'X', resolution: 'ignored', note: 'n' }] }, /resolution/i);
  refused({ views: { ...review().views, materialFaithful: false } }, /material/i);
  refused({ views: { ...review().views, exactArtifact: false } }, /exact/i);
  refused({ views: { ...review().views, backdrop: '#ffffff' } }, /backdrop/i);
  refused({ views: { ...review().views, rendererId: '' } }, /renderer/i);
  refused({ views: { ...review().views, shots: '' } }, /shots/i);
  refused({ glbSha256: 'abc' }, /sha256/i);
  refused({ revisionId: 'r_1' }, /revision/i);
  refused({ assetId: '' }, /asset/i);
  refused({ date: '19 Nov 2026' }, /date/i);
  refused({ reviewer: '' }, /reviewer/i);
  refused({ verdict: 'maybe' }, /verdict/i);
  refused({ bar: VERIFIED_BAR_VERSION + 1 }, /bar/i);
  expect(() => validateVerifiedReviews(file([review(), review()]))).toThrow(/duplicate/i);
  expect(() => validateVerifiedReviews({ bar: VERIFIED_BAR_VERSION + 1, reviews: [] })).toThrow(/bar/i);
});

test('a rejected review is kept as a record without meeting the bar and never marks', () => {
  const rejected = review({ verdict: 'rejected', flushFaces: { pairs: 3, truncated: false, unexaminedParts: 0 }, findings: [] });
  expect(validateVerifiedReviews(file([rejected]))).toEqual([rejected]);
  expect(verifiedReviewFor(fountain, [rejected])).toBeUndefined();
});

test('the marker follows the exact revision and GLB bytes reviewed', () => {
  expect(verifiedReviewFor(fountain, [review()])).toEqual(review());
  expect(verifiedReviewFor(fountain, [review({ glbSha256: '0'.repeat(64) })])).toBeUndefined();
  expect(verifiedReviewFor(fountain, [review({ revisionId: `r_${'0'.repeat(32)}` })])).toBeUndefined();
  expect(verifiedReviewFor(fountain, [review({ assetId: `a_${'0'.repeat(32)}` })])).toBeUndefined();
  // A card's served GLB, not its download archive, is what the review names.
  expect(modelSha256(fountain)).toBe((fountain as unknown as { runtimeModelDownload: { sha256: string } }).runtimeModelDownload.sha256);
  expect(modelSha256(card('/gallery/faceted-tree/'))).toBe(card('/gallery/faceted-tree/').runtimeDownload.sha256);
});

test('marked cards carry the review date and lead the default order, unmarked cards keep theirs', () => {
  const crucifix = card('/gallery/cathedral-square/crucifix/');
  const reviews = [
    review(),
    review({ assetId: crucifix.assetId!, revisionId: crucifix.revisionId, glbSha256: modelSha256(crucifix), date: '2026-11-20' }),
  ];
  const marked = buildGallery(true, reviews);
  expect(marked.filter((asset) => asset.verified).map((asset) => [asset.href, asset.verified])).toEqual([
    ['/gallery/holodeck/plaza-fountain/', { date: '2026-11-19' }],
    ['/gallery/cathedral-square/crucifix/', { date: '2026-11-20' }],
  ]);
  // Curated order among the marked, then the unchanged order of the rest.
  const rest = galleryOrder.order.filter((href) => href !== fountain.href && href !== crucifix.href);
  expect(marked.slice(0, galleryOrder.order.length).map((asset) => asset.href)).toEqual([
    fountain.href,
    crucifix.href,
    ...rest,
  ]);
  expect(browseGallery(marked, { pack: 'cathedral-square' })[0]?.href).toBe(crucifix.href);
  expect(browseGallery(marked, { sort: 'az' })).toEqual(browseGallery(cards, { sort: 'az' }).map((asset) => marked.find((m) => m.href === asset.href)!));
  expect(marked.find((asset) => asset.href === '/gallery/faceted-tree/')!.verified).toBeUndefined();
});
