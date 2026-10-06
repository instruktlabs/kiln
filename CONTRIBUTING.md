# Contributing to Kiln

Small fixes, clear bug reports, examples and documentation improvements are welcome.
For a behavior bug, include a minimal `.kiln.js` program, the command or tool call,
and the error or image you saw. Include your OS, Node version and whether rendering
used CPU or GPU. Remove credentials and private paths from shared logs.

## Work on the engine

Read [AGENTS.md](AGENTS.md) and the [README](README.md). Contributor checks use Bun
1.4.2, Node 22.23.3 and npm 12.2.0. End users only need Node/npm for a built package.

```sh
bun install --frozen-lockfile
bun run check:toolchain
bun run check:skills
bun run build:sdk
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

The maintained scenes have a separate lockfile and validation commands:

```sh
cd scenes
bun install --frozen-lockfile
bun run check:toolchain
bun run check:pins
bun run typecheck
bun run lint
bun run test
bun test ./scripts/tests --timeout 20000
```

The pin check reads the engine, render service and site from the same checkout.
The portable test runner covers scene source contracts; the separate script-test
command covers the validation and evidence tooling. Asset and browser qualification
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

### Version

`version` in `package.json` identifies the installable release. Changes on `main`
ahead of that release go in the changelog's `Unreleased` section and can retain the
released version until the next release is prepared. A new release must bump the
version before producing its tarball: two different releases must never share a
package version. Patch for a fix, minor for changed or added capability; this
package is pre-1.0 and unpublished, so a minor is the normal case.

Bumping it means rebuilding: `runtimeBuildIdentity` hashes the version into each
entry's `identity` in `dist/build.json`, which is the value a build receipt cites. Run
`bun run build:runtime` and commit `dist/`. A test asserts the two agree -- nothing else
does, because the version is read from `package.json` at runtime rather than inlined, so
the bundle bytes are identical either way and a byte comparison cannot see the drift.

For behavior changes, first add a focused failing test, then make the smallest fix
and run the relevant checks. Keep the coverage thresholds. Ordinary tests use CPU
rendering and make no model calls. Live provider tests are optional and can spend
credits; they are not required for a documentation or platform contribution.

Rebuild the runtime bundles after changing the CLI, MCP server or evaluator:

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
Keep generated source examples and their provenance together. If you change a
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
