import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { correctReferenceSpacing, REFERENCE_SPACING } from './reference-spacing.mjs';
import { gluedNumberErrors, gluedWords } from './static-validation-core.mjs';

const site = join(import.meta.dir, '..');
const published = readFileSync(join(site, 'src/data/standalone/golden-gate-reference.md'), 'utf8');

/**
 * The content reviewer's 39 places (content review, finding 2), in the words the reviewer quoted from the ledger.
 * Two of them are not a letter, `#` or `:` running into a digit ("choices(.5–5m)" and "base,39"): the correction list
 * restores them, and the page-wide rule cannot see them.
 */
const REVIEWER_PLACES = [
  'as140×66', 'topY13.4112', 'a46×23.6', 'original91.44×47.244', 'older5ftgap',
  'provide47', 'informs15',
  'April1935', 'gives470ft', 'the300×155ft',
  'supplies12in×32in', 'length2m', 'and22mm',
  'paint#962B20', 'recess#7C2119', 'concrete#625D53', 'asphalt#07090A', 'roughness.48', 'metalness0', 'Four256²',
  'choices(.5–5m)',
  'the3.81', 'approximately.9525', 'flare8.6', 'a26', 'a43×52', 'base,39×49.5', 'at61.4', 'crowns70.65', 'preliminary83',
  'cap223.81464', 'tip231.10',
  'adopted:13.4112,72,121,161,191,223.81464', 'X:10.0584,7.4,6.5,5.4,4.5', 'depths:16.4592,11.4,9.7,8.0,7.0', 'approx3.7×6.1', 'becomes84.1248', 'using143.256', 'confirmed:91.44',
];
const NOT_RULE_DETECTABLE = ['choices(.5–5m)', 'base,39×49.5'];

/** The author's text, rebuilt from the published copy by undoing each whitespace-only correction. */
const authorsText = REFERENCE_SPACING.reduce((text, [from, to]) => text.replace(to, () => from), published);

describe('the bridge reference ledger (item 5; content review, finding 2)', () => {
  test('the fixture holds the reviewer\'s 39 places, and each one is in the author\'s text', () => {
    expect(REVIEWER_PLACES.length).toBe(39);
    for (const place of REVIEWER_PLACES) expect(authorsText.replace(/\s+/g, ' ')).toContain(place.split(',')[0]);
  });

  test('the page-wide rule flags every place a letter, # or : runs into a number', () => {
    for (const place of REVIEWER_PLACES) {
      const flagged = gluedWords(`The ledger says ${place} here.`);
      if (NOT_RULE_DETECTABLE.includes(place)) expect(flagged).toEqual([]);
      else expect(flagged.length).toBeGreaterThan(0);
    }
  });

  test('the correction reproduces the published copy from the author\'s text, whitespace only, all 25 corrections applied', () => {
    const corrected = correctReferenceSpacing(authorsText);
    expect(corrected.missing).toEqual([]);
    expect(corrected.applied).toBe(REFERENCE_SPACING.length);
    expect(corrected.text).toBe(published);
    expect(corrected.text.replace(/\s+/g, '')).toBe(authorsText.replace(/\s+/g, ''));
  });

  test('none of the 39 places is left in the published copy, and its prose has no glued word', () => {
    const flat = published.replace(/\s+/g, ' ');
    for (const place of REVIEWER_PLACES) expect(flat).not.toContain(place);
    // The ledger's prose, outside inline code spans, as the page renders it.
    expect(gluedWords(published.replace(/`[^`]*`/g, ' '))).toEqual([]);
  });

  test('non-breaking and narrow spaces become plain spaces at the same boundary', () => {
    expect(correctReferenceSpacing('span ft m x y', []).text).toBe('span ft m x y');
  });

  test('a correction that would change more than whitespace, or that matches twice, is refused; one that no longer matches is reported', () => {
    expect(() => correctReferenceSpacing('gives470ft', [['gives470ft', 'gives 480 ft']])).toThrow('changes more than whitespace');
    expect(() => correctReferenceSpacing('a46 and a46', [['a46', 'a 46']])).toThrow('matches 2 times');
    expect(correctReferenceSpacing('already spaced', [['gives470ft', 'gives 470 ft']])).toEqual({ text: 'already spaced', applied: 0, missing: ['gives470ft'] });
  });
});

describe('glued numbers on a page', () => {
  test('flag prose, and leave code, URLs, ids, colours, versions, codes and powers alone', () => {
    const html = '<html><head><title>April1935</title></head><body><main><p>It gives470ft of sag in April1935.</p>'
      + '<p>Revision r_76c7a4080e7844e185896b7e1b196e5a, colour #962B20, Kiln 0.9, g7, ff2, LOD0, CC0-1.0, 256² maps, 16:9, Three.js r186, Direct3D.</p>'
      + '<pre><code>const width=10.0584;</code></pre><p><code>topY13.4112</code> <a href="https://example.com/a1b2">https://example.com/x9</a></p>'
      + '<svg><text>a46</text></svg></main></body></html>';
    expect(gluedNumberErrors(html)).toEqual(['A number is glued to the word before it: "gives470ft"', 'A number is glued to the word before it: "April1935"']);
  });
});
