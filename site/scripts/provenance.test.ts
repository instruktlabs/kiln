import { describe, expect, test } from 'bun:test';
import { exampleProvenance } from './provenance.mjs';

describe('gallery attribution boundaries', () => {
  test('missing author records remain unknown rather than becoming clean-room evidence', () => {
    const p = exampleProvenance('const meta = {};');
    expect(p.attribution).toBe('Historical collection attribution; no model header');
    expect(p.sourceAccess).toBe('Not recorded');
    expect(p.humanIntervention).toBe('Not recorded');
  });
  test('preserves stated isolation and reviewer input without claiming an independent audit', () => {
    const p = exampleProvenance(
      '// Authored by: muse, via opencode.\n// No example asset or engine implementation was supplied as authoring context.\n// Refined by the same model using source references after reviewer feedback.\n// Geometry reviewed during authoring; material-faithful gallery render reviewed separately.',
    );
    expect(p.attribution).toBe('Source-header credit');
    expect(p.sourceAccess).toContain('declares');
    expect(p.humanIntervention).toContain('Reviewer');
    expect(p.reviewFidelity).toContain('Geometry');
  });
});

test('recorded gallery credit is bound to exact source bytes', async () => {
  const { recordedExampleCredit } = await import('./provenance.mjs');
  const { createHash } = await import('node:crypto');
  const code = 'const meta = {};';
  const record = {
    sourceHash: createHash('sha256').update(code).digest('hex'),
    model: 'GPT-6 Astra',
    harness: 'Codex',
    authoredDate: '2026-09-05',
    provenance: { attribution: 'Recorded model run' },
  };
  expect(recordedExampleCredit(code, record).model).toBe('GPT-6 Astra');
  expect(() => recordedExampleCredit(code + ' ', record)).toThrow('source');
});

test('recorded poster refuses a changed source or image, and ignores the artifact bytes', async () => {
  const { verifyRecordedPoster } = await import('./provenance.mjs');
  const { createHash } = await import('node:crypto');
  const hash = (x: string) => createHash('sha256').update(x).digest('hex');
  const r = { sourceHash: hash('source'), artifactHash: hash('glb'), imageHash: hash('png') };
  expect(() => verifyRecordedPoster(r, 'source', 'png')).not.toThrow();
  for (const bytes of [
    ['changed', 'png'],
    ['source', 'changed'],
  ])
    expect(() => verifyRecordedPoster(r, ...bytes)).toThrow('poster');
  // The point of the narrowing: a receipt whose recorded GLB bytes no longer
  // match anything this runner produces is still a valid receipt. Asserting them
  // is what pinned the gallery build to one operating system.
  expect(() => verifyRecordedPoster({ ...r, artifactHash: hash('other bytes') }, 'source', 'png')).not.toThrow();
});

describe('what an archive page prints from a credit', () => {
  test('a later maintainer revision stays in the record and off the page', async () => {
    const { pageProvenance } = await import('./provenance.mjs');
    const later =
      "Later maintainer revision (2026-11-12): flush-face fix by Claude Sonnet 5.5 via Claude Code, 2 part edits that separate coplanar faces; materials, names, hierarchy and animation are unchanged, and the source is no longer byte-identical to the model's export.";
    const record = {
      attribution: 'Recorded model run',
      humanIntervention: `Header declares no hand-authored source; other intervention not recorded ${later}`,
      poster:
        'Archival GPU poster from the source before the 2026-11-12 flush-face fix. The original receipt is retained as historicalPosterReceipt; this image is not an exact-source render of the current program.',
      maintainerRevisions: [{ previousSourceHash: 'a', sourceHash: 'b', description: 'x' }],
      historicalPosterReceipt: { sourceHash: 'a' },
    };
    const page = pageProvenance(record);
    expect(page.humanIntervention).toBe(
      'Header declares no hand-authored source; other intervention not recorded',
    );
    expect(page.poster).toBe('Picture rendered from an earlier revision of this source.');
    expect(page.attribution).toBe('Recorded model run');
    // The record itself is untouched: the detail is still there for a reader of the data.
    expect(record.humanIntervention).toContain('Later maintainer revision');
    expect(pageProvenance({ ...record, humanIntervention: later }).humanIntervention).toBe(
      'Not recorded',
    );
  });
  test('a credit with a current poster receipt and no later revision prints as recorded', async () => {
    const { pageProvenance } = await import('./provenance.mjs');
    const record = {
      attribution: 'Recorded model run',
      humanIntervention: 'Reviewer feedback; revisions by the credited model',
      poster: 'Gallery GPU render of this exact source.',
      posterReceipt: { sourceHash: 'a' },
    };
    expect(pageProvenance(record)).toEqual(record);
  });
  test('a maintainer line read from a source header prints as one short phrase', async () => {
    const { pageProvenance } = await import('./provenance.mjs');
    const source =
      '// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.\nconst meta = {};';
    const page = pageProvenance(exampleProvenance(source));
    expect(page.humanIntervention).toBe('Maintainer revision, noted in the source header');
  });
});
