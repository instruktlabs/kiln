/**
 * What a GLB can carry of a program's declared parameters.
 *
 * A GLB cannot re-run a program, but glTF multiplies a material's base colour factor into the
 * surface, so a `color` parameter that only sets base colour factors can be changed in the
 * file: one value on one material. This module decides that mechanically, by comparing the
 * default build with a build at a probe colour, and applies it: to a GLB's bytes for a viewer,
 * and as material tags for an export. Browser-safe; it reads GLB JSON and nothing else.
 */
import type { ParamsDeclarationV1 } from './params';

export interface BoundMaterialV1 {
  /** Index into the saved GLB's `materials`. */
  index: number;
  /** The material's name, when it has one: how another engine finds it. */
  name?: string;
}

/** Setting these materials' base colour factor reproduces a rebuild at that colour exactly. */
export interface FactorColorBindingV1 {
  mode: 'factor';
  materials: BoundMaterialV1[];
}

export type ColorRebuildReason =
  /** Mesh, vertex-colour or texture data differs: the colour is baked into the binary. */
  | 'DATA_CHANGED'
  /** Something other than a base colour factor differs. */
  | 'OTHER_VALUES_CHANGED'
  /** A base colour follows the parameter without being equal to it. */
  | 'DERIVED_COLOR'
  /** No material's base colour follows the parameter. */
  | 'NO_MATERIAL'
  /** The build at the probe colour failed. */
  | 'PROBE_FAILED';

/** The colour takes effect only through a rebuild from source. */
export interface RebuildColorBindingV1 {
  mode: 'rebuild';
  reason: ColorRebuildReason;
  detail: string;
}

export type ColorBindingV1 = FactorColorBindingV1 | RebuildColorBindingV1;

/** Recorded in a saved manifest as `build.paramBindings`; judged at the declared defaults. */
export interface ParamBindingsV1 {
  version: 'kiln.param-bindings.v1';
  colors: Record<string, ColorBindingV1>;
}

/** The tag an export writes into `materials[i].extras`. */
export interface GltfParamTagV1 {
  name: string;
  type: 'color';
}

const REASONS: readonly ColorRebuildReason[] = [
  'DATA_CHANGED',
  'OTHER_VALUES_CHANGED',
  'DERIVED_COLOR',
  'NO_MATERIAL',
  'PROBE_FAILED',
];
const DETAIL: Record<ColorRebuildReason, string> = {
  DATA_CHANGED:
    'The colour is baked into mesh, vertex-colour or texture data. To make it settable in the GLB, apply it as the base colour of its own material and keep the detail in neutral greys.',
  OTHER_VALUES_CHANGED:
    'The colour changes more than material base colours, so a GLB cannot carry it as one value.',
  DERIVED_COLOR:
    'A material base colour is computed from the colour rather than equal to it. Pass the parameter to the material unchanged to make it settable in the GLB.',
  NO_MATERIAL:
    'No material base colour follows this parameter at the default values of the others.',
  PROBE_FAILED: 'The build at a test colour failed, so this colour was not classified.',
};
const HEX = /^#[0-9a-f]{6}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The linear RGB three.js writes to a GLB for an sRGB `#rrggbb` colour. */
export function srgbHexToLinear(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new TypeError('A colour is #rrggbb in lowercase.');
  const channel = (offset: number) => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c < 0.04045 ? c * 0.0773993808 : (c * 0.9478672986 + 0.0521327014) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}

/** A colour to build with that is not the default. */
export const colorProbe = (defaultColor: string): string =>
  defaultColor === '#ff00ff' ? '#00ff00' : '#ff00ff';

interface SplitGlb {
  json: Record<string, unknown>;
  /** Byte offset where the JSON chunk's data ends. */
  jsonEnd: number;
}

function splitGlb(bytes: Uint8Array): SplitGlb {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67)
    throw new Error('Not a GLB file.');
  const jsonEnd = 20 + view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonEnd > bytes.length)
    throw new Error('Invalid GLB JSON chunk.');
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, jsonEnd)));
  if (!isRecord(json)) throw new Error('Invalid glTF JSON.');
  return { json, jsonEnd };
}

function joinGlb(bytes: Uint8Array, jsonEnd: number, json: unknown): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const length = Math.ceil(text.length / 4) * 4;
  const out = new Uint8Array(20 + length + bytes.length - jsonEnd);
  out.set(bytes.subarray(0, 20));
  const header = new DataView(out.buffer);
  header.setUint32(8, out.length, true);
  header.setUint32(12, length, true);
  out.fill(32, 20, 20 + length);
  out.set(text, 20);
  out.set(bytes.subarray(jsonEnd), 20 + length);
  return out;
}

const materialsOf = (json: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(json.materials)
    ? (json.materials.filter(isRecord) as Record<string, unknown>[])
    : [];

function baseColor(material: Record<string, unknown>): number[] {
  const pbr = material.pbrMetallicRoughness;
  const factor = isRecord(pbr) ? pbr.baseColorFactor : undefined;
  return Array.isArray(factor) && factor.length === 4 && factor.every((v) => typeof v === 'number')
    ? (factor as number[])
    : [1, 1, 1, 1];
}

/** The JSON with every base colour factor removed, for comparing everything else. */
function withoutBaseColors(json: Record<string, unknown>): string {
  const copy = structuredClone(json);
  for (const material of materialsOf(copy)) {
    const pbr = material.pbrMetallicRoughness;
    if (!isRecord(pbr)) continue;
    delete pbr.baseColorFactor;
    if (!Object.keys(pbr).length) delete material.pbrMetallicRoughness;
  }
  return JSON.stringify(copy);
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
const rebuild = (reason: ColorRebuildReason): RebuildColorBindingV1 => ({
  mode: 'rebuild',
  reason,
  detail: DETAIL[reason],
});

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Compare the default build with a build that changed one colour parameter to `probeColor`.
 * The colour is carried by the file only when nothing but base colour factors differ and each
 * differing factor is the parameter's colour in both builds.
 */
export function classifyColorBinding(
  defaultGlb: Uint8Array,
  probeGlb: Uint8Array,
  defaultColor: string,
  probeColor: string,
): ColorBindingV1 {
  const a = splitGlb(defaultGlb);
  const b = splitGlb(probeGlb);
  if (!sameBytes(defaultGlb.subarray(a.jsonEnd), probeGlb.subarray(b.jsonEnd)))
    return rebuild('DATA_CHANGED');
  if (withoutBaseColors(a.json) !== withoutBaseColors(b.json))
    return rebuild('OTHER_VALUES_CHANGED');
  const from = srgbHexToLinear(defaultColor);
  const to = srgbHexToLinear(probeColor);
  const before = materialsOf(a.json);
  const after = materialsOf(b.json);
  const materials: BoundMaterialV1[] = [];
  for (let index = 0; index < before.length; index++) {
    const was = baseColor(before[index]!);
    const is = baseColor(after[index]!);
    if (was.every((value, channel) => value === is[channel])) continue;
    const follows =
      was[3] === is[3] &&
      from.every((value, channel) => near(value, was[channel]!)) &&
      to.every((value, channel) => near(value, is[channel]!));
    if (!follows) return rebuild('DERIVED_COLOR');
    const name = before[index]!.name;
    materials.push({ index, ...(typeof name === 'string' && name ? { name } : {}) });
  }
  return materials.length ? { mode: 'factor', materials } : rebuild('NO_MATERIAL');
}

/**
 * Classify every `color` parameter of a declaration: one probe build each, with the other
 * parameters at their defaults. Undefined when the declaration has no colour parameter.
 */
export async function classifyColorParams(
  declaration: ParamsDeclarationV1,
  defaultGlb: Uint8Array,
  buildWith: (values: Record<string, string>) => Promise<Uint8Array>,
): Promise<ParamBindingsV1 | undefined> {
  const colors: Record<string, ColorBindingV1> = {};
  for (const [name, spec] of Object.entries(declaration.params)) {
    if (spec.type !== 'color') continue;
    const probe = colorProbe(spec.default);
    try {
      colors[name] = classifyColorBinding(
        defaultGlb,
        await buildWith({ [name]: probe }),
        spec.default,
        probe,
      );
    } catch {
      colors[name] = rebuild('PROBE_FAILED');
    }
  }
  return Object.keys(colors).length ? { version: 'kiln.param-bindings.v1', colors } : undefined;
}

/** A recorded report read back from a manifest anyone can write; undefined unless well formed. */
export function validateParamBindings(value: unknown): ParamBindingsV1 | undefined {
  if (!isRecord(value) || value.version !== 'kiln.param-bindings.v1' || !isRecord(value.colors))
    return undefined;
  const entries = Object.entries(value.colors);
  if (entries.length > 24) return undefined;
  for (const [name, binding] of entries) {
    if (!NAME.test(name) || !isRecord(binding)) return undefined;
    if (binding.mode === 'rebuild') {
      if (
        !REASONS.includes(binding.reason as ColorRebuildReason) ||
        typeof binding.detail !== 'string' ||
        binding.detail.length > 400
      )
        return undefined;
    } else if (binding.mode === 'factor') {
      const materials = binding.materials;
      if (!Array.isArray(materials) || !materials.length || materials.length > 256)
        return undefined;
      for (const material of materials)
        if (
          !isRecord(material) ||
          !Number.isInteger(material.index) ||
          (material.index as number) < 0 ||
          (material.name !== undefined &&
            (typeof material.name !== 'string' || material.name.length > 200))
        )
          return undefined;
    } else return undefined;
  }
  return value as unknown as ParamBindingsV1;
}

/** The colour parameters a file carries, each with the materials that take its value. */
export function factorColorBindings(
  bindings: ParamBindingsV1 | undefined,
): Record<string, BoundMaterialV1[]> {
  const out: Record<string, BoundMaterialV1[]> = {};
  for (const [name, binding] of Object.entries(bindings?.colors ?? {}))
    if (binding.mode === 'factor') out[name] = binding.materials;
  return out;
}

/** The bound material of this JSON, or a refusal when the file is not the one that was classified. */
function boundMaterial(
  materials: Record<string, unknown>[],
  bound: BoundMaterialV1,
): Record<string, unknown> {
  const material = materials[bound.index];
  if (!material || (bound.name !== undefined && material.name !== bound.name))
    throw new Error(
      `This GLB has no material ${bound.name ?? `at index ${bound.index}`} where its parameter record expects one.`,
    );
  return material;
}

/**
 * The saved GLB with carried colours set to `values`: the bytes a rebuild at those colours
 * produces, without running the program. Colours a file cannot carry are ignored.
 */
export function recolorGlb(
  bytes: Uint8Array,
  bindings: ParamBindingsV1 | undefined,
  values: Record<string, unknown>,
): Uint8Array {
  const carried = factorColorBindings(bindings);
  const wanted = Object.entries(values).filter(([name]) => Object.hasOwn(carried, name));
  if (!wanted.length) return bytes;
  const { json, jsonEnd } = splitGlb(bytes);
  const materials = materialsOf(json);
  for (const [name, value] of wanted) {
    if (typeof value !== 'string' || !HEX.test(value))
      throw new TypeError(`${name} takes a #rrggbb colour.`);
    const linear = srgbHexToLinear(value);
    for (const bound of carried[name]!) {
      const material = boundMaterial(materials, bound);
      const pbr = isRecord(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : {};
      material.pbrMetallicRoughness = pbr;
      pbr.baseColorFactor = [...linear, baseColor(material)[3]!];
    }
  }
  return joinGlb(bytes, jsonEnd, json);
}

/**
 * Mark each carried colour's materials in glTF JSON as `extras.kilnParamV1`, so a consumer of
 * the file can find what to set. Other extras are kept.
 */
export function tagGltfColorParams(
  json: Record<string, unknown>,
  bindings: ParamBindingsV1 | undefined,
): void {
  const materials = materialsOf(json);
  for (const [name, bound] of Object.entries(factorColorBindings(bindings)))
    for (const entry of bound) {
      const material = boundMaterial(materials, entry);
      const tag: GltfParamTagV1 = { name, type: 'color' };
      material.extras = { ...(isRecord(material.extras) ? material.extras : {}), kilnParamV1: tag };
    }
}

/** Where the tags of a (possibly re-derived) file are: each parameter's materials by index. */
export function taggedColorMaterials(
  json: Record<string, unknown>,
): Record<string, BoundMaterialV1[]> {
  const out: Record<string, BoundMaterialV1[]> = {};
  if (!Array.isArray(json.materials)) return out;
  for (const [index, material] of json.materials.entries()) {
    const tag = isRecord(material) && isRecord(material.extras) ? material.extras.kilnParamV1 : 0;
    if (!isRecord(tag) || tag.type !== 'color' || typeof tag.name !== 'string') continue;
    const name = (material as Record<string, unknown>).name;
    const list = out[tag.name] ?? [];
    list.push({ index, ...(typeof name === 'string' && name ? { name } : {}) });
    out[tag.name] = list;
  }
  return out;
}
