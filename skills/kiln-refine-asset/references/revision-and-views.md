# Saved revisions and focused views

Replace `REF` and `PART_PATH` with values returned by Kiln, copied exactly, including encoded characters such as `%20`. A source part name may differ from its exported node name: use the returned path for `shot.subject` and measurement subjects. `REF` may be a short `p_` handle or a canonical SHA-256 reference; do not derive it from a displayed hash. Each handle maps permanently to one revision in its store. Edits return a new reference rather than moving a global current asset.

```js
kiln_source({ programRef: REF, query: 'POST_WIDTH', limit: 3000 });
kiln_edit({ programRef: REF,
  edits: [{ oldString: 'const POST_WIDTH = 0.13;', newString: 'const POST_WIDTH = 0.18;' }],
  capture: { preset: '2x1', cells: [
    { azimuthDeg: 0, elevationDeg: 0, name: 'Front' },
    { azimuthDeg: 90, elevationDeg: 0, name: 'Right' },
  ] },
});
```

`kiln_source` defaults to 8,000 characters and allows up to 16,000 per page. Follow `nextOffset` for more text; search again from `matchOffset + 1` for a later occurrence. `found: false` is a search result, not missing source. The returned `code` has no line prefixes.

Edits are ordered and atomic, up to 20 replacements per call. Empty/no-op replacements are rejected. `ok: true` means the edits applied; inspect `render.ok` for build/render success. `parentRef` records the base. Reference-based edit replies omit full code unless `includeCode: true`; legacy inline-code replies retain their old default.

## Compare exported revisions

```js
kiln_inspect({ programRef: NEW_REF, compare: { programRef: OLD_REF, limit: 50 } });
```

Rendered `kiln_edit` replies include `preservation` with the same comparison
against the exact reviewed GLB. Source-only edits or an invalid baseline report
`not_assessed`; they do not prove preservation.

Read `comparison.before.bounds`, `after.bounds`, `summary`, and every page of
`changes`. A change can affect geometry (including UVs and vertex colors),
material resources (including texture bytes), local/world transforms, or subtree
world bounds. Entries match exact named hierarchy paths; renamed or reparented
nodes appear as removed and added. The summary includes unchanged nodes, while
the paged list includes changes only. Copy `nextOffset` into `compare.offset` to
continue; null means there are no more entries.

To check components an edit must preserve without paging through unrelated
changes, add `compare.paths: [PROTECTED_ROOT_PATH]` (up to 12 distinct paths).
`comparison.subtrees` always summarizes every node in each selected subtree,
including added/removed descendants and inherited world-transform changes.
`status: unchanged` covers the comparison's static-data scope only. It does not
cover animation or metadata. Copy exported node paths from render/inspection,
including their scene prefix; synthetic `:primitive-N` children and the scene
wrapper itself are not exported nodes. Missing baseline paths fail explicitly.
Overlapping selections are independent, so do not sum their node counts.
Scene-title changes do not rename the node hierarchy: `beforePath` and
`afterPath` give the exact paths for each revision, including its scene prefix.
Actual node renames or reparenting remain additions/removals.

Both programs rebuild using current host settings; this does not retrieve an old
build made under different settings. The receipt identifies both resulting GLBs.
Static node comparison and animation-channel comparison are separate.
`comparison.animation` reports added, removed and changed channels by clip,
target path and property, with its own summary, changes and `nextOffset`. Exact
keyframe and interpolation data are compared; equivalent motion encoded with
different keys still counts as changed. Neither comparison proves visual
equivalence, continuous clearance or physical fit. Ambiguous/unnamed siblings, skins, morph targets,
instancing and unsupported structural extensions fail explicitly. The bounded
comparison supports 64 MiB per GLB, 10,000 nodes, 128 hierarchy levels and two
million placed vertex visits. No result silently omits unsupported geometry.

Read the image and its fidelity separately from the structural comparison.

## An exact local close-up

```js
kiln_inspect({ programRef: REF, shot: {
  name: 'Hinge seam', subject: { path: PART_PATH }, visibility: 'context',
  camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 100, elevationDeg: 15, padding: 1.3 },
} });
```

Use either `shot` or the legacy `part`/`view`/orbit fields. Exact names can be ambiguous; returned paths identify a particular node. `visibility: 'isolate'` removes neighboring geometry for this view without changing the asset.

For multiple subjects in one call, use `kiln_render` or edit `capture`:

```js
{ version: 'kiln.capture.v1', cols: 2, size: 512, output: 'separate', shots: [
  { name: 'Context', subject: { path: PART_PATH }, camera: { type: 'orbit', relativeTo: 'asset', azimuthDeg: 45 } },
  { name: 'Behind', subject: { path: PART_PATH }, visibility: 'isolate',
    camera: { type: 'orbit', relativeTo: 'part', azimuthDeg: 180, elevationDeg: 0 } },
] }
```

Versioned capture has 1–9 shots, columns 1–3, and a square per-shot `size` from 128–2048; output is `grid` or `separate`. It has no request fields named `width` or `height`; those are returned image dimensions. Legacy presets use `COLSxROWS`, and each optional cell has `azimuthDeg`, `elevationDeg`, `zoom`, and `name`. Do not combine the two capture shapes. Orbit shots derive target and distance from the selected subject bounds: use `subject` and `padding`, not `target` or `distance`.

Explicit cameras use `{ type: 'explicit', projection: 'perspective', position, target, up?, fovDeg? }` or `projection: 'orthographic'` with optional `halfHeight`. Their vectors are world-space. Orbit `relativeTo` supports world/asset/part frames. Use returned camera records to verify how a request resolved.

## Motion and interiors

```js
kiln_screenshot_animation({ programRef: REF, clip: 'Open',
  frameTimes: [0, 0.35, 0.7, 1], framing: 'locked',
  shot: { subject: { path: PART_PATH }, camera: { type: 'orbit', relativeTo: 'asset', azimuthDeg: 90 } },
});
```

`frameTimes` contains phase fractions 0..1 in the order you want (1–9 entries). Alternatively use `frames` (2–6); the two are mutually exclusive. `framing: 'locked'` supports comparisons across motion; `follow` reframes the changing subject. `perFrame: true` returns separate frames. `poseBounds` gives world-space `scene` and optional selected `subject` min/max bounds at each `phase` and `timeSeconds`, before camera isolation. Compare these with the requested ground plane and travel envelope.

`loopClosure` compares local position, rotation and scale at both clip endpoints.
An open endpoint may be valid for a one-shot action. For a requested loop, review
the reported gaps; closed endpoints alone do not prove smooth velocity or freedom
from collisions. An incomplete result lists unassessed tracks. `loopIntent` is the
intent declared with `createClip(..., { loop: true | false })`; a declared loop
that stays open adds a `LOOP_NOT_CLOSED` warning.

Choose phases for the geometry and clip, not only a regular grid. For a full turn
with 16 repeated lugs, quarter/eighth turns all repeat the same tread alignment.
Include a sample inside one repeat, such as phase 0.017, plus phases near extrema
and between keys; inspect the selected moving part as well as the whole scene.
Irregular phases reduce this blind spot but do not guarantee finding every
extremum. Identical bounds at sampled poses do not establish constant bounds
throughout motion. Report the sampled range and ground penetration/clearance,
not "continuous ground contact." A rest-pose contact marker is not a rolling
contact measurement.

Identify relative motion before attributing a clash to an animation. Two rigid
parts with fixed transforms under the same moving frame keep their surface
distance during that shared rotation or translation. Their world-axis bounding
boxes can change overlap without a new collision. Check independent child joints,
deformation and external neighbors separately; a spinning child can change
clearance even when the parent assembly's motion cannot. Use the hierarchy and
actual geometry to distinguish these cases before reshaping protected parts.

`kiln_view_interior` accepts optional versioned `capture` for roof-off shots. Normally roof semantics/name are resolved automatically; `nodeName` selects a roof explicitly. Review `roofsHidden` and warnings rather than assuming every obstructing surface disappeared.

Read fidelity and fallback receipts before drawing conclusions. Geometry-flat images do not verify texture/roughness/metalness, and bounds/anchor measurements do not establish visual quality.

## Named anchors and measurements

Use ordinary named child groups or pivots for attachment points. Select their exact returned paths; no extra anchor language is needed. `createPivot` adds a `Joint_` prefix.

```json
{
  "programRef": "RETURNED_REFERENCE",
  "measure": {
    "from": {"subject": {"path": "RETURNED_ANCHOR_PATH"}},
    "to": {"subject": {"path": "RETURNED_PART_PATH"}, "point": [0, 0.2, 0]}
  }
}
```

This is a `kiln_inspect` request. Each point is local to its selected node; omitting it selects that node's origin. The returned measurement contains both world points and their straight-line distance in asset units. It is not a surface-distance or clearance test.

For a suspected gap between meshes, use `measure.mode: "surface"`, select the two
disjoint parts by exact path, and omit `point`:

```js
kiln_inspect({ programRef: REF, shot: { subject: { path: PART_PATH } },
  measure: { mode: 'surface',
    from: { subject: { path: PART_PATH } },
    to: { subject: { path: OTHER_PART_PATH } },
  },
});
```

This measures the nearest exported triangle surfaces in the rest pose and returns
world-space closest points. Select the intended interface parts: a larger assembly
may touch somewhere else while the seam you care about stays open. A completed
positive distance proves those selected surfaces are separated. Zero can mean
touching or crossing; nested solids can have a positive surface distance despite
overlapping volume. It does not measure penetration depth or certify usable access,
physical attachment or animated clearance. Alpha and displacement appearance are
not included. Read `measurement.status`: an incomplete result has `distance: null`
and lower/upper bounds; select smaller parts rather than quoting its upper bound
as an exact minimum. Each subject allows 20,000 triangles including instances;
comparison stops at 250,000 hierarchy/triangle-pair work units.

Batch several interfaces with the same measurement semantics:

```js
kiln_inspect({ programRef: REF, image: false,
  surfacePairs: [[BRACE_PATH, POST_A_PATH], [BRACE_PATH, POST_B_PATH]],
});
```

Use up to 12 pairs of exact paths. Read every `surfaceMeasurements.results`
entry: it contains either `measurement` or an explicit `error`. Overall status
is `partial` if any pair failed or remained incomplete; successful pairs are
still returned. Each pair retains the single-measurement work limit. This batch
reduces tool calls, not the evidence needed to judge contact or fit. With default
`image: true`, the batch shares one inspection image. `image: false` requires
`measure`, `surfacePairs` or `compare`, rejects camera controls and invokes no
image renderer.

For a flush modular interface, inspect the actual exported end boundary and face
orientation as well as contact. Matching centerline endpoints is insufficient:
rotating a thick segment changes its end extents, and adding overlap can hide a
gap while leaving a step. Derive shared boundary vertices, retain a compatible
end section, or use an intentional connector where the brief allows it. Report
unmeasured seam alignment separately from a completed contact measurement.

Exact-shot inspection also returns `subjectFrame`: local/world bounds, a column-major world matrix, origin, and world-space axes. Use these receipts to place explicit world-space cameras or check an attachment. Camera suggestions are an authoring decision; there is no `suggestViews` request field.

After replacing an assembly, inspect its internal connections as well as its
mount to the retained asset. A coherent parent group does not connect a handle
to its shaft or a rod to its joint. Measure the actual mating surfaces and view
them closely; preserve intentional clearances without describing visible gaps
as joined geometry. Material adjectives such as weathered also need visible
evidence, rather than only a roughness value or an accepted QA result.
