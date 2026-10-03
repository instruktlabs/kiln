# Golden Gate scene maintenance

Current source is authoritative. [REPORT.md](REPORT.md) and [PERFORMANCE.md](PERFORMANCE.md)
retain dated qualification evidence; they do not qualify later source or dependency changes.

## Layout delivery

`data/layout.json` is authored scene data. Staging delivers it as the manifest's `layout`
member. The scene-kit pack loader fetches it once and checks its byte count and SHA-256;
`src/layout.ts` parses those verified bytes separately for each world. The runtime has no
authored-layout fallback or mutable layout singleton. Approaches, dressing, vegetation, fog
banks and flight keys are passed from that world's layout to their constructors. The full
layout is not imported by browser source. Offline scripts and tests can explicitly import
`scripts/authored-layout.ts`.

The camera and quality tiers must exist before the pack loads. They use the small, immutable
`src/layout-bootstrap.json`, generated from authored data. Its projection includes cameras,
bridge dimensions, lane configuration and stations (without polylines), approach lengths and
end behavior, lamp configuration, reference colors, and flight names, labels and clearance.
The runtime checks the schema, bulk data shapes and the **exact projection** before allocating
world resources. A missing, malformed, incompatible or cancelled layout fails through the
existing loading/error lifecycle; it never silently uses bundled bulk data. Loaded pack
models remain owned and disposed by SceneRoot, as before.

This is an explicit rebuild boundary: changes to camera, bridge, lane, approach bounds or
other projected fields require regenerating the bootstrap and rebuilding the scene bundle
together with the revised pack. Compatible bulk-only edits can differ between mounts, but
still require the normal asset/scene qualification. Shape checks do not establish collision,
flight clearance or visual quality. Other tables in `src/data.ts` remain bundled.

After authored layout changes (and any required `scripts/layout.ts --write` derivation), run
from `scenes/`:

```sh
bun packages/golden-gate/scripts/generate-layout-bootstrap.ts --write
bun packages/golden-gate/scripts/generate-layout-bootstrap.ts --check
bun test packages/golden-gate/tests/unit/layout-loading.test.ts
```

The generation is deterministic and records the source SHA-256. The portable test gate checks
source/projection equality and source provenance; `--check` additionally compares the exact
generated file bytes. Do not hand-edit the bootstrap or weaken the runtime equality check to
make a stale bundle accept a new pack. Rebuild with `scripts/build-scene.ts`; its module receipt
must contain the bootstrap and omit `packages/golden-gate/data/layout.json`. Browser look,
driving, flight, count and performance qualification remains a separate release step.
