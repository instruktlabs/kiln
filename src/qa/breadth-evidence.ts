import * as THREE from 'three';

import {
  readSemanticMetadataV1,
  type AssetIntentV1,
  type AssetScopeObservationV1,
  type ModularJoinObservationV1,
  type ModularKitContractV1,
  type ModularSocketContractV1,
  type VfxAxisDirection,
  type VfxIntentV1,
} from '../contracts';
import { isCubicSplineTrack } from '../animation-spline';
import type { VfxArtifactEvidenceV1, VfxMaterialEvidenceV1 } from './breadth';
import type { QaContext } from './types';

const stable = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObject3D(value: unknown): value is THREE.Object3D {
  return record(value) && value.isObject3D === true && typeof value.traverse === 'function';
}

function isMeshNode(value: THREE.Object3D): value is THREE.Mesh {
  return (value as THREE.Object3D & { isMesh?: boolean }).isMesh === true;
}

function isSpriteNode(value: THREE.Object3D): value is THREE.Sprite {
  return (value as THREE.Object3D & { isSprite?: boolean }).isSprite === true;
}

function isTexture(value: unknown): value is THREE.Texture {
  return record(value) && value.isTexture === true;
}

function isAnimationClip(value: unknown): value is THREE.AnimationClip {
  return (
    record(value) &&
    typeof value.name === 'string' &&
    typeof value.duration === 'number' &&
    Number.isFinite(value.duration) &&
    Array.isArray(value.tracks)
  );
}

function localRenderableBox(
  rootInverse: THREE.Matrix4,
  node: THREE.Object3D,
): THREE.Box3 | undefined {
  if (isSpriteNode(node)) {
    const transform = rootInverse.clone().multiply(node.matrixWorld);
    return new THREE.Box3(
      new THREE.Vector3(-0.5, -0.5, -0.0005),
      new THREE.Vector3(0.5, 0.5, 0.0005),
    ).applyMatrix4(transform);
  }
  if (!isMeshNode(node) || !node.geometry?.isBufferGeometry) return undefined;
  node.geometry.computeBoundingBox();
  const source = node.geometry.boundingBox;
  if (!source || source.isEmpty()) return undefined;
  const transform = rootInverse.clone().multiply(node.matrixWorld);
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

function textureDimensions(texture: THREE.Texture): [number, number] | undefined {
  const image = texture.image as { width?: unknown; height?: unknown } | undefined;
  return image &&
    typeof image.width === 'number' &&
    Number.isFinite(image.width) &&
    image.width > 0 &&
    typeof image.height === 'number' &&
    Number.isFinite(image.height) &&
    image.height > 0
    ? [image.width, image.height]
    : undefined;
}

function textureHasAlpha(texture: THREE.Texture | null | undefined): boolean {
  if (!texture) return false;
  const image = texture.image as
    | { data?: ArrayLike<number>; width?: number; height?: number }
    | undefined;
  if (!image?.data || !image.width || !image.height) return false;
  const pixelCount = image.width * image.height;
  if (pixelCount <= 0 || image.data.length < pixelCount * 4) return false;
  for (let index = 3; index < pixelCount * 4; index += 4) {
    if ((image.data[index] ?? 255) < 255) return true;
  }
  return false;
}

function materialTextures(material: THREE.Material): THREE.Texture[] {
  const candidate = material as unknown as THREE.Material & Record<string, unknown>;
  const textures = new Set<THREE.Texture>();
  for (const key of [
    'map',
    'alphaMap',
    'emissiveMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
  ]) {
    const value = candidate[key];
    if (isTexture(value)) textures.add(value);
  }
  return [...textures];
}

function materialTextureBytes(material: THREE.Material): number {
  return materialTextures(material).reduce((sum, texture) => {
    const dimensions = textureDimensions(texture);
    return sum + (dimensions ? Math.ceil(dimensions[0] * dimensions[1] * 4 * (4 / 3)) : 0);
  }, 0);
}

function alphaMode(material: THREE.Material): 'opaque' | 'mask' | 'blend' {
  const standard = material as THREE.Material & {
    alphaTest?: number;
    transparent?: boolean;
    opacity?: number;
    alphaMap?: THREE.Texture | null;
  };
  if ((standard.alphaTest ?? 0) > 0) return 'mask';
  if (standard.transparent || (standard.opacity ?? 1) < 1 || standard.alphaMap) return 'blend';
  return 'opaque';
}

function alphaData(material: THREE.Material): boolean {
  const standard = material as THREE.Material & {
    alphaTest?: number;
    opacity?: number;
    alphaMap?: THREE.Texture | null;
    map?: THREE.Texture | null;
  };
  return (
    (standard.opacity ?? 1) < 1 ||
    (standard.alphaMap !== undefined && standard.alphaMap !== null) ||
    textureHasAlpha(standard.alphaMap) ||
    textureHasAlpha(standard.map) ||
    ((standard.alphaTest ?? 0) > 0 && standard.alphaMap !== undefined && standard.alphaMap !== null)
  );
}

function surfaceRole(
  nodes: readonly THREE.Object3D[],
  intent: VfxIntentV1,
): VfxMaterialEvidenceV1['surfaceRole'] {
  const evidence = nodes.flatMap((node) => [
    node.name,
    ...(readSemanticMetadataV1(node)?.roles ?? []),
  ]);
  if (evidence.some((value) => /(?:^|[._ -])beam(?:$|[._ -])/i.test(value))) return 'beam';
  if (evidence.some((value) => /(?:^|[._ -])trail(?:$|[._ -])/i.test(value))) return 'trail';
  if (evidence.some((value) => /(?:^|[._ -])(?:volume|aura|portal)(?:$|[._ -])/i.test(value))) {
    return 'volume';
  }
  if (intent.subtype === 'beam') return 'beam';
  if (intent.subtype === 'trail') return 'trail';
  if (
    intent.subtype === 'volume-like' ||
    intent.subtype === 'aura' ||
    intent.subtype === 'portal'
  ) {
    return 'volume';
  }
  return 'card';
}

const EFFECT_SURFACE_ROLE = /^vfx\.effect\.surface(?:\.|$)/;

function isEffectSurface(nodes: readonly THREE.Object3D[]): boolean {
  return nodes.some(
    (node) =>
      isSpriteNode(node) ||
      (readSemanticMetadataV1(node)?.roles ?? []).some((role) => EFFECT_SURFACE_ROLE.test(role)),
  );
}

function coverageRatio(boxes: readonly THREE.Box3[], overall: THREE.Box3): number {
  if (boxes.length === 0 || overall.isEmpty()) return 0;
  const overallSize = overall.getSize(new THREE.Vector3());
  const denominator = Math.max(
    1e-9,
    overallSize.x * overallSize.y,
    overallSize.z * overallSize.y,
    overallSize.x * overallSize.z,
  );
  const area = boxes.reduce((sum, box) => {
    const size = box.getSize(new THREE.Vector3());
    return sum + Math.max(size.x * size.y, size.z * size.y, size.x * size.z);
  }, 0);
  return stable(Math.min(1, area / denominator));
}

function collectMaterialEvidence(
  root: THREE.Object3D,
  intent: VfxIntentV1,
): VfxMaterialEvidenceV1[] {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const byMaterial = new Map<THREE.Material, { nodes: THREE.Object3D[]; boxes: THREE.Box3[] }>();
  const overall = new THREE.Box3();
  root.traverseVisible((node) => {
    const box = localRenderableBox(inverse, node);
    if (!box || (!isMeshNode(node) && !isSpriteNode(node))) return;
    overall.union(box);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      const value = byMaterial.get(material) ?? { nodes: [], boxes: [] };
      value.nodes.push(node);
      value.boxes.push(box);
      byMaterial.set(material, value);
    }
  });
  return [...byMaterial.entries()]
    .map(([material, value], index): VfxMaterialEvidenceV1 => {
      const mode = alphaMode(material);
      const standard = material as THREE.Material & { alphaTest?: number };
      return {
        id: material.name || `material.${index}`,
        surfaceRole: surfaceRole(value.nodes, intent),
        effectSurface: isEffectSurface(value.nodes),
        alphaMode: mode,
        alphaData: alphaData(material),
        doubleSided: material.side === THREE.DoubleSide,
        ...(mode === 'mask' ? { alphaCutoff: standard.alphaTest ?? 0 } : {}),
        screenAreaRatio: coverageRatio(value.boxes, overall),
        transparentLayers: mode === 'blend' ? value.nodes.length : 0,
        textureMemoryBytes: materialTextureBytes(material),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function signedAxis(vector: THREE.Vector3): VfxAxisDirection {
  const values = [
    { axis: 'X', value: vector.x },
    { axis: 'Y', value: vector.y },
    { axis: 'Z', value: vector.z },
  ] as const;
  const dominant = [...values].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]!;
  return `${dominant.value < 0 ? '-' : '+'}${dominant.axis}` as VfxAxisDirection;
}

function dominantGeometryAxis(root: THREE.Object3D, mode: 'normal' | 'length'): VfxAxisDirection {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  let best: { score: number; direction: THREE.Vector3 } | undefined;
  root.traverseVisible((node) => {
    if (!isMeshNode(node) || !node.geometry?.isBufferGeometry || !isEffectSurface([node])) return;
    node.geometry.computeBoundingBox();
    const bounds = node.geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    const axes = [
      { score: size.x, direction: new THREE.Vector3(1, 0, 0) },
      { score: size.y, direction: new THREE.Vector3(0, 1, 0) },
      { score: size.z, direction: new THREE.Vector3(0, 0, 1) },
    ];
    const selected = axes.reduce((candidate, value) =>
      mode === 'length'
        ? value.score > candidate.score
          ? value
          : candidate
        : value.score < candidate.score
          ? value
          : candidate,
    );
    const relative = inverse.clone().multiply(node.matrixWorld);
    const direction = selected.direction.transformDirection(relative);
    const score = selected.score * node.getWorldScale(new THREE.Vector3()).length();
    if (!best || (mode === 'length' ? score > best.score : score < best.score)) {
      best = { score, direction };
    }
  });
  if (best) return signedAxis(best.direction);

  const overall = new THREE.Box3();
  root.traverseVisible((node) => {
    const box = localRenderableBox(inverse, node);
    if (box) overall.union(box);
  });
  if (overall.isEmpty()) return '+X';
  const size = overall.getSize(new THREE.Vector3());
  const vector =
    mode === 'length'
      ? size.x >= size.y && size.x >= size.z
        ? new THREE.Vector3(1, 0, 0)
        : size.y >= size.z
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1)
      : size.x <= size.y && size.x <= size.z
        ? new THREE.Vector3(1, 0, 0)
        : size.y <= size.z
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
  return signedAxis(vector);
}

function analyzedFacing(
  root: THREE.Object3D,
  intent: VfxIntentV1,
): VfxArtifactEvidenceV1['facing'] {
  let cameraFacing = false;
  root.traverseVisible((node) => {
    if (isSpriteNode(node)) cameraFacing = true;
  });
  return {
    source: cameraFacing ? 'explicit' : 'inferred',
    mode: cameraFacing ? 'camera-spherical' : 'fixed',
    normalAxis: cameraFacing ? '+X' : dominantGeometryAxis(root, 'normal'),
    ...((intent.subtype === 'beam' || intent.subtype === 'trail') && {
      directionAxis: dominantGeometryAxis(root, 'length'),
    }),
  };
}

function clipEndpointMatches(clip: THREE.AnimationClip | undefined): boolean {
  if (!clip || clip.tracks.length === 0) return false;
  return clip.tracks.every((track) => {
    const stride = track.getValueSize();
    if (stride <= 0 || track.values.length < stride * 2) return false;
    // A cubic-spline key is [in-tangent, value, out-tangent]; the endpoints are the values.
    const cubic = isCubicSplineTrack(track);
    const size = cubic ? stride / 3 : stride;
    const offset = cubic ? size : 0;
    if (track.ValueTypeName === 'quaternion' && size === 4) {
      const first = Array.from(track.values.slice(offset, offset + size));
      const end = track.values.length - stride + offset;
      const last = Array.from(track.values.slice(end, end + size));
      if (![...first, ...last].every(Number.isFinite)) return false;
      const a = new THREE.Quaternion().fromArray(first);
      const b = new THREE.Quaternion().fromArray(last);
      if (a.lengthSq() === 0 || b.lengthSq() === 0) return false;
      return 1 - Math.abs(a.normalize().dot(b.normalize())) <= 1e-6;
    }
    for (let index = 0; index < size; index++) {
      const first = Number(track.values[offset + index]);
      const last = Number(track.values[track.values.length - stride + offset + index]);
      if (!Number.isFinite(first) || !Number.isFinite(last) || Math.abs(first - last) > 1e-6) {
        return false;
      }
    }
    return true;
  });
}

function shaderMaterials(root: THREE.Object3D): THREE.Material[] {
  const values = new Set<THREE.Material>();
  root.traverseVisible((node) => {
    if (!isMeshNode(node) && !isSpriteNode(node)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (
        (material as THREE.Material & { isShaderMaterial?: boolean }).isShaderMaterial ||
        (material as THREE.Material & { isNodeMaterial?: boolean }).isNodeMaterial
      ) {
        values.add(material);
      }
    }
  });
  return [...values];
}

function shaderUniforms(materials: readonly THREE.Material[]): string[] {
  const values = new Set<string>();
  for (const material of materials) {
    const uniforms = (material as THREE.ShaderMaterial).uniforms;
    if (record(uniforms)) for (const key of Object.keys(uniforms)) values.add(key);
  }
  return [...values].sort();
}

/** Build the exact VFX evidence from actual scene materials and AnimationClip objects. */
export function analyzeVfxArtifactEvidenceV1(
  intent: VfxIntentV1,
  root: THREE.Object3D,
  clips: readonly unknown[] = [],
): VfxArtifactEvidenceV1 {
  const actualClips = clips.filter(isAnimationClip);
  const selectedClip =
    actualClips.find((clip) => clip.name === intent.animation.clipName) ?? actualClips[0];
  const shaders = shaderMaterials(root);
  const uniforms = shaderUniforms(shaders);
  const actualDriver = selectedClip ? 'clip' : uniforms.length > 0 ? 'timeUniform' : 'none';
  const endpointMatches = selectedClip ? clipEndpointMatches(selectedClip) : false;
  const playback =
    actualDriver === 'none'
      ? 'static'
      : actualDriver === 'clip'
        ? endpointMatches
          ? 'loop'
          : 'oneShot'
        : endpointMatches
          ? 'loop'
          : 'oneShot';
  const durationSeconds = selectedClip?.duration ?? 0;
  return {
    schemaVersion: 1,
    facing: analyzedFacing(root, intent),
    animation: {
      playback,
      durationSeconds: stable(durationSeconds),
      endpointBehavior:
        playback === 'static' ? 'none' : playback === 'loop' ? 'matchStart' : 'holdLast',
      driver: actualDriver,
      ...(selectedClip ? { clipName: selectedClip.name } : {}),
      ...(actualDriver === 'timeUniform' && intent.animation.timeUniformName
        ? { timeUniformName: intent.animation.timeUniformName }
        : {}),
      endpointMatches,
    },
    materials: collectMaterialEvidence(root, intent),
    clips: actualClips.map((clip) => ({ name: clip.name, durationSeconds: stable(clip.duration) })),
    uniforms,
  };
}

const MEMBER_ROLE = /^(?:asset|scope|cluster|modular)\.member(?:\.|$)|^modular\.piece(?:\.|$)/;
const DRESSING_ROLE = /^(?:scene\.dressing|scope\.extra|environment\.dressing)(?:\.|$)/;
const DRESSING_NAME = /(?:diorama|display[-_ ]?plate|terrain[-_ ]?base|backdrop)/i;

/** SCOPE-001 artifact evidence is derived from the actual scene graph. */
export function analyzeAssetScopeObservationV1(root: THREE.Object3D): AssetScopeObservationV1 {
  let renderableCount = 0;
  const members = new Set<THREE.Object3D>();
  const dressing = new Set<string>();
  root.traverseVisible((node) => {
    if ((isMeshNode(node) || isSpriteNode(node)) && node.visible) renderableCount++;
    const roles = readSemanticMetadataV1(node)?.roles ?? [];
    if (roles.some((role) => MEMBER_ROLE.test(role))) members.add(node);
    for (const role of roles) if (DRESSING_ROLE.test(role)) dressing.add(role);
    if (node !== root && DRESSING_NAME.test(node.name)) dressing.add(`name:${node.name}`);
  });
  // Count independent member roots. A replaceable part nested inside a member
  // belongs to that assembly; it does not turn a single asset into a cluster.
  const memberRoots = [...members].filter((node) => {
    for (let parent = node.parent; parent; parent = parent.parent)
      if (members.has(parent)) return false;
    return true;
  });
  const memberCount = memberRoots.length > 0 ? memberRoots.length : renderableCount > 0 ? 1 : 0;
  return {
    topLevelAssetRoots: memberCount,
    reusableMemberCount: memberCount,
    sceneDressingRoles: [...dressing].sort(),
  };
}

interface AnalyzedSocket {
  contract: ModularSocketContractV1;
  worldPosition: [number, number, number];
  worldNormal: [number, number, number];
  worldRotation: THREE.Quaternion;
}

function pathOf(root: THREE.Object3D, node: THREE.Object3D): string {
  const values: string[] = [];
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    values.push(cursor.name || cursor.type);
    if (cursor === root) break;
    cursor = cursor.parent;
  }
  return values.reverse().join('/');
}

function analyzeSockets(root: THREE.Object3D): AnalyzedSocket[] {
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  const rootWorldRotation = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const values: AnalyzedSocket[] = [];
  root.traverseVisible((node) => {
    const metadata = readSemanticMetadataV1(node);
    if (!metadata) return;
    const nodeWorldRotation = node.getWorldQuaternion(new THREE.Quaternion());
    for (const socket of metadata.sockets) {
      const frame = metadata.frames.find((candidate) => candidate.id === socket.frame);
      if (!frame) continue;
      const frameRotation = new THREE.Quaternion(...frame.rotation);
      const worldRotation = rootWorldRotation
        .clone()
        .multiply(nodeWorldRotation)
        .multiply(frameRotation);
      const position = new THREE.Vector3(...frame.translation)
        .applyMatrix4(node.matrixWorld)
        .applyMatrix4(rootInverse);
      const normal = new THREE.Vector3(1, 0, 0).applyQuaternion(worldRotation).normalize();
      values.push({
        contract: {
          id: socket.id,
          pieceId: pathOf(root, node),
          type: socket.type,
          compatibleTypes: [...socket.compatibleTypes],
          frame: {
            translation: [...frame.translation],
            rotation: [...frame.rotation],
          },
          allowedRotationsDegrees: [...(socket.allowedRotationsDegrees ?? [])],
        },
        worldPosition: [stable(position.x), stable(position.y), stable(position.z)],
        worldNormal: [stable(normal.x), stable(normal.y), stable(normal.z)],
        worldRotation,
      });
    }
  });
  return values.sort((a, b) => a.contract.id.localeCompare(b.contract.id));
}

/** Analyze the first reciprocal cross-piece socket pair from the actual scene. */
export function analyzeModularEvidenceV1(
  root: THREE.Object3D,
  trustedGrid: readonly [number, number, number],
): {
  kit?: ModularKitContractV1;
  join?: ModularJoinObservationV1;
} {
  const sockets = analyzeSockets(root);
  const kit = {
    schemaVersion: 1 as const,
    units: 'm' as const,
    grid: [trustedGrid[0], trustedGrid[1], trustedGrid[2]] as [number, number, number],
    sockets: sockets.map((value) => value.contract),
  };
  const pair = sockets
    .flatMap((a, index) => sockets.slice(index + 1).map((b) => [a, b] as const))
    .find(
      ([a, b]) =>
        a.contract.pieceId !== b.contract.pieceId &&
        a.contract.compatibleTypes.includes(b.contract.type) &&
        b.contract.compatibleTypes.includes(a.contract.type),
    );
  if (!pair) return { kit };
  const relative = pair[0].worldRotation.clone().invert().multiply(pair[1].worldRotation);
  const euler = new THREE.Euler().setFromQuaternion(relative, 'YXZ');
  const rotation = THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(euler.y), 360);
  return {
    kit,
    join: {
      aSocketId: pair[0].contract.id,
      bSocketId: pair[1].contract.id,
      aWorldPosition: pair[0].worldPosition,
      bWorldPosition: pair[1].worldPosition,
      aWorldNormal: pair[0].worldNormal,
      bWorldNormal: pair[1].worldNormal,
      relativeRotationDegrees: stable(rotation),
    },
  };
}

/** Trusted seam populated by runDeterministicSceneQa before registry evaluation. */
export function deriveW7BreadthEvidence(context: QaContext): QaContext['derivedEvidence'] {
  if (!isObject3D(context.scene)) return context.derivedEvidence;
  const derived: NonNullable<QaContext['derivedEvidence']> = {
    source: 'engine-scene-analysis',
    assetScope: analyzeAssetScopeObservationV1(context.scene),
  };
  if (context.intent.category === 'vfx' && context.intent.vfx) {
    derived.vfxArtifact = analyzeVfxArtifactEvidenceV1(
      context.intent.vfx,
      context.scene,
      context.clips,
    );
  }
  if (context.intent.scope.scope === 'modularSet') {
    const modular = analyzeModularEvidenceV1(
      context.scene,
      context.intent.modular?.grid ?? [1, 1, 1],
    );
    if (modular.kit) derived.modularKit = modular.kit;
    if (modular.join) derived.modularJoin = modular.join;
  }
  return derived;
}

export function withDerivedW7BreadthEvidence(context: QaContext): QaContext {
  const derivedEvidence = deriveW7BreadthEvidence(context);
  return derivedEvidence ? { ...context, derivedEvidence } : context;
}

/** Compile-time guard that keeps analyzer input on the canonical trusted intent. */
export function assertW7EvidenceIntent(_intent: AssetIntentV1): void {}
