import * as THREE from 'three';

import {
  readSemanticMetadataV1,
  type SemanticQuaternion,
  type SemanticSocketV1,
} from '../contracts';
import type { EnvironmentSocketType } from '../contracts/environment';
import {
  createOrientedProbeBox3,
  probeLocalFrameFromQuaternion,
  probeOrientedPenetration,
  type OrientedProbeBox3,
} from './geometry-relations';
import { conformancePromotionAuthorization, KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

const PROFILE = 'environment.semantic';
const EDGE_HEIGHT_TOLERANCE_METERS = 0.02;
const EDGE_NORMAL_TOLERANCE_DEGREES = 8;
const SOCKET_ALIGNMENT_TOLERANCE_METERS = 0.02;
const GROUND_TOLERANCE_METERS = 0.02;

export {
  ENVIRONMENT_SOCKET_TYPES,
  ENVIRONMENT_SUBTYPES,
  resolveEnvironmentIntentProfile,
  type EnvironmentIntentProfileV1,
  type EnvironmentSocketType,
  type EnvironmentSubtype,
} from '../contracts/environment';

export interface SpatialQaInput {
  scene?: unknown;
  profile?: string;
  tileable?: boolean;
  navigable?: boolean;
  /** Optional asset-local metre thresholds; neutral navigation has no human-size default. */
  navigation?: { minWidth?: number; minHeight?: number };
  groundPlaneY?: number;
}

export interface ResolvedEnvironmentSocketV1 {
  id: string;
  type: string;
  node: string;
  translation: [number, number, number];
  rotation: SemanticQuaternion;
  compatibleTypes: string[];
  allowedRotationsDegrees?: number[];
}

interface LocalPart {
  node: THREE.Object3D;
  roles: readonly string[];
  box?: THREE.Box3;
  orientedBox?: OrientedProbeBox3;
  renderable: boolean;
}

interface BoundarySample {
  bin: number;
  height: number;
  normal: THREE.Vector3;
  material: string;
}

interface EdgePairMeasurements {
  axis: 'x' | 'z';
  source: 'semantic' | 'fallback';
  sampleCoverage: number;
  maximumHeightDelta: number;
  maximumNormalDeltaDegrees: number;
  materialMismatch: boolean;
  socketCrossAxisDelta: number | null;
}

const stable = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

function finding(context: SpatialQaInput, value: Omit<QaFinding, 'profile'>): QaFinding {
  return { ...value, profile: context.profile ?? 'asset.requirements.v1' };
}

function rolesOf(node: THREE.Object3D): readonly string[] {
  return readSemanticMetadataV1(node)?.roles ?? [];
}

function nodePath(root: THREE.Object3D, node: THREE.Object3D): string {
  const names: string[] = [];
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    names.push(cursor.name || cursor.type);
    if (cursor === root) break;
    cursor = cursor.parent;
  }
  return names.reverse().join('/');
}

function transformedBox(source: THREE.Box3, transform: THREE.Matrix4): THREE.Box3 {
  const result = new THREE.Box3();
  for (const x of [source.min.x, source.max.x]) {
    for (const y of [source.min.y, source.max.y]) {
      for (const z of [source.min.z, source.max.z]) {
        result.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(transform));
      }
    }
  }
  return result;
}

function orientedBoxFromLocalBounds(
  root: THREE.Object3D,
  node: THREE.Object3D,
  source: THREE.Box3,
  relative = root.matrixWorld.clone().invert().multiply(node.matrixWorld),
): OrientedProbeBox3 | undefined {
  if (!relative.elements.every(Number.isFinite)) return undefined;
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  relative.decompose(position, rotation, scale);
  const recomposed = new THREE.Matrix4().compose(position, rotation, scale);
  const residual = Math.max(
    ...relative.elements.map((component, index) =>
      Math.abs(component - (recomposed.elements[index] ?? component)),
    ),
  );
  // Non-uniformly scaled rotated ancestors can introduce shear. An OBB built
  // from a lossy decomposition would be unsafe evidence, so leave it unassessed.
  if (residual > 1e-5) return undefined;
  const center = source.getCenter(new THREE.Vector3()).applyMatrix4(relative);
  const sourceHalf = source.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const halfExtents: [number, number, number] = [
    Math.abs(sourceHalf.x * scale.x),
    Math.abs(sourceHalf.y * scale.y),
    Math.abs(sourceHalf.z * scale.z),
  ];
  if (halfExtents.some((extent) => !Number.isFinite(extent) || extent <= 1e-9)) return undefined;
  rotation.normalize();
  return createOrientedProbeBox3({
    id: `${node.name || node.type}:${node.uuid}`,
    frame: probeLocalFrameFromQuaternion(
      `${node.name || node.type}:asset-local`,
      [stable(center.x), stable(center.y), stable(center.z)],
      [rotation.x, rotation.y, rotation.z, rotation.w],
    ),
    halfExtents,
  });
}

function collectParts(root: THREE.Object3D): LocalPart[] {
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  const result: LocalPart[] = [];
  root.traverseVisible((node) => {
    const roles = rolesOf(node);
    const renderable = node instanceof THREE.Mesh;
    let box: THREE.Box3 | undefined;
    let orientedBox: OrientedProbeBox3 | undefined;
    let source: THREE.Box3 | undefined;
    if (renderable && node.geometry instanceof THREE.BufferGeometry) {
      node.geometry.computeBoundingBox();
      if (node.geometry.boundingBox) {
        source = node.geometry.boundingBox;
      }
    } else if (roles.length > 0) {
      source = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5),
      );
    }
    const relative = rootInverse.clone().multiply(node.matrixWorld);
    const count = node instanceof THREE.InstancedMesh ? node.count : 1;
    for (let index = 0; index < count; index++) {
      const transform = relative.clone();
      if (node instanceof THREE.InstancedMesh) {
        const instance = new THREE.Matrix4();
        node.getMatrixAt(index, instance);
        transform.multiply(instance);
      }
      if (source) {
        box = transformedBox(source, transform);
        orientedBox = orientedBoxFromLocalBounds(root, node, source, transform);
      }
      if (box?.isEmpty()) box = undefined;
      result.push({
        node,
        roles,
        ...(box ? { box } : {}),
        ...(orientedBox ? { orientedBox } : {}),
        renderable,
      });
    }
  });
  return result;
}

function quaternionTuple(value: THREE.Quaternion): SemanticQuaternion {
  return [stable(value.x), stable(value.y), stable(value.z), stable(value.w)];
}

function resolveSocket(
  root: THREE.Object3D,
  node: THREE.Object3D,
  socket: SemanticSocketV1,
): ResolvedEnvironmentSocketV1 | undefined {
  const metadata = readSemanticMetadataV1(node);
  const frame = metadata?.frames.find((candidate) => candidate.id === socket.frame);
  if (!frame) return undefined;
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  const point = new THREE.Vector3(...frame.translation)
    .applyMatrix4(node.matrixWorld)
    .applyMatrix4(rootInverse);
  const rootInverseQuaternion = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const rotation = node
    .getWorldQuaternion(new THREE.Quaternion())
    .multiply(new THREE.Quaternion(...frame.rotation))
    .premultiply(rootInverseQuaternion)
    .normalize();
  return {
    id: socket.id,
    type: socket.type,
    node: node.name || node.type,
    translation: [stable(point.x), stable(point.y), stable(point.z)],
    rotation: quaternionTuple(rotation),
    compatibleTypes: [...socket.compatibleTypes],
    ...(socket.allowedRotationsDegrees
      ? { allowedRotationsDegrees: [...socket.allowedRotationsDegrees] }
      : {}),
  };
}

/** Resolve semantic frames in asset-local space for Studio/starter consumers. */
export function resolveEnvironmentSockets(root: THREE.Object3D): ResolvedEnvironmentSocketV1[] {
  const result: ResolvedEnvironmentSocketV1[] = [];
  root.traverseVisible((node) => {
    const metadata = readSemanticMetadataV1(node);
    for (const socket of metadata?.sockets ?? []) {
      if (!socket.type.startsWith('environment.')) continue;
      const resolved = resolveSocket(root, node, socket);
      if (resolved) result.push(resolved);
    }
  });
  return result.sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}

function socketByType(
  sockets: readonly ResolvedEnvironmentSocketV1[],
  type: EnvironmentSocketType,
): ResolvedEnvironmentSocketV1 | undefined {
  return sockets.find((socket) => socket.type === type);
}

const SOCKET_PAIR_CONTRACTS = [
  {
    label: 'X tile axis',
    negative: ['environment.tile.x-negative'],
    positive: ['environment.tile.x-positive'],
  },
  {
    label: 'Z tile axis',
    negative: ['environment.tile.z-negative'],
    positive: ['environment.tile.z-positive'],
  },
  {
    label: 'road join',
    negative: ['environment.road.start'],
    positive: ['environment.road.end'],
  },
  {
    label: 'bridge join',
    negative: ['environment.bridge.start'],
    positive: ['environment.bridge.end'],
  },
  {
    label: 'wall/gate join',
    negative: ['environment.wall.left', 'environment.gate.left'],
    positive: ['environment.wall.right', 'environment.gate.right'],
  },
] as const;

/** Exact socket presence/alignment for trusted environment profiles. */
export function inspectPlacementSockets(context: SpatialQaInput): readonly QaFinding[] {
  if (!(context.scene instanceof THREE.Object3D)) {
    return [];
  }
  const root = context.scene;
  const sockets = resolveEnvironmentSockets(root);
  const findings: QaFinding[] = [];
  for (const pair of SOCKET_PAIR_CONTRACTS) {
    const declared = [...pair.negative, ...pair.positive].some((type) =>
      sockets.some((socket) => socket.type === type),
    );
    if (!declared) continue;
    for (const side of [pair.negative, pair.positive]) {
      if (side.some((type) => sockets.some((socket) => socket.type === type))) continue;
      findings.push(
        finding(context, {
          code: 'ENV_SOCKET_MISSING',
          disposition: 'block',
          dimension: 'categoryReadiness',
          message: `Declared ${pair.label} is incomplete; its opposite socket is missing.`,
          affected: { node: root.name || 'environment-root' },
          measurement: { name: 'declaredPairSocketCount', actual: 0, expected: 1, threshold: 1 },
          viewHints: ['top', 'generic.top.semantic-overlay'],
          repairText: `Complete the declared ${pair.label} with ${side.join(' or ')} without inventing unrelated axes or joins.`,
        }),
      );
    }
  }
  for (const axis of ['x', 'z'] as const) {
    const negative = socketByType(sockets, `environment.tile.${axis}-negative`);
    const positive = socketByType(sockets, `environment.tile.${axis}-positive`);
    if (!negative || !positive) continue;
    const cross = axis === 'x' ? 2 : 0;
    const crossDelta = Math.hypot(
      negative.translation[1] - positive.translation[1],
      negative.translation[cross]! - positive.translation[cross]!,
    );
    if (crossDelta <= SOCKET_ALIGNMENT_TOLERANCE_METERS) continue;
    findings.push(
      finding(context, {
        code: 'ENV_SOCKET_PAIR_MISALIGNED',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message: `Opposing ${axis.toUpperCase()} tile sockets differ by ${crossDelta.toFixed(6)} m in their paired height/cross-axis frame.`,
        affected: { node: positive.node, attribute: positive.id },
        measurement: {
          name: 'socketCrossAxisDelta',
          actual: stable(crossDelta),
          expected: 0,
          threshold: SOCKET_ALIGNMENT_TOLERANCE_METERS,
          unit: 'm',
        },
        viewHints: ['top', 'generic.top.semantic-overlay'],
        repairText: `Align the ${axis}-negative/${axis}-positive socket frames in height and cross-axis offset.`,
      }),
    );
  }
  return findings;
}

function materialSignature(material: THREE.Material | THREE.Material[]): string {
  const values = Array.isArray(material) ? material : [material];
  return values
    .map((value) => {
      const standard = value as THREE.MeshStandardMaterial;
      const color = standard.color?.getHexString?.() ?? 'none';
      return `${value.type}:${value.name}:${color}`;
    })
    .sort()
    .join('|');
}

function boundarySamples(
  root: THREE.Object3D,
  axis: 'x' | 'z',
  side: 'negative' | 'positive',
  bins = 12,
): BoundarySample[] {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const localBounds = new THREE.Box3();
  for (const part of collectParts(root))
    if (part.renderable && part.box) localBounds.union(part.box);
  if (localBounds.isEmpty()) return [];
  const edge = side === 'negative' ? localBounds.min[axis] : localBounds.max[axis];
  const axisExtent = localBounds.max[axis] - localBounds.min[axis];
  const band = Math.max(0.002, axisExtent * 0.005);
  const crossAxis = axis === 'x' ? 'z' : 'x';
  const crossMin = localBounds.min[crossAxis];
  const crossExtent = Math.max(1e-9, localBounds.max[crossAxis] - crossMin);
  const byBin = new Map<number, BoundarySample>();

  root.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BufferGeometry)) return;
    const positions = node.geometry.getAttribute('position');
    if (positions?.itemSize !== 3) return;
    const normals = node.geometry.getAttribute('normal');
    const relative = inverse.clone().multiply(node.matrixWorld);
    const count = node instanceof THREE.InstancedMesh ? node.count : 1;
    for (let instanceIndex = 0; instanceIndex < count; instanceIndex++) {
      const transform = relative.clone();
      if (node instanceof THREE.InstancedMesh) {
        const instance = new THREE.Matrix4();
        node.getMatrixAt(instanceIndex, instance);
        transform.multiply(instance);
      }
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
      const material = materialSignature(node.material);
      for (let index = 0; index < positions.count; index++) {
        const point = new THREE.Vector3(
          positions.getX(index),
          positions.getY(index),
          positions.getZ(index),
        ).applyMatrix4(transform);
        if (Math.abs(point[axis] - edge) > band) continue;
        const t = THREE.MathUtils.clamp((point[crossAxis] - crossMin) / crossExtent, 0, 1);
        const bin = Math.min(bins - 1, Math.floor(t * bins));
        const normal = normals
          ? new THREE.Vector3(normals.getX(index), normals.getY(index), normals.getZ(index))
              .applyMatrix3(normalMatrix)
              .normalize()
          : new THREE.Vector3(0, 1, 0);
        const current = byBin.get(bin);
        if (
          !current ||
          point.y > current.height ||
          (point.y === current.height && normal.y > current.normal.y)
        ) {
          byBin.set(bin, { bin, height: point.y, normal, material });
        }
      }
    }
  });
  return Array.from(byBin.values()).sort((a, b) => a.bin - b.bin);
}

function edgePairMeasurements(
  root: THREE.Object3D,
  axis: 'x' | 'z',
  sockets: readonly ResolvedEnvironmentSocketV1[],
): EdgePairMeasurements {
  const negative = boundarySamples(root, axis, 'negative');
  const positive = boundarySamples(root, axis, 'positive');
  const negativeByBin = new Map(negative.map((sample) => [sample.bin, sample]));
  const pairs = positive.flatMap((sample) => {
    const other = negativeByBin.get(sample.bin);
    return other ? [[other, sample] as const] : [];
  });
  const unionBins = new Set([
    ...negative.map((sample) => sample.bin),
    ...positive.map((sample) => sample.bin),
  ]);
  const maximumHeightDelta = pairs.length
    ? Math.max(...pairs.map(([a, b]) => Math.abs(a.height - b.height)))
    : Number.POSITIVE_INFINITY;
  const maximumNormalDeltaDegrees = pairs.length
    ? Math.max(
        ...pairs.map(([a, b]) =>
          THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(a.normal.dot(b.normal), -1, 1))),
        ),
      )
    : 180;
  const materialMismatch = pairs.some(([a, b]) => a.material !== b.material);
  const negativeSocket = socketByType(sockets, `environment.tile.${axis}-negative`);
  const positiveSocket = socketByType(sockets, `environment.tile.${axis}-positive`);
  const crossIndex = axis === 'x' ? 2 : 0;
  const socketCrossAxisDelta =
    negativeSocket && positiveSocket
      ? Math.hypot(
          negativeSocket.translation[1] - positiveSocket.translation[1],
          negativeSocket.translation[crossIndex]! - positiveSocket.translation[crossIndex]!,
        )
      : null;
  return {
    axis,
    source: negativeSocket && positiveSocket ? 'semantic' : 'fallback',
    sampleCoverage: unionBins.size === 0 ? 0 : pairs.length / unionBins.size,
    maximumHeightDelta: stable(maximumHeightDelta),
    maximumNormalDeltaDegrees: stable(maximumNormalDeltaDegrees),
    materialMismatch,
    socketCrossAxisDelta: socketCrossAxisDelta === null ? null : stable(socketCrossAxisDelta),
  };
}

/** Height/normal/material edge sampling; only fully tagged tiles can block. */
export function inspectTileEdges(context: SpatialQaInput): readonly QaFinding[] {
  if (context.tileable !== true || !(context.scene instanceof THREE.Object3D)) {
    return [];
  }
  const root = context.scene;
  const sockets = resolveEnvironmentSockets(root);
  const findings: QaFinding[] = [];
  for (const axis of ['x', 'z'] as const) {
    const measured = edgePairMeasurements(root, axis, sockets);
    const disposition = measured.source === 'semantic' ? ('block' as const) : ('warn' as const);
    if (measured.sampleCoverage < 0.5) {
      findings.push(
        finding(context, {
          code: 'ENV_TILE_EDGE_EVIDENCE_SPARSE',
          disposition,
          dimension: 'categoryReadiness',
          message: `${axis.toUpperCase()} tile edges share only ${(measured.sampleCoverage * 100).toFixed(1)}% sampled boundary coverage.`,
          affected: { node: root.name || 'environment-root', attribute: `${axis}-edge` },
          measurement: {
            name: 'pairedBoundarySampleCoverage',
            actual: measured.sampleCoverage,
            expected: '>=0.5',
            threshold: 0.5,
            unit: 'ratio',
          },
          viewHints: ['top', 'right'],
          repairText: `Author matching ${axis}-negative/${axis}-positive boundary vertices and semantic tile sockets.`,
        }),
      );
      continue;
    }
    if (measured.maximumHeightDelta > EDGE_HEIGHT_TOLERANCE_METERS) {
      findings.push(
        finding(context, {
          code: 'ENV_TILE_EDGE_HEIGHT_SEAM',
          disposition,
          dimension: 'categoryReadiness',
          message: `${axis.toUpperCase()} tile boundaries differ by ${measured.maximumHeightDelta.toFixed(6)} m.`,
          affected: { node: root.name || 'environment-root', attribute: `${axis}-edge-height` },
          measurement: {
            name: 'maximumBoundaryHeightDelta',
            actual: measured.maximumHeightDelta,
            expected: 0,
            threshold: EDGE_HEIGHT_TOLERANCE_METERS,
            unit: 'm',
          },
          viewHints: ['top', 'right'],
          repairText: `Match the sampled ${axis}-negative/${axis}-positive boundary heights without flattening the tile interior.`,
        }),
      );
    }
    if (measured.maximumNormalDeltaDegrees > EDGE_NORMAL_TOLERANCE_DEGREES) {
      findings.push(
        finding(context, {
          code: 'ENV_TILE_EDGE_NORMAL_SEAM',
          disposition,
          dimension: 'categoryReadiness',
          message: `${axis.toUpperCase()} tile boundary normals differ by ${measured.maximumNormalDeltaDegrees.toFixed(3)} degrees.`,
          affected: { node: root.name || 'environment-root', attribute: `${axis}-edge-normal` },
          measurement: {
            name: 'maximumBoundaryNormalDelta',
            actual: measured.maximumNormalDeltaDegrees,
            expected: 0,
            threshold: EDGE_NORMAL_TOLERANCE_DEGREES,
            unit: 'deg',
          },
          viewHints: ['top', 'three-quarter'],
          repairText: `Align the ${axis}-edge vertex normals while preserving intentional interior shading.`,
        }),
      );
    }
    if (measured.materialMismatch) {
      findings.push(
        finding(context, {
          code: 'ENV_TILE_EDGE_MATERIAL_SEAM',
          disposition,
          dimension: 'visualQuality',
          message: `${axis.toUpperCase()} tile boundaries use different material signatures.`,
          affected: { node: root.name || 'environment-root', attribute: `${axis}-edge-material` },
          measurement: { name: 'boundaryMaterialMismatch', actual: true, expected: false },
          viewHints: ['top', 'three-quarter'],
          repairText: `Use the same portable PBR material role on both ${axis} boundary samples.`,
        }),
      );
    }
  }
  return findings;
}

function isCorridor(part: LocalPart): boolean {
  return part.roles.some((role) => /^environment\.(?:navigation\.)?corridor(?:\.|$)/.test(role));
}

/** Blocker bounds and explicitly supplied advisory dimensions for authored corridor prisms. */
export function inspectNavigationClearance(context: SpatialQaInput): readonly QaFinding[] {
  if (context.navigable !== true || !(context.scene instanceof THREE.Object3D)) {
    return [];
  }
  const root = context.scene;
  const parts = collectParts(root);
  const corridors = parts.filter((part) => isCorridor(part));
  if (corridors.length === 0) {
    return [
      finding(context, {
        code: 'ENV_NAV_CLEARANCE_UNASSESSED',
        disposition: 'warn',
        dimension: 'categoryReadiness',
        message:
          'navigable=true has no measurable semantic corridor prism; geometry inference cannot hard-gate traversal.',
        affected: { node: root.name || 'environment-root' },
        measurement: { name: 'semanticCorridorCount', actual: 0, expected: '>=1', threshold: 1 },
        viewHints: ['top', 'right'],
        repairText:
          'Add a scaled non-rendered environment.navigation.corridor.<id> marker through the intended route.',
      }),
    ];
  }
  const findings: QaFinding[] = [];
  for (const corridor of corridors) {
    if (!corridor.orientedBox) {
      findings.push(
        finding(context, {
          code: 'ENV_NAV_CLEARANCE_UNASSESSED',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: `Traversal corridor ${corridor.node.name || '(unnamed)'} has a sheared or degenerate transform that cannot be measured safely.`,
          affected: {
            node: corridor.node.name || 'navigation-corridor',
            nodePath: nodePath(root, corridor.node),
          },
          measurement: { name: 'orientedCorridorEvidence', actual: false, expected: true },
          viewHints: ['top', 'right'],
          repairText: 'Author the corridor marker with a finite non-sheared local transform.',
        }),
      );
      continue;
    }
    const width = Math.min(
      corridor.orientedBox.halfExtents[0] * 2,
      corridor.orientedBox.halfExtents[2] * 2,
    );
    const height = corridor.orientedBox.halfExtents[1] * 2;
    const { minWidth, minHeight } = context.navigation ?? {};
    if (minWidth !== undefined && width + 1e-6 < minWidth) {
      findings.push(
        finding(context, {
          code: 'ENV_NAV_CORRIDOR_TOO_NARROW',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: `Traversal corridor ${corridor.node.name || '(unnamed)'} is only ${width.toFixed(4)} m wide.`,
          affected: {
            node: corridor.node.name || 'navigation-corridor',
            nodePath: nodePath(root, corridor.node),
          },
          measurement: {
            name: 'minimumCorridorWidth',
            actual: stable(width),
            expected: `>=${minWidth}`,
            threshold: minWidth,
            unit: 'm',
          },
          viewHints: ['top', 'right'],
          repairText: `Widen only the declared corridor to at least ${minWidth} m while preserving surrounding structure.`,
        }),
      );
    }
    if (minHeight !== undefined && height + 1e-6 < minHeight) {
      findings.push(
        finding(context, {
          code: 'ENV_NAV_HEADROOM_TOO_LOW',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: `Traversal corridor ${corridor.node.name || '(unnamed)'} has only ${height.toFixed(4)} m headroom.`,
          affected: {
            node: corridor.node.name || 'navigation-corridor',
            nodePath: nodePath(root, corridor.node),
          },
          measurement: {
            name: 'minimumCorridorHeadroom',
            actual: stable(height),
            expected: `>=${minHeight}`,
            threshold: minHeight,
            unit: 'm',
          },
          viewHints: ['right', 'three-quarter'],
          repairText: `Raise or clear only the corridor ceiling to provide at least ${minHeight} m headroom.`,
        }),
      );
    }
    // Support surfaces may touch the prism's bottom, but their names/roles cannot
    // exempt geometry that protrudes into the requested passage.
    const obstacles = parts.filter((part) => part.renderable && part.node !== corridor.node);
    const uncertain = obstacles.find(
      (part) =>
        !part.orientedBox && part.box && corridor.box && part.box.intersectsBox(corridor.box),
    );
    if (uncertain)
      findings.push(
        finding(context, {
          code: 'ENV_NAV_CLEARANCE_UNASSESSED',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: `Potential blocker ${uncertain.node.name || '(unnamed)'} has a sheared or degenerate transform; corridor clearance is unmeasured.`,
          affected: {
            node: uncertain.node.name || 'navigation-blocker',
            nodePath: nodePath(root, uncertain.node),
          },
          measurement: { name: 'orientedBlockerEvidence', actual: false, expected: true },
          repairText:
            'Use measurable non-sheared obstacle geometry or review the unresolved clearance explicitly.',
        }),
      );
    const blocker = obstacles.find(
      (part) =>
        part.orientedBox &&
        !probeOrientedPenetration(part.orientedBox, corridor.orientedBox!, {
          maxDepth: 0,
          tolerance: 0.004,
        }).pass,
    );
    if (blocker) {
      findings.push(
        finding(context, {
          code: 'ENV_NAV_CORRIDOR_BLOCKED',
          disposition: 'block',
          dimension: 'categoryReadiness',
          message: `Traversal corridor ${corridor.node.name || '(unnamed)'} is blocked by ${blocker.node.name || 'an unnamed mesh'}.`,
          affected: {
            node: blocker.node.name || 'navigation-blocker',
            nodePath: nodePath(root, blocker.node),
          },
          measurement: { name: 'corridorBlockerCount', actual: 1, expected: 0, threshold: 0 },
          viewHints: ['top', 'right'],
          repairText:
            'Remove or split only the reported blocker from the declared navigation corridor.',
        }),
      );
    }
  }
  return findings;
}

function horizontalOverlap(a: THREE.Box3, b: THREE.Box3): boolean {
  return a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z;
}

function intentionalGround(part: LocalPart): boolean {
  return part.roles.some(
    (role) =>
      role.startsWith('environment.ground') ||
      role.startsWith('environment.terrain.volume') ||
      role.startsWith('environment.cliff.volume'),
  );
}

function functionalLayer(part: LocalPart): boolean {
  return part.roles.some(
    (role) =>
      role.startsWith('environment.functional') ||
      role.startsWith('environment.layer') ||
      role.startsWith('environment.path') ||
      role.startsWith('environment.road') ||
      role.startsWith('environment.bridge') ||
      role.startsWith('environment.gate'),
  );
}

/** Ground-policy signals are intentionally advisory and separate terrain volume from accidents. */
export function inspectSpatialSupport(context: SpatialQaInput): readonly QaFinding[] {
  if (context.groundPlaneY === undefined || !(context.scene instanceof THREE.Object3D)) {
    return [];
  }
  const root = context.scene;
  const parts = collectParts(root).filter((part) => part.renderable && part.box);
  const findings: QaFinding[] = [];
  for (const part of parts) {
    const box = part.box!;
    if (intentionalGround(part)) continue;
    if (functionalLayer(part) && box.min.y < context.groundPlaneY - GROUND_TOLERANCE_METERS) {
      findings.push(
        finding(context, {
          code: 'ENV_FUNCTIONAL_PART_BURIED',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: `${part.node.name || 'Functional environment part'} is buried ${Math.abs(box.min.y - context.groundPlaneY).toFixed(6)} m below asset-local ground.`,
          affected: {
            node: part.node.name || 'environment-part',
            nodePath: nodePath(root, part.node),
          },
          measurement: {
            name: 'minimumY',
            actual: stable(box.min.y),
            expected: `>=${context.groundPlaneY - GROUND_TOLERANCE_METERS}`,
            threshold: GROUND_TOLERANCE_METERS,
            unit: 'm',
          },
          viewHints: ['right', 'three-quarter'],
        }),
      );
    }
    if (functionalLayer(part) && box.min.y > context.groundPlaneY + GROUND_TOLERANCE_METERS) {
      const supported = parts.some(
        (support) =>
          support !== part &&
          support.box &&
          horizontalOverlap(box, support.box) &&
          Math.abs(support.box.max.y - box.min.y) <= 0.04,
      );
      if (!supported) {
        findings.push(
          finding(context, {
            code: 'ENV_LAYER_UNSUPPORTED',
            disposition: 'warn',
            dimension: 'categoryReadiness',
            message: `${part.node.name || 'Environment layer'} floats without a contacting support.`,
            affected: {
              node: part.node.name || 'environment-layer',
              nodePath: nodePath(root, part.node),
            },
            measurement: { name: 'supportContactCount', actual: 0, expected: '>=1', threshold: 1 },
            viewHints: ['right', 'three-quarter'],
          }),
        );
      }
    }
    const size = box.getSize(new THREE.Vector3());
    if (
      box.min.y < context.groundPlaneY - 0.05 &&
      size.y <= Math.max(0.05, Math.min(size.x, size.z) * 0.03) &&
      Math.max(size.x, size.z) >= 1
    ) {
      findings.push(
        finding(context, {
          code: 'ENV_GROUND_UNDECLARED_SKIRT',
          disposition: 'warn',
          dimension: 'promptAlignment',
          message: `${part.node.name || 'Environment layer'} resembles an undeclared below-ground skirt rather than intentional terrain volume.`,
          affected: {
            node: part.node.name || 'environment-skirt',
            nodePath: nodePath(root, part.node),
          },
          measurement: {
            name: 'skirtThickness',
            actual: stable(size.y),
            expected: 'declared terrain volume or supported layer',
            unit: 'm',
          },
          viewHints: ['right', 'three-quarter'],
        }),
      );
    }
  }
  return findings;
}

/** Old-data conformance adapters; the current runner calls the measurements directly. */
export function evaluateEnvironmentSocketQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'environment') return [];
  return inspectPlacementSockets({
    scene: context.scene,
    profile: context.intent.qaProfile,
    tileable: context.intent.capabilities.includes('tileable'),
    navigable: context.intent.capabilities.includes('navigable'),
    groundPlaneY: 0,
  });
}
export function evaluateEnvironmentTileEdgeQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'environment') return [];
  return inspectTileEdges({
    scene: context.scene,
    profile: context.intent.qaProfile,
    tileable: context.intent.capabilities.includes('tileable'),
    navigable: context.intent.capabilities.includes('navigable'),
    groundPlaneY: 0,
  });
}
export function evaluateEnvironmentNavigabilityQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'environment') return [];
  return inspectNavigationClearance({
    scene: context.scene,
    profile: context.intent.qaProfile,
    tileable: context.intent.capabilities.includes('tileable'),
    navigable: context.intent.capabilities.includes('navigable'),
    navigation: { minWidth: 0.8, minHeight: 1.8 },
    groundPlaneY: 0,
  });
}
export function evaluateEnvironmentGroundQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'environment') return [];
  return inspectSpatialSupport({
    scene: context.scene,
    profile: context.intent.qaProfile,
    tileable: context.intent.capabilities.includes('tileable'),
    navigable: context.intent.capabilities.includes('navigable'),
    groundPlaneY: 0,
  });
}

export const ENVIRONMENT_EXACT_QA_RULE: QaRule = Object.freeze({
  id: 'ENVIRONMENT_EXACT_PROFILE',
  profile: PROFILE,
  scope: { kind: 'category' as const, category: 'environment' as const },
  ruleClass: 'exact',
  owner: KILN_ENGINE_QA_OWNER,
  promotion: conformancePromotionAuthorization(
    'environment-semantic-v1',
    'src/qa/environment.test.ts',
    '3e2b68579323bf7d0b9949b67b9897dd856898fadc2e74345bbe70c4fe5e106a',
  ),
  defaultMode: 'enforce',
  evaluate: (context: QaContext) => [
    ...evaluateEnvironmentSocketQa(context),
    ...evaluateEnvironmentTileEdgeQa(context).filter((value) => value.disposition === 'block'),
    ...evaluateEnvironmentNavigabilityQa(context).filter((value) => value.disposition === 'block'),
  ],
});

export const ENVIRONMENT_ADVISORY_QA_RULE: QaRule = Object.freeze({
  id: 'ENVIRONMENT_ADVISORY_PROFILE',
  profile: 'environment.advisory',
  scope: { kind: 'category' as const, category: 'environment' as const },
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate: (context: QaContext) => [
    ...evaluateEnvironmentTileEdgeQa(context).filter((value) => value.disposition !== 'block'),
    ...evaluateEnvironmentNavigabilityQa(context).filter((value) => value.disposition !== 'block'),
    ...evaluateEnvironmentGroundQa(context),
  ],
});

export const ENVIRONMENT_QA_RULES: readonly QaRule[] = [
  ENVIRONMENT_EXACT_QA_RULE,
  ENVIRONMENT_ADVISORY_QA_RULE,
] as const;
