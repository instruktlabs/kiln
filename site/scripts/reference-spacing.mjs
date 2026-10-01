/**
 * The Golden Gate Bridge reference ledger as the site publishes it (`src/data/standalone/golden-gate-reference.md`,
 * served as the page's REFERENCE.md download and rendered in its "Scope and historical reconciliation" section).
 *
 * The author's file (`site-build/inputs/golden-gate/REFERENCE.md`, read-only, byte-identical to the round-3 site copy)
 * lost the spaces between some words and the numbers after them ("gives470ft", "the3.81 m", "April1935"). Measured on
 * 2026-09-30: the input holds no non-breaking or narrow space code points (U+00A0, U+2007, U+2009, U+202F), nor does
 * the author's own copy, so the rendering strips nothing; the spaces are missing from the input itself. The site's
 * copy restores them with the fixed list below. Every correction must match exactly once and must differ from its
 * source only in whitespace, so no word, sign or number can change here. Special spaces, should a later input carry
 * them, become plain spaces at the same boundary.
 */

export const SPECIAL_SPACES = /[    ]/g;

/** [as the author's file has it, as the site publishes it]; in file order. */
export const REFERENCE_SPACING = [
  ['piers as140×66 ft=42.672×20.1168 m', 'piers as 140×66 ft = 42.672×20.1168 m'],
  ['dimensions, topY13.4112, a46×23.6 m', 'dimensions, top Y 13.4112, a 46×23.6 m'],
  ['the original91.44×47.244 m', 'the original 91.44×47.244 m'],
  ['The older5ftgap is', 'The older 5 ft gap is'],
  ['provide47 photographs', 'provide 47 photographs'],
  ['informs15 gusset fins', 'informs 15 gusset fins'],
  ['Proceedings, April1935,', 'Proceedings, April 1935,'],
  ['gives470ft sag and the300×155ft fender', 'gives 470 ft sag and the 300×155 ft fender'],
  ['supplies12in×32in units. Unit length2m and22mm visual', 'supplies 12 in × 32 in units. Unit length 2 m and 22 mm visual'],
  ['paint#962B20–#A83124, recess#7C2119; warm concrete#625D53–#736D60; asphalt#07090A–#131619', 'paint #962B20–#A83124, recess #7C2119; warm concrete #625D53–#736D60; asphalt #07090A–#131619'],
  ['Paint roughness.48; all painted surfaces metalness0. Four256² procedural', 'Paint roughness .48; all painted surfaces metalness 0. Four 256² procedural'],
  ['near-plane choices(.5–5m)', 'near-plane choices (.5–5 m)'],
  ['of the3.81 m principal-post bay, approximately.9525 m infill', 'of the 3.81 m principal-post bay, approximately .9525 m infill'],
  ['sidewalks flare8.6 m outward over a26 m half-length', 'sidewalks flare 8.6 m outward over a 26 m half-length'],
  ['is a43×52 m base,39×49.5 m main body, roof at61.4 m, and pylon crowns70.65 m', 'is a 43×52 m base, 39×49.5 m main body, roof at 61.4 m, and pylon crowns 70.65 m'],
  ['the preliminary83 m pylons', 'the preliminary 83 m pylons'],
  ['716.1 ft =114.87912,', '716.1 ft = 114.87912,'],
  ['21.9 ft =9.144,', '21.9 ft = 9.144,'],
  ['734.3 ft=223.81464 m; beacon tip 758.2 ft=231.09936 m', '734.3 ft = 223.81464 m; beacon tip 758.2 ft = 231.09936 m'],
  ['steel cap223.81464 and beacon tip231.10', 'steel cap 223.81464 and beacon tip 231.10'],
  ['adopted:13.4112,72,121,161,191,223.81464 m', 'adopted: 13.4112, 72, 121, 161, 191, 223.81464 m'],
  ['Tier widths X:10.0584,7.4,6.5,5.4,4.5 m; Z depths:16.4592,11.4,9.7,8.0,7.0 m', 'Tier widths X: 10.0584, 7.4, 6.5, 5.4, 4.5 m; Z depths: 16.4592, 11.4, 9.7, 8.0, 7.0 m'],
  ['to approx3.7×6.1 m', 'to approx 3.7×6.1 m'],
  ['becomes84.1248 m using143.256 m sag', 'becomes 84.1248 m using 143.256 m sag'],
  ['confirmed:91.44 X ×47.244 Z', 'confirmed: 91.44 X × 47.244 Z'],
];

const squeeze = (text) => text.replace(/\s+/g, '');

/**
 * The published copy of the ledger: special spaces made plain, then the whitespace-only corrections applied. A
 * correction that matches more than once is refused (it would be ambiguous); one that no longer matches is returned
 * in `missing` for the caller to report (a later input may have fixed it; the page-wide glued-number check in
 * validate-static catches anything left).
 */
export function correctReferenceSpacing(text, corrections = REFERENCE_SPACING) {
  const plain = text.replace(SPECIAL_SPACES, ' ');
  let result = plain;
  const missing = [];
  for (const [from, to] of corrections) {
    if (squeeze(from) !== squeeze(to)) throw new Error(`Reference spacing correction changes more than whitespace: ${JSON.stringify(from)}`);
    const count = result.split(from).length - 1;
    if (count > 1) throw new Error(`Reference spacing correction matches ${count} times, not once: ${JSON.stringify(from)}`);
    if (count === 0) missing.push(from);
    else result = result.replace(from, () => to);
  }
  if (squeeze(result) !== squeeze(plain)) throw new Error('The corrected reference differs from its input in more than whitespace');
  return { text: result, applied: corrections.length - missing.length, missing };
}
