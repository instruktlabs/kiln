# Site text and preview cleanup

Date: 5 October 2026. Analysis and proposed implementation; no site fixes or new
deployment have been made for this plan. Baseline: main `b3cc5048d362fb73324dcab5fb6ff636cb6d6614`,
production Troy `troy-20261005-06` and Bridge `g9-code5`.

## End state

All public Kiln pages and scene controls display readable text, including loading,
progress, secondary controls and errors. The homepage includes Troy's coast and
battle pictures alongside the other scenes. Foundry Floor previews show its campus
buildings as well as its equipment. Automated checks catch encoding damage before
publication, and the corrected release preserves existing assets, gameplay and
runtime performance.

## Confirmed findings

| Location | Finding | Action |
| --- | --- | --- |
| `scenes/packages/troy/web/index.html:36` | Initial loading ellipsis is already corrupted in the saved HTML. | Correct maintained markup. |
| `scenes/packages/troy/web/main.mjs:180,203,212,217` | Eight corrupted separator occurrences in scene details, landing playback, hero playback/fight and gate status. | Correct those display strings. |
| `site/src/components/troy-scene-session.ts:80` | Corrupted ellipsis in the progress fallback. | Correct the fallback and assert its actual output. |
| Published Troy `web/index.html`, `web/main.mjs`, `web/bundle/main.js` and the site's compiled Troy session chunk | The same saved defects are delivered on HTTPS; hashes match the production artifact manifest. | Rebuild from corrected source and publish a new immutable scene release. |
| Published Bridge `terrain/manifest.json` | Invalid UTF-8. Three descriptive fields contain legacy bytes for plus/minus and squared symbols. Windows-1252 decoding recovers their intended text; normal UTF-8 decoding inserts replacement characters. | Repair the input metadata, validate it at staging and seal a fresh Bridge derivative. Preserve all numeric fields and terrain/model bytes. |
| `site/src/pages/index.astro`, section headed "The saved work is yours to inspect." | Its scene cards are Farm, Bridge and Foundry; Troy is absent. Confirmed on the live homepage. | Add Troy using its existing coast and battle posters and pack/scene links. |
| `site/src/pages/packs/index.astro` | Foundry's six selected thumbnails are EUV scanner, etch tool, furnace, stocker, OHT vehicle and FOUP. None represents its architecture. | Include campus/building imagery in the pack introduction. |
| `site/src/components/FoundryFloorPack.astro` | Building models are present further down in the grouped inventory, but there is no campus picture leading the pack page. | Add a clear architectural introduction above the inventory. |

The repository scan covered 3,771 tracked text files, all valid UTF-8. That does
not mean their strings are correct: already-corrupted text can itself be valid
UTF-8. Additional hits occur in one historical review document and two workspace
test directory names. Those are separate from the public scene UI.

The expanded artifact audit covered 2,439 text resources from the exact production
manifest. It checked raw text and parsed JavaScript string/template values, so
escaped characters in minified bundles are included. There were no JavaScript
parse failures. Its confirmed hits are the Troy copies and Bridge metadata above.
This inventory does not establish that every live interaction is clean. The
owner has observed other scene/control occurrences; interactive coverage across
all four scenes remains part of implementation acceptance, including cold and
cached sessions and both renderers.

## Why it happens

The Troy strings exhibit mojibake: UTF-8 bytes interpreted through a legacy
encoding and then saved again, sometimes more than once. A reproducible example
is U+2026 (ellipsis): its UTF-8 bytes decoded as Windows-1252 produce the exact
first-stage corruption in the site fallback; repeating the operation produces
the damaged Troy HTML ellipsis. The middle-dot prefixes show additional encoding
damage around an otherwise correct U+00B7 separator.

The malformed literals are in Git and the served artifacts. Troy's HTML already
declares UTF-8 and its HTTPS response is `text/html; charset=utf-8`; its served
bytes match the build. The confirmed defect therefore precedes delivery. A
changed font, cache purge or charset header cannot reconstruct these literals.
The exact editor or command that first damaged them has not been established.

Bridge has a different failure mode: its input JSON was saved with legacy bytes,
and existing readers/staging checks do not reject invalid UTF-8. Both cases need
coverage: valid-but-corrupted strings and invalid byte sequences.

The existing page copy checks cover number spacing, licence spelling and review
status. Functional browser checks catch script/network errors. Neither currently
asserts that displayed control text is free of encoding damage, which explains
how the release could pass those checks.

Standards: [WHATWG Encoding](https://encoding.spec.whatwg.org/) defines UTF-8 and
legacy decoding; [HTML character encoding declarations](https://html.spec.whatwg.org/multipage/semantics.html#charset)
define document charset handling. UTF-8 should remain the transport and file
encoding throughout.

## Implementation order

1. **Complete the interaction inventory.** Inspect Farm, Vehicles asset previews,
   Bridge, Foundry and Troy on the live site and matching local build. Exercise
   loading/progress, More/secondary controls, view changes, timeline labels,
   input modes, quality choices and error/fallback states. Inspect both WebGPU
   and WebGL2, and compare cold/cached sessions. Record route, control, rendered
   text and its source before correcting any additional occurrence. Scan public
   HTML text/attributes, JSON and decoded JS literals; preserve legitimate
   multilingual text and punctuation.
2. **Correct the maintained inputs with focused failing tests first.** Replace
   known damaged strings with their intended punctuation. Use HTML entities in
   markup, JS Unicode escapes such as `\u00b7` in text strings, or ordinary ASCII
   `...` for loading copy. Entities must not be assigned literally to
   `textContent`. Repair Bridge metadata through an explicit, reviewed conversion
   of the identified legacy input. Assert unchanged numeric/terrain contracts.
   Correct the unrelated test path names separately; record any historical prose
   correction without changing its recorded results.
3. **Add prevention at the relevant boundaries.** Use fatal UTF-8 validation for
   textual scene inputs and public build output. Add a shared detector for known
   corruption sequences, tested against the current examples, nested damage,
   escaped JS literals, HTML entities and valid accented/multilingual strings.
   Apply it to maintained public UI strings and compiled output, then to rendered
   control states. A blanket non-ASCII ban or generic runtime text replacement is
   inappropriate. Explicit negative fixtures and quoted historical examples
   require narrow exclusions. Wire the checks into scene/site CI and the full
   production build, which includes sealed scene packs absent from reduced CI.
4. **Fix preview coverage.** Add a Troy homepage card using both existing posters,
   the common ScenePoster component, a pack link and a scene link. Prefer a
   readable two-column desktop arrangement for the four scene cards; update image
   sizes for the actual grid. For Foundry, lead with a campus image and mix building
   modules with tools/transport in the featured samples. Reuse existing pinned
   `s1-head-w`/`s2-hall-w` and related posters where their composition works.
   Existing campus captures show the architecture, but some individual posters
   are roof-dominated: choose a lower, tighter real scene capture if needed to make
   building height and facades clear. Show proposed images before final selection.
   Use readable captions, accurate alt text and existing responsive/lazy-loading
   conventions. Keep all inventory models and download options available.
5. **Rebuild and publish corrected derivatives.** Create fresh immutable Troy
   and Bridge release IDs, update their seals/pins/catalog references and rebuild
   the site. Retain release 06 and g9-code5 as historical artifacts. Verify that
   GLBs, pose banks, terrain payloads and unrelated source identities are unchanged.
   Preserve the two byte-sealed archer source files and their scoped Git attributes.
   Text/image changes do not justify rebaking character animation or redesigning
   the rendering pipeline.
6. **Review and verify the release.** Have an independent reviewer check detector
   false positives, sealed input preservation, actual displayed strings, image
   coverage and stale-cache behavior. Run affected tests, required scene/site
   checks and the full production build. Publish after the fixes are qualified,
   verify deployed commit/manifest and new immutable paths, then repeat the actual
   loading/control flows and image checks on HTTPS. Test desktop and narrow/mobile
   layouts. No new performance claim is needed for a text-only correction; if a
   discovered fix changes runtime behavior, qualify that change separately.

## Acceptance

- Every exercised loading, progress, control, secondary-panel and error label is
  readable on all maintained scenes and asset previews.
- Strict decoding finds no invalid UTF-8 in the current public textual inputs;
  decoded copy checks find no unaccounted corruption sequences.
- The homepage visibly includes both Troy compositions and working pack/scene
  links. Foundry's pack listing and introduction visibly include architecture,
  with buildings readable at thumbnail sizes.
- Existing runtime/editable downloads, asset/animation/terrain identities,
  lifecycle behavior and normal international text remain correct.
- Exact deployed identity, immutable resource versions and real HTTPS flows are
  verified; previous releases and unrelated local work remain preserved.

## Evidence and current limits

Ignored local evidence is under `site/.localdata/encoding-audit-20261005/`:
`report.json` (source/HTTPS audit), `artifacts-report.json` (decoded compiled
strings and invalid bytes), plus the audit scripts. The production artifact
manifest SHA-256 is `767fd55b364e46398c46eb612e40140be4de1034b7cf0fd2bb0990cb8d6ccc80`.
Bridge metadata's HTTPS bytes match its recorded SHA-256
`73000e5b01ab86a6a7cd2133f94dbb08e840fd9219c053bb63edbba5fe57bf12`.

The implementation and interactive site-wide acceptance above remain to be done.
This record is a plan, not a claim that the defects have already been fixed.

## Implementation record

The implementation and candidate validation are recorded in
[the site text and preview release review](../reviews/2026-10-05-site-text-and-preview-release.md).
That later record supersedes the pending implementation status above; the
findings here remain the original analysis of release 06 and Bridge code5.
