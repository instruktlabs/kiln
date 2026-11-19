/** Legacy V1/V2 pixel compiler. Extraction preserves arithmetic and recipe identity. */
import {
  type CellularField,
  prepareCellularField,
  sampleCellularFeature,
} from './procedural-cellular';
import {
  type CanonicalProceduralLayerV2,
  type CanonicalProceduralTextureSpecV2,
  type ProceduralBlend,
  canonicalProceduralTextureJsonV2,
  canonicalizeProceduralTextureSpecV2,
  hashProceduralTextureSpecV2,
} from './procedural-material-v2';
import type { ProceduralCompileOptions } from './procedural-texture-cache';

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
 * Wrapping the lattice index (not the sample point) is what makes noise tile:
 * the cell to the right of the last one is the first one again.
 */
const wrapLattice = (n: number, period: number): number => ((n % period) + period) % period;

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
  const x0 = wrapLattice(xi, period);
  const y0 = wrapLattice(yi, period);
  const x1 = wrapLattice(xi + 1, period);
  const y1 = wrapLattice(yi + 1, period);
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

const red = (color: number): number => (color >> 16) & 0xff;
const green = (color: number): number => (color >> 8) & 0xff;
const blue = (color: number): number => color & 0xff;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * One layer with everything that does not vary per texel worked out once: its colours as
 * 0-255 channels and, for angled patterns, the cosine and sine of the angle. The per-texel
 * arithmetic below is the same, in the same order, as evaluating the layer from scratch.
 */
interface PreparedLayerV2 {
  layer: CanonicalProceduralLayerV2;
  field: CellularField | undefined;
  /** First and second colour channels (solid uses A only). */
  a: [number, number, number];
  b: [number, number, number];
  cos: number;
  sin: number;
}

function prepareLayer(layer: CanonicalProceduralLayerV2): PreparedLayerV2 {
  const channels = (color: number): [number, number, number] => [
    red(color),
    green(color),
    blue(color),
  ];
  const none: [number, number, number] = [0, 0, 0];
  const angled = (angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return { cos: Math.cos(a), sin: Math.sin(a) };
  };
  switch (layer.op) {
    case 'solid':
      return { layer, field: undefined, a: channels(layer.color), b: none, cos: 0, sin: 0 };
    case 'checker':
      return {
        layer,
        field: undefined,
        a: channels(layer.colorA),
        b: channels(layer.colorB),
        cos: 0,
        sin: 0,
      };
    case 'stripes':
      return {
        layer,
        field: undefined,
        a: channels(layer.colorA),
        b: channels(layer.colorB),
        ...angled(layer.angleDeg),
      };
    case 'gradient':
      return {
        layer,
        field: undefined,
        a: channels(layer.from),
        b: channels(layer.to),
        ...angled(layer.angleDeg),
      };
    case 'bricks':
      return {
        layer,
        field: undefined,
        a: channels(layer.brick),
        b: channels(layer.mortar),
        cos: 0,
        sin: 0,
      };
    case 'noise':
      return {
        layer,
        field: undefined,
        a: channels(layer.colorA),
        b: channels(layer.colorB),
        cos: 0,
        sin: 0,
      };
    case 'cellular':
      return {
        layer,
        field: prepareCellularField(layer),
        a: channels(layer.colorA),
        b: channels(layer.colorB),
        cos: 0,
        sin: 0,
      };
  }
}

/** Rotate normalized coords about the center so angled patterns stay centered. */
const project = (u: number, v: number, cos: number, sin: number): number =>
  (u - 0.5) * cos + (v - 0.5) * sin + 0.5;

/** Write one channel triple into `out`: no per-texel allocation. */
function pick(out: Float64Array, rgb: readonly [number, number, number]): void {
  out[0] = rgb[0];
  out[1] = rgb[1];
  out[2] = rgb[2];
}

function mix(
  out: Float64Array,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): void {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

/** Evaluate one layer at a normalized coordinate into `out` as 0-255 RGB. */
function evalLayer(prepared: PreparedLayerV2, u: number, v: number, out: Float64Array): void {
  const { layer, a, b } = prepared;
  switch (layer.op) {
    case 'solid':
      pick(out, a);
      return;

    case 'checker': {
      const cx = Math.floor(u * layer.squares);
      const cy = Math.floor(v * layer.squares);
      pick(out, (cx + cy) % 2 === 0 ? a : b);
      return;
    }

    case 'stripes': {
      const t = project(u, v, prepared.cos, prepared.sin);
      pick(out, Math.floor(t * layer.count) % 2 === 0 ? a : b);
      return;
    }

    case 'gradient': {
      const t = Math.min(1, Math.max(0, project(u, v, prepared.cos, prepared.sin)));
      mix(out, a, b, t);
      return;
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
      pick(out, isMortar ? b : a);
      return;
    }

    case 'noise': {
      const n = fbm(u, v, layer.scale, layer.octaves, layer.seed);
      mix(out, a, b, n);
      return;
    }

    case 'cellular': {
      const n = sampleCellularFeature(prepared.field!, u, v);
      mix(out, a, b, n);
      return;
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
export function compileProceduralTextureSpecV2(
  input: unknown,
  options: ProceduralCompileOptions = {},
): CompiledProceduralTextureV2 {
  const spec = canonicalizeProceduralTextureSpecV2(input);
  const canonicalJson = canonicalProceduralTextureJsonV2(spec);
  const pixels = options.cache
    ? options.cache.pixels(`v2:${canonicalJson}`, () => compilePixelsV2(spec))
    : compilePixelsV2(spec);
  return {
    spec,
    pixels,
    canonicalJson,
    recipeHash: hashProceduralTextureSpecV2(spec),
  };
}

function compilePixelsV2(spec: CanonicalProceduralTextureSpecV2): Uint8Array {
  const { size, layers } = spec;
  const data = new Uint8Array(size * size * 4);
  const prepared = layers.map(prepareLayer);
  const sample = new Float64Array(3);
  for (let y = 0; y < size; y++) {
    // Sample at texel centers so a pattern with N divisions lands on exact
    // boundaries instead of drifting half a texel.
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < prepared.length; i++) {
        const layer = prepared[i]!;
        evalLayer(layer, u, v, sample);
        const lr = sample[0]!;
        const lg = sample[1]!;
        const lb = sample[2]!;
        if (i === 0) {
          r = lr;
          g = lg;
          b = lb;
          continue;
        }
        const { blend, opacity } = layer.layer;
        r = lerp(r, blendChannel(blend, r, lr), opacity);
        g = lerp(g, blendChannel(blend, g, lg), opacity);
        b = lerp(b, blendChannel(blend, b, lb), opacity);
      }
      const o = (y * size + x) * 4;
      data[o] = Math.max(0, Math.min(255, Math.round(r)));
      data[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[o + 3] = 255;
    }
  }
  return data;
}
