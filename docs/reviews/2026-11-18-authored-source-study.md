# Authored source study (18 November 2026)

This study looks at how agent-authored Kiln program source reads and where agents get it wrong,
for [issue #375](https://github.com/instruktlabs/kiln/issues/375). It is analysis only: no API,
helper, check or skill text changes with it. Like other dated reviews it is a historical record,
not an override of code, `AGENTS.md` or the maintained skills.

Labels used throughout: **M** measured here, **D** derived by arithmetic from measured numbers,
**E** estimated or judged by reading.

## Summary

- **M** Over 836 saved sources (433 distinct assets) and 74 agent transcripts holding 375 build
  calls, the commonest source defect is not a helper argument at all. Agents place parts with
  literal coordinates and then repair contact and clearance by nudging those literals: 147 edits in
  19 sessions changed 525 numbers, with a median change of 5 mm.
- **M** The error kinds the issue names as suspects were rare or absent. No saved source passes
  radians to a degree helper, none adds a `createPart` result to a second parent, and none leaves an
  async helper unawaited. Unit mistakes (centimetres or millimetres written as metres) did not
  appear. Argument order appeared once: one session swapped `boxGeo` X and Z for seven calls.
- **M** What did recur: opaque sandbox rejections that cost several turns each (8 calls in 4
  sessions), tool input shape errors (6 in 4), helper preconditions and renamed options (4 in 4),
  invented helper names (5 in 3), and ES module syntax (3 sessions).
- **M** Source size is dominated by local code, not by helper calls. Top-level and nested local
  helper functions hold 53.7% of non-whitespace bytes; comments 14.1%; part placement calls 12.2%;
  material setup 5.1%. Most pack assets (302 of 347) are built as a few merged meshes from hand
  buffers, not as part assemblies.
- **M** Code is copied between the assets of a pack: 64% of non-trivial lines in a pack asset also
  appear verbatim in another asset of the same pack (93% in `holodeck`). Existing structure helpers
  are almost unused: `wallWithOpening`, `room`, `mirror`, `repeatInstances` and `replicateAssembly`
  appear in none of the 433 assets, `arrayLinear` in one.
- **D** Declarative mock-ups for a fence bay, a farmhouse window wall, a doorway and a door leaf
  are 30% to 72% smaller than today's code. None of them is implemented, and each proposal below
  comes with a plan for proving that existing sources still build byte-identically.

## Sample

### Saved sources

**M** Every saved program source in the repository at `9dfba816`, plus the pinned example archive.

| Set | Files | Distinct assets | Created |
| --- | ---: | ---: | --- |
| `packs/*/sources/project/<asset>/<revision>/source.kiln.js` and `packs/troy/assets/*.kiln.js` | 625 + 21 | 347 | 2026-09-27 to 2026-11-13 |
| Example archive `examples/` (revision `903b9e9c`) | 86 | 86 | not recorded |
| Example archive `site/examples/history` | 104 | (revisions of the above) | not recorded |
| **Total** | **836** | **433** | |

Pack revisions and distinct assets (the troy assets folder and its saved sources are one pack):

| Pack | Revisions | Assets |
| --- | ---: | ---: |
| cabin-woods-psx-horror | 64 | 53 |
| farm | 57 | 23 |
| foundry-floor | 144 | 62 |
| golden-gate-bridge | 35 | 1 |
| holodeck | 235 | 188 |
| troy | 87 | 20 |
| vehicles | 24 | 6 |

The six `vehicles` assets share asset IDs with `foundry-floor` revisions, so "distinct assets"
counts them once (347 pack assets, not 353) and the per-pack tables below list them under
`foundry-floor`. `cathedral-square`, `h-7` and `seed-town` carry no saved sources and are not in the
sample. Distinct-asset statistics use the latest revision of each pack asset and the archive's
`examples/` only; history revisions would otherwise count near-copies several times.

Pack revisions by recorded author model: claude-sonnet-5-5 135, gpt-6-astra 127, claude-opus-5-5
116, gpt-6 45, gpt-6.1-sol 32, gemini-3.8-flash-high 14, muse-spark 2, not recorded 175. By
harness: Codex 272, Claude Code 251, Antigravity 14, `cli` 10, OpenCode 2, not recorded 97. The
median file is 17,188 bytes and 268 lines.

### Transcripts

**M** Maintainer dogfood transcripts kept outside the repository. They are paraphrased here,
never quoted. 420 JSONL files were scanned; 94 were recognised as agent traces in one of four
formats, and 74 of those contain at least one Kiln call. Antigravity sessions are often stored
twice (an event stream and a conversation transcript, sometimes with copies); each conversation is
counted once, preferring the transcript with tool results.

| Harness | Transcripts | Models (transcripts) |
| --- | ---: | --- |
| Antigravity | 32 | gemini-3.8-flash-high 23, gemini-4-hydrogen 7, gemini-4-argon 2 |
| OpenCode | 22 | muse-spark-1.3-contributor 12, deepseek-v4.1-flash 3, not recorded 7 |
| Codex | 11 | gpt-6 3, not recorded 8 |
| Claude Code | 9 | claude-sonnet-5-5 8, claude-opus-5-5 1 |

They run from 2026-09-16 to 2026-11-13 and hold 1,148 Kiln calls (MCP tools and CLI commands) and
118 file writes or edits to `.kiln.js` files. 375 calls built a program: `kiln_render` 137, CLI
render 108, `kiln_edit` 97, `kiln_validate` 30, CLI validate 3. The 66 program files left beside
those transcripts were run through the source census as a check (0 findings) but are not counted
or quoted below.

The full sets were small enough to process whole, so the counts below are not sampled. The
boilerplate section adds a stratified sample of 24 sources for a per-file view.

## Method

The counting scripts are throwaway and live in `tmp/source-study/` (git-ignored, not committed).
They are not needed to read this review. Follow-up draft 8 proposes a maintained corpus rebuild
script instead of keeping any of them.

- `extract_traces.py` normalises the four transcript formats (Claude Code stream JSON, Codex
  `item.completed`, OpenCode `tool_use` parts, Antigravity event streams and conversation
  transcripts) into one event list: Kiln MCP calls, Kiln CLI commands found in shell calls, and file
  writes or edits whose target ends in `.kiln.js`, each with its result text.
- `classify_calls.py` classifies every build call by its result: `ok`, a tool argument error, a
  source check (`UNKNOWN_HELPER`, `HAS_EXPORT` and so on), a sandbox rejection with or without a
  named cause, QA blocked, an infrastructure error, or no result recorded.
- `mine_fixes.py` pairs each failed or reviewed build with the agent's next change (the `kiln_edit`
  replacements, the file edit, or the diff between consecutive full programs with the same
  `meta.name`) and tags what changed: numbers only, a rotation, a `parent` option, an `await`, an
  `export` removed, a helper swapped, an option renamed.
- `analyze-sources.mjs` parses each source with acorn and walks the tree. It looks for the named
  error kinds (radians in degree helpers, degrees in the THREE radian API, a part added to a second
  parent, async helpers not awaited, two-argument cylinders, an object passed to `createPivot`,
  `Math.random`, `export`), measures boilerplate as non-whitespace byte extents of syntax nodes, and
  collects part names, variable names and numeric literals. `summarise-sources.mjs`,
  `stratified.mjs`, `local-library.mjs`, `cross-dup.mjs`, `dead-helpers.mjs` and `names-units.mjs`
  summarise its output.

Classification is heuristic. Every row in the top-ten table was checked against the transcript
text; the counts in it are the confirmed ones.

## What happened to build calls

**M** Outcomes of the 375 build calls:

| Outcome | Calls |
| --- | ---: |
| Built | 283 |
| No result recorded in the trace | 25 |
| Result present but not classifiable | 24 |
| Edit applied, build skipped (`render: false` or not reported) | 10 |
| Source check failed | 7 |
| Tool argument error | 6 |
| Sandbox rejection, cause named | 3 |
| Sandbox rejection, no cause shown | 8 |
| QA blocked the build | 5 |
| Infrastructure (`spawn EPERM`) | 3 |
| Other error | 1 |

55 of the 283 successful builds carried a QA finding or build warning. `GEO_PART_SELF_INTERSECTION`
appeared on 39 builds in 22 sessions, `FLUSH_FACES` on 9 in 7, `FLOATING_PARTS` on 7 in 5,
`GEO_PART_CONNECTIVITY` on 5 and `GEO_OPEN_SURFACE_PENETRATION` on 3.

**M** 436 changes were mined from 135 follow-up calls. 268 of them followed a review render with no
error, 62 a QA finding, 80 a failed or incomplete build, 15 a build warning and 11 the first build.
Most changes are not fixes of a named error but tuning: a part moved, resized or recoloured after
the agent looked at the views. Of the 147 numbers-only edits, 92 followed a review render, 38 a QA
finding and 12 a failed build.

## The ten most frequent errors

**M** Ranked by sessions affected, then occurrences. "Guidance" names the existing text that already
covers the case.

| # | Error kind | Seen | Example (paraphrased from transcripts) | Existing guidance |
| ---: | --- | --- | --- | --- |
| 1 | Contact and clearance repaired by nudging literal coordinates | 147 edits, 19 sessions | After a self-intersection or a floating part, the agent edits a few literal positions (3.6 values per edit on average) by millimetres and re-renders; 525 values changed, median 5 mm, 63% under 1 cm, 82% under 5 cm | `SKILL.md` "Make the asset"; `references/geometry-recipes.md` "Interfaces that must fit or move" and its `FLUSH_FACES` paragraph |
| 2 | Sandbox rejection with no cause shown | 8 calls, 4 sessions | One agent wrote eight small probe programs to find which statement was refused, then rewrote it | `SKILL.md` "Make the asset" (source-check pointer); the rejection advice text itself |
| 3 | Tool input shape | 6 calls, 4 sessions | `kiln_edit` sent `edits: [null]` three times; `capture` sent as an array, with a `camera.type` field, or with an unrecognised `shots` key | `references/camera-recipes.md`; the tool schemas |
| 4 | Helper preconditions and renamed options | 4 calls, 4 sessions | `roundedBoxGeo` radius not under half the smallest side; `projectUV` given `mode` for `projection`; a texture on `extrudeProfile` output blocked by `MAT_TEXTURE_UV_MISSING` | Discovery contracts; the UV0 note at the end of geometry-recipes "Organic curves and blended volumes" |
| 5 | Invented helper names (`UNKNOWN_HELPER`) | 5 calls, 3 sessions | `tubePath`, `noiseTexture`, `emissiveMaterial`, `deformByNoise`, `rotateGeometry`; one draft imported invented names from a `kiln` module | `SKILL.md` "Make the asset" (Discovery paragraph); `references/program-contract.md` opening |
| 6 | ES module syntax (`HAS_EXPORT`, `HAS_IMPORT`) | 2 failed calls, 6 removal edits, 3 sessions | `export function build()` and an `import` line | `references/program-contract.md` opening ("Do not add imports, exports") |
| 7 | Zero-length normals (`GLTF_ACCESSOR_VECTOR3_NON_UNIT`) | 3 calls, 2 sessions | A hand-merged rivet mesh with collapsed vertices; fixed by replacing it with `cylinderGeo` parts | geometry-recipes "Surfaces from equations" (collapsed rows) and "Shape an existing mesh" (extra `computeVertexNormals`) |
| 8 | `createPart` without `parent` | 4 parts, 2 sessions | The part built but was missing from the asset until `parent: root` was added | `references/program-contract.md` "Frames and ownership"; no source check |
| 9 | `boxGeo` X and Z swapped | 7 calls, 1 session | A run of boxes written as `(depth, height, width)` for an asset whose long axis was X | `SKILL.md` "Make the asset" (frame); geometry-recipes "Surfaces from equations" (`boxGeo(length, height, thickness)`) |
| 10 | Material argument form | 2 calls, 1 session | `gameMaterial` given a `THREE.Color`; `createPart` given an array of materials; the agent then bypassed `createPart` with a raw mesh | Discovery contracts and the rejection message only |

Single occurrences: `createPivot` given a name that already began `Joint_` (three renames in one
session); a destructuring mismatch in a hand-written mirror loop that produced
`UNIVERSAL_NONFINITE_TRANSFORM`; a `kiln_edit` anchor not found; one `KEYFRAME_VALUE_KEY`.

### By helper

| Helper or tool | Errors seen |
| --- | --- |
| `createPart` | `parent` omitted (4 parts); material array (1) |
| `boxGeo` | X/Z swapped (7 calls, 1 session) |
| `roundedBoxGeo` | radius precondition (1) |
| `projectUV` | `mode` for `projection` (2 edits, 1 session) |
| `extrudeProfile` | texture without UV0 (1) |
| `revolveProfile` | `bevel` option dropped after a failure whose cause the trace does not show (1) |
| `gameMaterial` | `THREE.Color` argument (1) |
| `createPivot` | `Joint_` prefix doubled (1 session) |
| `kiln_edit` | `edits: [null]` (3); anchor not found (1) |
| `kiln_render` `capture` | schema (3) |
| Clip helpers | `KEYFRAME_VALUE_KEY` (1) |

### Named kinds that did not appear

- **M** Radians passed to a degree helper: 0 in 836 saved sources and 0 among the mined fixes. The
  five mined changes tagged as angle conversions were rewrites of a whole section, not repairs. 34
  files define a degrees-to-radians constant and use it at 570 sites; the detector found none of
  them feeding a degree helper. `ROTATION_RADIANS_SUSPECTED` and the `createPart` contract already cover the case.
- **M** Units: no factor-of-100 or factor-of-1,000 slips. The largest literals belong to assets that
  are that large, such as the Golden Gate Bridge.
- **M** A part added to a second parent: 0, once the detector tracks scope rather than names.
  THREE reparents on `add`, so it would not duplicate a part anyway.
- **M** Async helpers not awaited: 0. The seven mined `await` insertions accompany newly added
  calls, not repairs.
- **M** Two-argument cylinders, objects passed to `createPivot`, `Math.random`: 0 in saved sources.

## Boilerplate

### How it was measured

**M** Each source is parsed with acorn. A category's size is the non-whitespace bytes inside the
syntax nodes that belong to it, so formatting does not count. Categories overlap (a placement call
inside a local wrapper inside a loop counts in all three), so they do not add up to 100%.

- **Comments**: line and block comments.
- **Material setup**: calls to the material and texture helpers (`gameMaterial`, `pbrMaterial`,
  `materialRecipe`, `proceduralTexture`, the portable material compilers and the rest of that
  family), and calls to local functions that call them.
- **Placement**: outermost calls to `createPart`, `createInstance`, `beamBetween`, or a local
  wrapper, with their arguments.
- **Local wrappers**: local functions that place a part (directly, through another local function,
  or with `new THREE.Mesh`) and have two or more call sites; `build` and `animate` excluded.
- **Mirror and repeat copies**: placement calls outside loops that match another call once literal
  numbers are masked; a mirror copy differs only in signs, a repeat in values.
- **Placing loops**: `for`, `for...of`, `forEach` and `map` bodies that place parts. Mirror loops
  iterate `[-1, 1]` or left/right labels, radial loops call `sin` or `cos`, linear loops multiply
  the index by a step. "Single-placement" loops (one placement, under 320 bytes) are a subset.
- **Tables**: top-level `const` objects and arrays other than `meta`.
- **Custom geometry**: functions whose body builds a `BufferGeometry`, calls `meshGeo` or sets an
  attribute.
- **Local helper functions**: every top-level function and every function declared directly in
  `build`, except `build` and `animate`.

### All 433 distinct assets

| Category | Share of all bytes | Median share per file |
| --- | ---: | ---: |
| Local helper functions | 53.7% | 56.4% |
| Comments | 14.1% | 10.8% |
| Part placement calls | 12.2% | 2.3% |
| Custom geometry | 9.0% | 5.4% |
| Top-level tables | 8.2% | 1.4% |
| Material setup | 5.1% | 4.1% |
| Local placement wrappers | 2.3% | 0 |
| Placing loops: mirror / radial / linear | 2.2% / 1.7% / 1.1% | 0 |
| Of which single-placement loops | 1.0% | 0 |
| `animate` | 1.4% | 0 |
| Hand-copied mirrored placements | 0.2% | 0 |
| Repeated near-identical placements | 0.1% | 0 |

**M** 7,491,405 non-whitespace bytes in total. Further counts:

- 121 hand-copied mirror pairs in 29 files, and 94 groups of near-identical placements (211 parts)
  in 41 files. Hand copying is rare; agents write loops instead.
- 408 linear placing loops in 91 files, 271 radial in 68, 339 mirror in 84. None of the 91 files
  with linear loops calls `arrayLinear`; 62 of the 68 with radial loops call no `arrayRadial`; none
  of the 100 files with mirror loops or mirror pairs calls `mirror`.
- 418 local placement wrappers in 191 files. Their commonest names are `box` (44), `part` (33),
  `beam` (23), `book` (16) and `cyl` (15): a local shorthand for `createPart(name, boxGeo(...), mat,
  { position, parent })`.
- 397 local functions in 165 files are declared and never referenced again, 1.9% of bytes.
- Construction style: 314 of 433 assets place six or fewer parts and build the rest as custom
  buffers merged into a few meshes (302 of 347 pack assets). 68 assets place 20 or more parts (63 of
  the 86 archive examples). The median pack asset makes one `createPart` call; the median archive
  example makes 46.
- Helper adoption over the 433 assets: `beamBetween` 50 files, `createLadder` 11, `arrayRadial` 10,
  `createInstance` 3, `createStairs` 2, `arrayLinear` 1; `wallWithOpening`, `room`, `mirror`,
  `repeatInstances`, `replicateAssembly` and `snapTo` 0.
- Line density: the median mean line length is 78 characters; 118 files have more than 10% of lines
  over 200 characters. Sonnet 5.5 and GPT-6 Astra sources have a median mean line length of 126.

### Stratified sample of 24 sources

**M** Three latest revisions per pack chosen with a seeded generator (seed 375; Golden Gate has one
asset), four archive examples, and the rest from `holodeck`, the largest pack. Shares are percent of
the file's non-whitespace bytes; "Loops" adds the mirror, radial and linear placing loops; "Local
helpers" is the share in local helper functions. The `vehicles` assets fall in the
`foundry-floor` stratum (see [Saved sources](#saved-sources)); Generic Hatchback is one of them.

| # | Pack | Asset | Model | Bytes | Comments | Materials | Placement | Wrappers | Loops | Tables | Custom geometry | Local helpers |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | cabin-woods-psx-horror | Handheld flashlight | gpt-6.1-sol | 4,582 | 1.5 | 1.6 | 0.0 | 0.0 | 0.0 | 24.6 | 7.1 | 45 |
| 2 | cabin-woods-psx-horror | Kitchen open-shelf worktop | claude-sonnet-5-5 | 13,342 | 0.0 | 4.9 | 32.2 | 16.6 | 14.4 | 7.2 | 1.9 | 24 |
| 3 | cabin-woods-psx-horror | Boarded cabin window | unrecorded | 6,393 | 1.0 | 2.9 | 2.4 | 0.0 | 4.1 | 37.5 | 24.8 | 35 |
| 4 | archive | mech | unrecorded | 19,361 | 28.7 | 11.8 | 37.3 | 3.2 | 32.7 | 0.0 | 0.0 | 5 |
| 5 | archive | anglerfish | unrecorded | 19,650 | 15.0 | 2.9 | 15.6 | 8.5 | 20.3 | 6.5 | 11.3 | 40 |
| 6 | archive | demo-battleship | unrecorded | 32,329 | 5.2 | 4.3 | 53.0 | 13.0 | 0.0 | 0.0 | 0.0 | 16 |
| 7 | archive | blast-furnace | unrecorded | 6,898 | 8.9 | 5.2 | 51.8 | 7.5 | 36.5 | 0.0 | 0.0 | 9 |
| 8 | farm | faceted-tree | gpt-6-astra | 3,793 | 0.0 | 21.8 | 24.1 | 0.0 | 0.0 | 0.0 | 37.5 | 48 |
| 9 | farm | Windmill | gemini-3.8-flash-high | 28,218 | 22.0 | 5.7 | 1.2 | 0.0 | 0.0 | 0.0 | 27.5 | 28 |
| 10 | farm | Farm barrel | gpt-6-astra | 5,228 | 3.9 | 26.6 | 1.7 | 1.6 | 0.0 | 0.0 | 1.6 | 22 |
| 11 | foundry-floor | FOUP | unrecorded | 10,594 | 20.5 | 1.8 | 7.2 | 0.0 | 0.0 | 0.3 | 0.0 | 12 |
| 12 | foundry-floor | Generic Hatchback | gpt-6-astra | 24,691 | 3.6 | 3.5 | 1.0 | 0.0 | 0.0 | 15.7 | 0.6 | 79 |
| 13 | foundry-floor | s2-hall-E | claude-sonnet-5-5 | 20,839 | 12.4 | 3.1 | 0.0 | 0.0 | 0.0 | 3.6 | 4.4 | 56 |
| 14 | golden-gate-bridge | Golden Gate Bridge | claude-sonnet-5-5 | 40,200 | 2.0 | 5.9 | 9.8 | 0.5 | 27.9 | 1.9 | 33.2 | 45 |
| 15 | holodeck | Winter mountainside / small-props | claude-sonnet-5-5 | 23,338 | 5.1 | 11.3 | 0.2 | 0.0 | 0.0 | 0.6 | 12.8 | 98 |
| 16 | holodeck | Crescent Cove undergrowth: sword fern | claude-opus-5-5 | 37,700 | 12.2 | 1.2 | 0.5 | 1.3 | 0.0 | 14.1 | 6.7 | 72 |
| 17 | holodeck | cube-mirror-far | unrecorded | 63,622 | 27.2 | 3.1 | 0.7 | 0.0 | 0.0 | 3.0 | 1.8 | 75 |
| 18 | troy | Round shield | unrecorded | 3,996 | 12.3 | 37.6 | 24.1 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |
| 19 | troy | Mature courtyard olive | gpt-6.1-sol | 7,314 | 6.9 | 2.7 | 1.9 | 0.0 | 0.0 | 0.0 | 9.2 | 62 |
| 20 | troy | Late Bronze Age war chariot | GPT-6 | 11,078 | 1.2 | 2.6 | 29.2 | 1.6 | 21.0 | 19.2 | 15.1 | 17 |
| 21 | holodeck | Crescent Cove jetty stair | claude-opus-5-5 | 20,444 | 19.4 | 12.2 | 1.5 | 3.5 | 0.6 | 5.4 | 2.4 | 73 |
| 22 | holodeck | arcade-bay | unrecorded | 66,700 | 28.7 | 3.0 | 0.6 | 0.0 | 0.0 | 2.9 | 1.7 | 76 |
| 23 | holodeck | gateway | unrecorded | 65,346 | 28.2 | 3.1 | 0.7 | 0.0 | 0.0 | 2.9 | 1.8 | 76 |
| 24 | holodeck | pave-field-b | claude-opus-5-5 | 10,878 | 22.2 | 3.0 | 2.6 | 0.0 | 0.0 | 3.7 | 1.0 | 60 |
| | | **Mean** | | | 12.0 | 7.6 | 12.5 | 2.4 | 6.6 | 6.2 | 8.4 | 45 |

The sample agrees with the census: placement, wrappers and loops are large only in assembly-style
sources (rows 2, 4 to 7, 20), and most of each pack source is its own small geometry library. Rows
17, 22 and 23 share the same 8,850-byte `gateway` function.

### Copies between assets

**M** Share of non-trivial lines (25 or more non-whitespace characters) in each asset's latest
revision that also appear verbatim in another asset of the same pack:

| Pack | Assets | Lines shared | Median asset |
| --- | ---: | ---: | ---: |
| holodeck | 188 | 93.0% | 98.5% |
| cabin-woods-psx-horror | 53 | 83.7% | 84.9% |
| foundry-floor (with vehicles) | 62 | 59.5% | 58.9% |
| troy (battle scene reference excluded) | 19 | 43.0% | 30.2% |
| farm | 23 | 24.1% | 15.6% |
| archive examples | 86 | 4.9% | 3.8% |
| **All** | | **64.0%** (68.9% of bytes) | |

The troy battle scene reference is a composite that contains the other troy assets; with it,
troy reads 87.9%. The three farm fence kit files (straight, corner, gate) have 162 lines (9,097
bytes) in common: the same KIT table, timber builder, peg builder and material specs. A fix to a
shared builder has to be made in every copy, and each copy is a separate saved revision.

## Names and units

**M** Over the 433 distinct assets:

- **Part names.** 5,553 `createPart` calls: 2,416 PascalCase literals, 638 Pascal with underscores
  (`Leg_L`), 143 lower or snake case, 863 template literals and 1,497 computed. No part had a
  generic name (`Part1`, `Mesh`, `Box`), and one asset reused a literal name. Part naming is not a
  problem.
- **Variable names.** 70,263 declarations: 29,583 single letters (42%; median per file 42%) and
  12,533 two letters. The commonest are `i` (3,717), `a`, `x`, `j`, `z`, `k` and `g`: loop indices,
  coordinates and geometry handles. 3,730 are UPPER_CASE constants. Only 76 carry a unit suffix:
  `Deg` 44, `Rad` 23, `_DEG` 8, `_M` 1.
- **Units in comments.** 1,813 line comments contain a number followed by a unit (m, cm, mm,
  metres or degrees), in 243 files. 244 files declare a top-level UPPER_CASE constant object, such
  as a dimension or kit table. No source declares parameters with `defineParams`, so no source
  states a unit in the `unit` field it offers.
- **Literals.** 354,454 numeric literals, 136,152 of them trivial (0, 1, -1, 0.5, 2). Geometry
  helper arguments are 89% literal (16,578 literal against 2,068 named or computed);
  `createPart` position elements 66% (8,889 against 4,641). 29% of decimal literals are below 0.1:
  sizes of a few millimetres or centimetres, written in metres.

A literal is not wrong because it is a literal. The cost shows up when a value is derived from others
but written as a number. In `packs/troy/assets/house.kiln.js` the front wall's centre line `2.275`
(half the depth less half the wall) is written out ten times, and the lintel length `2.12` is twice
the half door plus jamb plus a bearing of 0.18 each side, also as a literal. Moving the wall or
widening the door means finding each copy; missing one is the floating or intersecting part that row
1 of the top-ten table repairs a few millimetres at a time.

## Declarative mock-ups

Each mock-up keeps the asset's own constants and replaces a hand-built assembly with one call to a
helper that does not exist. The names `fenceRun` and `wallAssembly` appear nowhere in the corpus
today. The mock-ups are written to read, not run; equal geometry is not claimed. Sizes are bytes of
the shown code; "non-whitespace" ignores indentation.

| Assembly | Source | Today | Mock-up | Change | Non-whitespace |
| --- | --- | ---: | ---: | ---: | --- |
| Fence bay (whole file) | `packs/farm/sources/project/fence-straight/r_05420c8a915d45e69257f61914d02ec3/source.kiln.js` | 10,132 | 2,824 | -72% | 8,291 to 2,383 (-71%) |
| Farmhouse window wall | Farmhouse, `packs/farm/sources/project/a_793e1ebd4c32465ab937d93215ec2a50/r_01f97f5e943e4c2693b6db8596f3e353/source.kiln.js`, lines 98-111, 139-169, 185-192 | 3,140 | 1,242 | -60% | 2,331 to 989 (-58%) |
| Framed doorway | `packs/troy/assets/house.kiln.js` lines 76-102 (excerpt) | 1,036 | 728 | -30% | 954 to 583 (-39%) |
| Door leaf on a hinge | Farmhouse lines 226-228, 316-326, 346-348 | 1,190 | 735 | -38% | 969 to 580 (-40%) |

Caveats, all **D**:

- The fence mock-up drops `METAL_SPEC`, which the straight bay defines but never uses. Keeping it,
  the mock-up is about 3.6 KB, still about 65% smaller.
- The Farmhouse excerpts call a local mesh builder (`MB`, lines 46-96, about 2,736 bytes) that also
  builds the foundation, floor, ceiling, chimney, porch and steps, so it would stay.
- The doorway mock-up adds a split footing and a framed opening; the house's other three walls are
  not shown.

### Fence bay

The straight bay today has a timber builder, a peg builder, a rail placer and the `build` that
calls them, repeated with small changes in the corner and gate kits. The mock-up keeps the kit table
and snap contract and describes the run. The table shows the post and rail batch functions and
`build` (lines 135-152 and 175-185) on the left and the new `build` on the right; the sizes above are for the whole
file and the whole mock-up.

<table>
<tr><th>Today</th><th>Declarative mock-up</th></tr>
<tr>
<td valign="top">

<pre>function postBatch(vOffset) {
  const b = makeBatch();
  timber(b, [0, 0, 0], [0, KIT.postShaft, 0], KIT.post, KIT.post, KIT.postChamfer, [1, 0, 0],
    { topCap: { rise: KIT.postCapRise, inset: KIT.postCapInset }, vOffset });
  pegs(b, [0, 0, 0], 'z', [-0.045, 0.045]);
  return b;
}
// Two kit rails between post centres a and b (world XZ), meeting the inner post faces.
function railsBetween(b, a, c, seed) {
  const dir = norm(sub(c, a));
  const start = add(a, mul(dir, HALF - KIT.railEmbed));
  const end = sub(c, mul(dir, HALF - KIT.railEmbed));
  const across = norm(cross([0, 1, 0], dir)); // horizontal, perpendicular to the run
  KIT.railY.forEach((y, i) =&gt; {
    timber(b, add(start, [0, y, 0]), add(end, [0, y, 0]), KIT.railT, KIT.railH, KIT.railChamfer, across,
      { vOffset: seed * 0.71 + i * 0.37, uOffset: seed * 0.13 + i * 0.29 });
  });
}
  // ...
async function build() {
  const root = createRoot('FenceStraight');
  const { wood } = await kitMaterials();
  const postGeo = batchGeo(postBatch(0.3));
  const endA = group('Post_End_NegX', root, [-KIT.bay / 2, 0, 0]);
  createPart('PostNegX', postGeo, wood, { parent: endA });
  const endB = group('Post_End_PosX', root, [KIT.bay / 2, 0, 0]);
  createPart('PostPosX', postGeo, wood, { parent: endB });
  const rails = makeBatch();
  railsBetween(rails, [-KIT.bay / 2, 0, 0], [KIT.bay / 2, 0, 0], 1);
  createPart('Rails', batchGeo(rails), wood, { parent: root });</pre>

</td>
<td valign="top">

<pre>async function build() {
  const root = createRoot('FenceStraight');
  const wood = await compilePortableMaterialSpecV2(WOOD_SPEC);
  wood.name = 'HoneyWood';
  // Proposed helper (mock-up): a post at each path point, rails between neighbours.
  fenceRun('Fence', {
    path: [[-KIT.bay / 2, 0, 0], [KIT.bay / 2, 0, 0]], // post centres, metres
    post: {
      section: [KIT.post, KIT.post], height: KIT.postShaft, chamfer: KIT.postChamfer,
      cap: { rise: KIT.postCapRise, inset: KIT.postCapInset },
      pegs: { radius: 0.013, sides: 6, length: 0.01, offsets: [-0.045, 0.045] },
      groups: ['Post_End_NegX', 'Post_End_PosX'], names: ['PostNegX', 'PostPosX'],
    },
    rails: {
      heights: KIT.railY, section: [KIT.railT, KIT.railH], chamfer: KIT.railChamfer,
      embed: KIT.railEmbed, merge: 'Rails',
    },
    uv: { metresPerTile: 1, grain: 'along-member', seed: 1 },
    material: wood, parent: root,
  });
  return root;
}</pre>

</td>
</tr>
</table>

### Farmhouse window wall

Today a local `wall()` splits a wall into blocks around openings, and a local `windowUnit()`
writes the frame, glazing, glazing bars, sill, lintel and shuttered strap hinges as boxes into
per-material buffers. `wallWithOpening` exists but cuts a single opening and fills nothing.

<table>
<tr><th>Today</th><th>Declarative mock-up</th></tr>
<tr>
<td valign="top">

<pre>// Solid wall split into blocks around real openings. axis 'x': wall faces ±X and runs along Z.
function wall(mb, axis, t0, t1, s0, s1, y0, y1, holes) {
  const cuts = [...new Set([s0, s1, ...holes.flatMap((h) =&gt; [h.s0, h.s1])])].sort((a, b) =&gt; a - b);
  const emit = (a, b, ya, yb) =&gt; axis === 'x'
    ? mb.aabb(t0, t1, ya, yb, a, b, [0, 0, 1]) : mb.aabb(a, b, ya, yb, t0, t1, [1, 0, 0]);
  for (let i = 0; i &lt; cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a &lt; 1e-6) continue;
    const hs = holes.filter((h) =&gt; h.s0 &lt;= a + 1e-6 &amp;&amp; h.s1 &gt;= b - 1e-6).sort((p, q) =&gt; p.y0 - q.y0);
    let y = y0;
    for (const h of hs) { if (h.y0 &gt; y + 1e-6) emit(a, b, y, h.y0); y = Math.max(y, h.y1); }
    if (y1 &gt; y + 1e-6) emit(a, b, y, y1);
  }
}

  // ---------- window unit: frame, glass, sill, lintel, optional shutters with strap hinges ----------
  function windowUnit(o) {
    const P3 = (s, y, d) =&gt; (o.axis === 'x' ? [o.face - o.out * d, y, s] : [s, y, o.face - o.out * d]);
    const box = (mb, s0, s1, y0, y1, d0, d1, grain) =&gt; {
      const a = P3(s0, y0, d0), b = P3(s1, y1, d1);
      mb.aabb(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]),
        Math.min(a[2], b[2]), Math.max(a[2], b[2]), grain);
    };
    const { s0, s1, y0, y1 } = o, f = 0.06;
    box(B.glass, s0 + f, s1 - f, y0 + f, y1 - f, 0.15, 0.17);
    box(B.trim, s0, s1, y0, y0 + f, 0.08, 0.2); box(B.trim, s0, s1, y1 - f, y1, 0.08, 0.2);
    box(B.trim, s0, s0 + f, y0 + f, y1 - f, 0.08, 0.2); box(B.trim, s1 - f, s1, y0 + f, y1 - f, 0.08, 0.2);
    const sm = (s0 + s1) / 2, ym = y0 + (y1 - y0) * 0.58;
    box(B.trim, sm - 0.02, sm + 0.02, y0 + f, y1 - f, 0.12, 0.15);
    box(B.trim, s0 + f, s1 - f, ym - 0.02, ym + 0.02, 0.12, 0.15);
    box(B.stone, s0 - 0.07, s1 + 0.07, y0 - 0.06, y0 + 0.02, -0.07, 0.08);
    box(B.stone, s0 - 0.12, s1 + 0.12, y1 + 0.001, y1 + 0.16, -0.03, 0.1);
    if (!o.shutters) return;
    const w = o.shutterW || P.shutterW;
    for (const side of [-1, 1]) {
      const inner = side &lt; 0 ? s0 - 0.04 : s1 + 0.04, outer = inner + side * w;
      const a = Math.min(inner, outer), b = Math.max(inner, outer);
      box(B.olive, a, b, y0, y1, -0.045, 0);
      for (const yb of [y0 + 0.16, y1 - 0.16]) {
        box(B.olive, a + 0.03, b - 0.03, yb - 0.045, yb + 0.045, -0.065, -0.045);
        const strapEnd = inner + side * 0.32;
        box(B.hinge, Math.min(inner - side * 0.03, strapEnd), Math.max(inner - side * 0.03, strapEnd), yb - 0.02, yb + 0.02, -0.075, -0.064);
        box(B.hinge, Math.min(inner, inner - side * 0.035), Math.max(inner, inner - side * 0.035), yb - 0.03, yb + 0.03, -0.078, 0);
      }
    }
  }
  const frontWins = [-2.0, 2.0].map((c) =&gt; ({ s0: c - 0.55, s1: c + 0.55, y0: P.winY0, y1: P.winY1 }));
  wall(B.masonry, 'x', HX - WT, HX, -HZ + WT, HZ - WT, FY, E, [door, ...frontWins]);
  wall(B.masonry, 'x', -HX, -HX + WT, -HZ + WT, HZ - WT, FY, E, frontWins);
  for (const w of frontWins) {
    windowUnit({ axis: 'x', out: 1, face: HX, ...w, shutters: true });
    windowUnit({ axis: 'x', out: -1, face: -HX, ...w, shutters: true });
  }</pre>

</td>
<td valign="top">

<pre>// Proposed (mock-up): a wall with openings and what fills them, by role. Depths are metres
// inward from the wall's outer face; the helper splits the wall around each opening.
const WINDOW = {
  kind: 'window', width: 1.1, sill: P.winY0, head: P.winY1,
  frame: { width: 0.06, depth: [0.08, 0.2] },
  glazing: { depth: [0.15, 0.17] },
  bars: { vertical: [0.5], horizontal: [0.58], width: 0.04, depth: [0.12, 0.15] },
  sill: { material: 'stone', overhang: 0.07, drop: 0.06, rise: 0.02, depth: [-0.07, 0.08] },
  lintel: { material: 'stone', overhang: 0.12, height: 0.16, depth: [-0.03, 0.1] },
  shutters: { width: P.shutterW, gap: 0.04, thickness: 0.045, battens: [0.16, -0.16], straps: { length: 0.32 } },
};
for (const out of [1, -1]) {
  wallAssembly(out &gt; 0 ? 'FrontWall' : 'BackWall', {
    axis: 'z', face: out * HX, outward: out, thickness: WT, // run axis, as in wallWithOpening
    run: [-HZ + WT, HZ - WT], base: FY, top: E,
    openings: [
      ...(out &gt; 0 ? [{ kind: 'gap', centre: 0, width: 2 * P.doorHalfW, head: P.doorTop }] : []),
      { ...WINDOW, centre: -2 }, { ...WINDOW, centre: 2 },
    ],
    materials: { wall: B.masonry, trim: B.trim, glass: B.glass, stone: B.stone, shutter: B.olive, hinge: B.hinge },
  });
}</pre>

</td>
</tr>
</table>

### Framed doorway

The Troy house builds its front wall as three mud blocks around the door, split footings, two
timber jambs and a lintel, with derived positions written as literals (this pack faces +Z, as its
`root.userData` records).

<table>
<tr><th>Today</th><th>Declarative mock-up</th></tr>
<tr>
<td valign="top">

<pre>  const halfDoor=D.doorwayWidth/2, roughHalf=halfDoor+D.jamb;
  // Footings are split at the opening: no continuous plinth across the entrance.
  footing(-3,-roughHalf,2.05,2.5,0,0.12);
  footing(roughHalf,3,2.05,2.5,0,0.12);
  const frontPierW=3-roughHalf, lintelY=D.floor+D.doorwayHeight;
  box('mud',[frontPierW,wallH,0.45],[-(3+roughHalf)/2,D.stoneTop+wallH/2,2.275]);
  box('mud',[frontPierW,wallH,0.45],[(3+roughHalf)/2,D.stoneTop+wallH/2,2.275]);
  box('mud',[roughHalf*2,D.ceiling-lintelY-0.22,0.45],
    [0,(D.ceiling+lintelY+0.22)/2,2.275]);
  // Clear opening is measured between these finished timber jamb faces.
  createPart('DoorJambLeft',boxGeo(D.jamb,D.doorwayHeight,0.52),wood,
    {position:[-halfDoor-D.jamb/2,D.floor+D.doorwayHeight/2,2.275],parent:root});
  createPart('DoorJambRight',boxGeo(D.jamb,D.doorwayHeight,0.52),wood,
    {position:[halfDoor+D.jamb/2,D.floor+D.doorwayHeight/2,2.275],parent:root});
  createPart('DoorLintel',boxGeo(2.12,0.22,0.56),wood,
    {position:[0,lintelY+0.11,2.275],parent:root});</pre>

</td>
<td valign="top">

<pre>  // Proposed (mock-up): the front wall with a framed doorway; footings split under the opening.
  wallAssembly('FrontWall', {
    axis: 'x', run: [-D.width / 2, D.width / 2], face: D.depth / 2, outward: 1, thickness: D.wall,
    base: D.stoneTop, top: D.ceiling,
    footing: { top: D.stoneTop, splay: 0.12, depth: [0.05, 0.5], splitAtOpenings: true },
    openings: [{
      kind: 'door', centre: 0, width: D.doorwayWidth, floor: D.floor, head: D.floor + D.doorwayHeight,
      frame: { jamb: D.jamb, depth: 0.52, lintel: { height: 0.22, depth: 0.56, bearing: 0.18 } },
    }],
    materials: { wall: 'mud', footing: 'stone', frame: wood },
    names: { jambs: ['DoorJambLeft', 'DoorJambRight'], lintel: 'DoorLintel' },
  });</pre>

</td>
</tr>
</table>

### Door leaf on a hinge

The same Farmhouse door: a surround, a leaf with raised panels, strap hinges, a handle, and a hinge
pivot for a later clip.

<table>
<tr><th>Today</th><th>Declarative mock-up</th></tr>
<tr>
<td valign="top">

<pre>  // Door surround
  B.trim.aabb(HX, HX + 0.04, FY, P.doorTop, -0.64, -0.5); B.trim.aabb(HX, HX + 0.04, FY, P.doorTop, 0.5, 0.64);
  B.trim.aabb(HX, HX + 0.05, P.doorTop, P.doorTop + 0.16, -0.66, 0.66);
  // ---------- Door leaf on a hinge pivot (static, closed; pivot ready for a later clip) ----------
  const L = { x0: -0.025, x1: 0.025, h: P.doorTop - FY - 0.02, w: 2 * P.doorHalfW - 0.02 };
  B.doorRed.aabb(L.x0, L.x1, 0.01, 0.01 + L.h, 0, L.w, [0, 1, 0]);
  for (const [za, zb] of [[0.1, 0.44], [0.54, 0.88]]) for (const [ya, yb] of [[0.22, 1.0], [1.18, 1.98]])
    B.doorRed.aabb(L.x1, L.x1 + 0.018, ya, yb, za, zb, [0, 1, 0]);
  for (const yb of [0.12, 2.02]) {
    B.doorMetal.aabb(L.x1, L.x1 + 0.012, yb - 0.025, yb + 0.025, -0.01, 0.46);
    B.doorMetal.aabb(-0.03, 0.03, yb - 0.08, yb + 0.08, -0.012, 0.012);
  }
  B.doorMetal.aabb(L.x1, L.x1 + 0.012, 0.95, 1.2, 0.84, 0.92);
  B.doorMetal.aabb(L.x1 + 0.012, L.x1 + 0.07, 1.06, 1.1, 0.86, 0.9);
  const hinge = createPivot('FrontDoor', [HX - 0.2, FY, -P.doorHalfW + 0.01], doorG);
  createPart('DoorLeaf', B.doorRed.geo(), M.red, { parent: hinge });
  createPart('DoorHardware', B.doorMetal.geo(), M.metal, { parent: hinge });</pre>

</td>
<td valign="top">

<pre>  // Proposed (mock-up): the same front-wall gap filled by a hinged, panelled door.
  // Replaces { kind: 'gap', ... } in the FrontWall openings of the window mock-up.
  { kind: 'door', centre: 0, width: 2 * P.doorHalfW, head: P.doorTop,
    surround: { width: 0.14, depth: 0.04, head: 0.16, headDepth: 0.05, overhang: 0.02 },
    leaf: {
      thickness: 0.05, clearance: 0.01, hinge: 'left', pivot: 'FrontDoor',
      panels: { cols: [[0.1, 0.44], [0.54, 0.88]], rows: [[0.22, 1.0], [1.18, 1.98]], raise: 0.018 },
      straps: { at: [0.12, 2.02], length: 0.46 }, handle: { at: [0.88, 1.08] },
      names: { leaf: 'DoorLeaf', hardware: 'DoorHardware' },
    },
    materials: { surround: B.trim, leaf: M.red, hardware: M.metal } },</pre>

</td>
</tr>
</table>

## Proposals and how to prove they change nothing

Each proposal is a follow-up draft, not a decision. None of them changes what an existing source
builds; the plan for each says how that would be shown.

| # | Proposal | Addresses |
| --- | --- | --- |
| P1 | Opening fills for `wallWithOpening` (or a `wallAssembly` beside it): several openings, frame, glazing, bars, sill, lintel, shutters, and a door leaf on a named pivot | Window and door mock-ups; literal clearances in row 1 |
| P2 | `fenceRun`: posts at path points, rails between neighbours, named groups | Fence mock-up; copies between kit files |
| P3 | `merge: 'byMaterial'` for assembly helpers, so one call can still export as a few merged meshes | The mesh-builder style 302 of 347 pack assets use |
| P4 | A way to share kit code between the assets of a pack | 64% of pack lines copied; dead copied helpers |
| P5 | Diagnostics: warn on a `createPart` that never joins the asset; name more sandbox rejection causes; warn on a doubled `Joint_` prefix | Rows 2, 8 and the `createPivot` singleton |
| P6 | Guidance moves: the UV0 note into "Materials and directional UVs"; box axes in the frame paragraph of `SKILL.md` | Rows 4 and 9 |

### Shared byte-identity plan

None of this was run for this study.

1. **Freeze the corpus.** List the 646 pack sources and 190 archive sources with their sha256, and
   the manifest's recorded `asset.glb` sha256 and build options for each pack revision
   (`gltfExporter`, `optimize`, `instance`, `geometryPolicy`, `indexPolicy`, `qaMode`,
   requirements).
2. **Baseline on main.** On one machine with the pinned toolchain, rebuild each pack revision with
   `kiln asset <id> <revision> --rebuild --out` (saved options and materials) and each archive
   example with `scripts/integration-corpus.mjs --out`. That script reads one flat directory, so
   stage the archive files flat or extend it to take a list. Record which rebuilds reproduce the
   manifest hash; that is informative, not the gate, since GLB bytes differ between Linux and
   Windows (the reason `scripts/glb-chunk-hashes.mjs` exists).
3. **Candidate on the same machine.** Rebuild with the change. The gate is 100% sha256 equality
   with the baseline and identical failures. Where a hash differs, use the `--compare` signatures
   or chunk hashes to find which chunk moved.
4. **Names.** Scan every source for the new helper or option name as an identifier or object key,
   so a local function or an existing option of the same name cannot change meaning. Compare
   `kiln_validate` warnings before and after.
5. **New paths.** The corpus never calls the new helpers, so equality says nothing about them. Add
   fixtures for their default options and pin their output hashes.

### Per proposal

- **P1, P2.** Additive helpers. Steps 1 to 5. If `wallWithOpening` itself gains options, its
  current call shape needs a fixture first: no corpus source calls it, so the corpus cannot protect
  it.
- **P3.** A new option on existing helpers. Steps 1 to 5, plus a scan that no source already passes
  a `merge` key to an assembly helper (not run).
- **P4.** Existing sources stay as they are and keep building. If an asset is later moved onto
  shared code, that is a new revision; rebuild it and compare with the revision it replaces, and keep
  the old revision.
- **P5.** Diagnostics only. Steps 1 to 3 must show identical GLBs; the only allowed difference in
  validate output is the new warning codes, and their count over the corpus should be reported (an
  orphan-part warning that fires on a saved asset is either a real bug or a false positive).
- **P6.** No build change. `bun run check:skills` and the generated workspace copies.

## Follow-up drafts

Drafted, not filed:

1. Fill door and window openings from `wallWithOpening`
2. Add `fenceRun` for posts and rails along a path
3. Let assembly helpers merge their parts by material
4. Share kit code between the assets of a pack
5. Warn when `createPart` builds a part that never joins the asset
6. Classify the remaining opaque rejections and name the commonest engine-owned causes
7. Move the UV0 note to the materials section and state box axes in the frame paragraph
8. A corpus gate that rebuilds every saved pack source and compares GLB hashes

## Limits

- The byte-identity baseline was not run; no rebuild in this study compared hashes.
- Build call classification is heuristic: 25 calls have no result in the trace and 24 results could
  not be classified. Ten edits skipped the build, so whether they would have built is unknown.
- 15 of 74 transcripts do not record the model. Codex `file_change` contents and OpenCode sessions
  kept only in its SQLite store were not captured, so file edits are undercounted for those two
  harnesses.
- Transcripts come from maintainer dogfood runs, which ask for particular kinds of assets. Saved
  sources record the final program, not the errors made on the way. The two sets answer different
  questions and are not pooled.
- Saved sources have been through review; 175 pack revisions do not record a model, so per-model
  comparisons are rough.
- The mock-ups are not implemented and are not shown to produce the same geometry.
