# Contributing to Kiln

Small fixes, clear bug reports, minimal reproductions and documentation improvements are welcome.
For a behavior bug, include a minimal `.kiln.js` program, the command or tool call,
and the error or image you saw. Include your OS, Node version and whether rendering
used CPU or GPU. Remove credentials and private paths from shared logs.

For suspected vulnerabilities, follow the [security policy](SECURITY.md)
and report privately to support@instruktlabs.com. Keep exploit details,
credentials and private assets out of public issues.

## Work on the engine

Read [AGENTS.md](AGENTS.md) and the [README](README.md). Contributor checks use Bun
1.4.2, Node 22.23.4 and npm 12.2.0. End users only need Node/npm for a built package.

```sh
bun install --frozen-lockfile
bun run check:toolchain
bun run check:skills
bun run build:runtime
node scripts/example-archive.mjs --fetch
bun run typecheck
bun run lint
bun run test
bun run test:render-service
bun run test:coverage
```

`bun run test` is `bun test src scripts`, so it never reaches `render-service/` -- a
separate npm project with its own lockfile and a native dependency.
`bun run test:render-service` does, after `npm --prefix render-service ci
--ignore-scripts` once. This suite needs no GPU or Dawn build; CI requires it.

`bun run test` and `bun run test:coverage` run through `scripts/gate-load.mjs`, which prints
host CPU before the run, samples it during the run and prints start, peak, mean and end after
it. Above 90% at the start it warns that timeouts in CLI-spawning tests are expected;
`KILN_GATE_REQUIRE_QUIET=1` makes that a refusal. A failure at high load is read as load only
when the file passes rerun alone; never raise a limit for it. Bun runs test files one at a
time, so those tests do not compete with each other and there is no serial lane. When the
host is busy, run the gate on a quiet second host instead.

The archive preparation restores pinned historical programs into ignored
`.cache/example-archive/` for the regression corpus and website archive. It makes
no model calls, changes no working files and verifies the original Git blob bytes.
Run it once after cloning; subsequent tests are offline. Old showcase assets are
not current teaching examples or part of the npm package.

The maintained scenes have a separate lockfile and validation commands:

```sh
cd scenes
bun install --frozen-lockfile
bun run check:toolchain
bun run check:pins
bun run typecheck
bun run lint
bun run test
```

The pin check reads the engine, render service and site from the same checkout.
three.js is pinned exactly in the engine, render service, site and scenes, and Dependabot
leaves it alone: upgrade it in one change by the [three.js upgrade checklist](docs/three-upgrades.md).
The portable test runner covers scene source contracts and script tests for
validation and evidence tooling. Asset and browser qualification
require staged inputs; see [scenes/README.md](scenes/README.md).

`lint` reports **nothing** on a clean tree, and a warning fails it. There is no
tolerated baseline to compare against, so any diagnostic your change produces is
yours -- either fix it, or suppress it with a `biome-ignore` comment that says why.

The surface is every directory that holds code: `src/`, `site/src/`, `site/*.ts`,
`render-service/` and `scripts/`. If you add
a directory, add it to `files.includes` in `biome.json`: Biome silently processes
nothing outside that list, which is how `scripts/` went unlinted while the coverage
run measured it. Note that `biome` prints at most 20 diagnostics by default, so a
count read off the output is a floor.

### Corpus gate

A change to primitives, helpers or export can alter assets people already saved. The corpus
gate rebuilds every saved pack revision (`packs/*/sources/` and flat pack snapshots such as
`packs/troy/assets/`) and the pinned example archive, then compares the GLB bytes with a
baseline made **on the same machine and Node**. GLB bytes depend on the Node that evaluates
the program: three.js converts every material colour to linear with `Math.pow`, which gives
different results on Node 22 and Node 24. On Node 22.23.4, Windows and Linux gave identical
bytes for all 817 programs that build (2026-11-18), although `Math.log` differs between them
for some inputs; the gate still refuses to compare across platforms, since a program could
reach those inputs. So neither a baseline from another Node or platform nor a manifest's
recorded hash is a portable reference. It is a manual or nightly maintainer
check, not part of `bun run test`; `scripts/corpus-gate.test.ts` covers its logic.

```sh
bun run build:runtime
node scripts/example-archive.mjs --fetch          # optional: adds the 190 archive programs
bun scripts/corpus-gate.ts list
git switch --detach origin/main && bun run build:runtime
bun scripts/corpus-gate.ts build --out tmp/corpus-gate/main.jsonl
git switch - && bun run build:runtime
bun scripts/corpus-gate.ts build --out tmp/corpus-gate/candidate.jsonl \
  --compare tmp/corpus-gate/main.jsonl --expect-file expected-changes.txt
```

Each pack revision is rebuilt as `kiln asset <id> <revision> --rebuild` would: saved exporter
options, saved requirements and the locked material closure, through the built Node evaluator
worker in a child process of its own (deadline 120 s, 4 GiB heap; `--deadline-ms`,
`--heap-mb`), so one crash or timeout cannot stop the run. The repository keeps no material
map PNGs, so each map is regenerated from its saved procedural or atlas recipe and must
reproduce its recorded sha256; otherwise that revision fails as `MATERIALS_UNAVAILABLE`.
Archive programs have no saved options and build with the CLI defaults. The gate refuses a
stale `dist/`, since the worker is what it measures. The worker runs the `node` on `PATH`, or
`KILN_CORPUS_GATE_NODE` when set; a build on another Node than `toolchain.json` pins says so,
and runs on the pin compare across maintainers' machines of one platform.

The run file is JSON Lines under ignored `tmp/`: a header with platform, toolchain, engine
commit and build identity, then one line per entry with its sha256, JSON-section and BIN
(geometry, images) chunk hashes, triangles, bounds, worker peak memory and whether it
reproduces the manifest's recorded hash (informative only). Lines are appended as entries
finish: `--resume` continues an interrupted run with the same engine build, and `--pack`,
`--key PREFIX` and `--no-archive` limit a run, for example to rerun one pack.

`compare` passes only when every compared entry built to the same sha256 or failed with the
same code and message. Changes are listed by pack with the JSON sections or BIN parts that
moved, triangle counts and bounds. State intended changes with `--expect PREFIX` or
`--expect-file` (one key prefix per line, `#` comments); anything else exits 1, and a
platform, architecture or Node mismatch exits 2. A baseline is never committed: it belongs to one machine and one
engine commit. Make a fresh one from `main` before measuring a change.

Runtime: the 836 entries (646 pack, 190 archive) took 17 minutes with `--jobs 2` on an
8-core Windows desktop running Node 24.20.0, already at 76–100% CPU from other work (34 minutes of summed entry
time). The largest worker peaked at 560 MB resident (a 208,000-triangle battle scene) and the
gate process at 400 MB. A second run on the same build matched it exactly (15 minutes,
40–100% CPU). Revisions saved by recent engines reproduce their manifest hash;
older ones mostly do not, because export output has changed since they were saved.

### Version

Maintainers should follow the [v1 release runbook](https://github.com/instruktlabs/kiln/blob/main/docs/releasing.md) for exact
archive qualification, npm staging and owner promotion.

`version` in `package.json` identifies the installable release. Changes on `main`
ahead of that release go in the changelog's `Unreleased` section and can retain the
released version until the next release is prepared. A new release must bump the
version before producing its tarball: two different releases must never share a
package version. Use a patch for compatible fixes, a minor for compatible added
capabilities, and a major for breaking changes to stable APIs. Kiln 1.0.0 is
published; the [SDK stability contract](docs/sdk.md#stability-in-1x) identifies
the explicitly experimental exceptions.

Bumping it means rebuilding: `runtimeBuildIdentity` hashes the version into each
entry's `identity` in `dist/build.json`, which is the value a build receipt cites. Run
`bun run build:runtime`; `dist/` is not tracked, and CI builds its own. A test asserts the two agree -- nothing else
does, because the version is read from `package.json` at runtime rather than inlined, so
the bundle bytes are identical either way and a byte comparison cannot see the drift.

For behavior changes, first add a focused failing test, then make the smallest fix
and run the relevant checks. Keep the coverage thresholds. Ordinary tests use CPU
rendering and make no model calls. Live provider tests are optional and can spend
credits; they are not required for a documentation or platform contribution.

`dist/` is built, not tracked. Rebuild it on a fresh clone, after a pull and after changing
the CLI, MCP server or evaluator; `bun run test` refuses a missing or stale build:

```sh
bun run build:runtime
```

Try the result in a separate authoring workspace:

```sh
node scripts/create-workspace.mjs ../kiln-test-assets --harness opencode
```

Choose your installed harness and follow the generated `START.md`. The directory
must be empty and outside the engine installation. Setup copies project-local
skills and configuration without changing global agent settings or authentication.

In a pull request, describe the problem, resulting behavior and checks you ran.
Keep generated showcase assets in separate authoring workspaces; include only the
small reproduction or regression fixture needed for an engine fix. If you change a
public tool, update its shared registry definition rather than duplicating a
transport-specific definition.

## Check a built package

```sh
bun run build:runtime
npm pack --ignore-scripts
npm run test:package -- --tarball /absolute/path/to/the-generated-package.tgz
```

Use the actual filename printed by `npm pack`. The check installs runtime
dependencies in a temporary directory and exercises the packaged CLI, MCP server,
workspace setup and exports. It uses npm registry access but makes no model calls
and publishes nothing.

## Help verify macOS

Windows, Linux and hosted macOS runners have passing package checks, including
Apple Silicon and Intel. The [Mac setup guide](docs/install.md) still benefits from
reports on real user installations and optional GPU support.

If you have a Mac, try the built-package workflow and report the package hash,
macOS version, Node/npm versions, architecture (`node -p process.arch`) and package
check result. A small PR fixing a reproduced installation issue is useful; a clear
passing or failing receipt is useful too. CI already contains native jobs for both
architectures. No model generation or paid provider account is needed.

Keep CPU package verification separate from Apple GPU/Metal testing. A successful
installation does not establish GPU support. There is no need to install a new
global skill set or copy authentication files to contribute either check.
