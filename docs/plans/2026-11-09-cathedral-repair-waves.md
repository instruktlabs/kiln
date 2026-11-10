# Cathedral Square repair and upgrade

## Goal

Repair and upgrade Cathedral Square into a coherent, reverent Catholic cathedral walkthrough: sound entrances and wall joins, complete column bases, supported statues, well-fitted choir stalls and nave seating, the intended Gemini crucifix, corrected house dormers, reliable interior collision, and convincing stained-glass daylight. Preserve editable assets and prior revisions, verify exported assets in the actual scene, and prepare consistent gallery pins for owner review.

## Scope and sources

- Scene: `C:/Users/Mattm/X/kiln-cathedral-scene`, branch `scene/cathedral-walk`. Existing uncommitted changes are preserved.
- Cathedral asset workspace: `C:/Users/Mattm/X/kiln-text-to-3d-run/cathedral`.
- Pinned baseline: `project/a_d606fc5eebd44bd7b7db3611537b9570`, revision `r_ff0133e2d4f84b8d83f9e6db1c9f5c4d`.
- Repair source starts from that saved revision, in `cathedral/repairs-2026-11-09/cathedral-repaired.kiln.js`. The later loose source is retained separately; it contains an older locally constructed crucifix, not the intended Gemini asset.
- Town assets: sibling `cathedral-square` workspace. Repair the three eaves-house variants from their pinned saved sources.
- Intended crucifix: sibling `cathedral-crucifix`, asset `a_1f6e07b0010946e080861252aa9030f9`, revision `r_d584e2e4db284f9191ab9e8b4514088a`.
- Baseline manifest, loose source and eight owner screenshots: `scenes/packages/cathedral-square/review/2026-11-09/`.
- No commit, push, publication, deployment, global configuration change, or unrelated live-provider run is authorized by this plan. Local implementation and Astra/Sol subagents are authorized. Existing exclusions for the young man and horse cart remain.

## Waves

1. Baseline and ownership. Verify workspace CLI/runtime, preserve inputs, map issues to named geometry, establish non-overlapping agent ownership.
2. Geometry. Astra owns architectural decisions for west side entrances and chapel/transept joins. Focused implementation repairs bases, retable gables, statue supports, choir-stall clearance and roof/dormer intersections. Use failing focused checks before behavior changes. Keep authored geometry in asset workspaces.
3. Interior and traversal. Integrate the actual Gemini crucifix with deliberate scale and sanctuary sightlines. Add restrained timber nave pews/kneelers and assess Catholic sanctuary arrangement. Extend the existing BVH collision with structural and furnishing geometry; preserve intentional door openings and walkable steps. Keep runtime controllers and collision in the scene.
4. Lighting and presentation. Review existing hidden stained-light geometry; develop fixed-afternoon colored projections with correct window/sun alignment and solid-wall occlusion. Improve local shadow coverage, review gargoyles as restrained architectural waterspouts, and measure cost. No claim of physical caustics from a raster approximation.
5. Integration and acceptance. Save new asset revisions without altering old ones; update pins, hashes and receipts; stage pack and verify the actual standalone and site consumer flows. Review screenshot-equivalent camera positions, whole exterior, nave/sanctuary and all repeat variants. Record tests, performance scope, limitations and remaining owner judgments.

## Acceptance checklist

- [x] Both halves of both side west entrances have real passage or deliberate solid closure, with no unintended outside sightline.
- [x] Visible shoulders of column bases are closed, properly wound surfaces.
- [x] Each retable canopy belongs to its niche; no lower triangular obstruction covers the central figure/crucifix.
- [x] Choir stalls clear columns and permit access on both sides.
- [x] All chapel statues have visible, correctly contacting supports.
- [x] Audited chapel, ambulatory and transept joins close; intentional openings remain open.
- [x] Blind arcading respects both transept doorways and window openings.
- [x] Three eaves-house variants have fully visible dormer glazing and closed roof junctions.
- [x] Nave seating fits human scale, preserves principal and side routes, and has collision.
- [x] Saved Gemini crucifix is used and identifiable in scene pins; cross-only reuse is deliberate.
- [x] Sanctuary furnishings and gargoyles have a coherent Catholic Gothic treatment and receive visual review.
- [x] Walk routes block walls, columns, altar, supports and furniture while passing doors and steps; no stuck-corner or run-through regression in tested routes.
- [x] Stained-glass daylight follows actual openings and sun; no observed projection through opaque walls.
- [x] Required scene tests/typecheck/lint/build and applicable integration checks pass; bounded rendering-cost comparison recorded.
- [x] Updated exact revision inventory, local scene and before/after evidence are ready for owner review. Publication remains separate.

## Status

All five local implementation waves completed. New asset revisions, cs2 manifest and site pack input are consistent. Targeted geometry, collision, contact, typecheck, lint, portable tests and standalone build pass. Actual browser views were reviewed. See scenes/packages/cathedral-square/review/2026-11-09/REVIEW.md for evidence and limits: automated frame timing does not qualify foreground FPS; owner visual acceptance and public gallery publication remain separate.
