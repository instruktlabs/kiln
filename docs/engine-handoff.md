# Blender and Unity handoff

Kiln exports GLB files. **The established exporter is still the default.** Use the normal
CLI/MCP workflow first; choosing Blender or Unity does not require an exporter switch.
The experimental Three.js exporter is included in builds containing this integration,
but older installed releases do not gain it by setting an environment variable.

For delivery files, see [editable and runtime export profiles](export-profiles.md).
Converter selection applies when generating a GLB; the delivery profile applies to
an already-saved revision. Keep an editable ZIP for authoring and compare runtime
delivery when duplicate review data makes an animated GLB larger. Either converter
works with either delivery profile; neither choice automatically enables compression.

## Choose the import route

| Destination | Start here | Check in the destination |
| --- | --- | --- |
| Blender | Import the GLB through Blender's glTF importer. | Hierarchy, named pivots, materials and intermediate animation poses. |
| Unity | Use the project's glTF importer; glTFast is the tested route. | Importer version, Built-in/URP/HDRP pipeline, shader support, animation and a player build. |
| FBX-only workflow | Keep the original GLB and make a separate Blender-to-FBX derivative. | Child offsets, axes, animation and material loss after conversion. |

For Unity, follow the installed importer's setup instructions rather than assuming that
copying a GLB into Assets is sufficient. Our tested combination is Unity 6000.2.3f1,
Built-in RP and glTFast 6.20.0. Blender checks used 5.2.0 LTS. These are measured profiles,
not requirements to downgrade another working project or claims about every pipeline.

glTFast supports more than base colour, including double-sided surfaces, but individual
material extensions have pipeline-specific limits. Preserve glTF-compatible materials
when importing; replacing them with a different shader can change the result.
See the [glTFast feature matrix](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.20/manual/features.html).

## When to try the experimental exporter

Try a comparison if the default export reports a feature it cannot preserve, or the task
requires candidate capabilities such as vertex colours, extra UV sets, skin/morph data or
additional physical-material extensions. It can also help isolate an exporter defect from
an importer problem. **It is not an automatic fix for all Blender/Unity issues.**

Keep the source and baseline GLB. Write the candidate to a different filename, import both
with the same consumer settings, and report what actually changed. Agents should identify
the candidate as experimental when using it. Do not silently switch a shared host or claim
an untested importer works. If the default already meets the task, there is no need to switch.

## CLI: compare without changing the machine configuration

In an asset workspace, use its existing `kiln.mjs` launcher. These PowerShell commands scope
the selection to the current process and restore its previous value even if export fails:

```powershell
$previousExporter = $env:KILN_GLTF_EXPORTER
try {
    $env:KILN_GLTF_EXPORTER = 'legacy'
    node kiln.mjs render asset.kiln.js --out asset-baseline.glb --views asset-baseline.png --render gpu
    if ($LASTEXITCODE -ne 0) { throw 'Baseline export failed' }

    $env:KILN_GLTF_EXPORTER = 'three'
    node kiln.mjs render asset.kiln.js --out asset-experimental.glb --views asset-experimental.png --render gpu
    if ($LASTEXITCODE -ne 0) { throw 'Experimental export failed' }
} finally {
    if ($null -eq $previousExporter) { Remove-Item Env:KILN_GLTF_EXPORTER -ErrorAction SilentlyContinue }
    else { $env:KILN_GLTF_EXPORTER = $previousExporter }
}
```

`--render gpu` requires a working GPU renderer and fails if unavailable; it does not accept
a CPU fallback as material evidence. See Kiln's
[GPU setup](https://github.com/instruktlabs/kiln/blob/main/docs/rendering.md#running-the-gpu-renderer).
In a repository clone, use `node dist/cli.mjs` instead of `node kiln.mjs`, after
`bun install --frozen-lockfile` and `bun run build:runtime`. For an installed distribution,
use the CLI launcher you already use, from a distribution containing this feature.

In a POSIX shell, selection can be scoped to each invocation:

```sh
KILN_GLTF_EXPORTER=legacy node kiln.mjs render asset.kiln.js --out asset-baseline.glb --views asset-baseline.png --render gpu
KILN_GLTF_EXPORTER=three node kiln.mjs render asset.kiln.js --out asset-experimental.glb --views asset-experimental.png --render gpu
```

## MCP: select at host startup

The exporter is **not a `kiln_render` tool argument**. Set `KILN_GLTF_EXPORTER=three` in the
environment of the existing Kiln MCP server entry, preserving its command, arguments and
other settings. For hosts using an `env` object, add this field to that object:

```json
{ "KILN_GLTF_EXPORTER": "three" }
```

Restart/reconnect that server so it captures the new setting. Continue using the same tools
and saved `programRef` values; build caches distinguish backends. To restore the established
exporter, remove that field or set it to `legacy`, then restart/reconnect again. If an agent
cannot configure the host, it must not claim to have switched it; a separate CLI comparison
is available when the agent has terminal access.

New workspaces receive this guide through the authoring/QA skills. Existing workspace skills
are local copies; updating the engine or running workspace repair does not automatically
replace edited skills. Consult the updated runtime documentation when working in an older workspace.

## Geometry, materials and moving parts

- **Backfaces:** a single-sided sheet disappearing from behind is expected culling. Use a
  double-sided material for an intentionally thin surface when the importer supports it.
  Author actual thickness when the object needs thickness, collision or different surfaces;
  do not automatically extrude every quad to hide an import problem.
- **Pivots:** give moving groups stable, descriptive names such as `Joint_VaneSwivel`, with
  visible geometry beneath them, for example `Mesh_Pennant`. This is an authoring convention,
  not a required engine prefix. Preserve names across revisions and report the actual part paths.
- **Unity root names:** glTFast can replace a static single-root name with the asset filename.
  Check its Scene Object Creation setting; test `Always` if an authored root under a wrapper is
  needed. Resolve parts relative to the imported root instead of assuming one universal path.
- **Animation:** play the imported clip and inspect intermediate poses. A clip existing in the
  file is not proof that its target moves. Check skin/morph deformation where applicable.
- **FBX:** in Blender's FBX export, leave the experimental Apply Transform option
  (`bake_space_transform`) disabled for the tested nested-part route. This is separate from
  Bake Animation. Reimport the FBX and check offsets; materials and sidedness can still change.
  See [Blender's option documentation](https://docs.blender.org/api/main/bpy.ops.export_scene.html).

## Measured LOD import behavior

On 2026-09-30, headless structural checks imported 13 static vegetation and freight GLBs
from a prior 0.9 candidate. Both tested destinations exposed the expected LOD0 triangle counts
in their active scenes.
The results apply to those files and installed importer versions, not every feature in the
current development tree.

| Destination | Measured behavior |
| --- | --- |
| Blender 5.2.0 LTS | LOD0 was visible. Lower tiers remained detached in the excluded Orphan Nodes collection. `MSFT_screencoverage` extras survived as custom properties. |
| Unity 6000.2.3f1, Built-in RP, glTFast 6.20.0 | The default LOD0 scene imported with the expected node and triangle counts. No `LODGroup` was created; lower tiers were not instantiated in the imported scene. |

That first check established structural import, not automatic LOD switching, material
appearance or player traversal. Its fixtures had no source animations, textures, skins or
morph targets. For runtime LOD switching, arrange the tiers through the destination's
supported import or runtime workflow and verify the transitions there; the presence of
`MSFT_lod` alone does not establish that the consumer switches levels.

Kiln's viewer has a global Level selector and per-part overrides for independent LOD chains.
The global selector applies one index to every chain, clamping to each chain's available
levels. Per-part controls let you inspect combinations such as a tractor's LOD1 body with
LOD0 wheels; the global selector then reads Mixed. Live Review's current and pinned assets
have independent controls. A body's LOD1 and a wheel's LOD1 can represent different switching
thresholds, so these controls are manual inspection aids and do not simulate a shared
distance. Verify the combinations needed by the destination, including geometry outside
the selected body subtree.

## Animated assets and visibility: tested destination limits

A later 2026-09-30 check used the revised campus plants, 24 Foundry assets with declared
LOD chains, and an animation/visibility fixture from each Kiln exporter: 39 files in total.
Blender imported all 39. The tested Unity/glTFast profile imported 38 canonical files;
the AMR's animation channel targeting its detached lower-tier deck caused an importer
assertion. Preserve the canonical file. For a destination that needs only LOD0, a separate
derivative can retain the default scene and filter animation channels whose targets are
outside it. That explicit AMR derivative imported with both detailed-level clips working.
Do not remove the coarse animation from the editable master merely to accommodate this
importer. Lower-tier runtime animation needs a destination workflow that imports those nodes.

Both tested importers ignored `KHR_node_visibility`. A fixture containing 46 intended
visible triangles and a hidden 12-triangle cube drew all 58. The Foundry container's hidden
wafer payload also became active. Apply the authored visibility in the destination, or
prepare an explicit delivery derivative that omits hidden subtrees and their unreachable
animation targets. Keep the source and canonical GLB. Selecting the other Kiln exporter did
not change this result.

Intermediate animation samples matter too. Blender reproduced the tested eased translation.
In glTFast 6.20.0, the same standard cubic curve differed between endpoints: at 25% of a
one-second movement from Y=0.5 to Y=1.5, the intended value was 0.65625, but the imported
clip sampled 0.605893. Both Kiln exporters produced this result. A separate Unity clip copy
with the cubic keys' `weightedMode` set to `WeightedMode.None` matched all five tested times
while retaining the imported tangents. Apply this only to curves known to originate as
glTF cubic Hermite curves; it is not a general instruction to alter authored Unity curves.

For Blender animation inspection, choose each imported action separately and use its actual
frame range. Its NLA strips can start at frame 1. Enable the glTF add-on's Animation UI
before importing to retain the glTF rest pose. Muting an action alone can leave
animated-property defaults rather than that rest pose.
Check the rest pose as well as intermediate clip positions before judging hierarchy or fit.

These results qualify the named importer profiles and fixtures. They do not establish
texture, skin, morph, other render-pipeline or arbitrary cubic-curve compatibility.

A Windows standalone player built with the same Unity profile rendered all 39 test cases
on Direct3D 11 with an RTX 3070, with supported shaders and no missing-material pink.
It exercised 49 clips and verified movement of their authored targets. This player used
the explicit LOD0 AMR derivative and the two visibility-fixture derivatives; the canonical
Foundry container still exposed the visibility limitation described above. A separate
all-tier conifer derivative wired into a Unity `LODGroup` rendered 1,376, 184 and 48
triangles when each level was forced. This demonstrates an explicit destination setup,
not automatic importer-created LODs or qualified distance thresholds. Material appearance
and silhouette remain part of owner review.

## Known experimental limits

- Rotated nonuniform Three.js UV scaling and manually sheared/perspective UV matrices are
  rejected when they cannot be represented losslessly in glTF texture TRS. Do not remove
  the transform or silently change the asset just to make export succeed.
- Textured headless candidate exports need the optional native canvas dependency. If it is
  unavailable, fix the installation or report the limitation; textures are not silently dropped.
- Lines/points are outside the candidate's qualified triangle/sprite pipeline.
- Preserved emissive/unlit properties may look different from older exports that dropped them.
- Emissive exports as colour times intensity. Within 0..1 that is `emissiveFactor`; brighter
  emission adds `KHR_materials_emissive_strength`, which an importer without that extension
  shows at the normalised colour.
- Declared LOD sets export as `MSFT_lod` chains: LOD0 stays in the scene carrying
  `extensions.MSFT_lod.ids` and `extras.MSFT_screencoverage`, and the lower levels are
  off-scene nodes whose transforms are relative to LOD0's parent. An importer without the
  extension shows LOD0 only, as three.js `GLTFLoader` 0.186 does. The measured Blender and
  glTFast behavior is recorded above; automatic threshold switching still needs destination
  qualification. An imported GLB's chains survive save, optimisation and export too. GPU
  instancing skips a file with chains, and full optimisation falls back to palette.
- More extensions in a valid GLB do not guarantee support in every importer or shader. GPU
  appearance, runtime-loaded shader inclusion, compression codecs and other render pipelines
  need their own checks. This option does not change KTX2 defaults or fix unsupported Node versions.

## Delivery checklist for users and agents

Record the source revision, chosen exporter, delivered GLB, consumer/importer versions and
render pipeline. Check scale and orientation alongside a known object; hierarchy and pivots;
front/back visibility; materials/textures; and animation/deformation. For Unity delivery,
exercise a player build as well as the editor. Say which checks were not run. Keep the baseline
and source so a consumer-specific problem can be reproduced without regenerating the asset.
