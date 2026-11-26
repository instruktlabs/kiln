# Seed town

A small old town built in the browser from nine kit models, with the roads and trees round it. Type a seed and the page stands a different town from the same files: nothing is fetched, only instance buffers are rewritten.

The view opens in orbit over the whole town. Drag looks around, the wheel zooms, and right-drag pans. Enter, or Walk the town, starts a walk on the road south of the high street. Click the view to capture the mouse. W A S D walks, Shift runs, and Escape returns to the orbit. The camera sits at 1.65 m and there is no player mesh. Day and Dusk turn the light; at dusk the plan lights windows and lamps.

## How a town is made

1. `src/plan/town-plan.js` turns a seed into a plan: streets, block columns, one lane or the market square per column, a gatehouse row at every street end, and a list of placements. A placement names a kit, a position, a quarter-turn and the kit's parameter values. The planner is pure: no clock, no `Math.random`, lengths in whole tenths of a metre where they must add up. It is the planner the kits were built and checked with; `tests/plan.test.ts` pins five of its plans.
2. Each kit file carries its parameters. Options are nodes tagged `extras.kilnParamV1` with the values that show them, colours are tagged materials, and sizes are morph targets named `<parameter>=<value>`. `src/kit-spec.ts` reads those from the glTF JSON and answers, for one placement, which parts show and what the morph weights are.
3. `src/town.ts` keeps one `InstancedMesh` per kit part for the whole town. A placement adds an instance to every part its options show, with its matrix, its size weights and its colour. A new seed fills the same buffers again. A mesh is replaced only when a town needs more instances than the mesh was made for.

Three notes on step 3:

- The sizes are not drawn as three's morph targets. three r187 keys a shader build by the ids of a geometry's morph attributes, so every sized part would get its own program and pipeline, in the camera's pass and again in the sun's shadow pass: 288 pipelines for 195 draws, and most of the scene's load time. `src/morph.ts` keeps every part's deltas in one texture and every instance's turn and weights in another, and one position node applies them for all parts, so parts that share a material share a build (45 pipelines). The drawn geometry shares the kit's vertex buffers and carries no morph targets; the kit's own geometry keeps them for the CPU bake and the far-tree pictures. three applies `positionNode` after instancing, so the node adds each delta already turned by the placement's yaw: a placement must stay a turn about Y and a translation.
- Colour-driven materials are set to white when the kits load, and each instance brings the colour.
- Frustum culling is off for these meshes: one mesh spans the town, and a size moves vertices beyond the geometry's own bounds.

## Walking

Collision is built per town in `src/collision.ts`: the paving and junction kits as they are built (so kerbs, gutters and the cambered road are real steps and slopes), one box per building, one box per lamp and piece of street furniture, and the open ground outside. Buildings are solid, their passages included. Changing the hour keeps the collision; changing the seed rebuilds it.

## Light

`src/light.ts` holds the two hours and `src/lighting.tsx` turns between them over 1.8 seconds (at once under reduced motion). There is one sun, a sky fill, fog and one cached sun shadow map sized to the town. The kits' emissive material is scaled by the hour. This is raster lighting with finite shadow resolution.

## Pack

`ASSET-MANIFEST.json` pins the nine saved kit revisions and the runtime file each one exports with carried sizes (`kiln export <asset> <revision> --format glb --profile runtime --carry-shapes`). The pack also holds `data/kits.json`: each kit's defaults and size ranges, taken from its saved declaration.

From the `scenes` workspace:

```
bun packages/seed-town/scripts/stage-pack.mjs
bun test packages/seed-town/tests
bun run typecheck
bun run lint
```

Staging reads the sibling `kiln-seed-street` workspace, or `KILN_SEED_TOWN_ROOT`, and its `out/carried` exports, or `KILN_SEED_TOWN_CARRIED`. It refuses a file that does not match the manifest; `--pin` rewrites the manifest from the workspace instead. It writes `scene-pack.fragment.json` beside this package. The dev page is `standalone/` once the pack is staged; `standalone/vite.dev.config.ts` serves it with the kit's test hooks and URL parameters (`?seed=`, `?hour=dusk`, `?tier=`).
