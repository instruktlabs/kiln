/** Deterministic binary coverage and straight RGBA source-over compiler. */
import { compileProceduralTextureSpecV2 } from './procedural-texture-v2-compiler';
import {
  canonicalizeProceduralTextureSpecV3,
  canonicalProceduralTextureJsonV3,
  hashProceduralTextureSpecV3,
  PROCEDURAL_TEXTURE_V3_COMPILER_ID,
  proceduralClippedBoundsV3,
  proceduralShapeBoundsV3,
  type CanonicalProceduralTextureSpecV3,
  type ProceduralShapeV3,
  type RgbaV3,
} from './procedural-texture-v3-contract';
export {
  canonicalizeProceduralTextureSpecV3,
  canonicalProceduralTextureJsonV3,
  hashProceduralTextureSpecV3,
  PROCEDURAL_TEXTURE_V3_COMPILER_ID,
  PROCEDURAL_TEXTURE_SPEC_VERSION_V3,
  MAX_PROCEDURAL_V3_EDGE,
  MAX_PROCEDURAL_V3_TEXELS,
  MAX_PROCEDURAL_V3_OPERATIONS,
  MAX_PROCEDURAL_V3_VERTICES,
  MAX_PROCEDURAL_V3_STAMPS,
  MAX_PROCEDURAL_V3_PALETTE,
  MAX_PROCEDURAL_V3_WORK,
  MAX_PROCEDURAL_V3_TRANSIENT_BYTES,
} from './procedural-texture-v3-contract';
export type {
  RgbaV3,
  PixelPointV3,
  PixelRectangleV3,
  ProceduralShapeV3,
  ProceduralOperationV3,
  CanonicalProceduralOperationV3,
  ProceduralTextureSpecV3,
  CanonicalProceduralTextureSpecV3,
} from './procedural-texture-v3-contract';

export interface CompiledProceduralTextureV3 {
  spec: CanonicalProceduralTextureSpecV3;
  pixels: Uint8Array;
  canonicalJson: string;
  recipeHash: `sha256:${string}`;
  compilerId: typeof PROCEDURAL_TEXTURE_V3_COMPILER_ID;
}
const roundRatio = (numerator: number, denominator: number): number =>
  Math.floor(numerator / denominator + 0.5);

/** Pixel centers; rectangles half-open, curved and polygon boundaries inclusive. */
function covers(shape: ProceduralShapeV3, x: number, y: number): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  if (shape.kind === 'rectangle')
    return (
      px >= shape.x && px < shape.x + shape.width && py >= shape.y && py < shape.y + shape.height
    );
  if (shape.kind === 'ellipse') {
    const dx = 2 * px - 2 * shape.x - shape.width;
    const dy = 2 * py - 2 * shape.y - shape.height;
    const w2 = shape.width * shape.width;
    const h2 = shape.height * shape.height;
    return dx * dx * h2 + dy * dy * w2 <= w2 * h2;
  }
  if (shape.kind === 'line') {
    const [ax, ay] = shape.from;
    const dx = shape.to[0] - ax;
    const dy = shape.to[1] - ay;
    const vx = px - ax;
    const vy = py - ay;
    const length2 = dx * dx + dy * dy;
    const dot = vx * dx + vy * dy;
    const radius2 = (shape.width * shape.width) / 4;
    if (dot <= 0 || length2 === 0) return vx * vx + vy * vy <= radius2;
    if (dot >= length2) return (px - shape.to[0]) ** 2 + (py - shape.to[1]) ** 2 <= radius2;
    const cross = vx * dy - vy * dx;
    return cross * cross <= radius2 * length2;
  }
  let inside = false;
  for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
    const [ax, ay] = shape.points[j]!;
    const [bx, by] = shape.points[i]!;
    const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
    if (
      cross === 0 &&
      px >= Math.min(ax, bx) &&
      px <= Math.max(ax, bx) &&
      py >= Math.min(ay, by) &&
      py <= Math.max(ay, by)
    )
      return true;
    if (ay > py !== by > py && (by > ay ? cross < 0 : cross > 0)) inside = !inside;
  }
  return inside;
}

/** All divisions round half-up. Stored channels are straight, not premultiplied. */
function sourceOver(pixels: Uint8Array, offset: number, rgba: RgbaV3, opacity: number): void {
  const sa = roundRatio(rgba[3] * opacity, 255);
  if (sa === 0) return;
  const da = pixels[offset + 3]!;
  const alphaNumerator = sa * 255 + da * (255 - sa);
  for (let channel = 0; channel < 3; channel++) {
    pixels[offset + channel] = roundRatio(
      rgba[channel]! * sa * 255 + pixels[offset + channel]! * da * (255 - sa),
      alphaNumerator,
    );
  }
  pixels[offset + 3] = roundRatio(alphaNumerator, 255);
}

function paint(
  pixels: Uint8Array,
  width: number,
  height: number,
  shape: ProceduralShapeV3,
  rgba: RgbaV3,
  opacity: number,
  dx = 0,
  dy = 0,
): void {
  const [x0, y0, x1, y1] = proceduralClippedBoundsV3(shape, width, height, dx, dy);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (covers(shape, x - dx, y - dy)) sourceOver(pixels, (y * width + x) * 4, rgba, opacity);
    }
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
function applyPalette(
  pixels: Uint8Array,
  width: number,
  palette: NonNullable<CanonicalProceduralTextureSpecV3['palette']>,
): void {
  const colors = palette.colors.map((c) => [(c >>> 16) & 255, (c >>> 8) & 255, c & 255]);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const index = i / 4;
    const x = index % width;
    const y = Math.floor(index / width);
    const offset = palette.dither === 'bayer4' ? (2 * BAYER4[(y % 4) * 4 + (x % 4)]! - 15) * 2 : 0;
    const r = Math.max(0, Math.min(255, pixels[i]! + offset));
    const g = Math.max(0, Math.min(255, pixels[i + 1]! + offset));
    const b = Math.max(0, Math.min(255, pixels[i + 2]! + offset));
    let best = colors[0]!;
    let distance = Infinity;
    for (const color of colors) {
      const candidate = (r - color[0]!) ** 2 + (g - color[1]!) ** 2 + (b - color[2]!) ** 2;
      if (candidate < distance) {
        distance = candidate;
        best = color;
      }
    }
    pixels[i] = best[0]!;
    pixels[i + 1] = best[1]!;
    pixels[i + 2] = best[2]!;
  }
}

/** Xorshift32 stream, initialized by a fixed salt; modulo chooses integer offsets. */
function stampRandom(seed: number): () => number {
  let state = (seed ^ 0xa3c59ac3) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}
const wrap = (value: number, period: number): number => ((value % period) + period) % period;

/** Preflight validates all nested values and total worst-case work before allocation. */
export function compileProceduralTextureSpecV3(input: unknown): CompiledProceduralTextureV3 {
  const spec = canonicalizeProceduralTextureSpecV3(input);
  const { width, height } = spec;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(spec.background, i);
  for (const op of spec.operations) {
    if (op.op === 'paint') paint(pixels, width, height, op.shape, op.rgba, op.opacity);
    else if (op.op === 'mask') {
      const [x0, y0, x1, y1] = proceduralClippedBoundsV3(op.shape, width, height);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const covered = x >= x0 && x < x1 && y >= y0 && y < y1 && covers(op.shape, x, y);
          const alpha = covered !== op.invert ? op.alpha : 0;
          const offset = (y * width + x) * 4;
          pixels[offset + 3] = roundRatio(pixels[offset + 3]! * alpha, 255);
          if (pixels[offset + 3] === 0) pixels.fill(0, offset, offset + 3);
        }
    } else if (op.op === 'legacy-v2') {
      const legacy = compileProceduralTextureSpecV2(op.spec).pixels;
      for (let i = 0; i < pixels.length; i += 4)
        sourceOver(pixels, i, [legacy[i]!, legacy[i + 1]!, legacy[i + 2]!, op.alpha], op.opacity);
    } else {
      const random = stampRandom(op.seed);
      const [bx0, by0] = proceduralShapeBoundsV3(op.shape);
      for (let stamp = 0; stamp < op.count; stamp++) {
        let dx = op.area.x + (random() % op.area.width);
        let dy = op.area.y + (random() % op.area.height);
        if (!op.periodic) paint(pixels, width, height, op.shape, op.rgba, op.opacity, dx, dy);
        else {
          dx = wrap(dx + bx0, width) - bx0;
          dy = wrap(dy + by0, height) - by0;
          for (const oy of [-height, 0, height])
            for (const ox of [-width, 0, width])
              paint(pixels, width, height, op.shape, op.rgba, op.opacity, dx + ox, dy + oy);
        }
      }
    }
  }
  if (spec.palette) applyPalette(pixels, width, spec.palette);
  return {
    spec,
    pixels,
    canonicalJson: canonicalProceduralTextureJsonV3(spec),
    recipeHash: hashProceduralTextureSpecV3(spec),
    compilerId: PROCEDURAL_TEXTURE_V3_COMPILER_ID,
  };
}
