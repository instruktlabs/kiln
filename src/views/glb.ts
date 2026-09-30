/** GLB-native input adapter for the deterministic CPU geometry-flat renderer. */
import { createGltfIO } from '../gltf-io';
import { listLodChainNodes } from '../lod-export';
import { registerReviewLodChains } from './lod';

import {
  Primitive,
  type Accessor,
  type Material,
  type Texture as GltfTexture,
} from '@gltf-transform/core';
import type { EmissiveStrength } from '@gltf-transform/extensions';
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
  type Object3D,
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  Quaternion,
  Vector3,
  InterpolateDiscrete,
  InterpolateLinear,
} from 'three';

export const GLB_GEOMETRY_FLAT_REASON = {
  TEXTURE_SAMPLING_UNSUPPORTED: 'GLB_FLAT_TEXTURE_SAMPLING_UNSUPPORTED',
  KTX2_SAMPLING_UNSUPPORTED: 'GLB_FLAT_KTX2_SAMPLING_UNSUPPORTED',
  NON_TRIANGLE_PRIMITIVE_UNSUPPORTED: 'GLB_FLAT_NON_TRIANGLE_PRIMITIVE_UNSUPPORTED',
  SKIN_DEFORMATION_UNSUPPORTED: 'GLB_FLAT_SKIN_DEFORMATION_UNSUPPORTED',
  MORPH_TARGETS_UNSUPPORTED: 'GLB_FLAT_MORPH_TARGETS_UNSUPPORTED',
} as const;

export type GlbGeometryFlatReasonCode =
  (typeof GLB_GEOMETRY_FLAT_REASON)[keyof typeof GLB_GEOMETRY_FLAT_REASON];

const REASON_ORDER: readonly GlbGeometryFlatReasonCode[] = [
  GLB_GEOMETRY_FLAT_REASON.KTX2_SAMPLING_UNSUPPORTED,
  GLB_GEOMETRY_FLAT_REASON.TEXTURE_SAMPLING_UNSUPPORTED,
  GLB_GEOMETRY_FLAT_REASON.NON_TRIANGLE_PRIMITIVE_UNSUPPORTED,
  GLB_GEOMETRY_FLAT_REASON.SKIN_DEFORMATION_UNSUPPORTED,
  GLB_GEOMETRY_FLAT_REASON.MORPH_TARGETS_UNSUPPORTED,
];
const REVIEW_CLIPS_EXTRAS_KEY = 'kilnReviewClipsV1';
const REVIEW_CLIP_LIMITS = {
  clips: 32,
  tracks: 256,
  samplesPerTrack: 4_096,
  valuesPerTrack: 16_384,
} as const;

export type GlbGeometryFlatErrorCode =
  | 'GLB_FLAT_PARSE_FAILED'
  | 'GLB_FLAT_NO_SCENE'
  | 'GLB_FLAT_NO_RENDERABLE_GEOMETRY'
  | 'GLB_FLAT_INVALID_INSTANCING';

export class GlbGeometryFlatError extends Error {
  constructor(
    readonly code: GlbGeometryFlatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GlbGeometryFlatError';
  }
}

interface FlatAttribute {
  array: ArrayLike<number>;
  itemSize: number;
  count: number;
}

interface FlatMaterial {
  color: { r: number; g: number; b: number };
  opacity: number;
  doubleSided: boolean;
  metalness: number;
  roughness: number;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff: number;
  emissive: [number, number, number];
  /** KHR_materials_emissive_strength, as Three.js `emissiveIntensity`. */
  emissiveIntensity: number;
}

interface FlatMesh {
  isMesh: true;
  visible: true;
  geometry: {
    getAttribute(name: string): FlatAttribute | undefined;
    index: FlatAttribute;
  };
  material: FlatMaterial;
  matrixWorld: { elements: readonly number[] };
}

export interface GlbGeometryFlatRoot {
  updateMatrixWorld(force?: boolean): void;
  traverse(callback: (value: unknown) => void): void;
}

export interface LoadedGlbGeometryFlatScene {
  root: GlbGeometryFlatRoot;
  reasonCodes: GlbGeometryFlatReasonCode[];
  meshCount: number;
  instanceCount: number;
}

export interface LoadedGlbReviewScene extends LoadedGlbGeometryFlatScene {
  root: Object3D;
  clips: AnimationClip[];
}

const glbIO = createGltfIO;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Declared loop intent carried by animation extras or the review copy. */
function withLoopIntent(clip: AnimationClip, intent: unknown): AnimationClip {
  if (intent === 'loop' || intent === 'once') clip.userData.kilnLoopIntent = intent;
  return clip;
}

function reviewClipsFromExtras(extras: unknown): AnimationClip[] | undefined {
  if (!record(extras)) return undefined;
  const envelope = extras[REVIEW_CLIPS_EXTRAS_KEY];
  if (!record(envelope) || envelope.version !== 1 || !Array.isArray(envelope.clips)) {
    return undefined;
  }
  if (envelope.clips.length > REVIEW_CLIP_LIMITS.clips) {
    throw new GlbGeometryFlatError(
      'GLB_FLAT_PARSE_FAILED',
      'Animation review clip limit exceeded.',
    );
  }
  let trackCount = 0;
  return envelope.clips.map((candidate) => {
    if (
      !record(candidate) ||
      typeof candidate.name !== 'string' ||
      candidate.name.length > 256 ||
      typeof candidate.duration !== 'number' ||
      !Number.isFinite(candidate.duration) ||
      candidate.duration < 0 ||
      !Array.isArray(candidate.tracks)
    ) {
      throw new GlbGeometryFlatError('GLB_FLAT_PARSE_FAILED', 'Invalid animation review clip.');
    }
    const tracks = candidate.tracks.map((track) => {
      trackCount++;
      if (
        trackCount > REVIEW_CLIP_LIMITS.tracks ||
        !record(track) ||
        typeof track.name !== 'string' ||
        track.name.length > 512 ||
        !Array.isArray(track.times) ||
        !Array.isArray(track.values) ||
        (track.interpolation !== undefined &&
          track.interpolation !== 'LINEAR' &&
          track.interpolation !== 'STEP') ||
        track.times.length > REVIEW_CLIP_LIMITS.samplesPerTrack ||
        track.values.length > REVIEW_CLIP_LIMITS.valuesPerTrack ||
        !track.times.every((value) => typeof value === 'number' && Number.isFinite(value)) ||
        !track.values.every((value) => typeof value === 'number' && Number.isFinite(value))
      ) {
        throw new GlbGeometryFlatError('GLB_FLAT_PARSE_FAILED', 'Invalid animation review track.');
      }
      const property = track.name.slice(track.name.lastIndexOf('.') + 1);
      const Track = property === 'quaternion' ? QuaternionKeyframeTrack : VectorKeyframeTrack;
      return new Track(
        track.name,
        track.times,
        track.values,
        track.interpolation === 'STEP' ? InterpolateDiscrete : InterpolateLinear,
      );
    });
    return withLoopIntent(
      new AnimationClip(candidate.name, candidate.duration, tracks),
      candidate.loopIntent,
    );
  });
}

export function geometryFlatTextureReasonCode(mimeType: string | null): GlbGeometryFlatReasonCode {
  return mimeType === 'image/ktx2'
    ? GLB_GEOMETRY_FLAT_REASON.KTX2_SAMPLING_UNSUPPORTED
    : GLB_GEOMETRY_FLAT_REASON.TEXTURE_SAMPLING_UNSUPPORTED;
}

function decodedAccessor(accessor: Accessor): Float64Array {
  const itemSize = accessor.getElementSize();
  const output = new Float64Array(accessor.getCount() * itemSize);
  const element: number[] = [];
  for (let index = 0; index < accessor.getCount(); index++) {
    accessor.getElement(index, element);
    for (let component = 0; component < itemSize; component++) {
      output[index * itemSize + component] = element[component]!;
    }
  }
  return output;
}

function triangleIndices(
  primitive: import('@gltf-transform/core').Primitive,
  vertexCount: number,
): Uint32Array | undefined {
  const sourceAccessor = primitive.getIndices();
  const source = sourceAccessor
    ? Array.from(decodedAccessor(sourceAccessor), (value) => Math.trunc(value))
    : Array.from({ length: vertexCount }, (_, index) => index);
  switch (primitive.getMode()) {
    case Primitive.Mode.TRIANGLES:
      return Uint32Array.from(source);
    case Primitive.Mode.TRIANGLE_STRIP: {
      const triangles: number[] = [];
      for (let index = 0; index + 2 < source.length; index++) {
        triangles.push(
          source[index]!,
          source[index + 1 + (index % 2)]!,
          source[index + 2 - (index % 2)]!,
        );
      }
      return Uint32Array.from(triangles);
    }
    case Primitive.Mode.TRIANGLE_FAN: {
      const triangles: number[] = [];
      for (let index = 1; index + 1 < source.length; index++) {
        triangles.push(source[index]!, source[index + 1]!, source[0]!);
      }
      return Uint32Array.from(triangles);
    }
    default:
      return undefined;
  }
}

function flatMaterial(material: Material | null): FlatMaterial {
  if (!material) {
    return {
      color: { r: 0.7, g: 0.7, b: 0.7 },
      opacity: 1,
      doubleSided: false,
      metalness: 0,
      roughness: 1,
      alphaMode: 'OPAQUE',
      alphaCutoff: 0.5,
      emissive: [0, 0, 0],
      emissiveIntensity: 1,
    };
  }
  const [r, g, b, factorAlpha] = material.getBaseColorFactor();
  const alphaMode = material.getAlphaMode();
  const opacity =
    alphaMode === 'BLEND'
      ? factorAlpha
      : alphaMode === 'MASK' && factorAlpha < material.getAlphaCutoff()
        ? 0
        : 1;
  return {
    color: { r, g, b },
    opacity,
    doubleSided: material.getDoubleSided(),
    metalness: material.getMetallicFactor(),
    roughness: material.getRoughnessFactor(),
    alphaMode,
    alphaCutoff: material.getAlphaCutoff(),
    emissive: material.getEmissiveFactor(),
    emissiveIntensity:
      material
        .getExtension<EmissiveStrength>('KHR_materials_emissive_strength')
        ?.getEmissiveStrength() ?? 1,
  };
}

function preserveTexture(
  source: GltfTexture | null,
  usage: 'color' | 'data',
  cache: Map<GltfTexture, Map<'color' | 'data', Texture>>,
): Texture | null {
  if (!source) return null;
  const encoded = source.getImage();
  const mime = source.getMimeType();
  if (!encoded || !mime) return null;
  let byUsage = cache.get(source);
  if (!byUsage) {
    byUsage = new Map();
    cache.set(source, byUsage);
  }
  const existing = byUsage.get(usage);
  if (existing) return existing;
  const texture = new Texture();
  texture.name = source.getName();
  texture.colorSpace = usage === 'color' ? SRGBColorSpace : NoColorSpace;
  texture.userData.encoded = { mime, bytes: Uint8Array.from(encoded) };
  byUsage.set(usage, texture);
  return texture;
}

function noteMaterialTextures(
  material: Material | null,
  reasons: Set<GlbGeometryFlatReasonCode>,
): void {
  if (!material) return;
  const textures = [
    material.getBaseColorTexture(),
    material.getNormalTexture(),
    material.getMetallicRoughnessTexture(),
    material.getEmissiveTexture(),
    material.getOcclusionTexture(),
  ];
  for (const texture of textures) {
    if (texture) reasons.add(geometryFlatTextureReasonCode(texture.getMimeType()));
  }
}

function instanceMatrices(node: import('@gltf-transform/core').Node): {
  matrices: Matrix4[];
  count: number;
} {
  const world = new Matrix4().fromArray(node.getWorldMatrix());
  const extension = node.getExtension('EXT_mesh_gpu_instancing') as {
    getAttribute(name: string): Accessor | null;
    listAttributes(): Accessor[];
  } | null;
  if (!extension) return { matrices: [world], count: 1 };

  const attributes = extension.listAttributes();
  if (attributes.length === 0) {
    throw new GlbGeometryFlatError(
      'GLB_FLAT_INVALID_INSTANCING',
      `Node ${JSON.stringify(node.getName())} has EXT_mesh_gpu_instancing with no attributes.`,
    );
  }
  const count = attributes[0]!.getCount();
  if (attributes.some((attribute) => attribute.getCount() !== count)) {
    throw new GlbGeometryFlatError(
      'GLB_FLAT_INVALID_INSTANCING',
      `Node ${JSON.stringify(node.getName())} has mismatched EXT_mesh_gpu_instancing counts.`,
    );
  }
  const translations = extension.getAttribute('TRANSLATION');
  const rotations = extension.getAttribute('ROTATION');
  const scales = extension.getAttribute('SCALE');
  const translation: number[] = [];
  const rotation: number[] = [];
  const scale: number[] = [];
  const matrices: Matrix4[] = [];
  for (let index = 0; index < count; index++) {
    translations?.getElement(index, translation);
    rotations?.getElement(index, rotation);
    scales?.getElement(index, scale);
    const local = new Matrix4().compose(
      new Vector3(
        translations ? translation[0]! : 0,
        translations ? translation[1]! : 0,
        translations ? translation[2]! : 0,
      ),
      new Quaternion(
        rotations ? rotation[0]! : 0,
        rotations ? rotation[1]! : 0,
        rotations ? rotation[2]! : 0,
        rotations ? rotation[3]! : 1,
      ).normalize(),
      new Vector3(scales ? scale[0]! : 1, scales ? scale[1]! : 1, scales ? scale[2]! : 1),
    );
    matrices.push(world.clone().multiply(local));
  }
  return { matrices, count };
}

/** Parse final artifact bytes into the minimal scene contract consumed by the CPU rasterizer. */
export async function loadGlbGeometryFlatScene(
  bytes: Uint8Array,
): Promise<LoadedGlbGeometryFlatScene> {
  let document: import('@gltf-transform/core').Document;
  try {
    document = await glbIO().readBinary(Uint8Array.from(bytes));
  } catch (error) {
    throw new GlbGeometryFlatError(
      'GLB_FLAT_PARSE_FAILED',
      `Could not parse final GLB bytes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (!scene) throw new GlbGeometryFlatError('GLB_FLAT_NO_SCENE', 'Final GLB has no scene.');

  const reasons = new Set<GlbGeometryFlatReasonCode>();
  const meshes: FlatMesh[] = [];
  let instanceCount = 0;
  const sceneNodes = new Set<import('@gltf-transform/core').Node>();
  const visit = (node: import('@gltf-transform/core').Node): void => {
    if (sceneNodes.has(node)) return;
    sceneNodes.add(node);
    for (const child of node.listChildren()) visit(child);
  };
  for (const child of scene.listChildren()) visit(child);

  for (const node of sceneNodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (node.getSkin()) reasons.add(GLB_GEOMETRY_FLAT_REASON.SKIN_DEFORMATION_UNSUPPORTED);
    const instances = instanceMatrices(node);
    instanceCount += instances.count;
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.listTargets().length > 0) {
        reasons.add(GLB_GEOMETRY_FLAT_REASON.MORPH_TARGETS_UNSUPPORTED);
      }
      const positionAccessor = primitive.getAttribute('POSITION');
      if (positionAccessor?.getElementSize() !== 3) continue;
      const positions = decodedAccessor(positionAccessor);
      const indices = triangleIndices(primitive, positionAccessor.getCount());
      if (!indices) {
        reasons.add(GLB_GEOMETRY_FLAT_REASON.NON_TRIANGLE_PRIMITIVE_UNSUPPORTED);
        continue;
      }
      const material = primitive.getMaterial();
      noteMaterialTextures(material, reasons);
      const geometry = {
        getAttribute(name: string): FlatAttribute | undefined {
          return name === 'position'
            ? { array: positions, itemSize: 3, count: positionAccessor.getCount() }
            : undefined;
        },
        index: { array: indices, itemSize: 1, count: indices.length },
      };
      for (const matrix of instances.matrices) {
        meshes.push({
          isMesh: true,
          visible: true,
          geometry,
          material: flatMaterial(material),
          matrixWorld: { elements: [...matrix.elements] },
        });
      }
    }
  }
  if (meshes.length === 0) {
    throw new GlbGeometryFlatError(
      'GLB_FLAT_NO_RENDERABLE_GEOMETRY',
      'Final GLB contains no triangle geometry supported by the CPU fallback.',
    );
  }
  const root: GlbGeometryFlatRoot = {
    updateMatrixWorld() {},
    traverse(callback) {
      for (const mesh of meshes) callback(mesh);
    },
  };
  return {
    root,
    reasonCodes: REASON_ORDER.filter((reason) => reasons.has(reason)),
    meshCount: meshes.length,
    instanceCount,
  };
}

function localInstanceMatrices(node: import('@gltf-transform/core').Node): Matrix4[] {
  const extension = node.getExtension('EXT_mesh_gpu_instancing') as {
    getAttribute(name: string): Accessor | null;
    listAttributes(): Accessor[];
  } | null;
  if (!extension) return [new Matrix4()];
  const attributes = extension.listAttributes();
  if (attributes.length === 0) {
    throw new GlbGeometryFlatError('GLB_FLAT_INVALID_INSTANCING', 'Invalid empty instancing data.');
  }
  const count = attributes[0]!.getCount();
  if (attributes.some((attribute) => attribute.getCount() !== count)) {
    throw new GlbGeometryFlatError('GLB_FLAT_INVALID_INSTANCING', 'Mismatched instancing data.');
  }
  const translations = extension.getAttribute('TRANSLATION');
  const rotations = extension.getAttribute('ROTATION');
  const scales = extension.getAttribute('SCALE');
  const translation: number[] = [];
  const rotation: number[] = [];
  const scale: number[] = [];
  return Array.from({ length: count }, (_, index) => {
    translations?.getElement(index, translation);
    rotations?.getElement(index, rotation);
    scales?.getElement(index, scale);
    return new Matrix4().compose(
      new Vector3(
        ...(translations ? (translation.slice(0, 3) as [number, number, number]) : [0, 0, 0]),
      ),
      new Quaternion(
        ...(rotations ? (rotation.slice(0, 4) as [number, number, number, number]) : [0, 0, 0, 1]),
      ).normalize(),
      new Vector3(...(scales ? (scale.slice(0, 3) as [number, number, number]) : [1, 1, 1])),
    );
  });
}

/** Load exact GLB bytes into a named, transformable review scene. This is the
 * production replacement for re-executing generated source in animation,
 * interior, inspect, and composed-scene review tools. Textures are deliberately
 * not sampled by the CPU scene; the same reason codes remain explicit. */
export async function loadGlbReviewScene(bytes: Uint8Array): Promise<LoadedGlbReviewScene> {
  let document: import('@gltf-transform/core').Document;
  try {
    document = await glbIO().readBinary(Uint8Array.from(bytes));
  } catch {
    throw new GlbGeometryFlatError('GLB_FLAT_PARSE_FAILED', 'Could not parse final GLB bytes.');
  }
  const sourceScene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (!sourceScene) throw new GlbGeometryFlatError('GLB_FLAT_NO_SCENE', 'Final GLB has no scene.');
  const reasons = new Set<GlbGeometryFlatReasonCode>();
  const root = new Group();
  root.name = sourceScene.getName() || 'Scene';
  const nodeMap = new Map<import('@gltf-transform/core').Node, Object3D>();
  const textureCache = new Map<GltfTexture, Map<'color' | 'data', Texture>>();
  let meshCount = 0;
  let instanceCount = 0;

  const buildNode = (source: import('@gltf-transform/core').Node): Object3D => {
    const existing = nodeMap.get(source);
    if (existing) return existing;
    const target = new Group();
    target.name = source.getName();
    target.position.fromArray(source.getTranslation());
    target.quaternion.fromArray(source.getRotation());
    target.scale.fromArray(source.getScale());
    target.userData = { ...source.getExtras() };
    nodeMap.set(source, target);
    const sourceMesh = source.getMesh();
    if (sourceMesh) {
      target.userData.kilnGlbMeshNode = true;
      if (source.getSkin()) reasons.add(GLB_GEOMETRY_FLAT_REASON.SKIN_DEFORMATION_UNSUPPORTED);
      const matrices = localInstanceMatrices(source);
      instanceCount += matrices.length;
      for (const [primitiveIndex, primitive] of sourceMesh.listPrimitives().entries()) {
        if (primitive.listTargets().length)
          reasons.add(GLB_GEOMETRY_FLAT_REASON.MORPH_TARGETS_UNSUPPORTED);
        const position = primitive.getAttribute('POSITION');
        if (position?.getElementSize() !== 3) continue;
        const indices = triangleIndices(primitive, position.getCount());
        if (!indices) {
          reasons.add(GLB_GEOMETRY_FLAT_REASON.NON_TRIANGLE_PRIMITIVE_UNSUPPORTED);
          continue;
        }
        const material = primitive.getMaterial();
        noteMaterialTextures(material, reasons);
        const flat = flatMaterial(material);
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          'position',
          new BufferAttribute(Float32Array.from(decodedAccessor(position)), 3),
        );
        const normal = primitive.getAttribute('NORMAL');
        if (normal) {
          geometry.setAttribute(
            'normal',
            new BufferAttribute(Float32Array.from(decodedAccessor(normal)), 3),
          );
        }
        const uv = primitive.getAttribute('TEXCOORD_0');
        if (uv) {
          geometry.setAttribute(
            'uv',
            new BufferAttribute(Float32Array.from(decodedAccessor(uv)), 2),
          );
        }
        const tangent = primitive.getAttribute('TANGENT');
        if (tangent) {
          geometry.setAttribute(
            'tangent',
            new BufferAttribute(Float32Array.from(decodedAccessor(tangent)), 4),
          );
        }
        geometry.setIndex(new BufferAttribute(indices, 1));
        const threeMaterial = new MeshStandardMaterial({
          opacity: flat.opacity,
          transparent: flat.alphaMode === 'BLEND',
          alphaTest: flat.alphaMode === 'MASK' ? flat.alphaCutoff : 0,
          side: flat.doubleSided ? 2 : 0,
          metalness: flat.metalness,
          roughness: flat.roughness,
        });
        threeMaterial.color.setRGB(flat.color.r, flat.color.g, flat.color.b);
        threeMaterial.emissive.fromArray(flat.emissive);
        threeMaterial.emissiveIntensity = flat.emissiveIntensity;
        if (material) {
          threeMaterial.userData = { ...material.getExtras() };
          threeMaterial.map = preserveTexture(
            material.getBaseColorTexture(),
            'color',
            textureCache,
          );
          threeMaterial.normalMap = preserveTexture(
            material.getNormalTexture(),
            'data',
            textureCache,
          );
          threeMaterial.normalScale.setScalar(material.getNormalScale());
          const metallicRoughness = preserveTexture(
            material.getMetallicRoughnessTexture(),
            'data',
            textureCache,
          );
          threeMaterial.metalnessMap = metallicRoughness;
          threeMaterial.roughnessMap = metallicRoughness;
          threeMaterial.emissiveMap = preserveTexture(
            material.getEmissiveTexture(),
            'color',
            textureCache,
          );
          threeMaterial.aoMap = preserveTexture(
            material.getOcclusionTexture(),
            'data',
            textureCache,
          );
          threeMaterial.aoMapIntensity = material.getOcclusionStrength();
        }
        for (const [index, matrix] of matrices.entries()) {
          const mesh = new Mesh(geometry, threeMaterial);
          // A deduplicated mesh resource can serve many distinctly named nodes.
          // QA repair hints must identify this owning node, not the shared resource.
          const baseName = source.getName() || sourceMesh.getName() || 'Mesh';
          mesh.name = `${baseName}:primitive-${primitiveIndex}${
            matrices.length === 1 ? '' : `:instance-${index}`
          }`;
          mesh.matrixAutoUpdate = false;
          mesh.matrix.copy(matrix);
          target.add(mesh);
          meshCount++;
        }
      }
    }
    for (const child of source.listChildren()) target.add(buildNode(child));
    return target;
  };
  for (const child of sourceScene.listChildren()) root.add(buildNode(child));
  root.updateMatrixWorld(true);
  if (meshCount === 0)
    throw new GlbGeometryFlatError(
      'GLB_FLAT_NO_RENDERABLE_GEOMETRY',
      'Final GLB contains no renderable geometry.',
    );
  // Lower levels of detail are built beside the scene, detached, for shots that name them.
  // Counts and reason codes stay those of the scene a loader draws.
  const sceneMeshCount = meshCount;
  const sceneInstanceCount = instanceCount;
  const sceneReasons = new Set(reasons);
  registerReviewLodChains(
    root,
    listLodChainNodes(document).map(({ levels: [base, ...lower] }) => ({
      base: nodeMap.get(base!)!,
      levels: lower.some((level) => nodeMap.has(level)) ? [] : lower.map(buildNode),
    })),
  );

  const nativeClips = document
    .getRoot()
    .listAnimations()
    .map((animation) =>
      withLoopIntent(
        new AnimationClip(
          animation.getName(),
          -1,
          animation.listChannels().flatMap((channel) => {
            const node = channel.getTargetNode();
            const path = channel.getTargetPath();
            const sampler = channel.getSampler();
            const input = sampler?.getInput()?.getArray();
            const output = sampler?.getOutput()?.getArray();
            const property =
              path === 'translation' ? 'position' : path === 'rotation' ? 'quaternion' : path;
            if (!node || !property || property === 'weights' || !input || !output) return [];
            const interpolation = sampler!.getInterpolation();
            if (interpolation !== 'STEP' && interpolation !== 'LINEAR') {
              throw new GlbGeometryFlatError(
                'GLB_FLAT_PARSE_FAILED',
                `Animation review does not support ${interpolation} interpolation; use LINEAR or STEP.`,
              );
            }
            const Track = path === 'rotation' ? QuaternionKeyframeTrack : VectorKeyframeTrack;
            return [
              new Track(
                `${node.getName()}.${property}`,
                input,
                output,
                interpolation === 'STEP' ? InterpolateDiscrete : InterpolateLinear,
              ),
            ];
          }),
        ),
        (animation.getExtras() as { kilnLoopIntent?: unknown }).kilnLoopIntent,
      ),
    );
  const clips = reviewClipsFromExtras(sourceScene.getExtras()) ?? nativeClips;
  return {
    root,
    clips,
    reasonCodes: REASON_ORDER.filter((reason) => sceneReasons.has(reason)),
    meshCount: sceneMeshCount,
    instanceCount: sceneInstanceCount,
  };
}
