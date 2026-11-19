import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';
import { buildGallery } from '../src/lib/gallery';
import { browseGallery } from '../src/lib/gallery-browse';
import galleryOrder from '../src/data/gallery-order.json';
import shipped from '../src/data/gallery-verified.json';
import {
  QA_EVIDENCE_KIND,
  VERIFIED_BAR_HREF,
  VERIFIED_BAR_VERSION,
  findingSubject,
  modelSha256,
  qaErrorsAndWarnings,
  validateVerifiedReviews,
  verifiedReviewFor,
  verifiedReviews,
  type VerifiedFinding,
  type VerifiedReview,
} from '../src/lib/gallery-verified';

const cards = buildGallery(true);
const card = (href: string) => cards.find((asset) => asset.href === href)!;
const fountain = card('/gallery/holodeck/plaza-fountain/');

const qaFinding = (code: string, disposition: string, node?: string) => ({
  code,
  disposition,
  dimension: 'visualQuality',
  profile: 'test.profile',
  message: `${code} was measured.`,
  ...(node ? { affected: { node } } : {}),
});
/** The QA evidence a review used: the flush measurement and the engine's QA report of the bytes. */
const evidence = (findings: unknown[] = [], overrides: Record<string, unknown> = {}) => ({
  kind: QA_EVIDENCE_KIND,
  version: 1,
  glbSha256: modelSha256(fountain),
  engine: { name: '@instruktlabs/kiln', version: '1.8.0', commit: '0'.repeat(40) },
  readback: 'loadGlbReviewScene',
  requirements: 'default',
  flushFaces: { pairs: 0, truncated: false, unexaminedParts: 0, triangles: 12, examined: 12 },
  qa: {
    kind: 'kiln.asset-qa-report',
    schemaVersion: 2,
    disposition: 'warn',
    dimensions: {
      exportIntegrity: { status: 'pass', findings: [] },
      visualQuality: { status: 'warn', findings },
    },
  },
  ...overrides,
});
const spouts = [
  qaFinding('GEO_PART_CONNECTIVITY', 'warn', 'Spout'),
  qaFinding('GEO_PART_SELF_INTERSECTION_UNMEASURED', 'observe'),
];

/** QA files by path, as the validator reads them from site/src/data. */
const files = new Map<string, Uint8Array>();
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const store = (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
  const path = `gallery-verified/qa/${sha256(bytes).slice(0, 12)}.json`;
  files.set(path, bytes);
  return { path, sha256: sha256(bytes) };
};
const readQaFile = (path: string) => {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`ENOENT: ${path}`);
  return bytes;
};

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
  qaReport: store(evidence(spouts)),
  findings: [
    {
      code: 'GEO_PART_CONNECTIVITY',
      subject: 'Spout',
      resolution: 'accepted',
      note: 'The spouts float by design.',
    },
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
const validate = (reviews: unknown[]) => validateVerifiedReviews(file(reviews), { readQaFile });
const refused = (overrides: Record<string, unknown>, pattern: RegExp) =>
  expect(() => validate([{ ...review(), ...overrides }])).toThrow(pattern);

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

test('a finding is every QA error and warning; informational notes are not findings', () => {
  const report = evidence([
    qaFinding('A_BLOCK', 'block', 'Hull'),
    qaFinding('B_WARN', 'warn'),
    qaFinding('C_NOTE', 'observe', 'Hull'),
  ]);
  expect(qaErrorsAndWarnings(report)).toEqual([
    { code: 'A_BLOCK', subject: 'Hull', disposition: 'block', message: 'A_BLOCK was measured.' },
    { code: 'B_WARN', disposition: 'warn', message: 'B_WARN was measured.' },
  ]);
  // The subject is the entity the finding names, in the order the engine's own summaries use.
  expect(findingSubject({ affected: { node: 'Mesh', nodePath: 'Root/Mesh', material: 'Stone' } })).toBe('Root/Mesh');
  expect(findingSubject({ affected: { material: 'Stone', texture: 'Albedo' } })).toBe('Stone');
  expect(findingSubject({})).toBeUndefined();
});

test('a review that settles every QA error and warning in its stored report validates', () => {
  const settled = review();
  expect(validate([settled])).toEqual([settled]);
  // No errors or warnings: nothing to settle. Informational notes need no resolution.
  const clean = review({
    qaReport: store(evidence([qaFinding('GEO_PART_SELF_INTERSECTION_UNMEASURED', 'observe')])),
    findings: [],
  });
  expect(validate([clean])).toHaveLength(1);
  // A finding an earlier revision had may be recorded as fixed: this report no longer carries it.
  const history = review({
    findings: [
      ...review().findings,
      { code: 'FLUSH_FACES', resolution: 'fixed', note: 'The parent revision had two coplanar caps.' },
    ],
  });
  expect(validate([history])).toHaveLength(1);
});

test('a verified review is refused when any item of the bar is unmet or unrecorded', () => {
  const flushReport = (pairs: number, truncated: boolean) =>
    store(evidence(spouts, { flushFaces: { pairs, truncated, unexaminedParts: 0, triangles: 12, examined: 12 } }));
  refused({ flushFaces: { pairs: 1, truncated: false, unexaminedParts: 0 }, qaReport: flushReport(1, false) }, /complete flush-face check with no pair/);
  refused({ flushFaces: { pairs: 0, truncated: true, unexaminedParts: 0 }, qaReport: flushReport(0, true) }, /complete flush-face check with no pair/);
  refused({ flushFaces: { pairs: 0, truncated: false } }, /unexamined/i);
  refused({ findings: [{ code: 'GEO_PART_CONNECTIVITY', subject: 'Spout', resolution: 'accepted', note: ' ' }] }, /note/i);
  refused({ findings: [{ code: 'GEO_PART_CONNECTIVITY', subject: 'Spout', resolution: 'ignored', note: 'n' }] }, /resolution/i);
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
  expect(() => validate([review(), review()])).toThrow(/duplicate/i);
  expect(() => validateVerifiedReviews({ bar: VERIFIED_BAR_VERSION + 1, reviews: [] })).toThrow(/bar/i);
});

test('every record names its stored QA report, and the report must be the one for these bytes', () => {
  const { qaReport: _omitted, ...unnamed } = review();
  expect(() => validate([unnamed])).toThrow(/qaReport/);
  refused({ qaReport: { path: '../gallery-verified.json', sha256: review().qaReport.sha256 } }, /qaReport.path/);
  refused({ qaReport: { path: 'gallery-verified/qa/missing.json', sha256: '0'.repeat(64) } }, /could not be read/);
  refused({ qaReport: { ...review().qaReport, sha256: '0'.repeat(64) } }, /does not match its SHA-256/);
  refused({ qaReport: store(evidence(spouts, { glbSha256: '1'.repeat(64) })) }, /QA report is for other GLB bytes/);
  refused({ qaReport: store(evidence(spouts, { kind: 'something-else' })) }, /not a gallery QA report/);
  refused({ qaReport: store({ ...evidence(spouts), qa: { dimensions: 'none' } }) }, /engine QA report/);
  // The record's flush result is the one the stored measurement found.
  refused({ flushFaces: { pairs: 0, truncated: false, unexaminedParts: 2 } }, /flushFaces differs from the QA report/);
});

test('a verified review is refused unless every error and warning in its QA report is settled with a note', () => {
  // Leaving a warning out is no longer possible: the validator reads the report.
  refused({ findings: [] }, /GEO_PART_CONNECTIVITY on Spout is not settled/);
  // Each finding is matched by code and subject, one entry per finding.
  refused({ findings: [{ ...review().findings[0]!, subject: 'Basin' }] }, /GEO_PART_CONNECTIVITY on Spout is not settled/);
  const twice = store(evidence([...spouts, qaFinding('GEO_PART_CONNECTIVITY', 'warn', 'Spout')]));
  refused({ qaReport: twice }, /2 GEO_PART_CONNECTIVITY on Spout findings, 1 settled/);
  expect(validate([review({ qaReport: twice, findings: [review().findings[0]!, review().findings[0]!] })])).toHaveLength(1);
  // An error counts the same way.
  refused({ qaReport: store(evidence([qaFinding('MAT_TEXTURE_UV_MISSING', 'block', 'Hull'), ...spouts])) }, /MAT_TEXTURE_UV_MISSING on Hull is not settled/);
  // A finding these bytes still carry is not fixed.
  refused({ findings: [{ ...review().findings[0]!, resolution: 'fixed' }] }, /still reported, so it is not fixed/);
  // An accepted note must answer a finding the report carries.
  refused({ findings: [...review().findings, { code: 'UNIVERSAL_DUPLICATE_NODE_NAME', resolution: 'accepted', note: 'n' }] }, /accepts UNIVERSAL_DUPLICATE_NODE_NAME, which the QA report does not carry/);
  refused({ findings: [...review().findings, { code: 'GEO_PART_SELF_INTERSECTION_UNMEASURED', resolution: 'accepted', note: 'n' }] }, /informational notes need no resolution/);
});

test('a verified review keeps parts the flush check could not measure only with the owner’s written note', () => {
  const skinned = (findings: VerifiedFinding[], verdict: 'verified' | 'rejected' = 'verified') =>
    review({
      verdict,
      flushFaces: { pairs: 0, truncated: false, unexaminedParts: 9 },
      qaReport: store(evidence(spouts, { flushFaces: { pairs: 0, truncated: false, unexaminedParts: 9, triangles: 0, examined: 0 } })),
      findings: [...review().findings, ...findings],
    });
  const owner: VerifiedFinding = {
    code: 'FLUSH_FACES_UNMEASURED',
    resolution: 'accepted',
    note: 'Owner accepted: the served GLB is skinned, so the flush check measured none of its triangles.',
  };
  expect(() => validate([skinned([])])).toThrow(/9 parts the flush-face check could not measure need the owner's written note/);
  expect(validate([skinned([owner])])).toHaveLength(1);
  expect(() => validate([skinned([{ ...owner, note: ' ' }])])).toThrow(/a written note is required/);
  // The note answers only a check that left parts unmeasured, and those parts are not fixed.
  refused({ findings: [...review().findings, owner] }, /accepts FLUSH_FACES_UNMEASURED, but the flush-face check measured every part/);
  expect(() => validate([skinned([{ ...owner, resolution: 'fixed' }])])).toThrow(/FLUSH_FACES_UNMEASURED is still reported, so it is not fixed/);
  // A rejected review needs no such note.
  expect(validate([skinned([], 'rejected')])).toHaveLength(1);
});

test('a pending record from the review script is refused until the owner decides it', () => {
  refused({ status: 'pending' }, /pending/);
});

test('a rejected review is kept with its QA report, without meeting the bar, and never marks', () => {
  const flushed = store(evidence(spouts, { flushFaces: { pairs: 3, truncated: false, unexaminedParts: 0, triangles: 12, examined: 12 } }));
  const rejected = review({ verdict: 'rejected', flushFaces: { pairs: 3, truncated: false, unexaminedParts: 0 }, qaReport: flushed, findings: [] });
  expect(validate([rejected])).toEqual([rejected]);
  expect(verifiedReviewFor(fountain, [rejected])).toBeUndefined();
  // Its evidence is still checked.
  expect(() => validate([{ ...rejected, qaReport: { ...flushed, sha256: '0'.repeat(64) } }])).toThrow(/SHA-256/);
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
