/**
 * What the viewer's parameter panel knows without a DOM: the declaration a saved manifest
 * records, the values a control holds, and the request that rebuilds them.
 */
import {
  factorColorBindings,
  switchBindings,
  validateParamBindings,
  type ParamBindingsV1,
} from '../param-bindings';
import {
  changedParamValues,
  validateParamsDeclaration,
  type ParamsDeclarationV1,
  type ParamsInputV1,
  type ParamSpecV1,
  type ParamValue,
} from '../params';

export type ParamValues = Record<string, ParamValue>;

/**
 * The declaration `kiln_save` recorded as `build.params`. A manifest is a file anyone can
 * write, so anything that does not satisfy the declaration's own rules is treated as absent.
 */
export function manifestParams(manifest: {
  build?: { params?: unknown };
}): ParamsDeclarationV1 | undefined {
  return validateParamsDeclaration(manifest.build?.params);
}

export function paramDefaults(declaration: ParamsDeclarationV1): ParamValues {
  const values: ParamValues = {};
  for (const [name, spec] of Object.entries(declaration.params)) values[name] = spec.default;
  return values;
}

/** The defaults with one declared preset laid over them. */
export function presetValues(declaration: ParamsDeclarationV1, preset: string): ParamValues {
  return { ...paramDefaults(declaration), ...(declaration.presets?.[preset] ?? {}) };
}

/** The build request for these values, or undefined when they are the saved default build. */
export function variantInput(
  declaration: ParamsDeclarationV1,
  values: ParamValues,
): ParamsInputV1 | undefined {
  const changed = changedParamValues(declaration, values);
  return Object.keys(changed).length ? { values: changed } : undefined;
}

const whole = (value: number) => Math.abs(value - Math.round(value)) < 1e-9;

/**
 * The step of a range or int slider. A declared step is used when it is the contract (`snap`)
 * or divides the range; otherwise the slider could not reach the maximum, so it steps by a
 * power of ten near a hundredth of the range.
 */
export function controlStep(spec: ParamSpecV1): number {
  if (spec.type !== 'range' && spec.type !== 'int') return 1;
  const span = spec.max - spec.min;
  if (spec.step !== undefined && (spec.snap || whole(span / spec.step))) return spec.step;
  if (spec.type === 'int' || span <= 0) return 1;
  return Number(`1e${Math.floor(Math.log10(span / 100))}`);
}

/** A slider's string position as a value of the parameter: finite, in range, without float noise. */
export function sliderValue(spec: ParamSpecV1, raw: string): number {
  if (spec.type !== 'range' && spec.type !== 'int') throw new TypeError('Not a slider');
  const parsed = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(parsed)) return spec.default;
  const value = Math.min(spec.max, Math.max(spec.min, parsed));
  return spec.type === 'int' ? Math.round(value) : Number(value.toFixed(6));
}

export function valueText(spec: ParamSpecV1, value: ParamValue): string {
  if (spec.type === 'toggle') return value ? 'On' : 'Off';
  if (spec.type === 'range' || spec.type === 'int')
    return `${Number(Number(value).toFixed(6))}${spec.unit ? ` ${spec.unit}` : ''}`;
  return String(value);
}

/** A download name that says which asset and which values, bounded for any filesystem. */
export function variantFileName(
  assetName: string,
  declaration: ParamsDeclarationV1,
  values: ParamValues,
): string {
  const stem =
    assetName.replace(/[^a-z0-9_-]/gi, '-') +
    Object.entries(changedParamValues(declaration, values))
      .map(([name, value]) => `-${name}-${String(value).replace(/[^a-z0-9.]/gi, '')}`)
      .join('');
  return `${stem.slice(0, 116)}.glb`;
}

/**
 * The parameters the saved GLB carries, from the manifest's `build.paramBindings`: colours as
 * material values, toggles and choices as node visibility. Setting one needs no rebuild: the
 * viewer applies it to the saved bytes.
 */
export function carriedParams(
  declaration: ParamsDeclarationV1,
  manifest: { build?: { paramBindings?: unknown } },
): { bindings: ParamBindingsV1 | undefined; names: string[] } {
  const bindings = validateParamBindings(manifest.build?.paramBindings);
  const colours = Object.keys(factorColorBindings(bindings)).filter(
    (name) => declaration.params[name]?.type === 'color',
  );
  const switches = Object.keys(switchBindings(bindings)).filter((name) => {
    const type = declaration.params[name]?.type;
    return type === 'toggle' || type === 'choice';
  });
  return { bindings, names: [...colours, ...switches] };
}

/** Whether these values differ from the defaults in anything but a carried parameter. */
export function needsRebuild(
  declaration: ParamsDeclarationV1,
  carried: readonly string[],
  values: ParamValues,
): boolean {
  return Object.keys(changedParamValues(declaration, values)).some(
    (name) => !carried.includes(name),
  );
}
