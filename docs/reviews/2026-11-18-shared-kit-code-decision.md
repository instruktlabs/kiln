# Decision record: shared kit code between the assets of a pack (#413)

Status: **decided 2026-11-18: C now, B on the trigger below.** Nothing is built.

## The problem

The [authored source study](2026-11-18-authored-source-study.md) measured how much of a pack
asset's code also appears, word for word, in another asset of the same pack. Only non-trivial
lines in the latest revisions count:

| Pack | Lines shared |
| --- | ---: |
| holodeck | 93.0% |
| cabin-woods-psx-horror | 83.7% |
| foundry-floor | 59.5% |
| troy | 43.0% |
| farm | 24.1% |
| all packs | 64.0% |

**What the copies are:** kit tables, timber and peg builders, material specs and window units. For
example, the farm fence's straight, corner and gate kits share 162 lines.

**What it costs:**

- A fix to a copied builder is made once per asset, and each fix is a separate saved revision.
- Copies drift: 397 local functions in 165 files are declared and never referenced.

**The constraint:** source cannot import (`HAS_IMPORT`). This is deliberate. The evaluator runs a
single program with no module loading, and that is part of how Kiln isolates evaluated code.

## What any option must keep

1. **Reproducibility.** A saved revision rebuilds to the same bytes from what it records.
   - Today that is the source, the build options, the engine identity and the exact material
     dependencies in `build.dependencies`.
   - Shared code must be pinned the same way, by exact revision and sha256.
2. **No imports in asset source.** Asset source never loads modules.
3. **Standalone assets work without projects or packs**, as `AGENTS.md` requires.
4. **Existing revisions build unchanged.** The #417 corpus gate checks this. An asset moved to
   shared code becomes a new revision, compared against the one it replaces.

## Options

### A. A pack-level source that the host prepends

The pack keeps `kit.kiln.js`. When an asset in the pack is built, the host evaluates the kit and
the asset as one program.

- **For:** the smallest engine change, and the asset source reads as it does now.
- **Against:**
  - It ties building to pack membership, which standalone assets and projects deliberately do
    without.
  - The saved revision must either store the concatenated text, which brings back the copies in
    storage, or pin the kit by hash, which is option B without the library machinery.
  - The pack boundary would carry build semantics it does not have today.

### B. A pinned kit dependency, like a library material

A kit is a library resource with its own revisions, saved and hashed as materials are.

- A build names the kits it uses, and the saved revision records each one in
  `build.dependencies` as `{kind: 'kiln.kit.v1', kitId, revisionId, sha256}`.
- The host evaluates the kit's source in the same sandbox before the asset, and exposes its
  exports as a frozen `kit` object. Asset source still never imports.
- The editable bundle carries the kit closure, as it carries materials. A project can lock kit
  revisions as it locks materials.

This option has a cost and a benefit:

- **For:**
  - It fits the existing dependency, bundle and project-lock machinery, and keeps every rule
    above.
  - A fix to a kit is authored once. Each asset then moves to it by a rebuild with the new pin,
    not by editing its source.
- **Against:**
  - It needs a new resource type, library storage and listing, bundle closure and
    verification, and Discovery and skill guidance.
  - It needs a way for a build to name its kits. Over MCP that is a new input, which changes a
    prompt-cached tool schema and so needs a versioned schema change.
  - It is the largest of the three by far.

### C. No new mechanism: helpers and recipes cover the common builders

#410, #411 and #412 cover most of the duplicated code: `wallWithOpening` fills doors and
windows, `fenceRun` builds posts and rails, and `merge: 'byMaterial'` merges by material.
Discovery recipes cover the next most common builders. A lint advisory could report local
functions that are never called.

- **For:**
  - Nothing new to store, pin or bundle.
  - The fixes become engine helpers with tests, which every asset benefits from, not only one
    pack's.
- **Against:**
  - Pack-specific code still has to be copied: a kit table, or a house style's moulding profile.
  - A fix to that code still needs one edited revision per asset.

## Recommendation

**C now, and decide on B once the shared lines are classified.**

- **Why not B now:** B is the largest change and needs a versioned MCP schema change. The study
  does not yet say how much of the shared code is general (a builder that a helper would replace)
  and how much is pack-specific (a kit table or a house style). The highest shares are in
  holodeck, a recent world set, so this is not only a historical problem.
- **What to do now:**
  1. Land #410, #411 and #412.
  2. Classify holodeck's and cabin-woods' shared lines into general builders and pack-specific
     code.
  3. Measure the next new pack with the study's verbatim-line method.
  4. If pack-specific code is still more than about 40% of a new pack's lines, build B.
- **Why not A:** A ties building to pack membership. Use B instead if shared code becomes
  necessary.

## Decision

The owner chose **C now, with B on the trigger** (2026-11-18):

- No shared-code mechanism is built now.
- #410, #411 and #412 land as helpers and options.
- B is built only if a new pack still has more than about 40% of its lines in shared
  pack-specific code. That is measured with the study's verbatim-line method, after classifying
  holodeck's and cabin-woods' shared lines.
- A is not pursued.
