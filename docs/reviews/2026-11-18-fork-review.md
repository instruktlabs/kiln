# Fork review: FaberVi hard-surface work and the Vercel remote MCP adapter

Issue: [#426](https://github.com/instruktlabs/kiln/issues/426). Reviewed 2026-11-18 against
`origin/main` at `444bbad1`. This is a review, not an acceptance or a decision to merge. Nothing
was posted to or sent to any fork, and no fork code was merged or cherry-picked.

## Summary

| Piece | Fork | License | Overlap with main | Recommendation |
| --- | --- | --- | --- | --- |
| Organic helpers (metaballs, tubes, paths, smoothing) | FaberVi | MIT | Already integrated in 1.3.0 (#141, #172) | Nothing to do; rock helpers stay deferred |
| `segmentsFromRadius` | FaberVi | MIT | None; main has fixed primitive defaults and a facet-error note | Take the idea (reimplement) |
| Assembly-aware part-overlap threshold | FaberVi | MIT | Main reports every pair above 0.1% volume, no assembly tier | Take the idea, not the label-driven threshold |
| Orientation-conflict observation, CSG smooth-crease note | FaberVi | MIT | `requireSolid` and the solid diagnostic already report orientation | Skip |
| `geometryMinFeatureAdvisory` | FaberVi | MIT | None | Skip as written; revisit with a measured case |
| `subdividePathByCurvature` | FaberVi | MIT | `catmullRomPath`, `bezierCurve` shipped | Skip (adds collinear stations only) |
| UV texel helpers (`analyzeUvStretch`, `normalizeAtlasTexelScale`) | FaberVi | MIT | No stretch or texel-density analysis on main | Take the idea (reimplement); best candidate |
| Optimize gate (rigid-merge size gate) | FaberVi | MIT | `optimize: 'full'` merges unconditionally | Take the idea after measuring |
| Post-render GLB compression (meshopt, Draco) | FaberVi | MIT | Runtime profile already ships meshopt and KTX2 | Skip; do not relax render-service admission |
| Skill edits (`kiln-author-asset`, `kiln-qa-asset`) | FaberVi | MIT | Skills have moved a lot | Skip; carry only wording tied to a shipped helper |
| External PBR acquire skill, GLB comparison harness | FaberVi (Cursor branch) | MIT | Not in the issue; depends on a third-party MCP | Skip |
| Vercel remote MCP adapter | TomasThrawat (first commit by hyouka56) | MIT (repo level) | Hosted Kiln is private; the SDK already exposes the seams | Skip the code; take two ideas |

## How the fork was read

Source was read through `gh api` (compare endpoints, commit diffs, raw files). The only checkout
was a shallow clone of `FaberVi/kiln` `main` (`cbccc7a`) in the session scratch folder, outside
this repository, to run the fork's own tests and two probes. Nothing was added to this worktree's
git config.

## Licensing and contributor terms

- `FaberVi/kiln`, `TomasThrawat/kiln` and `hyouka56/kiln-vercel-mcp` are all MIT forks (GitHub
  license API). MIT permits copying with the copyright notice preserved. Main's own `LICENSE`
  names only the maintainer, so carrying fork code means adding the author to the notice or a
  provenance record.
- `CONTRIBUTING.md` has no contributor license agreement and no inbound-license clause.
- The FaberVi commits are authored by `Vincenzo Fabiano` with `Cursor Agent` as co-author on the
  squash commits; the proposal text says most of the work was made by Cursor Cloud Agents. That
  leaves authorship of individual lines unclear. It does not block MIT reuse, but a PR from the
  author who confirms the terms is cleaner than a copy.
- Precedent: the organic work was handled in #141/#172 by an adapted integration commit that kept
  the exact co-author trailer and a provenance record
  (`docs/reviews/2026-10-16-organic-adoption.md`). Reuse that pattern for anything carried over.
- The adapter's first commit exists twice: `hyouka56` committed it 2026-10-27 04:40 UTC and
  `TomasThrawat` 13 minutes later with the same title. Treat `hyouka56` as the probable original
  author; the issue's "possibly the same author" is unverified. The `vercel-mcp/` folder has no
  license file of its own.
- For the clean-room option, the idea, the behavior and a test shape can be taken; the code is not
  copied. `docs/clean-room.md` is the relevant process note.

## Correction to the issue text

The issue says nothing was opened upstream. For the organic work that is not so: issue #134 and
PRs #140, #141 and #142 were opened by FaberVi on 2026-10-06 and closed on 2026-10-17. #141's
non-rock helpers shipped in 1.3.0 (`CHANGELOG.md`, `ROADMAP.md`, `docs/backlog.md`). Rock helpers
(`rockDisplace`, `rockBoulder`), the `UNIVERSAL_MESH_TOPOLOGY` rock blocker and the benchmark
scripts remain deferred, as recorded in the adoption review. The hard-surface commits were never
sent upstream: fork PRs FaberVi/kiln#2, #3, #4 and #6 are fork-internal and closed; #5 and #7 are
open fork-internal PRs.

So the first to-do item is mostly done already. The organic proposal needs no new decision other
than whether to revisit the rock helpers, which the backlog already gates on "demonstrated
authoring need".

## FaberVi: what the three commits contain

Fork `main` is 3 commits ahead and 224 behind `instruktlabs/kiln` (merge base `a6d2aa3b`,
2026-10-03): `071202a7`, `3d29c4a7`, `cbccc7ab`. Each also commits rebuilt `dist/` bundles, which
main stopped tracking in #333, so none of them can be applied as is. Measured with
`git apply --check` against this worktree, excluding `dist/`, snapshots and the lockfile: all
three fail (conflicts in `src/qa/self-intersection.ts`, `src/render.ts`,
`src/discovery/helper-contracts.ts`, `src/geometry-catalog.ts`, `src/primitives.ts`,
`src/profile.ts`, `package.json`, `render-service/src/renderer.mjs`, the site viewer and docs). A
port is a rewrite on current main.

The fork's new tests do pass at its own base: 12 files, 48 tests, 0 failures (`bun test` with
`KILN_RENDER=cpu`, Bun 1.4.2, after `bun install --frozen-lockfile`). That says the code does
what its tests say on a 2026-10-05 tree; it says nothing about current main.

### Hard-surface helpers: `segmentsFromRadius`

Commit `071202a7`, `src/geometry-segments.ts` (41 lines, tests in
`src/__tests__/geometry-segments.test.ts`). Returns
`clamp(ceil(pi * radius / maxChordLength), 8, 128)`, default chord 1 cm.

On main there is nothing equivalent. Primitives keep fixed defaults (cylinder 8, capsule 6;
`src/primitives.ts`), and `skills/kiln-author-asset/references/geometry-recipes.md` already teaches
the facet-midpoint error `r * cos(pi / n)`. The helper is small and deterministic and does not
touch registry, QA or schemas. Its default chord is a unit assumption (meters) that main does not
make elsewhere; a reimplementation should take the chord as a required or documented-unit option.

Recommendation: take the idea. It would be a new Discovery helper (`src/discovery/helper-contracts.ts`,
catalog entry, sandbox export, a focused test written first) plus one line in the recipes. It
changes the generated API snapshot and `docs/tools.md` only if it touches tool schemas, which it
does not.

### Assembly-aware overlap QA

Commit `071202a7`, edits to `src/qa/self-intersection.ts` and `src/qa/requirements-run.ts`.
Adds `ASSEMBLY_PENETRATION_CONTACT_FRACTION = 0.012` (12 times the 0.001 contact fraction),
selected when host labels include `architecture`, `vehicle` or `environment`, or when
`structureRequested` or `mobilityRequested` is set. Pairs between 0.1% and 1.2% are not listed
and a single observation `GEO_PART_SELF_INTERSECTION_ASSEMBLY_JOINTS` reports the count.

Against main:

- `analyzePartPenetration(root)` has no policy argument, and `structureRequested` and
  `mobilityRequested` do not exist on main, so the wiring in `requirements-run.ts` has nothing to
  read. The patch would need a new policy surface.
- Main's rule lists every pair above 0.1% worst first and acknowledges only unbuildable open
  shells (`markOpenShell`). Noise from intended embedded joints is a real complaint worth
  verifying, but a threshold selected by free-text labels is the pattern AGENTS.md warns about for
  QA scope: descriptive labels should not silently change what a rule reports. The fork's own
  comment says labels "never select enforcement alone", then uses them to select a threshold.
- The fork introduced a comparator typo, present in its final file at line 590:
  `localeCompare(\`${y.a}:${x.b}\`)` (should be `y.b`). Main has `y.b` at
  `src/qa/self-intersection.ts:560`. Copying the file would regress deterministic ordering for
  equal-volume pairs.
- It stays image-free and deterministic (no render buffers, no clock), so it does not conflict with
  the QA rules on those points.

Recommendation: take the idea only if a measured corpus shows joint noise. The reimplementation
should summarize small embedded overlaps in one observation and take the tolerance from an
explicit author or requirement declaration (not labels), with a regression test for stable order.

### Orientation-conflict observation and CSG smooth-crease note

Commit `071202a7`: `src/qa/mesh-topology.ts` (73 lines) warns `GEO_MESH_ORIENTATION_CONFLICTS` for
any mesh with at least one conflict; a `CSG_SMOOTH_CREASE` advisory when `smooth: true` blurs CSG
rims. Main already surfaces orientation through `requireSolid` and the solid diagnostic
(`src/require-solid.ts`, `src/evaluator/solid-diagnostic.ts`) as an author-chosen assertion, and
documents that no universal closed-mesh rule is imposed. A threshold of "one conflict" on every
mesh would be a new universal rule. Skip.

### Minimum-feature advisories

Commit `3d29c4a7`, `src/geometry-min-feature.ts` (67 lines). Warns when the thinnest bounding-box
dimension or shortest edge is below 8 times `extent * 1e-6`, that is below 8 millionths of the
profile extent. At that scale a feature is already numerically degenerate, so the advisory fires
almost only on cases `geometryDiagnostics` reports as degenerate triangles already. The "bevel at
least half the narrowest width" check is more useful and is a one-line condition. No equivalent
exists on main. Skip as written; if bevel erosion shows up in dogfood, add the bevel-versus-width
check inside the existing profile validation with a test from the failing case.

### Sweep-path curvature densification

Commit `3d29c4a7`, `src/sweep-path-curvature.ts` (109 lines). Measured on the fork clone:
`subdividePathByCurvature([[0,0,0],[1,0,0],[1,1,0]])` returns 13 points, all on the two original
straight segments. The 90 degree corner stays a single sharp vertex. It adds collinear stations
and does not round or sample a curve, so it cannot improve a tight bend. It also does not
interact with the profile frames that `sweepProfile` computes per station. I did not reproduce an
endpoint-dropping case with `maxStations` (two probes kept the last point). Main already offers
`catmullRomPath` and `bezierCurve` for sampled curved paths and `sweepProfile` documents that the
caller supplies enough stations. Skip.

### UV texel helpers

Commit `cbccc7ab`, `src/uv-texel.ts` (368 lines, tests in `src/__tests__/uv-texel.test.ts`);
the same idea exists as a separate implementation on the fork branch `cursor/uv-csg-authoring-fb7c`
(`src/uv-stretch.ts`, 289 lines; fork PR #5, open). `analyzeUvStretch` reports L2 stretch
(Sander et al.) quantiles and per-chart `sqrt(3D area / UV area)`; `uvWorkflowAdvisory` returns
messages; `normalizeAtlasTexelScale` rescales atlas charts to a common density.

Main has `autoUnwrap`, `projectUV`/`remapUV` with `metersPerUnit`, and atlas QA
(`src/qa/atlas.ts`), but no stretch or texel-density measurement. This is the one piece that fills
a gap. It is pure geometry over buffers, deterministic, and image-free, so it fits the QA and
determinism rules. Concerns: the fork's file keeps module-level scratch vectors (fine in a
single-threaded evaluator, but not re-entrant), and the normalizer mutates UVs, which needs a
contract about which attributes and charts it touches and how it interacts with `preserveUV`.

Recommendation: take the idea. Reimplement `analyzeUvStretch` first as a read-only helper with a
Discovery contract and a finding in the existing atlas or UV QA; treat `normalizeAtlasTexelScale`
as a separate, later decision.

### Optimize gate

Commit `cbccc7ab`, `src/optimize-gate.ts` (48 lines): skip rigid merge when fewer than 400
triangles or fewer than 4 draw calls, and record the reason as `rigidMergeGate`. Motivation in the
fork: a roughly 9 KB crate grew past 20 KB. Main documents `full` as "palette plus rigid-group
merging" with no size gate (`docs/runtime.md`, `src/render.ts`, `src/rigid-merge.ts`). I did not
reproduce the growth on main. The idea is plausible, but the 400 and 4 thresholds come from one
example and AGENTS.md asks for measured ratchets.

Recommendation: take the idea after measuring byte growth across the example corpus on current
main. If it holds, a gate that reports its decision in the optimize summary is small. Do not copy
the constants.

### Optional GLB compression and loader changes

Commit `cbccc7ab`: `src/glb-compress.ts` (67 lines), `compress: 'meshopt' | 'draco'` on render,
new `meshoptimizer` and `draco3dgltf` dependencies, and decoder wiring in the viewer, site and
`render-service`. Main's runtime export profile already writes `EXT_meshopt_compression` with
`KHR_mesh_quantization` and optional KTX2 (`docs/export-profiles.md`, `src/asset-export.ts`), and
states that compression is a separate, validated choice.

Conflict with repo rules: `render-service/src/glb-input.mjs` rejects
`KHR_draco_mesh_compression` and `EXT_meshopt_compression` on purpose, because render requests are
self-contained GLBs with admission, decoded allocation and geometry bounded before loading. The
fork relaxes that gate; a compressed file can decompress to far more than its upload size, so the
bound would need new accounting. The new Draco dependency also adds a package to the consumer
install. The viewer and render-service loader changes touch the site, so they would need the
Library, Projects and Live Review flows rechecked. Skip. Gallery GLBs stay uncompressed by the
fork's own policy, so there is no consumer for it.

### Skill edits

Commit `071202a7` edits `skills/kiln-author-asset/references/geometry-recipes.md` (5 lines) and
`skills/kiln-qa-asset/SKILL.md` (2 lines). Main's skills have changed substantially since
2026-10-03 and carry generated-workspace copies that `check:skills` keeps aligned. Skip the diff;
if `segmentsFromRadius` or a UV stretch check is reimplemented, add the matching guidance at the
same boundary the AGENTS.md names for shared shape and fit guidance.

### Other fork branches not in the issue

`cursor/3d-asset-server-integration-5058` (fork PR #7, open; two Cursor Agent commits) adds a
`kiln-acquire-external-pbr` skill that pairs Kiln with the third-party `arielshad/3d-asset-server`
MCP, a material-map normalizer and a reference-GLB comparison harness. It adds a seventh shipped
skill and an external-provider dependency, which the skills discovery budget and the provenance
docs do not cover. Not reviewed in depth; skip unless a maintainer wants stock PBR acquisition.
The `upstream/hs-*` branches are the hard-surface commits rebased onto a 2026-10-05 `main` that
includes unrelated Troy scene commits. Nothing new there.

## Vercel remote MCP adapter

Sources: `TomasThrawat/kiln` `main`, folder `vercel-mcp/` (16 commits ahead, first commit
`9feda60c` 2026-10-27), plus `hyouka56/kiln-vercel-mcp` (one commit, `e2df4ae1`). Files read:
`README.md`, `package.json`, `vercel.json`, `next.config.ts`, `app/api/mcp/route.ts`,
`tests/contract.test.mjs`, `.circleci/config.yml`.

### What it does

A Next.js route (`mcp-handler`) that registers every definition from the published
`@instruktlabs/kiln` 1.6.0 `createKilnToolHost({ programStore, assetLibrary })` as an MCP tool,
adds a `kiln://assets/{collection}/{asset}/{revision}/{file}` resource template and a
`kiln_read_resource` fallback that returns base64 with a SHA-256. Persistence is two classes
over Vercel Blob: `BlobProgramStore` (content-addressed `sha256:` refs, integrity re-check on
read) and `BlobAssetLibrary` (manifest plus file hashes, revision immutability checks, `project`
and `library` collections). The README states plainly that all tools are unauthenticated.

### What is worth keeping as an idea

- It confirms the SDK seams are enough: `ProgramStore` and `AssetLibrary` can be implemented over
  object storage without touching the engine. That matches `docs/sdk.md`, which says the shared
  entries contain no provider or tenant policy.
- Content-addressed program refs and re-verification of stored hashes on every read is a good
  pattern for any remote store, and matches main's immutable-revision rules.
- `kiln_read_resource` for clients that cannot call `resources/read` is a real compatibility
  question. Main's `createKilnToolHost` already has `readResource`; whether a tool fallback is
  needed should be tested against the target clients, not assumed.

### Why not take the code

- No authentication, and the tools execute authored JavaScript. `docs/sdk.md` says a hosted
  service that accepts untrusted programs must inject the qualified isolated evaluator and that a
  subprocess alone is not tenant isolation. The adapter passes only `programStore` and
  `assetLibrary` to `createKilnToolHost`, so programs run in the function process, which also
  holds the Blob read-write token. For a public endpoint this is the exact case the docs warn
  about. Shipping or endorsing it in the engine repository would contradict the isolation docs.
- It bypasses the host's call path: the route calls `definition.run(input)` itself instead of
  `callTool`, so request abort signals and the shared error shaping in `src/mcp-engine.ts` are not
  used. It does not wire a render port, the render service, or the project, material and review
  services, so it cannot offer the 18 or 21 tool surfaces main describes (README says as much).
- `tests/contract.test.mjs` asserts strings in the route source (for example that the file
  contains `"createMcpHandler"`); nothing exercises a request, a Blob round trip or a tool call.
  I did not run it or deploy it.
- It pins `typescript@^7.0.2`, `next@^16` and `@modelcontextprotocol/server@^2.3.0` as ranges and
  Node `>=22.2.0 <25`; main's rule is pinned versions per `toolchain.json`. The CircleCI file
  duplicates the repository's CI on a second provider.
- Hosted Kiln is built in the private `instruktlabs/kiln-hosted`; public metadata is in
  `plugins/kiln-hosted/`. A public, unauthenticated self-host recipe in the engine repo would
  compete with, and contradict the posture of, that service.

Recommendation: skip the code. If self-hosting becomes a goal, write a short SDK guide section
that names the `ProgramStore` and `AssetLibrary` seams, the isolation requirement, an
authentication requirement and the content-hash pattern, and say the Vercel adapter is one
community example without endorsing it. Contact `hyouka56` and `TomasThrawat` only on the
maintainer's say-so. The two authors should be asked who wrote it before any text is quoted.

## Suggested follow-ups

Ordered by value, each a separate decision for the maintainer; none is started:

1. Reimplement a read-only UV stretch and texel-density measurement (FaberVi idea, `src/uv-texel.ts`).
2. Reimplement `segmentsFromRadius` with an explicit unit in its contract.
3. Measure `optimize: 'full'` size growth on small assets before deciding on a gate.
4. Measure small-overlap noise in part-overlap QA on the dogfood corpus before adding a tolerance.
5. Decide whether to invite FaberVi to open upstream PRs for UV measurement against current main.
   If invited, ask them to rebase on current main without `dist/`, run the full gate, and say who
   authored what.

## Not read or not done

- Fork branches `cursor/hard-surface-*`, `cursor/organic-modeling-e104` and the `upstream/organic-*`
  slices were read by commit lists, file lists and the proposal text, not line by line; the organic
  slice is already covered by the adoption review.
- The adapter and its `app/page.tsx`, `app/layout.tsx`, health route and the second
  `hyouka56` repository were not run or deployed. Vercel limits (function size, duration) were not
  measured.
- Compression, Draco and the viewer changes were not rebuilt or run against current main.
- Copyright of AI-assisted lines was not assessed beyond noting the co-authorship.
