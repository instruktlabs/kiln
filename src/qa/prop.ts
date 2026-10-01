import * as THREE from 'three';

import { readSemanticMetadataV1 } from '../contracts';
import { conformancePromotionAuthorization, KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

const PROFILE = 'prop.capability';
const GROUND_TOLERANCE_METERS = 0.02;
const CLEARANCE_TOLERANCE_METERS = 0.004;

export const PROP_MOTION_KINDS = ['hinge', 'slider', 'spinner'] as const;
export type PropMotionKind = (typeof PROP_MOTION_KINDS)[number];

interface LocalPart {
  node: THREE.Object3D;
  roles: readonly string[];
  box?: THREE.Box3;
  renderable: boolean;
}

interface PropMotionAssembly {
  id: string;
  kind: PropMotionKind;
  pivot?: LocalPart;
  moving?: LocalPart;
  clearance?: LocalPart;
}

const stable = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

function finding(
  context: Pick<QaContext, 'intent'> | { profile: string },
  value: Omit<QaFinding, 'profile'>,
): QaFinding {
  return {
    ...value,
    profile: 'intent' in context ? context.intent.qaProfile || PROFILE : context.profile,
  };
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

function collectParts(root: THREE.Object3D, measureVertices = false): LocalPart[] {
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  const result: LocalPart[] = [];
  root.traverseVisible((node) => {
    const roles = rolesOf(node);
    const renderable = node instanceof THREE.Mesh;
    let box: THREE.Box3 | undefined;
    if (renderable && node.geometry instanceof THREE.BufferGeometry) {
      const position = node.geometry.getAttribute('position');
      node.geometry.computeBoundingBox();
      if (node.geometry.boundingBox) {
        const transform = rootInverse.clone().multiply(node.matrixWorld);
        // Placement needs actual base-geometry extents. Transforming a local
        // AABB invents empty corners on curved/sparse rotated meshes and can
        // both report a false size mismatch and conceal a real grounding gap.
        // Mechanism/clearance checks keep their deliberately conservative boxes.
        const measure = (matrix: THREE.Matrix4): THREE.Box3 => {
          if (!measureVertices || !position)
            return transformedBox(node.geometry.boundingBox!, matrix);
          const result = new THREE.Box3();
          const point = new THREE.Vector3();
          for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(matrix);
            result.expandByPoint(point);
          }
          return result;
        };
        if (node instanceof THREE.InstancedMesh) {
          box = new THREE.Box3();
          const instance = new THREE.Matrix4();
          for (let i = 0; i < node.count; i++) {
            node.getMatrixAt(i, instance);
            box.union(measure(transform.clone().multiply(instance)));
          }
        } else {
          box = measure(transform);
        }
      }
    } else if (roles.length > 0) {
      // Non-rendered semantic marker groups use their ordinary transform/scale
      // as a one-meter local prism, matching the architecture clearance contract.
      box = transformedBox(
        new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)),
        rootInverse.clone().multiply(node.matrixWorld),
      );
    }
    if (box?.isEmpty()) box = undefined;
    result.push({ node, roles, ...(box ? { box } : {}), renderable });
  });
  return result;
}

function descendantOf(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

function boxesOverlap(a: THREE.Box3, b: THREE.Box3, inset = 0): boolean {
  return (
    a.min.x < b.max.x - inset &&
    a.max.x > b.min.x + inset &&
    a.min.y < b.max.y - inset &&
    a.max.y > b.min.y + inset &&
    a.min.z < b.max.z - inset &&
    a.max.z > b.min.z + inset
  );
}

function motionAssemblies(parts: readonly LocalPart[]): PropMotionAssembly[] {
  const values = new Map<string, PropMotionAssembly>();
  const get = (kind: PropMotionKind, id: string): PropMotionAssembly => {
    const key = `${kind}:${id}`;
    let value = values.get(key);
    if (!value) {
      value = { kind, id };
      values.set(key, value);
    }
    return value;
  };
  for (const part of parts) {
    for (const role of part.roles) {
      const pivot = /^prop\.pivot\.(hinge|slider|spinner)\.([^.]+)$/.exec(role);
      if (pivot) get(pivot[1] as PropMotionKind, pivot[2]!).pivot = part;
      const moving = /^prop\.motion\.(hinge|slider|spinner)\.([^.]+)$/.exec(role);
      if (moving) get(moving[1] as PropMotionKind, moving[2]!).moving = part;
    }
  }
  // Resolve only after all assembly identities are known. A typed clearance
  // belongs to that kind; an untyped id is usable only when it is unambiguous.
  for (const part of parts) {
    for (const role of part.roles) {
      const match = /^prop\.clearance\.(?:(hinge|slider|spinner)\.)?([^.]+)$/.exec(role);
      if (!match) continue;
      if (match[1]) get(match[1] as PropMotionKind, match[2]!).clearance = part;
      else {
        const candidates = Array.from(values.values()).filter((value) => value.id === match[2]);
        if (candidates.length === 1) candidates[0]!.clearance = part;
      }
    }
  }
  return Array.from(values.values()).sort((a, b) =>
    `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
  );
}

function hasMotionAxis(part: LocalPart): boolean {
  const frames = readSemanticMetadataV1(part.node)?.frames ?? [];
  return frames.some((frame) => /^(?:prop\.)?(?:motion-)?axis\.[+-]?[xyz]$/.test(frame.id));
}

function usesExplicitLegacyProfile(context: QaContext): boolean {
  return (
    context.intent.qaProfile === 'prop.legacy' || context.intent.qaProfile === 'prop.legacy-control'
  );
}

function allowedClearanceContactRoles(assembly: PropMotionAssembly): ReadonlySet<string> {
  const result = new Set<string>();
  for (const part of [assembly.pivot, assembly.clearance]) {
    const metadata = part ? readSemanticMetadataV1(part.node) : undefined;
    for (const relationship of metadata?.relationships ?? []) {
      if (
        relationship.targetType === 'role' &&
        /^(?:mountedTo|allowsContact|allowsClearanceContact)$/.test(relationship.kind) &&
        /^prop\.articulation\.support\.[^.]+$/.test(relationship.target)
      ) {
        result.add(relationship.target);
      }
    }
  }
  return result;
}

function legacyArticulationEvidence(context: QaContext, root: THREE.Object3D): boolean {
  const joints: string[] = [];
  root.traverseVisible((node) => {
    if (/^(?:Joint|Pivot)[_.-]/i.test(node.name)) joints.push(node.name);
  });
  if (joints.length === 0) return false;
  const clips = (context.clips ?? []).filter(
    (clip): clip is THREE.AnimationClip => clip instanceof THREE.AnimationClip,
  );
  if ((context.intent.animation?.clips.length ?? 0) === 0 && clips.length === 0) return true;
  const targets = new Set(
    clips.flatMap((clip) => clip.tracks.map((track) => track.name.split('.')[0] ?? '')),
  );
  return joints.some((joint) => targets.has(joint));
}

/**
 * Exact articulated-prop contract. Canonical Joint_/Pivot_ names are accepted
 * only under an explicit legacy QA profile; names never bypass new-output
 * semantics. Geometry inference never becomes a blocker.
 */
export function evaluatePropArticulationQa(context: QaContext): readonly QaFinding[] {
  if (
    context.intent.category !== 'prop' ||
    !context.intent.capabilities.includes('articulated') ||
    !(context.scene instanceof THREE.Object3D)
  ) {
    return [];
  }
  if (
    usesExplicitLegacyProfile(context) &&
    motionAssemblies(collectParts(context.scene)).length === 0 &&
    legacyArticulationEvidence(context, context.scene)
  )
    return [];
  return inspectArticulation({
    scene: context.scene,
    profile: context.intent.qaProfile || PROFILE,
    requireEvidence: true,
  });
}

interface MechanismQaInput {
  scene: unknown;
  profile?: string;
  /** Historical contract only. A generic request does not require this modeling convention. */
  requireEvidence?: boolean;
}

/** Declared rigid mechanisms only; static prisms do not prove actual motion clearance. */
export function inspectArticulation(input: MechanismQaInput): readonly QaFinding[] {
  if (!(input.scene instanceof THREE.Object3D)) return [];
  const root = input.scene;
  const context = { profile: input.profile ?? 'asset.requirements.v1' };
  const parts = collectParts(root);
  const assemblies = motionAssemblies(parts);
  if (assemblies.length === 0) {
    if (!input.requireEvidence) return [];
    return [
      finding(context, {
        code: 'PROP_ARTICULATION_MISSING',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message:
          'articulated=true requires a semantic hinge, slider, or spinner assembly with a real pivot and moving subtree.',
        affected: { node: root.name || 'prop-root' },
        measurement: { name: 'motionAssemblyCount', actual: 0, expected: '>=1', threshold: 1 },
        viewHints: ['front', 'right', 'top'],
        repairText:
          'Create prop.pivot.<hinge|slider|spinner>.<id>, parent only prop.motion.<kind>.<id> beneath it, and add an axis frame plus prop.clearance.<id>.',
      }),
    ];
  }

  const findings: QaFinding[] = [];
  for (const assembly of assemblies) {
    const label = `${assembly.kind}.${assembly.id}`;
    if (!assembly.pivot) {
      findings.push(
        finding(context, {
          code: 'PROP_ARTICULATION_PIVOT_MISSING',
          disposition: 'block',
          dimension: 'categoryReadiness',
          message: `Motion assembly ${label} has no semantic pivot.`,
          affected: { node: assembly.moving?.node.name || label },
          measurement: { name: 'pivotCount', actual: 0, expected: 1, threshold: 1 },
          viewHints: ['right', 'top'],
          repairText: `Add prop.pivot.${label} at the physical hinge/rail/axle origin.`,
        }),
      );
      continue;
    }
    if (!hasMotionAxis(assembly.pivot)) {
      findings.push(
        finding(context, {
          code: 'PROP_ARTICULATION_AXIS_MISSING',
          disposition: 'block',
          dimension: 'categoryReadiness',
          message: `Motion pivot ${label} has no declared local axis frame.`,
          affected: {
            node: assembly.pivot.node.name || label,
            nodePath: nodePath(root, assembly.pivot.node),
          },
          measurement: { name: 'motionAxisFrameCount', actual: 0, expected: 1, threshold: 1 },
          viewHints: ['right', 'top'],
          repairText: `Add a normalized axis.+x, axis.+y, or axis.+z frame to prop.pivot.${label}.`,
        }),
      );
    }
    if (!assembly.moving || !descendantOf(assembly.moving.node, assembly.pivot.node)) {
      findings.push(
        finding(context, {
          code: 'PROP_ARTICULATION_SUBTREE_INVALID',
          disposition: 'block',
          dimension: 'categoryReadiness',
          message: `Motion assembly ${label} does not own exactly its declared moving subtree beneath the pivot.`,
          affected: {
            node: assembly.moving?.node.name || assembly.pivot.node.name || label,
            nodePath: assembly.moving ? nodePath(root, assembly.moving.node) : undefined,
          },
          measurement: {
            name: 'movingSubtreeParentedToPivot',
            actual: assembly.moving
              ? descendantOf(assembly.moving.node, assembly.pivot.node)
              : false,
            expected: true,
          },
          viewHints: ['front', 'right'],
          repairText: `Parent only prop.motion.${label} beneath prop.pivot.${label}; keep the static body outside that subtree.`,
        }),
      );
    }
    if (!assembly.clearance?.box) {
      findings.push(
        finding(context, {
          code: 'PROP_ARTICULATION_CLEARANCE_MISSING',
          disposition: 'block',
          dimension: 'categoryReadiness',
          message: `Motion assembly ${label} has no measurable semantic sweep/clearance prism.`,
          affected: { node: assembly.pivot.node.name || label },
          measurement: { name: 'clearanceMarkerCount', actual: 0, expected: 1, threshold: 1 },
          viewHints: ['front', 'right', 'top'],
          repairText: `Add a non-rendered scaled prop.clearance.${label} marker covering the requested motion sweep.`,
        }),
      );
      continue;
    }
    const allowedStationaryRoles = allowedClearanceContactRoles(assembly);
    const blocker = parts.find(
      (part) =>
        part.renderable &&
        part.box &&
        !descendantOf(part.node, assembly.pivot!.node) &&
        !part.roles.some((role) => allowedStationaryRoles.has(role)) &&
        boxesOverlap(part.box, assembly.clearance!.box!, CLEARANCE_TOLERANCE_METERS),
    );
    if (blocker) {
      findings.push(
        finding(context, {
          code: 'PROP_ARTICULATION_CLEARANCE_BLOCKED',
          disposition: 'block',
          dimension: 'categoryReadiness',
          message: `Motion sweep ${label} is blocked by ${blocker.node.name || 'an unnamed mesh'}.`,
          affected: {
            node: blocker.node.name || 'prop-motion-blocker',
            nodePath: nodePath(root, blocker.node),
          },
          measurement: {
            name: 'motionClearanceBlockerCount',
            actual: 1,
            expected: 0,
            threshold: 0,
          },
          viewHints: ['front', 'right', 'top'],
          repairText: `Remove only the reported blocker from prop.clearance.${label}; do not move unrelated geometry.`,
        }),
      );
    }
  }
  return findings;
}

function rolePart(parts: readonly LocalPart[], expression: RegExp): LocalPart | undefined {
  return parts.find((part) => part.roles.some((role) => expression.test(role)));
}

function interiorUsable(box: THREE.Box3, minimumExtent: number): boolean {
  const size = box.getSize(new THREE.Vector3());
  return [size.x, size.y, size.z].every((value) => value > 0 && value >= minimumExtent);
}

/** Exact negative-space checks activate only for authored semantic container markers. */
export function evaluatePropContainerQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'prop' || !(context.scene instanceof THREE.Object3D)) return [];
  const explicitlyOpen = context.intent.capabilities.includes('openable');
  const explicitContainment = /^(?:open-)?(?:container|chest|case|box)$/i.test(
    context.intent.subtype ?? '',
  );
  if (!explicitlyOpen && !explicitContainment) return [];
  if (usesExplicitLegacyProfile(context)) {
    // Preserve the W5 canonical-name control while keeping fallback narrow: a
    // jointed lid is evidence of an opening, but is never used to hard-judge
    // the invisible interior volume.
    const names: string[] = [];
    context.scene.traverseVisible((node) => names.push(node.name));
    const hasSemanticContainerEvidence = collectParts(context.scene).some((part) =>
      part.roles.some((role) => /^prop\.container\.(interior|opening)(?:\.|$)/.test(role)),
    );
    if (
      !hasSemanticContainerEvidence &&
      names.some((name) => /^(?:Joint|Pivot)[_.-].*(?:lid|door|hatch)/i.test(name)) &&
      names.some((name) => /(?:Mesh[_.-])?(?:lid|door|hatch)/i.test(name))
    ) {
      return [];
    }
  }
  return inspectContainerOpening({
    scene: context.scene,
    profile: context.intent.qaProfile || PROFILE,
    requireEvidence: explicitlyOpen,
    minimumInteriorExtent: 0.08,
  });
}

/** Declared opening markers only; no container subtype or human-scale size is inferred. */
export function inspectContainerOpening(
  input: MechanismQaInput & { minimumInteriorExtent?: number },
): readonly QaFinding[] {
  if (!(input.scene instanceof THREE.Object3D)) return [];
  const root = input.scene;
  const context = { profile: input.profile ?? 'asset.requirements.v1' };
  const minimumExtent = input.minimumInteriorExtent ?? 0;
  const parts = collectParts(root);
  const interior = rolePart(parts, /^prop\.container\.interior(?:\.|$)/);
  const opening = rolePart(parts, /^prop\.container\.opening(?:\.|$)/);
  if (!interior && !opening) {
    if (!input.requireEvidence) return [];
    return [
      finding(context, {
        code: 'PROP_CONTAINER_OPENING_MISSING',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message: 'openable=true has no semantic opening/interior markers or canonical jointed lid.',
        affected: { node: root.name || 'prop-root' },
        measurement: {
          name: 'containerOpeningEvidenceCount',
          actual: 0,
          expected: '>=1',
          threshold: 1,
        },
        viewHints: ['front', 'right', 'top'],
        repairText:
          'Author distinct prop.container.opening.main and prop.container.interior.main clearance markers; do not fill the interior with a solid mesh.',
      }),
    ];
  }

  const findings: QaFinding[] = [];
  if (!interior?.box) {
    findings.push(
      finding(context, {
        code: 'PROP_CONTAINER_INTERIOR_MISSING',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message: 'The semantic container profile has no measurable interior negative-space prism.',
        affected: { node: root.name || 'prop-root' },
        measurement: { name: 'containerInteriorMarkerCount', actual: 0, expected: 1, threshold: 1 },
        viewHints: ['front', 'top'],
        repairText:
          'Add a non-rendered scaled prop.container.interior.main marker inside the shell.',
      }),
    );
  } else if (!interiorUsable(interior.box, minimumExtent)) {
    const size = interior.box.getSize(new THREE.Vector3());
    findings.push(
      finding(context, {
        code: 'PROP_CONTAINER_INTERIOR_UNUSABLE',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message: 'The declared container interior has no usable three-dimensional negative space.',
        affected: {
          node: interior.node.name || 'container-interior',
          nodePath: nodePath(root, interior.node),
        },
        measurement: {
          name: 'minimumInteriorExtent',
          actual: stable(Math.min(size.x, size.y, size.z)),
          expected: minimumExtent > 0 ? `>=${minimumExtent}` : '>0',
          threshold: minimumExtent,
          unit: 'm',
        },
        viewHints: ['front', 'top'],
        repairText:
          minimumExtent > 0
            ? `Enlarge the interior marker and remove solid filler so all three clear extents are at least ${minimumExtent} m.`
            : 'Give the interior marker positive extents matching the requested usable space; do not infer a minimum size from the asset label.',
      }),
    );
  }
  if (!opening?.box) {
    findings.push(
      finding(context, {
        code: 'PROP_CONTAINER_OPENING_MISSING',
        disposition: 'block',
        dimension: 'categoryReadiness',
        message: 'The semantic container profile has no measurable opening into its interior.',
        affected: { node: root.name || 'prop-root' },
        measurement: { name: 'containerOpeningMarkerCount', actual: 0, expected: 1, threshold: 1 },
        viewHints: ['front', 'top'],
        repairText:
          'Add a non-rendered scaled prop.container.opening.main marker connecting outside to the interior.',
      }),
    );
  } else {
    const blocker = parts.find(
      (part) =>
        part.renderable &&
        part.box &&
        !part.roles.some(
          (role) =>
            role.startsWith('prop.container.shell') ||
            role.startsWith('prop.container.lid') ||
            role.startsWith('prop.motion.'),
        ) &&
        boxesOverlap(part.box, opening.box!, CLEARANCE_TOLERANCE_METERS),
    );
    if (blocker) {
      findings.push(
        finding(context, {
          code: 'PROP_CONTAINER_OPENING_BLOCKED',
          disposition: 'block',
          dimension: 'categoryReadiness',
          message: `Container opening is blocked by ${blocker.node.name || 'an unnamed solid filler'}.`,
          affected: {
            node: blocker.node.name || 'container-blocker',
            nodePath: nodePath(root, blocker.node),
          },
          measurement: {
            name: 'containerOpeningBlockerCount',
            actual: 1,
            expected: 0,
            threshold: 0,
          },
          viewHints: ['front', 'top'],
          repairText:
            'Remove or split only the reported filler so the opening connects to the interior negative space.',
        }),
      );
    }
  }
  return findings;
}

interface CircularMember {
  part: LocalPart;
  angle: number;
  center: THREE.Vector3;
  horizontalDirection?: THREE.Vector3;
}

function horizontalDirection(part: LocalPart, root: THREE.Object3D): THREE.Vector3 | undefined {
  if (!(part.node instanceof THREE.Mesh) || !(part.node.geometry instanceof THREE.BufferGeometry)) {
    return undefined;
  }
  part.node.geometry.computeBoundingBox();
  const box = part.node.geometry.boundingBox;
  if (!box) return undefined;
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  root.updateWorldMatrix(true, true);
  const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  return axis
    .applyQuaternion(part.node.getWorldQuaternion(new THREE.Quaternion()))
    .applyQuaternion(rootQuaternion)
    .setY(0)
    .normalize();
}

/** Likely circular-assembly defects remain advisory until human calibration. */
export function evaluatePropCircularAssemblyQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'prop' || !(context.scene instanceof THREE.Object3D)) return [];
  const root = context.scene;
  const parts = collectParts(root);
  const tagged = parts.some((part) =>
    part.roles.some(
      (role) => role === 'prop.circular.assembly' || role.startsWith('prop.circular.member.'),
    ),
  );
  const namedProfile = /(?:barrel|drum)/i.test(context.intent.subtype ?? '');
  if (!tagged && !namedProfile) return [];
  const memberParts = parts.filter(
    (part) =>
      part.box &&
      (part.roles.some((role) => role.startsWith('prop.circular.member.')) ||
        (namedProfile && /(?:stave|ring[_.-]?segment)/i.test(part.node.name))),
  );
  if (memberParts.length < 3) return [];
  const centers = memberParts.map((part) => part.box!.getCenter(new THREE.Vector3()));
  const ringCenter = centers
    .reduce((sum, center) => sum.add(center), new THREE.Vector3())
    .multiplyScalar(1 / centers.length);
  const members: CircularMember[] = memberParts.map((part, index) => {
    const center = centers[index]!;
    return {
      part,
      center,
      angle: Math.atan2(center.z - ringCenter.z, center.x - ringCenter.x),
      horizontalDirection: horizontalDirection(part, root),
    };
  });
  members.sort((a, b) => a.angle - b.angle);
  const gaps = members.map((member, index) => {
    const next = members[(index + 1) % members.length]!;
    return (next.angle - member.angle + Math.PI * 2) % (Math.PI * 2);
  });
  const expectedGap = (Math.PI * 2) / members.length;
  const maximumGap = Math.max(...gaps);
  const findings: QaFinding[] = [];
  if (maximumGap > Math.max(Math.PI / 3, expectedGap * 1.5)) {
    findings.push(
      finding(context, {
        code: 'PROP_CIRCULAR_RING_INCOMPLETE',
        disposition: 'warn',
        dimension: 'visualQuality',
        message: `Circular assembly has a likely missing sector of ${((maximumGap * 180) / Math.PI).toFixed(2)} degrees.`,
        affected: { node: root.name || 'prop-root' },
        measurement: {
          name: 'maximumAngularGap',
          actual: stable((maximumGap * 180) / Math.PI),
          expected: `<=${stable(Math.max(60, (expectedGap * 1.5 * 180) / Math.PI))}`,
          unit: 'deg',
        },
        viewHints: ['top', 'three-quarter'],
      }),
    );
  }
  const expectedOrientation = parts.some((part) =>
    part.roles.includes('prop.circular.expected.radial'),
  )
    ? 'radial'
    : 'tangent';
  const wrong = members.filter((member) => {
    if (!member.horizontalDirection) return false;
    const radial = member.center.clone().sub(ringCenter).setY(0).normalize();
    const tangent = new THREE.Vector3(-radial.z, 0, radial.x);
    const radialScore = Math.abs(member.horizontalDirection.dot(radial));
    const tangentScore = Math.abs(member.horizontalDirection.dot(tangent));
    return expectedOrientation === 'tangent'
      ? tangentScore + 0.1 < radialScore
      : radialScore + 0.1 < tangentScore;
  });
  if (wrong.length > 0) {
    findings.push(
      finding(context, {
        code: 'PROP_CIRCULAR_MEMBER_ORIENTATION',
        disposition: 'warn',
        dimension: 'visualQuality',
        message: `${wrong.length} circular members appear ${expectedOrientation === 'tangent' ? 'radial' : 'tangent'} instead of ${expectedOrientation}.`,
        affected: {
          node: wrong[0]!.part.node.name || 'circular-member',
          nodePath: nodePath(root, wrong[0]!.part.node),
        },
        measurement: {
          name: 'misorientedCircularMemberCount',
          actual: wrong.length,
          expected: 0,
          threshold: 0,
        },
        viewHints: ['top', 'three-quarter'],
      }),
    );
  }
  return findings;
}

export interface PlacementQaInput {
  scene?: unknown;
  profile?: string;
  bounds?: { x?: number; y?: number; z?: number };
  groundPlaneY?: number;
}

/** Asset-local extents and requested base contact. Measurements remain advisory. */
export function inspectPlacement(input: PlacementQaInput): readonly QaFinding[] {
  if (!(input.scene instanceof THREE.Object3D)) return [];
  const placementFinding = (value: Omit<QaFinding, 'profile'>): QaFinding => ({
    ...value,
    profile: input.profile ?? 'asset.requirements.v1',
  });
  const root = input.scene;
  const parts = collectParts(root, true);
  const renderable = parts.filter((part) => part.renderable && part.box);
  if (renderable.length === 0) return [];
  const bounds = renderable.reduce((box, part) => box.union(part.box!), new THREE.Box3());
  const size = bounds.getSize(new THREE.Vector3());
  const findings: QaFinding[] = [];
  for (const axis of ['x', 'y', 'z'] as const) {
    const expected = input.bounds?.[axis];
    if (expected === undefined) continue;
    const actual = size[axis];
    const tolerance = Math.max(0.05, expected * 0.2);
    if (Math.abs(actual - expected) <= tolerance) continue;
    findings.push(
      placementFinding({
        code: 'PROP_SCALE_BOUNDS_MISMATCH',
        disposition: 'warn',
        dimension: 'promptAlignment',
        message: `Asset ${axis.toUpperCase()} extent is ${actual.toFixed(4)} m, outside the declared ${expected.toFixed(4)} m scale band.`,
        affected: { node: root.name || 'prop-root', attribute: `bounds.${axis}` },
        measurement: {
          name: `bounds.${axis}`,
          actual: stable(actual),
          expected: stable(expected),
          threshold: stable(tolerance),
          unit: 'm',
        },
        viewHints: ['front', 'right', 'top'],
      }),
    );
  }
  if (input.groundPlaneY !== undefined) {
    if (Math.abs(bounds.min.y - input.groundPlaneY) > GROUND_TOLERANCE_METERS) {
      findings.push(
        placementFinding({
          code: 'PROP_GROUND_MISMATCH',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: `Requested grounded base is ${Math.abs(bounds.min.y - input.groundPlaneY).toFixed(6)} m ${bounds.min.y > input.groundPlaneY ? 'above' : 'below'} asset-local Y=${input.groundPlaneY}.`,
          affected: { node: root.name || 'prop-root' },
          measurement: {
            name: 'minimumY',
            actual: stable(bounds.min.y),
            expected: input.groundPlaneY,
            threshold: GROUND_TOLERANCE_METERS,
            unit: 'm',
          },
          viewHints: ['right', 'three-quarter'],
        }),
      );
    }
  }
  const placement = parts.find((part) => part.roles.includes('prop.pivot.placement'));
  if (placement) {
    const point = placement.node.getWorldPosition(new THREE.Vector3());
    point.applyMatrix4(root.matrixWorld.clone().invert());
    const horizontalOutside =
      point.x < bounds.min.x - GROUND_TOLERANCE_METERS ||
      point.x > bounds.max.x + GROUND_TOLERANCE_METERS ||
      point.z < bounds.min.z - GROUND_TOLERANCE_METERS ||
      point.z > bounds.max.z + GROUND_TOLERANCE_METERS;
    const verticalDelta = Math.abs(point.y - bounds.min.y);
    if (horizontalOutside || verticalDelta > GROUND_TOLERANCE_METERS) {
      findings.push(
        placementFinding({
          code: 'PROP_PLACEMENT_PIVOT_OFF_BASE',
          disposition: 'warn',
          dimension: 'categoryReadiness',
          message: 'Declared placement pivot is not on the asset support base.',
          affected: {
            node: placement.node.name || 'placement-pivot',
            nodePath: nodePath(root, placement.node),
          },
          measurement: {
            name: 'placementPivotBaseDelta',
            actual: stable(verticalDelta),
            expected: 0,
            threshold: GROUND_TOLERANCE_METERS,
            unit: 'm',
          },
          viewHints: ['right', 'top'],
        }),
      );
    }
  }
  return findings;
}

/** Old-data conformance adapter; current execution calls inspectPlacement directly. */
export function evaluatePropScalePivotQa(context: QaContext): readonly QaFinding[] {
  if (context.intent.category !== 'prop') return [];
  return inspectPlacement({
    scene: context.scene,
    profile: context.intent.qaProfile || PROFILE,
    bounds: context.intent.bounds,
    groundPlaneY: context.intent.capabilities.includes('grounded') ? 0 : undefined,
  });
}

export const PROP_EXACT_QA_RULE: QaRule = Object.freeze({
  id: 'PROP_CAPABILITY_EXACT_PROFILE',
  profile: PROFILE,
  scope: { kind: 'category' as const, category: 'prop' as const },
  ruleClass: 'exact',
  owner: KILN_ENGINE_QA_OWNER,
  promotion: conformancePromotionAuthorization(
    'prop-capability-v1',
    'src/qa/prop.test.ts',
    'a152104990fa6b92eea3c201ce39497a5d165ee19080a29e42b96ebe450d936c',
  ),
  defaultMode: 'enforce',
  evaluate: (context: QaContext) => [
    ...evaluatePropArticulationQa(context),
    ...evaluatePropContainerQa(context),
  ],
});

export const PROP_ADVISORY_QA_RULE: QaRule = Object.freeze({
  id: 'PROP_ADVISORY_PROFILE',
  profile: 'prop.advisory',
  scope: { kind: 'category' as const, category: 'prop' as const },
  ruleClass: 'heuristic',
  owner: KILN_ENGINE_QA_OWNER,
  defaultMode: 'observe',
  evaluate: (context: QaContext) => [
    ...evaluatePropCircularAssemblyQa(context),
    ...evaluatePropScalePivotQa(context),
  ],
});

export const PROP_QA_RULES: readonly QaRule[] = [
  PROP_EXACT_QA_RULE,
  PROP_ADVISORY_QA_RULE,
] as const;
