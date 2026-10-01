import * as THREE from 'three';

import {
  readSemanticMetadataV1,
  type AssetIntentV1,
  type VegetationCanopyProfile,
} from '../contracts';
import type { AssetRequirementsV1 } from '../contracts/requirements';
import { conformancePromotionAuthorization, KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

export type FoliageRequirements = Extract<
  NonNullable<AssetRequirementsV1['requirements']['foliage']>,
  { value: unknown }
>['value'];
export interface FoliageQaInput {
  scene?: unknown;
  profile?: string;
  foliage?: FoliageRequirements;
  materialMode?: AssetIntentV1['material']['mode'];
  groundPlaneY?: number;
}
const PROFILE = 'vegetation.semantic';
export const VEGETATION_CONTACT_TOLERANCE_METERS = 0.02;
const RASTER_SIZE = 48;

interface LocalBounds {
  node: THREE.Object3D;
  box: THREE.Box3;
  roles: string[];
  source: 'semantic' | 'fallback';
}

interface VegetationContactMarker {
  node: THREE.Object3D;
  frameTranslation?: readonly [number, number, number];
}

export interface VegetationCanopyMeasurementsV1 {
  schemaVersion: 1;
  profile: VegetationCanopyProfile;
  source: 'semantic' | 'fallback' | 'none';
  canopyNodeCount: number;
  trunkNodeCount: number;
  frontOccupancy: number;
  sideOccupancy: number;
  topOccupancy: number;
  canopyToTrunkVolumeRatio: number | null;
}

export interface VegetationFoliageMaterialMeasurementsV1 {
  schemaVersion: 1;
  mode: AssetIntentV1['material']['mode'];
  foliageNodeCount: number;
  valueRoleCount: number;
  valueRange: number;
  coherent: boolean;
}

export interface VegetationGrowthNodeMeasurementV1 {
  node: string;
  nodePath: string;
  kind: 'trunk' | 'branch';
  source: 'semantic' | 'fallback';
  lengthMeters: number;
  baseRadiusMeters: number;
  tipRadiusMeters: number;
  taperRatio: number | null;
  lengthRadiusRatio: number | null;
  expectedTaperRatio: string;
  expectedLengthRadiusRatio: string;
  taperOutlier: boolean;
  lengthRadiusOutlier: boolean;
}

export interface VegetationGrowthMeasurementsV1 {
  schemaVersion: 1;
  subtype: NonNullable<AssetIntentV1['vegetation']>['subtype'];
  source: 'semantic' | 'fallback' | 'mixed' | 'none';
  trunkCount: number;
  branchCount: number;
  nodes: VegetationGrowthNodeMeasurementV1[];
}

export interface VegetationFoliageAttachmentMeasurementV1 {
  node: string;
  nodePath: string;
  source: 'semantic' | 'fallback';
  nearestSupport: string | null;
  gapMeters: number | null;
  thresholdMeters: number;
  detached: boolean;
}

export interface VegetationFoliageAttachmentMeasurementsV1 {
  schemaVersion: 1;
  source: 'semantic' | 'fallback' | 'mixed' | 'none';
  supportNodeCount: number;
  foliageClusterCount: number;
  clusters: VegetationFoliageAttachmentMeasurementV1[];
}

export interface VegetationRepetitionMeasurementsV1 {
  schemaVersion: 1;
  source: 'semantic' | 'fallback' | 'mixed' | 'none';
  clusterCount: number;
  identicalTransformGroups: Array<{ signature: string; nodes: string[] }>;
  radialGapRangeRadians: number | null;
  radialRadiusSpreadRatio: number | null;
  perfectRadialLockstep: boolean;
  suppressedForTopiary: boolean;
}

const stable = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

function rolesOf(node: THREE.Object3D): string[] {
  return readSemanticMetadataV1(node)?.roles ?? [];
}

function pathOf(node: THREE.Object3D, root: THREE.Object3D): string {
  const names: string[] = [];
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    names.push(cursor.name || cursor.type);
    if (cursor === root) break;
    cursor = cursor.parent;
  }
  return names.reverse().join('/');
}

function localPoint(rootInverse: THREE.Matrix4, node: THREE.Object3D): THREE.Vector3 {
  return node.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
}

function meshLocalBox(mesh: THREE.Mesh, rootInverse: THREE.Matrix4): THREE.Box3 | undefined {
  if (!(mesh.geometry instanceof THREE.BufferGeometry)) return undefined;
  mesh.geometry.computeBoundingBox();
  const source = mesh.geometry.boundingBox;
  if (!source || source.isEmpty()) return undefined;
  const base = rootInverse.clone().multiply(mesh.matrixWorld);
  const result = new THREE.Box3();
  const count = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
  for (let index = 0; index < count; index++) {
    const transform = base.clone();
    if (mesh instanceof THREE.InstancedMesh) {
      const instance = new THREE.Matrix4();
      mesh.getMatrixAt(index, instance);
      transform.multiply(instance);
    }
    result.union(source.clone().applyMatrix4(transform));
  }
  return result;
}

function collectRenderableBounds(root: THREE.Object3D): LocalBounds[] {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const values: LocalBounds[] = [];
  root.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const box = meshLocalBox(node, inverse);
    if (!box) return;
    const roles = rolesOf(node);
    values.push({ node, box, roles, source: roles.length > 0 ? 'semantic' : 'fallback' });
  });
  return values;
}

function finding(context: FoliageQaInput, value: Omit<QaFinding, 'profile'>): QaFinding {
  return { ...value, profile: context.profile || PROFILE };
}

function vegetationIntent(intent: AssetIntentV1) {
  return intent.category === 'vegetation' ? intent.vegetation : undefined;
}

/** Exact, trusted contact contract. Name/material inference never enters this blocker path. */
export function inspectFoliageContact(context: FoliageQaInput): readonly QaFinding[] {
  const trusted = context.foliage;
  if (!trusted?.grounded || !(context.scene instanceof THREE.Object3D)) return [];
  const planeY = context.groundPlaneY ?? 0;
  const root = context.scene;
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const contacts: VegetationContactMarker[] = [];
  const semanticSupports: THREE.Object3D[] = [];
  root.traverseVisible((node) => {
    const metadata = readSemanticMetadataV1(node);
    const roles = metadata?.roles ?? [];
    if (
      roles.some(
        (role) =>
          role === 'vegetation.contact' ||
          role === 'vegetation.contact.ground' ||
          role === 'contact.ground',
      )
    ) {
      const frame = metadata?.frames.find(
        (value) => value.id === 'ground-contact' || value.id === 'vegetation-ground-contact',
      );
      contacts.push({
        node,
        ...(frame ? { frameTranslation: frame.translation } : {}),
      });
    }
    if (
      roles.some(
        (role) =>
          role === 'vegetation.trunk' ||
          role === 'vegetation.stem' ||
          role === 'vegetation.root' ||
          role === 'vegetation.base' ||
          role.startsWith('vegetation.support.'),
      )
    ) {
      semanticSupports.push(node);
    }
  });
  if (contacts.length === 0) {
    return [
      finding(context, {
        code: 'VEG_CONTACT_MISSING',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message: 'Grounded foliage requires one semantic ground-contact marker.',
        affected: { node: root.name || 'vegetation-root' },
        measurement: { name: 'groundContactCount', actual: 0, expected: '>=1' },
        viewHints: ['right', 'vegetation.base-contact'],
        repairText: `Add a vegetation.contact.ground semantic marker at asset-local Y=${planeY} and seat the plant base on it.`,
      }),
    ];
  }

  const findings: QaFinding[] = [];
  for (const contact of contacts) {
    const contactPoint = contact.frameTranslation
      ? new THREE.Vector3(...contact.frameTranslation)
          .applyMatrix4(contact.node.matrixWorld)
          .applyMatrix4(inverse)
      : localPoint(inverse, contact.node);
    const y = contactPoint.y;
    const offset = y - planeY;
    if (Math.abs(offset) <= VEGETATION_CONTACT_TOLERANCE_METERS) continue;
    const floating = offset > 0;
    findings.push(
      finding(context, {
        code: floating ? 'VEG_CONTACT_FLOATING' : 'VEG_CONTACT_BURIED',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message: `${contact.node.name || 'Vegetation contact'} is ${Math.abs(offset).toFixed(6)} m ${floating ? 'above' : 'below'} asset-local ground.`,
        affected: {
          node: contact.node.name || 'vegetation-contact',
          nodePath: pathOf(contact.node, root),
        },
        measurement: {
          name: 'contactY',
          actual: stable(y),
          expected: planeY,
          threshold: VEGETATION_CONTACT_TOLERANCE_METERS,
          unit: 'm',
        },
        viewHints: ['right', 'vegetation.base-contact'],
        repairText: `Move ${contact.node.name || 'the contact marker'} or its ground-contact frame to asset-local Y=${planeY} without moving unrelated canopy parts.`,
      }),
    );
  }

  for (const support of semanticSupports) {
    let minimumY = Infinity;
    support.traverseVisible((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const box = meshLocalBox(node, inverse);
      if (box) minimumY = Math.min(minimumY, box.min.y);
    });
    if (!Number.isFinite(minimumY) || minimumY >= planeY - VEGETATION_CONTACT_TOLERANCE_METERS)
      continue;
    findings.push(
      finding(context, {
        code: 'VEG_MATERIAL_BURIED',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message: `${support.name || 'Vegetation support'} extends materially below the standalone ground plane.`,
        affected: { node: support.name || 'vegetation-support', nodePath: pathOf(support, root) },
        measurement: {
          name: 'supportMinimumY',
          actual: stable(minimumY),
          expected: planeY,
          threshold: VEGETATION_CONTACT_TOLERANCE_METERS,
          unit: 'm',
        },
        viewHints: ['right', 'vegetation.base-contact'],
        repairText: `Raise or trim the declared trunk/stem/root support so its visible material stops at Y=${planeY}.`,
      }),
    );
  }
  return findings;
}

const CLUTTER_NAME =
  /(?:^|[._ -])(?:terrain|soil|dirt|mound|rock|stone|pot|planter|grass[._ -]?skirt|base[._ -]?(?:disk|plate))(?:$|[._ -])/i;

function materialNames(node: THREE.Object3D): string[] {
  if (!(node instanceof THREE.Mesh)) return [];
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  return materials.filter(Boolean).map((material) => material.name ?? '');
}

/** Heuristic scope evidence. It is intentionally advisory and never a hard failure alone. */
export function inspectFoliageScope(context: FoliageQaInput): readonly QaFinding[] {
  const trusted = context.foliage;
  if (!trusted?.standalone || !(context.scene instanceof THREE.Object3D)) return [];
  const root = context.scene;
  const renderables = collectRenderableBounds(root);
  if (renderables.length === 0) return [];
  const overall = renderables.reduce((box, value) => box.union(value.box), new THREE.Box3());
  const overallSize = overall.getSize(new THREE.Vector3());
  const findings: QaFinding[] = [];
  for (const value of renderables) {
    const size = value.box.getSize(new THREE.Vector3());
    const center = value.box.getCenter(new THREE.Vector3());
    const names = [value.node.name, ...value.roles];
    const nameEvidence = names.some((name) => CLUTTER_NAME.test(name));
    const roleEvidence = value.roles.some((role) =>
      /(?:terrain|soil|rock|pot|planter|base)/i.test(role),
    );
    const materialEvidence = materialNames(value.node).some((name) => CLUTTER_NAME.test(name));
    const footprintRatio = (size.x * size.z) / Math.max(1e-9, overallSize.x * overallSize.z);
    const flatEvidence =
      footprintRatio >= 0.35 &&
      size.y <= Math.max(0.08, overallSize.y * 0.08) &&
      center.y <= (context.groundPlaneY ?? 0) + VEGETATION_CONTACT_TOLERANCE_METERS + size.y;
    const evidence = [nameEvidence, roleEvidence, materialEvidence, flatEvidence].filter(Boolean);
    if (evidence.length < 2) continue;
    findings.push(
      finding(context, {
        code: 'VEG_SCOPE_EXTRA',
        disposition: 'warn',
        dimension: 'promptAlignment',
        message: `${value.node.name || 'Renderable'} is likely unrequested standalone-vegetation base clutter; review before removal.`,
        affected: {
          node: value.node.name || 'vegetation-extra',
          nodePath: pathOf(value.node, root),
        },
        measurement: {
          name: 'scopeEvidence',
          actual: [
            nameEvidence ? 'name' : '',
            roleEvidence ? 'role' : '',
            materialEvidence ? 'material' : '',
            flatEvidence ? 'flat-footprint' : '',
          ]
            .filter(Boolean)
            .join(','),
          expected: 'standalone plant/fungus only',
        },
        viewHints: ['top', 'three-quarter', 'vegetation.base-contact'],
      }),
    );
  }
  return findings;
}

function unionVolume(boxes: readonly THREE.Box3[]): number {
  if (boxes.length === 0) return 0;
  const union = boxes.reduce((result, box) => result.union(box), new THREE.Box3());
  const size = union.getSize(new THREE.Vector3());
  return size.x * size.y * size.z;
}

function projectedOccupancy(
  boxes: readonly THREE.Box3[],
  axes: readonly [0 | 1 | 2, 0 | 1 | 2],
): number {
  if (boxes.length === 0) return 0;
  const minimum = [Infinity, Infinity];
  const maximum = [-Infinity, -Infinity];
  for (const box of boxes) {
    const min = [box.min.x, box.min.y, box.min.z];
    const max = [box.max.x, box.max.y, box.max.z];
    for (const dimension of [0, 1] as const) {
      minimum[dimension] = Math.min(minimum[dimension]!, min[axes[dimension]]!);
      maximum[dimension] = Math.max(maximum[dimension]!, max[axes[dimension]]!);
    }
  }
  const spans = [maximum[0]! - minimum[0]!, maximum[1]! - minimum[1]!];
  if (spans[0]! <= 1e-9 || spans[1]! <= 1e-9) return 0;
  const occupied = new Uint8Array(RASTER_SIZE * RASTER_SIZE);
  for (const box of boxes) {
    const min = [box.min.x, box.min.y, box.min.z];
    const max = [box.max.x, box.max.y, box.max.z];
    const x0 = Math.max(
      0,
      Math.floor(((min[axes[0]]! - minimum[0]!) / spans[0]!) * (RASTER_SIZE - 1)),
    );
    const x1 = Math.min(
      RASTER_SIZE - 1,
      Math.ceil(((max[axes[0]]! - minimum[0]!) / spans[0]!) * (RASTER_SIZE - 1)),
    );
    const y0 = Math.max(
      0,
      Math.floor(((min[axes[1]]! - minimum[1]!) / spans[1]!) * (RASTER_SIZE - 1)),
    );
    const y1 = Math.min(
      RASTER_SIZE - 1,
      Math.ceil(((max[axes[1]]! - minimum[1]!) / spans[1]!) * (RASTER_SIZE - 1)),
    );
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) occupied[y * RASTER_SIZE + x] = 1;
    }
  }
  return stable(occupied.reduce((sum, value) => sum + value, 0) / occupied.length);
}

function matchesAny(value: LocalBounds, patterns: readonly RegExp[]): boolean {
  const candidates = [value.node.name, ...value.roles];
  return candidates.some((candidate) => patterns.some((pattern) => pattern.test(candidate)));
}

const CANOPY_PATTERNS = [/(?:^|[._ -])(?:canopy|foliage|leaf|leaves|needle|frond)(?:$|[._ -])/i];
const TRUNK_PATTERNS = [/(?:^|[._ -])(?:trunk|stem|stalk|branch-primary)(?:$|[._ -])/i];
const BRANCH_PATTERNS = [
  /(?:^|[._ -])(?:branch|twig|bough|limb)(?:$|[._ -])/i,
  /^vegetation\.branch(?:\.|$)/i,
];

type GrowthBand = Readonly<{
  trunk: Readonly<{ taper: readonly [number, number]; lengthRadius: readonly [number, number] }>;
  branch: Readonly<{ taper: readonly [number, number]; lengthRadius: readonly [number, number] }>;
}>;

/**
 * Broad measurement bands, not aesthetic truth. They only localize conspicuous geometry outliers and
 * remain observe-only under D-02. Different growth forms intentionally use different ranges.
 */
export const VEGETATION_GROWTH_BANDS_V1: Readonly<
  Record<NonNullable<AssetIntentV1['vegetation']>['subtype'], GrowthBand>
> = Object.freeze({
  tree: {
    trunk: { taper: [0.35, 1.05], lengthRadius: [4, 80] },
    branch: { taper: [0.12, 1.05], lengthRadius: [4, 100] },
  },
  conifer: {
    trunk: { taper: [0.25, 1.05], lengthRadius: [6, 110] },
    branch: { taper: [0.1, 1.05], lengthRadius: [5, 140] },
  },
  shrub: {
    trunk: { taper: [0.25, 1.1], lengthRadius: [2, 65] },
    branch: { taper: [0.1, 1.1], lengthRadius: [2, 80] },
  },
  grass: {
    trunk: { taper: [0.05, 1.15], lengthRadius: [6, 260] },
    branch: { taper: [0.05, 1.15], lengthRadius: [5, 260] },
  },
  'frond/palm': {
    trunk: { taper: [0.35, 1.05], lengthRadius: [6, 140] },
    branch: { taper: [0.04, 1.1], lengthRadius: [8, 300] },
  },
  vine: {
    trunk: { taper: [0.1, 1.15], lengthRadius: [8, 320] },
    branch: { taper: [0.04, 1.15], lengthRadius: [8, 360] },
  },
  'crop/flower': {
    trunk: { taper: [0.15, 1.1], lengthRadius: [5, 220] },
    branch: { taper: [0.05, 1.15], lengthRadius: [4, 240] },
  },
  succulent: {
    trunk: { taper: [0.3, 1.2], lengthRadius: [1.2, 35] },
    branch: { taper: [0.15, 1.2], lengthRadius: [1.2, 50] },
  },
  fungus: {
    trunk: { taper: [0.25, 1.25], lengthRadius: [1.2, 45] },
    branch: { taper: [0.1, 1.25], lengthRadius: [1.2, 60] },
  },
  aquatic: {
    trunk: { taper: [0.08, 1.15], lengthRadius: [4, 260] },
    branch: { taper: [0.04, 1.15], lengthRadius: [4, 300] },
  },
  'bare/dead': {
    trunk: { taper: [0.25, 1.05], lengthRadius: [4, 100] },
    branch: { taper: [0.08, 1.05], lengthRadius: [3, 140] },
  },
  custom: {
    trunk: { taper: [0.05, 1.25], lengthRadius: [1.2, 320] },
    branch: { taper: [0.03, 1.25], lengthRadius: [1.2, 360] },
  },
});

function measurementSource(
  values: readonly { source: 'semantic' | 'fallback' }[],
): 'semantic' | 'fallback' | 'mixed' | 'none' {
  if (values.length === 0) return 'none';
  const semantic = values.some((value) => value.source === 'semantic');
  const fallback = values.some((value) => value.source === 'fallback');
  return semantic && fallback ? 'mixed' : semantic ? 'semantic' : 'fallback';
}

function roleOrNameSource(
  value: LocalBounds,
  patterns: readonly RegExp[],
): 'semantic' | 'fallback' | undefined {
  if (value.roles.some((role) => patterns.some((pattern) => pattern.test(role)))) return 'semantic';
  if (patterns.some((pattern) => pattern.test(value.node.name))) return 'fallback';
  return undefined;
}

interface GrowthCandidate extends LocalBounds {
  kind: 'trunk' | 'branch';
  growthSource: 'semantic' | 'fallback';
}

function growthCandidates(root: THREE.Object3D): GrowthCandidate[] {
  const result: GrowthCandidate[] = [];
  for (const value of collectRenderableBounds(root)) {
    const branchSource = roleOrNameSource(value, BRANCH_PATTERNS);
    const trunkSource = roleOrNameSource(value, TRUNK_PATTERNS);
    if (branchSource) result.push({ ...value, kind: 'branch', growthSource: branchSource });
    else if (trunkSource) result.push({ ...value, kind: 'trunk', growthSource: trunkSource });
  }
  return result;
}

function boxDistanceToPoint(box: THREE.Box3, point: THREE.Vector3): number {
  return box.distanceToPoint(point);
}

function endpointRadius(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  axis: 0 | 1 | 2,
  axisValue: number,
  tolerance: number,
  scale: THREE.Vector3,
): { center: THREE.Vector3; radius: number } | undefined {
  const radialAxes = ([0, 1, 2] as const).filter((value) => value !== axis);
  const points: THREE.Vector3[] = [];
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index);
    if (Math.abs(point.getComponent(axis) - axisValue) <= tolerance) points.push(point.clone());
  }
  if (points.length === 0) return undefined;
  const center = new THREE.Vector3();
  center.setComponent(axis, axisValue);
  for (const radialAxis of radialAxes) {
    center.setComponent(
      radialAxis,
      points.reduce((sum, value) => sum + value.getComponent(radialAxis), 0) / points.length,
    );
  }
  let radius = 0;
  for (const value of points) {
    const a =
      (value.getComponent(radialAxes[0]!) - center.getComponent(radialAxes[0]!)) *
      Math.abs(scale.getComponent(radialAxes[0]!));
    const b =
      (value.getComponent(radialAxes[1]!) - center.getComponent(radialAxes[1]!)) *
      Math.abs(scale.getComponent(radialAxes[1]!));
    radius = Math.max(radius, Math.hypot(a, b));
  }
  return { center, radius };
}

function growthNodeMeasurement(
  root: THREE.Object3D,
  candidate: GrowthCandidate,
  allCandidates: readonly GrowthCandidate[],
  band: GrowthBand,
): VegetationGrowthNodeMeasurementV1 | undefined {
  if (!(candidate.node instanceof THREE.Mesh)) return undefined;
  const geometry = candidate.node.geometry;
  const position = geometry.getAttribute('position');
  if (!position || position.count < 2) return undefined;
  geometry.computeBoundingBox();
  const geometryBox = geometry.boundingBox;
  if (!geometryBox || geometryBox.isEmpty()) return undefined;

  root.updateWorldMatrix(true, true);
  const relative = root.matrixWorld.clone().invert().multiply(candidate.node.matrixWorld);
  const relativeScale = new THREE.Vector3();
  relative.decompose(new THREE.Vector3(), new THREE.Quaternion(), relativeScale);
  const size = geometryBox.getSize(new THREE.Vector3());
  const scaledSizes = [
    Math.abs(size.x * relativeScale.x),
    Math.abs(size.y * relativeScale.y),
    Math.abs(size.z * relativeScale.z),
  ];
  const axis = scaledSizes.indexOf(Math.max(...scaledSizes)) as 0 | 1 | 2;
  const minimum = geometryBox.min.getComponent(axis);
  const maximum = geometryBox.max.getComponent(axis);
  const tolerance = Math.max(1e-6, (maximum - minimum) * 1e-4);
  const first = endpointRadius(position, axis, minimum, tolerance, relativeScale);
  const second = endpointRadius(position, axis, maximum, tolerance, relativeScale);
  if (!first || !second) return undefined;

  const firstPoint = first.center.clone().applyMatrix4(relative);
  const secondPoint = second.center.clone().applyMatrix4(relative);
  const supportBoxes = allCandidates
    .filter((value) => value !== candidate)
    .map((value) => value.box);
  let firstIsBase: boolean;
  if (candidate.kind === 'trunk') {
    firstIsBase = firstPoint.y <= secondPoint.y;
  } else if (supportBoxes.length > 0) {
    const firstGap = Math.min(...supportBoxes.map((box) => boxDistanceToPoint(box, firstPoint)));
    const secondGap = Math.min(...supportBoxes.map((box) => boxDistanceToPoint(box, secondPoint)));
    firstIsBase =
      Math.abs(firstGap - secondGap) > 1e-6 ? firstGap < secondGap : first.radius >= second.radius;
  } else {
    firstIsBase = first.radius >= second.radius;
  }

  const baseRadius = firstIsBase ? first.radius : second.radius;
  const tipRadius = firstIsBase ? second.radius : first.radius;
  const length = firstPoint.distanceTo(secondPoint);
  const averageRadius = (baseRadius + tipRadius) / 2;
  const taperRatio = baseRadius > 1e-9 ? tipRadius / baseRadius : null;
  const lengthRadiusRatio = averageRadius > 1e-9 ? length / averageRadius : null;
  const selected = band[candidate.kind];
  const taperOutlier =
    taperRatio !== null && (taperRatio < selected.taper[0] || taperRatio > selected.taper[1]);
  const lengthRadiusOutlier =
    lengthRadiusRatio !== null &&
    (lengthRadiusRatio < selected.lengthRadius[0] || lengthRadiusRatio > selected.lengthRadius[1]);
  return {
    node: candidate.node.name || candidate.kind,
    nodePath: pathOf(candidate.node, root),
    kind: candidate.kind,
    source: candidate.growthSource,
    lengthMeters: stable(length),
    baseRadiusMeters: stable(baseRadius),
    tipRadiusMeters: stable(tipRadius),
    taperRatio: taperRatio === null ? null : stable(taperRatio),
    lengthRadiusRatio: lengthRadiusRatio === null ? null : stable(lengthRadiusRatio),
    expectedTaperRatio: `${selected.taper[0]}..${selected.taper[1]}`,
    expectedLengthRadiusRatio: `${selected.lengthRadius[0]}..${selected.lengthRadius[1]}`,
    taperOutlier,
    lengthRadiusOutlier,
  };
}

export function measureFoliageGrowth(
  foliage: FoliageRequirements | undefined,
  root: THREE.Object3D,
): VegetationGrowthMeasurementsV1 {
  const requested = foliage?.subtype;
  const subtype =
    requested && Object.hasOwn(VEGETATION_GROWTH_BANDS_V1, requested)
      ? (requested as keyof typeof VEGETATION_GROWTH_BANDS_V1)
      : 'custom';
  const candidates = growthCandidates(root);
  const nodes = candidates
    .map((candidate) =>
      growthNodeMeasurement(root, candidate, candidates, VEGETATION_GROWTH_BANDS_V1[subtype]),
    )
    .filter((value): value is VegetationGrowthNodeMeasurementV1 => Boolean(value));
  return {
    schemaVersion: 1,
    subtype,
    source: measurementSource(nodes),
    trunkCount: nodes.filter((value) => value.kind === 'trunk').length,
    branchCount: nodes.filter((value) => value.kind === 'branch').length,
    nodes,
  };
}

export function inspectFoliageGrowth(context: FoliageQaInput): readonly QaFinding[] {
  if (!context.foliage || !(context.scene instanceof THREE.Object3D)) return [];
  const measured = measureFoliageGrowth(context.foliage, context.scene);
  const findings: QaFinding[] = [];
  for (const node of measured.nodes) {
    if (node.taperOutlier) {
      findings.push(
        finding(context, {
          code: 'VEG_GROWTH_TAPER_OUTLIER',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: `${node.kind} taper measurement is outside the ${measured.subtype} measurement band.`,
          affected: { node: node.node, nodePath: node.nodePath },
          measurement: {
            name: 'tipToBaseRadiusRatio',
            actual: node.taperRatio ?? 'unmeasurable',
            expected: node.expectedTaperRatio,
            unit: 'ratio',
          },
          viewHints: ['front', 'right', 'three-quarter'],
        }),
      );
    }
    if (node.lengthRadiusOutlier) {
      findings.push(
        finding(context, {
          code: 'VEG_GROWTH_LENGTH_RADIUS_OUTLIER',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: `${node.kind} length/radius measurement is outside the ${measured.subtype} measurement band.`,
          affected: { node: node.node, nodePath: node.nodePath },
          measurement: {
            name: 'lengthToAverageRadiusRatio',
            actual: node.lengthRadiusRatio ?? 'unmeasurable',
            expected: node.expectedLengthRadiusRatio,
            unit: 'ratio',
          },
          viewHints: ['front', 'right', 'three-quarter'],
        }),
      );
    }
  }
  return findings;
}

function distanceBetweenBoxes(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dy, dz);
}

export function measureVegetationFoliageAttachment(
  root: THREE.Object3D,
): VegetationFoliageAttachmentMeasurementsV1 {
  const renderables = collectRenderableBounds(root);
  const support = renderables.filter(
    (value) => roleOrNameSource(value, TRUNK_PATTERNS) || roleOrNameSource(value, BRANCH_PATTERNS),
  );
  const foliage = renderables.filter((value) => roleOrNameSource(value, CANOPY_PATTERNS));
  const clusters = foliage.map((value): VegetationFoliageAttachmentMeasurementV1 => {
    const size = value.box.getSize(new THREE.Vector3());
    const threshold = stable(Math.max(0.03, Math.min(0.18, size.length() * 0.12)));
    const nearest = support
      .map((candidate) => ({ candidate, gap: distanceBetweenBoxes(value.box, candidate.box) }))
      .sort(
        (a, b) =>
          a.gap - b.gap || (a.candidate.node.name || '').localeCompare(b.candidate.node.name || ''),
      )[0];
    const source = roleOrNameSource(value, CANOPY_PATTERNS) ?? 'fallback';
    return {
      node: value.node.name || 'foliage-cluster',
      nodePath: pathOf(value.node, root),
      source,
      nearestSupport: nearest?.candidate.node.name || null,
      gapMeters: nearest ? stable(nearest.gap) : null,
      thresholdMeters: threshold,
      detached: !nearest || nearest.gap > threshold,
    };
  });
  return {
    schemaVersion: 1,
    source: measurementSource(clusters),
    supportNodeCount: support.length,
    foliageClusterCount: foliage.length,
    clusters,
  };
}

export function inspectFoliageAttachment(context: FoliageQaInput): readonly QaFinding[] {
  if (!context.foliage || !(context.scene instanceof THREE.Object3D)) return [];
  return measureVegetationFoliageAttachment(context.scene)
    .clusters.filter((cluster) => cluster.detached)
    .map((cluster) =>
      finding(context, {
        code: 'VEG_FOLIAGE_DETACHED',
        disposition: 'warn',
        dimension: 'categoryReadiness',
        message: `${cluster.node} is detached from the nearest inferred or semantic branch/twig support.`,
        affected: { node: cluster.node, nodePath: cluster.nodePath },
        measurement: {
          name: 'foliageSupportGap',
          actual: cluster.gapMeters ?? 'no support found',
          expected: `<=${cluster.thresholdMeters}`,
          threshold: cluster.thresholdMeters,
          unit: 'm',
        },
        viewHints: ['front', 'right', 'three-quarter'],
      }),
    );
}

function relativeTransformSignature(root: THREE.Object3D, node: THREE.Object3D): string {
  const matrix = root.matrixWorld.clone().invert().multiply(node.matrixWorld);
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  matrix.decompose(new THREE.Vector3(), quaternion, scale);
  if (quaternion.w < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
  const values = [...scale.toArray(), ...quaternion.toArray()].map((value) => stable(value));
  return values.join(',');
}

export function measureFoliageRepetition(
  requirements: FoliageRequirements | undefined,
  root: THREE.Object3D,
): VegetationRepetitionMeasurementsV1 {
  root.updateWorldMatrix(true, true);
  const foliage = collectRenderableBounds(root).filter((value) =>
    roleOrNameSource(value, CANOPY_PATTERNS),
  );
  const bySignature = new Map<string, LocalBounds[]>();
  for (const value of foliage) {
    const signature = relativeTransformSignature(root, value.node);
    const entries = bySignature.get(signature) ?? [];
    entries.push(value);
    bySignature.set(signature, entries);
  }
  const identicalTransformGroups = [...bySignature.entries()]
    .filter(([, values]) => values.length >= 3)
    .map(([signature, values]) => ({
      signature,
      nodes: values.map((value) => value.node.name || 'foliage-cluster').sort(),
    }))
    .sort((a, b) => a.signature.localeCompare(b.signature));

  const supports = collectRenderableBounds(root).filter((value) =>
    roleOrNameSource(value, TRUNK_PATTERNS),
  );
  const centerBox = supports.reduce((box, value) => box.union(value.box), new THREE.Box3());
  const centers = foliage.map((value) => value.box.getCenter(new THREE.Vector3()));
  const center = centerBox.isEmpty()
    ? centers
        .reduce((result, value) => result.add(value), new THREE.Vector3())
        .multiplyScalar(centers.length > 0 ? 1 / centers.length : 0)
    : centerBox.getCenter(new THREE.Vector3());
  const radial = centers
    .map((value) => ({
      angle: Math.atan2(value.z - center.z, value.x - center.x),
      radius: Math.hypot(value.x - center.x, value.z - center.z),
    }))
    .filter((value) => value.radius > 1e-6)
    .sort((a, b) => a.angle - b.angle);
  let radialGapRangeRadians: number | null = null;
  let radialRadiusSpreadRatio: number | null = null;
  let perfectRadialLockstep = false;
  if (radial.length >= 4) {
    const gaps = radial.map((value, index) => {
      const next = radial[(index + 1) % radial.length]!;
      const raw = next.angle - value.angle;
      return raw > 0 ? raw : raw + Math.PI * 2;
    });
    radialGapRangeRadians = stable(Math.max(...gaps) - Math.min(...gaps));
    const radii = radial.map((value) => value.radius);
    const meanRadius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    radialRadiusSpreadRatio = stable((Math.max(...radii) - Math.min(...radii)) / meanRadius);
    perfectRadialLockstep = radialGapRangeRadians <= 0.02 && radialRadiusSpreadRatio <= 0.02;
  }
  const suppressedForTopiary = requirements?.canopyProfile === 'topiary';
  return {
    schemaVersion: 1,
    source: measurementSource(
      foliage.map((value) => ({
        source: roleOrNameSource(value, CANOPY_PATTERNS) ?? 'fallback',
      })),
    ),
    clusterCount: foliage.length,
    identicalTransformGroups,
    radialGapRangeRadians,
    radialRadiusSpreadRatio,
    perfectRadialLockstep,
    suppressedForTopiary,
  };
}

export function inspectFoliageRepetition(context: FoliageQaInput): readonly QaFinding[] {
  if (!context.foliage || !(context.scene instanceof THREE.Object3D)) return [];
  const measured = measureFoliageRepetition(context.foliage, context.scene);
  if (measured.suppressedForTopiary) return [];
  const findings: QaFinding[] = measured.identicalTransformGroups.map((group) =>
    finding(context, {
      code: 'VEG_CLUSTER_TRANSFORM_REPEAT',
      disposition: 'warn',
      dimension: 'visualQuality',
      message: `${group.nodes.length} foliage clusters use an identical scale/rotation signature.`,
      affected: { node: group.nodes[0], nodePath: group.nodes.join(',') },
      measurement: {
        name: 'identicalClusterTransformCount',
        actual: group.nodes.length,
        expected: '<3 outside formal topiary intent',
      },
      viewHints: ['front', 'right', 'top', 'three-quarter'],
    }),
  );
  if (measured.perfectRadialLockstep) {
    findings.push(
      finding(context, {
        code: 'VEG_CLUSTER_RADIAL_LOCKSTEP',
        disposition: 'warn',
        dimension: 'visualQuality',
        message: 'Foliage clusters form a perfect equal-radius, equal-angle radial sequence.',
        measurement: {
          name: 'radialGapAndRadiusSpread',
          actual: `${measured.radialGapRangeRadians},${measured.radialRadiusSpreadRatio}`,
          expected: 'angle gap range >0.02 or radius spread ratio >0.02',
          unit: 'ratio',
        },
        viewHints: ['top', 'three-quarter'],
      }),
    );
  }
  return findings;
}

export function measureFoliageCanopy(
  profile: VegetationCanopyProfile,
  root: THREE.Object3D,
): VegetationCanopyMeasurementsV1 {
  const renderables = collectRenderableBounds(root);
  const canopy = renderables.filter((value) => matchesAny(value, CANOPY_PATTERNS));
  const trunk = renderables.filter((value) => matchesAny(value, TRUNK_PATTERNS));
  const semanticCanopy = canopy.some((value) => value.roles.length > 0);
  const source = canopy.length === 0 ? 'none' : semanticCanopy ? 'semantic' : 'fallback';
  const canopyBoxes = canopy.map((value) => value.box);
  const trunkVolume = unionVolume(trunk.map((value) => value.box));
  const ratio = trunkVolume > 1e-9 ? unionVolume(canopyBoxes) / trunkVolume : null;
  return {
    schemaVersion: 1,
    profile,
    source,
    canopyNodeCount: canopy.length,
    trunkNodeCount: trunk.length,
    frontOccupancy: projectedOccupancy(canopyBoxes, [2, 1]),
    sideOccupancy: projectedOccupancy(canopyBoxes, [0, 1]),
    topOccupancy: projectedOccupancy(canopyBoxes, [0, 2]),
    canopyToTrunkVolumeRatio: ratio === null ? null : stable(ratio),
  };
}

const PROFILE_BANDS: Readonly<
  Record<
    VegetationCanopyProfile,
    {
      occupancy: { front: [number, number]; side: [number, number]; top: [number, number] };
      ratio: [number, number];
    }
  >
> = Object.freeze({
  broadleaf: {
    occupancy: { front: [0.4, 0.99], side: [0.4, 0.99], top: [0.32, 0.99] },
    ratio: [1.5, 120],
  },
  conifer: {
    occupancy: { front: [0.32, 0.97], side: [0.32, 0.97], top: [0.2, 0.95] },
    ratio: [1, 100],
  },
  topiary: {
    occupancy: { front: [0.62, 1], side: [0.62, 1], top: [0.58, 1] },
    ratio: [1, 120],
  },
  'bare/dead': {
    occupancy: { front: [0, 0.08], side: [0, 0.08], top: [0, 0.08] },
    ratio: [0, 0.2],
  },
});

export function inspectFoliageCanopy(context: FoliageQaInput): readonly QaFinding[] {
  const trusted = context.foliage;
  if (!trusted?.canopyProfile || !(context.scene instanceof THREE.Object3D)) return [];
  const measurements = measureFoliageCanopy(trusted.canopyProfile, context.scene);
  const bands = PROFILE_BANDS[measurements.profile];
  const sparseFactor = trusted.growthState === 'sparse' ? 0.55 : 1;
  const values = [
    ['FRONT', 'frontOccupancy', measurements.frontOccupancy, bands.occupancy.front, 'front'],
    ['SIDE', 'sideOccupancy', measurements.sideOccupancy, bands.occupancy.side, 'right'],
    ['TOP', 'topOccupancy', measurements.topOccupancy, bands.occupancy.top, 'top'],
  ] as const;
  const findings: QaFinding[] = [];
  if (measurements.canopyNodeCount === 0 && measurements.profile !== 'bare/dead') {
    findings.push(
      finding(context, {
        code: 'VEG_CANOPY_MISSING',
        disposition: 'warn',
        dimension: 'categoryReadiness',
        message: `The ${trusted.subtype ?? trusted.canopyProfile} profile resolved no semantic or inferred canopy renderables.`,
        measurement: { name: 'canopyNodeCount', actual: 0, expected: '>=1' },
        viewHints: ['front', 'right', 'top'],
      }),
    );
    return findings;
  }
  for (const [suffix, name, actual, [minimum, maximum], view] of values) {
    const adjustedMinimum = minimum * sparseFactor;
    if (actual >= adjustedMinimum && actual <= maximum) continue;
    findings.push(
      finding(context, {
        code: `VEG_CANOPY_OCCUPANCY_${suffix}`,
        disposition: 'warn',
        dimension: 'categoryReadiness',
        message: `${measurements.profile} ${name} is outside its measured ${trusted.growthState ?? 'default'} profile band.`,
        measurement: {
          name,
          actual,
          expected: `${stable(adjustedMinimum)}..${maximum}`,
          threshold: adjustedMinimum,
          unit: 'ratio',
        },
        viewHints: [view, 'three-quarter'],
      }),
    );
  }
  const ratio = measurements.canopyToTrunkVolumeRatio;
  if (ratio !== null && (ratio < bands.ratio[0] || ratio > bands.ratio[1])) {
    findings.push(
      finding(context, {
        code: 'VEG_CANOPY_TRUNK_RATIO',
        disposition: 'warn',
        dimension: 'categoryReadiness',
        message: `${measurements.profile} canopy-to-trunk volume ratio is outside its subtype band.`,
        measurement: {
          name: 'canopyToTrunkVolumeRatio',
          actual: ratio,
          expected: `${bands.ratio[0]}..${bands.ratio[1]}`,
          threshold: bands.ratio[0],
          unit: 'ratio',
        },
        viewHints: ['front', 'right', 'top'],
      }),
    );
  }
  return findings;
}

function materialValue(material: THREE.Material): number | undefined {
  if (
    !(material instanceof THREE.MeshStandardMaterial) &&
    !(material instanceof THREE.MeshBasicMaterial)
  ) {
    return undefined;
  }
  const color = material.color;
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

export function measureFoliageMaterials(
  mode: AssetIntentV1['material']['mode'],
  root: THREE.Object3D,
): VegetationFoliageMaterialMeasurementsV1 {
  const values: number[] = [];
  let foliageNodeCount = 0;
  root.traverseVisible((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const bounds: LocalBounds = {
      node,
      box: new THREE.Box3(),
      roles: rolesOf(node),
      source: rolesOf(node).length > 0 ? 'semantic' : 'fallback',
    };
    if (!matchesAny(bounds, CANOPY_PATTERNS)) return;
    foliageNodeCount++;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      const value = materialValue(material);
      if (value !== undefined) values.push(value);
    }
  });
  const buckets = new Set(values.map((value) => Math.round(value * 20) / 20));
  const valueRange = values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
  const optimized = mode === 'flatOptimized';
  return {
    schemaVersion: 1,
    mode,
    foliageNodeCount,
    valueRoleCount: buckets.size,
    valueRange: stable(valueRange),
    coherent: optimized
      ? buckets.size <= 1
      : buckets.size >= 2 && buckets.size <= 6 && valueRange >= 0.03,
  };
}

export function inspectFoliageMaterial(context: FoliageQaInput): readonly QaFinding[] {
  if (!context.foliage || !(context.scene instanceof THREE.Object3D)) return [];
  if (!context.materialMode) return [];
  const measured = measureFoliageMaterials(context.materialMode, context.scene);
  if (measured.foliageNodeCount === 0 || measured.coherent) return [];
  const optimized = measured.mode === 'flatOptimized';
  return [
    finding(context, {
      code: 'VEG_FOLIAGE_VALUE_ROLES',
      disposition: 'warn',
      dimension: 'visualQuality',
      message: optimized
        ? 'Optimized vegetation should retain one coherent foliage value role.'
        : 'Rich organic vegetation should use two to six restrained foliage value roles with visible value separation.',
      measurement: {
        name: 'foliageValueRoles',
        actual: `${measured.valueRoleCount} roles; range ${measured.valueRange}`,
        expected: optimized ? '1 role' : '2..6 roles; range >=0.03',
      },
      viewHints: ['front', 'three-quarter'],
    }),
  ];
}

export function inspectFoliageAdvisory(context: FoliageQaInput): readonly QaFinding[] {
  return [
    ...inspectFoliageScope(context),
    ...inspectFoliageGrowth(context),
    ...inspectFoliageCanopy(context),
    ...inspectFoliageAttachment(context),
    ...inspectFoliageRepetition(context),
    ...inspectFoliageMaterial(context),
  ];
}

/** Historical fixture adapters. Runtime selection uses explicit foliage requirements. */
function fixtureInput(context: QaContext): FoliageQaInput {
  return {
    scene: context.scene,
    profile: context.intent.qaProfile,
    foliage: vegetationIntent(context.intent),
    materialMode: context.intent.material.mode,
  };
}
export function evaluateVegetationContactQa(context: QaContext): readonly QaFinding[] {
  return inspectFoliageContact(fixtureInput(context));
}
export function evaluateVegetationScopeQa(context: QaContext): readonly QaFinding[] {
  return inspectFoliageScope(fixtureInput(context));
}
export function evaluateVegetationGrowthQa(context: QaContext): readonly QaFinding[] {
  return inspectFoliageGrowth(fixtureInput(context));
}
export function evaluateVegetationFoliageAttachmentQa(context: QaContext): readonly QaFinding[] {
  return inspectFoliageAttachment(fixtureInput(context));
}
export function evaluateVegetationRepetitionQa(context: QaContext): readonly QaFinding[] {
  return inspectFoliageRepetition(fixtureInput(context));
}
export function evaluateVegetationCanopyQa(context: QaContext): readonly QaFinding[] {
  return inspectFoliageCanopy(fixtureInput(context));
}
export function evaluateVegetationMaterialQa(context: QaContext): readonly QaFinding[] {
  return inspectFoliageMaterial(fixtureInput(context));
}
export function evaluateVegetationAdvisoryQa(context: QaContext): readonly QaFinding[] {
  return inspectFoliageAdvisory(fixtureInput(context));
}
export function measureVegetationGrowth(intent: AssetIntentV1, root: THREE.Object3D) {
  return measureFoliageGrowth(vegetationIntent(intent), root);
}
export function measureVegetationRepetition(intent: AssetIntentV1, root: THREE.Object3D) {
  return measureFoliageRepetition(vegetationIntent(intent), root);
}
export function measureVegetationCanopy(intent: AssetIntentV1, root: THREE.Object3D) {
  return measureFoliageCanopy(vegetationIntent(intent)?.canopyProfile ?? 'broadleaf', root);
}
export function measureVegetationFoliageMaterials(intent: AssetIntentV1, root: THREE.Object3D) {
  return measureFoliageMaterials(intent.material.mode, root);
}

export const VEGETATION_CONTACT_QA_RULE: QaRule = {
  id: 'VEGETATION_CONTACT_PROFILE',
  profile: PROFILE,
  scope: { kind: 'category', category: 'vegetation' },
  ruleClass: 'exact',
  owner: KILN_ENGINE_QA_OWNER,
  promotion: conformancePromotionAuthorization(
    'vegetation-contact-v1',
    'src/qa/vegetation.test.ts',
    '8ad8f1753fc76e5e1b0114ad7d7f2c6c02c6f1c60953727027219424422a8ac4',
  ),
  defaultMode: 'enforce',
  evaluate: evaluateVegetationContactQa,
};

export const VEGETATION_ADVISORY_QA_RULE: QaRule = {
  id: 'VEGETATION_ADVISORY_PROFILE',
  profile: 'vegetation.advisory',
  scope: { kind: 'category', category: 'vegetation' },
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate: evaluateVegetationAdvisoryQa,
};

export const VEGETATION_QA_RULES: readonly QaRule[] = [
  VEGETATION_CONTACT_QA_RULE,
  VEGETATION_ADVISORY_QA_RULE,
] as const;
