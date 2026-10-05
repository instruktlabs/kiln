# Kiln scenes

The maintained Farm, Golden Gate, Foundry Floor, Troy and shared scene-kit sources
live here. Farm, Golden Gate and Foundry Floor use React Three Fiber; Troy uses
Three.js directly. All use the same pinned Three.js version. The original three
scenes were integrated from the separate authored scene workspace for the v0.9
site rollout. Generated capture evidence and asset payloads are kept out of Git.
Historical milestone documents describe their original runs, not current release acceptance.

Read the source and development instructions in [Farm](packages/farm/),
[Golden Gate](packages/golden-gate/), [Foundry Floor](packages/foundry-floor/) and
[Troy](packages/troy/README.md). [Pack source](../packs/README.md) covers Farm,
Vehicles, Bridge, Foundry and Troy. Scene controllers and composition remain
separate from standalone authored asset programs.

Troy's maintained modules, portable tests, bounded asset transport and bundling
tools are public source. Its [runtime pin](packages/troy/runtime-pin.json) selects
an optional verified Cloudflare archive: `npm run hydrate` in `packages/troy`
restores generated models and banks into ignored `.runtime/`, and `npm run dev`
previews editable source. It requires neither the original author workspace nor
a `.kiln` setup. The normal portable gate includes Troy's source-only Node tests;
its generated payloads are never downloaded automatically by dependency install
or tests. See its README for clean-checkout commands and production staging.

The [current alignment plan](../docs/plans/2026-10-02-core-scenes-site-alignment.md)
and [backlog](../docs/backlog.md) cover core, shared tooling, all three existing
scenes and their assets before new Troy scene construction. Request ledgers retain
the original reports; their current dispositions are summarized in the backlog.

Install with `bun install --frozen-lockfile` in this directory. Scene dependencies
are separate from engine and site dependencies. Run `bun run check:toolchain` and
`bun run check:pins` first; the pin check resolves `../package.json`,
`../render-service/package.json`, `../site/package.json` and `../site/bun.lock`
within this integrated checkout, and compares the root and scene toolchain pins.
Run `bun run typecheck`, `bun run lint` and `bun run test` for the portable source
and script contracts; the normal test command now includes `scripts/tests`.
The portable runner explicitly lists
19 author-input suites that belong to `bun run test:integration`; several other
asset-dependent cases also report their existing fixture skips. Browser and asset-integration scripts
require staged inputs; authoring scripts that regenerate packs also require their
original author workspace. They are not generic clean-checkout tests.

For the production site, follow [the deployment guide](../site/DEPLOYMENT.md).
`site/scripts/scene-inputs.mjs` restores the exact reviewed scene packs and standalone
bundles under `.cache/site-inputs/`, with public archive and per-file hash checks.
The site builds Farm directly from this source, and serves the reviewed Golden Gate
and Foundry chunks without rewriting them. Use the scene kit's `sceneStandaloneConfig`
and verified asset packs when building a new standalone revision; changing source
requires requalification and new runtime pins before a site release.
After restoring those exact inputs, `bun run test:release-inputs` exercises the
released-asset integration cases and fails when required fixtures are absent.

Current scene inputs are Farm r36-local-review, Golden Gate g9 and Foundry ff3-review2.
Those revision names are retained for provenance. Foundry uses AMRs and arms to
transport containers and humanoids for maintenance. Its old in-production preview
label is historical; current source changes still require qualification and a newly
sealed runtime before being served by the site.

### Browser qualification on this Linux hub

Scene-kit browser tools and the site's scene island/width/touch/Foundry-flow checks
accept host-only configuration. The default remains headless. On the audited
NVIDIA Linux hub, use `KILN_SCENE_HEADED=1` and
`KILN_SCENE_CHROME_ARGS='["--ozone-platform=x11","--enable-features=Vulkan","--enable-unsafe-webgpu"]'`
for hardware qualification. Arguments are a JSON array, not a shell command. An
explicit helper `headless` option wins; helper arguments append after host flags.
The 3 October capability probe found SwiftShader with headless Chrome 150 and real
NVIDIA WebGPU/WebGL2 with this headed configuration. Record the actual adapter,
backend and source receipt for each run; a successful API check alone is not
hardware performance evidence. These options affect QA tools, not deployed scenes.

### Farm release audit

`scripts/capture-farm-paired.ts` implements D-68: capture the candidate and an
explicit last-accepted test build against the same immutable pilot pair at the
same phase. Supply `--label`, `--accepted-root` and `--new-root`; defaults cover
all 16 named/play views on both backends. A new failure against the pilot counts
as a regression only when the accepted build passes that same comparison.
This audit supplements direct before/after parity, counts and performance checks.

Release qualification also requires `--accepted-receipt`: a
`kiln.farm-accepted-build/1` record binding the exact accepted build hash to its
owner decision. Without that evidence the runner still produces useful diagnostic
results but reports `releaseQualified: false`. An arbitrary label, reconstruction
or adopted count baseline is not appearance acceptance. B-07 records its resource
profile explicitly: 39 textures for the prewarmed path and 41 for the current
cached-shadow path; legacy pilot allocations remain observations.

For the preserved full-matrix alignment audit, `packages/farm/dist/original-draw-after/test`
aliases the preserved optimized hub binary and `alignment-final/test` is the
historical candidate. Later UI rebuilds retain separate identities and bounded
evidence in the alignment plan. The original's 42 files were checked against the historical manifest.
Use the shared hardware options above, then run from this directory:

```sh
bun scripts/capture-farm-paired.ts --label alignment-farm-paired-local-new-run --accepted-root packages/farm/dist/original-draw-after/test --new-root packages/farm/dist/alignment-final/test --release r34 --backend both
bun scripts/farm-x02-baseline.ts measure --build alignment-final --backends webgpu,webgl2 --out .tmp/alignment-farm/local-new-run-x02-observed.json --log .tmp/alignment-farm/local-new-run-x02-observed-log.json
bun scripts/farm-x02-baseline.ts check --summary .tmp/alignment-farm/local-new-run-x02-observed.json --backend webgpu --json .tmp/alignment-farm/local-new-run-x02-webgpu-check.json
bun scripts/farm-x02-baseline.ts check --summary .tmp/alignment-farm/local-new-run-x02-observed.json --backend webgl2 --json .tmp/alignment-farm/local-new-run-x02-webgl2-check.json
```

Omit `--views` on the paired runner to cover all 32 cases; that runner does not
accept `--views all`. The command deliberately supplies no acceptance receipt, so
its result remains diagnostic even when every pair passes. Always give count
measurement an explicit `--out`: its default is the committed baseline. A
measurement is not authorization to re-baseline. Direct before/after image checks
use `capture-farm-draw-parity.ts` separately; its status now fails for failed,
errored or incomplete requested cells and reports that invocation's coverage.

Full-view parity uses the shared luminance and thin-line gates. Historical stream
crops retain their explicit luminance-only scope. `scripts/timing-ab.ts` records
GPU clock in MHz and paired busy-times-clock samples with provenance; it is an
activity proxy, not energy. Quiet-host/device and paired-decision requirements
remain independent of image/count acceptance.
