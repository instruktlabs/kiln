/**
 * Declared program parameters.
 *
 * `defineParams(spec, { presets? })` is called once, at the top level of a program, and returns
 * the resolved values: the declared defaults, then a named preset, then the values the host
 * passed for this build. A program that receives no host values builds exactly as it would with
 * its defaults written as literals, so declaring parameters never changes an existing asset.
 *
 * The declaration and the values a build used are data. They are validated here, on both sides
 * of the evaluator boundary, and reported as `RenderResult.params`. Nothing in this module reads
 * a scene, and a GLB does not change because a program declares parameters.
 */
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

export const PARAMS_MAX_COUNT = 24;
export const PARAMS_MAX_PRESETS = 16;
export const PARAMS_MAX_OPTIONS = 32;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const RESERVED = new Set(['constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const SEED_MAX = 0xffffffff;
const TEXT_LIMITS = { label: 60, describe: 240, unit: 12 } as const;

export type ParamValue = number | boolean | string;

interface ParamText {
  label?: string;
  describe?: string;
}
export interface RangeParamV1 extends ParamText {
  type: 'range';
  default: number;
  min: number;
  max: number;
  /** A UI hint unless `snap` is true, when a value off the step from `min` is refused. */
  step?: number;
  snap?: boolean;
  unit?: string;
}
export interface IntParamV1 extends ParamText {
  type: 'int';
  default: number;
  min: number;
  max: number;
  step?: number;
  snap?: boolean;
  unit?: string;
}
export interface ToggleParamV1 extends ParamText {
  type: 'toggle';
  default: boolean;
}
export interface ColorParamV1 extends ParamText {
  type: 'color';
  /** `#rrggbb`, lowercase once normalized. */
  default: string;
}
export interface ChoiceParamV1 extends ParamText {
  type: 'choice';
  default: string;
  options: string[];
}
export interface SeedParamV1 extends ParamText {
  type: 'seed';
  /** An integer from 0 to 2^32 - 1. */
  default: number;
}
export type ParamSpecV1 =
  | RangeParamV1
  | IntParamV1
  | ToggleParamV1
  | ColorParamV1
  | ChoiceParamV1
  | SeedParamV1;

export interface ParamsDeclarationV1 {
  schemaVersion: 1;
  params: Record<string, ParamSpecV1>;
  presets?: Record<string, Record<string, ParamValue>>;
}

/** What a host passes for one build. `values` override the preset, which overrides defaults. */
export interface ParamsInputV1 {
  preset?: string;
  values?: Record<string, ParamValue>;
}

/** The declaration a build ran with and every value it resolved. */
export interface ParamsReportV1 {
  version: 'kiln.params.v1';
  declaration: ParamsDeclarationV1;
  preset?: string;
  values: Record<string, ParamValue>;
}

export type ParamIssueCode =
  | 'UNKNOWN_PARAMETER'
  | 'UNKNOWN_PRESET'
  | 'WRONG_TYPE'
  | 'OUT_OF_RANGE'
  | 'OFF_STEP'
  | 'NOT_AN_OPTION';
export interface ParamIssue {
  name: string;
  code: ParamIssueCode;
  detail: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const contract = (detail: string): never => {
  throw new AuthoringDiagnosticError('PARAMS_CONTRACT', `defineParams: ${detail}`);
};
const validName = (name: string): boolean => NAME.test(name) && !RESERVED.has(name);
const visible = (value: string): boolean =>
  [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);

/** Whether `value` sits on the step grid that starts at `min`, within float tolerance. */
function onStep(value: number, min: number, step: number): boolean {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) <= 1e-9 * Math.max(1, Math.abs(steps));
}

/** The reason one value is refused for one parameter, or undefined when it is allowed. */
function valueIssue(name: string, spec: ParamSpecV1, value: unknown): ParamIssue | undefined {
  const issue = (code: ParamIssueCode, detail: string): ParamIssue => ({ name, code, detail });
  switch (spec.type) {
    case 'range':
    case 'int': {
      const integer = spec.type === 'int';
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (integer && !Number.isSafeInteger(value))
      )
        return issue('WRONG_TYPE', `${name} takes ${integer ? 'an integer' : 'a finite number'}.`);
      if (value < spec.min || value > spec.max)
        return issue('OUT_OF_RANGE', `${name} takes ${spec.min} to ${spec.max}, got ${value}.`);
      if (spec.snap && spec.step !== undefined && !onStep(value, spec.min, spec.step))
        return issue(
          'OFF_STEP',
          `${name} takes ${spec.min} plus a multiple of ${spec.step}, got ${value}.`,
        );
      return undefined;
    }
    case 'toggle':
      return typeof value === 'boolean'
        ? undefined
        : issue('WRONG_TYPE', `${name} takes true or false.`);
    case 'color':
      return typeof value === 'string' && COLOR.test(value)
        ? undefined
        : issue('WRONG_TYPE', `${name} takes a colour written as #rrggbb.`);
    case 'choice':
      if (typeof value !== 'string')
        return issue('WRONG_TYPE', `${name} takes one of its options.`);
      return spec.options.includes(value)
        ? undefined
        : issue('NOT_AN_OPTION', `${name} takes one of: ${spec.options.join(', ')}.`);
    case 'seed':
      return typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= SEED_MAX
        ? undefined
        : issue('WRONG_TYPE', `${name} takes an integer from 0 to ${SEED_MAX}.`);
  }
}

const canonicalValue = (spec: ParamSpecV1, value: ParamValue): ParamValue =>
  spec.type === 'color' ? (value as string).toLowerCase() : value;

function text(name: string, entry: Record<string, unknown>, out: Record<string, unknown>): void {
  for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
    const value = entry[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.length || value.length > limit || !visible(value))
      contract(`${name}.${key} must be 1 to ${limit} visible characters.`);
    out[key] = value;
  }
}

const FIELDS: Record<ParamSpecV1['type'], readonly string[]> = {
  range: ['type', 'default', 'min', 'max', 'step', 'snap', 'unit', 'label', 'describe'],
  int: ['type', 'default', 'min', 'max', 'step', 'snap', 'unit', 'label', 'describe'],
  toggle: ['type', 'default', 'label', 'describe'],
  color: ['type', 'default', 'label', 'describe'],
  choice: ['type', 'default', 'options', 'label', 'describe'],
  seed: ['type', 'default', 'label', 'describe'],
};

function normalizeParam(name: string, entry: unknown): ParamSpecV1 {
  if (!isRecord(entry)) return contract(`${name} must be an object with a type and a default.`);
  const type = entry.type;
  if (typeof type !== 'string' || !Object.hasOwn(FIELDS, type))
    return contract(`${name}.type must be range, int, toggle, color, choice or seed.`);
  const fields = FIELDS[type as ParamSpecV1['type']];
  for (const key of Object.keys(entry)) {
    if (!fields.includes(key)) contract(`${name} has an unsupported field for type ${type}.`);
    if (key === 'unit' && type !== 'range' && type !== 'int')
      contract(`${name}.unit is for numbers.`);
  }
  const out: Record<string, unknown> = { type, default: entry.default };
  if (type === 'range' || type === 'int') {
    const integer = type === 'int';
    for (const key of ['min', 'max'] as const) {
      const value = entry[key];
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (integer && !Number.isSafeInteger(value))
      )
        contract(`${name}.${key} must be ${integer ? 'an integer' : 'a finite number'}.`);
      out[key] = value;
    }
    if ((out.min as number) >= (out.max as number)) contract(`${name}.min must be below max.`);
    if (entry.step !== undefined) {
      const step = entry.step;
      if (
        typeof step !== 'number' ||
        !Number.isFinite(step) ||
        step <= 0 ||
        (integer && !Number.isSafeInteger(step))
      )
        contract(`${name}.step must be a positive ${integer ? 'integer' : 'number'}.`);
      out.step = step;
    }
    if (entry.snap !== undefined) {
      if (typeof entry.snap !== 'boolean') contract(`${name}.snap must be true or false.`);
      if (entry.snap && out.step === undefined) contract(`${name}.snap needs a step.`);
      if (entry.snap) out.snap = true;
    }
  }
  if (type === 'choice') {
    const options = entry.options;
    if (
      !Array.isArray(options) ||
      options.length < 2 ||
      options.length > PARAMS_MAX_OPTIONS ||
      !options.every(
        (o) => typeof o === 'string' && o.length > 0 && o.length <= 60 && visible(o),
      ) ||
      new Set(options).size !== options.length
    )
      contract(
        `${name}.options must be 2 to ${PARAMS_MAX_OPTIONS} distinct strings of at most 60 characters.`,
      );
    out.options = [...(options as string[])];
  }
  text(name, entry, out);
  const spec = out as unknown as ParamSpecV1;
  const bad = valueIssue(name, spec, spec.default);
  if (bad) contract(`the default is refused: ${bad.detail}`);
  spec.default = canonicalValue(spec, spec.default) as never;
  return spec;
}

/** Validate an authored spec into the declaration that is recorded and transported. */
/**
 * A declaration read back from a manifest (`build.params`). A manifest is a file anyone can
 * write, so anything that does not satisfy the declaration's own rules is treated as absent.
 */
export function validateParamsDeclaration(recorded: unknown): ParamsDeclarationV1 | undefined {
  const value = recorded as { schemaVersion?: unknown; params?: unknown; presets?: unknown } | null;
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) return undefined;
  try {
    const declaration = normalizeParamsSpec(
      value.params,
      value.presets === undefined ? undefined : { presets: value.presets },
    );
    return JSON.stringify(declaration) === JSON.stringify(value) ? declaration : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeParamsSpec(spec: unknown, options?: unknown): ParamsDeclarationV1 {
  if (!isRecord(spec)) return contract('the first argument is an object of named parameters.');
  const names = Object.keys(spec);
  if (!names.length || names.length > PARAMS_MAX_COUNT)
    contract(`declare 1 to ${PARAMS_MAX_COUNT} parameters.`);
  const params: Record<string, ParamSpecV1> = {};
  for (const name of names) {
    if (!validName(name))
      contract('a parameter name is a letter followed by up to 39 letters, digits or underscores.');
    params[name] = normalizeParam(name, spec[name]);
  }
  const declaration: ParamsDeclarationV1 = { schemaVersion: 1, params };
  if (options === undefined) return declaration;
  if (!isRecord(options) || Object.keys(options).some((key) => key !== 'presets'))
    return contract('the second argument is { presets }.');
  if (options.presets === undefined) return declaration;
  if (!isRecord(options.presets)) return contract('presets is an object of named value sets.');
  const presetNames = Object.keys(options.presets);
  if (!presetNames.length || presetNames.length > PARAMS_MAX_PRESETS)
    contract(`declare 1 to ${PARAMS_MAX_PRESETS} presets.`);
  const presets: Record<string, Record<string, ParamValue>> = {};
  for (const presetName of presetNames) {
    const values = options.presets[presetName];
    if (!validName(presetName) || !isRecord(values) || !Object.keys(values).length)
      contract('a preset is a named, non-empty object of parameter values.');
    const preset: Record<string, ParamValue> = {};
    for (const [name, value] of Object.entries(values as Record<string, unknown>)) {
      const param = Object.hasOwn(params, name) ? params[name] : undefined;
      if (!param) return contract(`preset ${presetName} names an undeclared parameter.`);
      const bad = valueIssue(name, param, value);
      if (bad) contract(`preset ${presetName} is refused: ${bad.detail}`);
      preset[name] = canonicalValue(param, value as ParamValue);
    }
    presets[presetName] = preset;
  }
  declaration.presets = presets;
  return declaration;
}

/**
 * Bound and type-check host input before it is transported or fingerprinted. This does not
 * know the declaration; {@link checkParamValues} judges the values against it.
 */
export function validateParamsInput(input: unknown): ParamsInputV1 {
  const fail = (): never => {
    throw new TypeError(
      'params must be { preset?: string, values?: { name: number | boolean | string } }.',
    );
  };
  if (!isRecord(input) || Object.keys(input).some((key) => key !== 'preset' && key !== 'values'))
    return fail();
  const out: ParamsInputV1 = {};
  if (input.preset !== undefined) {
    if (typeof input.preset !== 'string' || !validName(input.preset)) fail();
    out.preset = input.preset as string;
  }
  if (input.values !== undefined) {
    if (!isRecord(input.values) || Object.keys(input.values).length > PARAMS_MAX_COUNT)
      return fail();
    const values: Record<string, ParamValue> = {};
    for (const [name, value] of Object.entries(input.values)) {
      const ok =
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 60);
      if (!validName(name) || !ok) fail();
      values[name] = value as ParamValue;
    }
    out.values = values;
  }
  return out;
}

/** Every reason the input is refused for this declaration, in input order. Empty when allowed. */
export function checkParamValues(
  declaration: ParamsDeclarationV1,
  input: ParamsInputV1 | undefined,
): ParamIssue[] {
  const issues: ParamIssue[] = [];
  if (input?.preset !== undefined && !Object.hasOwn(declaration.presets ?? {}, input.preset))
    issues.push({
      name: input.preset,
      code: 'UNKNOWN_PRESET',
      detail: `${input.preset} is not a declared preset. Presets: ${Object.keys(declaration.presets ?? {}).join(', ') || 'none declared'}.`,
    });
  for (const [name, value] of Object.entries(input?.values ?? {})) {
    const spec = Object.hasOwn(declaration.params, name) ? declaration.params[name] : undefined;
    if (!spec) {
      issues.push({
        name,
        code: 'UNKNOWN_PARAMETER',
        detail: `${name} is not a declared parameter. Parameters: ${Object.keys(declaration.params).join(', ')}.`,
      });
      continue;
    }
    const bad = valueIssue(name, spec, value);
    if (bad) issues.push(bad);
  }
  return issues;
}

/** Defaults, then the preset, then the host values. Throws `PARAMS_VALUE` on any refusal. */
export function resolveParams(
  declaration: ParamsDeclarationV1,
  input: ParamsInputV1 | undefined,
): Readonly<Record<string, ParamValue>> {
  const issues = checkParamValues(declaration, input);
  if (issues.length)
    throw new AuthoringDiagnosticError(
      'PARAMS_VALUE',
      `Parameter values were refused: ${issues.map((i) => `${i.name} (${i.code}) ${i.detail}`).join(' ')}`,
    );
  const values: Record<string, ParamValue> = {};
  for (const [name, spec] of Object.entries(declaration.params)) values[name] = spec.default;
  const layers = [
    input?.preset !== undefined ? declaration.presets?.[input.preset] : undefined,
    input?.values,
  ];
  for (const layer of layers)
    for (const [name, value] of Object.entries(layer ?? {}))
      values[name] = canonicalValue(declaration.params[name]!, value);
  return Object.freeze(values);
}

export function paramsReport(
  declaration: ParamsDeclarationV1,
  input: ParamsInputV1 | undefined,
  values: Readonly<Record<string, ParamValue>>,
): ParamsReportV1 {
  return {
    version: 'kiln.params.v1',
    declaration: structuredClone(declaration),
    ...(input?.preset !== undefined ? { preset: input.preset } : {}),
    values: { ...values },
  };
}

/**
 * Check a report that crossed a process boundary: the declaration must satisfy its own rules
 * and every value must be one that declaration allows. Throws on anything else.
 */
export function validateParamsReport(report: unknown): ParamsReportV1 {
  const fail = (): never => {
    throw new TypeError('Invalid kiln.params.v1 report.');
  };
  if (
    !isRecord(report) ||
    report.version !== 'kiln.params.v1' ||
    Object.keys(report).some(
      (key) => !['version', 'declaration', 'preset', 'values'].includes(key),
    ) ||
    !isRecord(report.declaration) ||
    report.declaration.schemaVersion !== 1 ||
    !isRecord(report.values)
  )
    return fail();
  let declaration: ParamsDeclarationV1;
  try {
    declaration = normalizeParamsSpec(
      report.declaration.params,
      report.declaration.presets === undefined
        ? undefined
        : { presets: report.declaration.presets },
    );
  } catch {
    return fail();
  }
  const names = Object.keys(declaration.params);
  const values = report.values as Record<string, ParamValue>;
  if (
    JSON.stringify(declaration) !== JSON.stringify(report.declaration) ||
    Object.keys(values).length !== names.length ||
    !names.every((name) => Object.hasOwn(values, name)) ||
    checkParamValues(declaration, { values }).length ||
    (report.preset !== undefined &&
      (typeof report.preset !== 'string' ||
        !Object.hasOwn(declaration.presets ?? {}, report.preset)))
  )
    return fail();
  return report as unknown as ParamsReportV1;
}

/** The values of a report or input that differ from the declared defaults. */
export function changedParamValues(
  declaration: ParamsDeclarationV1,
  values: Readonly<Record<string, ParamValue>>,
): Record<string, ParamValue> {
  const changed: Record<string, ParamValue> = {};
  for (const [name, value] of Object.entries(values))
    if (declaration.params[name]?.default !== value) changed[name] = value;
  return changed;
}

/** Whether a build used anything other than the declared defaults. */
export const isParamsVariant = (report: ParamsReportV1 | undefined): boolean =>
  report !== undefined &&
  Object.keys(changedParamValues(report.declaration, report.values)).length > 0;

export const PARAMS_SWEEP_MAX_POINTS = 32;
export interface ParamsSweepPoint {
  label: string;
  input: ParamsInputV1;
}

/**
 * The builds that probe a declaration: the defaults, then each parameter moved alone to its
 * minimum and maximum, its other toggle state or each other option, then every preset.
 * Colours and seeds are not swept, and points past `limit` are not built; both are named in
 * `notSwept` so a bounded sweep never reads as a complete one.
 */
export function sweepPoints(
  declaration: ParamsDeclarationV1,
  limit = PARAMS_SWEEP_MAX_POINTS,
): { points: ParamsSweepPoint[]; notSwept: string[] } {
  const all: ParamsSweepPoint[] = [{ label: 'defaults', input: {} }];
  const unswept: string[] = [];
  const one = (name: string, value: ParamValue) =>
    all.push({ label: `${name}=${String(value)}`, input: { values: { [name]: value } } });
  for (const [name, spec] of Object.entries(declaration.params)) {
    if (spec.type === 'range' || spec.type === 'int') {
      if (spec.min !== spec.default) one(name, spec.min);
      if (spec.max !== spec.default) one(name, spec.max);
    } else if (spec.type === 'toggle') one(name, !spec.default);
    else if (spec.type === 'choice') {
      for (const option of spec.options) if (option !== spec.default) one(name, option);
    } else unswept.push(name);
  }
  for (const preset of Object.keys(declaration.presets ?? {}))
    all.push({ label: `preset ${preset}`, input: { preset } });
  return {
    points: all.slice(0, limit),
    notSwept: [...all.slice(limit).map((point) => point.label), ...unswept],
  };
}
