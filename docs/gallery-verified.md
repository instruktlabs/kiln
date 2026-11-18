# Verified gallery assets

A verified asset is one exact revision that an owner has reviewed against the bar below. The
mark names that revision and the SHA-256 of the GLB the gallery serves for it. A new revision,
or different bytes for the same revision, is unmarked until it is reviewed again. Unmarked
assets have not been reviewed and are unvetted.

## The bar

Every item is checked on the pinned GLB, not on a rebuild of its source.

1. **No flush faces.** `FLUSH_FACES` reports no pair and was not truncated. The record counts
   the parts it could not measure (skinned, morphed or instanced).
2. **QA findings settled.** Every finding the QA rules report is either fixed in this revision
   or accepted with a written note saying why it stays.
3. **A visual review recorded.** The record names the views looked at (at least the default
   six-view sheet), the backdrop (`neutral`, `dark` or `light`), the renderer, and the
   `viewFidelity` of those views. The views are material-faithful (`materialFaithful: true`)
   and drawn from the pinned bytes (`exactArtifact: true`).
4. **Dated and attributed.** The record carries the review date and the reviewer's role.
5. **Exact identity.** The record names the collection, asset ID, revision ID and GLB SHA-256,
   and they match the gallery card.

## Where records live

`site/src/data/gallery-verified.json` holds one record per reviewed revision and GLB,
including rejected ones. The site checks each record when it builds: a record that claims
`verified` without meeting every item above is refused. A card is marked only when a
`verified` record names its revision and GLB SHA-256. Marked cards lead the gallery's default
order with a label that links here.

The mark does not rank assets by taste.
