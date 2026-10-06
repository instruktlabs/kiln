# Troy status

Updated 5 October 2026, against main `7ed880f`.

Troy is published at `/scenes/troy/`, `/packs/troy/` and its normal gallery pages.
The current runtime pin is `troy-20261005-07`. The maintained source is
[scenes/packages/troy](../../scenes/packages/troy/README.md), with an explicit
runtime-data hydration step for a clean checkout. Development is local; the hub
is reserved for isolated performance testing.

Delivered: connected coast/city terrain and ocean, procedural sand/rock detail,
fleet arrival/unloading/formations, 720 ordinary actors and two heroes, corrected
48-archer poses, simple hands/grips, differentiated playable Achilles/Hector,
light/heavy attacks, stamina, blocking and bots. Shield rest is lateral; blocking
raises it in front with the forearm across the inner plate. A/D strafe correctly.
Mouse attacks supplement J/K and touch. Primary controls remain visible and
secondary controls start folded consistently with the other Kiln scenes.

The public pack has CC0 Runtime and Editable asset downloads, saved source/revision
resources and normal gallery previews. Browser scene code is MIT. Source packaging,
startup transport/bundling, the horse-ear child revision, public text cleanup and
the selected scene pictures have shipped. The private playfield-review prototype
is superseded and retired.

Performance acceptance targets 60 FPS on the quiet hub at 1440x900 balanced,
including combat and fleet transitions. Exact-candidate checks are retained;
release 07 corrects text while preserving release 06 model/bank payloads.
Frame tails remain, so this is not a locked-60 guarantee. Samsung reduced-tier
measurements do not establish tablet 60 FPS. Earlier stage-36/38 results retain
their original source scope in the
[historical completion report](../../docs/reviews/2026-10-05-troy-completion-status.md).

The delivered endpoint is this environment and two-hero interaction. Full army
casualties/projectile damage, boarding, wall climbing, an RTS campaign and optional
living-horse running contacts are outside it. The [current backlog](../../docs/backlog.md)
records separate engine/package milestones and known limits.

Use the current runtime and delivery manifests for subsequent changes.
[HANDOFF.md](HANDOFF.md) gives the local continuation path; dated reviews and recovery
archives preserve history rather than redefining the latest source.
