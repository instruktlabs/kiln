# Verified gallery assets

A verified asset is one exact revision that an owner has reviewed against the bar below. The
mark names that revision and the SHA-256 of the GLB the gallery serves for it. A new revision,
or different bytes for the same revision, is unmarked until it is reviewed again. Unmarked
assets have not been reviewed and are unvetted.

## The bar

Every item is checked on the pinned GLB, not on a rebuild of its source.

1. **No flush faces.** `FLUSH_FACES` reports no pair, was not truncated and measured every part.
   The record counts the parts it could not measure (skinned, morphed or instanced). A verified
   record keeps such parts only with the owner's written note accepting them, recorded as an
   accepted `FLUSH_FACES_UNMEASURED` finding.
2. **QA findings settled.** A finding is every error and warning in the QA report of the pinned
   GLB; informational notes need no resolution. Each finding is accepted with a written note
   saying why it stays, matched by its code and what it names. A finding the report still
   carries is not fixed; `fixed` records one an earlier revision had.
3. **A visual review recorded.** The record names the views looked at (at least the default
   six-view sheet), the backdrop (`neutral`, `dark` or `light`), the renderer, and the
   `viewFidelity` of those views. The views are material-faithful (`materialFaithful: true`)
   and drawn from the pinned bytes (`exactArtifact: true`).
4. **Dated and attributed.** The record carries the review date and the reviewer's role.
5. **Exact identity.** The record names the collection, asset ID, revision ID and GLB SHA-256,
   and they match the gallery card.

## Where records live

`site/src/data/gallery-verified.json` holds one record per reviewed revision and GLB,
including rejected ones. Each record names the QA report its review used, a file in
`site/src/data/gallery-verified/qa/`, and that file's SHA-256. The site checks each record when
it builds. It refuses a record whose QA report is missing, has another hash, is for other bytes
or found another flush result, and a `verified` record that does not meet every item above. A
card is marked only when a `verified` record names its revision and GLB SHA-256. Marked cards
lead the gallery's default order with a label that links here.

The mark does not rank assets by taste.

## Reviewing candidates

`site/scripts/gallery-verified-review.mjs` measures candidates on the GLB each card serves. It
writes to the ignored `tmp/gallery-verified-review/` a pending record for each, with a proposed
verdict and notes, the QA report the record names and one review page with the views. Its
`--promote` option records the owner's decisions after checking them against the bar;
`--accept-unmeasured` adds the owner's note for parts the flush-face check could not measure.
