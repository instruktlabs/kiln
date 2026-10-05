# Troy packed footprints — 4 October 2026

The opt-in regrouping prototype now has a compact route representation available
as `regroup=packed`. Its motion sampler matches the reference exactly at 336,888
checked states across all 224 routes. This reduces route storage and avoids the
reference's expanded per-step object graph. It does not move posing onto the GPU
or establish a frame-rate improvement.

All work remains external in
`/home/matthewk/X/kiln-dogfood/v1-readiness-2026-10/review/troy-expansion/scene`.
The engine, accepted assets and installed authoring skills are unchanged.

## Storage and contract

| Route data | Reference | Packed |
| --- | ---: | ---: |
| Raw bytes | 15,524,706 | 2,655,279 |
| Gzip bytes | 2,799,519 | 2,014,077 |

Raw reduction is 82.9%; gzip reduction is 28.1%. These are artifact sizes, not
measured network transfer, load duration or total browser memory. Packed metadata
is 78,655 bytes and its payload is 2,576,624 bytes. Compiling all plans adds
4,716,432 bytes of typed index/centre/tangent arrays; orientation metadata, other
JS allocations, rigs and renderer resources are additional.

`web/runtime/motion-v1/footprint-bank.mjs` is a reusable consumer module without
Three.js, rig or Troy dependencies. It stores double-precision positions and
shared yaw/normal records, preserving the already-qualified contacts without
quantization. A checked manifest supplies plan IDs, ranges, timing and lift. The
sampler uses compact contact indices and the same interpolation arithmetic as the
reference. Empty plans, optional normals, completion and arbitrary reverse seeks
are supported. Payload bytes are borrowed and must remain immutable.

It is a footprint playback format, not VAT, skeletal animation, navigation or
collision proof. It does not expose expanded reference `segments`. The original
editable route record and its contact/spacing evidence remain intact.

## Qualification and reproduction

`output/regroup-packed-01/qualification.json` records exact sampler equality at
every quarter step plus endpoint/completion/reverse checks: 336,888 states across
224 plans. Source plan SHA-256 remains
`2907dd116d69508695ee8dc4274b12f24b56fe54bb2e13f67821c71c36407467`.
Packed payload SHA-256 is
`7475a03b0d4dbc59bbc8e958a6ab7f188255e3d10bacbb8dc0828c210097a503`.

37 scene tests pass. Tests cover sample parity, malformed data rejection and
actual crew world-matrix equality through preparation, marching, formation idle
and reverse seeks. The scene loader verifies both metadata and payload hashes;
the existing controller rejects stale landing frames, clocks and actor rosters.

`evidence/regroup-packed-01` passes 20 captures on each actual backend. All 72
image comparisons are pixel-identical: 40 reference/packed pairs, 20 culling
off/on pairs and 12 forward/reverse pairs. Captures verify instance matrices,
224 unique actor IDs and conserved phase totals. Source snapshots, tests,
qualification and capture hashes are retained in its provenance record. No
performance timing was run for this storage change.

`PACKED-FOOTPRINTS.md` documents the format and reusable API. The scene adapter uses
`scripts/pack-regroup.mjs`, `stage-packed-regroup.mjs`, `capture-regroup.mjs` and
`compare-regroup.py`. Derivatives remain outside the engine toolchain. Promotion
into optional skills should follow broader consumer qualification.

CPU posing, final formation idle cost, later offshore landings, device/range
policy and the remaining full Troy objective are still open. No new performance,
physical-mobile, owner or public-release acceptance is claimed.
