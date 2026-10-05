# Troy release plan, 5 October 2026

End state: this computer holds the latest committed and in-progress Kiln/Troy source, editable assets, generators and evidence. Development continues here; the hub serves isolated performance testing. Troy is a normal public Kiln scene and CC0 pack with gallery previews, coherent pictures and downloadable models. The exact published artifact is reproducible from a clean source commit and verified live.

The user reviewed the playfield and requested final A/D, shield-rest and mouse-input corrections. Those are implemented and tested. The public scene/pack/gallery integration and tighter pictures are prepared. Remaining release work:

1. Commit and push the curated private source, preserving exact authored revisions, banks, generators, tests and compact receipts. Keep credentials and machine state out of Git. Preserve recovery archives and old outputs without cleanup.
2. Commit the public source pack, maintained skill guidance and site integration. Keep unrelated existing edits intact. Pass exact-commit CI, including the Windows/Linux engine gates and site fixtures. No npm publication is implied.
3. Build with `KILN_SITE_PACKS=1` from a clean checkout and the sealed public archive. Verify deployment preflight, all artifact hashes, private-data scan, model previews and Explore/play/Exit.
4. Deploy through the existing site workflow. Verify live commit/build identity, picture/model/runtime hashes and a real public scene flow. Record final commits, receipts and the final recovery checkpoint.

Retained performance scope and device limitations are in [completion status](../reviews/2026-10-05-troy-completion-status.md). The primary stage-36 WebGPU means meet 60 FPS at 1440x900 balanced; frame tails, WebGL2's small unloading shortfall and tablet reduced-mode results remain explicit. Stage-38 input/pose changes are functionally verified; they are not retroactively timed by older receipts.
