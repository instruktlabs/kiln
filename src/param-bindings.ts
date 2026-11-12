/**
 * What a GLB can carry of a program's declared parameters.
 *
 * A GLB cannot re-run a program, but glTF multiplies a material's base colour factor into the
 * surface, so a `color` parameter that only sets base colour factors can be changed in the
 * file: one value on one material. A `toggle` or `choice` that only shows and hides nodes is
 * `KHR_node_visibility` on those nodes. This module decides both mechanically, by comparing the
 * default build with builds at other values, and applies them: to a GLB's bytes for a viewer,
 * and as material and node tags for an export. Browser-safe; it reads GLB JSON and nothing else.
 */
import type { ParamsDeclarationV1, ParamValue } from './params';

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
  | 'PROBE_FAILED'
  /** The build budget was spent before this parameter. */
  | 'NOT_CLASSIFIED';

/** The colour takes effect only through a rebuild from source. */
export interface RebuildColorBindingV1 {
  mode: 'rebuild';
  reason: ColorRebuildReason;
  detail: string;
}

export type ColorBindingV1 = FactorColorBindingV1 | RebuildColorBindingV1;

/** A value a `toggle` (boolean) or `choice` (option name) parameter takes. */
export type SwitchValue = boolean | string;

export interface BoundNodeV1 {
  /** Index into the saved GLB's `nodes`. */
  index: number;
  /** The node's name, when it has one: how another engine finds it. */
  name?: string;
  /** The parameter values at which the node, and everything under it, is drawn. */
  visibleWhen: SwitchValue[];
}

/** Showing and hiding these nodes reproduces a rebuild at that value. */
export interface VisibilitySwitchBindingV1 {
  mode: 'visibility';
  nodes: BoundNodeV1[];
}

export type SwitchRebuildReason =
  /** Mesh or texture data differs: the option adds, removes or reshapes geometry. */
  | 'DATA_CHANGED'
  /** Something other than node visibility differs. */
  | 'OTHER_VALUES_CHANGED'
  /** No node is shown or hidden by this parameter. */
  | 'NO_NODE'
  /** A node it shows or hides also follows another parameter. */
  | 'SHARED_NODE'
  /** A build at one of its values failed. */
  | 'PROBE_FAILED'
  /** The build budget was spent before this parameter. */
  | 'NOT_CLASSIFIED';

/** The option takes effect only through a rebuild from source. */
export interface RebuildSwitchBindingV1 {
  mode: 'rebuild';
  reason: SwitchRebuildReason;
  detail: string;
}

export type SwitchBindingV1 = VisibilitySwitchBindingV1 | RebuildSwitchBindingV1;

/** Recorded in a saved manifest as `build.paramBindings`; judged at the declared defaults. */
export interface ParamBindingsV1 {
  version: 'kiln.param-bindings.v1';
  colors: Record<string, ColorBindingV1>;
  /** `toggle` and `choice` parameters; absent when the program declares none. */
  switches?: Record<string, SwitchBindingV1>;
}

/** The tag an export writes into `materials[i].extras` (colour) or `nodes[i].extras`. */
export type GltfParamTagV1 =
  | { name: string; type: 'color' }
  | { name: string; type: 'toggle' | 'choice'; visibleWhen: SwitchValue[] };

const NOT_CLASSIFIED_DETAIL =
  'Not classified here: the build budget for classifying parameters was spent. A sweep or an export classifies every parameter.';
const REASONS: readonly ColorRebuildReason[] = [
  'DATA_CHANGED',
  'OTHER_VALUES_CHANGED',
  'DERIVED_COLOR',
  'NO_MATERIAL',
  'PROBE_FAILED',
  'NOT_CLASSIFIED',
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
  NOT_CLASSIFIED: NOT_CLASSIFIED_DETAIL,
};
const SWITCH_DETAIL: Record<SwitchRebuildReason, string> = {
  DATA_CHANGED:
    'The option adds, removes or reshapes geometry. To make it settable in the GLB, always build the part and set its `visible` from the parameter.',
  OTHER_VALUES_CHANGED:
    'The option changes more than which nodes are drawn, so a GLB cannot carry it as node visibility.',
  NO_NODE: 'No node is shown or hidden by this parameter at the default values of the others.',
  SHARED_NODE:
    'A node this parameter shows or hides also follows another parameter. Give each parameter its own node to make both settable in the GLB.',
  PROBE_FAILED: 'A build at one of its values failed, so this parameter was not classified.',
  NOT_CLASSIFIED: NOT_CLASSIFIED_DETAIL,
};
const SWITCH_REASONS = Object.keys(SWITCH_DETAIL) as SwitchRebuildReason[];
const VISIBILITY = 'KHR_node_visibility';
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

const nodesOf = (json: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(json.nodes) ? (json.nodes.filter(isRecord) as Record<string, unknown>[]) : [];

/** True when the node carries `KHR_node_visibility` `{ visible: false }`. */
function hiddenNode(node: Record<string, unknown>): boolean {
  const extension = isRecord(node.extensions) ? node.extensions[VISIBILITY] : undefined;
  return isRecord(extension) && extension.visible === false;
}

function setNodeHidden(node: Record<string, unknown>, hidden: boolean): void {
  const extensions = isRecord(node.extensions) ? { ...node.extensions } : {};
  if (hidden) extensions[VISIBILITY] = { visible: false };
  else delete extensions[VISIBILITY];
  if (Object.keys(extensions).length) node.extensions = extensions;
  else delete node.extensions;
}

/** Keep `extensionsUsed` in step with whether any node still carries the extension. */
function syncVisibilityUse(json: Record<string, unknown>): void {
  const used = Array.isArray(json.extensionsUsed)
    ? json.extensionsUsed.filter((name) => name !== VISIBILITY)
    : [];
  if (nodesOf(json).some((node) => isRecord(node.extensions) && VISIBILITY in node.extensions))
    used.push(VISIBILITY);
  if (used.length) json.extensionsUsed = used;
  else delete json.extensionsUsed;
}

/** The JSON with every node's visibility removed, for comparing everything else. */
function withoutVisibility(json: Record<string, unknown>): string {
  const copy = structuredClone(json);
  for (const node of nodesOf(copy)) setNodeHidden(node, false);
  syncVisibilityUse(copy);
  return JSON.stringify(copy);
}

const rebuildSwitch = (reason: SwitchRebuildReason): RebuildSwitchBindingV1 => ({
  mode: 'rebuild',
  reason,
  detail: SWITCH_DETAIL[reason],
});

/**
 * Compare one build per value of a `toggle` or `choice` parameter, the default build first.
 * The parameter is carried by the file only when the builds differ in nothing but which nodes
 * are hidden; each node whose visibility changes is bound with the values that show it.
 */
export function classifySwitchBinding(
  builds: readonly { value: SwitchValue; glb: Uint8Array }[],
): SwitchBindingV1 {
  const [first, ...others] = builds.map((build) => ({ ...build, ...splitGlb(build.glb) }));
  if (!first) return rebuildSwitch('NO_NODE');
  const binary = first.glb.subarray(first.jsonEnd);
  const rest = withoutVisibility(first.json);
  for (const other of others) {
    if (!sameBytes(binary, other.glb.subarray(other.jsonEnd))) return rebuildSwitch('DATA_CHANGED');
    if (withoutVisibility(other.json) !== rest) return rebuildSwitch('OTHER_VALUES_CHANGED');
  }
  const all = [first, ...others].map((build) => ({
    value: build.value,
    nodes: nodesOf(build.json),
  }));
  const nodes: BoundNodeV1[] = [];
  for (const [index, node] of all[0]!.nodes.entries()) {
    const visibleWhen = all.filter((build) => !hiddenNode(build.nodes[index]!)).map((b) => b.value);
    if (visibleWhen.length === 0 || visibleWhen.length === all.length) continue;
    const name = node.name;
    nodes.push({ index, ...(typeof name === 'string' && name ? { name } : {}), visibleWhen });
  }
  return nodes.length ? { mode: 'visibility', nodes } : rebuildSwitch('NO_NODE');
}

/** The other values of a `toggle` or `choice`, after its default. */
function otherSwitchValues(spec: ParamsDeclarationV1['params'][string]): SwitchValue[] {
  if (spec.type === 'toggle') return [!spec.default];
  if (spec.type === 'choice') return spec.options.filter((option) => option !== spec.default);
  return [];
}

/** Two parameters cannot both drive one node's single visibility flag: neither is carried. */
function refuseSharedNodes(switches: Record<string, SwitchBindingV1>): void {
  const owners = new Map<number, string[]>();
  for (const [name, binding] of Object.entries(switches))
    if (binding.mode === 'visibility')
      for (const node of binding.nodes)
        owners.set(node.index, [...(owners.get(node.index) ?? []), name]);
  for (const names of owners.values())
    if (names.length > 1) for (const name of names) switches[name] = rebuildSwitch('SHARED_NODE');
}

/**
 * Classify every parameter of a declaration that a file could carry, each with the other
 * parameters at their defaults: one probe build per `color`, one build per other value of a
 * `toggle` or `choice`. `maxBuilds` bounds the builds; a parameter it does not reach is
 * `NOT_CLASSIFIED`. Undefined when the declaration has no such parameter.
 */
export async function classifyParamBindings(
  declaration: ParamsDeclarationV1,
  defaultGlb: Uint8Array,
  buildWith: (values: Record<string, ParamValue>) => Promise<Uint8Array>,
  options: { maxBuilds?: number } = {},
): Promise<ParamBindingsV1 | undefined> {
  let budget = options.maxBuilds ?? Number.POSITIVE_INFINITY;
  const colors: Record<string, ColorBindingV1> = {};
  const switches: Record<string, SwitchBindingV1> = {};
  for (const [name, spec] of Object.entries(declaration.params)) {
    if (spec.type === 'color') {
      if (budget < 1) {
        colors[name] = rebuild('NOT_CLASSIFIED');
        continue;
      }
      budget -= 1;
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
    } else if (spec.type === 'toggle' || spec.type === 'choice') {
      const values = otherSwitchValues(spec);
      if (budget < values.length) {
        switches[name] = rebuildSwitch('NOT_CLASSIFIED');
        continue;
      }
      budget -= values.length;
      try {
        const builds = [{ value: spec.default as SwitchValue, glb: defaultGlb }];
        for (const value of values) builds.push({ value, glb: await buildWith({ [name]: value }) });
        switches[name] = classifySwitchBinding(builds);
      } catch {
        switches[name] = rebuildSwitch('PROBE_FAILED');
      }
    }
  }
  refuseSharedNodes(switches);
  const hasSwitches = Object.keys(switches).length > 0;
  if (!Object.keys(colors).length && !hasSwitches) return undefined;
  return { version: 'kiln.param-bindings.v1', colors, ...(hasSwitches ? { switches } : {}) };
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
  if (value.switches !== undefined && !validSwitches(value.switches)) return undefined;
  return value as unknown as ParamBindingsV1;
}

function validSwitches(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 24) return false;
  return entries.every(([name, binding]) => {
    if (!NAME.test(name) || !isRecord(binding)) return false;
    if (binding.mode === 'rebuild')
      return (
        SWITCH_REASONS.includes(binding.reason as SwitchRebuildReason) &&
        typeof binding.detail === 'string' &&
        binding.detail.length <= 400
      );
    const nodes = binding.nodes;
    if (binding.mode !== 'visibility' || !Array.isArray(nodes)) return false;
    return nodes.length > 0 && nodes.length <= 4096 && nodes.every(validBoundNode);
  });
}

function validBoundNode(node: unknown): boolean {
  if (!isRecord(node) || !Number.isInteger(node.index) || (node.index as number) < 0) return false;
  if (node.name !== undefined && (typeof node.name !== 'string' || node.name.length > 200))
    return false;
  const when = node.visibleWhen;
  if (!Array.isArray(when) || !when.length || when.length > 64) return false;
  return when.every(
    (value) => typeof value === 'boolean' || (typeof value === 'string' && value.length <= 200),
  );
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

/** The `toggle` and `choice` parameters a file carries, each with the nodes it shows and hides. */
export function switchBindings(
  bindings: ParamBindingsV1 | undefined,
): Record<string, BoundNodeV1[]> {
  const out: Record<string, BoundNodeV1[]> = {};
  for (const [name, binding] of Object.entries(bindings?.switches ?? {}))
    if (binding.mode === 'visibility') out[name] = binding.nodes;
  return out;
}

/** The bound node of this JSON, or a refusal when the file is not the one that was classified. */
function boundNode(nodes: Record<string, unknown>[], bound: BoundNodeV1): Record<string, unknown> {
  const node = nodes[bound.index];
  if (!node || (bound.name !== undefined && node.name !== bound.name))
    throw new Error(
      `This GLB has no node ${bound.name ?? `at index ${bound.index}`} where its parameter record expects one.`,
    );
  return node;
}

/** The saved GLB with carried switches set to `values`: bound nodes shown or hidden. */
function switchGlb(
  bytes: Uint8Array,
  bindings: ParamBindingsV1 | undefined,
  values: Record<string, unknown>,
): Uint8Array {
  const carried = switchBindings(bindings);
  const wanted = Object.entries(values).filter(([name]) => Object.hasOwn(carried, name));
  if (!wanted.length) return bytes;
  const { json, jsonEnd } = splitGlb(bytes);
  const nodes = nodesOf(json);
  for (const [name, value] of wanted) {
    if (typeof value !== 'boolean' && typeof value !== 'string')
      throw new TypeError(`${name} takes true, false or an option name.`);
    for (const bound of carried[name]!)
      setNodeHidden(boundNode(nodes, bound), !bound.visibleWhen.includes(value));
  }
  syncVisibilityUse(json);
  return joinGlb(bytes, jsonEnd, json);
}

/**
 * The saved GLB with every carried parameter in `values` applied, without running the
 * program: colours as base colour factors, switches as node visibility. The result holds what a
 * rebuild at those values holds. Parameters a file cannot carry are ignored.
 */
export function applyCarriedParams(
  bytes: Uint8Array,
  bindings: ParamBindingsV1 | undefined,
  values: Record<string, unknown>,
): Uint8Array {
  return switchGlb(recolorGlb(bytes, bindings, values), bindings, values);
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

/**
 * Mark everything a file carries in glTF JSON as `extras.kilnParamV1`: each carried colour's
 * materials and each carried switch's nodes, with the values that show the node.
 */
export function tagGltfParams(
  json: Record<string, unknown>,
  bindings: ParamBindingsV1 | undefined,
): void {
  tagGltfColorParams(json, bindings);
  const nodes = nodesOf(json);
  for (const [name, bound] of Object.entries(switchBindings(bindings)))
    for (const entry of bound) {
      const node = boundNode(nodes, entry);
      const tag: GltfParamTagV1 = {
        name,
        type: typeof entry.visibleWhen[0] === 'boolean' ? 'toggle' : 'choice',
        visibleWhen: entry.visibleWhen,
      };
      node.extras = { ...(isRecord(node.extras) ? node.extras : {}), kilnParamV1: tag };
    }
}

/** Where the switch tags of a (possibly re-derived) file are: each parameter's nodes by index. */
export function taggedSwitchNodes(json: Record<string, unknown>): Record<string, BoundNodeV1[]> {
  const out: Record<string, BoundNodeV1[]> = {};
  if (!Array.isArray(json.nodes)) return out;
  for (const [index, node] of json.nodes.entries()) {
    const tag = isRecord(node) && isRecord(node.extras) ? node.extras.kilnParamV1 : 0;
    if (!isRecord(tag) || (tag.type !== 'toggle' && tag.type !== 'choice')) continue;
    if (typeof tag.name !== 'string' || !Array.isArray(tag.visibleWhen)) continue;
    const name = (node as Record<string, unknown>).name;
    const list = out[tag.name] ?? [];
    list.push({
      index,
      ...(typeof name === 'string' && name ? { name } : {}),
      visibleWhen: tag.visibleWhen as SwitchValue[],
    });
    out[tag.name] = list;
  }
  return out;
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

const VARIANTS = 'KHR_materials_variants';

/**
 * Write each preset that only sets colours this file carries as one `KHR_materials_variants`
 * entry: a copy of every bound material at the preset's colour, mapped on each primitive that
 * draws with the bound material. `colors` is where the carried colours are in this JSON
 * (`taggedColorMaterials`). The default materials stay as they are, so a loader without the
 * extension shows the default build. Returns each written preset's variant index and the
 * presets left to a rebuild. Nothing is written unless a preset changes a carried colour, and
 * a file that already has material variants is left as it is.
 */
export function addPresetVariants(
  json: Record<string, unknown>,
  declaration: ParamsDeclarationV1,
  colors: Record<string, BoundMaterialV1[]>,
): { presets: Record<string, number>; rebuild: string[] } {
  const names = Object.keys(declaration.presets ?? {});
  const changedBy = (preset: string) =>
    Object.entries(declaration.presets![preset]!).filter(
      ([name, value]) => value !== declaration.params[name]?.default,
    );
  const carriedPresets = names.filter((preset) =>
    changedBy(preset).every(([name, value]) => Object.hasOwn(colors, name) && HEX.test(`${value}`)),
  );
  const existing = isRecord(json.extensions) && VARIANTS in json.extensions;
  if (existing || !carriedPresets.some((preset) => changedBy(preset).length > 0))
    return {
      presets: {},
      rebuild: existing ? names : names.filter((n) => !carriedPresets.includes(n)),
    };

  const materials = json.materials as Record<string, unknown>[];
  const copies = new Map<string, number>();
  /** material index -> mappings of the variants that replace it. */
  const mappings = new Map<number, { material: number; variants: number[] }[]>();
  for (const [variant, preset] of carriedPresets.entries())
    for (const [name, value] of changedBy(preset))
      for (const bound of colors[name]!) {
        const source = boundMaterial(materials, bound);
        const key = `${bound.index}|${value}`;
        let copy = copies.get(key);
        if (copy === undefined) {
          copy = materials.length;
          copies.set(key, copy);
          materials.push(variantMaterial(source, `${value}`, preset));
        }
        const list = mappings.get(bound.index) ?? [];
        const entry = list.find((mapping) => mapping.material === copy);
        if (entry) entry.variants.push(variant);
        else list.push({ material: copy, variants: [variant] });
        mappings.set(bound.index, list);
      }
  for (const mesh of Array.isArray(json.meshes) ? json.meshes : [])
    for (const primitive of isRecord(mesh) && Array.isArray(mesh.primitives)
      ? mesh.primitives
      : []) {
      const list = isRecord(primitive) ? mappings.get(primitive.material as number) : undefined;
      if (!list) continue;
      primitive.extensions = {
        ...(isRecord(primitive.extensions) ? primitive.extensions : {}),
        [VARIANTS]: { mappings: structuredClone(list) },
      };
    }
  json.extensions = {
    ...(isRecord(json.extensions) ? json.extensions : {}),
    [VARIANTS]: { variants: carriedPresets.map((name) => ({ name })) },
  };
  json.extensionsUsed = [
    ...(Array.isArray(json.extensionsUsed) ? json.extensionsUsed : []).filter(
      (n) => n !== VARIANTS,
    ),
    VARIANTS,
  ];
  return {
    presets: Object.fromEntries(carriedPresets.map((name, index) => [name, index])),
    rebuild: names.filter((name) => !carriedPresets.includes(name)),
  };
}

/** A bound material's copy at a preset colour: same surface, no parameter tag of its own. */
function variantMaterial(
  source: Record<string, unknown>,
  color: string,
  preset: string,
): Record<string, unknown> {
  const copy = structuredClone(source);
  copy.name = `${typeof source.name === 'string' && source.name ? source.name : 'material'}@${preset}`;
  const pbr = isRecord(copy.pbrMetallicRoughness) ? copy.pbrMetallicRoughness : {};
  copy.pbrMetallicRoughness = pbr;
  pbr.baseColorFactor = [...srgbHexToLinear(color), baseColor(source)[3]!];
  if (isRecord(copy.extras)) {
    delete copy.extras.kilnParamV1;
    if (!Object.keys(copy.extras).length) delete copy.extras;
  }
  return copy;
}
