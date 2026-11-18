# Camera recipes for authoring

Choose the number of images for the question you are answering. Replace `REF` with the actual `programRef`, copied exactly, including its `p_` or `sha256:` prefix. Omit `capture` for the default six-view sheet.

## A compact orbit sheet

```js
kiln_render({ programRef: REF, capture: {
  preset: '2x1',
  cells: [
    { name: 'Form', azimuthDeg: 35, elevationDeg: 25 },
    { name: 'Underside', azimuthDeg: 215, elevationDeg: -25 },
  ],
} });
```

Presets are `COLSxROWS`: `1x1`, `1x2`, `2x1`, `3x1`, `2x2`, `3x2`, `3x3`. `cells` run row-major and cannot exceed preset capacity. Orbit azimuth 0/90/180/270 means front/right/back/left. Positive elevation looks down; negative looks up. Legacy `zoom` is a padding multiplier: larger values pull back.

## A whole asset and one local detail

Read exact part paths from a render result. It previews 24 entries (every entry that fits only with `detail: "full"`) and reports `partsTotal` and `partsTruncated`. Retrieve later or nested paths with `kiln_inspect({ programRef: REF, image: false, listParts: { query: "hinge" } })`; omit `query` for all parts and follow `partListing.nextOffset` using the same reference/query. Listings include groups and exported primitive children. `subject.name` requires an exact unique name; `subject.path` resolves duplicate names unambiguously.

```js
kiln_render({ programRef: REF, capture: {
  version: 'kiln.capture.v1', cols: 2, size: 512, output: 'grid',
  shots: [
    { name: 'Whole asset', camera: { type: 'orbit', azimuthDeg: 35, elevationDeg: 25 } },
    { name: 'Joint', subject: { path: PATH_FROM_RENDER }, visibility: 'context',
      camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 90, elevationDeg: 10, padding: 1.4 } },
  ],
} });
```

Versioned capture accepts 1–9 shots, 1–3 columns, and a square per-shot `size` from 128–2048. It does not accept `width`/`height`; those are returned dimensions. Set `output: 'separate'` when individual images better fit the harness. `visibility: 'isolate'` hides everything outside the selected subtree; context remains visible by default. Orbit `relativeTo` is `world`, `asset`, or `part`. Put `subject` on the shot, alongside `camera`, using either `{ path: EXACT_PATH }` or `{ name: EXACT_UNIQUE_NAME }`, never both. Orbit cameras derive target and distance from that subject's bounds; `padding` belongs inside `camera`, while `subject`, `target` and `distance` do not. Use an explicit camera when you need `position` and `target`.

`backdrop` selects the colour behind every cell: `neutral` grey by default, `dark` when a part that merges with the grey is lighter than it (near-white, pale grey, emissive), `light` when it is darker (near-black, dark wood). Choose it from a sheet you have seen, not from the brief: render on the default first and switch only when a silhouette merges with it. It is a fixed choice, not a free colour, and the result echoes it as `capture.backdrop`. Legacy `preset`/`cells` sheets accept it too.

The same capture object can accompany `kiln_edit` so the edited result answers the same visual question. It is a render request, not a source change.

For selective occluders, use `version: 'kiln.capture.v2'` and add
`hide: [EXACT_PATH_FROM_LISTING, 'UniqueCoverName']` to a shot. There are at most 64
selectors; a hidden group hides its subtree, and missing or ambiguous names fail
before any image is drawn. CPU and GPU captures use the same list. Framing is
resolved first so hiding a cover retains the comparison camera. Read the canonical
paths in the returned `cameraShots[].hide`. Version 1 stays valid but cannot use
`hide`. CLI `--capture` reads the same capture JSON.

## Explicit framing

```js
{ name: 'Eye level', camera: {
  type: 'explicit', projection: 'perspective',
  position: [4,1.4,3], target: [0,1,0], up: [0,1,0], fovDeg: 45,
} }
```

This is a shot inside versioned `shots`. Explicit position/target/up default to world-space. Set `relativeTo: 'asset'` or `'part'` for asset/selected-part coordinates, or `'local'` with `frame: { origin, rotation }` for a rigid world-space frame. Frame rotation is Euler XYZ degrees; `frame` is accepted only with local mode. Lens distances remain world units. Orthographic cameras use `projection: 'orthographic'` and may set `halfHeight`. Optional near/far must enclose what you want to see. Unknown fields are errors; do not invent camera keys.

Inspect returned resolved cameras and fidelity/fallback receipts. A correct-looking CPU sheet can establish geometry but not PBR material appearance. A camera-only request may reuse a compatible evaluated build; a `programRef` identifies source, not a guarantee of a cache hit.

## Fit a local view to bounds

```js
{ subject: { path: PATH_FROM_RENDER }, camera: {
  type: 'explicit', projection: 'orthographic', relativeTo: 'part',
  position: [2,1,0], framing: 'bounds', padding: 1.3,
  targetOffset: [0,0.1,0],
} }
```

With `framing: 'bounds'`, target may be omitted and defaults to the selected world-bounds center. The camera fits the selected geometry; omit `halfHeight` because fitting computes it. `padding` is accepted only for bounds fitting. Perspective bounds fitting uses a conservative bounding sphere at the selected FOV.

`targetOffset` uses the selected frame's axes. It moves the target in explicit framing; bounds framing moves eye and target together. Inspect returned camera receipts when composing these controls. The host can impose smaller shot, pixel, or byte budgets than the schema maximum; follow the returned limit instead of retrying the same oversized request.

## Animation and interiors

Animation needs intermediate-pose review and interiors may need cutaway views. Use `kiln_screenshot_animation` for clip sampling (the CLI route is in the camera commands reference); phases are fractions of clip duration, such as `0, 0.017, 0.31, 0.68, 1`, and sample the exported animation without editing posed copies into source. Check `poseBounds` against requested ground clearance and dimensions at those poses, including tread and other protrusions; choose phases inside a geometric repeat, since quarter turns of 16 repeated lugs all show the same alignment. Sampled bounds do not prove continuous contact or collision safety.

## Find part paths

The render response lists the first 24 part paths (every path that fits only with `detail: "full"`) and `partsTruncated` when there are more; then use `kiln_inspect({ programRef, image: false, listParts: { query: "part name" } })`, which searches nested names and paths, and follow `partListing.nextOffset` with the same reference and query. Omit the query to list everything; add `placement: true` for world position, rotation, scale and bounds per part. A missing preview entry does not mean the part failed to export.

## What a saved preview keeps

The saved `preview.png` is the default six-view sheet drawn on the same route as `kiln_render` (`preview.fidelity` says which). Capture shots are not saved with it, so keep the capture JSON that reproduces them; a Live Review `save` keeps its reviewed capture instead.
