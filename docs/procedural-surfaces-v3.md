# Procedural RGBA surfaces V3

`proceduralTexture({ schemaVersion: 3, ... })` creates rectangular RGBA pixels
through the same authored-source helper as V1/V2. The standalone compiler is
`compileProceduralTextureSpecV3` from the primitives SDK. Its contract helpers
are `canonicalizeProceduralTextureSpecV3`, `canonicalProceduralTextureJsonV3`
and `hashProceduralTextureSpecV3`.

V1 (absent or `1` version) and V2 remain on their existing compiler, square
power-of-two dimensions, opaque output, canonical JSON and hashes. An explicitly
undefined version retains historical V1 behavior; V3 itself accepts strict JSON,
so undefined fields are invalid. Unknown versions fail before dispatch. Existing
portable material V2 references remain V2. New portable V3 material references
and V2 saved material records are opt-in contracts described below.

## Contract

```ts
{
  schemaVersion: 3,
  width: 4..1024, height: 4..1024, // integers, need not be powers of two
  usage?: 'albedo' | 'emissive' | 'normal' | 'roughness' | 'metalness'
    | 'metallicRoughness' | 'occlusion', // default albedo
  name?: string,                 // 1..80 visible characters
  background?: [r,g,b,a],         // bytes 0..255, default [0,0,0,0]
  operations: OperationV3[],      // ordered, zero to 64 entries
  palette?: { colors: RGB[], dither?: 'none' | 'bayer4' }
}
```

RGBA channels are straight bytes. RGB is authored encoded color for albedo and
emissive; other usages retain linear data. Transparent RGBA input canonicalizes
to `[0,0,0,0]`, and every output pixel with zero alpha has zero RGB. Palette
mapping supports only albedo/emissive and rejects all data usages. Stamps write
bytes like `paint`, so every usage accepts them.
Shapes and masks operate on declared bytes without interpreting data channels.

Operations have these exact fields:

| `op` | Fields |
| --- | --- |
| `paint` | `shape`, `rgba`, optional byte `opacity` (default 255) |
| `mask` | `shape`, optional byte `alpha` (default 255), optional boolean `invert` (default false) |
| `stamps` | `shape`, `rgba`, `count`, uint32 `seed`, `area`, optional byte `opacity`, optional boolean `periodic` (default false) |
| `legacy-v2` | `spec` with explicit schemaVersion 2, optional byte `alpha` and byte `opacity` (both default 255) |

V3 opacity is a byte, unlike V2's fractional opacity. The legacy layer delegates
to the existing V2 compiler, including its six operators and first-layer rules.
Its square size and usage must match the V3 surface; its output RGB is composited
using the explicitly selected V3 alpha and opacity. It does not reinterpret V2
blend modes or silently migrate a V2 recipe into V3 operations.

## Coverage and compositing

Coordinates describe integer pixel edges; a pixel `(x,y)` samples `(x+0.5,y+0.5)`.
Shapes clip to the output extent. There is no antialiasing or fractional shape
coverage in this compiler version.

| Shape `kind` | Fields and coverage |
| --- | --- |
| `rectangle` | `x,y,width,height`; left/top inclusive, right/bottom exclusive |
| `ellipse` | `x,y,width,height`; inscribed ellipse, boundary inclusive |
| `polygon` | `points:[[x,y],...]`; even-odd fill, boundary inclusive, 3..64 vertices; self-intersections use that same fill rule |
| `line` | `from:[x,y],to:[x,y],width`; capsule with inclusive round caps; coincident endpoints create a disk |

Coordinates are integers -4096..4096. Shape widths/heights and line width are
integers 1..2048. A one-pixel line on an integer edge can cover centers on both
sides of the edge; width measures continuous distance, not a promised count of
covered columns. Polygon degeneracies are deterministic rather than repaired.

`paint` uses source-over. Define `round(n/d) = floor(n/d + 0.5)`. For source alpha
`a`, operation opacity `o` and destination alpha `d`:

```text
s = round(a * o / 255)
N = s * 255 + d * (255 - s)
output alpha = round(N / 255)
output channel = round((source channel * s * 255
                        + destination channel * d * (255 - s)) / N)
```

When `s=0`, painting is inert. RGB division uses the unrounded alpha numerator,
then alpha and RGB are stored as bytes after each operation. This blends authored
byte values; it does not linearize encoded colors or introduce floating opacity.

`mask` multiplies destination alpha by the mask byte and rounds half-up. Outside
the covered shape it clears alpha. With `invert:true`, outside retains the mask
alpha factor and inside clears alpha. It preserves destination RGB while alpha
remains positive and clears RGB when alpha becomes zero. A mask affects only
pixels already painted; subsequent paint can add pixels again.

## Palettes and periodic stamps

Palette mapping runs once after all operations. `colors` is an ordered array of
1..32 RGB integers 0..0xffffff. The nearest color minimizes squared distance in
encoded RGB bytes; a tie selects the first array entry. Alpha is preserved and
transparent pixels stay black. `dither:'none'` is the default.

`bayer4` repeats this fixed matrix from image origin `(0,0)`:

```text
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

Before nearest-color selection, each RGB channel receives integer offset
`(2 * matrixEntry - 15) * 2`, clipped to 0..255. Palette membership is therefore
exact, and dither does not add alpha variation or random noise.

Stamp `area` is `{x,y,width,height}`, with the same rectangle coordinate bounds.
Each stamp translates its local shape by two integer offsets within that area.
The PRNG starts from `(seed ^ 0xa3c59ac3) >>> 0`, substitutes fixed state
`0x6d2b79f5` if that value is zero, performs Xorshift32 with shifts 13,17,5,
and consumes X then Y in operation order. Offsets use unsigned state
modulo area width/height. Counts are 1..256. Seeds use the full unsigned 32-bit
range, including zero. No clock or random global is involved.

`periodic:true` explicitly wraps the translated shape's bounding origin into one
surface period, then clips copies translated by -period, 0 and +period on each
axis. Its shape bounds must fit one period on each axis. Each periodic stamp
counts as nine expanded copies, with at most 256 expanded copies across the
recipe. Ordinary stamps clip at edges. Periodic placement does not establish
that other operations tile; inspect repeat neighbors and the resulting patch.

## Admission and identity

Validation inspects every object and array data descriptor before field reads.
Custom prototypes, accessors, symbols, holes, non-index array fields, forbidden
prototype keys, functions, undefined, nonfinite numbers and unknown schema
fields are rejected. Admission precedes the output pixel allocation.

The limits are 1,048,576 output texels, 64 operations, 64 polygon vertices,
256 expanded stamps and 32 palette colors. JSON preflight admits at most
16,384 nodes and depth 10, at most 1024 fields per container, and at most
262,144 characters of canonical JSON. The only arbitrary text is an 80-character
name, so this also bounds UTF-8 recipe storage with a small fixed overhead.
To scatter many copies of a shape, such as grass blades or pebbles, use one
`stamps` operation, which places up to 256 copies, rather than one operation per
copy; the 64-operation cap counts operations, not copies.

The conservative work ceiling is 64,000,000 units. It includes output
initialization, clipped shape tests (each polygon edge counts), full mask scans,
per-copy stamp bounds, palette comparisons and legacy pattern/noise work. V3
transient pixel buffers stay below 64MiB. The compiler creates one RGBA output;
legacy layers temporarily create matching RGBA outputs and palette metadata is
bounded. These limits do not raise legacy or portable-material budgets.

The compiler ID is `kiln.procedural-rgba.v3.1`. V3 recipe hashes are SHA-256 of
`compilerId + '\n' + canonicalJson`; property order and omitted defaults produce
the same canonical result. A changed pixel algorithm requires a new compiler ID.
V3 metadata records that ID, canonical JSON and recipe hash. V2's hashes and
material-record compiler ID `kiln.procedural-texture.v2` remain unchanged.

Failures use closed evaluator diagnostic `PROCEDURAL_TEXTURE_V3_CONTRACT`;
direct SDK calls also include the rejected field in the exception text.

## Authored-source example

```js
function build() {
  const root = createRoot('CutoutStudy');
  const texture = proceduralTexture({
    schemaVersion: 3, width: 16, height: 32, name: 'LeafStudy',
    operations: [
      { op: 'paint', shape: { kind: 'ellipse', x: 3, y: 2, width: 10, height: 28 },
        rgba: [66, 100, 42, 255] },
      { op: 'paint', shape: { kind: 'line', from: [8, 4], to: [8, 29], width: 1 },
        rgba: [118, 132, 60, 255] }
    ],
    palette: { colors: [0x42642a, 0x76843c] }
  });
  const material = pbrMaterial({ albedo: texture, alphaMode: 'mask',
    alphaCutoff: 0.5, doubleSided: true, roughness: 1 });
  createPart('Card', planeGeo(0.5, 1), material, { parent: root });
  return root;
}
```

Textures keep existing repeat/linear/mipmap defaults. Sampling choices remain
explicit Three.js texture settings; creating V3 does not select a pixel-art
policy. The material's alpha mode and sidedness are separate from pixel alpha.

## Standalone saved materials and atlases

No mesh or project is required to create or save a procedural texture. The
existing `kiln_material` action `create-procedural`, named operation
`kiln_material_create`, and `kiln material procedural --file draft.json` share
one JSON authoring boundary. An unversioned layered material draft retains its
V1 record format and existing defaults. An opt-in material draft with
`schemaVersion:2` accepts V2 layer recipes, V3 RGBA recipes, or named atlases and
saves a V2 material record. This material-record version is distinct from a
texture recipe's `schemaVersion`.

Each new map supplies exactly one `procedural` or `atlas` recipe, its map slot,
source provenance, transforms, and an explicit sampler:

```json
{
  "minFilter": "nearest",
  "magFilter": "nearest",
  "wrapS": "clamp-to-edge",
  "wrapT": "clamp-to-edge"
}
```

This example is a choice for a pixel texture, not a global engine default.
Minification also supports `linear`, `nearest-mipmap-nearest`,
`nearest-mipmap-linear`, `linear-mipmap-nearest`, and `linear-mipmap-linear`.
Wrapping supports `repeat`, `mirrored-repeat`, and `clamp-to-edge`.
Evaluate minification in the consuming scene; nearest magnification alone does
not establish acceptable motion, distant cutouts, or atlas gutter behavior.

Read `shape:material-draft` and `shape:material-import` with Discovery for the
complete runtime-validated fields. Sources keep explicit creator and license
records. The JSON authoring surface accepts no file paths, URLs to fetch, or
raw image bytes. Existing external image records enter through verified import.

A normal-slot map with a V3 recipe of `usage: 'normal'` may add
`derive: {"kind":"normal-from-height","strength":4}`. The compiled pixels are
read as height (Rec. 601 luma of RGB; alpha ignored) and converted by the same
wrapped derivation as V2 recipes, so paint pits dark and ridges light. The
recipe hash still identifies the V3 spec; the pixel hash identifies the derived
normal pixels, and the saved recipe records `derive`. Derivation counts toward
the V3 work and allocation budgets. A height recipe can reuse the albedo's
`stamps` operation with the same seed and area, so embossed pits line up with
painted ones; palettes stay colour-only. Authored-source
`compilePortableMaterialSpecV3` references do not accept `derive`; save the
material and bind the record instead.

`textureAtlas(spec)` compiles named, fixed pixel rectangles. The atlas has
`schemaVersion:1`, width, height, usage, an optional sampler, and regions.
Coordinates are integer pixels from the top-left. Each region has a stable
lowercase `name`, a `content` rectangle, a `source`, and optional crop, gutter,
and edge mode. Default gutters are two pixels; padded allocations must fit
without overlap. Sources must already match the requested crop size: this
operation does not resize, rotate, or resample images. It packs only on request
(below).

### Pack regions automatically

Set `pack: { edge: 1024 | 2048, gutter?, algorithm?: 'maxrects' }` and omit `content`
on any region to have Kiln place it:

```js
const atlas = await textureAtlas({
  schemaVersion: 1,
  usage: 'albedo',
  pack: { edge: 1024, gutter: 4 },
  regions: [
    { name: 'plate', source: { kind: 'procedural', spec: plateRecipe } },
    { name: 'grime', source: { kind: 'procedural', spec: grimeRecipe } },
    { name: 'decal', content: { x: 4, y: 4, width: 64, height: 64 }, source: decalSource },
  ],
});
```

A packed atlas compiles as `kiln.texture-atlas.v1.2` with raised limits: edge up to
2048, 4,194,304 output texels, 32 distinct sources and 128 regions. Width and height
default to `pack.edge`; `pack.gutter` (default 2) is the default gutter of every region.
Placement is MaxRects best short side fit without rotation, in a fixed order
(allocation area descending, then name), around any explicit rectangles, so the same
spec always packs the same way. A packed region takes its source size: the procedural
recipe's size, its `crop`, or for a pinned resource `expected.width` and
`expected.height` (a resource without one of these is refused before any load).

The compiled spec keeps `pack` and records each placed region's resolved `content`
with `packed: true`; the manifest regions carry the same rectangles. A saved recipe
or provenance record therefore re-validates exactly without re-packing. Use
`remapUVToAtlas` with the region name as usual. Atlases without `pack` keep compiler
`kiln.texture-atlas.v1.1`, its limits and their existing identities.

A source is either `{kind:'procedural',spec:<V3 recipe>}` or
`{kind:'resource',resourceId:<exact map id>,pin:{resourceId:<material id>,
revisionId:<revision hash>,sha256:<same revision hash>}}`. Resource IDs identify
the saved map, while the pin identifies its immutable material revision.
Resolution uses only the explicitly injected material library or evaluator
dependencies, never nearby projects or network requests. The shared dependency
walker admits the entire metadata graph before loading source PNGs.

`copy-edge` copies edge RGBA into the gutter. `mask-rgb-dilate` keeps gutter alpha
zero and fills RGB from the nearest positive-alpha source texel, with a stable
tie break. This reduces dark cutout fringes but does not guarantee safe mipmaps
for every region size or viewing distance.

Use `remapUVToAtlas(geometry, atlas, regionName, {inputOrigin,mode})` to map unit
UVs into a named region on an owned geometry clone. `inputOrigin` is explicit
`top-left` or `bottom-left`; `mode` is `content-boundary` or `texel-center`. Rich attributes,
morphs and skin data are retained according to the UV helper's contract. A
region binding describes that geometry's region; it does not infer independent
region assignments for material groups.

The optional `axes` selects which components the region owns. The default `uv`
replaces both, which destroys any per-vertex gradient UV0 carries in V — a
foliage wind sway weight read as `uv-y` is the known case, and the asset still
validates and renders. `u-only` rescales U into the named region and passes V
through bit-for-bit; it requires `inputOrigin: 'top-left'` over a region
spanning the full atlas height, so lay such a sheet out as full-height columns
with explicit `content` rectangles and `gutter: 0`, and author each column so
V=0 is its top row. A packed or vertically inset region is rejected rather than
remapped. The binding records `axes` only for `u-only`, so existing bindings and
exported extras are unchanged.

Saved atlas maps retain the canonical recipe, named-region/source manifest,
compiler identity, encoded-image hash, decoded pixel hash and exact source
revision pins. `kiln material export` includes the complete verified material
closure; importing it into an offline workspace restores those revisions.
Old-only payloads retain schemaVersion 1. Mixed or new records use schemaVersion
2 without rewriting old identities. Projects remain optional and pin exact
saved revisions when explicitly selected.

## Atlas delivery and inspection

Both GLB converters retain a bounded `kilnAtlasProvenance` table in scene extras,
an exact `kilnAtlasReference` on each material texture use, and a compact
`kilnAtlasBinding` on primitives created from a named remap. These optional extras
describe Kiln lineage; ordinary glTF textures, UVs and samplers still render in
consumers that ignore them. Manual full-sheet use needs no named binding.
The [delivery metadata contract](atlas-provenance.md) specifies the fields,
validation and bounds.

The source manifest identifies compiled RGBA pixels and recipe inputs. The
delivery reference separately identifies final encoded image bytes and the
effective sampler for that use. Conversion may legitimately alter pixels, such
as an explicit normal-channel conversion, so these identities are distinct.
Import validates the recorded delivery identity; it never silently replaces a
stale hash. Editing compiled atlas pixels requires recompilation or removal of
the atlas metadata to make an ordinary manually authored texture.

Structural QA checks declared regions, referenced UVs, slots and sampling without
decoding images. Quantized UV storage has a bounded precision allowance. Work
limits or unavailable dimensions produce partial coverage; a valid UV domain
does not prove the intended orientation or visual quality. Inspect exact saved
maps in Materials, or follow the material links from Library and Live Review.
Use a material-faithful rendered view and the destination scene for cutout,
lighting and motion decisions.
