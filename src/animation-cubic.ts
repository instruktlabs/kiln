/**
 * three.js playback of glTF CUBICSPLINE tracks (R67).
 *
 * three.js has no built-in interpolant for glTF cubic splines: GLTFLoader defines its own and
 * marks the track's interpolant factory, and GLTFExporter writes a CUBICSPLINE sampler for a
 * track so marked. `useCubicSpline` gives a track the same factory and flag, so an authored
 * eased track, a track rebuilt from a GLB and a GLTFLoader track play, export and review alike.
 * The arithmetic lives in `animation-spline.ts`, shared with the realm-agnostic poser.
 */
import * as THREE from 'three';
import { CUBIC_SPLINE_FACTORY_FLAG, cubicSegment, normalizeQuaternion } from './animation-spline';

type Buffer = THREE.TypedArray;

class CubicSplineInterpolant extends THREE.Interpolant {
  override copySampleValue_(index: number): Buffer {
    const result = this.resultBuffer;
    const size = this.valueSize;
    const offset = index * size * 3 + size;
    for (let i = 0; i < size; i++) result[i] = this.sampleValues[offset + i]!;
    return result;
  }

  override interpolate_(i1: number, t0: number, t: number, t1: number): Buffer {
    cubicSegment(this.sampleValues, this.valueSize, i1 - 1, t0, t1, t, this.resultBuffer);
    return this.resultBuffer;
  }
}

class CubicSplineQuaternionInterpolant extends CubicSplineInterpolant {
  override interpolate_(i1: number, t0: number, t: number, t1: number): Buffer {
    const result = super.interpolate_(i1, t0, t, t1);
    normalizeQuaternion(result);
    return result;
  }
}

/** The interpolant factory of a CUBICSPLINE track; its values hold three entries per key. */
const cubicSplineFactory = Object.assign(
  function InterpolantFactoryMethodGLTFCubicSpline(
    this: THREE.KeyframeTrack,
    result?: Buffer,
  ): THREE.Interpolant {
    const Type =
      this.ValueTypeName === 'quaternion'
        ? CubicSplineQuaternionInterpolant
        : CubicSplineInterpolant;
    return new Type(this.times as Buffer, this.values as Buffer, this.getValueSize() / 3, result);
  },
  { [CUBIC_SPLINE_FACTORY_FLAG]: true },
);

/** Make `track` a glTF CUBICSPLINE track; its values must already be [in, value, out] per key. */
export function useCubicSpline<T extends THREE.KeyframeTrack>(track: T): T {
  (track as unknown as { createInterpolant: unknown }).createInterpolant = cubicSplineFactory;
  return track;
}
