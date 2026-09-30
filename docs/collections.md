# Saved assets and the local viewer

Save an asset with its editable source, inspect it in a browser, and move a pinned
revision between a game project and your user library. Everything runs locally;
viewing and exporting make no model calls. Collections are separate from source
snapshots and disposable build caches.

The packaged dashboard also provides Projects, Materials and Live Review. See
[projects and live review](projects-and-live-review.md) for shared configuration,
exact reviewed saves, material dependencies and editable/runtime project packages.
Projects are optional: standalone assets use the same library, material and review facilities.

## Start in your asset workspace

```sh
node kiln.mjs save workbench.kiln.js --name "Workbench" --tag furniture
node kiln.mjs assets
node kiln.mjs view
```

CLI saves accept `--model`, `--harness` and `--author`, matching MCP's optional
`attribution` fields. These are declared provenance, not provider attestation.
Record requested versus independently confirmed thinking effort and later refiners
in the description or accompanying production ledger; do not invent unknown values.

Open the printed loopback URL; `localhost` on the same port also works. The viewer
refuses other hostnames to prevent DNS rebinding. It shows one card per asset,
supports search, tags, revision selection, animation playback, wireframe, lighting
and downloads.
It loads the saved GLB, never executes its JavaScript. Selecting a revision in the
browser remembers that choice in that browser; it does not update other clients.
Multiple branch tips are identified on the asset card.

`kiln view asset.glb` or `kiln view bundle.zip` previews a standalone file without
importing it. The file picker also accepts local GLBs and Kiln ZIP bundles. Opened
files stay in browser memory until the page closes. A GLB without source is labelled
as such. Select several collection assets to download one ZIP, up to 100 revisions
and 64 MiB of uncompressed content.

From the engine checkout, use `node dist/cli.mjs` instead of `node kiln.mjs`.

## Project collection and user library

An unconfigured workspace exposes two local destinations:

- `project` — `<workspace>/assets/kiln`, for assets owned by the current workspace. This is the
  save default when no destination was requested.
- `library` — Kiln's folder in the operating system's user-data directory, for assets the user
  explicitly wants available across workspaces.

The collection ID `project` predates versioned project configuration. It is only a
save destination and does not require, create or select a project record.

The gallery is the viewer for these collections, not a third storage destination. The user chooses
where an asset belongs through their request or the CLI's `--collection`; the agent passes that ID
to `kiln_save`. Remember another location with:

```sh
node kiln.mjs collections add my-game /absolute/path/to/my-game-assets
node kiln.mjs collections
node kiln.mjs save chair.kiln.js --name "Chair" --collection my-game
```

Paths are stored in the workspace's `.kiln/collections.json`. Restart an existing
viewer or MCP process after changing this configuration. `KILN_COLLECTIONS` can
override all defaults with a JSON map, such as `{"project":"/game/assets/kiln","library":"/my-library"}`.
The configured directories are the only collection roots the server exposes.
`kiln collections` prints each collection's directory, and `kiln import` prints the
directory of every revision it copied.

On Windows a configured root must name a drive or a network share, such as
`C:/Users/you/game-assets` or `\\server\share\kiln`. A Git Bash path such as
`/c/Users/you/game-assets` has no drive, so Windows would read it as
`C:\c\Users\you\game-assets` and saving would create that folder silently. Kiln
refuses such a root, naming the collection, where it was configured, where it would
have landed and the drive form to write instead. A relative directory given to
`collections add` resolves against the current directory before it is stored.
The CLI and MCP derive their workspace from the shared `KILN_PROGRAM_STORE` when set.

An asset directory contains `revisions/<revisionId>/manifest.json`, `asset.glb`, and,
when available, `source.kiln.js` and `preview.png`. Resource-dependent editable revisions
also retain `materials.kiln.json` with exact normalized maps and procedural recipes.
Copy the whole collection to move it.
Source/manifest files are suitable for Git; decide whether generated binaries belong
in Git, LFS, or ordinary backups. The generated workspace ignores GLB and PNG files
by default. There is no automatic deletion or disk quota for saved collections.

## Agents and refinement

1. Author/review with the existing tools. Draft rendering retains source but does
   not create saved collection revisions.
2. If the user names a destination, discover configured IDs with `kiln_assets` using
   `action: "collections"`; user intent wins. Otherwise use `project`. Call `kiln_save` with
   `programRef`, `name`, and that collection. The authoring skill records the known model and
   harness. Optional fields include tags, brief, description and author attribution; unknown
   attribution is omitted.
3. Save the returned asset/revision IDs. `kiln_export` returns exact artifact descriptors
   and readable resource URIs for the GLB, source, preview, and manifest. Configured hosts
   may also provide direct download URLs, including the editable ZIP.
4. In a later session, use `kiln_assets` with `action: "restore"`, collection,
   assetId and revisionId. Use the returned programRef with `kiln_source`/`kiln_edit`.
5. Save a child with the same assetId and `parentRevision` equal to the base revision.

Every save is immutable. A child does not update or delete its parent, and concurrent children are
retained as separate branch tips. The viewer exposes the revision selector and branch count, while
its asset detail panel shows supplied model, harness, and author attribution directly above the
downloads. The full build record remains available for inspection.

`kiln_assets` also lists configured collections, searches/paginates revisions and
retrieves complete build records. `kiln_import` copies one exact revision between
configured collections. Copies preserve identity and never update automatically.

The viewer's **Copy refinement instructions** provides an exact restore/edit/save
instruction for your agent. Library integrators can inject `AssetLibrary` into
`KilnToolContext`; `makeKilnProgramTools` exposes the same registry through Strands
plus a terminal submit tool. Existing generation/buffer surfaces remain compatible.

When the user asks to see a saved result, an agent should call `kiln_present` first. Supporting
chat clients render the interactive asset directly. In a coding harness that returns links but has
terminal access, the agent should launch
`node kiln.mjs view --collection COLLECTION --asset ASSET_ID --revision REVISION_ID` in a persistent
process using the exact saved values, provide the printed deep-linked loopback URL, and open it with
the harness's browser facility when available. Asking the user to start the viewer is the last
fallback, not the normal workflow.

## Export and import

```sh
node kiln.mjs export ASSET_ID REVISION_ID --out workbench.zip
node kiln.mjs export ASSET_ID REVISION_ID --format glb --out workbench.glb
node kiln.mjs export ASSET_ID REVISION_ID --format source --out workbench.kiln.js
node kiln.mjs export ASSET_ID REVISION_ID --profile runtime --out workbench-runtime.glb
node kiln.mjs import workbench.zip --collection library
node kiln.mjs asset ASSET_ID REVISION_ID --collection library --restore
```

An export never replaces an existing file. It hands off one exact saved revision, so a
second export to the same path fails and names the file; choose a new `--out`. This
differs from `render --out`, which replaces its own working output on every run. Add
`--json` for a receipt naming each written file with its `bytes` and `sha256`.
Across the CLI, `--json` prints a receipt from `render`, `source`, `export`, `discover`,
`inspect`, `animation` and `service status`/`reprobe`; `edit`, `save`, `collections`,
`assets`, `asset`, `import`, `project`, `material`, `review` and `migrate` print JSON
already and accept it; `generate`, `view`, `collections add` and `service start`/`stop`
refuse it with a message naming these commands. ZIPs are ordinary archives containing
one or more complete revisions. Source restore needs no original program store.
Source is capped at 1 MiB; normal evaluator limits can be lower. Bundles are bounded,
filenames are allowlisted and hashes are verified on import/read. GLBs must embed
resources, rather than fetch remote URLs when viewed.

The default `editable` profile preserves these exact saved files. Opt-in `runtime`
writes a standalone GLB plus `workbench-runtime.kiln-metadata.json`, moving only
Kiln's animation review extras into a hash-linked sidecar. Native playback needs no
sidecar. It does not reduce geometry or draw calls, and it never changes the canonical
revision. See [export profiles](export-profiles.md) for CLI/MCP/library usage, provenance,
paired-write behavior and limitations. The local viewer offers Original GLB and Runtime GLB,
with a companion Runtime metadata download. Keep the editable bundle for source and build records.

Imports preserve original IDs and parent references, even when an ancestor was not
included. Importing the same revision twice is harmless; a conflicting identity is
rejected. Each revision is committed atomically; a multi-revision import may have
committed earlier revisions if a later filesystem operation fails. Retrying is safe.

## Provenance and rebuilding

The manifest records source/GLB/preview hashes, parent revision, build warnings,
integration/QA information, effective host options and runtime identity when verified.
Packaged Node subprocess saves record that identity in `build.engine` with disk,
memory or disabled build reuse. Missing transitive peers in `--omit=peer`
installations are identifiable absence states; missing regular dependencies or
unidentified inputs still prevent verification. Memory/off hosts compute provenance
on their first save, retaining any failure reason in `localExecution.cacheReason`.
See [runtime identity](runtime.md#what-a-build-identity-covers) for the exact scope.
Source-development, Bun, in-process or unverified hosts are labelled explicitly. Briefs and model
attribution are supplied context, not authenticated authorship claims.

The source depends on Kiln: preserve the indicated engine installation/version for
rebuilding. Approved packaged textures travel with that engine. The local host resolves
recorded library material dependencies into the editable ZIP, including for standalone
assets. Missing or unsupported external dependencies prevent a complete editable export
instead of producing a misleading rebuild claim. Older ZIPs can lack these resources.
The GLB itself remains self-contained. After importing the editable asset, use
`node kiln.mjs asset ASSET_ID REVISION --rebuild --out rebuilt.glb` to build with its
saved material revisions and exporter settings; it reports whether the GLB hash matches.
CPU preview fidelity is recorded; use the interactive material rendering to inspect
appearance, and the structural report for geometry checks. GPU pixels are not QA evidence.
`preview.fidelity` describes the saved preview. A preview drawn from the saved
`asset.glb` bytes records `exactArtifact: true` and an `inputGlbSha256` equal to the
manifest's GLB hash; a derivative review surface stays `exactArtifact: false`.

The local browser host binds to loopback, serves only configured collections and
bundled viewer files, and rejects cross-origin requests and writes. It has no remote
authentication or public hosting mode. Remote MCP hosts must supply reachable file
delivery; localhost links on a remote machine are not user download URLs. Embedded
chat viewing and each client's download behavior require separate verification.
