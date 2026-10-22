/**
 * HOST_VALIDATION_PROFILE (#208): evaluates a host-bound `kiln.validation-profile.v1`
 * on the final GLB. Pure and image-free: it reads glTF data only, never runs host code,
 * and never trusts the pre-export scene or authored metadata.
 */
import type { Accessor, Document, Primitive } from '@gltf-transform/core';
import { createGltfIO } from '../gltf-io';
import { deliveryNodePaths } from '../delivery-inspect';
import {
  MAX_VALIDATION_MATCHES,
  VALIDATION_PROFILE_VERSION,
  type ValidationCheckV1,
  type ValidationProfileV1,
} from '../contracts/validation-profile';
import { conformancePromotionAuthorization, KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaFinding } from './types';

export const HOST_VALIDATION_RULE_ID = 'HOST_VALIDATION_PROFILE';
/** Attribute element reads per profile; O(V) per primitive and assertion. */
export const MAX_VALIDATION_ATTRIBUTE_READS = 4_000_000;
/** Findings kept per check and code before one summary carries the rest as a count. */
export const MAX_VALIDATION_FINDINGS_PER_CODE = 32;
const ENDPOINT_BAND = 0.05;
const GRADIENT_BINS = 16;
const MIN_AXIS_EXTENT = 1e-6;

/**
 * Registry identity only. Final bytes are not part of `QaContext`, so the scene pass never
 * executes this rule; `appendRequirementsFinalQa` evaluates the bound profile instead.
 */
export const HOST_VALIDATION_QA_RULE: QaRule = Object.freeze({
  id: HOST_VALIDATION_RULE_ID,
  profile: 'host.validation-profile',
  scope: { kind: 'universal' as const },
  ruleClass: 'exact' as const,
  owner: KILN_ENGINE_QA_OWNER,
  promotion: conformancePromotionAuthorization(
    'host-validation-profile-v1',
    'src/qa/validation-profile.test.ts',
    'b6b60fcbba0238688cb0d3ef497fa3ed837757422b43207f18fc8cbe0a412ffc',
    KILN_ENGINE_QA_OWNER,
    '2026-10-22T00:00:00.000Z',
    'enforce',
    'cpu-raster:1.3.1',
  ),
  defaultMode: 'enforce' as const,
  evaluate: () => [],
});

/**
 * Whole-name, case-sensitive glob: `*` is any run of characters, `?` exactly one, and every
 * other character is literal. Greedy two-pointer matching with a single resume point never
 * backtracks exponentially; the cost is bounded by name length times pattern length.
 */
export function matchValidationPattern(pattern: string, name: string): boolean {
  const p = Array.from(pattern);
  const s = Array.from(name);
  let pi = 0;
  let si = 0;
  let star = -1;
  let resume = 0;
  while (si < s.length) {
    if (pi < p.length && (p[pi] === '?' || (p[pi] !== '*' && p[pi] === s[si]))) {
      pi++;
      si++;
    } else if (pi < p.length && p[pi] === '*') {
      star = pi++;
      resume = si;
    } else if (star >= 0) {
      pi = star + 1;
      si = ++resume;
    } else return false;
  }
  while (pi < p.length && p[pi] === '*') pi++;
  return pi === p.length;
}

export interface ValidationProfileEvaluationV1 {
  findings: QaFinding[];
  /** False when any matched node or assertion stayed unmeasured; acceptance is then incomplete. */
  complete: boolean;
  metrics: Record<string, number | string | boolean>;
}

export interface ValidationProfileEvaluationOptions {
  maxAttributeReads?: number;
}

type Assertion = 'select' | 'primitives' | 'attributes' | 'gradient' | 'range' | 'material';
type Measured = Omit<NonNullable<QaFinding['measurement']>, 'name'>;

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const AXIS_INDEX = { X: 0, Y: 1, Z: 2 } as const;

function component(accessor: Accessor, index: number, slot: number, element: number[]): number {
  accessor.getElement(index, element);
  return element[slot]!;
}

export function evaluateValidationProfileDocument(
  profile: ValidationProfileV1,
  doc: Document,
  options: ValidationProfileEvaluationOptions = {},
): ValidationProfileEvaluationV1 {
  const disposition = profile.mode === 'enforce' ? 'block' : 'warn';
  const profileName = `${VALIDATION_PROFILE_VERSION}:${profile.profileId}`;
  const budget = options.maxAttributeReads ?? MAX_VALIDATION_ATTRIBUTE_READS;
  const paths = deliveryNodePaths(doc);
  // Default-scene nodes only: lower MSFT_lod levels are not scene children.
  const candidates = [...paths.entries()].filter(([node]) => node.getMesh() !== null);
  const findings: QaFinding[] = [];
  let complete = true;
  let reads = 0;
  let matchedNodes = 0;
  let notMeasured = 0;

  for (const check of profile.checks) {
    const kept = new Map<string, number>();
    const omitted = new Map<
      string,
      {
        count: number;
        assertion: Assertion;
        disposition: QaFinding['disposition'];
      }
    >();
    const push = (
      code: string,
      assertion: Assertion,
      message: string,
      measurement: Measured,
      affected: QaFinding['affected'],
      findingDisposition: QaFinding['disposition'],
    ) =>
      findings.push({
        code,
        disposition: findingDisposition,
        dimension: 'categoryReadiness',
        profile: profileName,
        message: `Host validation check ${check.id}: ${message}`,
        ...(affected ? { affected } : {}),
        measurement: {
          name: `checks.${check.id}.${assertion}`,
          ...measurement,
        },
      });
    const report = (
      code: string,
      assertion: Assertion,
      message: string,
      { affected, measurement }: { affected?: QaFinding['affected']; measurement: Measured },
      findingDisposition: QaFinding['disposition'] = disposition,
    ) => {
      const used = kept.get(code) ?? 0;
      if (used < MAX_VALIDATION_FINDINGS_PER_CODE) {
        kept.set(code, used + 1);
        push(code, assertion, message, measurement, affected, findingDisposition);
        return;
      }
      const entry = omitted.get(code) ?? {
        count: 0,
        assertion,
        disposition: findingDisposition,
      };
      entry.count++;
      omitted.set(code, entry);
    };

    const matched = candidates.filter(([node]) =>
      check.select.names.some((pattern) => matchValidationPattern(pattern, node.getName())),
    );
    const minMatches = check.select.minMatches ?? 1;
    if (
      matched.length < minMatches ||
      (check.select.maxMatches !== undefined && matched.length > check.select.maxMatches)
    ) {
      const expected =
        check.select.maxMatches === undefined
          ? `>= ${minMatches}`
          : minMatches === check.select.maxMatches
            ? `${minMatches}`
            : `${minMatches}..${check.select.maxMatches}`;
      report(
        'HOST_VALIDATION_SELECTOR_UNMATCHED',
        'select',
        `${matched.length} default-scene mesh node(s) match ${JSON.stringify(check.select.names)}; the host expects ${expected}. Node names come from the final GLB.`,
        { measurement: { actual: matched.length, expected } },
      );
    }
    const measured = matched.slice(0, MAX_VALIDATION_MATCHES);
    if (matched.length > measured.length) {
      complete = false;
      report(
        'HOST_VALIDATION_UNMEASURED',
        'select',
        `${matched.length - measured.length} matched node(s) beyond the ${MAX_VALIDATION_MATCHES}-node limit were not measured.`,
        {
          measurement: {
            actual: matched.length,
            threshold: MAX_VALIDATION_MATCHES,
            breakdown: { nodesNotMeasured: matched.length - measured.length },
          },
        },
        'observe',
      );
    }

    for (const [node, nodePath] of measured) {
      const primitives = node.getMesh()!.listPrimitives();
      const cost = primitives.reduce(
        (sum, primitive) =>
          sum +
          (primitive.getAttribute('POSITION')?.getCount() ?? 0) *
            ((check.gradient ? 2 : 0) + (check.range ? 1 : 0)),
        0,
      );
      if (notMeasured > 0 || reads + cost > budget) {
        notMeasured++;
        continue;
      }
      reads += cost;
      matchedNodes++;
      const affected = { node: node.getName(), nodePath };
      if (check.primitives) {
        const limit =
          'exactly' in check.primitives ? check.primitives.exactly : check.primitives.max;
        const fails =
          'exactly' in check.primitives ? primitives.length !== limit : primitives.length > limit;
        if (fails)
          report(
            'HOST_VALIDATION_PRIMITIVE_COUNT',
            'primitives',
            `${node.getName()} has ${primitives.length} primitive(s) in the final GLB; the host expects ${'exactly' in check.primitives ? 'exactly' : 'at most'} ${limit}. Each material group exports as its own primitive.`,
            {
              affected,
              measurement: {
                actual: primitives.length,
                expected: limit,
              },
            },
          );
      }
      primitives.forEach((primitive, index) => {
        const where = `${node.getName()} primitive ${index}`;
        for (const semantic of check.attributes ?? []) {
          if (primitive.getAttribute(semantic)) continue;
          report(
            'HOST_VALIDATION_ATTRIBUTE_MISSING',
            'attributes',
            `${where} has no ${semantic} attribute.`,
            {
              affected: { ...affected, attribute: semantic },
              measurement: { actual: false, expected: true },
            },
          );
        }
        if (check.gradient) {
          const outcome = measureGradient(primitive, check.gradient);
          if (outcome.kind === 'missing')
            report(
              'HOST_VALIDATION_ATTRIBUTE_MISSING',
              'gradient',
              `${where} cannot be measured: ${outcome.reason}.`,
              {
                affected: { ...affected, attribute: outcome.attribute },
                measurement: { actual: false, expected: true },
              },
            );
          else if (outcome.kind === 'unmeasured') {
            complete = false;
            report(
              'HOST_VALIDATION_UNMEASURED',
              'gradient',
              `${where} has no extent along ${check.gradient.axis}; the gradient is unmeasured.`,
              {
                affected: { ...affected, attribute: check.gradient.attribute },
                measurement: { actual: null },
              },
              'observe',
            );
          } else if (outcome.failures.length > 0)
            report(
              'HOST_VALIDATION_ATTRIBUTE_GRADIENT',
              'gradient',
              `${where} ${check.gradient.attribute}[${check.gradient.component}] fails the ${outcome.failures.join(' and ')} test along local ${check.gradient.axis}: ${round(outcome.fromMean)} to ${round(outcome.toMean)}, expected ${check.gradient.from} to ${check.gradient.to} within ${check.gradient.tolerance}.`,
              {
                affected: { ...affected, attribute: check.gradient.attribute },
                measurement: {
                  actual: `${round(outcome.fromMean)}..${round(outcome.toMean)}`,
                  expected: `${check.gradient.from}..${check.gradient.to}`,
                  threshold: check.gradient.tolerance,
                  breakdown: {
                    fromMean: round(outcome.fromMean),
                    toMean: round(outcome.toMean),
                    worstRegression: round(outcome.worstRegression),
                  },
                },
              },
            );
        }
        if (check.range) {
          const accessor = primitive.getAttribute(check.range.attribute);
          if (!accessor || check.range.component >= accessor.getElementSize())
            report(
              'HOST_VALIDATION_ATTRIBUTE_MISSING',
              'range',
              `${where} has no ${check.range.attribute}[${check.range.component}].`,
              {
                affected: { ...affected, attribute: check.range.attribute },
                measurement: { actual: false, expected: true },
              },
            );
          else {
            const element: number[] = [];
            let min = Infinity;
            let max = -Infinity;
            for (let i = 0; i < accessor.getCount(); i++) {
              const value = component(accessor, i, check.range.component, element);
              if (value < min) min = value;
              if (value > max) max = value;
            }
            const { tolerance } = check.range;
            if (
              accessor.getCount() > 0 &&
              (min < check.range.min - tolerance || max > check.range.max + tolerance)
            )
              report(
                'HOST_VALIDATION_ATTRIBUTE_RANGE',
                'range',
                `${where} ${check.range.attribute}[${check.range.component}] spans ${round(min)}..${round(max)}; the host allows ${check.range.min}..${check.range.max} within ${tolerance}.`,
                {
                  affected: { ...affected, attribute: check.range.attribute },
                  measurement: {
                    actual: `${round(min)}..${round(max)}`,
                    expected: `${check.range.min}..${check.range.max}`,
                    threshold: tolerance,
                  },
                },
              );
          }
        }
        if (check.material) {
          const material = primitive.getMaterial();
          // An unnamed material is identified by its glTF materials index.
          const label =
            material?.getName() ||
            (material
              ? `materials[${doc.getRoot().listMaterials().indexOf(material)}]`
              : '(glTF default)');
          const alphaMode = material?.getAlphaMode() ?? 'OPAQUE';
          const doubleSided = material?.getDoubleSided() ?? false;
          if (check.material.alphaMode !== undefined && alphaMode !== check.material.alphaMode)
            report(
              'HOST_VALIDATION_MATERIAL_ALPHA_MODE',
              'material',
              `${where} uses alphaMode ${alphaMode}; the host expects ${check.material.alphaMode}.`,
              {
                affected: { ...affected, material: label },
                measurement: {
                  actual: alphaMode,
                  expected: check.material.alphaMode,
                },
              },
            );
          if (
            check.material.doubleSided !== undefined &&
            doubleSided !== check.material.doubleSided
          )
            report(
              'HOST_VALIDATION_MATERIAL_DOUBLE_SIDED',
              'material',
              `${where} is ${doubleSided ? 'double-sided' : 'single-sided'}; the host expects ${check.material.doubleSided ? 'double-sided' : 'single-sided'}.`,
              {
                affected: { ...affected, material: label },
                measurement: {
                  actual: doubleSided,
                  expected: check.material.doubleSided,
                },
              },
            );
        }
      });
    }
    for (const [code, entry] of omitted)
      push(
        code,
        entry.assertion,
        `${entry.count} more ${code} finding(s) omitted after the first ${MAX_VALIDATION_FINDINGS_PER_CODE}.`,
        { actual: entry.count, breakdown: { omitted: entry.count } },
        undefined,
        entry.disposition,
      );
  }
  if (notMeasured > 0) {
    complete = false;
    findings.push({
      code: 'HOST_VALIDATION_UNMEASURED',
      disposition: 'observe',
      dimension: 'categoryReadiness',
      profile: profileName,
      message: `Host validation stopped at its ${budget} attribute-read budget; ${notMeasured} matched node(s) were not measured.`,
      measurement: {
        name: 'checks.*.budget',
        actual: reads,
        threshold: budget,
        breakdown: { nodesNotMeasured: notMeasured },
      },
    });
  }
  return {
    findings,
    complete,
    metrics: {
      hostValidationProfile: profileName,
      hostValidationChecks: profile.checks.length,
      hostValidationMatchedNodes: matchedNodes,
      hostValidationAttributeReads: reads,
      hostValidationComplete: complete,
    },
  };
}

type GradientOutcome =
  | { kind: 'missing'; attribute: string; reason: string }
  | { kind: 'unmeasured' }
  | {
      kind: 'measured';
      fromMean: number;
      toMean: number;
      worstRegression: number;
      failures: string[];
    };

/** Straight local-axis gradient: endpoint bands and binned monotonicity (no node transform). */
function measureGradient(
  primitive: Primitive,
  gradient: NonNullable<ValidationCheckV1['gradient']>,
): GradientOutcome {
  const position = primitive.getAttribute('POSITION');
  if (!position)
    return {
      kind: 'missing',
      attribute: 'POSITION',
      reason: 'no POSITION attribute',
    };
  const values = primitive.getAttribute(gradient.attribute);
  if (!values || gradient.component >= values.getElementSize())
    return {
      kind: 'missing',
      attribute: gradient.attribute,
      reason: `no ${gradient.attribute}[${gradient.component}]`,
    };
  const count = Math.min(position.getCount(), values.getCount());
  const axis = AXIS_INDEX[gradient.axis[1] as 'X' | 'Y' | 'Z'];
  const sign = gradient.axis[0] === '-' ? -1 : 1;
  const t = new Float64Array(count);
  const v = new Float64Array(count);
  const element: number[] = [];
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < count; i++) {
    t[i] = sign * component(position, i, axis, element);
    v[i] = component(values, i, gradient.component, element);
    if (t[i]! < tMin) tMin = t[i]!;
    if (t[i]! > tMax) tMax = t[i]!;
  }
  if (!(tMax - tMin >= MIN_AXIS_EXTENT)) return { kind: 'unmeasured' };
  const sums = new Float64Array(GRADIENT_BINS);
  const counts = new Uint32Array(GRADIENT_BINS);
  let fromSum = 0;
  let fromCount = 0;
  let toSum = 0;
  let toCount = 0;
  for (let i = 0; i < count; i++) {
    const s = (t[i]! - tMin) / (tMax - tMin);
    if (s <= ENDPOINT_BAND) {
      fromSum += v[i]!;
      fromCount++;
    }
    if (s >= 1 - ENDPOINT_BAND) {
      toSum += v[i]!;
      toCount++;
    }
    const bin = Math.min(GRADIENT_BINS - 1, Math.floor(s * GRADIENT_BINS));
    sums[bin] = sums[bin]! + v[i]!;
    counts[bin] = counts[bin]! + 1;
  }
  const fromMean = fromSum / fromCount;
  const toMean = toSum / toCount;
  const direction = Math.sign(gradient.to - gradient.from);
  let worstRegression = 0;
  let previous: number | undefined;
  for (let bin = 0; bin < GRADIENT_BINS; bin++) {
    if (counts[bin] === 0) continue;
    const mean = sums[bin]! / counts[bin]!;
    if (previous !== undefined)
      worstRegression = Math.max(worstRegression, (previous - mean) * direction);
    previous = mean;
  }
  const failures: string[] = [];
  if (
    Math.abs(fromMean - gradient.from) > gradient.tolerance ||
    Math.abs(toMean - gradient.to) > gradient.tolerance
  )
    failures.push('endpoints');
  if (gradient.monotonic && worstRegression > gradient.tolerance) failures.push('monotonic');
  return { kind: 'measured', fromMean, toMean, worstRegression, failures };
}

/** Re-open the exact serialized bytes, as the final VFX check does. */
export async function evaluateValidationProfileGlb(
  profile: ValidationProfileV1,
  bytes: Uint8Array,
  options: ValidationProfileEvaluationOptions = {},
): Promise<ValidationProfileEvaluationV1> {
  let doc: Document;
  try {
    doc = await createGltfIO().readBinary(bytes);
  } catch (error) {
    // Unreadable bytes (for example a codec without its decoder) are unmeasured, never a pass.
    const profileName = `${VALIDATION_PROFILE_VERSION}:${profile.profileId}`;
    return {
      findings: [
        {
          code: 'HOST_VALIDATION_UNMEASURED',
          disposition: 'observe',
          dimension: 'categoryReadiness',
          profile: profileName,
          message: `Host validation could not read the final GLB: ${error instanceof Error ? error.message : String(error)}`,
          measurement: { name: 'checks.*.read', actual: null },
        },
      ],
      complete: false,
      metrics: {
        hostValidationProfile: profileName,
        hostValidationChecks: profile.checks.length,
        hostValidationMatchedNodes: 0,
        hostValidationAttributeReads: 0,
        hostValidationComplete: false,
      },
    };
  }
  return evaluateValidationProfileDocument(profile, doc, options);
}
