import * as THREE from 'three';

import {
  BIPED_RIG_PRESET_V1,
  QUADRUPED_RIG_PRESET_V1,
  collectCharacterJointNodes,
  readCharacterJointDescriptorV1,
  readCharacterRigGraphV1,
  type CharacterJointDescriptorV1,
  type CharacterRigGraphV1,
} from '../character';
import { isCubicSplineTrack } from '../animation-spline';
import { readSemanticMetadataV1, type CharacterClipIntentV1 } from '../contracts';
import type { AssetRequirementsV1 } from '../contracts/requirements';
import { withCharacterRepair } from './character-repairs';
import { conformancePromotionAuthorization, KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

const PROFILE_RULE_ID = 'CHARACTER_PROFILE';
const CONTACT_TOLERANCE = 0.02;
const LOOP_TOLERANCE = 1e-5;
const ROOT_MOTION_TOLERANCE = 0.01;
const GRIP_MOTION_RATIO = 0.02;

interface CharacterIntentExtensions {
  /** Optional semantic node name that owns declared root motion. */
  rootMotionNode?: string;
  /** Optional trusted custom graph; the scene-root graph is used otherwise. */
  rigGraph?: CharacterRigGraphV1;
  /** Optional tighter/looser asset-local contact tolerance in meters. */
  contactTolerance?: number;
}

export type RigRequirements = Extract<
  NonNullable<AssetRequirementsV1['requirements']['rig']>,
  { value: unknown }
>['value'];
export interface RigQaInput {
  rig?: RigRequirements & CharacterIntentExtensions;
  profile?: string;
  scene?: unknown;
  clips?: readonly unknown[];
  groundPlaneY?: number;
  /** Historical fixture controls only; current body-plan requests select their graph directly. */
  checkBodyPlan?: boolean;
}

interface CharacterNodeEvidence {
  node: THREE.Object3D;
  nodePath: string;
}

interface TrackLike {
  name: string;
  times: ArrayLike<number>;
  values: ArrayLike<number>;
  getValueSize?: () => number;
  createInterpolant?: () => { evaluate(time: number): ArrayLike<number> };
}

interface ClipLike {
  name: string;
  duration: number;
  tracks: TrackLike[];
}

export interface CharacterSampleNodeV1 {
  nodeName: string;
  nodePath: string;
  role: string;
  worldPosition: [number, number, number];
  worldQuaternion: [number, number, number, number];
}

export interface CharacterAnimationSampleV1 {
  fraction: number;
  time: number;
  nodes: CharacterSampleNodeV1[];
}

export interface CharacterAnimationSamplesV1 {
  schemaVersion: 1;
  clipName: string;
  duration: number;
  fractions: number[];
  samples: CharacterAnimationSampleV1[];
}

export const CHARACTER_SAMPLE_FRACTIONS = Object.freeze([0, 0.25, 0.5, 0.75, 1]);

function isClipLike(value: unknown): value is ClipLike {
  if (typeof value !== 'object' || value === null) return false;
  const clip = value as Partial<ClipLike>;
  return typeof clip.name === 'string' && Array.isArray(clip.tracks);
}

function collectNodes(root: THREE.Object3D): CharacterNodeEvidence[] {
  const nodes: CharacterNodeEvidence[] = [];
  const visit = (node: THREE.Object3D, parentPath: string, siblingIndex: number): void => {
    if (!node.visible) return;
    const segment = `${node.name.trim() || node.type || 'Object3D'}[${siblingIndex}]`;
    const nodePath = parentPath ? `${parentPath}/${segment}` : segment;
    nodes.push({ node, nodePath });
    node.children.forEach((child, index) => {
      visit(child, nodePath, index);
    });
  };
  visit(root, '', 0);
  return nodes;
}

function block(
  input: RigQaInput,
  code: string,
  message: string,
  options: Pick<QaFinding, 'dimension' | 'affected' | 'measurement' | 'viewHints'>,
): QaFinding {
  return withCharacterRepair({
    code,
    disposition: 'block',
    profile: input.profile ?? 'asset.requirements.v1',
    message,
    ...options,
  });
}

function targetName(trackName: string): string | undefined {
  const dot = trackName.lastIndexOf('.');
  return dot > 0 ? trackName.slice(0, dot) : undefined;
}

function propertyName(trackName: string): string | undefined {
  const dot = trackName.lastIndexOf('.');
  return dot > 0 ? trackName.slice(dot + 1) : undefined;
}

function blockerKey(finding: QaFinding): string {
  return [
    finding.code,
    finding.affected?.nodePath ?? '',
    finding.affected?.clip ?? '',
    finding.affected?.track ?? '',
    String(finding.measurement?.expected ?? ''),
  ].join('|');
}

function dedupeFindings(findings: readonly QaFinding[]): QaFinding[] {
  const byKey = new Map<string, QaFinding>();
  for (const finding of findings) byKey.set(blockerKey(finding), finding);
  return [...byKey.values()].sort((a, b) => blockerKey(a).localeCompare(blockerKey(b)));
}

function duplicateNameFindings(
  input: RigQaInput,
  nodes: readonly CharacterNodeEvidence[],
  clips: readonly ClipLike[],
): QaFinding[] {
  const animatedTargets = new Set(
    clips.flatMap((clip) => clip.tracks.map((track) => targetName(track.name)).filter(Boolean)),
  );
  const byName = new Map<string, CharacterNodeEvidence[]>();
  for (const evidence of nodes) {
    if (!evidence.node.name) continue;
    if (!evidence.node.name.startsWith('Joint_') && !animatedTargets.has(evidence.node.name))
      continue;
    const values = byName.get(evidence.node.name) ?? [];
    values.push(evidence);
    byName.set(evidence.node.name, values);
  }
  const findings: QaFinding[] = [];
  for (const [name, matches] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (matches.length < 2) continue;
    const paths = matches.map((match) => match.nodePath).sort();
    findings.push(
      block(
        input,
        'CHAR_DUPLICATE_ANIMATED_NODE_NAME',
        `Animated node name ${JSON.stringify(name)} resolves to multiple exact paths: ${paths.join(', ')}.`,
        {
          dimension: 'exportIntegrity',
          affected: { node: name, nodePath: paths[0] },
          measurement: {
            name: 'animatedNodeNameCount',
            actual: matches.length,
            expected: 1,
          },
          viewHints: ['character.skeleton.front', 'character.skeleton.right'],
        },
      ),
    );
  }
  return findings;
}

function parentAndRoleFindings(
  input: RigQaInput,
  root: THREE.Object3D,
): { findings: QaFinding[]; byRole: Map<string, ReturnType<typeof collectCharacterJointNodes>> } {
  const joints = collectCharacterJointNodes(root);
  const byRole = new Map<string, typeof joints>();
  for (const joint of joints) {
    const values = byRole.get(joint.descriptor.role) ?? [];
    values.push(joint);
    byRole.set(joint.descriptor.role, values);
  }
  const findings: QaFinding[] = [];
  for (const [role, matches] of [...byRole.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (matches.length < 2) continue;
    const paths = matches.map((match) => match.nodePath).sort();
    findings.push(
      block(
        input,
        'CHAR_DUPLICATE_JOINT_ROLE',
        `Joint role ${role} is declared at ${paths.join(', ')}.`,
        {
          dimension: 'categoryReadiness',
          affected: { node: role, nodePath: paths[0] },
          measurement: { name: 'jointRoleCount', actual: matches.length, expected: 1 },
          viewHints: ['character.skeleton.front', 'character.skeleton.right'],
        },
      ),
    );
  }
  for (const joint of joints) {
    const expected = joint.descriptor.parentRole;
    if (!expected) continue;
    const actualDescriptor = joint.node.parent
      ? readCharacterJointDescriptorV1(joint.node.parent)
      : undefined;
    const actual = actualDescriptor?.role ?? joint.node.parent?.name ?? '(none)';
    if (actualDescriptor?.role === expected) continue;
    findings.push(
      block(
        input,
        'CHAR_PARENT_EDGE',
        `Broken joint edge ${expected} -> ${joint.descriptor.role}: actual direct parent is ${actual}.`,
        {
          dimension: 'categoryReadiness',
          affected: { node: joint.node.name, nodePath: joint.nodePath },
          measurement: { name: 'parentRole', actual, expected },
          viewHints: ['character.skeleton.front', 'character.skeleton.right'],
        },
      ),
    );
  }
  return { findings, byRole };
}

function requiredGraphFindings(
  input: RigQaInput,
  graph: CharacterRigGraphV1,
  actualByRole: Map<string, ReturnType<typeof collectCharacterJointNodes>>,
  code: 'CHAR_BIPED_REQUIRED_ROLE' | 'CHAR_QUADRUPED_REQUIRED_ROLE' | 'CHAR_CUSTOM_REQUIRED_ROLE',
): QaFinding[] {
  const findings: QaFinding[] = [];
  for (const expected of graph.joints) {
    const actual = actualByRole.get(expected.role)?.[0];
    if (!actual) {
      findings.push(
        block(
          input,
          code,
          `Explicit ${graph.bodyPlan} articulation is missing joint role ${expected.role}.`,
          {
            dimension: 'categoryReadiness',
            affected: { node: expected.role },
            measurement: { name: 'requiredJointRole', actual: false, expected: expected.role },
            viewHints: ['character.skeleton.front', 'character.skeleton.right'],
          },
        ),
      );
      continue;
    }
    if (expected.parentRole && actual.descriptor.parentRole !== expected.parentRole) {
      findings.push(
        block(
          input,
          'CHAR_PARENT_EDGE',
          `Role ${expected.role} declares parent ${actual.descriptor.parentRole ?? '(none)'}; ${expected.parentRole} is required by the ${graph.bodyPlan} graph.`,
          {
            dimension: 'categoryReadiness',
            affected: { node: actual.node.name, nodePath: actual.nodePath },
            measurement: {
              name: 'declaredParentRole',
              actual: actual.descriptor.parentRole ?? '(none)',
              expected: expected.parentRole,
            },
            viewHints: ['character.skeleton.front', 'character.skeleton.right'],
          },
        ),
      );
    }
  }
  return findings;
}

function rigProfileFindings(
  input: RigQaInput,
  root: THREE.Object3D,
  byRole: Map<string, ReturnType<typeof collectCharacterJointNodes>>,
): QaFinding[] {
  const trusted = input.rig;
  if (!trusted?.bodyPlan || input.checkBodyPlan === false) return [];
  if (trusted.bodyPlan === 'biped') {
    return requiredGraphFindings(input, BIPED_RIG_PRESET_V1, byRole, 'CHAR_BIPED_REQUIRED_ROLE');
  }
  if (trusted.bodyPlan === 'quadruped') {
    return requiredGraphFindings(
      input,
      QUADRUPED_RIG_PRESET_V1,
      byRole,
      'CHAR_QUADRUPED_REQUIRED_ROLE',
    );
  }
  const customGraph = trusted.rigGraph ?? readCharacterRigGraphV1(root);
  if (!customGraph) {
    return [
      block(
        input,
        'CHAR_CUSTOM_GRAPH_MISSING',
        `Explicit articulated ${trusted.bodyPlan} character requires its declared semantic rig graph; no biped fallback is allowed.`,
        {
          dimension: 'categoryReadiness',
          affected: { node: root.name },
          measurement: { name: 'customRigGraphPresent', actual: false, expected: true },
          viewHints: ['character.skeleton.front', 'character.skeleton.right'],
        },
      ),
    ];
  }
  return requiredGraphFindings(input, customGraph, byRole, 'CHAR_CUSTOM_REQUIRED_ROLE');
}

function heldItemFindings(input: RigQaInput, nodes: readonly CharacterNodeEvidence[]): QaFinding[] {
  const held = input.rig?.heldItem;
  if (!held?.required) return [];
  const item = nodes.find((evidence) => {
    const roles = readSemanticMetadataV1(evidence.node)?.roles ?? [];
    return (
      evidence.node.userData['kilnHeldItem'] === true ||
      roles.some(
        (role) =>
          role === 'held-item' || role.startsWith('held-item.') || role === 'character.held-item',
      )
    );
  });
  if (!item) {
    return [
      block(
        input,
        'CHAR_HELD_ITEM_MISSING',
        'Trusted input requires a held item, but none is declared.',
        {
          dimension: 'categoryReadiness',
          affected: { node: held.attachmentRole },
          measurement: { name: 'heldItemPresent', actual: false, expected: true },
          viewHints: ['character.skeleton.front', 'character.skeleton.right'],
        },
      ),
    ];
  }
  let cursor = item.node.parent;
  let attachment: CharacterJointDescriptorV1 | undefined;
  while (cursor) {
    attachment = readCharacterJointDescriptorV1(cursor);
    if (attachment) break;
    cursor = cursor.parent;
  }
  const roleMatches = (descriptor: CharacterJointDescriptorV1): boolean => {
    const candidates = [descriptor.role, ...descriptor.aliases];
    return candidates.some(
      (role) => role === held.attachmentRole || role.split(/[._-]/).includes(held.attachmentRole),
    );
  };
  if (attachment?.endEffector && roleMatches(attachment)) return [];
  return [
    block(
      input,
      'CHAR_HELD_ITEM_ATTACHMENT',
      `Held item at ${item.nodePath} must be under ${held.attachmentRole} end effector; actual attachment is ${attachment?.role ?? '(non-joint)'}.`,
      {
        dimension: 'categoryReadiness',
        affected: { node: item.node.name, nodePath: item.nodePath },
        measurement: {
          name: 'heldItemAttachmentRole',
          actual: attachment?.role ?? '(non-joint)',
          expected: held.attachmentRole,
        },
        viewHints: ['character.skeleton.front', 'character.skeleton.right'],
      },
    ),
  ];
}

function contactFindings(input: RigQaInput, root: THREE.Object3D): QaFinding[] {
  const trusted = input.rig;
  if (!trusted?.grounded) return [];
  const contacts = collectCharacterJointNodes(root).filter((joint) => joint.descriptor.contact);
  if (contacts.length === 0) {
    return [
      block(input, 'CHAR_CONTACT_MISSING', 'Grounded character declares no contact joint.', {
        dimension: 'categoryReadiness',
        affected: { node: root.name },
        measurement: { name: 'groundContactCount', actual: 0, expected: '>=1' },
        viewHints: ['character.skeleton.front', 'generic.front.depth-contact'],
      }),
    ];
  }
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const tolerance =
    Number.isFinite(trusted.contactTolerance) && (trusted.contactTolerance ?? 0) >= 0
      ? trusted.contactTolerance!
      : CONTACT_TOLERANCE;
  const planeY = input.groundPlaneY ?? 0;
  const findings: QaFinding[] = [];
  for (const contact of contacts) {
    const point = contact.node.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
    const offset = point.y - planeY;
    if (offset > tolerance) {
      findings.push(
        block(
          input,
          'CHAR_CONTACT_FLOATING',
          `Ground contact ${contact.descriptor.role} is ${offset.toFixed(6)} m above asset-local ground.`,
          {
            dimension: 'categoryReadiness',
            affected: { node: contact.node.name, nodePath: contact.nodePath },
            measurement: {
              name: 'contactY',
              actual: point.y,
              expected: planeY,
              threshold: tolerance,
              unit: 'm',
            },
            viewHints: ['character.skeleton.front', 'generic.front.depth-contact'],
          },
        ),
      );
    } else if (offset < -tolerance) {
      findings.push(
        block(
          input,
          'CHAR_CONTACT_BURIED',
          `Ground contact ${contact.descriptor.role} is ${Math.abs(offset).toFixed(6)} m below asset-local ground.`,
          {
            dimension: 'categoryReadiness',
            affected: { node: contact.node.name, nodePath: contact.nodePath },
            measurement: {
              name: 'contactY',
              actual: point.y,
              expected: planeY,
              threshold: tolerance,
              unit: 'm',
            },
            viewHints: ['character.skeleton.front', 'generic.front.depth-contact'],
          },
        ),
      );
    }
  }
  return findings;
}

function requestedClipFindings(
  input: RigQaInput,
  clips: readonly ClipLike[],
  requested: readonly CharacterClipIntentV1[],
): QaFinding[] {
  const findings: QaFinding[] = [];
  const requestedNames = new Set(requested.map((clip) => clip.name));
  const counts = new Map<string, number>();
  for (const clip of clips) counts.set(clip.name, (counts.get(clip.name) ?? 0) + 1);
  for (const [name, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count < 2) continue;
    findings.push(
      block(input, 'CHAR_CLIP_DUPLICATE', `Clip ${name} appears ${count} times.`, {
        dimension: 'exportIntegrity',
        affected: { clip: name },
        measurement: { name: 'clipCount', actual: count, expected: 1 },
        viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
      }),
    );
  }
  for (const request of requested) {
    const count = counts.get(request.name) ?? 0;
    if (count === 0) {
      findings.push(
        block(input, 'CHAR_CLIP_MISSING', `Requested clip ${request.name} is missing.`, {
          dimension: 'categoryReadiness',
          affected: { clip: request.name },
          measurement: { name: 'clipCount', actual: 0, expected: 1 },
          viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
        }),
      );
    }
  }
  for (const name of [...counts.keys()].sort()) {
    if (requestedNames.has(name)) continue;
    findings.push(
      block(input, 'CHAR_CLIP_UNEXPECTED', `Clip ${name} was not requested by trusted input.`, {
        dimension: 'categoryReadiness',
        affected: { clip: name },
        measurement: { name: 'requestedClip', actual: name, expected: 'absent' },
        viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
      }),
    );
  }
  return findings;
}

function valueSize(track: TrackLike): number | undefined {
  const explicit = track.getValueSize?.();
  if (typeof explicit === 'number' && Number.isInteger(explicit) && explicit > 0) return explicit;
  if (track.times.length > 0 && track.values.length % track.times.length === 0) {
    return track.values.length / track.times.length;
  }
  return undefined;
}

function endpointDelta(track: TrackLike, tuple: number): number {
  // A cubic-spline key is [in-tangent, value, out-tangent]; the endpoints are the values.
  const cubic = isCubicSplineTrack(track);
  const size = cubic ? tuple / 3 : tuple;
  const offset = cubic ? size : 0;
  const first = Array.from({ length: size }, (_, index) => Number(track.values[offset + index]));
  const lastOffset = track.values.length - tuple + offset;
  const last = Array.from({ length: size }, (_, index) => Number(track.values[lastOffset + index]));
  if (track.name.endsWith('.quaternion') && size === 4) {
    const dot = Math.abs(first.reduce((sum, value, index) => sum + value * last[index]!, 0));
    return Math.abs(1 - Math.min(1, dot));
  }
  return Math.max(...first.map((value, index) => Math.abs(value - last[index]!)));
}

function animationDataFindings(
  input: RigQaInput,
  clips: readonly ClipLike[],
  requested: readonly CharacterClipIntentV1[],
  root?: THREE.Object3D,
): QaFinding[] {
  const findings: QaFinding[] = [];
  const playback = new Map(requested.map((clip) => [clip.name, clip.playback]));
  const trusted = input.rig;
  const hipsName = root
    ? collectCharacterJointNodes(root).find((joint) => joint.descriptor.role === 'hips')?.node.name
    : undefined;
  const rootMotionNames = new Set(
    [trusted?.rootMotionNode, root?.name, hipsName].filter((name): name is string => Boolean(name)),
  );
  for (const clip of clips) {
    const durationValid = Number.isFinite(clip.duration) && clip.duration > 0;
    if (!durationValid) {
      findings.push(
        block(
          input,
          'CHAR_CLIP_DURATION',
          `Clip ${clip.name} duration must be finite and positive.`,
          {
            dimension: 'exportIntegrity',
            affected: { clip: clip.name },
            measurement: { name: 'clipDuration', actual: clip.duration, expected: '>0', unit: 's' },
            viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
          },
        ),
      );
    }
    for (const track of clip.tracks) {
      const times = Array.from(track.times, Number);
      const values = Array.from(track.values, Number);
      const nonFiniteTime = times.findIndex((value) => !Number.isFinite(value));
      const nonFiniteValue = values.findIndex((value) => !Number.isFinite(value));
      if (nonFiniteTime >= 0 || nonFiniteValue >= 0) {
        findings.push(
          block(
            input,
            'CHAR_ANIMATION_NONFINITE',
            `Clip ${clip.name} track ${track.name} contains a non-finite ${nonFiniteTime >= 0 ? 'time' : 'value'}.`,
            {
              dimension: 'exportIntegrity',
              affected: { clip: clip.name, track: track.name },
              measurement: {
                name: nonFiniteTime >= 0 ? 'nonFiniteTimeIndex' : 'nonFiniteValueIndex',
                actual: nonFiniteTime >= 0 ? nonFiniteTime : nonFiniteValue,
                expected: 'none',
              },
              viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
            },
          ),
        );
      }
      const badOrder = times.findIndex((time, index) => index > 0 && time <= times[index - 1]!);
      if (badOrder >= 0) {
        findings.push(
          block(
            input,
            'CHAR_KEY_TIME_ORDER',
            `Clip ${clip.name} track ${track.name} key times must be strictly increasing and unique.`,
            {
              dimension: 'exportIntegrity',
              affected: { clip: clip.name, track: track.name },
              measurement: {
                name: 'firstNonIncreasingKey',
                actual: badOrder,
                expected: 'strictly increasing',
              },
              viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
            },
          ),
        );
      }
      if (durationValid) {
        const outside = times.findIndex(
          (time) => Number.isFinite(time) && (time < 0 || time > clip.duration),
        );
        if (outside >= 0) {
          findings.push(
            block(
              input,
              'CHAR_KEY_OUT_OF_RANGE',
              `Clip ${clip.name} track ${track.name} key ${outside} lies outside [0, ${clip.duration}].`,
              {
                dimension: 'exportIntegrity',
                affected: { clip: clip.name, track: track.name },
                measurement: {
                  name: 'keyTime',
                  actual: times[outside]!,
                  expected: `0..${clip.duration}`,
                  unit: 's',
                },
                viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
              },
            ),
          );
        }
      }
      const size = valueSize(track);
      if (!size || values.length !== times.length * size) {
        findings.push(
          block(
            input,
            'CHAR_TRACK_VALUE_COUNT',
            `Clip ${clip.name} track ${track.name} does not contain one complete value per key time.`,
            {
              dimension: 'exportIntegrity',
              affected: { clip: clip.name, track: track.name },
              measurement: {
                name: 'trackValueCount',
                actual: values.length,
                expected: size ? times.length * size : 'integral tuple count',
              },
              viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
            },
          ),
        );
      } else if (
        playback.get(clip.name) === 'loop' &&
        !(
          trusted?.rootMotion === 'forward' &&
          track.name.endsWith('.position') &&
          rootMotionNames.has(targetName(track.name) ?? '')
        ) &&
        times.length > 1 &&
        nonFiniteValue < 0 &&
        endpointDelta(track, size) > LOOP_TOLERANCE
      ) {
        const delta = endpointDelta(track, size);
        findings.push(
          block(
            input,
            'CHAR_LOOP_ENDPOINT',
            `Looping clip ${clip.name} track ${track.name} ends ${delta} away from its start pose.`,
            {
              dimension: 'categoryReadiness',
              affected: { clip: clip.name, track: track.name },
              measurement: {
                name: 'loopEndpointDelta',
                actual: delta,
                expected: 0,
                threshold: LOOP_TOLERANCE,
              },
              viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
            },
          ),
        );
      }
    }
  }
  return findings;
}

function rounded(value: number): number {
  const result = Math.round(value * 1e9) / 1e9;
  return Object.is(result, -0) ? 0 : result;
}

function applyTrackAt(root: THREE.Object3D, track: TrackLike, time: number): void {
  const nodeName = targetName(track.name);
  const property = propertyName(track.name);
  const node = nodeName ? root.getObjectByName(nodeName) : undefined;
  if (!node || !property || !track.createInterpolant) return;
  const value = track.createInterpolant().evaluate(time);
  if (property === 'position') node.position.fromArray(value as ArrayLike<number>);
  else if (property === 'scale') node.scale.fromArray(value as ArrayLike<number>);
  else if (property === 'quaternion') {
    node.quaternion.fromArray(value as ArrayLike<number>).normalize();
  }
}

/** Deterministically evaluate authored tracks and report joint world transforms. */
export function sampleCharacterAnimation(
  root: THREE.Object3D,
  clip: ClipLike,
  fractions: readonly number[] = CHARACTER_SAMPLE_FRACTIONS,
): CharacterAnimationSamplesV1 {
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new TypeError('Cannot sample a clip without a finite positive duration.');
  }
  if (fractions.some((fraction) => !Number.isFinite(fraction) || fraction < 0 || fraction > 1)) {
    throw new TypeError('Animation sample fractions must be finite values in [0, 1].');
  }
  const samples = fractions.map((fraction): CharacterAnimationSampleV1 => {
    const clone = root.clone(true);
    const time = fraction * clip.duration;
    for (const track of clip.tracks) applyTrackAt(clone, track, time);
    clone.updateMatrixWorld(true);
    const joints = collectCharacterJointNodes(clone);
    const rootPath = `${clone.name.trim() || clone.type || 'Object3D'}[0]`;
    const selected = [
      { node: clone, nodePath: rootPath, role: 'asset.root' },
      ...joints.map((joint) => ({
        node: joint.node,
        nodePath: joint.nodePath,
        role: joint.descriptor.role,
      })),
    ];
    return {
      fraction,
      time: rounded(time),
      nodes: selected.map((entry) => {
        const position = entry.node.getWorldPosition(new THREE.Vector3());
        const quaternion = entry.node.getWorldQuaternion(new THREE.Quaternion());
        return {
          nodeName: entry.node.name,
          nodePath: entry.nodePath,
          role: entry.role,
          worldPosition: [rounded(position.x), rounded(position.y), rounded(position.z)],
          worldQuaternion: [
            rounded(quaternion.x),
            rounded(quaternion.y),
            rounded(quaternion.z),
            rounded(quaternion.w),
          ],
        };
      }),
    };
  });
  return {
    schemaVersion: 1,
    clipName: clip.name,
    duration: clip.duration,
    fractions: [...fractions],
    samples,
  };
}

function locomotionClipNames(character: RigRequirements): string[] {
  const loopingMotion = (character.clips ?? [])
    .filter(
      (clip) =>
        clip.playback === 'loop' && /(?:walk|run|fly|swim|slither|roll|locom)/i.test(clip.name),
    )
    .map((clip) => clip.name);
  if (loopingMotion.length > 0) return loopingMotion;
  return (character.clips ?? [])
    .filter((clip) => clip.playback === 'loop')
    .map((clip) => clip.name);
}

function rootMotionFindings(
  input: RigQaInput,
  root: THREE.Object3D,
  clips: readonly ClipLike[],
): QaFinding[] {
  const trusted = input.rig;
  if (trusted?.rootMotion !== 'forward') return [];
  const names = new Set(locomotionClipNames(trusted));
  const findings: QaFinding[] = [];
  const hips = collectCharacterJointNodes(root).find((joint) => joint.descriptor.role === 'hips');
  for (const clip of clips.filter((candidate) => names.has(candidate.name))) {
    const positionTracks = clip.tracks.filter((track) => track.name.endsWith('.position'));
    const preferredName = trusted.rootMotionNode ?? root.name;
    const rootTrack =
      positionTracks.find((track) => targetName(track.name) === preferredName) ??
      positionTracks.find((track) => targetName(track.name) === hips?.node.name) ??
      positionTracks[0];
    if (!rootTrack || rootTrack.times.length === 0 || !rootTrack.createInterpolant) continue;
    const interpolant = rootTrack.createInterpolant();
    const first = Array.from(interpolant.evaluate(0), Number);
    const last = Array.from(interpolant.evaluate(clip.duration), Number);
    const dx = Number(last[0]) - Number(first[0]);
    const dz = Number(last[2]) - Number(first[2]);
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) continue;
    if (dx < -ROOT_MOTION_TOLERANCE) {
      findings.push(
        block(
          input,
          'CHAR_ROOT_MOTION_BACKWARD',
          `Forward locomotion clip ${clip.name} travels ${dx.toFixed(6)} m along X.`,
          {
            dimension: 'categoryReadiness',
            affected: { clip: clip.name, track: rootTrack.name },
            measurement: {
              name: 'rootMotionDeltaX',
              actual: dx,
              expected: '>=0',
              threshold: ROOT_MOTION_TOLERANCE,
              unit: 'm',
            },
            viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
          },
        ),
      );
    }
    if (
      Math.abs(dz) > ROOT_MOTION_TOLERANCE &&
      Math.abs(dz) > Math.max(Math.abs(dx) * 1.25, ROOT_MOTION_TOLERANCE)
    ) {
      findings.push(
        block(
          input,
          'CHAR_ROOT_MOTION_LATERAL',
          `Forward locomotion clip ${clip.name} is Z-dominant (dx=${dx.toFixed(6)}, dz=${dz.toFixed(6)}).`,
          {
            dimension: 'categoryReadiness',
            affected: { clip: clip.name, track: rootTrack.name },
            measurement: {
              name: 'rootMotionLateralToForward',
              actual: Math.abs(dz) / Math.max(Math.abs(dx), ROOT_MOTION_TOLERANCE),
              expected: '<=1.25',
              threshold: 1.25,
            },
            viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
          },
        ),
      );
    }
  }
  return findings;
}

function declaredHeldItem(
  nodes: readonly CharacterNodeEvidence[],
): CharacterNodeEvidence | undefined {
  return nodes.find((evidence) => {
    const roles = readSemanticMetadataV1(evidence.node)?.roles ?? [];
    return (
      evidence.node.userData['kilnHeldItem'] === true ||
      roles.some(
        (role) =>
          role === 'held-item' || role.startsWith('held-item.') || role === 'character.held-item',
      )
    );
  });
}

function characterJointScale(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  for (const joint of collectCharacterJointNodes(root)) {
    bounds.expandByPoint(joint.node.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse));
  }
  if (bounds.isEmpty()) return 1;
  const size = bounds.getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z, 1);
}

/** Explicit declared grip relationships are deterministic contracts, not anatomy heuristics. */
function heldItemMotionFindings(
  input: RigQaInput,
  root: THREE.Object3D,
  clips: readonly ClipLike[],
): QaFinding[] {
  const held = input.rig?.heldItem;
  if (!held?.required || clips.length === 0) return [];
  const item = declaredHeldItem(collectNodes(root));
  if (!item) return [];
  let attachmentNode = item.node.parent;
  let attachment = attachmentNode ? readCharacterJointDescriptorV1(attachmentNode) : undefined;
  while (attachmentNode && !attachment) {
    attachmentNode = attachmentNode.parent;
    attachment = attachmentNode ? readCharacterJointDescriptorV1(attachmentNode) : undefined;
  }
  if (!attachmentNode || !attachment?.endEffector) return [];
  const tolerance = Math.max(0.01, characterJointScale(root) * GRIP_MOTION_RATIO);
  const findings: QaFinding[] = [];
  for (const clip of clips) {
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) continue;
    let baseline: number | undefined;
    let maximumDrift = 0;
    let maximumFraction = 0;
    for (const fraction of CHARACTER_SAMPLE_FRACTIONS) {
      const clone = root.clone(true);
      for (const track of clip.tracks) applyTrackAt(clone, track, fraction * clip.duration);
      clone.updateMatrixWorld(true);
      const cloneItem = clone.getObjectByName(item.node.name);
      const cloneAttachment = collectCharacterJointNodes(clone).find(
        (joint) => joint.descriptor.role === attachment.role,
      )?.node;
      if (!cloneItem || !cloneAttachment) continue;
      const inverse = clone.matrixWorld.clone().invert();
      const itemPoint = cloneItem.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
      const gripPoint = cloneAttachment.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
      const distance = itemPoint.distanceTo(gripPoint);
      baseline ??= distance;
      const drift = Math.abs(distance - baseline);
      if (drift > maximumDrift) {
        maximumDrift = drift;
        maximumFraction = fraction;
      }
    }
    if (maximumDrift <= tolerance) continue;
    findings.push(
      block(
        input,
        'CHAR_HELD_ITEM_GRIP_BREAK',
        `Held item ${item.node.name} breaks its declared ${attachment.role} grip relationship in ${clip.name} at phase ${maximumFraction}.`,
        {
          dimension: 'categoryReadiness',
          affected: {
            node: item.node.name,
            nodePath: item.nodePath,
            clip: clip.name,
          },
          measurement: {
            name: 'heldItemGripDistanceDrift',
            actual: maximumDrift,
            expected: 0,
            threshold: tolerance,
            unit: 'm',
          },
          viewHints: ['character.motion-strip.front', 'character.motion-strip.right'],
        },
      ),
    );
  }
  return findings;
}

export function inspectRig(context: RigQaInput): QaFinding[] {
  if (!context.rig) return [];
  const root = context.scene instanceof THREE.Object3D ? context.scene : undefined;
  const clips = (context.clips ?? []).filter(isClipLike);
  const findings: QaFinding[] = [];
  if (root) {
    const nodes = collectNodes(root);
    findings.push(...duplicateNameFindings(context, nodes, clips));
    const rig = parentAndRoleFindings(context, root);
    findings.push(...rig.findings);
    findings.push(...rigProfileFindings(context, root, rig.byRole));
    findings.push(...heldItemFindings(context, nodes));
    findings.push(...contactFindings(context, root));
    findings.push(...rootMotionFindings(context, root, clips));
    findings.push(...heldItemMotionFindings(context, root, clips));
  }
  const requested = context.rig?.clips ?? [];
  if (context.rig.clips !== undefined)
    findings.push(...requestedClipFindings(context, clips, requested));
  findings.push(...animationDataFindings(context, clips, requested, root));
  return dedupeFindings(findings);
}

/** Historical conformance adapter; current runtime receives RigQaInput directly. */
export function evaluateCharacterQa(context: QaContext): QaFinding[] {
  return inspectRig({
    scene: context.scene,
    clips: context.clips,
    profile: context.intent.qaProfile,
    rig: context.intent.category === 'character' ? context.intent.character : undefined,
    checkBodyPlan: context.intent.capabilities.includes('articulated'),
  });
}

export const CHARACTER_QA_RULE: QaRule = Object.freeze({
  id: PROFILE_RULE_ID,
  profile: 'character',
  scope: { kind: 'category' as const, category: 'character' as const },
  ruleClass: 'exact',
  owner: KILN_ENGINE_QA_OWNER,
  promotion: conformancePromotionAuthorization(
    'character-qa-v1',
    'src/qa/character.test.ts',
    '53086f1350c61cb8ddd32a5a4a97d23256e5dbde2e5b9765e47a3c76045bd6ed',
  ),
  defaultMode: 'enforce',
  evaluate: evaluateCharacterQa,
});
