/**
 * Display names and text for the archive of earlier examples. The archive data (`public/assets/index.json`, pinned by
 * the gallery build receipt) has no title field and stays as recorded; the pages name each item by rule: the slug's
 * words in sentence case, the run-label prefix "demo-" shown as a badge instead of in the name, and an override map
 * for the names the rule gets wrong (hyphenated compounds, vessel names, codes).
 */
/** @type {Record<string, string>} */
const NAME_OVERRIDES = {
  "cable-stayed-bridge": "Cable-stayed bridge",
  "deep-sea-diver": "Deep-sea diver",
  "hot-air-balloon": "Hot-air balloon",
  "penny-farthing": "Penny-farthing",
  "demo-abyssal-crown-deep-ocean-submarine": "Abyssal Crown deep-ocean submarine",
  "demo-art-deco-conservatory": "Art Deco conservatory",
  "demo-dauntless-cv-08": "Dauntless CV-08",
  "demo-deep-sea-station": "Deep-sea station",
};

const DEMO_PREFIX = "demo-";

/** Whether the item was saved by a recorded demo run (its slug carries the run label). */
/** @param {string} slug */
export const isDemo = (slug) => slug.startsWith(DEMO_PREFIX);

/** "Cable-stayed bridge", "Dauntless CV-08", "Solar sail courier": sentence case, no "Demo" prefix. */
/** @param {string} slug @returns {string} */
export function archiveName(slug) {
  const override = NAME_OVERRIDES[slug];
  if (override) return override;
  const words = (isDemo(slug) ? slug.slice(DEMO_PREFIX.length) : slug).split("-");
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** The name with the demo qualifier, where two items would otherwise share a name (titles, alt text, cards). */
/** @param {string} slug */
export const archiveLabel = (slug) => (isDemo(slug) ? `${archiveName(slug)} (demo)` : archiveName(slug));

/**
 * Spaces missing from the recorded provenance text, restored whitespace only (the record itself is pinned and stays
 * as written): [as recorded, as shown].
 */
/** @type {[string, string][]} */
const SPACING = [["serviceOffset0.20 to0.35", "serviceOffset 0.20 to 0.35"]];
/** @param {string} text */
const squeeze = (text) => text.replace(/\s+/g, "");
for (const [from, to] of SPACING) {
  if (squeeze(from) !== squeeze(to)) throw new Error(`Archive spacing correction changes more than whitespace: ${from}`);
}
/** @param {string} text */
export const spaced = (text) => SPACING.reduce((result, [from, to]) => result.replace(from, to), text);
