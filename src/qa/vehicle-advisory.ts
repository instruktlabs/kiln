import * as THREE from 'three';

import { readSemanticMetadataV1 } from '../contracts';
import type { MobilityQaInput, MobilityRequirements } from './vehicle';
import { resolveVehicleWheelAssemblies, type ResolvedWheelAssembly } from '../vehicle';
import {
  createOrientedProbeBox3,
  createProbeLocalFrame3,
  probeOrientedPenetration,
  type OrientedProbeBox3,
  type ProbeVector3,
} from './geometry-relations';
import { KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

const SYMMETRY_RATIO = 0.08;
const PENETRATION_RATIO = 0.25;
const ORIENTATION_RATIO = 1.15;
const TRACK_CONTAINMENT_TOLERANCE = 0.02;
const VEHICLE_VIEWS = [
  'vehicle.underbody',
  'vehicle.wheel-section.right',
  'generic.top.semantic-overlay',
];

function advisory(
  context: MobilityQaInput,
  value: Omit<QaFinding, 'profile' | 'dimension' | 'disposition'>,
): QaFinding {
  return {
    ...value,
    disposition: 'warn',
    dimension: 'categoryReadiness',
    profile: context.profile ?? 'asset.requirements.v1',
    viewHints: value.viewHints ?? [...VEHICLE_VIEWS],
  };
}

function localPoint(inverse: THREE.Matrix4, point: THREE.Vector3): THREE.Vector3 {
  return point.clone().applyMatrix4(inverse);
}

function wheelPairs(
  wheels: readonly ResolvedWheelAssembly[],
): Array<[string, ResolvedWheelAssembly, ResolvedWheelAssembly]> {
  const groups = new Map<string, ResolvedWheelAssembly[]>();
  for (const wheel of wheels) {
    if (!wheel.index) continue;
    const group = groups.get(wheel.index) ?? [];
    group.push(wheel);
    groups.set(wheel.index, group);
  }
  return [...groups.entries()].flatMap(([index, group]) => {
    const left = group.find((wheel) => wheel.side === 'left');
    const right = group.find((wheel) => wheel.side === 'right');
    return left && right ? ([[index, left, right]] as const) : [];
  });
}

function bilateralSymmetryFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  wheels: readonly ResolvedWheelAssembly[],
): QaFinding[] {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const findings: QaFinding[] = [];
  for (const [index, left, right] of wheelPairs(wheels)) {
    const a = localPoint(inverse, left.centerWorld);
    const b = localPoint(inverse, right.centerWorld);
    const centerDelta = Math.hypot(a.x - b.x, a.y - b.y, a.z + b.z);
    const radiusDelta = Math.abs((left.radius ?? 0) - (right.radius ?? 0));
    const widthDelta = Math.abs((left.width ?? 0) - (right.width ?? 0));
    const scale = Math.max(left.radius ?? 0, right.radius ?? 0, 0.25);
    const threshold = Math.max(0.01, scale * SYMMETRY_RATIO);
    const maximum = Math.max(centerDelta, radiusDelta, widthDelta);
    if (maximum <= threshold) continue;
    const measurementName =
      maximum === centerDelta
        ? 'bilateralCenterMirrorDelta'
        : maximum === radiusDelta
          ? 'bilateralRadiusDelta'
          : 'bilateralWidthDelta';
    findings.push(
      advisory(context, {
        code: 'VEH_BILATERAL_SYMMETRY',
        message:
          `Axle ${index} left/right assemblies differ in center, radius, or width ` +
          `(center=${centerDelta.toFixed(6)}, radius=${radiusDelta.toFixed(6)}, width=${widthDelta.toFixed(6)} m).`,
        affected: { node: right.root.name },
        measurement: {
          name: measurementName,
          actual: maximum,
          expected: 0,
          threshold,
          unit: 'm',
        },
      }),
    );
  }
  return findings;
}

function semanticRoles(node: THREE.Object3D): readonly string[] {
  return readSemanticMetadataV1(node)?.roles ?? [];
}

function trackSide(node: THREE.Object3D): 'left' | 'right' | undefined {
  for (const role of semanticRoles(node)) {
    const match = role.match(
      /(?:track\.loop|support\.track|track\.road-wheel)\.(left|right)(?:\.|$)/,
    );
    if (match?.[1] === 'left' || match?.[1] === 'right') return match[1];
  }
  return undefined;
}

function isFender(node: THREE.Object3D): boolean {
  return (
    semanticRoles(node).some((role) => /(?:^|\.)(?:fender|wheel-arch)(?:\.|$)/i.test(role)) ||
    /fender|wheel[ _.-]?arch/i.test(node.name)
  );
}

function isChassisMesh(node: THREE.Object3D): node is THREE.Mesh {
  if (!(node instanceof THREE.Mesh) || isFender(node)) return false;
  return (
    semanticRoles(node).some((role) =>
      /^(?:vehicle\.)?(?:chassis|body|hull)(?:\.|$)/i.test(role),
    ) || /chassis|vehicle[ _.-]?body|fuselage|hull/i.test(node.name)
  );
}

function objectBoundsInFrame(
  object: THREE.Object3D,
  frame: THREE.Object3D,
): THREE.Box3 | undefined {
  object.updateWorldMatrix(true, true);
  frame.updateWorldMatrix(true, false);
  const worldToFrame = frame.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  let found = false;
  object.traverseVisible((part) => {
    if (!(part instanceof THREE.Mesh) || !(part.geometry instanceof THREE.BufferGeometry)) return;
    part.geometry.computeBoundingBox();
    const box = part.geometry.boundingBox;
    if (!box) return;
    const matrix = worldToFrame.clone().multiply(part.matrixWorld);
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
          found = true;
        }
  });
  return found ? bounds : undefined;
}

function tuple(value: THREE.Vector3): ProbeVector3 {
  return [value.x, value.y, value.z];
}

function probeBox(id: string, root: THREE.Object3D, bounds: THREE.Box3): OrientedProbeBox3 {
  root.updateWorldMatrix(true, false);
  const center = bounds.getCenter(new THREE.Vector3()).applyMatrix4(root.matrixWorld);
  const size = bounds.getSize(new THREE.Vector3());
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  root.matrixWorld.decompose(position, quaternion, scale);
  const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
  const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();
  const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  return createOrientedProbeBox3({
    id,
    frame: createProbeLocalFrame3({
      id: `${id}.frame`,
      origin: tuple(center),
      xAxis: tuple(xAxis),
      yAxis: tuple(yAxis),
      zAxis: tuple(zAxis),
    }),
    halfExtents: [
      (size.x * Math.abs(scale.x)) / 2,
      (size.y * Math.abs(scale.y)) / 2,
      (size.z * Math.abs(scale.z)) / 2,
    ],
  });
}

function chassisMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverseVisible((node) => {
    if (isChassisMesh(node)) meshes.push(node);
  });
  return meshes;
}

function penetrationFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  wheels: readonly ResolvedWheelAssembly[],
): QaFinding[] {
  const chassis = chassisMeshes(root);
  const findings: QaFinding[] = [];
  for (const wheel of wheels) {
    if (!wheel.tire || wheel.radius === undefined) continue;
    const tireBounds = objectBoundsInFrame(wheel.tire, root);
    if (!tireBounds) continue;
    const threshold = Math.max(0.02, wheel.radius * PENETRATION_RATIO);
    for (const body of chassis) {
      const bodyBounds = objectBoundsInFrame(body, root);
      if (!bodyBounds) continue;
      const result = probeOrientedPenetration(
        probeBox(`${wheel.id}.tire`, root, tireBounds),
        probeBox(body.name || 'vehicle.chassis', root, bodyBounds),
        { maxDepth: threshold },
      );
      if (result.pass) continue;
      findings.push(
        advisory(context, {
          code: 'VEH_WHEEL_CHASSIS_PENETRATION',
          message:
            `Wheel ${wheel.id} penetrates chassis ${body.name || '(unnamed)'} by ` +
            `${result.measurements.penetrationDepth?.toFixed(6)} m beyond the allowed non-fender overlap.`,
          affected: { node: wheel.tire.name || wheel.root.name },
          measurement: {
            name: 'tireChassisPenetrationDepth',
            actual: result.measurements.penetrationDepth ?? 0,
            expected: 0,
            threshold,
            unit: 'm',
          },
          viewHints: ['vehicle.underbody', 'vehicle.wheel-section.right'],
        }),
      );
    }
  }
  return findings;
}

function wholeAssetBounds(root: THREE.Object3D): THREE.Box3 | undefined {
  return objectBoundsInFrame(root, root);
}

function orientationFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  intent: MobilityRequirements,
): QaFinding[] {
  if (
    intent.subtype === 'fixed-wing' ||
    intent.subtype === 'rotorcraft' ||
    intent.subtype === 'walking' ||
    intent.subtype === 'custom'
  ) {
    return [];
  }
  const bounds = wholeAssetBounds(root);
  if (!bounds) return [];
  const size = bounds.getSize(new THREE.Vector3());
  const ratio = size.z / Math.max(size.x, 1e-9);
  if (ratio <= ORIENTATION_RATIO) return [];
  return [
    advisory(context, {
      code: 'VEH_ORIENTATION_SIDEWAYS',
      message:
        `${intent.subtype ?? 'Mobility assembly'} bounds are Z-dominant despite canonical +X travel ` +
        `(spanX=${size.x.toFixed(6)}, spanZ=${size.z.toFixed(6)} m).`,
      affected: { node: root.name || 'vehicle-root' },
      measurement: {
        name: 'boundsSpanZToSpanX',
        actual: ratio,
        expected: `<=${ORIENTATION_RATIO}`,
        threshold: ORIENTATION_RATIO,
      },
      viewHints: ['generic.top.semantic-overlay', 'vehicle.underbody'],
    }),
  ];
}

function nodePath(root: THREE.Object3D, target: THREE.Object3D): string {
  let found = '';
  const visit = (node: THREE.Object3D, parent: string, index: number): void => {
    if (found) return;
    const segment = `${node.name.trim() || node.type || 'Object3D'}[${index}]`;
    const path = parent ? `${parent}/${segment}` : segment;
    if (node === target) {
      found = path;
      return;
    }
    node.children.forEach((child, childIndex) => {
      visit(child, path, childIndex);
    });
  };
  visit(root, '', 0);
  return found;
}

function weldedBoundaryEdges(root: THREE.Object3D, loop: THREE.Object3D): number | undefined {
  root.updateMatrixWorld(true);
  const inverse = loop.matrixWorld.clone().invert();
  const edges = new Map<string, number>();
  let triangleCount = 0;
  const vertexKey = (point: THREE.Vector3): string =>
    [point.x, point.y, point.z].map((value) => Math.round(value * 1e6)).join(',');
  loop.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BufferGeometry)) return;
    const positions = node.geometry.getAttribute('position');
    if (!positions) return;
    const matrix = inverse.clone().multiply(node.matrixWorld);
    const keys = Array.from({ length: positions.count }, (_, index) =>
      vertexKey(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix)),
    );
    const index = node.geometry.getIndex();
    const indices = index
      ? Array.from(index.array, Number)
      : Array.from({ length: positions.count }, (_, value) => value);
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
      triangleCount++;
      const triangle = [indices[offset]!, indices[offset + 1]!, indices[offset + 2]!];
      for (let edge = 0; edge < 3; edge++) {
        const a = keys[triangle[edge]!]!;
        const b = keys[triangle[(edge + 1) % 3]!]!;
        const id = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(id, (edges.get(id) ?? 0) + 1);
      }
    }
  });
  if (triangleCount === 0) return undefined;
  return [...edges.values()].filter((count) => count === 1).length;
}

function trackProfileFindings(
  context: MobilityQaInput,
  root: THREE.Object3D,
  intent: MobilityRequirements,
): QaFinding[] {
  if (intent.subtype !== 'tracked') return [];
  const loops: THREE.Object3D[] = [];
  const roadWheels: THREE.Object3D[] = [];
  root.traverseVisible((node) => {
    const roles = semanticRoles(node);
    if (
      roles.some((role) => role.startsWith('track.loop.')) ||
      roles.some((role) => role.startsWith('support.track.'))
    ) {
      loops.push(node);
    }
    if (
      roles.some((role) => role.startsWith('track.road-wheel.')) ||
      /road[ _.-]?wheel/i.test(node.name)
    ) {
      roadWheels.push(node);
    }
  });
  if (loops.length === 0) {
    return [
      advisory(context, {
        code: 'VEH_TRACK_LOOP_MISSING',
        message: 'Tracked vehicle exposes no semantic track.loop.* assembly to inspect.',
        affected: { node: root.name || 'vehicle-root' },
        measurement: { name: 'trackLoopCount', actual: 0, expected: '>=1', threshold: 1 },
        viewHints: ['vehicle.underbody', 'generic.right.semantic-overlay'],
      }),
    ];
  }
  const findings: QaFinding[] = [];
  for (const loop of loops) {
    const loopSide = trackSide(loop);
    const declaredClosed = loop.userData['kilnTrackLoopClosed'];
    const boundaryEdges = weldedBoundaryEdges(root, loop);
    if (declaredClosed === false || (boundaryEdges !== undefined && boundaryEdges > 0)) {
      findings.push(
        advisory(context, {
          code: 'VEH_TRACK_LOOP_OPEN',
          message:
            `Track loop ${loop.name || '(unnamed)'} is open ` +
            `(boundary edges ${boundaryEdges ?? 'declared'}).`,
          affected: { node: loop.name || 'track-loop', nodePath: nodePath(root, loop) },
          measurement: {
            name: 'trackLoopBoundaryEdgeCount',
            actual: boundaryEdges ?? 1,
            expected: 0,
            threshold: 0,
          },
          viewHints: ['vehicle.underbody', 'generic.right.wireframe'],
        }),
      );
    }
    const loopBounds = objectBoundsInFrame(loop, root);
    if (!loopBounds) continue;
    const expanded = loopBounds.clone().expandByScalar(TRACK_CONTAINMENT_TOLERANCE);
    for (const roadWheel of roadWheels.filter(
      (candidate) => !loopSide || !trackSide(candidate) || trackSide(candidate) === loopSide,
    )) {
      const wheelBounds = objectBoundsInFrame(roadWheel, root);
      if (!wheelBounds) continue;
      const center = wheelBounds.getCenter(new THREE.Vector3());
      if (expanded.containsPoint(center)) continue;
      const clamped = center.clone().clamp(expanded.min, expanded.max);
      const overflow = center.distanceTo(clamped);
      findings.push(
        advisory(context, {
          code: 'VEH_TRACK_ROAD_WHEEL_ESCAPED',
          message:
            `Road wheel ${roadWheel.name || '(unnamed)'} escapes track loop ` +
            `${loop.name || '(unnamed)'} by ${overflow.toFixed(6)} m.`,
          affected: {
            node: roadWheel.name || 'track-road-wheel',
            nodePath: nodePath(root, roadWheel),
          },
          measurement: {
            name: 'roadWheelTrackContainmentOverflow',
            actual: overflow,
            expected: 0,
            threshold: TRACK_CONTAINMENT_TOLERANCE,
            unit: 'm',
          },
          viewHints: ['vehicle.underbody', 'generic.right.semantic-overlay'],
        }),
      );
    }
  }
  return findings;
}

/** W6 plausibility signals. The policy registry always rewrites them to observe. */
export function inspectMobilityAdvisory(context: MobilityQaInput): QaFinding[] {
  if (!(context.scene instanceof THREE.Object3D)) {
    return [];
  }
  const intent = context.mobility;
  if (!intent) return [];
  const root = context.scene;
  root.updateMatrixWorld(true);
  const wheels = resolveVehicleWheelAssemblies(root);
  return [
    ...bilateralSymmetryFindings(context, root, wheels),
    ...penetrationFindings(context, root, wheels),
    ...orientationFindings(context, root, intent),
    ...trackProfileFindings(context, root, intent),
  ].sort((a, b) =>
    `${a.code}:${a.affected?.nodePath ?? a.affected?.node ?? ''}`.localeCompare(
      `${b.code}:${b.affected?.nodePath ?? b.affected?.node ?? ''}`,
    ),
  );
}

/** Old-data conformance adapter; no category is synthesized by the neutral runner. */
export function evaluateVehicleAdvisoryQa(context: QaContext): QaFinding[] {
  if (context.intent.category !== 'vehicle') return [];
  return inspectMobilityAdvisory({
    scene: context.scene,
    profile: context.intent.qaProfile,
    mobility: context.intent.vehicle,
  });
}

export const VEHICLE_W6_ADVISORY_QA_RULE: QaRule = Object.freeze({
  id: 'VEHICLE_W6_ADVISORY_PROFILE',
  profile: 'vehicle.w6-advisory',
  scope: { kind: 'category' as const, category: 'vehicle' as const },
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate: evaluateVehicleAdvisoryQa,
});
