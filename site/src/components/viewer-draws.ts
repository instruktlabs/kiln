import type { BufferGeometry, Object3D } from 'three';

/**
 * What keeps the 3D view's draw calls down, apart from the renderer: a contact shadow baked once rather than
 * redrawn with the whole model every frame, no drawing while nothing changes, and culling that is safe to leave on.
 */

export const SHADOW_RESOLUTION = 512;

/** The tap weights of the blur the shadow always had (drei's contact shadow), centre last. */
const TAPS = [0.051, 0.0918, 0.12245, 0.1531, 0.1633, 0.1531, 0.12245, 0.0918, 0.051];

/** One blur along one axis, clamped at the edges. `along` is the distance between neighbouring pixels on that axis. */
function blurPass(
  source: Float32Array,
  target: Float32Array,
  size: number,
  step: number,
  horizontal: boolean,
) {
  const last = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let tap = 0; tap < 9; tap++) {
        const offset = (tap - 4) * step;
        const sx = horizontal ? Math.min(last, Math.max(0, x + offset)) : x;
        const sy = horizontal ? y : Math.min(last, Math.max(0, y + offset));
        sum += (source[sy * size + sx] as number) * (TAPS[tap] as number);
      }
      target[y * size + x] = sum;
    }
  }
}

export interface ContactShadowOptions {
  /** Alpha at full coverage, 0 to 1. */
  opacity: number;
  /** drei's `blur`: 1 is a tap spacing of 1/256 of the texture. */
  blur: number;
  /** The shadow's sRGB bytes. */
  colour: readonly [number, number, number];
}

/**
 * Turn the bake's red channel (how close the model comes to the ground at each texel) into the shadow's texture:
 * a wide blur and a narrow one on each axis, as the old shadow did on the GPU each frame, in the shadow's colour with
 * the coverage in alpha. Whole-pixel taps keep this to a few tens of milliseconds at 512, and two sizes hide the steps.
 */
export function composeContactShadow(
  bake: Uint8Array,
  size: number,
  { opacity, blur, colour }: ContactShadowOptions,
): Uint8Array {
  let front = new Float32Array(size * size);
  let back = new Float32Array(size * size);
  for (let i = 0; i < front.length; i++) front[i] = (bake[i * 4] as number) / 255;
  for (const scale of [1, 0.4]) {
    const step = Math.max(1, Math.round((blur * scale * size) / 256));
    for (const horizontal of [true, false]) {
      blurPass(front, back, size, step, horizontal);
      [front, back] = [back, front];
    }
  }
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < front.length; i++) {
    pixels[i * 4] = colour[0];
    pixels[i * 4 + 1] = colour[1];
    pixels[i * 4 + 2] = colour[2];
    pixels[i * 4 + 3] = Math.round((front[i] as number) * opacity * 255);
  }
  return pixels;
}

/** A still model draws when the camera or a control changes it; a turntable or a playing clip draws every frame. */
export function viewerFrameloop(state: {
  spin: boolean;
  clipPlaying: boolean;
}): 'always' | 'demand' {
  return state.spin || state.clipPlaying ? 'always' : 'demand';
}

const SHADOW_REFRESH_SECONDS = 0.25;

/**
 * Whether a playing clip's shadow is due for a new bake: a few times a second is enough for a soft shadow. A last
 * bake later than `now` means the clock restarted (React Three Fiber resets it when the frame loop changes), so the
 * shadow is due at once rather than frozen until the clock catches up.
 */
export const rebakeDue = (now: number, lastBake: number) =>
  now < lastBake || now - lastBake >= SHADOW_REFRESH_SECONDS;

/**
 * Culling on for everything whose bounding sphere can be trusted, and measured here rather than taken from the file:
 * a part blinks out when its sphere does not contain its vertices. Skinned and morphing parts leave their rest-pose
 * sphere as they move, so they are always drawn. Returns how many geometries were measured.
 */
export function restoreCulling(root: Object3D): number {
  const measured = new Set<BufferGeometry>();
  root.traverse((object) => {
    const part = object as Object3D & {
      geometry?: BufferGeometry;
      isSkinnedMesh?: boolean;
      isInstancedMesh?: boolean;
      morphTargetInfluences?: number[];
    };
    const { geometry } = part;
    if (!geometry) return;
    const moving = part.isSkinnedMesh || (part.morphTargetInfluences?.length ?? 0) > 0;
    part.frustumCulled = !moving;
    if (moving || part.isInstancedMesh || measured.has(geometry)) return;
    geometry.computeBoundingSphere();
    measured.add(geometry);
  });
  return measured.size;
}
