import * as THREE from 'three';

import { readSemanticMetadataV1FromExtras, type SemanticRelationshipV1 } from '../contracts';
import type { AssetRequirementsV1 } from '../contracts/requirements';
import { withArchitectureRepair } from './architecture-repairs';
import { conformancePromotionAuthorization, KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

export type StructureRequirements = Extract<
  NonNullable<AssetRequirementsV1['requirements']['structure']>,
  { value: unknown }
>['value'];
export interface StructureQaInput {
  scene?: unknown;
  profile?: string;
  structure?: StructureRequirements;
  opening?: boolean;
}
type MeasuredRoof = StructureRequirements & {
  footprint: NonNullable<StructureRequirements['footprint']>;
  roof: NonNullable<StructureRequirements['roof']> & {
    ridgeAxis: 'x' | 'z';
    rise: number;
    overhang: number;
  };
};
function hasRoofDimensions(value: StructureRequirements): value is MeasuredRoof {
  return (
    value.footprint !== undefined &&
    value.roof?.ridgeAxis !== undefined &&
    value.roof.rise !== undefined &&
    value.roof.overhang !== undefined
  );
}

type Axis = 'x' | 'y' | 'z';
type HorizontalAxis = 'x' | 'z';

interface Bounds3 {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

interface ArchitectureTriangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

interface ArchitecturePart {
  node: THREE.Object3D;
  nodeName: string;
  nodePath: string;
  directRoles: readonly string[];
  directRelationships: readonly SemanticRelationshipV1[];
  roles: readonly string[];
  isMesh: boolean;
  bounds: Bounds3;
  vertices: readonly THREE.Vector3[];
  triangles: readonly ArchitectureTriangle[];
  /** Normal of the geometry's thinnest local axis, expressed asset-locally. */
  planeNormal?: THREE.Vector3;
}

interface ArchitectureSceneEvidence {
  root: THREE.Object3D;
  parts: ArchitecturePart[];
  semanticRoles: Set<string>;
}

interface ArchitectureAggregate {
  parts: ArchitecturePart[];
  bounds: Bounds3;
  vertices: THREE.Vector3[];
  triangles: ArchitectureTriangle[];
  normals: THREE.Vector3[];
}

const PROFILE_RULE_ID = 'ARCHITECTURE_PROFILE';
const EPSILON = 1e-6;

export const ARCHITECTURE_REALISTIC_SCALE_BANDS = Object.freeze({
  doorWidth: Object.freeze({ minimum: 0.75, maximum: 2.5, unit: 'm' as const }),
  doorHeight: Object.freeze({ minimum: 1.8, maximum: 3.2, unit: 'm' as const }),
  ceilingHeight: Object.freeze({ minimum: 2.1, maximum: 6, unit: 'm' as const }),
  stairRiser: Object.freeze({ minimum: 0.1, maximum: 0.25, unit: 'm' as const }),
  stairTread: Object.freeze({ minimum: 0.2, maximum: 0.45, unit: 'm' as const }),
  wallThickness: Object.freeze({ minimum: 0.05, maximum: 0.6, unit: 'm' as const }),
  footprint: Object.freeze({ minimum: 1.5, maximum: 200, unit: 'm' as const }),
});

const emptyBounds = (): Bounds3 => ({
  min: new THREE.Vector3(Infinity, Infinity, Infinity),
  max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
});

const expandBounds = (bounds: Bounds3, point: THREE.Vector3): void => {
  bounds.min.min(point);
  bounds.max.max(point);
};

const boundsFinite = (bounds: Bounds3): boolean => Number.isFinite(bounds.min.x);

const extent = (bounds: Bounds3, axis: Axis): number => bounds.max[axis] - bounds.min[axis];

function semanticMetadata(node: THREE.Object3D) {
  return readSemanticMetadataV1FromExtras(node.userData);
}

function markerBounds(matrix: THREE.Matrix4): Bounds3 {
  const bounds = emptyBounds();
  for (let corner = 0; corner < 8; corner++) {
    expandBounds(
      bounds,
      new THREE.Vector3(
        corner & 1 ? 0.5 : -0.5,
        corner & 2 ? 0.5 : -0.5,
        corner & 4 ? 0.5 : -0.5,
      ).applyMatrix4(matrix),
    );
  }
  return bounds;
}

function geometryPlaneNormal(
  geometry: THREE.BufferGeometry,
  relativeMatrix: THREE.Matrix4,
): THREE.Vector3 | undefined {
  geometry.computeBoundingBox();
  const local = geometry.boundingBox;
  if (!local) return undefined;
  const size = local.getSize(new THREE.Vector3());
  const dimensions: Array<[Axis, number]> = [
    ['x', size.x],
    ['y', size.y],
    ['z', size.z],
  ];
  dimensions.sort((a, b) => a[1] - b[1]);
  const axis = dimensions[0]?.[0];
  if (!axis) return undefined;
  const normal = new THREE.Vector3(
    axis === 'x' ? 1 : 0,
    axis === 'y' ? 1 : 0,
    axis === 'z' ? 1 : 0,
  ).transformDirection(relativeMatrix);
  if (normal.y < 0) normal.multiplyScalar(-1);
  return normal.normalize();
}

function geometryEvidence(
  geometry: THREE.BufferGeometry,
  relativeMatrix: THREE.Matrix4,
): {
  bounds: Bounds3;
  vertices: THREE.Vector3[];
  triangles: ArchitectureTriangle[];
  planeNormal?: THREE.Vector3;
} {
  const position = geometry.getAttribute('position');
  const bounds = emptyBounds();
  const vertices: THREE.Vector3[] = [];
  if (position?.itemSize !== 3) return { bounds, vertices, triangles: [] };

  for (let index = 0; index < position.count; index++) {
    const point = new THREE.Vector3(
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    );
    point.applyMatrix4(relativeMatrix);
    vertices.push(point);
    expandBounds(bounds, point);
  }

  const triangles: ArchitectureTriangle[] = [];
  const indices = geometry.getIndex();
  const addTriangle = (a: number, b: number, c: number): void => {
    const va = vertices[a];
    const vb = vertices[b];
    const vc = vertices[c];
    if (va && vb && vc) triangles.push({ a: va, b: vb, c: vc });
  };
  if (indices) {
    for (let index = 0; index + 2 < indices.count; index += 3) {
      addTriangle(indices.getX(index), indices.getX(index + 1), indices.getX(index + 2));
    }
  } else {
    for (let index = 0; index + 2 < vertices.length; index += 3) {
      addTriangle(index, index + 1, index + 2);
    }
  }

  const planeNormal = geometryPlaneNormal(geometry, relativeMatrix);
  return { bounds, vertices, triangles, ...(planeNormal ? { planeNormal } : {}) };
}

function collectArchitectureEvidence(scene: unknown): ArchitectureSceneEvidence | undefined {
  if (!(scene instanceof THREE.Object3D)) return undefined;
  scene.updateMatrixWorld(true);
  const rootInverse = scene.matrixWorld.clone().invert();
  const parts: ArchitecturePart[] = [];
  const allRoles = new Set<string>();

  const visit = (
    node: THREE.Object3D,
    parentPath: string,
    siblingIndex: number,
    inheritedRoles: readonly string[],
  ): void => {
    if (!node.visible) return;
    const metadata = semanticMetadata(node);
    const directRoles = metadata?.roles ?? [];
    const directRelationships = metadata?.relationships ?? [];
    directRoles.forEach((role) => {
      allRoles.add(role);
    });
    const roles = [...new Set([...inheritedRoles, ...directRoles])];
    const segment = `${node.name.trim() || node.type || 'Object3D'}[${siblingIndex}]`;
    const nodePath = parentPath ? `${parentPath}/${segment}` : segment;
    const relativeMatrix = rootInverse.clone().multiply(node.matrixWorld);
    const mesh = node as THREE.Mesh;
    const isMesh = mesh.isMesh === true && mesh.geometry instanceof THREE.BufferGeometry;
    const evidence = isMesh
      ? geometryEvidence(mesh.geometry, relativeMatrix)
      : {
          bounds: markerBounds(relativeMatrix),
          vertices: [] as THREE.Vector3[],
          triangles: [] as ArchitectureTriangle[],
        };

    if (isMesh || directRoles.length > 0) {
      parts.push({
        node,
        nodeName: node.name || node.type,
        nodePath,
        directRoles,
        directRelationships,
        roles,
        isMesh,
        ...evidence,
      });
    }
    node.children.forEach((child, index) => {
      visit(child, nodePath, index, roles);
    });
  };

  visit(scene, '', 0, []);
  return { root: scene, parts, semanticRoles: allRoles };
}

const hasRole = (part: ArchitecturePart, role: string): boolean => part.roles.includes(role);

const hasRolePrefix = (part: ArchitecturePart, prefix: string): boolean =>
  part.roles.some((role) => role.startsWith(prefix));

function aggregate(parts: readonly ArchitecturePart[]): ArchitectureAggregate | undefined {
  if (parts.length === 0) return undefined;
  const bounds = emptyBounds();
  const vertices: THREE.Vector3[] = [];
  const triangles: ArchitectureTriangle[] = [];
  const normals: THREE.Vector3[] = [];
  for (const part of parts) {
    if (boundsFinite(part.bounds)) {
      expandBounds(bounds, part.bounds.min);
      expandBounds(bounds, part.bounds.max);
    }
    vertices.push(...part.vertices);
    triangles.push(...part.triangles);
    if (part.planeNormal) normals.push(part.planeNormal);
  }
  if (!boundsFinite(bounds)) return undefined;
  return { parts: [...parts], bounds, vertices, triangles, normals };
}

function aggregateRole(
  evidence: ArchitectureSceneEvidence,
  role: string,
): ArchitectureAggregate | undefined {
  return aggregate(evidence.parts.filter((part) => hasRole(part, role)));
}

function architectureFinding(
  context: StructureQaInput,
  value: Omit<QaFinding, 'profile' | 'dimension'>,
): QaFinding {
  return withArchitectureRepair({
    ...value,
    profile: context.profile ?? 'asset.requirements.v1',
    dimension: 'categoryReadiness',
  });
}

function averageNormal(normals: readonly THREE.Vector3[]): THREE.Vector3 | undefined {
  if (normals.length === 0) return undefined;
  const result = normals.reduce((sum, normal) => sum.add(normal), new THREE.Vector3());
  return result.lengthSq() > EPSILON ? result.normalize() : undefined;
}

function intervalCoverage(
  min: number,
  max: number,
  expectedMin: number,
  expectedMax: number,
): number {
  const expected = expectedMax - expectedMin;
  if (expected <= EPSILON) return 1;
  return Math.max(0, Math.min(max, expectedMax) - Math.max(min, expectedMin)) / expected;
}

function intervalSeparation(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) return bMin - aMax;
  if (bMax < aMin) return aMin - bMax;
  return 0;
}

function requestedGable(architecture: StructureRequirements): boolean {
  return architecture.roof?.type === 'gable';
}

function taggedGable(evidence: ArchitectureSceneEvidence): boolean {
  return [...evidence.semanticRoles].some(
    (role) =>
      role === 'architecture.shell.gable' ||
      role.startsWith('roof.slope.') ||
      role.startsWith('roof.gable.'),
  );
}

function highEdgeVertices(aggregateValue: ArchitectureAggregate, rise: number): THREE.Vector3[] {
  const band = Math.max(0.006, rise * 0.02);
  const maximumY = aggregateValue.bounds.max.y;
  return aggregateValue.vertices.filter((point) => point.y >= maximumY - band);
}

function ridgeCrossSectionDistance(
  positive: ArchitectureAggregate,
  negative: ArchitectureAggregate,
  lateralAxis: HorizontalAxis,
  rise: number,
): number {
  const a = highEdgeVertices(positive, rise);
  const b = highEdgeVertices(negative, rise);
  let distance = Infinity;
  for (const pointA of a) {
    for (const pointB of b) {
      distance = Math.min(
        distance,
        Math.hypot(pointA[lateralAxis] - pointB[lateralAxis], pointA.y - pointB.y),
      );
    }
  }
  return distance;
}

function roofFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  if (!requestedGable(architecture)) return [];
  const positive = aggregateRole(evidence, 'roof.slope.positive');
  const negative = aggregateRole(evidence, 'roof.slope.negative');
  const tagged = taggedGable(evidence);
  const exactDisposition = tagged ? ('block' as const) : ('warn' as const);
  const findings: QaFinding[] = [];

  if (!positive || !negative) {
    findings.push(
      architectureFinding(context, {
        code: 'ARCH_ROOF_AXIS',
        disposition: exactDisposition,
        message: `A gable requires exactly two semantic slope roles; found ${positive ? 1 : 0} positive and ${negative ? 1 : 0} negative slope surfaces.`,
        measurement: {
          name: 'semanticSlopeRoleCount',
          actual: Number(Boolean(positive)) + Number(Boolean(negative)),
          expected: 2,
          threshold: 2,
        },
        affected: { node: evidence.root.name || 'architecture-root' },
      }),
    );
  }

  const semanticRoofRoles = [...evidence.semanticRoles].filter((role) => role.startsWith('roof.'));
  if (semanticRoofRoles.length === 0) {
    const inferredRoof = evidence.parts.find(
      (part) => part.isMesh && /(?:^|[_ .-])roof(?:$|[_ .-])/i.test(part.nodeName),
    );
    findings.push(
      architectureFinding(context, {
        code: 'ARCH_MISSING_ROOF_ROLES',
        disposition: 'warn',
        message:
          'The architecture has no portable roof.* semantic roles, so ridge, coverage, diagnostic cutaway, and separability checks cannot be exact.',
        affected: inferredRoof
          ? { node: inferredRoof.nodeName, nodePath: inferredRoof.nodePath }
          : { node: evidence.root.name || 'architecture-root' },
        viewHints: ['generic.top.semantic-overlay', 'architecture.cutaway.dollhouse'],
        repairText:
          'Build the roof with the gable shell helper or stamp roof.slope.positive/negative and roof.gable.positive/negative roles plus separable-from relationships.',
      }),
    );
    return findings;
  }

  if (!positive || !negative || !hasRoofDimensions(architecture)) return findings;

  const ridgeAxis = architecture.roof.ridgeAxis;
  const lateralAxis: HorizontalAxis = ridgeAxis === 'x' ? 'z' : 'x';
  const positiveNormal = averageNormal(positive.normals);
  const negativeNormal = averageNormal(negative.normals);
  const lateralProduct =
    positiveNormal && negativeNormal
      ? positiveNormal[lateralAxis] * negativeNormal[lateralAxis]
      : null;
  if (lateralProduct === null || lateralProduct >= -0.0025) {
    findings.push(
      architectureFinding(context, {
        code: 'ARCH_ROOF_AXIS',
        disposition: exactDisposition,
        message:
          'The two semantic gable slopes do not face opposite downhill directions in the declared roof-local frame.',
        affected: { node: negative.parts[0]?.nodeName ?? 'roof.slope.negative' },
        measurement: {
          name: 'slopeLateralNormalProduct',
          actual: lateralProduct,
          expected: '< -0.0025',
          threshold: -0.0025,
        },
      }),
    );
  }

  const { spanX, spanZ } = architecture.footprint;
  const expectedRidgeSpan = (ridgeAxis === 'x' ? spanX : spanZ) + architecture.roof.overhang * 2;
  const expectedLateralSpan =
    (lateralAxis === 'x' ? spanX : spanZ) + architecture.roof.overhang * 2;
  const ridgeCoverage = Math.min(
    extent(positive.bounds, ridgeAxis) / expectedRidgeSpan,
    extent(negative.bounds, ridgeAxis) / expectedRidgeSpan,
  );
  const roofMinLateral = Math.min(
    positive.bounds.min[lateralAxis],
    negative.bounds.min[lateralAxis],
  );
  const roofMaxLateral = Math.max(
    positive.bounds.max[lateralAxis],
    negative.bounds.max[lateralAxis],
  );
  const lateralCoverage = intervalCoverage(
    roofMinLateral,
    roofMaxLateral,
    -expectedLateralSpan / 2,
    expectedLateralSpan / 2,
  );
  if (ridgeCoverage < 0.9 || lateralCoverage < 0.9) {
    const actual = Math.min(ridgeCoverage, lateralCoverage);
    findings.push(
      architectureFinding(context, {
        code: 'ARCH_ROOF_AXIS',
        disposition: exactDisposition,
        message: `The semantic slopes cover ${(ridgeCoverage * 100).toFixed(1)}% of the ridge span and ${(lateralCoverage * 100).toFixed(1)}% of the ridge-to-eave span.`,
        measurement: {
          name: 'minimumRoofFootprintCoverageRatio',
          actual,
          expected: '>= 0.9',
          threshold: 0.9,
        },
        affected: { node: positive.parts[0]?.nodeName ?? 'roof.slope.positive' },
      }),
    );
  }

  const panels = evidence.parts.filter(
    (part) =>
      part.isMesh &&
      (part.directRoles.some((role) => role.startsWith('roof.panel.')) ||
        hasRole(part, 'roof.surface.panels') ||
        (hasRolePrefix(part, 'roof.') && /panel|sheet|shingle|seam|corrugat/i.test(part.nodeName))),
  );
  const wrongPanel = panels.find((panel) => {
    const ridgeExtent = extent(panel.bounds, ridgeAxis);
    const downhillExtent = Math.hypot(extent(panel.bounds, lateralAxis), extent(panel.bounds, 'y'));
    return ridgeExtent > downhillExtent * 1.05;
  });
  if (wrongPanel) {
    const ridgeExtent = extent(wrongPanel.bounds, ridgeAxis);
    const downhillExtent = Math.hypot(
      extent(wrongPanel.bounds, lateralAxis),
      extent(wrongPanel.bounds, 'y'),
    );
    findings.push(
      architectureFinding(context, {
        code: 'ARCH_ROOF_AXIS',
        disposition: exactDisposition,
        message: `Roof panel ${wrongPanel.nodeName} runs along the ridge instead of ridge-to-eave.`,
        affected: { node: wrongPanel.nodeName, nodePath: wrongPanel.nodePath },
        measurement: {
          name: 'panelRidgeToDownhillExtentRatio',
          actual: ridgeExtent / Math.max(EPSILON, downhillExtent),
          expected: '<= 1.05',
          threshold: 1.05,
        },
      }),
    );
  }

  const ridgeDistance = ridgeCrossSectionDistance(
    positive,
    negative,
    lateralAxis,
    architecture.roof.rise,
  );
  const ridgeTolerance = Math.max(0.04, expectedLateralSpan * 0.0125);
  if (!Number.isFinite(ridgeDistance) || ridgeDistance > ridgeTolerance) {
    findings.push(
      architectureFinding(context, {
        code: 'ARCH_RIDGE_GAP',
        disposition: exactDisposition,
        message: `The two slope high edges miss the declared ridge by ${Number.isFinite(ridgeDistance) ? ridgeDistance.toFixed(3) : 'an unmeasurable'} m.`,
        affected: { node: negative.parts[0]?.nodeName ?? 'roof.slope.negative' },
        measurement: {
          name: 'ridgeCrossSectionGap',
          actual: Number.isFinite(ridgeDistance) ? ridgeDistance : null,
          expected: `<= ${ridgeTolerance}`,
          threshold: ridgeTolerance,
          unit: 'm',
        },
      }),
    );
  }

  return findings;
}

function projectedGableArea(
  aggregateValue: ArchitectureAggregate,
  lateralAxis: HorizontalAxis,
): number {
  let area = 0;
  for (const triangle of aggregateValue.triangles) {
    const abLateral = triangle.b[lateralAxis] - triangle.a[lateralAxis];
    const abY = triangle.b.y - triangle.a.y;
    const acLateral = triangle.c[lateralAxis] - triangle.a[lateralAxis];
    const acY = triangle.c.y - triangle.a.y;
    area += Math.abs(abLateral * acY - abY * acLateral) / 2;
  }
  return area;
}

function endFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  if (!requestedGable(architecture) || !hasRoofDimensions(architecture)) return [];
  const closedEnds = architecture.roof.closedEnds;
  if (!closedEnds) return [];

  const positive = aggregateRole(evidence, 'roof.gable.positive');
  const negative = aggregateRole(evidence, 'roof.gable.negative');
  const hasTaggedRoof = taggedGable(evidence);
  const disposition = hasTaggedRoof ? ('block' as const) : ('warn' as const);
  const ridgeAxis = architecture.roof.ridgeAxis;
  const lateralAxis: HorizontalAxis = ridgeAxis === 'x' ? 'z' : 'x';
  const lateralSpan =
    lateralAxis === 'x' ? architecture.footprint.spanX : architecture.footprint.spanZ;
  const ridgeSpan = ridgeAxis === 'x' ? architecture.footprint.spanX : architecture.footprint.spanZ;
  const expectedArea = (lateralSpan * architecture.roof.rise) / 2;
  const findings: QaFinding[] = [];

  for (const [end, aggregateValue] of [
    ['positive', positive],
    ['negative', negative],
  ] as const) {
    if (!aggregateValue) {
      findings.push(
        architectureFinding(context, {
          code: 'ARCH_OPEN_GABLE',
          disposition,
          message: `closedEnds=true but roof.gable.${end} is missing.`,
          affected: { node: `roof.gable.${end}` },
          measurement: {
            name: `${end}GableCoverageRatio`,
            actual: 0,
            expected: '>= 0.9 boundary coverage',
            threshold: 0.9,
          },
        }),
      );
      continue;
    }

    const wallRole =
      ridgeAxis === 'x'
        ? end === 'positive'
          ? 'wall.front'
          : 'wall.back'
        : end === 'positive'
          ? 'wall.right'
          : 'wall.left';
    const endWall = aggregate(
      evidence.parts.filter((part) => part.isMesh && hasRole(part, wallRole)),
    );
    const gableCenter =
      (aggregateValue.bounds.min[ridgeAxis] + aggregateValue.bounds.max[ridgeAxis]) / 2;
    const expectedCenter = (end === 'positive' ? 1 : -1) * (ridgeSpan / 2);
    const endSeparation = endWall
      ? intervalSeparation(
          aggregateValue.bounds.min[ridgeAxis],
          aggregateValue.bounds.max[ridgeAxis],
          endWall.bounds.min[ridgeAxis],
          endWall.bounds.max[ridgeAxis],
        )
      : Math.abs(gableCenter - expectedCenter);
    const endTolerance = 0.05;
    if (endSeparation > endTolerance) {
      findings.push(
        architectureFinding(context, {
          code: 'ARCH_OPEN_GABLE',
          disposition,
          message: `roof.gable.${end} is ${endSeparation.toFixed(3)} m away from its ${wallRole} end boundary, so it does not close the shell.`,
          affected: {
            node: aggregateValue.parts[0]?.nodeName ?? `roof.gable.${end}`,
            nodePath: aggregateValue.parts[0]?.nodePath,
          },
          measurement: {
            name: `${end}GableEndSeparation`,
            actual: endSeparation,
            expected: `<= ${endTolerance}`,
            threshold: endTolerance,
            unit: 'm',
          },
        }),
      );
      continue;
    }

    const lateralCoverage = extent(aggregateValue.bounds, lateralAxis) / lateralSpan;
    const heightCoverage = extent(aggregateValue.bounds, 'y') / architecture.roof.rise;
    const areaCoverage =
      expectedArea > EPSILON ? projectedGableArea(aggregateValue, lateralAxis) / expectedArea : 1;
    const boundaryCoverage = Math.min(lateralCoverage, heightCoverage);
    if (boundaryCoverage < 0.9 || areaCoverage < 0.45) {
      findings.push(
        architectureFinding(context, {
          code: 'ARCH_OPEN_GABLE',
          disposition,
          message: `roof.gable.${end} is sparse: boundary coverage ${(boundaryCoverage * 100).toFixed(1)}%, projected filled area ${(areaCoverage * 100).toFixed(1)}%.`,
          affected: {
            node: aggregateValue.parts[0]?.nodeName ?? `roof.gable.${end}`,
            nodePath: aggregateValue.parts[0]?.nodePath,
          },
          measurement: {
            name: `${end}GableMinimumCoverageRatio`,
            actual: Math.min(boundaryCoverage, areaCoverage / 0.5),
            expected: '>= 0.9 boundary and >= 0.45 area',
            threshold: 0.9,
          },
        }),
      );
    }
  }

  return findings;
}

function pointInProjectedTriangle(
  x: number,
  z: number,
  triangle: ArchitectureTriangle,
): { inside: boolean; weights: [number, number, number] } {
  const ax = triangle.a.x;
  const az = triangle.a.z;
  const bx = triangle.b.x;
  const bz = triangle.b.z;
  const cx = triangle.c.x;
  const cz = triangle.c.z;
  const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(denominator) <= EPSILON) return { inside: false, weights: [0, 0, 0] };
  const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
  const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
  const wc = 1 - wa - wb;
  const tolerance = 1e-5;
  return {
    inside: wa >= -tolerance && wb >= -tolerance && wc >= -tolerance,
    weights: [wa, wb, wc],
  };
}

function nearestRoofHeight(
  triangles: readonly ArchitectureTriangle[],
  x: number,
  z: number,
  targetY: number,
): number | undefined {
  const heights: number[] = [];
  for (const triangle of triangles) {
    const projected = pointInProjectedTriangle(x, z, triangle);
    if (!projected.inside) continue;
    const [wa, wb, wc] = projected.weights;
    heights.push(wa * triangle.a.y + wb * triangle.b.y + wc * triangle.c.y);
  }
  return heights.sort((a, b) => Math.abs(a - targetY) - Math.abs(b - targetY))[0];
}

function envelopeFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  if (!requestedGable(architecture) || !hasRoofDimensions(architecture)) return [];
  const roof = aggregate(
    evidence.parts.filter(
      (part) =>
        part.isMesh &&
        (hasRole(part, 'roof.slope.positive') || hasRole(part, 'roof.slope.negative')),
    ),
  );
  if (!roof || roof.triangles.length === 0) return [];

  const ridgeAxis = architecture.roof.ridgeAxis;
  const lateralAxis: HorizontalAxis = ridgeAxis === 'x' ? 'z' : 'x';
  const ridgeSpan = ridgeAxis === 'x' ? architecture.footprint.spanX : architecture.footprint.spanZ;
  const lateralSpan =
    lateralAxis === 'x' ? architecture.footprint.spanX : architecture.footprint.spanZ;
  const wallRoles =
    ridgeAxis === 'x'
      ? (['wall.left', 'wall.right'] as const)
      : (['wall.front', 'wall.back'] as const);
  const findings: QaFinding[] = [];
  const gapTolerance = 0.05;
  const penetrationTolerance = 0.12;

  for (const [sideIndex, wallRole] of wallRoles.entries()) {
    const wall = aggregateRole(evidence, wallRole);
    if (!wall) continue;
    const sign = sideIndex === 0 ? -1 : 1;
    const lateral = sign * (lateralSpan / 2);
    const wallTop = wall.bounds.max.y;
    const offsets = [-0.4, 0, 0.4];
    const separations: number[] = [];
    for (const offset of offsets) {
      const ridge = offset * ridgeSpan;
      const x = ridgeAxis === 'x' ? ridge : lateral;
      const z = ridgeAxis === 'x' ? lateral : ridge;
      const roofY = nearestRoofHeight(roof.triangles, x, z, wallTop);
      if (roofY !== undefined) separations.push(roofY - wallTop);
    }
    if (separations.length === 0) continue;
    const worstGap = Math.max(...separations);
    const worstPenetration = -Math.min(...separations);
    if (worstGap > gapTolerance || worstPenetration > penetrationTolerance) {
      const daylight = worstGap > gapTolerance;
      findings.push(
        architectureFinding(context, {
          code: 'ARCH_ENVELOPE_GAP',
          disposition: 'warn',
          message: daylight
            ? `${wallRole} has a ${worstGap.toFixed(3)} m daylight gap to the roof underside at sampled bearing points.`
            : `${wallRole} penetrates the roof envelope by ${worstPenetration.toFixed(3)} m at sampled bearing points.`,
          affected: {
            node: wall.parts[0]?.nodeName ?? wallRole,
            nodePath: wall.parts[0]?.nodePath,
          },
          measurement: {
            name: daylight ? 'maximumWallRoofGap' : 'maximumWallRoofPenetration',
            actual: daylight ? worstGap : worstPenetration,
            expected: daylight ? `<= ${gapTolerance}` : `<= ${penetrationTolerance}`,
            threshold: daylight ? gapTolerance : penetrationTolerance,
            unit: 'm',
          },
        }),
      );
    }
  }

  return findings;
}

function boundsOverlap(a: Bounds3, b: Bounds3, tolerance = 0): boolean {
  return (
    a.min.x < b.max.x - tolerance &&
    a.max.x > b.min.x + tolerance &&
    a.min.y < b.max.y - tolerance &&
    a.max.y > b.min.y + tolerance &&
    a.min.z < b.max.z - tolerance &&
    a.max.z > b.min.z + tolerance
  );
}

function shrunkenPortalBounds(bounds: Bounds3, wall: string): Bounds3 {
  const result = { min: bounds.min.clone(), max: bounds.max.clone() };
  const widthAxis: HorizontalAxis = wall === 'front' || wall === 'back' ? 'z' : 'x';
  const normalAxis: HorizontalAxis = widthAxis === 'x' ? 'z' : 'x';
  const widthInset = Math.min(0.04, extent(result, widthAxis) * 0.08);
  const heightInset = Math.min(0.04, extent(result, 'y') * 0.04);
  result.min[widthAxis] += widthInset;
  result.max[widthAxis] -= widthInset;
  result.min.y += heightInset;
  result.max.y -= heightInset;
  // Keep the full normal passage depth: a wall or painted door crossing any of
  // it is a real blocker, not an edge-contact artifact.
  if (extent(result, normalAxis) <= EPSILON) {
    result.min[normalAxis] -= 0.01;
    result.max[normalAxis] += 0.01;
  }
  return result;
}

function portalRoleWall(roles: readonly string[]): string | undefined {
  for (const role of roles) {
    const match = /^opening\.(front|back|left|right)\.(?:door|portal|entry)(?:\.|$)/.exec(role);
    if (match) return match[1];
  }
  return undefined;
}

function portalFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  if (
    architecture.enterable !== true &&
    architecture.interiorMode !== 'navigable' &&
    !architecture.portal
  )
    return [];
  const requested = architecture.portal ?? { width: 1.1, height: 2.1, depth: 0.15 };
  const markers = evidence.parts.filter(
    (part) => !part.isMesh && portalRoleWall(part.directRoles) !== undefined,
  );
  if (markers.length === 0) {
    return [
      architectureFinding(context, {
        code: 'ARCH_BLOCKED_PORTAL',
        disposition: 'block',
        message:
          'enterable=true requires a non-rendered semantic opening.<wall>.door clearance node; no exterior-to-interior portal was found.',
        affected: { node: evidence.root.name || 'architecture-root' },
        measurement: {
          name: 'semanticPortalCount',
          actual: 0,
          expected: '>= 1',
          threshold: 1,
        },
      }),
    ];
  }

  const failures: Array<{
    marker: ArchitecturePart;
    wall: string;
    blocker?: ArchitecturePart;
    width: number;
    height: number;
    depth: number;
    placementCoverage: number;
    undersized: boolean;
    misplaced: boolean;
  }> = [];

  for (const marker of markers) {
    const wall = portalRoleWall(marker.directRoles)!;
    const widthAxis: HorizontalAxis = wall === 'front' || wall === 'back' ? 'z' : 'x';
    const depthAxis: HorizontalAxis = widthAxis === 'x' ? 'z' : 'x';
    const width = extent(marker.bounds, widthAxis);
    const height = extent(marker.bounds, 'y');
    const depth = extent(marker.bounds, depthAxis);
    const claimedWall = aggregate(
      evidence.parts.filter(
        (part) => part.isMesh && hasRole(part, `wall.${wall}`) && !hasRolePrefix(part, 'opening.'),
      ),
    );
    const placementCoverage = claimedWall
      ? Math.min(
          intervalCoverage(
            marker.bounds.min[depthAxis],
            marker.bounds.max[depthAxis],
            claimedWall.bounds.min[depthAxis],
            claimedWall.bounds.max[depthAxis],
          ),
          intervalCoverage(
            claimedWall.bounds.min[widthAxis],
            claimedWall.bounds.max[widthAxis],
            marker.bounds.min[widthAxis],
            marker.bounds.max[widthAxis],
          ),
          intervalCoverage(
            claimedWall.bounds.min.y,
            claimedWall.bounds.max.y,
            marker.bounds.min.y,
            marker.bounds.max.y,
          ),
        )
      : 0;
    const misplaced = placementCoverage < 0.9;
    const clearance = shrunkenPortalBounds(marker.bounds, wall);
    const blocker = evidence.parts.find((part) => {
      if (!part.isMesh) return false;
      if (
        hasRolePrefix(part, 'roof.') ||
        hasRole(part, 'floor') ||
        hasRolePrefix(part, 'opening.')
      ) {
        return false;
      }
      if (
        context.opening === true &&
        part.roles.some((role) => role === 'door.leaf' || role.startsWith('door.leaf.'))
      ) {
        return false;
      }
      return boundsOverlap(part.bounds, clearance, 0.004);
    });
    const undersized =
      width + 0.01 < requested.width ||
      height + 0.01 < requested.height ||
      depth + 0.01 < requested.depth;
    if (!blocker && !undersized && !misplaced) return [];
    failures.push({
      marker,
      wall,
      ...(blocker ? { blocker } : {}),
      width,
      height,
      depth,
      placementCoverage,
      undersized,
      misplaced,
    });
  }

  const failure = failures[0]!;
  const undersizedBy = Math.max(
    0,
    requested.width - failure.width,
    requested.height - failure.height,
    requested.depth - failure.depth,
  );
  return [
    architectureFinding(context, {
      code: 'ARCH_BLOCKED_PORTAL',
      disposition: 'block',
      message: failure.blocker
        ? `Portal ${failure.marker.nodeName} is blocked by ${failure.blocker.nodeName}; the semantic clearance does not connect exterior to interior.`
        : failure.undersized
          ? `Portal ${failure.marker.nodeName} is smaller than the requested ${requested.width.toFixed(2)} x ${requested.height.toFixed(2)} x ${requested.depth.toFixed(2)} m clearance.`
          : `Portal ${failure.marker.nodeName} overlaps only ${(failure.placementCoverage * 100).toFixed(1)}% of its claimed wall passage, so it does not connect exterior to interior through wall.${failure.wall}.`,
      affected: failure.blocker
        ? { node: failure.blocker.nodeName, nodePath: failure.blocker.nodePath }
        : { node: failure.marker.nodeName, nodePath: failure.marker.nodePath },
      measurement: failure.blocker
        ? {
            name: 'portalBlockerCount',
            actual: 1,
            expected: 0,
            threshold: 0,
          }
        : failure.undersized
          ? {
              name: 'maximumPortalClearanceDeficit',
              actual: undersizedBy,
              expected: 0,
              threshold: 0.01,
              unit: 'm',
            }
          : {
              name: 'portalClaimedWallCoverageRatio',
              actual: failure.placementCoverage,
              expected: '>= 0.9',
              threshold: 0.9,
            },
      viewHints: ['architecture.portal.eye'],
    }),
  ];
}

function storeyFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  const requested = architecture.storeyCount;
  if (requested === undefined) return [];
  const indexes = new Set<number>();
  for (const role of evidence.semanticRoles) {
    const match = /^(?:architecture\.)?floor\.storey\.(\d+)$/.exec(role);
    if (match) indexes.add(Number(match[1]));
  }
  // An unindexed floor can substantiate one storey; absence of all floor evidence cannot.
  if (
    requested === 1 &&
    indexes.size === 0 &&
    evidence.parts.some((part) => part.isMesh && hasRole(part, 'floor'))
  )
    return [];
  const actual = indexes.size;
  if (actual === requested) return [];
  return [
    architectureFinding(context, {
      code: 'ARCH_STOREY_COUNT',
      disposition: 'block',
      message: `Requested ${requested} storeys but found ${actual} distinct portable floor.storey.<index> roles.`,
      affected: { node: evidence.root.name || 'architecture-root' },
      measurement: {
        name: 'semanticStoreyCount',
        actual,
        expected: requested,
        threshold: requested,
      },
      viewHints: ['architecture.cutaway.dollhouse', 'generic.top.semantic-overlay'],
      repairText:
        'Add or remove only the requested floor levels, stamp each level once as floor.storey.<index>, and keep stairs and clearances aligned between consecutive levels.',
    }),
  ];
}

function interiorModeFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  const mode = architecture.interiorMode;
  if (mode === undefined) return [];
  const interiorEvidence = evidence.parts.filter((part) =>
    part.roles.some(
      (role) => role === 'architecture.interior.shell' || role.startsWith('interior.'),
    ),
  );
  const valid =
    mode === 'shell'
      ? interiorEvidence.length > 0
      : mode !== 'none' || interiorEvidence.length === 0;
  if (valid) return [];
  return [
    architectureFinding(context, {
      code: 'ARCH_INTERIOR_MODE',
      disposition: 'block',
      message:
        mode === 'shell'
          ? 'interiorMode=shell requires a portable architecture.interior.shell semantic volume.'
          : 'interiorMode=none conflicts with semantic interior geometry.',
      affected: {
        node: interiorEvidence[0]?.nodeName ?? evidence.root.name ?? 'architecture-root',
        nodePath: interiorEvidence[0]?.nodePath,
      },
      measurement: {
        name: 'semanticInteriorShellCount',
        actual: interiorEvidence.length,
        expected: mode === 'shell' ? '>= 1' : 0,
        threshold: mode === 'shell' ? 1 : 0,
      },
      viewHints: ['architecture.cutaway.dollhouse', 'architecture.floor-plan'],
      repairText:
        mode === 'shell'
          ? 'Add one non-rendering architecture.interior.shell volume matching the usable inner envelope; do not fake the interior with a painted exterior face.'
          : 'Remove the unrequested interior semantic volume or change trusted intent to shell/navigable before generation.',
    }),
  ];
}

function roofModeFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  const mode = architecture.roofMode ?? (architecture.roof?.type === 'none' ? 'none' : undefined);
  if (mode === undefined) return [];
  if (mode === 'auto') return [];
  const roofParts = evidence.parts.filter((part) => hasRolePrefix(part, 'roof.'));
  const removableRelationships = roofParts.flatMap((part) =>
    part.directRelationships.filter((relationship) => relationship.kind === 'separable-from'),
  );
  const present = roofParts.length > 0;
  const valid =
    mode === 'none'
      ? !present
      : mode === 'fixed'
        ? present && removableRelationships.length === 0
        : present && removableRelationships.length > 0;
  if (valid) return [];
  const measurement =
    mode === 'removable'
      ? {
          name: 'removableRoofRelationshipCount',
          actual: removableRelationships.length,
          expected: '>= 1',
          threshold: 1,
        }
      : {
          name: 'semanticRoofPartCount',
          actual: roofParts.length,
          expected: mode === 'none' ? 0 : '>= 1',
          threshold: mode === 'none' ? 0 : 1,
        };
  return [
    architectureFinding(context, {
      code: 'ARCH_ROOF_MODE',
      disposition: 'block',
      message: `roofMode=${mode} conflicts with ${roofParts.length} semantic roof parts and ${removableRelationships.length} separable-from relationships.`,
      affected: {
        node: roofParts[0]?.nodeName ?? evidence.root.name ?? 'architecture-root',
        nodePath: roofParts[0]?.nodePath,
      },
      measurement,
      viewHints: ['generic.top.semantic-overlay', 'architecture.cutaway.dollhouse'],
      repairText:
        'Match trusted roofMode exactly: omit all roof.* roles for none, keep fixed roofs attached, or stamp one roof assembly with a separable-from relationship for removable.',
    }),
  ];
}

function domeFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  if (
    architecture.roof?.type !== 'dome' ||
    !architecture.footprint ||
    architecture.roof.rise === undefined
  )
    return [];
  const dome = aggregate(
    evidence.parts.filter(
      (part) => part.isMesh && (hasRole(part, 'roof.dome') || hasRole(part, 'roof.surface.dome')),
    ),
  );
  const spanXCoverage = dome ? extent(dome.bounds, 'x') / architecture.footprint.spanX : 0;
  const spanZCoverage = dome ? extent(dome.bounds, 'z') / architecture.footprint.spanZ : 0;
  const riseCoverage = dome ? extent(dome.bounds, 'y') / architecture.roof.rise : 0;
  const minimumCoverage = Math.min(spanXCoverage, spanZCoverage, riseCoverage);
  if (minimumCoverage >= 0.9) return [];
  return [
    architectureFinding(context, {
      code: 'ARCH_DOME_PROFILE',
      disposition: 'block',
      message: `The semantic rotunda dome covers ${(spanXCoverage * 100).toFixed(1)}% X, ${(spanZCoverage * 100).toFixed(1)}% Z, and ${(riseCoverage * 100).toFixed(1)}% of declared rise.`,
      affected: {
        node: dome?.parts[0]?.nodeName ?? evidence.root.name ?? 'architecture-root',
        nodePath: dome?.parts[0]?.nodePath,
      },
      measurement: {
        name: 'minimumDomeCoverageRatio',
        actual: minimumCoverage,
        expected: '>= 0.9',
        threshold: 0.9,
      },
      viewHints: ['generic.top.semantic-overlay', 'architecture.cutaway.dollhouse'],
      repairText:
        'Rebuild the roof.dome hemisphere to cover the declared circular rotunda footprint and rise; preserve any intentional oculus as a bounded opening rather than shrinking the whole dome.',
    }),
  ];
}

interface ScaleBand {
  code: string;
  label: string;
  actual: number;
  minimum: number;
  maximum: number;
  unit: 'm';
  affected?: ArchitecturePart;
}

function scaleBandFinding(context: StructureQaInput, band: ScaleBand): QaFinding | undefined {
  if (band.actual >= band.minimum && band.actual <= band.maximum) return undefined;
  return architectureFinding(context, {
    code: band.code,
    disposition: 'warn',
    message: `${band.label} is ${band.actual.toFixed(3)} m; the realistic-scale observation band is ${band.minimum.toFixed(3)}–${band.maximum.toFixed(3)} m.`,
    ...(band.affected
      ? { affected: { node: band.affected.nodeName, nodePath: band.affected.nodePath } }
      : {}),
    measurement: {
      name: band.label,
      actual: band.actual,
      expected: `${band.minimum}..${band.maximum}`,
      threshold: band.actual < band.minimum ? band.minimum : band.maximum,
      unit: band.unit,
    },
    viewHints: ['architecture.cutaway.dollhouse'],
    repairText:
      'Adjust only the reported architecture dimension into the realistic band, or explicitly select scaleMode=stylized to retain intentional exaggeration.',
  });
}

function scaleFindings(
  context: StructureQaInput,
  architecture: StructureRequirements,
  evidence: ArchitectureSceneEvidence,
): QaFinding[] {
  if (architecture.scaleMode !== 'realistic') return [];
  const scaleBands = ARCHITECTURE_REALISTIC_SCALE_BANDS;
  const bands: ScaleBand[] = [];
  if (architecture.wallHeight !== undefined)
    bands.push({
      code: 'ARCH_SCALE_CEILING_HEIGHT',
      label: 'ceilingHeight',
      actual: architecture.wallHeight,
      ...scaleBands.ceilingHeight,
    });
  if (architecture.footprint)
    for (const axis of ['X', 'Z'] as const)
      bands.push({
        code: `ARCH_SCALE_FOOTPRINT_${axis}`,
        label: `footprintSpan${axis}`,
        actual: architecture.footprint[`span${axis}`],
        ...scaleBands.footprint,
      });

  const portal = evidence.parts.find(
    (part) => !part.isMesh && portalRoleWall(part.directRoles) !== undefined,
  );
  if (portal) {
    const wall = portalRoleWall(portal.directRoles)!;
    const widthAxis: HorizontalAxis = wall === 'front' || wall === 'back' ? 'z' : 'x';
    bands.push(
      {
        code: 'ARCH_SCALE_DOOR_WIDTH',
        label: 'doorClearWidth',
        actual: extent(portal.bounds, widthAxis),
        minimum: scaleBands.doorWidth.minimum,
        maximum: scaleBands.doorWidth.maximum,
        unit: 'm',
        affected: portal,
      },
      {
        code: 'ARCH_SCALE_DOOR_HEIGHT',
        label: 'doorClearHeight',
        actual: extent(portal.bounds, 'y'),
        minimum: scaleBands.doorHeight.minimum,
        maximum: scaleBands.doorHeight.maximum,
        unit: 'm',
        affected: portal,
      },
    );
  }

  const wallParts = evidence.parts.filter(
    (part) => part.isMesh && part.roles.some((role) => role.startsWith('wall.')),
  );
  for (const wall of wallParts) {
    const thickness = Math.min(extent(wall.bounds, 'x'), extent(wall.bounds, 'z'));
    bands.push({
      code: 'ARCH_SCALE_WALL_THICKNESS',
      label: 'wallThickness',
      actual: thickness,
      minimum: scaleBands.wallThickness.minimum,
      maximum: scaleBands.wallThickness.maximum,
      unit: 'm',
      affected: wall,
    });
  }

  const steps = evidence.parts.filter(
    (part) => part.isMesh && part.directRoles.some((role) => role.startsWith('stair.step')),
  );
  for (const step of steps) {
    bands.push(
      {
        code: 'ARCH_SCALE_STAIR_RISER',
        label: 'stairRiser',
        actual: extent(step.bounds, 'y'),
        minimum: scaleBands.stairRiser.minimum,
        maximum: scaleBands.stairRiser.maximum,
        unit: 'm',
        affected: step,
      },
      {
        code: 'ARCH_SCALE_STAIR_TREAD',
        label: 'stairTread',
        actual: Math.min(extent(step.bounds, 'x'), extent(step.bounds, 'z')),
        minimum: scaleBands.stairTread.minimum,
        maximum: scaleBands.stairTread.maximum,
        unit: 'm',
        affected: step,
      },
    );
  }

  return bands.flatMap((band) => {
    const finding = scaleBandFinding(context, band);
    return finding ? [finding] : [];
  });
}

/* Structural measurements consume explicit requests, independently of asset labels. */
export function inspectStructure(context: StructureQaInput): readonly QaFinding[] {
  const architecture = context.structure;
  if (!architecture) return [];
  const evidence = collectArchitectureEvidence(context.scene);
  if (!evidence) return [];
  return [
    ...storeyFindings(context, architecture, evidence),
    ...interiorModeFindings(context, architecture, evidence),
    ...roofModeFindings(context, architecture, evidence),
    ...domeFindings(context, architecture, evidence),
    ...roofFindings(context, architecture, evidence),
    ...endFindings(context, architecture, evidence),
    ...envelopeFindings(context, architecture, evidence),
    ...portalFindings(context, architecture, evidence),
    ...scaleFindings(context, architecture, evidence),
  ];
}

/** Old-data conformance adapter; not used by the neutral runtime. */
export function evaluateArchitectureQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'architecture') return [];
  return inspectStructure({
    scene: context.scene,
    profile: context.intent.qaProfile,
    structure: context.intent.architecture,
    opening: context.intent.capabilities.includes('openable'),
  });
}

export const ARCHITECTURE_QA_RULE: QaRule = {
  id: PROFILE_RULE_ID,
  profile: 'architecture.default',
  scope: { kind: 'category', category: 'architecture' },
  ruleClass: 'exact',
  owner: KILN_ENGINE_QA_OWNER,
  promotion: conformancePromotionAuthorization(
    'architecture-qa-v1',
    'src/qa/architecture.test.ts',
    'c3a3bdc764c62238cede39813995fcaa428131d0aa3774bcd86cfc8b60f36671',
  ),
  defaultMode: 'enforce',
  evaluate: (context) =>
    evaluateArchitectureQa(context).filter((finding) => finding.disposition === 'block'),
};

/** Inferred geometry and realistic-scale bands remain observe-only until QA-026 calibration. */
export const ARCHITECTURE_ADVISORY_QA_RULE: QaRule = {
  id: 'ARCHITECTURE_ADVISORY_PROFILE',
  profile: 'architecture.advisory',
  scope: { kind: 'category', category: 'architecture' },
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate: (context) =>
    evaluateArchitectureQa(context).filter((finding) => finding.disposition !== 'block'),
};

export const ARCHITECTURE_QA_RULES: readonly QaRule[] = [
  ARCHITECTURE_QA_RULE,
  ARCHITECTURE_ADVISORY_QA_RULE,
] as const;
