import * as THREE from 'three';

import { readSemanticMetadataV1 } from '../contracts';
import type { AssetRequirementsV1 } from '../contracts/requirements';
import {
  hasCanonicalVehicleFront,
  resolveVehicleWheelAssemblies,
  type ResolvedWheelAssembly,
} from '../vehicle';
import { conformancePromotionAuthorization, KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';
import { VEHICLE_W6_ADVISORY_QA_RULE } from './vehicle-advisory';

export type MobilityRequirements = Extract<
  NonNullable<AssetRequirementsV1['requirements']['mobility']>,
  { value: unknown }
>['value'];
export interface MobilityQaInput {
  scene?: unknown;
  profile?: string;
  mobility?: MobilityRequirements;
  groundPlaneY?: number;
}

const PROFILE = 'vehicle.semantic';
const CENTER_RATIO = 0.03;
const CENTER_MINIMUM = 0.01;
const AXIS_TOLERANCE_DEGREES = 1;
const PAIR_TOLERANCE = 0.015;
const CONTACT_TOLERANCE = 0.02;

function finding(
  context: MobilityQaInput,
  value: Omit<QaFinding, 'profile' | 'dimension'>,
): QaFinding {
  return {
    ...value,
    profile: context.profile ?? 'asset.requirements.v1',
    dimension: 'categoryReadiness',
    viewHints: value.viewHints ?? ['vehicle.underbody', 'vehicle.wheel-section'],
  };
}

function localPoint(rootInverse: THREE.Matrix4, value: THREE.Vector3): THREE.Vector3 {
  return value.clone().applyMatrix4(rootInverse);
}

function rootAxis(root: THREE.Object3D, axis: THREE.Vector3): THREE.Vector3 {
  root.updateWorldMatrix(true, false);
  return axis.clone().transformDirection(root.matrixWorld);
}

function angleDegrees(a: THREE.Vector3, b: THREE.Vector3): number {
  return THREE.MathUtils.radToDeg(
    Math.acos(THREE.MathUtils.clamp(a.clone().normalize().dot(b.clone().normalize()), -1, 1)),
  );
}

function isDescendant(node: THREE.Object3D | undefined, ancestor: THREE.Object3D): boolean {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent ?? undefined;
  }
  return false;
}

function componentDisposition(wheel: ResolvedWheelAssembly): 'block' | 'warn' {
  return wheel.source === 'semantic' ? 'block' : 'warn';
}

function wheelCountFindings(
  context: MobilityQaInput,
  intent: MobilityRequirements,
  wheels: readonly ResolvedWheelAssembly[],
): QaFinding[] {
  const findings: QaFinding[] = [];
  if (intent.wheelCount !== undefined && wheels.length !== intent.wheelCount) {
    findings.push(
      finding(context, {
        code: 'VEH_WHEEL_COUNT',
        disposition: 'block',
        message: `Trusted vehicle intent requires ${intent.wheelCount} wheel assemblies; resolved ${wheels.length}.`,
        measurement: {
          name: 'wheelAssemblyCount',
          actual: wheels.length,
          expected: intent.wheelCount,
          threshold: intent.wheelCount,
        },
        repairText:
          'Create exactly the requested number of axle-centered wheel assemblies and remove duplicate or ungrouped wheel parts.',
      }),
    );
  }
  const axleIds = new Set(wheels.map((wheel) => wheel.index).filter(Boolean));
  if (intent.axleCount !== undefined && axleIds.size !== intent.axleCount) {
    findings.push(
      finding(context, {
        code: 'VEH_AXLE_COUNT',
        disposition: 'block',
        message: `Trusted vehicle intent requires ${intent.axleCount} axles; wheel grouping resolved ${axleIds.size}.`,
        measurement: {
          name: 'wheelAxleCount',
          actual: axleIds.size,
          expected: intent.axleCount,
          threshold: intent.axleCount,
        },
      }),
    );
  }
  return findings;
}

function wheelGeometryFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  wheels: readonly ResolvedWheelAssembly[],
): QaFinding[] {
  const findings: QaFinding[] = [];
  const expectedAxle = rootAxis(root, new THREE.Vector3(0, 0, 1));
  for (const wheel of wheels) {
    const disposition = componentDisposition(wheel);
    const centerTolerance = Math.max(CENTER_MINIMUM, (wheel.radius ?? 0) * CENTER_RATIO);
    const pivotInverse = wheel.pivot.matrixWorld.clone().invert();
    const componentCenters = [wheel.tireCenterWorld, wheel.rimCenterWorld, wheel.hubCenterWorld]
      .filter((center): center is THREE.Vector3 => !!center)
      .map((center) => localPoint(pivotInverse, center));
    let centerDelta = 0;
    for (let a = 0; a < componentCenters.length; a++) {
      for (let b = a + 1; b < componentCenters.length; b++) {
        centerDelta = Math.max(centerDelta, componentCenters[a]!.distanceTo(componentCenters[b]!));
      }
    }
    if (!wheel.tire || !wheel.rim || !wheel.hub || centerDelta > centerTolerance) {
      findings.push(
        finding(context, {
          code: 'VEH_WHEEL_CONCENTRICITY',
          disposition,
          message: `Wheel ${wheel.id} tire, rim, and hub must share one axle center.`,
          affected: { node: wheel.root.name },
          measurement: {
            name: 'maximumComponentCenterDelta',
            actual: Number.isFinite(centerDelta) ? centerDelta : null,
            expected: 0,
            threshold: centerTolerance,
            unit: 'm',
          },
          repairText: `Move the tire, rim, and hub of ${wheel.id} to its axle-centered wheel pivot.`,
        }),
      );
    }

    const nested =
      wheel.radius !== undefined &&
      wheel.rimRadius !== undefined &&
      wheel.hubRadius !== undefined &&
      wheel.hubRadius < wheel.rimRadius &&
      wheel.rimRadius < wheel.radius &&
      wheel.rimWidth !== undefined &&
      wheel.hubWidth !== undefined &&
      wheel.width !== undefined &&
      wheel.rimWidth <= wheel.width + 1e-6 &&
      wheel.hubWidth <= wheel.width + 1e-6;
    if (!nested) {
      findings.push(
        finding(context, {
          code: 'VEH_WHEEL_RADIUS',
          disposition,
          message: `Wheel ${wheel.id} must satisfy hub radius < rim radius < tire radius and keep rim/hub widths inside the tire envelope.`,
          affected: { node: wheel.root.name },
          measurement: {
            name: 'nestedRadii',
            actual: false,
            expected: true,
          },
          repairText: `Resize ${wheel.id} so its hub is nested inside its rim and its rim is nested inside its tire.`,
        }),
      );
    }

    const axleAngle = angleDegrees(wheel.spinAxisWorld, expectedAxle);
    if (axleAngle > AXIS_TOLERANCE_DEGREES) {
      findings.push(
        finding(context, {
          code: 'VEH_WHEEL_AXLE_AXIS',
          disposition,
          message: `Wheel ${wheel.id} spin axis must align with vehicle-local +Z.`,
          affected: { node: wheel.pivot.name },
          measurement: {
            name: 'axleAxisAngle',
            actual: axleAngle,
            expected: 0,
            threshold: AXIS_TOLERANCE_DEGREES,
            unit: 'degrees',
          },
          repairText: `Orient ${wheel.pivot.name} so its local +Z is the axle/spin axis.`,
        }),
      );
    }

    const pivotDelta = localPoint(pivotInverse, wheel.pivotCenterWorld).distanceTo(
      localPoint(pivotInverse, wheel.centerWorld),
    );
    const descendants = [wheel.tire, wheel.rim, wheel.hub].every((part) =>
      isDescendant(part, wheel.pivot),
    );
    if (!descendants || pivotDelta > centerTolerance) {
      findings.push(
        finding(context, {
          code: 'VEH_WHEEL_PIVOT',
          disposition,
          message: `Wheel ${wheel.id} pivot must be at the axle center and own every moving component.`,
          affected: { node: wheel.pivot.name },
          measurement: {
            name: 'pivotCenterDelta',
            actual: pivotDelta,
            expected: 0,
            threshold: centerTolerance,
            unit: 'm',
          },
          repairText: `Place ${wheel.pivot.name} at the axle center and parent tire, rim, and hub beneath it.`,
        }),
      );
    }
  }
  return findings;
}

function axlePairFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  wheels: readonly ResolvedWheelAssembly[],
): QaFinding[] {
  root.updateWorldMatrix(true, false);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<string, ResolvedWheelAssembly[]>();
  for (const wheel of wheels) {
    if (!wheel.index) continue;
    const group = groups.get(wheel.index) ?? [];
    group.push(wheel);
    groups.set(wheel.index, group);
  }
  const findings: QaFinding[] = [];
  for (const [index, pair] of groups) {
    const left = pair.find((wheel) => wheel.side === 'left');
    const right = pair.find((wheel) => wheel.side === 'right');
    if (!left || !right) continue;
    const leftCenter = localPoint(inverse, left.centerWorld);
    const rightCenter = localPoint(inverse, right.centerWorld);
    const delta = Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
    if (delta > PAIR_TOLERANCE) {
      findings.push(
        finding(context, {
          code: 'VEH_AXLE_PAIR',
          disposition: left.source === 'semantic' && right.source === 'semantic' ? 'block' : 'warn',
          message: `Axle ${index} left/right wheel centers disagree in vehicle-local X/Y.`,
          affected: { node: right.root.name },
          measurement: {
            name: 'pairedCenterXYDelta',
            actual: delta,
            expected: 0,
            threshold: PAIR_TOLERANCE,
            unit: 'm',
          },
          repairText: `Align both wheels on axle ${index} to the same local X and Y coordinates.`,
        }),
      );
    }
  }
  return findings;
}

function duplicateAssemblyFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  wheels: readonly ResolvedWheelAssembly[],
): QaFinding[] {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const findings: QaFinding[] = [];
  for (let a = 0; a < wheels.length; a++) {
    for (let b = a + 1; b < wheels.length; b++) {
      const left = wheels[a]!;
      const right = wheels[b]!;
      const sameDeclaredCorner =
        left.side !== undefined &&
        left.side === right.side &&
        left.index !== undefined &&
        left.index === right.index;
      const centerDelta = localPoint(inverse, left.centerWorld).distanceTo(
        localPoint(inverse, right.centerWorld),
      );
      const scale = Math.max(left.radius ?? 0, right.radius ?? 0, 0.25);
      const threshold = Math.max(CENTER_MINIMUM, scale * CENTER_RATIO);
      if (!sameDeclaredCorner && centerDelta > threshold) continue;
      const semantic = left.source === 'semantic' && right.source === 'semantic';
      findings.push(
        finding(context, {
          code: 'VEH_DUPLICATE_ASSEMBLY',
          disposition: semantic ? 'block' : 'warn',
          message:
            `Wheel assemblies ${left.id} and ${right.id} resolve to the same ` +
            `${sameDeclaredCorner ? `${left.side}-${left.index} corner` : 'scale-relative center'}.`,
          affected: { node: right.root.name },
          measurement: {
            name: 'duplicateAssemblyCenterDelta',
            actual: centerDelta,
            expected: `>${threshold}`,
            threshold,
            unit: 'm',
          },
          viewHints: [
            'vehicle.underbody',
            'vehicle.wheel-section.right',
            'generic.top.semantic-overlay',
          ],
          repairText: `Remove only duplicate assembly ${right.id} at the reported center; preserve ${left.id} and rebuild the actually missing corner from trusted wheel/axle intent.`,
        }),
      );
    }
  }
  return findings;
}

function contactFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  intent: MobilityRequirements,
  wheels: readonly ResolvedWheelAssembly[],
): QaFinding[] {
  if (intent.supportPolicy !== 'grounded') return [];
  root.updateWorldMatrix(true, false);
  const inverse = root.matrixWorld.clone().invert();
  const findings: QaFinding[] = [];
  for (const wheel of wheels.filter((value) => value.loadBearing)) {
    const center = localPoint(inverse, wheel.centerWorld);
    const contactY = center.y - (wheel.radius ?? 0);
    if (
      wheel.radius === undefined ||
      Math.abs(contactY - (context.groundPlaneY ?? 0)) > CONTACT_TOLERANCE
    ) {
      findings.push(
        finding(context, {
          code: 'VEH_CONTACT_PLANE',
          disposition: componentDisposition(wheel),
          message: `Load-bearing wheel ${wheel.id} must touch the requested ground plane Y=${context.groundPlaneY ?? 0} without floating or burial.`,
          affected: { node: wheel.tire?.name ?? wheel.root.name },
          measurement: {
            name: 'tireContactY',
            actual: wheel.radius === undefined ? null : contactY,
            expected: context.groundPlaneY ?? 0,
            threshold: CONTACT_TOLERANCE,
            unit: 'm',
          },
          repairText: `Set ${wheel.id} axle-center Y to its tire radius plus ${context.groundPlaneY ?? 0} so its contact point meets the requested plane.`,
        }),
      );
    }
  }
  return findings;
}

interface SupportContactMeasurement {
  node: THREE.Object3D;
  contactY: number;
  source: 'contact' | 'support';
}

function renderableMinYInRoot(
  rootInverse: THREE.Matrix4,
  node: THREE.Object3D,
): number | undefined {
  let minimum = Infinity;
  node.traverseVisible((part) => {
    if (!(part instanceof THREE.Mesh) || !(part.geometry instanceof THREE.BufferGeometry)) return;
    part.geometry.computeBoundingBox();
    const bounds = part.geometry.boundingBox;
    if (!bounds) return;
    const matrix = rootInverse.clone().multiply(part.matrixWorld);
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          minimum = Math.min(minimum, new THREE.Vector3(x, y, z).applyMatrix4(matrix).y);
        }
      }
    }
  });
  return Number.isFinite(minimum) ? minimum : undefined;
}

/** Minimal W4 support contact contract. Missing/stability-set policy remains VEH-022;
 *  any declared support/contact that is present must already honor canonical ground Y=0. */
function supportContactFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  intent: MobilityRequirements,
): QaFinding[] {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const explicitContacts: SupportContactMeasurement[] = [];
  const supports: SupportContactMeasurement[] = [];
  root.traverseVisible((node) => {
    const roles = readSemanticMetadataV1(node)?.roles ?? [];
    const isWheelContact = roles.some((role) => role.startsWith('wheel.contact.'));
    if (!isWheelContact && roles.some((role) => role.startsWith('contact.'))) {
      explicitContacts.push({
        node,
        contactY: localPoint(inverse, new THREE.Vector3().setFromMatrixPosition(node.matrixWorld))
          .y,
        source: 'contact',
      });
    }
    if (roles.some((role) => role.startsWith('support.'))) {
      const contactY = renderableMinYInRoot(inverse, node);
      if (contactY !== undefined) supports.push({ node, contactY, source: 'support' });
    }
  });
  const measurements = explicitContacts.length > 0 ? explicitContacts : supports;
  const findings = measurements.flatMap((measurement) => {
    if (
      intent.supportPolicy !== 'grounded' ||
      Math.abs(measurement.contactY - (context.groundPlaneY ?? 0)) <= CONTACT_TOLERANCE
    )
      return [];
    return [
      finding(context, {
        code: 'VEH_CONTACT_PLANE',
        disposition: 'block',
        message: `Load-bearing ${measurement.source} ${measurement.node.name || '(unnamed)'} must touch the requested ground plane Y=${context.groundPlaneY ?? 0} without floating or burial.`,
        affected: { node: measurement.node.name || 'vehicle-support' },
        measurement: {
          name: 'supportContactY',
          actual: measurement.contactY,
          expected: context.groundPlaneY ?? 0,
          threshold: CONTACT_TOLERANCE,
          unit: 'm',
        },
        repairText: `Move ${measurement.node.name || 'the support'} so its declared contact rests at asset-local Y=${context.groundPlaneY ?? 0}.`,
      }),
    ];
  });
  for (const expected of intent.supportAssemblies ?? []) {
    if (expected === 'wheel' && resolveVehicleWheelAssemblies(root).length > 0) continue;
    const matches = [...explicitContacts, ...supports].filter((measurement) =>
      (readSemanticMetadataV1(measurement.node)?.roles ?? []).some(
        (role) =>
          role === `support.${expected}` ||
          role.startsWith(`support.${expected}.`) ||
          role === `contact.${expected}` ||
          role.startsWith(`contact.${expected}.`),
      ),
    );
    if (matches.length > 0) continue;
    findings.push(
      finding(context, {
        code: 'VEH_SUPPORT_SET_MISSING',
        disposition: 'block',
        message: `Requested mobility requires semantic ${expected} supports or contacts.`,
        affected: { node: root.name || 'vehicle-root' },
        measurement: {
          name: `${expected}SupportCount`,
          actual: 0,
          expected: '>=1',
          threshold: 1,
        },
        viewHints: ['vehicle.underbody', 'generic.front.depth-contact'],
        repairText: `Add the requested semantic ${expected} support set.${intent.supportPolicy === 'grounded' ? ` Place its contacts at asset-local Y=${context.groundPlaneY ?? 0}.` : ''}`,
      }),
    );
  }
  if (intent.supportPolicy === 'grounded' && measurements.length > 1) {
    const values = measurements.map((measurement) => measurement.contactY);
    const range = Math.max(...values) - Math.min(...values);
    if (range > CONTACT_TOLERANCE) {
      findings.push(
        finding(context, {
          code: 'VEH_SUPPORT_PLANE',
          disposition: 'block',
          message: `Declared non-wheel supports do not share one stable vehicle-local contact plane.`,
          affected: { node: root.name || 'vehicle-root' },
          measurement: {
            name: 'supportContactPlaneRange',
            actual: range,
            expected: 0,
            threshold: CONTACT_TOLERANCE,
            unit: 'm',
          },
          viewHints: ['vehicle.underbody', 'generic.front.depth-contact'],
          repairText: `Move only the reported supports onto the requested asset-local Y=${context.groundPlaneY ?? 0} plane while preserving their stance.`,
        }),
      );
    }
  }
  return findings;
}

function steeringFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  intent: MobilityRequirements,
  wheels: readonly ResolvedWheelAssembly[],
): QaFinding[] {
  if (intent.steering === undefined || intent.steering === 'none' || wheels.length === 0) return [];
  root.updateWorldMatrix(true, false);
  const inverse = root.matrixWorld.clone().invert();
  const expectedAxis = rootAxis(root, new THREE.Vector3(0, 1, 0));
  const localCenters = wheels.map((wheel) => ({
    wheel,
    center: localPoint(inverse, wheel.centerWorld),
  }));
  const extreme =
    intent.steering === 'rear'
      ? Math.min(...localCenters.map((entry) => entry.center.x))
      : Math.max(...localCenters.map((entry) => entry.center.x));
  const targets =
    intent.steering === 'all'
      ? localCenters
      : localCenters.filter((entry) => Math.abs(entry.center.x - extreme) <= PAIR_TOLERANCE);
  const findings: QaFinding[] = [];
  for (const { wheel } of targets) {
    const steering = wheel.steeringPivot;
    const centerDelta = steering
      ? localPoint(
          inverse,
          new THREE.Vector3().setFromMatrixPosition(steering.matrixWorld),
        ).distanceTo(localPoint(inverse, wheel.centerWorld))
      : Infinity;
    const axisAngle = steering
      ? angleDegrees(
          new THREE.Vector3(0, 1, 0).transformDirection(steering.matrixWorld),
          expectedAxis,
        )
      : Infinity;
    if (
      !steering ||
      !isDescendant(wheel.pivot, steering) ||
      centerDelta > CENTER_MINIMUM ||
      axisAngle > AXIS_TOLERANCE_DEGREES
    ) {
      const axisInvalid = axisAngle > AXIS_TOLERANCE_DEGREES;
      findings.push(
        finding(context, {
          code: 'VEH_STEERING_PIVOT',
          disposition: componentDisposition(wheel),
          message: `Declared steering wheel ${wheel.id} requires a centered +Y steering pivot owning its spin pivot.`,
          affected: { node: steering?.name ?? wheel.pivot.name },
          measurement: {
            name: axisInvalid ? 'steeringAxisAngle' : 'steeringPivotCenterDelta',
            actual: axisInvalid
              ? Number.isFinite(axisAngle)
                ? axisAngle
                : null
              : Number.isFinite(centerDelta)
                ? centerDelta
                : null,
            expected: 0,
            threshold: axisInvalid ? AXIS_TOLERANCE_DEGREES : CENTER_MINIMUM,
            unit: axisInvalid ? 'degrees' : 'm',
          },
          repairText: `Move the steering pivot for ${wheel.id} to the axle center, orient local +Y as steering axis, and parent the wheel spin pivot beneath it.`,
        }),
      );
    }
  }
  return findings;
}

interface PropulsionPart {
  id: string;
  kind: 'rotor' | 'propeller';
  node: THREE.Object3D;
}

function propulsionFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  intent: MobilityRequirements,
): QaFinding[] {
  const expectedKinds = (intent.propulsionAssemblies ?? []).filter(
    (value): value is 'rotor' | 'propeller' => value === 'rotor' || value === 'propeller',
  );
  if (expectedKinds.length === 0) return [];
  const pivots = new Map<string, THREE.Object3D>();
  const components: PropulsionPart[] = [];
  root.traverseVisible((node) => {
    const metadata = readSemanticMetadataV1(node);
    for (const role of metadata?.roles ?? []) {
      if (role.startsWith('propulsion.pivot.'))
        pivots.set(role.slice('propulsion.pivot.'.length), node);
      for (const kind of ['rotor', 'propeller'] as const) {
        if (role.startsWith(`propulsion.${kind}.`)) {
          components.push({ id: role.slice(`propulsion.${kind}.`.length), kind, node });
        }
      }
    }
  });
  const findings: QaFinding[] = [];
  root.updateWorldMatrix(true, false);
  const rootInverse = root.matrixWorld.clone().invert();
  for (const kind of expectedKinds) {
    const candidates = components.filter((part) => part.kind === kind);
    if (candidates.length === 0) {
      findings.push(
        finding(context, {
          code: 'VEH_ROTOR_PIVOT',
          disposition: 'block',
          message: `Trusted vehicle intent requires a semantic ${kind} assembly and centered pivot.`,
          measurement: { name: `${kind}AssemblyCount`, actual: 0, expected: 1, threshold: 1 },
        }),
      );
      continue;
    }
    for (const component of candidates) {
      const pivot = pivots.get(component.id);
      const box = new THREE.Box3().setFromObject(component.node);
      const center = box.isEmpty() ? undefined : box.getCenter(new THREE.Vector3());
      const pivotCenter = pivot
        ? new THREE.Vector3().setFromMatrixPosition(pivot.matrixWorld)
        : undefined;
      const delta =
        center && pivotCenter
          ? localPoint(rootInverse, center).distanceTo(localPoint(rootInverse, pivotCenter))
          : Infinity;
      const frameId = kind === 'rotor' ? 'propulsion-axis.+y' : 'propulsion-axis.+x';
      const axisFrame = readSemanticMetadataV1(pivot ?? component.node)?.frames.find(
        (frame) => frame.id === frameId,
      );
      const canonicalAxis =
        kind === 'rotor' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const axisAngle =
        pivot && axisFrame
          ? angleDegrees(
              canonicalAxis
                .clone()
                .applyQuaternion(new THREE.Quaternion(...axisFrame.rotation))
                .transformDirection(pivot.matrixWorld),
              rootAxis(root, canonicalAxis),
            )
          : Infinity;
      if (
        !pivot ||
        !isDescendant(component.node, pivot) ||
        delta > CENTER_MINIMUM ||
        !axisFrame ||
        axisAngle > AXIS_TOLERANCE_DEGREES
      ) {
        findings.push(
          finding(context, {
            code: 'VEH_ROTOR_PIVOT',
            disposition: 'block',
            message: `${kind} ${component.id} requires a centered owning pivot with ${frameId}.`,
            affected: { node: pivot?.name ?? component.node.name },
            measurement: {
              name:
                axisAngle > AXIS_TOLERANCE_DEGREES
                  ? 'propulsionAxisAngle'
                  : 'propulsionPivotCenterDelta',
              actual:
                axisAngle > AXIS_TOLERANCE_DEGREES
                  ? Number.isFinite(axisAngle)
                    ? axisAngle
                    : null
                  : Number.isFinite(delta)
                    ? delta
                    : null,
              expected: 0,
              threshold:
                axisAngle > AXIS_TOLERANCE_DEGREES ? AXIS_TOLERANCE_DEGREES : CENTER_MINIMUM,
              unit: axisAngle > AXIS_TOLERANCE_DEGREES ? 'degrees' : 'm',
            },
            repairText: `Place the ${kind} pivot at the mast/shaft center, parent the moving geometry beneath it, and declare ${frameId}.`,
          }),
        );
      }
    }
  }
  return findings;
}

export function inspectMobility(context: MobilityQaInput): readonly QaFinding[] {
  if (!(context.scene instanceof THREE.Object3D)) return [];
  const intent = context.mobility;
  if (!intent) return [];
  const root = context.scene;
  root.updateMatrixWorld(true);
  const wheels = resolveVehicleWheelAssemblies(root);
  const findings: QaFinding[] = [];
  if (intent.frontFrame === '+X' && !hasCanonicalVehicleFront(root)) {
    findings.push(
      finding(context, {
        code: 'VEH_FRONT_AXIS',
        disposition: 'block',
        message: 'Generated vehicles must declare the trusted semantic +X front frame.',
        affected: { node: root.name || 'vehicle-root' },
        measurement: { name: 'canonicalFrontDeclared', actual: false, expected: true },
        repairText:
          'Author the vehicle beneath createVehicleFrame() and preserve vehicle.front.+x semantics.',
      }),
    );
  }
  if (intent.wheelCount !== undefined || intent.axleCount !== undefined || wheels.length > 0) {
    findings.push(...wheelCountFindings(context, intent, wheels));
    findings.push(...wheelGeometryFindings(context, root, wheels));
    findings.push(...axlePairFindings(context, root, wheels));
    findings.push(...duplicateAssemblyFindings(context, root, wheels));
    findings.push(...contactFindings(context, root, intent, wheels));
    findings.push(...steeringFindings(context, root, intent, wheels));
  }
  findings.push(...supportContactFindings(context, root, intent));
  findings.push(...propulsionFindings(context, root, intent));
  return findings;
}

/** Old-data conformance adapter; the neutral runner calls inspectMobility directly. */
export function evaluateVehicleQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'vehicle' || !context.intent.vehicle) return [];
  return inspectMobility({
    scene: context.scene,
    profile: context.intent.qaProfile || PROFILE,
    mobility: { ...context.intent.vehicle, frontFrame: '+X' },
  });
}

export const VEHICLE_QA_RULE: QaRule = {
  id: 'VEHICLE_PROFILE',
  profile: PROFILE,
  scope: { kind: 'category', category: 'vehicle' },
  ruleClass: 'exact',
  owner: KILN_ENGINE_QA_OWNER,
  promotion: conformancePromotionAuthorization(
    'vehicle-qa-v1',
    'src/qa/vehicle.test.ts',
    '3dfd250883b2605a4e8e4fded5ed8ded9e891680853af3fca3c5127771db47d7',
  ),
  defaultMode: 'enforce',
  evaluate: (context) =>
    evaluateVehicleQa(context).filter((finding) => finding.disposition === 'block'),
};

/** Name/geometric fallback inference remains observe-only until subtype calibration is frozen. */
export const VEHICLE_ADVISORY_QA_RULE: QaRule = {
  id: 'VEHICLE_ADVISORY_PROFILE',
  profile: 'vehicle.advisory',
  scope: { kind: 'category', category: 'vehicle' },
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate: (context) =>
    evaluateVehicleQa(context).filter((finding) => finding.disposition !== 'block'),
};

export const VEHICLE_QA_RULES: readonly QaRule[] = [
  VEHICLE_QA_RULE,
  VEHICLE_ADVISORY_QA_RULE,
  VEHICLE_W6_ADVISORY_QA_RULE,
] as const;
