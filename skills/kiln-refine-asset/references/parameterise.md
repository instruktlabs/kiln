# Parameterise an existing asset

Use this when a saved asset should gain declared parameters without changing. The work is a
refactor: the new revision's default build must be the same GLB, byte for byte, and the check
for that is a hash, not a judgement. Read the declared-parameters section of the
`kiln-author-asset` program contract for what a declaration may contain.

## 1. Restore and take the baseline

Restore the source with `kiln_assets` `restore`, then build it once without changing it:

```js
kiln_export({ programRef: BASE_REF })   // sha256 is the baseline
```

```sh
node kiln.mjs render base.kiln.js --out base.glb --json   # artifactGlbSha256
```

Compare that hash with `files["asset.glb"].sha256` in the saved manifest. They can differ
before any edit: a newer engine, exporter or host policy builds old source to slightly
different bytes. When they differ, say so, and use the **current build's** hash as the
baseline. Parameterising does not repair or explain that difference, and a parameterised
child does not requalify its parent.

## 2. Choose the parameters

Read the top of the source with `kiln_source`. Named constants are the candidates. Choose the
few a user would change, three to eight for most assets:

- Prefer a constant that other dimensions already derive from.
- Leave out a constant whose change breaks a relationship the source hard-codes elsewhere,
  such as a tile count beside a literal pitch and a list of tile indices. Derive those from
  one value first, as an ordinary edit with its own review, then declare it.
- For a kit module, grid dimensions are shared by every module: declare them with `step` and
  `snap: true`, and change them only together across the kit.
- Set each range to values you expect to build soundly, not the widest imaginable.

## 3. Edit

Add one `defineParams` block above the constants, with every `default` equal to the literal it
replaces, and point the constant at it. Keep the constant's name so the rest of the source is
untouched:

```js
const P = defineParams({
  plenum: { type: 'range', default: 0.6, min: 0.3, max: 0.9, step: 0.1, unit: 'm',
            describe: 'Depth below the walking surface that the pedestals reach.' },
});
const PLENUM = P.plenum;   // was: const PLENUM = 0.6;
```

A colour parameter is a `#rrggbb` string. Replace a numeric colour such as `0x8a5a33` only
where the material helper takes a string, and expect to check the hash. Pass it to the
material unchanged and keep the material's name, so the GLB can carry the colour.

## 4. Prove the default did not change

Build the edited program and compare:

```js
kiln_export({ programRef: NEW_REF })    // sha256 must equal the baseline
```

Equal hashes mean the default build is byte-identical; nothing else needs comparing. When
they differ, the edit changed the asset. Find where with
`kiln_inspect({ programRef: NEW_REF, image: false, compare: { programRef: BASE_REF } })`,
fix the default or the expression, and build again. Do not accept a near match.

## 5. Check the range

```js
kiln_render({ programRef: NEW_REF, params: { sweep: true } })
```

```sh
node kiln.mjs render param.kiln.js --sweep
```

Every point must build, and its size, triangle count and QA acceptance should make sense for
the value. When a point fails or reads wrong, narrow the range or fix the program, then
repeat steps 4 and 5. Look at the extremes that change proportion:

```js
kiln_render({ programRef: NEW_REF, params: { values: { plenum: 0.9 } } })
```

A sweep moves one parameter at a time, does not sweep colours or seeds, and builds no
combinations; `notSwept` names what it left out. For each colour it reports `colors`:
`factor` with the materials that carry it, so it can be set in the GLB without a rebuild, or
`rebuild` with the reason. For each toggle and choice it reports `switches`: `visibility`
with the nodes it shows, or `rebuild`. To make an option `visibility`, always build its part
and set `part.visible` from the parameter. Check a combination you intend to offer as a
preset, and declare it as one. A size is rebuild-only in the saved GLB;
`kiln export --carry-shapes` writes it as morph targets when every value keeps the same parts
and vertex counts and moves them in straight lines.

## 6. Save the child

Save with `kiln_save`, the original `assetId`, and `parentRevision` set to the revision you
restored. The saved GLB is the default build. In the description, state that parameters were
added, the baseline hash and whether it matched the saved GLB, and the swept result. A variant
is never saved: deliver one with `kiln_export` and `params`.

## Limits

- A binary-only asset has no source to parameterise.
- A matching hash proves the default is unchanged. It says nothing about whether other values
  look right; only the sweep and the views do.
- A GLB carries only colours the sweep reports as `factor`. Any other value is another build
  from source.
