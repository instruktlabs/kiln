# Holodeck scene packs

Every Kiln asset placed in a walkable [Holodeck](https://holodeck.kilnstudio.tools/) scene,
one pack per scene. The gallery cards and pack pages link to the walkable scenes; the scene
addresses are configured in one place, [`site/src/data/holodeck-worlds.json`](../../site/src/data/holodeck-worlds.json).

| Pack | Scene source | Assets |
| --- | --- | --- |
| `holodeck-tidemark` | Holodeck's bundled `examples/tidemark` (commit recorded in `selection.json`), the walkable Tidemark Island | 23 |
| `holodeck-courtyard` | Courtyard world, revision 9 | 32 |
| `holodeck-cove` | Holodeck's Cove modules at the same commit, the Cove quality pass | 8 |
| `holodeck-crescent-cove` | Holodeck's bundled `examples/crescent-cove` (commit recorded in `selection.json`), the tropical-island world at revision 17 | 49 |
| `holodeck-meridian-sanctuary` | Holodeck's bundled `examples/meridian-sanctuary` (commit recorded in `selection.json`), the marble-sanctuary world at revision 27 | 53 |

Packs deliver final versions only: one gallery page and one download per asset. All four scenes
place the eight Cove modules at their quality-pass revisions, so each Cove module has one page
shared by the four packs. If a scene ever places an earlier revision, the pack lists the final
one instead: `selection.json` records it under `sceneStillPlacesEarlier`, the pack and module
pages say so, and the selection checks that the final revision descends from the placed one. Holodeck's static site exports leave
the Cove mood board out of the walkable scenes, but the worlds place it, so the packs keep it.
Each download's `delivery.json` lists the parent of every revision under `omittedParents`:
earlier revisions are left out by choice, not missing.

Fourteen Crescent Cove assets use saved Kiln materials. Their editable downloads carry the
material closure (`materials.kiln.json`) beside the revision manifest, as Kiln's import format
expects; `selection.json` freezes its SHA-256.

## Licence

The owner dedicates these assets to the public domain under
[CC0 1.0 Universal](LICENSES/CC0-1.0.txt): models, runtime metadata, saved manifests, previews
and Kiln source programs. Each download carries `LICENSE.txt` and `LICENSES/CC0-1.0.txt`.
Holodeck's own repository applies CC0 to its bundled GLBs and previews (`examples/`,
`public/assets/`, the non-code files under `assets/cove/`) and keeps procedural JavaScript
programs under MIT; the copies of those programs in these packs are dedicated CC0 by the same owner.
Kiln and Holodeck software keep their own licences.

## Records

- `selection.json` freezes each pack's exact collection, asset and revision IDs and the
  SHA-256 of every saved manifest, source program and canonical GLB. Every placed scene GLB is
  byte-identical to the canonical `asset.glb` of the revision its world names.
- `sources/project/<asset>/<revision>/` keeps each source program and saved manifest.
- `HOLODECK_APPROVAL` in `site/scripts/holodeck-spec.mjs` records owner approval by slug and
  exact revision: on 2026-10-23 the 47 Tidemark, Courtyard and Cove cards, then Crescent Cove's
  41 new cards. A pack is available only when every asset it lists is approved, so a new card
  or revision makes its pack wait for review again.
- `site/src/data/holodeck.json` is the gallery catalog. Downloads and posters are pinned in
  `site/src/data/mirror-manifest.json`; posters are rendered under the `review-neutral-v1` rig
  and recorded in `site/src/data/rig-posters.json`.

## Regenerate

Every input is read-only. From `site/`:

```sh
node scripts/select-holodeck.mjs --courtyard WORLD --holodeck HOLODECK_REPO --ref main --crescent-ref COMMIT \
  --store island-trial=STORE --store holodeck-assets=STORE --store courtyard-plaza=STORE --store tropical-island=STORE
node scripts/stage-holodeck.mjs --kiln KILN_PACKAGE_DIR --mirror .localdata/holodeck-delivery \
  --store island-trial=STORE --store holodeck-assets=STORE --store courtyard-plaza=STORE --store tropical-island=STORE
bun scripts/rig-posters.mjs holodeck --service RENDER_SERVICE_URL --mirror .localdata/holodeck-delivery
node scripts/stage-holodeck.mjs --upload-list --mirror .localdata/holodeck-delivery
```

A store is a workspace's `assets/kiln` directory. `KILN_PACKAGE_DIR` is an installed
`@instruktlabs/kiln` package; its runtime export profile writes the runtime GLBs and metadata,
and staging verifies they keep the canonical binary. Nothing here uploads anything.

Downloads are stored once, at content-addressed keys: `packs/holodeck/objects/<sha256>/<file>`,
where the folder is the file's SHA-256 and the file keeps its readable name, such as
`cove-hearth.glb` or `holodeck-cove-runtime.zip`. A release reuses the key of every file whose
bytes it keeps: an asset whose revision is unchanged, and a pack whose members and README are
unchanged. Pack READMEs name neither the release nor the exporter version; they give
`HOLODECK_IMPORT_KILN` from `holodeck-spec.mjs` as the oldest Kiln that imports the bundles.
Keys are immutable, so different bytes at an existing key are refused.

`published.json` records every object the asset host has served back. The upload list leaves
those out and names only new objects; one recorded with different bytes is refused.

### Add a new committed example

For a new scene, keep the published selection as the baseline instead of reselecting
older worlds. First add its real pack metadata, exact asset count and per-asset
presentation to `holodeck-spec.mjs`, choose a new `HOLODECK_RELEASE`, and add its
scene URL to `src/data/holodeck-worlds.json`. Do this only after the example and its
final assets exist. A selection does not approve an asset or publish its gallery page.

From `site/`, append the committed example with its saved Kiln store:

```sh
node scripts/select-holodeck.mjs --append-example winter-mountainside-cabin \
  --holodeck HOLODECK_REPO --ref EXAMPLE_COMMIT \
  --selection PREVIOUS_SELECTION_JSON --store winter-mountainside-cabin=STORE \
  --out ../packs/holodeck/selection.json
```

The input selection can be the current `selection.json` when the output replaces it;
the command reads and validates everything before writing. Keep a copy of that
baseline if preparing more than one candidate. The append mode reads the example
and GLBs from the requested Git commit, verifies each new saved source/manifests/GLB
and material-closure seal, and preserves earlier packs and source identities.
Shared assets must have the exact revision and canonical bytes already selected.
Their existing source need not be present locally just to append a scene. A changed
shared revision is refused: use a separately reviewed full selection update for it.
Winter assets receive `winter-` gallery slugs; existing Cove modules keep their
shared `cove-` slugs. The new pack cannot replace a previously selected pack.

Continue with staging, real rig posters and the publication checks above. The staging
command still requires every store named by the full selection, including the older
packs; append only avoids reselecting their scene inputs. Preserve the existing
revision approval records, and record any new asset review separately and honestly.

### Repoint a committed example

When a selected example moves to a newer source revision, choose a new `HOLODECK_RELEASE`
and repoint only that pack, from `site/`:

```sh
node scripts/select-holodeck.mjs --repoint-example crescent-cove \
  --holodeck HOLODECK_REPO --ref EXAMPLE_COMMIT --store tropical-island=STORE
```

Records the example still places at their selected revision are kept as frozen, so only the
stores of changed assets are needed. A changed revision of the pack's own asset must descend
from the selected one; a changed shared revision is refused, as in append mode. Stage, render
real rig posters for the changed cards (`--only`), and record their review in
`HOLODECK_APPROVAL` once the owner approves them.

## Publish

After release approval, upload the listed objects to the asset host, record what it served
back, then build and deploy the site as described in [site/DEPLOYMENT.md](../../site/DEPLOYMENT.md):

```sh
node scripts/publish-assets.mjs .localdata/holodeck-delivery .localdata/holodeck-delivery/holodeck-upload-list.json
node scripts/publish-assets.mjs .localdata/holodeck-delivery .localdata/holodeck-delivery/holodeck-upload-list.json --upload --oauth
```

```sh
node scripts/stage-holodeck.mjs --record-published .localdata/holodeck-delivery/holodeck-upload-list.json.published.json
```

The first command verifies the list offline; the second uploads and reads back every object;
the third adds the objects read back to `published.json`. Commit `published.json` with the
release's site data.


### Repair a committed example's assets

`--repoint-example` accepts a new committed example whose source revision stays the
same when maintainers repair its assets directly. It requires changed world bytes
and a different commit, refuses source-revision rollback, and still verifies that
changed assets descend from the selected revisions. Shared assets used by other
packs cannot change through this path. This preserves the original authoring-world
revision rather than inventing one for a repository maintenance change.

## Scene shots

Each pack page shows two shots of its walkable world, declared in `HOLODECK_SHOTS`
(`holodeck-spec.mjs`) with the Holodeck benchmark camera each one uses. From `site/`:

```sh
node scripts/capture-holodeck-shots.mjs --out .localdata/holodeck-shots [--only view,view]
node scripts/stage-holodeck.mjs --shots --captures .localdata/holodeck-shots --mirror .localdata/holodeck-delivery
```

The capture loads each world in benchmark mode, hides the interface and screenshots it at the
shot size. `receipt.json` records the world, the SHA-256 of its `manifest.json` before and after
(so a deploy mid-capture is refused), the camera, the backend, the browser, whether Chrome ran
headless or headed, how the shot settled and how far the frame still moved. Staging accepts only
a WebGPU capture of the declared camera from that pack's world.

### Settling

A world that publishes readiness of its own (`holodeckPrototype.renderReady`, and any sky-light
or probe-grid state beside it) is waited on, and the receipt names the signals. Holodeck
publishes none yet, so `--settle MS` stands in, at 45 s by default: Meridian Sanctuary's sky
light and probe grid were still resolving at 8 s, which put black mirror cubes and sky-only orbs
in shots the receipt recorded as valid.

The kept frame is the second of two taken `--drift MS` apart (2 s by default), and a frame that
moved more than `--max-drift` between them is refused: a converged frame differs only by
dithering, so anything more means the scene is still resolving. The default, 0.01 mean absolute
luminance difference, has not been calibrated against the live worlds — the receipt records the
measured drift for every shot, so the first headed run says what these scenes actually settle
to. A world that animates can capture with `--max-drift off`.

### Linux hybrid GPUs

Headless Chrome gets no GPU through PRIME offload: the world reports no drawn frame and the wait
times out, which the error says rather than blaming the world. Capture headed instead, with the
offload variables exported — Chrome inherits this process's environment:

```sh
__NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only __GLX_VENDOR_LIBRARY_NAME=nvidia \
  node scripts/capture-holodeck-shots.mjs --out .localdata/holodeck-shots --headed
```

On the hub (CachyOS, GTX 1660 Ti) that renders WebGPU in about 30 s per world.
