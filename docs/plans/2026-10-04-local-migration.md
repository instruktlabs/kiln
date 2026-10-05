# Kiln migration to the local computer

The later hero-shield-checkpoint-01 delta preserves the live champion intake,
shield controller/contact/recoil, final 124-test and headless/browser evidence,
capture-helper dependency bindings and continuation documents. Restore the original
migration and previous overlays through character-equipment-checkpoint-01 first,
then overlay this delta's engine/ and troy/ trees. All archives/manifests/receipts
remain in C:\Users\Mattm\X\kiln-migration\2026-10-04-hub. The character-equipment
parent SHA-256 is e4df0124824a1b3a2736597891abe5062178e2ac85c4b968e9af8c2c93e2faca.
This is a champion integration checkpoint; all-role hands and other completion
requirements remain open. No engine commit alone preserves the private scene.

The later hands/shields/champion-identity candidate workspace is an additional
local source, sibling troy-character-repair-2026-10-04/ws. It contains immutable
parents/children, source store, exact material resources, current installed skills
and geometry/GPU/rebuild evidence. Live Troy has not adopted the children. Read
[the equipment review](../reviews/2026-10-04-troy-character-equipment.md).
The character-equipment-checkpoint-01 recovery archive/manifest/receipt in
C:\Users\Mattm\X\kiln-migration\2026-10-04-hub preserves this workspace and
continuation documents after the weapon-contact-checkpoint-01 chain. Restore its
character-repair/ tree into the sibling workspace after restoring prior archives.
The generated runtime launchers contain local absolute paths; use the current
Kiln setup repair command if moving them. Full completion goal remains active.

Recorded 4 October 2026. This is the current local continuation map. Copied hub
handoffs and dated reports retain their original paths, scope and acceptance limits.

## Goal and end state

Organize and migrate all committed and in-progress Kiln work from GitHub and the
hub onto this computer, preserving source, asset revisions, materials, animation
banks, experiments, evidence, customized skills and current plans. Establish a
verified, runnable Windows baseline with clear ownership and an accurate handoff.
Continue agent execution, authoring and implementation here. Reserve the hub for
performance testing of synchronized candidates without agent runtime or unrelated
development load during measurements.

## Source of truth

| Work | Local location | State |
| --- | --- | --- |
| Engine, tools, scene packages and site | `C:\Users\Mattm\X\kiln-oss` | Remote main `a6d2aa3bc54ae7d8f78fc4cc0d811ac5b4830575`; branch `codex/hub-migration-20261004` |
| Private readiness repo | `C:\Users\Mattm\X\kiln-dogfood\v1-readiness-2026-10` | Committed baseline `3cdd4169cc9df0f6d3d876ed36086b6cead7f154`; same migration branch name |
| Troy project, asset revisions and materials | `review/troy-refine/ws` in readiness repo | 25 saved revisions, seven materials and custom guidance |
| Troy scene, lab, motion, plants, horses and character study | `review/troy-expansion` in readiness repo | Full external workspace, adapted Node tools and local launchers |
| Concept images | `review/troy-concepts-2026-10-03` in readiness repo | Eight originals |
| Recovery snapshot and receipts | `C:\Users\Mattm\X\kiln-migration\2026-10-04-hub` | Verified archives, manifests, original local differences and check logs |
| Historical draw branch | Engine branch `codex/archive-hub-draw-20261004` | Complete history at `4a1d2380a16fd889530aa383fceffe1f6983099e` |

The local engine started at `c734e2a`, five commits behind remote main; recovery
branch `codex/pre-hub-migration-20261004` preserves it. The deployed site also
identifies `a6d2aa3`, with Farm `r36-local-review`, Golden Gate `g9-code5` and
Foundry `ff3-review2-code5`. The historical draw branch was integrated with
corrections through PR 131. Do not merge its raw history again.

Thirty-four uncommitted engine documentation/status files were copied from the
hub. Troy expansion was untracked in the private repo. The migration branches
still contain intentional working changes. An engine commit alone does not save
the external scene. No commit, push, deployment or publication was performed.

## Preservation and adaptation

All 5,258 Troy files verified before local adaptation: 5,088 missing files added,
160 already matching, ten differing local files backed up before replacement.
Final audit: 5,132 unchanged files, 126 documented path/launcher/test/skill changes,
zero unexpected changes. All 3,869 files classified as saved assets, programs,
materials, outputs, retained evidence or staged browser runtime remain unchanged.

Six managed workspaces were repaired/upgraded and each checks as `current`.
Custom program-contract, projects-and-materials and refine instructions were
preserved. Active Node imports and browser paths now work on Windows; historical
evidence and staged browser modules retain their bytes. One lab fixture uses an
explicit original/adapted hash pair in `platform/portability-identities.json`:
only those exact adapted bytes retain the original recipe identity; later edits
fail its original assertion.

Maintainer runtime is isolated Node 22.23.3/npm 12.2.0 under
`%APPDATA%\fnm\node-versions\v22.23.3\installation`, with Bun 1.4.2. The user's
default Node was left intact. CLI/MCP launchers point to this local engine and
pinned executable. Rebuilt bundles match the hub's build identity:
`sha256:58b1b1784701b3b04bac6e7a429ea5dd9d1aeac646e5189bbb21f251e9f1a295`.

Recovery archives all verified by size and SHA-256 against `archives.json`:

- `troy.tgz`: original 5,258-file snapshot.
- `engine-changes.tgz`: engine working documents and hub continuation note.
- `engine-evidence.tgz`: 40,125 evidence and build-input files.
- `draw-history.tgz`: 18,706 experiment, scene and original timing-kit files.
- `draw-optimization.bundle`: complete historical branch.

An additional locally created `windows-adaptation.tgz` preserves the working
engine documents, adapted tools/configuration, local launch instructions and new
Windows browser receipts. Its own manifest/receipt records the local checkpoint.

Large historical evidence remains archived here to avoid duplicating ignored
data into the checkout. Extract individual experiments to a scratch folder using
the manifests. Hub originals and its recovery copy are retained. Credentials,
machine databases, browser profiles and disposable dependencies were excluded.

## Verification and limits

- Frozen installations; engine toolchain, skills, typecheck and lint passed.
- Engine coverage suite: 3,188 pass, two existing skips, zero failures;
  functions 95.20%, lines 92.52%, both above the ratchet.
- Render-service suite: 78 pass. Installed-package/plugin/CLI/MCP smoke passed.
- Scene packages: toolchain, pins, typecheck and lint passed; portable suite
  713 pass, 18 existing skips, zero failures. The real filesystem Chrome test
  fixture now uses its host platform instead of Linux PATH parsing on a Windows drive.
- Troy scene: 53 pass. Runtime lab: 69 pass. Portability checks: three pass.
- Local MCP advertises 17 tools and reads Troy's project, materials and saved
  assets. CLI reads the same inventories; all six workspace manifests are current.
- Browser checks pass on actual WebGPU and WebGL2: 336 stable crew IDs, 384 standing
  soldiers, two heroes, late-landing ownership, completed arrival, reverse seeking
  and the Shore fleet control. Screenshots retained in
  `scene/evidence/windows-migration-2026-10-04`.
- Site check: zero errors/warnings; full local build: 198 generated pages,
  current three scene packs, zero private-data scan findings.
- Companion browser smoke passes: runtime-lab reference/baked/instanced modes and
  the local site's homepage and exact commit/scene-pack identity.
- Site tests: 562 pass, two existing skips, two failures because this Windows
  account cannot create file symlinks (`EPERM`). Directory-junction tests pass.
  File-symlink fixtures require Developer Mode or appropriate privilege; neither
  system permissions nor test expectations were changed. That part of the local
  deployment preflight test remains unverified.

The initial coverage run hit a directory-rename `EPERM` during a provenance save;
its modified shared fixture caused follow-on failures. The isolated nine-test
suite and repeated full coverage gate passed without engine source changes.
Keep that diagnosis if the filesystem error recurs.

Full logs and receipts are in the recovery folder. Windows browser results are
functional evidence, not hub performance, physical mobile, owner visual or release
acceptance. No live model/provider run was performed.

## Where work stopped and next plan

Read [Troy's handoff](../../packs/troy/HANDOFF.md),
[current status](../../packs/troy/STATUS.md), and the external scene's `HANDOFF.md`,
`SHARED-WALK.md`, `LATE-LANDINGS.md` and end of `SCENE-PROGRESS.md`. The last hub
Desktop session `01a0ffcc-488e-7dd3-89fd-59e1b3031821` agrees with those documents;
raw application databases were not copied.

Troy is unfinished: 720 soldiers, two hero placeholders, twelve ships, 529
buildings, 80 walls and 74 approved plants. Eight shore units unload/regroup;
four optional later ships unload another 112 crew. The 92-cycle adaptive walking
bank shares distant playback with exact nearby fallback. Archer intake is saved,
but 48 wall placeholders still carry swords. Horse anatomy is repaired; grounded
running remains incomplete.

For the now-active completion goal, follow the
[consolidated completion plan](2026-10-04-kiln-troy-completion-plan.md). It records
the intended end state, current implemented optimizations, terrain/ocean/aerial
stability, archers/heroes and fleet motion, city traversal, remaining asset work,
complete-scene performance/device policy, reusable tools and skills, engine issue
disposition and final delivery. Migration alone does not close those items.

For maintainer commands, run recovery `Use-Toolchain.ps1` in the same PowerShell
session. Preview/test instructions are in external `LOCAL-START.md` and
`Start-Local.ps1`: Troy 4420, lab 4421, site 4321.

## Hub performance boundary

Agents, authoring, edits, builds and planning run on this computer. For each future
performance candidate:

1. Prepare and validate locally. Record commit/working-diff identity and exact
   hashes of engine bundles, browser inputs, asset revisions and motion banks.
2. Stage a fresh hub candidate directory, preserving the originals. Install pinned
   dependencies, repair only machine launch paths, and verify runtime hashes.
3. Admit measurements only with no agent turn, build, bake or unrelated capture
   active on the hub. Record CPU/GPU load and candidate identity. Defer a busy run;
   minimizing an app alone does not prove admission.
4. Use sequential matched browsers, views and physical scene-time endpoints. Keep
   raw intervals and unknown GPU samples explicit. Copy receipts here for analysis.

The restored browser runtime matches the hub snapshot; Windows adaptation changes
Node tooling/launchers, not measured scene bytes. Synchronize new local edits and
verify them before reusing the hub. No new performance qualification was run.

## Local anatomy and CPU-bounds recovery delta

The right-arm correction for all 48 default archers, 92-test suite, both-backend
reference/default pose evidence, CPU profiles and rigid-bounds comparison work
are preserved by the additional recovery delta
`C:\Users\Mattm\X\kiln-migration\2026-10-04-hub\archer-anatomy-checkpoint-01.tgz`.
Its receipt and manifest record its checksum and source entries. Restore the
verified archer-crowd-checkpoint-01 parent over the original migration first,
then overlay this delta using its engine/ and troy/ paths. The parent SHA-256 is
`45a977ae301685e3be99a29701a722394508318cff0c240e6580ddd458295e84`.
Unchanged masters and parent inputs remain there; no archive replaces history.
The helper save-archer-anatomy-checkpoint.mjs checks current capture/source
identity, exact bank rebuild payloads and returned measurement receipts before
saving. The full completion goal remains active; owner acceptance is open.

## Bow equipment and shadow recovery delta

The additional archer-equipment-checkpoint-01 delta preserves bow/helmet repairs,
95-test and both-backend pose evidence, controlled shadow comparison successes
and failed rigs, current/repeated banks, maintained guidance and offline packaged
skill proof. Restore original migration plus archer-crowd-checkpoint-01 and
archer-anatomy-checkpoint-01 before overlaying this delta. The anatomy parent
SHA-256 is d7755501ebe75a93eb122f06e8e66079d0da3603443f5363a922148af945572e.
All archives/receipts are in C:\Users\Mattm\X\kiln-migration\2026-10-04-hub;
its checksum and exact entries are recorded in the new receipt/manifest.
The full goal remains active and actual-scene/device/owner acceptance is open.
