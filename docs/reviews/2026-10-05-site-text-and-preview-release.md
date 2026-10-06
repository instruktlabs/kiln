# Site text and preview release

The [cleanup plan](../plans/2026-10-05-site-text-and-preview-cleanup.md) is implemented
with new immutable inputs: Troy `troy-20261005-07`, Bridge `g9-code6`, and Foundry
campus media `preview-20261005-01`. Existing downloads and retained asset revisions
remain available. This site change does not publish a new engine package.

## Changes

- Troy's initial loading message, progress fallback and eight status separators
  display their intended text. Bridge's terrain metadata is valid UTF-8.
- Maintained source and final production output are checked with fatal UTF-8
  decoding and known mojibake detection. JavaScript/TypeScript cooked literals,
  templates, Astro expressions, JSON values and HTML entities are inspected.
  Normal accented, multilingual and mathematical text remains supported.
- Hash-pinned textual scene archive members are decoded strictly before
  extraction. Bridge's authoring readers also fail on malformed UTF-8. Website
  CI now runs on scene changes, and production builds check their full output.
- The homepage includes both Troy coast and battle pictures and its scene/pack
  links. Four scene cards use a two-column desktop grid.
- Foundry's listing leads with a lower real campus capture and includes building,
  process and transport samples. Its pack introduction shows that campus too.
  The previous aerial capture remains recorded; all inventory/downloads remain.
- Historical review punctuation and two intended accented test paths were
  corrected without changing the review's results or retained asset sources.

## Preservation

The Bridge archive differs in three members: terrain metadata, `pack.json` and
`SHA256SUMS`. Its other 108 archive members are identical. Six plus/minus signs
and one squared sign add seven bytes when encoded correctly; all parsed JSON
values, numbers and terrain contracts retain their intended meaning. Runtime
SHA-256 remains `1a01a81a912157936f05a2060f1df377c418607a83567753e4db2b0257bdb556`.

Independent verification compared 543 protected Troy model, bank, runtime-data
and image files against release 06; every byte matches. Only loading/status
copy, source/pack seals and generated bundles change. Four retained UI helpers
normalize CRLF to LF during regeneration; their normalized source is identical.
The two byte-sealed archer modules keep their exact original hashes.

The new 1440 by 925 Foundry capture is an unretouched canvas image of the staged
Arrival view, with controls hidden. Its pinned PNG is 106,931 bytes, SHA-256
`b10146e32cb3f58ead9c977169f9e0059d994fb03fb40c838bcb4c04ff38181b`.
Responsive WebP/AVIF derivatives use the existing media pipeline.

## Validation and independent review

Focused regressions were observed failing before the fixes. Source validation
checks 729 maintained files with zero errors. Full production validation checks
2,445 textual files with zero errors. Static validation passes 223 routes; the
browser visits all 223 with zero script, console, navigation or HTTP errors.
Typechecks, lint and Astro diagnostics pass. Scene tests pass 716 portable
contracts plus 53 Troy tests; the corrected workspace fixture passes 15 tests.

Local site tests pass 618, with two existing skips and two Windows file-symlink
permission failures. Those symlink assertions remain intact for Linux CI.

Independent review found and closed three prevention gaps: escaped Astro
expression literals, scene-only CI triggers, and malformed UTF-8 archive members
accepted before staging. It also checked multilingual false positives, invalid
syntax, actual loading/control/error states, cold/cached entry, renderer fallback,
image decoding, links, desktop/narrow layouts and immutable payload identities.

Ignored evidence is retained under `site/.localdata/`: `text-*` build/test/static
and route reports, `site-text-review/`, `preview-coverage/`, and the Troy/Bridge
preservation receipts. Release closeout must verify the clean deployed commit
and artifact manifest against the reviewed production output. No new hardware
performance claim is made for these text/image changes.
