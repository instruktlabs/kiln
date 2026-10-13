/**
 * Body-plan-neutral character rig contracts and rigid/bone joint-chain
 * scaffolds. Presets are semantic data only; they do not introduce humanoid or
 * animal geometry primitive families.
 */
import * as THREE from 'three';

import { stampSemanticMetadataV1 } from './contracts';
import { GEOMETRY_ALLOCATION_LIMITS } from './geometry-budget';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

export { createSkinnedPart, type CreateSkinnedPartOptions } from './skin-binding';

export const KILN_CHARACTER_JOINT_EXTRAS_KEY = 'kilnCharacterJoint' as const;
export const KILN_CHARACTER_RIG_EXTRAS_KEY = 'kilnCharacterRig' as const;
export const KILN_CHARACTER_JOINT_SCHEMA_VERSION = 1 as const;

export const CHARACTER_BODY_PLANS = [
  'biped',
  'quadruped',
  'avian',
  'serpentine',
  'multi-limb',
  'wheeled',
  'custom',
] as const;
export type CharacterBodyPlan = (typeof CHARACTER_BODY_PLANS)[number];

export const CHARACTER_JOINT_SIDES = ['left', 'right', 'center'] as const;
export type CharacterJointSide = (typeof CHARACTER_JOINT_SIDES)[number];

export type CharacterVector3 = [number, number, number];
export type CharacterQuaternion = [number, number, number, number];

export interface CharacterJointRestTransformV1 {
  translation: CharacterVector3;
  rotation: CharacterQuaternion;
  scale: CharacterVector3;
}

/** Portable, node-local character-joint declaration preserved in glTF extras. */
export interface CharacterJointDescriptorV1 {
  schemaVersion: 1;
  role: string;
  aliases: string[];
  parentRole?: string;
  side: CharacterJointSide;
  rest: CharacterJointRestTransformV1;
  localForwardAxis: CharacterVector3;
  localBendAxis: CharacterVector3;
  endEffector: boolean;
  contact: boolean;
}

export interface CharacterJointDescriptorV1Input {
  role: string;
  aliases?: readonly string[];
  parentRole?: string;
  side?: CharacterJointSide;
  rest?: {
    translation?: CharacterVector3;
    rotation?: CharacterQuaternion;
    scale?: CharacterVector3;
  };
  localForwardAxis?: CharacterVector3;
  localBendAxis?: CharacterVector3;
  endEffector?: boolean;
  contact?: boolean;
}

export interface CharacterRigGraphV1 {
  schemaVersion: 1;
  bodyPlan: CharacterBodyPlan;
  joints: CharacterJointDescriptorV1[];
}

export interface CharacterRigGraphV1Input {
  bodyPlan: CharacterBodyPlan;
  joints: readonly (CharacterJointDescriptorV1 | CharacterJointDescriptorV1Input)[];
}

export interface CharacterContractIssue {
  code: string;
  path: string;
  message: string;
}

export interface CharacterJointValidationResult {
  valid: boolean;
  value?: CharacterJointDescriptorV1;
  issues: CharacterContractIssue[];
}

export interface CharacterRigValidationResult {
  valid: boolean;
  value?: CharacterRigGraphV1;
  issues: CharacterContractIssue[];
}

const IDENTITY_QUATERNION: CharacterQuaternion = [0, 0, 0, 1];
const UNIT_SCALE: CharacterVector3 = [1, 1, 1];
const FORWARD_AXIS: CharacterVector3 = [1, 0, 0];
const BEND_AXIS: CharacterVector3 = [0, 0, 1];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteTuple = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((component) => typeof component === 'number' && Number.isFinite(component));

const tuple3 = (value: readonly number[]): CharacterVector3 => [value[0]!, value[1]!, value[2]!];
const tuple4 = (value: readonly number[]): CharacterQuaternion => [
  value[0]!,
  value[1]!,
  value[2]!,
  value[3]!,
];

function validRole(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value);
}

function validateUnitVector(
  value: unknown,
  path: string,
  issues: CharacterContractIssue[],
): value is number[] {
  if (!isFiniteTuple(value, 3)) {
    issues.push({ code: 'INVALID_AXIS', path, message: `${path} must be three finite numbers.` });
    return false;
  }
  const magnitude = Math.hypot(...value);
  if (Math.abs(magnitude - 1) > 1e-6) {
    issues.push({ code: 'NON_UNIT_AXIS', path, message: `${path} must be normalized.` });
    return false;
  }
  return true;
}

export function cloneCharacterJointDescriptorV1(
  descriptor: CharacterJointDescriptorV1,
): CharacterJointDescriptorV1 {
  return {
    schemaVersion: KILN_CHARACTER_JOINT_SCHEMA_VERSION,
    role: descriptor.role,
    aliases: [...descriptor.aliases],
    ...(descriptor.parentRole ? { parentRole: descriptor.parentRole } : {}),
    side: descriptor.side,
    rest: {
      translation: tuple3(descriptor.rest.translation),
      rotation: tuple4(descriptor.rest.rotation),
      scale: tuple3(descriptor.rest.scale),
    },
    localForwardAxis: tuple3(descriptor.localForwardAxis),
    localBendAxis: tuple3(descriptor.localBendAxis),
    endEffector: descriptor.endEffector,
    contact: descriptor.contact,
  };
}

export function validateCharacterJointDescriptorV1(value: unknown): CharacterJointValidationResult {
  const issues: CharacterContractIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [
        { code: 'EXPECTED_OBJECT', path: '', message: 'Joint descriptor must be an object.' },
      ],
    };
  }
  if (value.schemaVersion !== KILN_CHARACTER_JOINT_SCHEMA_VERSION) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      path: 'schemaVersion',
      message: `schemaVersion must be ${KILN_CHARACTER_JOINT_SCHEMA_VERSION}.`,
    });
  }
  if (!validRole(value.role)) {
    issues.push({
      code: 'INVALID_ROLE',
      path: 'role',
      message: 'role must be a stable lowercase ID.',
    });
  }
  if (
    !Array.isArray(value.aliases) ||
    value.aliases.some((alias) => typeof alias !== 'string' || alias.trim().length === 0)
  ) {
    issues.push({
      code: 'INVALID_ALIASES',
      path: 'aliases',
      message: 'aliases must be non-empty strings.',
    });
  } else if (new Set(value.aliases).size !== value.aliases.length) {
    issues.push({ code: 'DUPLICATE_ALIAS', path: 'aliases', message: 'aliases must be unique.' });
  }
  if (value.parentRole !== undefined && !validRole(value.parentRole)) {
    issues.push({
      code: 'INVALID_PARENT_ROLE',
      path: 'parentRole',
      message: 'parentRole must be a stable lowercase ID.',
    });
  }
  if (!(CHARACTER_JOINT_SIDES as readonly unknown[]).includes(value.side)) {
    issues.push({
      code: 'INVALID_SIDE',
      path: 'side',
      message: 'side must be left, right, or center.',
    });
  }
  if (!isRecord(value.rest)) {
    issues.push({ code: 'INVALID_REST', path: 'rest', message: 'rest transform is required.' });
  } else {
    if (!isFiniteTuple(value.rest.translation, 3)) {
      issues.push({
        code: 'INVALID_REST_TRANSLATION',
        path: 'rest.translation',
        message: 'rest.translation must be three finite meters.',
      });
    }
    if (!isFiniteTuple(value.rest.rotation, 4)) {
      issues.push({
        code: 'INVALID_REST_ROTATION',
        path: 'rest.rotation',
        message: 'rest.rotation must be a finite quaternion.',
      });
    } else if (Math.abs(Math.hypot(...value.rest.rotation) - 1) > 1e-6) {
      issues.push({
        code: 'NON_UNIT_REST_ROTATION',
        path: 'rest.rotation',
        message: 'rest.rotation must be normalized.',
      });
    }
    if (
      !isFiniteTuple(value.rest.scale, 3) ||
      value.rest.scale.some((component) => component <= 0)
    ) {
      issues.push({
        code: 'INVALID_REST_SCALE',
        path: 'rest.scale',
        message: 'rest.scale must contain three positive finite values.',
      });
    }
  }
  const forwardAxis = value.localForwardAxis;
  const bendAxis = value.localBendAxis;
  const forwardValid = validateUnitVector(forwardAxis, 'localForwardAxis', issues);
  const bendValid = validateUnitVector(bendAxis, 'localBendAxis', issues);
  if (forwardValid && bendValid) {
    const dot =
      forwardAxis[0]! * bendAxis[0]! +
      forwardAxis[1]! * bendAxis[1]! +
      forwardAxis[2]! * bendAxis[2]!;
    if (Math.abs(dot) > 1e-6) {
      issues.push({
        code: 'NON_ORTHOGONAL_AXES',
        path: 'localBendAxis',
        message: 'local forward and bend axes must be orthogonal.',
      });
    }
  }
  if (typeof value.endEffector !== 'boolean') {
    issues.push({
      code: 'INVALID_END_EFFECTOR',
      path: 'endEffector',
      message: 'endEffector must be boolean.',
    });
  }
  if (typeof value.contact !== 'boolean') {
    issues.push({ code: 'INVALID_CONTACT', path: 'contact', message: 'contact must be boolean.' });
  }
  if (issues.length > 0) return { valid: false, issues };
  return {
    valid: true,
    value: cloneCharacterJointDescriptorV1(value as unknown as CharacterJointDescriptorV1),
    issues,
  };
}

export function createCharacterJointDescriptorV1(
  input: CharacterJointDescriptorV1Input,
): CharacterJointDescriptorV1 {
  const descriptor: CharacterJointDescriptorV1 = {
    schemaVersion: KILN_CHARACTER_JOINT_SCHEMA_VERSION,
    role: input.role,
    aliases: [...(input.aliases ?? [])],
    ...(input.parentRole ? { parentRole: input.parentRole } : {}),
    side: input.side ?? 'center',
    rest: {
      translation: tuple3(input.rest?.translation ?? [0, 0, 0]),
      rotation: tuple4(input.rest?.rotation ?? IDENTITY_QUATERNION),
      scale: tuple3(input.rest?.scale ?? UNIT_SCALE),
    },
    localForwardAxis: tuple3(input.localForwardAxis ?? FORWARD_AXIS),
    localBendAxis: tuple3(input.localBendAxis ?? BEND_AXIS),
    endEffector: input.endEffector ?? false,
    contact: input.contact ?? false,
  };
  const validation = validateCharacterJointDescriptorV1(descriptor);
  if (!validation.valid || !validation.value) {
    throw new TypeError(
      `Invalid CharacterJointDescriptorV1: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return validation.value;
}

export function validateCharacterRigGraphV1(value: unknown): CharacterRigValidationResult {
  const issues: CharacterContractIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [{ code: 'EXPECTED_OBJECT', path: '', message: 'Rig graph must be an object.' }],
    };
  }
  if (value.schemaVersion !== KILN_CHARACTER_JOINT_SCHEMA_VERSION) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      path: 'schemaVersion',
      message: `schemaVersion must be ${KILN_CHARACTER_JOINT_SCHEMA_VERSION}.`,
    });
  }
  if (!(CHARACTER_BODY_PLANS as readonly unknown[]).includes(value.bodyPlan)) {
    issues.push({
      code: 'INVALID_BODY_PLAN',
      path: 'bodyPlan',
      message: 'bodyPlan is unsupported.',
    });
  }
  if (!Array.isArray(value.joints) || value.joints.length === 0) {
    issues.push({ code: 'INVALID_JOINTS', path: 'joints', message: 'joints must not be empty.' });
  }
  const joints: CharacterJointDescriptorV1[] = [];
  if (Array.isArray(value.joints)) {
    value.joints.forEach((joint, index) => {
      const result = validateCharacterJointDescriptorV1(joint);
      if (result.value) joints.push(result.value);
      for (const issue of result.issues) {
        issues.push({ ...issue, path: `joints[${index}]${issue.path ? `.${issue.path}` : ''}` });
      }
    });
  }
  const byRole = new Map<string, number>();
  const aliasOwners = new Map<string, string>();
  joints.forEach((joint, index) => {
    const prior = byRole.get(joint.role);
    if (prior !== undefined) {
      issues.push({
        code: 'DUPLICATE_JOINT_ROLE',
        path: `joints[${index}].role`,
        message: `role ${joint.role} duplicates joints[${prior}].role.`,
      });
    } else byRole.set(joint.role, index);
    for (const alias of joint.aliases) {
      const owner = aliasOwners.get(alias);
      if (owner && owner !== joint.role) {
        issues.push({
          code: 'AMBIGUOUS_JOINT_ALIAS',
          path: `joints[${index}].aliases`,
          message: `alias ${alias} is already owned by ${owner}.`,
        });
      } else aliasOwners.set(alias, joint.role);
    }
  });
  joints.forEach((joint, index) => {
    if (joint.parentRole && !byRole.has(joint.parentRole)) {
      issues.push({
        code: 'UNKNOWN_PARENT_ROLE',
        path: `joints[${index}].parentRole`,
        message: `parentRole ${joint.parentRole} is not declared.`,
      });
    }
    const seen = new Set<string>([joint.role]);
    let cursor = joint.parentRole;
    while (cursor) {
      if (seen.has(cursor)) {
        issues.push({
          code: 'JOINT_PARENT_CYCLE',
          path: `joints[${index}].parentRole`,
          message: `parent chain for ${joint.role} contains a cycle at ${cursor}.`,
        });
        break;
      }
      seen.add(cursor);
      const parentIndex = byRole.get(cursor);
      cursor = parentIndex === undefined ? undefined : joints[parentIndex]?.parentRole;
    }
  });
  if (issues.length > 0) return { valid: false, issues };
  return {
    valid: true,
    value: {
      schemaVersion: KILN_CHARACTER_JOINT_SCHEMA_VERSION,
      bodyPlan: value.bodyPlan as CharacterBodyPlan,
      joints: joints.map(cloneCharacterJointDescriptorV1),
    },
    issues,
  };
}

export function createCharacterRigGraphV1(input: CharacterRigGraphV1Input): CharacterRigGraphV1 {
  const graph = {
    schemaVersion: KILN_CHARACTER_JOINT_SCHEMA_VERSION,
    bodyPlan: input.bodyPlan,
    joints: input.joints.map((joint) =>
      'schemaVersion' in joint
        ? cloneCharacterJointDescriptorV1(joint)
        : createCharacterJointDescriptorV1(joint),
    ),
  };
  const result = validateCharacterRigGraphV1(graph);
  if (!result.valid || !result.value) {
    throw new TypeError(
      `Invalid CharacterRigGraphV1: ${result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return result.value;
}

export function stampCharacterRigGraphV1<T extends { userData: Record<string, unknown> }>(
  target: T,
  input: CharacterRigGraphV1 | CharacterRigGraphV1Input,
): T {
  const graph = createCharacterRigGraphV1(input);
  stampSemanticMetadataV1(target, {
    roles: ['character.rig', `character.body-plan.${graph.bodyPlan}`],
    relationships: graph.joints.map((joint) => ({
      kind: 'contains-joint',
      target: `joint.${joint.role}`,
      targetType: 'role' as const,
    })),
  });
  target.userData[KILN_CHARACTER_RIG_EXTRAS_KEY] = createCharacterRigGraphV1(graph);
  return target;
}

export function readCharacterRigGraphV1(target: {
  userData?: Record<string, unknown>;
}): CharacterRigGraphV1 | undefined {
  const value = target.userData?.[KILN_CHARACTER_RIG_EXTRAS_KEY];
  const result = validateCharacterRigGraphV1(value);
  return result.valid ? result.value : undefined;
}

function axisQuaternion(from: CharacterVector3, to: CharacterVector3): CharacterQuaternion {
  const value = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(...from),
    new THREE.Vector3(...to),
  );
  return [value.x, value.y, value.z, value.w];
}

export function stampCharacterJointDescriptorV1<T extends { userData: Record<string, unknown> }>(
  target: T,
  input: CharacterJointDescriptorV1 | CharacterJointDescriptorV1Input,
): T {
  const descriptor = createCharacterJointDescriptorV1(input);
  const frames = [
    { id: 'rest', translation: [0, 0, 0] as CharacterVector3, rotation: IDENTITY_QUATERNION },
    {
      id: 'forward',
      translation: [0, 0, 0] as CharacterVector3,
      rotation: axisQuaternion(FORWARD_AXIS, descriptor.localForwardAxis),
    },
    {
      id: 'bend',
      translation: [0, 0, 0] as CharacterVector3,
      rotation: axisQuaternion([0, 1, 0], descriptor.localBendAxis),
    },
    ...(descriptor.endEffector
      ? [
          {
            id: 'end-effector',
            translation: [0, 0, 0] as CharacterVector3,
            rotation: IDENTITY_QUATERNION,
          },
        ]
      : []),
    ...(descriptor.contact
      ? [
          {
            id: 'contact',
            translation: [0, 0, 0] as CharacterVector3,
            rotation: IDENTITY_QUATERNION,
          },
        ]
      : []),
  ];
  stampSemanticMetadataV1(target, {
    roles: [
      'skeleton.joint',
      `joint.${descriptor.role}`,
      `joint.side.${descriptor.side}`,
      ...descriptor.aliases.map((alias) => `joint.alias.${alias}`),
      ...(descriptor.endEffector ? ['joint.end-effector'] : []),
      ...(descriptor.contact ? ['contact.ground'] : []),
    ],
    relationships: descriptor.parentRole
      ? [{ kind: 'parent-joint', target: `joint.${descriptor.parentRole}`, targetType: 'role' }]
      : [],
    frames,
    sockets: [
      ...(descriptor.endEffector
        ? [
            {
              id: 'end-effector',
              type: 'character.attachment',
              frame: 'end-effector',
              compatibleTypes: ['character.held-item'],
            },
          ]
        : []),
      ...(descriptor.contact
        ? [
            {
              id: 'ground-contact',
              type: 'character.contact',
              frame: 'contact',
              compatibleTypes: ['world.ground'],
            },
          ]
        : []),
    ],
  });
  target.userData[KILN_CHARACTER_JOINT_EXTRAS_KEY] = cloneCharacterJointDescriptorV1(descriptor);
  return target;
}

export function readCharacterJointDescriptorV1(target: {
  userData?: Record<string, unknown>;
}): CharacterJointDescriptorV1 | undefined {
  const value = target.userData?.[KILN_CHARACTER_JOINT_EXTRAS_KEY];
  const result = validateCharacterJointDescriptorV1(value);
  return result.valid ? result.value : undefined;
}

export interface JointChainSegmentV1 {
  role: string;
  aliases?: readonly string[];
  offset: CharacterVector3;
  restRotation?: CharacterQuaternion;
  restScale?: CharacterVector3;
  side?: CharacterJointSide;
  localForwardAxis?: CharacterVector3;
  localBendAxis?: CharacterVector3;
  endEffector?: boolean;
  contact?: boolean;
}

export interface CreateJointChainOptionsV1 {
  parent?: THREE.Object3D;
  /** Semantic parent role for the first node when `parent` is a declared joint. */
  parentRole?: string;
}

export interface JointChainResultV1 {
  root: THREE.Object3D;
  end: THREE.Object3D;
  nodes: THREE.Object3D[];
  byRole: ReadonlyMap<string, THREE.Object3D>;
  descriptors: CharacterJointDescriptorV1[];
}

export function characterJointNodeName(chainName: string, role: string): string {
  const safeChain = chainName
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeRole = role.replace(/[^A-Za-z0-9]+/g, '_');
  if (!safeChain)
    throw new TypeError('createJointChain chainName must contain a letter or number.');
  return `Joint_${safeChain}_${safeRole}`;
}

/**
 * Create one deterministic parented chain. The helper owns only pivots, local
 * rest transforms, frames, and semantic metadata; callers remain free to build
 * any biped, quadruped, wing, tail, tentacle, or custom geometry around it.
 */
export function createJointChain(
  chainName: string,
  segments: readonly JointChainSegmentV1[],
  options: CreateJointChainOptionsV1 = {},
): JointChainResultV1 {
  if (segments.length === 0) throw new TypeError('createJointChain requires at least one segment.');
  const seen = new Set<string>();
  const nodes: THREE.Object3D[] = [];
  const descriptors: CharacterJointDescriptorV1[] = [];
  const byRole = new Map<string, THREE.Object3D>();
  let parent = options.parent;
  let parentRole = options.parentRole;
  for (const segment of segments) {
    if (seen.has(segment.role)) throw new TypeError(`Duplicate joint-chain role: ${segment.role}.`);
    seen.add(segment.role);
    const descriptor = createCharacterJointDescriptorV1({
      role: segment.role,
      aliases: segment.aliases,
      ...(parentRole ? { parentRole } : {}),
      side: segment.side,
      rest: {
        translation: segment.offset,
        rotation: segment.restRotation,
        scale: segment.restScale,
      },
      localForwardAxis: segment.localForwardAxis,
      localBendAxis: segment.localBendAxis,
      endEffector: segment.endEffector,
      contact: segment.contact,
    });
    const node = new THREE.Object3D();
    node.name = characterJointNodeName(chainName, segment.role);
    node.position.fromArray(descriptor.rest.translation);
    node.quaternion.fromArray(descriptor.rest.rotation);
    node.scale.fromArray(descriptor.rest.scale);
    stampCharacterJointDescriptorV1(node, descriptor);
    if (parent) parent.add(node);
    parent = node;
    parentRole = descriptor.role;
    nodes.push(node);
    descriptors.push(descriptor);
    byRole.set(descriptor.role, node);
  }
  return {
    root: nodes[0]!,
    end: nodes[nodes.length - 1]!,
    nodes,
    byRole,
    descriptors,
  };
}

export interface CharacterJointNodeEvidenceV1 {
  node: THREE.Object3D;
  nodePath: string;
  descriptor: CharacterJointDescriptorV1;
}

export interface BoneChainResultV1 extends JointChainResultV1 {
  root: THREE.Bone;
  end: THREE.Bone;
  nodes: THREE.Bone[];
  byRole: ReadonlyMap<string, THREE.Bone>;
}

/** Opt-in semantic bones. Existing createJointChain continues to make rigid pivots. */
export function createBoneChain(
  chainName: string,
  segments: readonly JointChainSegmentV1[],
  options: CreateJointChainOptionsV1 = {},
): BoneChainResultV1 {
  try {
    return buildBoneChain(chainName, segments, options);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError)
      throw new AuthoringDiagnosticError('BONE_CHAIN_ARGUMENT', error.message);
    throw error;
  }
}

function buildBoneChain(
  chainName: string,
  segments: readonly JointChainSegmentV1[],
  options: CreateJointChainOptionsV1 = {},
): BoneChainResultV1 {
  if (
    !Array.isArray(segments) ||
    segments.length < 1 ||
    segments.length > GEOMETRY_ALLOCATION_LIMITS.skinBones
  )
    throw new RangeError(
      `createBoneChain segment limit is 1..${GEOMETRY_ALLOCATION_LIMITS.skinBones}.`,
    );
  if (options.parent !== undefined && !options.parent.isObject3D)
    throw new TypeError('createBoneChain parent must be an Object3D.');
  const parentDescriptor = options.parent
    ? readCharacterJointDescriptorV1(options.parent)
    : undefined;
  if (options.parentRole !== undefined && options.parentRole !== parentDescriptor?.role)
    throw new TypeError('createBoneChain parentRole must match the declared parent joint.');
  const roles = new Set<string>(),
    names = new Set<string>();
  if (options.parent) {
    let top = options.parent;
    while (top.parent) top = top.parent;
    top.traverse((node) => {
      if (node.name) names.add(node.name);
      const descriptor = readCharacterJointDescriptorV1(node);
      if (descriptor) roles.add(descriptor.role);
    });
  }
  let parentRole = parentDescriptor?.role;
  // Validate the complete chain before allocating nodes or parenting any of them.
  const descriptors = segments.map((segment) => {
    const descriptor = createCharacterJointDescriptorV1({
      role: segment.role,
      aliases: segment.aliases,
      parentRole,
      side: segment.side,
      rest: {
        translation: segment.offset,
        rotation: segment.restRotation,
        scale: segment.restScale,
      },
      localForwardAxis: segment.localForwardAxis,
      localBendAxis: segment.localBendAxis,
      endEffector: segment.endEffector,
      contact: segment.contact,
    });
    const name = characterJointNodeName(chainName, descriptor.role);
    if (roles.has(descriptor.role))
      throw new TypeError(`createBoneChain duplicate role: ${descriptor.role}.`);
    if (names.has(name))
      throw new TypeError(`createBoneChain duplicate node name after sanitization: ${name}.`);
    roles.add(descriptor.role);
    names.add(name);
    parentRole = descriptor.role;
    return descriptor;
  });
  const nodes = descriptors.map((descriptor) => {
    const node = new THREE.Bone();
    node.name = characterJointNodeName(chainName, descriptor.role);
    node.position.fromArray(descriptor.rest.translation);
    node.quaternion.fromArray(descriptor.rest.rotation);
    node.scale.fromArray(descriptor.rest.scale);
    stampCharacterJointDescriptorV1(node, descriptor);
    return node;
  });
  for (let i = 1; i < nodes.length; i++) nodes[i - 1]!.add(nodes[i]!);
  if (options.parent) options.parent.add(nodes[0]!);
  return {
    root: nodes[0]!,
    end: nodes[nodes.length - 1]!,
    nodes,
    byRole: new Map(descriptors.map((descriptor, i) => [descriptor.role, nodes[i]!])),
    descriptors,
  };
}

/** Deterministic indexed paths shared by QA and diagnostic descriptors. */
export function collectCharacterJointNodes(root: THREE.Object3D): CharacterJointNodeEvidenceV1[] {
  const joints: CharacterJointNodeEvidenceV1[] = [];
  const visit = (node: THREE.Object3D, parentPath: string, siblingIndex: number): void => {
    const segment = `${node.name.trim() || node.type || 'Object3D'}[${siblingIndex}]`;
    const nodePath = parentPath ? `${parentPath}/${segment}` : segment;
    const descriptor = readCharacterJointDescriptorV1(node);
    if (descriptor) joints.push({ node, nodePath, descriptor });
    node.children.forEach((child, index) => {
      visit(child, nodePath, index);
    });
  };
  visit(root, '', 0);
  return joints;
}

const presetJoint = (
  role: string,
  parentRole: string | undefined,
  translation: CharacterVector3,
  options: Omit<CharacterJointDescriptorV1Input, 'role' | 'parentRole' | 'rest'> = {},
): CharacterJointDescriptorV1 =>
  createCharacterJointDescriptorV1({
    role,
    ...(parentRole ? { parentRole } : {}),
    ...options,
    rest: { translation },
  });

export const BIPED_RIG_PRESET_V1: CharacterRigGraphV1 = createCharacterRigGraphV1({
  bodyPlan: 'biped',
  joints: [
    presetJoint('hips', undefined, [0, 1, 0], { aliases: ['pelvis'] }),
    presetJoint('spine', 'hips', [0, 0.45, 0], { aliases: ['torso'] }),
    presetJoint('head', 'spine', [0, 0.55, 0]),
    presetJoint('shoulder.left', 'spine', [0, 0.3, -0.25], { side: 'left' }),
    presetJoint('elbow.left', 'shoulder.left', [0, -0.35, 0], { side: 'left' }),
    presetJoint('wrist.left', 'elbow.left', [0, -0.35, 0], {
      side: 'left',
      aliases: ['hand.left', 'grip.left'],
      endEffector: true,
    }),
    presetJoint('shoulder.right', 'spine', [0, 0.3, 0.25], { side: 'right' }),
    presetJoint('elbow.right', 'shoulder.right', [0, -0.35, 0], { side: 'right' }),
    presetJoint('wrist.right', 'elbow.right', [0, -0.35, 0], {
      side: 'right',
      aliases: ['hand.right', 'grip.right'],
      endEffector: true,
    }),
    presetJoint('hip.left', 'hips', [0, -0.1, -0.14], { side: 'left' }),
    presetJoint('knee.left', 'hip.left', [0, -0.45, 0], { side: 'left' }),
    presetJoint('ankle.left', 'knee.left', [0, -0.45, 0], {
      side: 'left',
      aliases: ['foot.left'],
      endEffector: true,
      contact: true,
    }),
    presetJoint('hip.right', 'hips', [0, -0.1, 0.14], { side: 'right' }),
    presetJoint('knee.right', 'hip.right', [0, -0.45, 0], { side: 'right' }),
    presetJoint('ankle.right', 'knee.right', [0, -0.45, 0], {
      side: 'right',
      aliases: ['foot.right'],
      endEffector: true,
      contact: true,
    }),
  ],
});

export const QUADRUPED_RIG_PRESET_V1: CharacterRigGraphV1 = createCharacterRigGraphV1({
  bodyPlan: 'quadruped',
  joints: [
    presetJoint('hips', undefined, [0, 0.8, 0], { aliases: ['pelvis'] }),
    presetJoint('spine', 'hips', [0.7, 0, 0]),
    presetJoint('neck', 'spine', [0.45, 0.1, 0]),
    presetJoint('head', 'neck', [0.3, 0, 0]),
    presetJoint('shoulder.fore.left', 'spine', [0.2, -0.1, -0.28], { side: 'left' }),
    presetJoint('elbow.fore.left', 'shoulder.fore.left', [0, -0.4, 0], { side: 'left' }),
    presetJoint('paw.fore.left', 'elbow.fore.left', [0, -0.3, 0], {
      side: 'left',
      endEffector: true,
      contact: true,
    }),
    presetJoint('shoulder.fore.right', 'spine', [0.2, -0.1, 0.28], { side: 'right' }),
    presetJoint('elbow.fore.right', 'shoulder.fore.right', [0, -0.4, 0], { side: 'right' }),
    presetJoint('paw.fore.right', 'elbow.fore.right', [0, -0.3, 0], {
      side: 'right',
      endEffector: true,
      contact: true,
    }),
    presetJoint('hip.hind.left', 'hips', [0, -0.1, -0.28], { side: 'left' }),
    presetJoint('knee.hind.left', 'hip.hind.left', [0, -0.4, 0], { side: 'left' }),
    presetJoint('paw.hind.left', 'knee.hind.left', [0, -0.3, 0], {
      side: 'left',
      endEffector: true,
      contact: true,
    }),
    presetJoint('hip.hind.right', 'hips', [0, -0.1, 0.28], { side: 'right' }),
    presetJoint('knee.hind.right', 'hip.hind.right', [0, -0.4, 0], { side: 'right' }),
    presetJoint('paw.hind.right', 'knee.hind.right', [0, -0.3, 0], {
      side: 'right',
      endEffector: true,
      contact: true,
    }),
  ],
});

export function expandCharacterRigPreset(bodyPlan: 'biped' | 'quadruped'): CharacterRigGraphV1 {
  const source = bodyPlan === 'biped' ? BIPED_RIG_PRESET_V1 : QUADRUPED_RIG_PRESET_V1;
  return createCharacterRigGraphV1(source);
}

/** Return only the already-resolved body-plan recipe for prompt/skill injection. */
export function characterBodyPlanRecipe(
  bodyPlan: CharacterBodyPlan,
  customGraph?: CharacterRigGraphV1,
): string {
  if (bodyPlan === 'biped') {
    return 'Resolved body plan: BIPED. Declare hips → spine → head; paired shoulder → elbow → wrist and hip → knee → ankle chains. Wrists are grip end effectors; ankles are Y=0 contacts. Animate only unique Joint_* nodes and preserve +X locomotion.';
  }
  if (bodyPlan === 'quadruped') {
    return 'Resolved body plan: QUADRUPED. Declare hips → spine → neck → head plus left/right fore shoulder → elbow → paw and left/right hind hip → knee → paw chains. All four paws are Y=0 contacts; locomotion travels +X.';
  }
  if (bodyPlan === 'avian') {
    return 'Resolved body plan: AVIAN. Declare an axial torso/neck/head graph, paired shoulder → wing-mid → wing-tip chains, and the requested leg/contact chains. Wing tips are end effectors; preserve +X flight direction.';
  }
  if (bodyPlan === 'serpentine') {
    return 'Resolved body plan: SERPENTINE. Build one continuous axial root → spine segments → tail-tip graph with explicit local bend axes and requested ground contacts. Do not add humanoid limb assumptions; locomotion travels +X.';
  }
  if (bodyPlan === 'multi-limb') {
    return 'Resolved body plan: MULTI-LIMB. Expand exactly the declared custom role graph, keep every branch parent edge explicit, and tag each requested terminal/contact node. Do not collapse repeated branches into duplicate Joint_* names.';
  }
  if (bodyPlan === 'wheeled') {
    return 'Resolved body plan: WHEELED CHARACTER. Declare the character core and each articulated appendage as explicit unique joint roles; keep wheel locomotion semantics separate from limb/contact roles and travel +X.';
  }
  const roles = customGraph?.joints.map((joint) => joint.role).join(', ');
  return `Resolved body plan: CUSTOM. Expand only the declared semantic graph${roles ? ` (${roles})` : ''}; preserve every explicit parent edge, end effector, contact, and local axis without adding another body-plan preset.`;
}
