// SPDX-License-Identifier: MIT
// Loose-typed re-export of three/tsl. @types/three 0.185's TSL typings
// collapse chained node expressions to `never` (their __TypeScript_NODE_TYPE__
// intersection bug), which would force casts at every call site. This module
// is the single place that cast lives; all app TSL code imports from here.
// Runtime behavior is untouched: these are the real three/tsl exports.
// Revisit when @types/three TSL typings stabilize (open question in STATUS.md).
import * as tslStrict from 'three/tsl';


export type TSLNode = any;


const t = tslStrict as any;

export const color: (...a: unknown[]) => TSLNode = t.color;
export const uniform: (...a: unknown[]) => TSLNode = t.uniform;
export const float: (...a: unknown[]) => TSLNode = t.float;
export const int: (...a: unknown[]) => TSLNode = t.int;
export const vec2: (...a: unknown[]) => TSLNode = t.vec2;
export const vec3: (...a: unknown[]) => TSLNode = t.vec3;
export const vec4: (...a: unknown[]) => TSLNode = t.vec4;
export const mix: (...a: unknown[]) => TSLNode = t.mix;
export const smoothstep: (...a: unknown[]) => TSLNode = t.smoothstep;
export const dot: (...a: unknown[]) => TSLNode = t.dot;
export const normalize: (...a: unknown[]) => TSLNode = t.normalize;
export const sin: (...a: unknown[]) => TSLNode = t.sin;
export const cos: (...a: unknown[]) => TSLNode = t.cos;
export const min: (...a: unknown[]) => TSLNode = t.min;
export const max: (...a: unknown[]) => TSLNode = t.max;
export const clamp: (...a: unknown[]) => TSLNode = t.clamp;
export const fract: (...a: unknown[]) => TSLNode = t.fract;
export const floor: (...a: unknown[]) => TSLNode = t.floor;
export const abs: (...a: unknown[]) => TSLNode = t.abs;
export const pow: (...a: unknown[]) => TSLNode = t.pow;
export const sqrt: (...a: unknown[]) => TSLNode = t.sqrt;
export const length: (...a: unknown[]) => TSLNode = t.length;
export const distance: (...a: unknown[]) => TSLNode = t.distance;
export const hash: (...a: unknown[]) => TSLNode = t.hash;
export const step: (...a: unknown[]) => TSLNode = t.step;
export const select: (...a: unknown[]) => TSLNode = t.select;
export const Fn: (...a: unknown[]) => TSLNode = t.Fn;
export const If: (...a: unknown[]) => TSLNode = t.If;
export const Loop: (...a: unknown[]) => TSLNode = t.Loop;
export const instancedBufferAttribute: (...a: unknown[]) => TSLNode = t.instancedBufferAttribute;
export const instancedArray: (...a: unknown[]) => TSLNode = t.instancedArray;
export const texture: (...a: unknown[]) => TSLNode = t.texture;
export const materialReference: (...a: unknown[]) => TSLNode = t.materialReference;
export const mx_noise_float: (...a: unknown[]) => TSLNode = t.mx_noise_float;
export const mx_noise_vec3: (...a: unknown[]) => TSLNode = t.mx_noise_vec3;
export const mx_fractal_noise_float: (...a: unknown[]) => TSLNode = t.mx_fractal_noise_float;
export const rotate: (...a: unknown[]) => TSLNode = t.rotate;
export const luminance: (...a: unknown[]) => TSLNode = t.luminance;
export const pass: (...a: unknown[]) => TSLNode = t.pass;

export const time: TSLNode = t.time;
export const deltaTime: TSLNode = t.deltaTime;
export const positionLocal: TSLNode = t.positionLocal;
export const positionWorld: TSLNode = t.positionWorld;
export const normalLocal: TSLNode = t.normalLocal;
export const normalWorld: TSLNode = t.normalWorld;
export const normalView: TSLNode = t.normalView;
export const cameraPosition: TSLNode = t.cameraPosition;
export const cameraViewMatrix: TSLNode = t.cameraViewMatrix;
export const uv: (...a: unknown[]) => TSLNode = t.uv;
export const instanceIndex: TSLNode = t.instanceIndex;
export const screenUV: TSLNode = t.screenUV;
export const positionViewDirection: TSLNode = t.positionViewDirection;
