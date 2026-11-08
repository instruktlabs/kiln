# Upgrading three.js

three.js decides how Kiln's GPU views, site viewer and scenes render, so it moves on
purpose. Each upgrade is one change that moves the engine, the render service, the site
and the scenes together and comes with its evidence. Dependabot ignores `three` and
`@types/three` (`.github/dependabot.yml`) because a Dependabot update edits only
manifests and lockfiles. The same change also has to move the render service's build
identity, the scene kit's revision guards and the scene pin table. And CI compares
only CPU views, so what a release changes in the GPU views shows only in before/after
renders.

Nothing announces a release now that Dependabot ignores three. When Dependabot's
monthly updates arrive, compare `npm view three version` with the pin. Run this checklist
for every release, patch releases included.

## 1. Read the release

- Read the GitHub release notes, the
  [Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide) entry for
  the step, and the compare view `rOLD...rNEW`.
- In the compare view, read every change to what Kiln builds on:
  - the common, WebGPU and WebGL-fallback renderers;
  - nodes and TSL;
  - PMREM;
  - geometries;
  - `GLTFLoader` and `GLTFExporter`;
  - the controls.

## 2. Audit Kiln against it

- Find the code and prose that name the old release:
  `git grep -n -E "rOLD|0\.OLD|upstream|workaround"` in `src/`, `render-service/src/`,
  `site/src/`, `site/scripts/`, `scenes/packages/` and `skills/`. Sort each hit into one
  of three outcomes:
  - still needed;
  - fixed upstream: remove the workaround, with a test;
  - changed: update the code and its test.
- The scene kit's contract tests read three's own source and pin the code Kiln relies on.
  When one fails after the bump, re-read that code and find out why it changed before you
  edit the test.
- Look for new capabilities worth adopting:
  - WebGPU and TSL;
  - glTF loading and export;
  - compression;
  - instancing and `BatchedMesh`;
  - shadows;
  - tone mapping and colour management.
- Keep two lists, adopt and defer, with a reason for each item. Each adoption is its own
  commit with its own test.

## 3. Bump every tree at once

1. Set the version in each place that pins it:
   - `three` and `@types/three` in `package.json`, `render-service/package.json`,
     `site/package.json`, `scenes/package.json` and each `scenes/packages/*/package.json`;
   - `RENDER_SERVICE_DEPENDENCIES` in `render-service/src/build-identity.mjs`;
   - `APPROVED_PINS` in `scenes/scripts/check-pins.ts`.
2. Move the scene kit's revision guard
   (`scenes/packages/scene-kit/src/renderer/index.ts`) and its stage pin
   (`scenes/packages/scene-kit/src/staging/index.ts`), and the `three` field in each
   scene's `scripts/stage*.ts`.
3. Refresh the lockfiles. Run `bun install` at the root, in `site/` and in `scenes/`, and
   `npm install` in `render-service/` with the pinned npm.
4. Run `git grep -n -F 0.OLD.`. The only hits left should be history (`CHANGELOG.md`,
   `docs/plans/`, `docs/reviews/`, `docs/evaluation/`) and frozen provenance. One example
   of frozen provenance is `scenes/packages/farm/scripts/gen-golden.ts`, which reruns its
   golden only under the release that measured it.

Three checks fail on any tree that was left behind:

- `bun run check:toolchain` covers the four manifests;
- `bun run check:pins` in `scenes/` covers every scene package, the lockfile and the
  installed copy;
- `bun run test:render-service` covers the build identity.

## 4. Gate

Run the full offline gate in [AGENTS.md](../AGENTS.md#toolchain-and-validation), then:

- `KILN_GLTF_EXPORTER=three bun run test`, the community-exporter run that CI also makes;
- the site's checks in `.github/workflows/pages.yml`, through `bun run build`;
- the scenes workflow's checks in `scenes/`: `check:toolchain`, `check:pins`, `typecheck`,
  `lint` and `test`;
- the scene builds: `bun run build`, `bun run build:scene` for each scene, and each scene
  package's own `build`.

## 5. Compare renders before and after

Keep a second worktree on the old release. Give it its own install and
`bun run build:runtime`, and its own render service on another `KILN_RENDER_SERVICE_PORT`.
Render the same assets on both releases, twice each, so you measure the noise instead of
assuming it.

- Cover at least the cathedral, a textured or normal-mapped asset, a skinned or animated
  asset, and an asset that uses UV sets 0 to 3.
- CPU views and exported GLBs: the bytes should match the old release. Explain every
  difference.
- GPU views: for each channel, report the largest and the mean absolute difference and the
  share of pixels that move by more than 12 levels. Explain every change that is not noise.
- Review rig: record the mean CIEDE2000 of the calibration chart
  ([review lighting](rendering.md#review-lighting)). If the rig's output moves, either keep
  its id and record the drift, or define a new rig id. Never retune a rig that has shipped
  without saying so.
- Site viewer: record the draw and shader counts from `site/scripts/verify-viewer-draws.mjs`
  on WebGPU and on WebGL2.

GPU images are visual evidence only; they never count as gate evidence.

## 6. Record

- In `CHANGELOG.md`, record:
  - the new pin;
  - that the render service's build identity moves, so a service still running the old
    release reports itself incompatible until `kiln service stop`;
  - every visible change, with its measured size.
- In the pull request, give the adopt and defer lists, the render comparison and the gate
  results.
