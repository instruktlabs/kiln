# Troy archer mitt intake

Latest owner correction: the mitt child r_56a63955df434655be9a11d0afdb01dd is
REJECTED visually, including the archer-v2 style. The replacement is child
r_2afc9ff07e944c70be5236f263c3f9bc: one compact solid beveled hand block per wrist,
no sideways finger slab, separate thumb or opening. It is saved, exactly rebuilt,
GPU-reviewed and displayed in Library 4538. Read the newer
kiln-oss/docs/reviews/2026-10-04-troy-block-hands.md. This new geometry is not yet
the live scene donor; role anchors/attachment poses and banks require new intake.
Old hand contact passes do not qualify it. Earlier selected-mitt wording below is
superseded. The full goal remains active and owner appearance approval is pending.


4 October 2026. Local consumer checkpoint; full Kiln/Troy goal remains active.

The owner-directed simple mitt child `r_56a63955df434655be9a11d0afdb01dd`
on crew asset `a_7da693c39d774fd89e584cb99fd238b6` is now the archer hand donor.
The detailed-finger child was rejected. The scene reuses the Trojan soldier body
and the existing exact bow set, with the saved mitt GLB copied into
`scene/web/runtime/archer-v2/hands.glb`. Its SHA-256 is
`bb749ef290903b65231a4c3d2e2544c2c28ad379f5be3d1e5587a099921544b4`.
The original fleet donor and all asset parents remain preserved.

## Changes

The scene-owned graft retains matte donor skin on body and hands without mutating
the loaded soldier master. The bow grip mount no longer uses the old 12.5 mm
offset. Left grip closure is [81,35,50] with thumb [-75,-35]; right draw contact
and the anatomically constrained elbow route are retained. Six visible finger-band
meshes replace 24 individual finger meshes. All named digit pivots remain.

Batch preparation removes unused tangent attributes from owned geometry copies
when the material has no normal map. This merges compatible matte body and mitt
skin into one material batch; normal-mapped cloth retains its tangent data.
No engine runtime change or universal character-kit migration is implied.

Independent checking found a 0.03037 radian bow-normal interpolation error just
after release. A focused failing test reproduced it. Adaptive fitting now checks
deforming normals as well as positions, using a 0.004 radian fitting limit.
`archer-bank-08` retains the failed intermediate bank; `archer-bank-09` is installed.

The active bank has 77 parts, 578 frames and 3,250,672 binary bytes, compared with
95 parts, 566 frames and 3,427,696 bytes before this intake. The final payload is
177,024 bytes smaller (5.2%). This is an artifact-size comparison, not a timing claim.
Source, input and payload hashes remain enforced at scene load.

## Evidence

`scene/evidence/archer-mitt-intake-01/receipt.json` pins current source snapshots,
bank and six manual CUA screenshots. All 129 scene tests pass, including new exact
input, grip, skin immutability and material-layout tests and the bow-normal regression.
Failing and passing receipts are retained in `scene/evidence/archer-mitt-*.tap`.

Independent saved-bank verification checks 585 times, including 0.37 interval
probes, visibility events, reverse traversal and modulo times. It checks 5,754,330
visible vertices: worst position error 1.433 mm; worst deforming normal angle
0.003267 radians. These are sampled bounds, not continuous certification.

Packed triangle grip checks use the decoded bow grip frame. Minimum palm radius
is 31.064 mm; minimum visible band radius is 30.099 mm against a 30 mm handle.
The largest nearest-band gap is 0.423 mm. The test permits 2 mm bank error, although
these sampled minima remain clear of the source handle radius.

The actual scene loads all 48 packed archers. Retrieval (1.8 s), full draw (4.5 s)
and release (5.0674 s) were inspected with the native time scrubber on WebGPU and
WebGL2. Both showed the simpler hands with no logged warnings or errors. Screenshots
are JPEG visual records; no pixel-parity or current shadow qualification is claimed.

## Remaining work

Owner approval of the hand appearance is pending. Fleet, infantry and hero hands
still need consistent mitt styling and role-specific equipment/contact intake,
including affected banks, bounds and identities. The current archer shadow parity
and complete-workload hub/device costs need fresh qualification. Previous archer
and hero browser receipts describe their recorded source identities; they do not
qualify this changed main entrypoint. Wider terrain, gameplay, bot, route, reusable
workflow, skill, site and delivery requirements remain in the active completion plan.
