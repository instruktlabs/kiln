import { createHash } from 'node:crypto';

/** Sidecar credits preserve byte-exact model source and refuse stale attribution. */
export function recordedExampleCredit(source, record) {
  if (!record) return null;
  if (record.sourceHash !== createHash('sha256').update(source).digest('hex'))
    throw new Error('Recorded example source hash does not match.');
  if (
    typeof record.model !== 'string' ||
    typeof record.harness !== 'string' ||
    typeof record.provenance?.attribution !== 'string'
  )
    throw new Error('Incomplete recorded example credit.');
  return {
    model: record.model,
    harness: record.harness,
    authoredDate: record.authoredDate,
    provenance: { ...exampleProvenance(source), ...record.provenance },
  };
}

/** Preserve author declarations without presenting them as an isolation audit. */
export function exampleProvenance(source) {
  const explicit = /^\/\/ Authored by:/m.test(source);
  const noExamples = /no access to this repository|No example asset or engine implementation/i.test(
    source,
  );
  return {
    attribution: explicit
      ? 'Source-header credit'
      : 'Historical collection attribution; no model header',
    sourceAccess: noExamples
      ? 'Source header declares no repository implementation or finished examples supplied'
      : 'Not recorded',
    inheritedContext: 'Not independently recorded; source-header declarations only',
    startingExample: noExamples ? 'None supplied, according to source header' : 'Not recorded',
    // The header line itself is in the source the page prints; the credit only says it is there.
    humanIntervention: /^\/\/ Maintainer revision:/m.test(source)
      ? 'Maintainer revision, noted in the source header'
      : /reviewer feedback/i.test(source)
        ? 'Reviewer feedback; revisions by the credited model'
        : /Not a line of it is hand-authored/i.test(source)
          ? 'Header declares no hand-authored source; other intervention not recorded'
          : 'Not recorded',
    reviewFidelity: /Geometry reviewed during authoring/i.test(source)
      ? 'Geometry during authoring; material-faithful gallery review performed separately'
      : /looked at its own six-view contact sheet/i.test(source)
        ? 'Six-view review declared; renderer fidelity not recorded'
        : 'Not recorded',
    poster:
      'Archival gallery render. Its exact source revision and renderer settings were not recorded with the image.',
  };
}

/**
 * What an archive page prints from a credit. A record keeps every detail of a later maintainer
 * revision for a reader of the data (`maintainerRevisions`, `historicalPosterReceipt`, the
 * source header); the page prints the original statement and one short line about the picture.
 */
export function pageProvenance(provenance) {
  if (!provenance) return provenance;
  const page = { ...provenance };
  if (typeof page.humanIntervention === 'string') {
    const later = page.humanIntervention.search(/\s*Later maintainer revision \(/);
    if (later >= 0) page.humanIntervention = page.humanIntervention.slice(0, later) || 'Not recorded';
  }
  if (page.historicalPosterReceipt && !page.posterReceipt)
    page.poster = 'Picture rendered from an earlier revision of this source.';
  return page;
}

/**
 * A recorded poster claims this image was rendered from this source. Both halves
 * are asserted here; the receipt's `artifactHash` deliberately is NOT.
 *
 * It used to be, and that single assertion is what pinned the gallery build to
 * `windows-2022`. A GLB's bytes are not a property of the asset: they carry the
 * serializer's own choices, and rebuilding the same source elsewhere reproduces
 * the geometry exactly while the container can differ. Two causes were found.
 * `asset.generator` wrote the serializer's version number into every artifact,
 * which `src/render.ts` now pins to a stable string -- that one is fixed at the
 * source, and with it pinned all 86 examples are byte-identical across
 * `@gltf-transform` 4.4.1 and 4.5.0. The Linux/Windows divergence is a separate
 * cause and is not fixed, which is why this is a narrowing and not a re-record.
 *
 * So `artifactHash` in a receipt names the bytes the poster was rendered FROM, on
 * the machine that recorded it, and stays in the record as provenance. Asserting
 * it against a rebuild claimed something the format never promised.
 */
export function verifyRecordedPoster(record, source, image) {
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (record.sourceHash !== hash(source) || record.imageHash !== hash(image))
    throw new Error('Recorded poster is stale; regenerate it from the current gallery source.');
}
