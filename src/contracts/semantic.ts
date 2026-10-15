/**
 * Versioned, portable semantic metadata stored on glTF node extras.
 *
 * A frame is rigid and node-local. Its quaternion rotates Kiln's canonical
 * +X-forward, +Y-up, +Z-right basis into the owning node's local space.
 * Keeping this contract dependency-free lets helpers, validators, Studio, and
 * runtime consumers share the exact same payload.
 */

export const KILN_SEMANTIC_EXTRAS_KEY = 'kilnSemantic' as const;
export const KILN_SEMANTIC_SCHEMA_VERSION = 1 as const;

// =============================================================================
// Role vocabulary
//
// A role is a dot-delimited path: a BASE naming the concept plus instance
// segments naming the occurrence ('wheel.tire' + 'left.0' -> 'wheel.tire.left.0').
// Producers build roles from these constants; consumers match against them with
// {@link semanticRoleMatches}. Both sides therefore share one spelling instead
// of two independently typed string literals — a rename here is a compile error
// at every emit site rather than a silently empty match downstream.
// =============================================================================

/**
 * Canonical base roles Kiln stamps on nodes. Values are the portable wire
 * spelling and are part of the GLB contract: renaming one changes published
 * assets, so treat a change here as a versioned contract change.
 */
export const KILN_SEMANTIC_ROLES = Object.freeze({
  // -- vehicle frame + typed sockets ------------------------------------------
  /** The +X-forward/+Y-up/+Z-right frame root of a vehicle. */
  vehicleFrame: 'vehicle.frame',
  /** Declares the frame's forward axis explicitly, for readers that check it. */
  vehicleForward: 'vehicle.front.+x',
  /** Any typed socket node; full role is `socket.<kind>.<id>`. */
  socket: 'socket',
  /** Chassis mount point. */
  chassis: 'chassis',
  /** The single primary chassis mount (`chassis` sockets are id-less by convention). */
  chassisMain: 'chassis.main',
  axle: 'axle',
  seat: 'seat',
  contact: 'contact',
  steering: 'steering',
  propulsion: 'propulsion',

  // -- wheel assembly ---------------------------------------------------------
  /** The spin pivot that owns one wheel; the anchor readers rig from. */
  wheelAssembly: 'wheel.assembly',
  wheelPivot: 'wheel.pivot',
  /** Present only on wheels that carry load (drivable ground contact). */
  wheelLoadBearing: 'wheel.load-bearing',
  wheelTire: 'wheel.tire',
  wheelRim: 'wheel.rim',
  wheelHub: 'wheel.hub',
  wheelContact: 'wheel.contact',
  /** Steering pivot above a steered wheel assembly. */
  steeringPivot: 'steering.pivot',

  // -- architecture -----------------------------------------------------------
  /** Separable roof. Interior views lift every node under this role. */
  roof: 'roof',
  /** Long-form spelling of {@link KILN_SEMANTIC_ROLES.roof}, accepted on read. */
  architectureRoof: 'architecture.roof',

  // -- game delivery (role vocabulary revision 2, additive) ---------------------
  /** Any collider proxy; full role is `collider.<shape>.<id>`. Proxies are hidden nodes. */
  collider: 'collider',
  /** Oriented box: a unit box (-0.5..0.5) whose node scale is the box size. */
  colliderBox: 'collider.box',
  /** Capsule along local +Y: a unit capsule (radius 0.5, height 1) whose node scale is
   *  [2 * radius, total height, 2 * radius]. */
  colliderCapsule: 'collider.capsule',
  /** Convex hull of the proxy node's own mesh vertices. */
  colliderHull: 'collider.hull',
  /** A named point with a transform; full role is `anchor.<kind>.<id>`. An empty leaf node. */
  anchor: 'anchor',
  /** The root of one modular kit piece; carries the `kilnKit` extras. */
  kitModule: 'kit.module',
  /** A snap point under a kit module; full role is `kit.port.<id>`. */
  kitPort: 'kit.port',
  /** The last level of a `defineLod` chain when it is a card or billboard tier. */
  lodImpostor: 'lod.impostor',
} as const);

/**
 * Revision of the {@link KILN_SEMANTIC_ROLES} vocabulary. The payload schema stays
 * {@link KILN_SEMANTIC_SCHEMA_VERSION} 1; revisions only add roles, so every older
 * asset stays valid. Revision 2 added the game-delivery roles (colliders, anchors,
 * kit modules and ports, and the impostor LOD tier).
 */
export const KILN_SEMANTIC_ROLES_REVISION = 2 as const;

export type KilnSemanticRoleKey = keyof typeof KILN_SEMANTIC_ROLES;

/**
 * Build a concrete role from a base plus instance segments. Segments are joined
 * with `.`; empty/blank segments are dropped so `semanticRole('chassis')` stays
 * `'chassis'`.
 */
export function semanticRole(base: string, ...segments: readonly (string | number)[]): string {
  const tail = segments
    .map((segment) => String(segment).trim())
    .filter((segment) => segment !== '');
  return tail.length > 0 ? `${base}.${tail.join('.')}` : base;
}

/**
 * Whether `role` IS `base` or lives beneath it. Matching is on a segment
 * boundary, so base `'roof'` matches `'roof.assembly'` but never `'rooftop'` —
 * the property a bare `startsWith` does not give you.
 */
export function semanticRoleMatches(role: string, base: string): boolean {
  return role === base || role.startsWith(`${base}.`);
}

/** Whether any role in `roles` matches `base` per {@link semanticRoleMatches}. */
export function hasSemanticRole(roles: readonly string[], base: string): boolean {
  return roles.some((role) => semanticRoleMatches(role, base));
}

export type SemanticVector3 = [number, number, number];
export type SemanticQuaternion = [number, number, number, number];

export interface SemanticLocalFrameV1 {
  id: string;
  translation: SemanticVector3;
  rotation: SemanticQuaternion;
}

export type SemanticRelationshipTargetV1 = 'node' | 'role' | 'socket';

export interface SemanticRelationshipV1 {
  kind: string;
  target: string;
  targetType: SemanticRelationshipTargetV1;
  sourceFrame?: string;
  targetFrame?: string;
}

export interface SemanticSocketV1 {
  id: string;
  type: string;
  /** ID of a frame in this same metadata payload. */
  frame: string;
  compatibleTypes: string[];
  allowedRotationsDegrees?: number[];
}

export interface SemanticMetadataV1 {
  schemaVersion: 1;
  roles: string[];
  relationships: SemanticRelationshipV1[];
  frames: SemanticLocalFrameV1[];
  sockets: SemanticSocketV1[];
}

export interface SemanticMetadataV1Input {
  roles: readonly string[];
  relationships?: readonly SemanticRelationshipV1[];
  frames?: readonly SemanticLocalFrameV1[];
  sockets?: readonly SemanticSocketV1[];
}

export interface SemanticValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface SemanticValidationResult {
  valid: boolean;
  value?: SemanticMetadataV1;
  issues: SemanticValidationIssue[];
}

export interface SemanticStampTarget {
  userData: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value === value.trim();

const isFiniteTuple = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((component) => typeof component === 'number' && Number.isFinite(component));

const cloneTuple3 = (value: readonly number[]): SemanticVector3 => [
  value[0]!,
  value[1]!,
  value[2]!,
];

const cloneTuple4 = (value: readonly number[]): SemanticQuaternion => [
  value[0]!,
  value[1]!,
  value[2]!,
  value[3]!,
];

function pushUniqueStrings(
  issues: SemanticValidationIssue[],
  value: unknown,
  path: string,
  options: { allowEmpty?: boolean } = {},
): value is string[] {
  if (!Array.isArray(value)) {
    issues.push({ code: 'EXPECTED_ARRAY', path, message: `${path} must be an array.` });
    return false;
  }
  if (!options.allowEmpty && value.length === 0) {
    issues.push({ code: 'EXPECTED_NONEMPTY_ARRAY', path, message: `${path} must not be empty.` });
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const item = value[index];
    if (!isNonEmptyString(item)) {
      issues.push({
        code: 'EXPECTED_NONEMPTY_STRING',
        path: `${path}[${index}]`,
        message: `${path}[${index}] must be a trimmed non-empty string.`,
      });
      continue;
    }
    if (seen.has(item)) {
      issues.push({
        code: 'DUPLICATE_VALUE',
        path: `${path}[${index}]`,
        message: `${path} contains duplicate value ${JSON.stringify(item)}.`,
      });
    }
    seen.add(item);
  }
  return true;
}

function validateFrame(
  frame: unknown,
  index: number,
  issues: SemanticValidationIssue[],
): frame is SemanticLocalFrameV1 {
  const path = `frames[${index}]`;
  if (!isRecord(frame)) {
    issues.push({ code: 'INVALID_FRAME', path, message: `${path} must be an object.` });
    return false;
  }
  if (!isNonEmptyString(frame.id)) {
    issues.push({ code: 'INVALID_FRAME_ID', path: `${path}.id`, message: 'Frame ID is required.' });
  }
  if (!isFiniteTuple(frame.translation, 3)) {
    issues.push({
      code: 'INVALID_FRAME_TRANSLATION',
      path: `${path}.translation`,
      message: 'Frame translation must be three finite meters.',
    });
  }
  if (!isFiniteTuple(frame.rotation, 4)) {
    issues.push({
      code: 'INVALID_FRAME_ROTATION',
      path: `${path}.rotation`,
      message: 'Frame rotation must be a finite quaternion.',
    });
  } else {
    const norm = Math.hypot(...frame.rotation);
    if (Math.abs(norm - 1) > 1e-6) {
      issues.push({
        code: 'NON_UNIT_FRAME_ROTATION',
        path: `${path}.rotation`,
        message: 'Frame rotation quaternion must be normalized within 1e-6.',
      });
    }
  }
  return true;
}

function validateRelationship(
  relationship: unknown,
  index: number,
  issues: SemanticValidationIssue[],
): relationship is SemanticRelationshipV1 {
  const path = `relationships[${index}]`;
  if (!isRecord(relationship)) {
    issues.push({
      code: 'INVALID_RELATIONSHIP',
      path,
      message: `${path} must be an object.`,
    });
    return false;
  }
  for (const property of ['kind', 'target'] as const) {
    if (!isNonEmptyString(relationship[property])) {
      issues.push({
        code: 'INVALID_RELATIONSHIP_FIELD',
        path: `${path}.${property}`,
        message: `${path}.${property} must be a trimmed non-empty string.`,
      });
    }
  }
  if (
    relationship.targetType !== 'node' &&
    relationship.targetType !== 'role' &&
    relationship.targetType !== 'socket'
  ) {
    issues.push({
      code: 'INVALID_RELATIONSHIP_TARGET_TYPE',
      path: `${path}.targetType`,
      message: 'Relationship targetType must be node, role, or socket.',
    });
  }
  for (const property of ['sourceFrame', 'targetFrame'] as const) {
    if (relationship[property] !== undefined && !isNonEmptyString(relationship[property])) {
      issues.push({
        code: 'INVALID_RELATIONSHIP_FRAME',
        path: `${path}.${property}`,
        message: `${path}.${property} must be a trimmed non-empty string.`,
      });
    }
  }
  return true;
}

function validateSocket(
  socket: unknown,
  index: number,
  issues: SemanticValidationIssue[],
): socket is SemanticSocketV1 {
  const path = `sockets[${index}]`;
  if (!isRecord(socket)) {
    issues.push({ code: 'INVALID_SOCKET', path, message: `${path} must be an object.` });
    return false;
  }
  for (const property of ['id', 'type', 'frame'] as const) {
    if (!isNonEmptyString(socket[property])) {
      issues.push({
        code: 'INVALID_SOCKET_FIELD',
        path: `${path}.${property}`,
        message: `${path}.${property} must be a trimmed non-empty string.`,
      });
    }
  }
  pushUniqueStrings(issues, socket.compatibleTypes, `${path}.compatibleTypes`, {
    allowEmpty: true,
  });
  if (socket.allowedRotationsDegrees !== undefined) {
    if (
      !Array.isArray(socket.allowedRotationsDegrees) ||
      socket.allowedRotationsDegrees.some(
        (angle) => typeof angle !== 'number' || !Number.isFinite(angle),
      )
    ) {
      issues.push({
        code: 'INVALID_ALLOWED_ROTATIONS',
        path: `${path}.allowedRotationsDegrees`,
        message: 'Allowed rotations must be finite degree values.',
      });
    }
  }
  return true;
}

/** Validate untrusted JSON-like semantic extras without a runtime schema dependency. */
export function validateSemanticMetadataV1(value: unknown): SemanticValidationResult {
  const issues: SemanticValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [
        {
          code: 'EXPECTED_OBJECT',
          path: '',
          message: 'SemanticMetadataV1 must be an object.',
        },
      ],
    };
  }
  if (value.schemaVersion !== KILN_SEMANTIC_SCHEMA_VERSION) {
    issues.push({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      path: 'schemaVersion',
      message: `schemaVersion must be ${KILN_SEMANTIC_SCHEMA_VERSION}.`,
    });
  }
  pushUniqueStrings(issues, value.roles, 'roles');

  const frames = Array.isArray(value.frames) ? value.frames : [];
  if (!Array.isArray(value.frames)) {
    issues.push({ code: 'EXPECTED_ARRAY', path: 'frames', message: 'frames must be an array.' });
  }
  const frameIds = new Set<string>();
  frames.forEach((frame, index) => {
    validateFrame(frame, index, issues);
    if (isRecord(frame) && isNonEmptyString(frame.id)) {
      if (frameIds.has(frame.id)) {
        issues.push({
          code: 'DUPLICATE_FRAME_ID',
          path: `frames[${index}].id`,
          message: `Duplicate frame ID ${JSON.stringify(frame.id)}.`,
        });
      }
      frameIds.add(frame.id);
    }
  });

  const relationships = Array.isArray(value.relationships) ? value.relationships : [];
  if (!Array.isArray(value.relationships)) {
    issues.push({
      code: 'EXPECTED_ARRAY',
      path: 'relationships',
      message: 'relationships must be an array.',
    });
  }
  relationships.forEach((relationship, index) => {
    validateRelationship(relationship, index, issues);
    if (isRecord(relationship)) {
      for (const property of ['sourceFrame', 'targetFrame'] as const) {
        const frameId = relationship[property];
        if (isNonEmptyString(frameId) && !frameIds.has(frameId)) {
          issues.push({
            code: 'UNKNOWN_FRAME_REFERENCE',
            path: `relationships[${index}].${property}`,
            message: `Unknown frame ${JSON.stringify(frameId)}.`,
          });
        }
      }
    }
  });

  const sockets = Array.isArray(value.sockets) ? value.sockets : [];
  if (!Array.isArray(value.sockets)) {
    issues.push({ code: 'EXPECTED_ARRAY', path: 'sockets', message: 'sockets must be an array.' });
  }
  const socketIds = new Set<string>();
  sockets.forEach((socket, index) => {
    validateSocket(socket, index, issues);
    if (isRecord(socket) && isNonEmptyString(socket.id)) {
      if (socketIds.has(socket.id)) {
        issues.push({
          code: 'DUPLICATE_SOCKET_ID',
          path: `sockets[${index}].id`,
          message: `Duplicate socket ID ${JSON.stringify(socket.id)}.`,
        });
      }
      socketIds.add(socket.id);
    }
    if (isRecord(socket) && isNonEmptyString(socket.frame) && !frameIds.has(socket.frame)) {
      issues.push({
        code: 'UNKNOWN_FRAME_REFERENCE',
        path: `sockets[${index}].frame`,
        message: `Unknown frame ${JSON.stringify(socket.frame)}.`,
      });
    }
  });

  if (issues.length > 0) return { valid: false, issues };
  return {
    valid: true,
    value: cloneSemanticMetadataV1(value as unknown as SemanticMetadataV1),
    issues,
  };
}

/** Deep-copy into a stable property order suitable for exact extras round-trip tests. */
export function cloneSemanticMetadataV1(metadata: SemanticMetadataV1): SemanticMetadataV1 {
  return {
    schemaVersion: KILN_SEMANTIC_SCHEMA_VERSION,
    roles: [...metadata.roles],
    relationships: metadata.relationships.map((relationship) => ({
      kind: relationship.kind,
      target: relationship.target,
      targetType: relationship.targetType,
      ...(relationship.sourceFrame ? { sourceFrame: relationship.sourceFrame } : {}),
      ...(relationship.targetFrame ? { targetFrame: relationship.targetFrame } : {}),
    })),
    frames: metadata.frames.map((frame) => ({
      id: frame.id,
      translation: cloneTuple3(frame.translation),
      rotation: cloneTuple4(frame.rotation),
    })),
    sockets: metadata.sockets.map((socket) => ({
      id: socket.id,
      type: socket.type,
      frame: socket.frame,
      compatibleTypes: [...socket.compatibleTypes],
      ...(socket.allowedRotationsDegrees
        ? { allowedRotationsDegrees: [...socket.allowedRotationsDegrees] }
        : {}),
    })),
  };
}

export function createSemanticMetadataV1(input: SemanticMetadataV1Input): SemanticMetadataV1 {
  const metadata: SemanticMetadataV1 = {
    schemaVersion: KILN_SEMANTIC_SCHEMA_VERSION,
    roles: [...input.roles],
    relationships: (input.relationships ?? []).map((relationship) => ({ ...relationship })),
    frames: (input.frames ?? []).map((frame) => ({
      ...frame,
      translation: cloneTuple3(frame.translation),
      rotation: cloneTuple4(frame.rotation),
    })),
    sockets: (input.sockets ?? []).map((socket) => ({
      ...socket,
      compatibleTypes: [...socket.compatibleTypes],
      ...(socket.allowedRotationsDegrees
        ? { allowedRotationsDegrees: [...socket.allowedRotationsDegrees] }
        : {}),
    })),
  };
  const result = validateSemanticMetadataV1(metadata);
  if (!result.valid || !result.value) {
    throw new TypeError(
      `Invalid SemanticMetadataV1: ${result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return result.value;
}

/** Stamp a validated, detached payload on a Three.js-compatible helper node. */
export function stampSemanticMetadataV1<T extends SemanticStampTarget>(
  target: T,
  metadata: SemanticMetadataV1 | SemanticMetadataV1Input,
): T {
  const normalized =
    'schemaVersion' in metadata
      ? validateSemanticMetadataV1(metadata)
      : { valid: true, value: createSemanticMetadataV1(metadata), issues: [] };
  if (!normalized.valid || !normalized.value) {
    throw new TypeError(
      `Invalid SemanticMetadataV1: ${normalized.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  target.userData[KILN_SEMANTIC_EXTRAS_KEY] = cloneSemanticMetadataV1(normalized.value);
  return target;
}

/** Read and validate metadata from a Three.js-compatible node. */
export function readSemanticMetadataV1(
  target: SemanticStampTarget,
): SemanticMetadataV1 | undefined {
  const value = target.userData[KILN_SEMANTIC_EXTRAS_KEY];
  if (value === undefined) return undefined;
  const result = validateSemanticMetadataV1(value);
  return result.valid ? result.value : undefined;
}

/** Read and validate metadata from glTF Property.getExtras(). */
export function readSemanticMetadataV1FromExtras(
  extras: Record<string, unknown>,
): SemanticMetadataV1 | undefined {
  const value = extras[KILN_SEMANTIC_EXTRAS_KEY];
  if (value === undefined) return undefined;
  const result = validateSemanticMetadataV1(value);
  return result.valid ? result.value : undefined;
}

/** Canonical UTF-8 evidence bytes used to prove semantic extras are unchanged. */
export function semanticMetadataBytesV1(metadata: SemanticMetadataV1): Uint8Array {
  const result = validateSemanticMetadataV1(metadata);
  if (!result.valid || !result.value) {
    throw new TypeError('Cannot serialize invalid SemanticMetadataV1.');
  }
  return new TextEncoder().encode(JSON.stringify(result.value));
}
