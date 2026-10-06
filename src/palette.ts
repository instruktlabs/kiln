/**
 * Kiln canonical material palette — the single source of truth for the
 * "Optimized palette" authoring directive (Move 2) and a future shared palette
 * texture (Phase C, cross-asset batching).
 *
 * PURE DATA + a text helper. NO `three`, NO node, NO gltf-transform imports — so
 * it is browser-safe and can be consumed anywhere (the leaf subpath
 * `@instruktlabs/kiln/palette`) without dragging runtime code into a bundle.
 *
 * Why it lives in the engine: the palette is the shared contract both the
 * authoring prompt (instruct the model to build against these roles) and a later
 * bake-time shared-palette texture (Phase C) target. The slot SET + ORDER are
 * stable so the future texture is deterministic; the implementer may tune
 * individual color / metalness / roughness values without breaking that contract.
 *
 * The rendered directive string was mirrored verbatim in the Kiln Studio product's `shared/`
 * module as `OPTIMIZED_PALETTE_DIRECTIVE` (so that import-free, browser-critical
 * module stays dependency-free); a parity test in kiln-studio asserts the two
 * never drift.
 */

import type { SnapPaletteSlot } from './palette-snap';

/** One material role in the canonical palette. A PBR spec the directive names and
 *  a future shared palette texture bakes from. */
export interface PaletteSlot {
  /** Stable index (the slot's position in a future palette texture). */
  index: number;
  /** Role name the directive surfaces and the model authors against. */
  name: string;
  /** Base color, hex string. */
  color: string;
  /** PBR metalness 0..1. */
  metalness: number;
  /** PBR roughness 0..1. */
  roughness: number;
  /** The ONE transparent slot (glass). At most one slot sets this. */
  transparent?: boolean;
  /** Approx opacity for the transparent slot. */
  opacity?: number;
  /** The ONE emissive slot (glow). At most one slot sets this. */
  emissive?: boolean;
  /** Short "use for" hint surfaced in the directive. */
  use: string;
}

/**
 * The canonical 22-slot palette covering war / city / fantasy / sci-fi / organic /
 * character domains. Stable order; values are tunable. `glass` is the only
 * transparent slot and `glow` the only emissive — keeping the alpha-mode story
 * simple (opaque everything + the one glass slot).
 */
export const OPTIMIZED_PALETTE: readonly PaletteSlot[] = [
  {
    index: 0,
    name: 'steel',
    color: '#8a8f99',
    metalness: 0.9,
    roughness: 0.5,
    use: 'bare metal, blades, machinery, hulls',
  },
  {
    index: 1,
    name: 'gunmetal',
    color: '#3a3f47',
    metalness: 0.9,
    roughness: 0.45,
    use: 'dark metal, weapons, iron fittings',
  },
  {
    index: 2,
    name: 'brass',
    color: '#c8a64b',
    metalness: 0.95,
    roughness: 0.4,
    use: 'gold/brass trim, horns, ornament',
  },
  {
    index: 3,
    name: 'copper',
    color: '#b06a3a',
    metalness: 0.9,
    roughness: 0.45,
    use: 'copper/bronze, worn metal',
  },
  {
    index: 4,
    name: 'wood',
    color: '#9a6a3c',
    metalness: 0.0,
    roughness: 0.8,
    use: 'planks, handles, crates, trunks',
  },
  {
    index: 5,
    name: 'dark-wood',
    color: '#5a3a22',
    metalness: 0.0,
    roughness: 0.8,
    use: 'aged timber, bark, framing',
  },
  {
    index: 6,
    name: 'stone',
    color: '#8d8a82',
    metalness: 0.0,
    roughness: 0.95,
    use: 'rock, masonry, boulders',
  },
  {
    index: 7,
    name: 'concrete',
    color: '#b8b4ad',
    metalness: 0.0,
    roughness: 0.95,
    use: 'concrete, plaster, pale walls',
  },
  {
    index: 8,
    name: 'brick',
    color: '#9e4b34',
    metalness: 0.0,
    roughness: 0.9,
    use: 'brick, terracotta, clay',
  },
  {
    index: 9,
    name: 'sand',
    color: '#cdb27a',
    metalness: 0.0,
    roughness: 1.0,
    use: 'sand, adobe, tan earth',
  },
  {
    index: 10,
    name: 'dirt',
    color: '#5b4632',
    metalness: 0.0,
    roughness: 1.0,
    use: 'soil, mud, dark ground',
  },
  {
    index: 11,
    name: 'foliage',
    color: '#4f8f3f',
    metalness: 0.0,
    roughness: 0.9,
    use: 'leaves, grass, plants',
  },
  {
    index: 12,
    name: 'glass',
    color: '#aacbe0',
    metalness: 0.0,
    roughness: 0.1,
    transparent: true,
    opacity: 0.35,
    use: 'windows, lenses — the ONE transparent slot',
  },
  {
    index: 13,
    name: 'white',
    color: '#e8e8e6',
    metalness: 0.0,
    roughness: 0.7,
    use: 'white paint, cloth, paper',
  },
  {
    index: 14,
    name: 'black',
    color: '#1a1c1f',
    metalness: 0.0,
    roughness: 0.6,
    use: 'black, rubber, charred, tires',
  },
  {
    index: 15,
    name: 'accent-warm',
    color: '#c0392b',
    metalness: 0.0,
    roughness: 0.7,
    use: 'red/orange paint, flags, signs',
  },
  {
    index: 16,
    name: 'accent-cool',
    color: '#2f6fd0',
    metalness: 0.0,
    roughness: 0.7,
    use: 'blue/teal paint, water, signs',
  },
  {
    index: 17,
    name: 'skin',
    color: '#c8946a',
    metalness: 0.0,
    roughness: 0.75,
    use: 'character skin / flesh',
  },
  {
    index: 18,
    name: 'glow',
    color: '#ffd9a0',
    metalness: 0.0,
    roughness: 1.0,
    emissive: true,
    use: 'lamps, neon, fire cores, vfx — the ONE emissive slot',
  },
  {
    index: 19,
    name: 'leaf-dark',
    color: '#2f5a2a',
    metalness: 0.0,
    roughness: 0.9,
    use: 'dark evergreen leaves, shadowed foliage, conifers',
  },
  {
    index: 20,
    name: 'leaf-olive',
    color: '#586a30',
    metalness: 0.0,
    roughness: 0.9,
    use: 'olive foliage, dry leaves, canvas greens',
  },
  {
    index: 21,
    name: 'bark',
    color: '#46301f',
    metalness: 0.0,
    roughness: 0.85,
    use: 'tree bark, dark roots, rough brown wood',
  },
];

/**
 * Default snap target for optimized/theme render policy. It aliases the canonical
 * optimized palette so GLBs and CPU previews share one material-color contract when
 * a caller explicitly chooses palette coherence over faithful source colors.
 */
export const GENERAL_RENDER_PALETTE: readonly PaletteSlot[] = OPTIMIZED_PALETTE;

/** Convert authoring palette slots into the snap shape used by GLB + CPU preview bakes. */
export function paletteToSnapSlots(
  slots: readonly PaletteSlot[] = GENERAL_RENDER_PALETTE,
): SnapPaletteSlot[] {
  return slots.map((s) => ({
    color: s.color,
    kind: s.transparent ? 'glass' : s.emissive ? 'glow' : 'opaque',
    metalness: s.metalness,
    roughness: s.roughness,
    ...(s.opacity !== undefined ? { opacity: s.opacity } : {}),
  }));
}

/**
 * Render the authoring directive appended to the agent prompt when the
 * "Optimized palette" toggle is on (or a custom scene palette is chosen). Natural-
 * language guidance that names the shared roles and instructs the model to reuse
 * them rather than authoring a unique material per part — so the asset bakes down
 * to ~1 material per role (grade A/B).
 *
 * Pass `slots` to point the directive at a user-defined scene palette (the
 * configurable-palettes arc); the default is the canonical {@link OPTIMIZED_PALETTE}.
 * The glass/glow sentences adapt to whether the palette actually has such a slot, so
 * a custom palette without transparent/emissive roles doesn't name a role that isn't
 * there. Deterministic; the kiln-studio `OPTIMIZED_PALETTE_DIRECTIVE` mirror (no-arg
 * call) is asserted equal to this in a parity test.
 */
export function renderPaletteDirective(slots: readonly PaletteSlot[] = OPTIMIZED_PALETTE): string {
  const lines = slots.map((s) => `- ${s.name}: ${s.use}`).join('\n');
  const glass = slots.find((s) => s.transparent);
  const glow = slots.find((s) => s.emissive);
  const glassSentence = glass
    ? `"${glass.name}" is the ONLY transparent material — use it for every window, lens, or ` +
      'see-through part and nothing else; keep all other materials fully opaque. '
    : 'Keep every material fully opaque (this palette has no transparent role). ';
  const glowSentence = glow
    ? `"${glow.name}" is the ONLY emissive material — use it for anything that should look lit ` +
      '(lamps, fire cores, neon, magic). '
    : '';
  return (
    '## Optimized, instanceable build\n' +
    'A game-ready asset is cheap to render in bulk when its parts SHARE materials and SHARE ' +
    'geometry. Aim for both.\n\n' +
    'MATERIALS — build this asset using ONLY the shared material roles below. Pick the nearest role ' +
    'for each part and REUSE the same role across every part that shares a look; do not author a ' +
    'unique material or a one-off color per part. Far fewer distinct materials makes the asset ' +
    'dramatically cheaper to draw, with no change to how it reads at a glance.\n\n' +
    `${lines}\n\n` +
    'Use FLAT SOLID COLORS for every role — no image textures, gradients, or per-part color maps. ' +
    'Flat colors are exactly what let the materials collapse into one; a textured material cannot be ' +
    'merged. ' +
    glassSentence +
    glowSentence +
    'When a color you want is not named exactly, choose the closest role rather than introducing a ' +
    'new material; it is good and expected for many parts to share one role.\n\n' +
    'GEOMETRY — when the asset has repeated identical parts (wheels, windows, railings, fence posts, ' +
    'bolts, balusters, planks, columns), build the part ONCE and reuse that same part for every copy ' +
    'with createInstance, instead of modeling each separately. Instances share one geometry buffer, ' +
    'so a fence of 30 identical posts costs almost the same as one. Keep each part a clean closed ' +
    'solid and spend triangles on the silhouette, not on faces no one sees. The result should read ' +
    'correctly and be cheap to render many times over.'
  );
}

/** The rendered directive, precomputed. Canonical source for the kiln-studio mirror. */
export const OPTIMIZED_PALETTE_DIRECTIVE: string = renderPaletteDirective();
