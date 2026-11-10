# Cathedral square

The view opens in orbit on the parvis side of the west front. Drag looks around, the wheel zooms, and right-drag pans. Enter, or Walk the square, starts a walk on the parvis facing the west doors. Click the view to capture the mouse. WASD walks, Shift runs, and Escape returns to the orbit. The camera sits at 1.7 m and there is no player mesh.

The town is the film layout: the seeded streets, blocks and houses, instanced one mesh per kit part. Roads are the layout's paving. Collision uses a scene-kit capsule against the ground, town shells, cathedral structure at walking height, and placed furnishings. The west vestibules and sanctuary steps are traversable; walls, piers and furniture block movement. Houses stay shells. The young man and the horse cart stay out.

Lighting uses afternoon sun from the south-west, a hemisphere, fog, and cached directional sun shadows. A bounded, once-built glass transmission field filters the actual directional light. Columns, walls, furniture and paving receive the color through their normal surface shading; opaque shadows block the light behind them. There is no floor overlay or extra receiver draw. Additional diffuse fill follows the nave, aisles, transept arms, faceted apse and seven separate rear chapels, including their inward wall faces. Its 512×256 RGBA8 footprint field occupies 512 KiB and excludes the outdoor gaps between chapels. Light falls off with height toward the vaults; a broad hemispherical lobe responds to surface normals to retain lit and shaded sculpture planes. This is an artistic approximation of indirect daylight, not computed light transport or ambient occlusion. The exterior sun, hemisphere and exposure remain unchanged.

Six small flames sit on the existing exported candle tips. Two instanced flame draws add 1,200 triangles; balanced/high also allow six small depth-tested halo sprites. Two warm point lights represent the candle groups, with a 12-metre cutoff and two cached 512-pixel cube shadow maps (six faces each). Economy/minimal use one 256-pixel cube map and omit the halos. Opaque geometry blocks direct candle light, including the retable and choir piers. The static shadow maps do not redraw for flicker: only six flame transforms and light intensities vary, deterministically by at most 4.5 percent. Reduced motion holds both steady. Geometry, materials, halo texture, instance buffers and shadow maps are released on teardown; candle bodies and other borrowed asset resources are preserved.

Interior screen-space ambient occlusion strengthens nearby creases and contacts over a 0.3-metre radius. It uses eight samples on economy and sixteen on balanced/high, at half resolution with depth-aware blur. A separate-camera opaque prepass includes only the cathedral and furnishings. The effect attenuates indirect lighting through the same interior footprint as the bounce; direct sunlight, candle light and transparent glass are unchanged. Outside the interior, on minimal, or on WebGL2, rendering uses the original single pass. Screen-space AO cannot recover hidden or offscreen occluders. Render targets, the independently owned footprint texture and the dedicated occluder layer are released on teardown or world replacement.

The suspended crucifix's gold leaf and the retable/sanctuary gilding retain their authored colour, full metalness and roughness. Their runtime material clones receive one 256-pixel prefiltered reflection capture of the actual sanctuary, with reflection intensity 2.2. The selected reflecting meshes are excluded from that capture, then restored. It is cached per mounted world/light rig, rather than rendered every frame; no global scene environment or exterior material changes are made. A failed capture is attempted only once for that world/light pair and retains the authored appearance. The capture target and cloned materials are owned separately; original asset textures are borrowed and preserved. The close Suspended crucifix viewpoint makes its halo and raised INRI inscription inspectable.

When shadows are unavailable, direct sun and candle lights are disabled, retaining ambient fill and visible flames. This is raster lighting with finite shadow resolution, not path tracing or physical caustics. Exposure is restored on unmount.

The view selector provides close views of the repaired entrances, bases, retable, choir stalls, chapels, transept doors, seating and sanctuary crucifix. The saved Gemini crucifix hangs centrally above the altar, with two cables attached to the actual vault. Only its standing base is removed from this runtime placement; its post and beam are also reused for two wall crosses. Forty-four oak pews include kneelers and preserve a three-metre central aisle.

`ASSET-MANIFEST.json` lists every placed asset and its saved revision. The Cathedral Square gallery and scene use those same pins. The site page is `/scenes/cathedral-square/`, with the shared scene shell and selector; the asset pack is `/packs/cathedral-square/`.

The gallery and standard site-scene integration plan is in
`docs/plans/2026-11-09-cathedral-gallery-integration.md` at the checkout root.
It records the integration scope for all 22 asset pages, the shared pack, the normal scene shell, and compact View/More controls. `site-runtime.json` records the first passing separately bundled site build and its D-15 size ceiling. Browser and device qualification remain separate from that build receipt.

From the `scenes` workspace:

```
bun packages/cathedral-square/scripts/stage-pack.mjs
bun test packages/cathedral-square/tests
bun run typecheck
bun run lint
```

Staging reads the sibling `kiln-text-to-3d-run` checkouts, or `KILN_CATHEDRAL_ROOT`, `KILN_TOWN_KIT_ROOT`, and `KILN_CRUCIFIX_ROOT`. It writes `scene-pack.fragment.json` beside this package. The dev page is `standalone/` once the pack is staged. three meshlets stay off. Repair receipts and captured views live under `review/2026-11-09/`; source asset workspaces retain earlier revisions.

The site build does not require those authoring workspaces. Its hash-pinned `scene-inputs.json` archive restores the sealed data to `scenes/.cache/site-inputs/cathedral-square/standalone`. From `site/`, with `KILN_ASSET_MIRROR` pointing to the prepared release mirror:

```
node scripts/scene-inputs.mjs --scene cathedral-square
node scripts/scene-pack.mjs --scene cathedral-square
node scripts/scene-runtime.mjs --scene cathedral-square
node scripts/typecheck-scenes.mjs
```

To prepare a new local input archive from an already staged standalone pack, use `node scripts/stage-cathedral-site-inputs.mjs`. This verifies the pack and private-data scan, writes the deterministic archive into `.localdata/cathedral-release`, and updates the input and pack pins. It does not upload anything. Use the built static site for browser review; Astro's development server rejects dynamic imports of the generated public runtime.
