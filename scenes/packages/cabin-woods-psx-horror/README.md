# Cabin in the Woods: PSX Horror

An original asset demonstration built with React Three Fiber and Three.js WebGPU.
Explore the cabin, outdoor workyard and mixed woodland; inspect the individual
saved assets and authored animation clips. This is an asset demonstration with
a playable walkthrough and a limited encounter.

The [implementation plan](PLAN.md) tracks the remaining work, measured baseline,
performance goals and review criteria under one primary owner.

## Run from repository source

Install the pinned scene dependencies from `scenes/` with
`bun install --frozen-lockfile`. Download the exact scene archive linked on the
pack page, then run from this directory:

```sh
node scripts/hydrate-runtime.mjs /path/to/cabin-woods-psx-horror-scene.zip
bun run dev
```

Open `http://127.0.0.1:4431/game.html`. Hydration verifies the delivery identity and
each selected runtime input against `runtime-pin.json`. The outer ZIP hash is
supplied separately on the download page. It imports asset data only; downloaded
JavaScript never replaces editable repository source. No Kiln installation or
private authoring workspace is needed to run the scene.

`bun run build` produces the standalone browser application. Run
`node scripts/serve.mjs` to serve it on port 4432. `npm test` runs the portable
source tests. Runtime data and generated builds stay ignored by Git.

The scene download also includes this source as a standalone `scene-source/`
directory with its own frozen Bun lock and an exact snapshot of the shared
Three.js facade. From that directory, install with Bun 1.4.2 using
`bun install --frozen-lockfile`, hydrate from the same scene ZIP, then run
`bun run dev` or `bun run build`. Node 22.23.3 is the qualified runtime.

## Authoring and delivery

Assets remain separate editable Kiln revisions under the companion pack. Runtime
assets contain GLBs and metadata; full Kiln assets contain importable revision
bundles with canonical models, source, previews, editing metadata and pinned
material resources. Scene optimization creates consuming-runtime derivatives;
it does not flatten or alter the canonical editable assets.
Import and remix those bundles with Kiln 1.2.3 or later.

The scene opens at a fixed aerial view. Choose Orbit to rotate and zoom, or
Play as Caretaker to enter first person with the left-hand flashlight on.
The first entry starts unarmed: 1 selects empty hands, 2 equips the axe and
3 equips the shotgun. The equipment controls also appear at the bottom.
Controls and secondary options stay folded until opened. The first-person
camera stays fixed relative to the feet; authored arms and weapon poses do not
move the camera. The scene uses collision proxies, static part merging and
global vegetation instances with per-instance frustum selection. The former
spatial vegetation batches remain an explicit benchmark comparison; they are
not the scene's default strategy. Window and door assemblies share rigid
geometry batches while retaining their interactive parts and collision.
Desktop keyboard and mouse with WebGPU are required.
Hardware performance qualification runs on the connected hub; local timings
are diagnostic only. Mobile and other rendering backends are not qualified.

The optional room-occlusion helper is disabled and not connected to the scene.
Its structural tests do not qualify real WebGPU query behavior. The repository's
REVIEW.md records the approved presentation and measured performance limits.

Software retains the MIT license and third-party notices included here. Asset
publication licensing is recorded by the companion pack download.
