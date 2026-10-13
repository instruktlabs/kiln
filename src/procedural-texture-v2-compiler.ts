/** Legacy V1/V2 pixel compiler. Extraction preserves arithmetic and recipe identity. */
import {
  type CanonicalProceduralLayerV2,
  type CanonicalProceduralTextureSpecV2,
  type ProceduralBlend,
  canonicalProceduralTextureJsonV2,
  canonicalizeProceduralTextureSpecV2,
  hashProceduralTextureSpecV2,
} from './procedural-material-v2';

// -----------------------------------------------------------------------------
// Deterministic value noise
// -----------------------------------------------------------------------------

/**
 * Integer hash of a lattice coordinate. Not a cryptographic hash — it only has
 * to decorrelate neighbouring integers and return the same value forever.
 */
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = h ^ (h >>> 13);
  h = Math.imul(h, 1274126177) | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Value noise on a lattice that wraps at `period`, so the result tiles.
 * `period` is in lattice cells, and both axes use the same one.
 */
function valueNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  // Wrapping the lattice index (not the sample point) is what makes it tile:
  // the cell to the right of the last one is the first one again.
  const wrap = (n: number): number => ((n % period) + period) % period;
  const x0 = wrap(xi);
  const y0 = wrap(yi);
  const x1 = wrap(xi + 1);
  const y1 = wrap(yi + 1);
  const sx = smoothstep(xf);
  const sy = smoothstep(yf);
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed);
  const n11 = hash2(x1, y1, seed);
  const top = n00 + sx * (n10 - n00);
  const bottom = n01 + sx * (n11 - n01);
  return top + sy * (bottom - top);
}

function fbm(u: number, v: number, period: number, octaves: number, seed: number): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let p = period;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(u, v, p, seed + o * 101) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    // Doubling the period keeps every octave tileable at the base period.
    p *= 2;
  }
  return total > 0 ? sum / total : 0;
}

// -----------------------------------------------------------------------------
// Layer evaluation
// -----------------------------------------------------------------------------

const rgbOf = (color: number): [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff,
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Rotate normalized coords about the center so angled patterns stay centered. */
function project(u: number, v: number, angleDeg: number): number {
  const a = (angleDeg * Math.PI) / 180;
  return (u - 0.5) * Math.cos(a) + (v - 0.5) * Math.sin(a) + 0.5;
}

/** Evaluate one layer at a normalized coordinate, returning 0-255 RGB. */
function evalLayer(
  layer: CanonicalProceduralLayerV2,
  u: number,
  v: number,
): [number, number, number] {
  switch (layer.op) {
    case 'solid':
      return rgbOf(layer.color);

    case 'checker': {
      const cx = Math.floor(u * layer.squares);
      const cy = Math.floor(v * layer.squares);
      return rgbOf((cx + cy) % 2 === 0 ? layer.colorA : layer.colorB);
    }

    case 'stripes': {
      const t = project(u, v, layer.angleDeg);
      return rgbOf(Math.floor(t * layer.count) % 2 === 0 ? layer.colorA : layer.colorB);
    }

    case 'gradient': {
      const t = Math.min(1, Math.max(0, project(u, v, layer.angleDeg)));
      const from = rgbOf(layer.from);
      const to = rgbOf(layer.to);
      return [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];
    }

    case 'bricks': {
      const row = Math.floor(v * layer.rows);
      // Offset alternate rows, wrapping into [0,1) so the pattern still tiles.
      const shifted = (u + (row % 2 === 0 ? 0 : layer.stagger / layer.cols) + 1) % 1;
      const inCol = (shifted * layer.cols) % 1;
      const inRow = (v * layer.rows) % 1;
      const isMortar =
        inCol < layer.mortarWidth ||
        inCol > 1 - layer.mortarWidth ||
        inRow < layer.mortarWidth ||
        inRow > 1 - layer.mortarWidth;
      return rgbOf(isMortar ? layer.mortar : layer.brick);
    }

    case 'noise': {
      const n = fbm(u, v, layer.scale, layer.octaves, layer.seed);
      const a = rgbOf(layer.colorA);
      const b = rgbOf(layer.colorB);
      return [lerp(a[0], b[0], n), lerp(a[1], b[1], n), lerp(a[2], b[2], n)];
    }
  }
}

function blendChannel(mode: ProceduralBlend, base: number, top: number): number {
  const b = base / 255;
  const t = top / 255;
  let out: number;
  switch (mode) {
    case 'multiply':
      out = b * t;
      break;
    case 'screen':
      out = 1 - (1 - b) * (1 - t);
      break;
    case 'overlay':
      out = b < 0.5 ? 2 * b * t : 1 - 2 * (1 - b) * (1 - t);
      break;
    default:
      out = t;
  }
  return out * 255;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Build a tiling texture from a bounded, deterministic layer stack.
 *
 * The result is a plain RGBA `DataTexture`; `renderSceneToGLB` bakes it to PNG
 * and embeds it, so nothing else has to be done to ship it.
 *
 * @example
 * const bark = proceduralTexture({
 *   schemaVersion: 2,
 *   size: 256,
 *   usage: 'albedo',
 *   name: 'Bark',
 *   layers: [
 *     { op: 'solid', color: 0x5a4632 },
 *     { op: 'noise', colorA: 0x3d2f21, colorB: 0x7a6248, scale: 6, octaves: 4, blend: 'overlay' },
 *     { op: 'stripes', colorA: 0x000000, colorB: 0xffffff, count: 24, angleDeg: 90,
 *       blend: 'multiply', opacity: 0.15 },
 *   ],
 * });
 * const trunk = createPart('Trunk', cylinderGeo(0.3, 0.3, 3), pbrMaterial({ albedo: bark }), { parent: root });
 */
export interface CompiledProceduralTextureV2 {
  spec: CanonicalProceduralTextureSpecV2;
  pixels: Uint8Array;
  canonicalJson: string;
  recipeHash: `sha256:${string}`;
}

/** Validate, canonicalize, and compile one texture without constructing Three.js state. */
export function compileProceduralTextureSpecV2(input: unknown): CompiledProceduralTextureV2 {
  const spec = canonicalizeProceduralTextureSpecV2(input);
  const { size, layers } = spec;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Sample at texel centers so a pattern with N divisions lands on exact
    // boundaries instead of drifting half a texel.
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [i, layer] of layers.entries()) {
        const [lr, lg, lb] = evalLayer(layer, u, v);
        if (i === 0) {
          r = lr;
          g = lg;
          b = lb;
          continue;
        }
        r = lerp(r, blendChannel(layer.blend, r, lr), layer.opacity);
        g = lerp(g, blendChannel(layer.blend, g, lg), layer.opacity);
        b = lerp(b, blendChannel(layer.blend, b, lb), layer.opacity);
      }
      const o = (y * size + x) * 4;
      data[o] = Math.max(0, Math.min(255, Math.round(r)));
      data[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[o + 3] = 255;
    }
  }

  return {
    spec,
    pixels: data,
    canonicalJson: canonicalProceduralTextureJsonV2(spec),
    recipeHash: hashProceduralTextureSpecV2(spec),
  };
}
