# Composition API notes

Use these through the destination project's TypeScript toolchain. `inspectGlbIntegration` and `composeSceneGLB` are exported from `@kiln/engine/render`; overlap helpers are exported from `@kiln/engine/composer`. Generated Kiln source itself still has no imports.

```ts
const composed = await composeSceneGLB([
  { name: 'MarketStall', bytes: stallBytes,
    transform: { pos: [2,0,1], rotDeg: [0,90,0], scale: [1,1,1] } },
  { name: 'Lamp', bytes: lampBytes,
    transform: { pos: [3,0,1], rotDeg: [0,0,0], scale: [1,1,1] } },
], { sceneName: 'Market', optimize: 'off', keepAnimations: false });
```

`pos` uses metres; `rotDeg` is Euler XYZ degrees; `scale` is a three-component scale. The result includes `bytes`, `tris`, `draws`, `materials`, `warnings`, and the final GLB validation report. A corrupt part may be skipped with a warning rather than fail the whole export.

The default optimizer is `palette`; `off` is useful when first checking authored material fidelity. `keepAnimations` defaults to false. Set it true only when the scene should retain asset clips and then verify their playback.

Retained clips preserve their source names by default. If multiple assets use names
such as `Walk`, choose `animationNaming: 'instance'` to get unique names in the form
`0:MarketStall/0:Open` (placement index/name, then clip index/name). Missing names use
`part` or `clip`; indices distinguish repeated placements and duplicate source names.
This changes only names in the composed output, preserves channel targets and timing,
and does not change the individual asset files. Select and test each intended clip.

Call `inspectGlbIntegration(bytes)` for actual bounds and integration metadata. It may return `undefined`; do not invent a manifest for an empty/unusable input.

`findOverlaps(boxes, options)` returns candidate AABB intersections; `isOverlapFree` returns a boolean, and `summarizeOverlaps(violations)` formats findings. Options select `mode: 'footprint'` (default, ignores Y) or `'volume'`, with optional tolerance. Use world-space boxes and stable instance IDs. Footprint checks are insufficient for stacked or overhead objects.

The simpler `worldAabbFromLocal` path assumes uniform scale and Y rotation. For arbitrary rotated/nonuniform placements, compute world bounds from all eight local corners with the full transform rather than forcing that shape into a narrower helper.
