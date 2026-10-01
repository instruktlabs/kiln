import { bindLegacyFixtureRequirements } from './helpers/requirements-fixture';
/**
 * W8 G-ROOF-EXPAND provider-free ablation.
 *
 * Candidate shed/hip scaffolds and an explicit roof-UV remap stay test-only.
 * This file measures whether either candidate earns a public P2 surface over
 * the existing freeform primitives and face-local gable geometry.
 */
import { createHash } from 'node:crypto';

import { WebIO, type Texture, type TextureInfo } from '@gltf-transform/core';
import { beforeAll, describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import * as THREE from 'three';

import { createGableShell, type RidgeAxis } from '../architecture';
import {
  createAssetIntentV1,
  readSemanticMetadataV1,
  readSemanticMetadataV1FromExtras,
  stampSemanticMetadataV1,
  type AssetIntentV1,
  type SemanticLocalFrameV1,
} from '../contracts';
import {
  optimizeGlbBytes,
  renderSceneToGLB as exportScene,
  type RenderSceneOptions,
} from '../render';

// These historical architecture experiment hashes remain pinned to their original converter.
// Candidate geometry parity is measured independently by integration-corpus.mjs.
const renderSceneToGLB = (root: THREE.Object3D, options: RenderSceneOptions) =>
  exportScene(root, { ...options, gltfExporter: 'legacy' });
import { loadTexture } from '../textures';

const PUBLIC_HELPER_MINIMUM_LIFT = 0.15;
const EPSILON = 1e-5;

type RoofType = 'shed' | 'hip';
type Arm = 'baseline' | 'candidate';

interface RoofGateCase {
  id: string;
  type: RoofType;
  ridgeAxis: RidgeAxis;
  spanX: number;
  spanZ: number;
  wallHeight: number;
  rise: number;
  overhang: number;
  transform: {
    position: readonly [number, number, number];
    rotation: readonly [number, number, number];
  };
}

interface FaceDefinition {
  id: string;
  role: string;
  vertices: readonly THREE.Vector3[];
}

interface BuiltRoofArm {
  root: THREE.Group;
  roof: THREE.Group;
  intent: AssetIntentV1;
  expectedFaces: readonly FaceDefinition[];
}

interface ArmMeasurement {
  id: string;
  structuralPass: boolean;
  faceCount: number;
  frameCount: number;
  validatorErrors: number;
  validatorWarnings: number;
  glbBytes: number;
  glbSha256: string;
  repeatGlbSha256: string;
  semanticSha256: string;
  byteStable: boolean;
}

interface UvMeasurement {
  id: string;
  arm: Arm;
  directionalPass: boolean;
  initialValidatorErrors: number;
  initialValidatorWarnings: number;
  rebakeValidatorErrors: number;
  rebakeValidatorWarnings: number;
  initialGlbSha256: string;
  rebakedGlbSha256: string;
  initialSemanticSha256: string;
  rebakedSemanticSha256: string;
  texturedMaterials: number;
}

const ROOF_GATE_CORPUS = Object.freeze([
  {
    id: 'shed-ridge-x-wide',
    type: 'shed',
    ridgeAxis: 'x',
    spanX: 8,
    spanZ: 5,
    wallHeight: 3,
    rise: 1.4,
    overhang: 0.35,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
  },
  {
    id: 'shed-ridge-z-long',
    type: 'shed',
    ridgeAxis: 'z',
    spanX: 5,
    spanZ: 9,
    wallHeight: 3.2,
    rise: 1.1,
    overhang: 0.45,
    transform: { position: [2.2, 0.4, -3.1], rotation: [0.04, 0.61, -0.03] },
  },
  {
    id: 'shed-ridge-x-square',
    type: 'shed',
    ridgeAxis: 'x',
    spanX: 6,
    spanZ: 6,
    wallHeight: 2.7,
    rise: 2,
    overhang: 0.2,
    transform: { position: [-1.7, 0.2, 2.8], rotation: [-0.02, -0.37, 0.05] },
  },
  {
    id: 'shed-ridge-z-steep',
    type: 'shed',
    ridgeAxis: 'z',
    spanX: 4,
    spanZ: 7,
    wallHeight: 4.1,
    rise: 2.6,
    overhang: 0.6,
    transform: { position: [4.3, 1.1, 1.6], rotation: [0.06, 0.22, -0.04] },
  },
  {
    id: 'hip-ridge-x-wide',
    type: 'hip',
    ridgeAxis: 'x',
    spanX: 9,
    spanZ: 5,
    wallHeight: 3,
    rise: 1.8,
    overhang: 0.35,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
  },
  {
    id: 'hip-ridge-z-long',
    type: 'hip',
    ridgeAxis: 'z',
    spanX: 5,
    spanZ: 10,
    wallHeight: 3.4,
    rise: 2.1,
    overhang: 0.4,
    transform: { position: [-3.4, 0.5, -2.2], rotation: [0.03, 0.73, 0.02] },
  },
  {
    id: 'hip-ridge-x-square',
    type: 'hip',
    ridgeAxis: 'x',
    spanX: 6,
    spanZ: 6,
    wallHeight: 2.8,
    rise: 1.6,
    overhang: 0.25,
    transform: { position: [1.3, 0.3, 3.7], rotation: [-0.03, -0.48, 0.04] },
  },
  {
    id: 'hip-ridge-z-square',
    type: 'hip',
    ridgeAxis: 'z',
    spanX: 7,
    spanZ: 7,
    wallHeight: 3.6,
    rise: 2.4,
    overhang: 0.55,
    transform: { position: [3.8, 0.8, -1.4], rotation: [0.05, 0.31, -0.02] },
  },
] as const satisfies readonly RoofGateCase[]);

const UV_GATE_CORPUS = Object.freeze([
  { id: 'gable-uv-ridge-x', ridgeAxis: 'x', spanX: 8, spanZ: 5, rise: 1.7, overhang: 0.35 },
  { id: 'gable-uv-ridge-z', ridgeAxis: 'z', spanX: 5, spanZ: 8, rise: 1.7, overhang: 0.35 },
] as const);

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const SEMANTIC_NUMBER_SCALE = 1_000_000;

function canonicalNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Canonical glTF fingerprint rejects non-finite numeric values.');
  }
  const rounded = Math.round(value * SEMANTIC_NUMBER_SCALE) / SEMANTIC_NUMBER_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'number') return canonicalNumber(value);
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function canonicalNumericArray(values: ArrayLike<number> | null): number[] | null {
  return values ? Array.from(values, canonicalNumber) : null;
}

function refIndex<T extends object>(
  indices: ReadonlyMap<T, number>,
  value: T | null,
): number | null {
  if (!value) return null;
  const index = indices.get(value);
  if (index === undefined)
    throw new Error('Canonical glTF fingerprint found an unregistered reference.');
  return index;
}

function glbJson(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength < 20)
    throw new Error('Canonical glTF fingerprint requires a GLB container.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error('Canonical glTF fingerprint requires a GLB with a JSON first chunk.');
  }
  const jsonLength = view.getUint32(12, true);
  if (20 + jsonLength > bytes.byteLength)
    throw new Error('Canonical glTF fingerprint found a truncated JSON chunk.');
  return JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trimEnd(),
  ) as Record<string, unknown>;
}

function assertNoDeclaredExtensions(bytes: Uint8Array): void {
  const json = glbJson(bytes);
  const declaration = (key: 'extensionsUsed' | 'extensionsRequired'): string[] => {
    const value = json[key];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      throw new Error(`Canonical glTF fingerprint found malformed ${key}.`);
    }
    return value;
  };
  const nested: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'extensions') {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new Error('Canonical glTF fingerprint found a malformed nested extensions object.');
        }
        nested.push(...Object.keys(entry as Record<string, unknown>));
      }
      visit(entry);
    }
  };
  visit(json);
  const names = [
    ...declaration('extensionsUsed'),
    ...declaration('extensionsRequired'),
    ...nested,
  ].sort();
  if (names.length) {
    throw new Error(
      `Canonical glTF fingerprint does not support extensions: ${[...new Set(names)].join(', ')}`,
    );
  }
}

function glbJsonFixture(json: Record<string, unknown>): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const bytes = new Uint8Array(20 + jsonLength);
  bytes.fill(0x20, 20);
  bytes.set(encoded, 20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  return bytes;
}

/**
 * Fingerprints decoded glTF meaning rather than container bytes. Raw GLBs remain byte-repeatable
 * within one runtime (asserted separately), but JSON float formatting and encoded PNG bytes are not
 * portable identities across libm/image-codec builds. This projection keeps every property used by
 * the roof gate: hierarchy/TRS/extras, PBR materials, primitive topology/accessors, and decoded
 * texture pixels. Numbers are quantized below the gate's 1e-5 geometric tolerance.
 */
async function canonicalSemanticGlbSha256(bytes: Uint8Array): Promise<string> {
  assertNoDeclaredExtensions(bytes);
  const document = await new WebIO().readBinary(bytes);
  const root = document.getRoot();
  if (root.listAnimations().length || root.listCameras().length || root.listSkins().length) {
    throw new Error(
      'Roof-gate semantic fingerprint must be extended before animated, camera, or skinned fixtures are added.',
    );
  }

  const scenes = root.listScenes();
  const nodes = root.listNodes();
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const textures = root.listTextures();
  const accessors = root.listAccessors();
  const sceneIndices = new Map(scenes.map((value, index) => [value, index]));
  const nodeIndices = new Map(nodes.map((value, index) => [value, index]));
  const meshIndices = new Map(meshes.map((value, index) => [value, index]));
  const materialIndices = new Map(materials.map((value, index) => [value, index]));
  const textureIndices = new Map(textures.map((value, index) => [value, index]));
  const accessorIndices = new Map(accessors.map((value, index) => [value, index]));

  const textureUse = (texture: Texture | null, info: TextureInfo | null) =>
    texture
      ? {
          texture: refIndex(textureIndices, texture),
          texCoord: info?.getTexCoord() ?? 0,
          magFilter: info?.getMagFilter() ?? null,
          minFilter: info?.getMinFilter() ?? null,
          wrapS: info?.getWrapS() ?? null,
          wrapT: info?.getWrapT() ?? null,
        }
      : null;

  const canonicalTextures = await Promise.all(
    textures.map(async (texture) => {
      const image = texture.getImage();
      if (!image) throw new Error('Canonical glTF fingerprint requires embedded texture bytes.');
      if (texture.getMimeType() !== 'image/png') {
        throw new Error(
          `Canonical glTF fingerprint supports lossless image/png only, not ${texture.getMimeType() || 'unknown'}.`,
        );
      }
      const decoded = await sharp(Buffer.from(image))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        name: texture.getName(),
        mimeType: texture.getMimeType(),
        uri: texture.getURI(),
        pixels: {
          width: decoded.info.width,
          height: decoded.info.height,
          channels: decoded.info.channels,
          sha256: sha256(new Uint8Array(decoded.data)),
        },
        extras: canonicalValue(texture.getExtras()),
      };
    }),
  );

  const fingerprint = {
    schemaVersion: 1,
    defaultScene: refIndex(sceneIndices, root.getDefaultScene()),
    scenes: scenes.map((scene) => ({
      name: scene.getName(),
      children: scene.listChildren().map((node) => refIndex(nodeIndices, node)),
      extras: canonicalValue(scene.getExtras()),
    })),
    nodes: nodes.map((node) => ({
      name: node.getName(),
      translation: canonicalNumericArray(node.getTranslation()),
      rotation: canonicalNumericArray(node.getRotation()),
      scale: canonicalNumericArray(node.getScale()),
      weights: canonicalNumericArray(node.getWeights()),
      children: node.listChildren().map((child) => refIndex(nodeIndices, child)),
      mesh: refIndex(meshIndices, node.getMesh()),
      extras: canonicalValue(node.getExtras()),
    })),
    meshes: meshes.map((mesh) => ({
      name: mesh.getName(),
      weights: canonicalNumericArray(mesh.getWeights()),
      extras: canonicalValue(mesh.getExtras()),
      primitives: mesh.listPrimitives().map((primitive) => ({
        mode: primitive.getMode(),
        material: refIndex(materialIndices, primitive.getMaterial()),
        indices: refIndex(accessorIndices, primitive.getIndices()),
        attributes: primitive
          .listSemantics()
          .slice()
          .sort()
          .map((semantic) => [
            semantic,
            refIndex(accessorIndices, primitive.getAttribute(semantic)),
          ]),
        targets: primitive.listTargets().map((target) =>
          target
            .listSemantics()
            .slice()
            .sort()
            .map((semantic) => [
              semantic,
              refIndex(accessorIndices, target.getAttribute(semantic)),
            ]),
        ),
        extras: canonicalValue(primitive.getExtras()),
      })),
    })),
    materials: materials.map((material) => ({
      name: material.getName(),
      baseColorFactor: canonicalNumericArray(material.getBaseColorFactor()),
      metallicFactor: canonicalNumber(material.getMetallicFactor()),
      roughnessFactor: canonicalNumber(material.getRoughnessFactor()),
      emissiveFactor: canonicalNumericArray(material.getEmissiveFactor()),
      alphaMode: material.getAlphaMode(),
      alphaCutoff: canonicalNumber(material.getAlphaCutoff()),
      doubleSided: material.getDoubleSided(),
      normalScale: canonicalNumber(material.getNormalScale()),
      occlusionStrength: canonicalNumber(material.getOcclusionStrength()),
      baseColorTexture: textureUse(
        material.getBaseColorTexture(),
        material.getBaseColorTextureInfo(),
      ),
      metallicRoughnessTexture: textureUse(
        material.getMetallicRoughnessTexture(),
        material.getMetallicRoughnessTextureInfo(),
      ),
      normalTexture: textureUse(material.getNormalTexture(), material.getNormalTextureInfo()),
      occlusionTexture: textureUse(
        material.getOcclusionTexture(),
        material.getOcclusionTextureInfo(),
      ),
      emissiveTexture: textureUse(material.getEmissiveTexture(), material.getEmissiveTextureInfo()),
      extras: canonicalValue(material.getExtras()),
    })),
    textures: canonicalTextures,
    accessors: accessors.map((accessor) => ({
      name: accessor.getName(),
      type: accessor.getType(),
      componentType: accessor.getComponentType(),
      normalized: accessor.getNormalized(),
      count: accessor.getCount(),
      values: canonicalNumericArray(accessor.getArray()),
      extras: canonicalValue(accessor.getExtras()),
    })),
  };
  return sha256(canonicalJson(fingerprint));
}

function semantic<T extends THREE.Object3D>(
  node: T,
  roles: readonly string[],
  frames: readonly SemanticLocalFrameV1[] = [],
): T {
  return stampSemanticMetadataV1(node, { roles, frames });
}

function vectorKey(value: THREE.Vector3): string {
  return value
    .toArray()
    .map((entry) => Math.round(entry * 1_000_000) / 1_000_000)
    .join(',');
}

function normalizedVertices(vertices: readonly THREE.Vector3[]): THREE.Vector3[] {
  const seen = new Set<string>();
  const copy = vertices
    .filter((vertex) => {
      const key = vectorKey(vertex);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((vertex) => vertex.clone());
  if (copy.length < 3) throw new TypeError('A roof face needs at least three unique vertices.');
  const normal = copy[1]!.clone().sub(copy[0]!).cross(copy[2]!.clone().sub(copy[0]!));
  if (normal.y < 0) copy.reverse();
  return copy;
}

function faceGeometry(vertices: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const ordered = normalizedVertices(vertices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      ordered.flatMap((vertex) => vertex.toArray()),
      3,
    ),
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      ordered.flatMap((vertex) => [vertex.x, vertex.z]),
      2,
    ),
  );
  geometry.setIndex(ordered.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function roofFaceDefinitions(spec: RoofGateCase): FaceDefinition[] {
  const halfX = spec.spanX / 2 + spec.overhang;
  const halfZ = spec.spanZ / 2 + spec.overhang;
  if (spec.type === 'shed') {
    return spec.ridgeAxis === 'x'
      ? [
          {
            id: 'surface',
            role: 'roof.shed.surface',
            vertices: [
              new THREE.Vector3(-halfX, spec.rise, -halfZ),
              new THREE.Vector3(halfX, spec.rise, -halfZ),
              new THREE.Vector3(halfX, 0, halfZ),
              new THREE.Vector3(-halfX, 0, halfZ),
            ],
          },
        ]
      : [
          {
            id: 'surface',
            role: 'roof.shed.surface',
            vertices: [
              new THREE.Vector3(-halfX, spec.rise, -halfZ),
              new THREE.Vector3(-halfX, spec.rise, halfZ),
              new THREE.Vector3(halfX, 0, halfZ),
              new THREE.Vector3(halfX, 0, -halfZ),
            ],
          },
        ];
  }

  if (spec.ridgeAxis === 'x') {
    const ridgeHalf = Math.max(0, halfX - halfZ);
    const ridgeLeft = new THREE.Vector3(-ridgeHalf, spec.rise, 0);
    const ridgeRight = new THREE.Vector3(ridgeHalf, spec.rise, 0);
    return [
      {
        id: 'negative',
        role: 'roof.hip.negative',
        vertices: [
          new THREE.Vector3(-halfX, 0, -halfZ),
          new THREE.Vector3(halfX, 0, -halfZ),
          ridgeRight,
          ridgeLeft,
        ],
      },
      {
        id: 'positive',
        role: 'roof.hip.positive',
        vertices: [
          new THREE.Vector3(halfX, 0, halfZ),
          new THREE.Vector3(-halfX, 0, halfZ),
          ridgeLeft,
          ridgeRight,
        ],
      },
      {
        id: 'left',
        role: 'roof.hip.left',
        vertices: [
          new THREE.Vector3(-halfX, 0, halfZ),
          new THREE.Vector3(-halfX, 0, -halfZ),
          ridgeLeft,
        ],
      },
      {
        id: 'right',
        role: 'roof.hip.right',
        vertices: [
          new THREE.Vector3(halfX, 0, -halfZ),
          new THREE.Vector3(halfX, 0, halfZ),
          ridgeRight,
        ],
      },
    ];
  }

  const ridgeHalf = Math.max(0, halfZ - halfX);
  const ridgeBack = new THREE.Vector3(0, spec.rise, -ridgeHalf);
  const ridgeFront = new THREE.Vector3(0, spec.rise, ridgeHalf);
  return [
    {
      id: 'left',
      role: 'roof.hip.left',
      vertices: [
        new THREE.Vector3(-halfX, 0, halfZ),
        new THREE.Vector3(-halfX, 0, -halfZ),
        ridgeBack,
        ridgeFront,
      ],
    },
    {
      id: 'right',
      role: 'roof.hip.right',
      vertices: [
        new THREE.Vector3(halfX, 0, -halfZ),
        new THREE.Vector3(halfX, 0, halfZ),
        ridgeFront,
        ridgeBack,
      ],
    },
    {
      id: 'negative',
      role: 'roof.hip.negative',
      vertices: [
        new THREE.Vector3(-halfX, 0, -halfZ),
        new THREE.Vector3(halfX, 0, -halfZ),
        ridgeBack,
      ],
    },
    {
      id: 'positive',
      role: 'roof.hip.positive',
      vertices: [
        new THREE.Vector3(halfX, 0, halfZ),
        new THREE.Vector3(-halfX, 0, halfZ),
        ridgeFront,
      ],
    },
  ];
}

function addShellEnvelope(root: THREE.Group, spec: RoofGateCase, material: THREE.Material): void {
  const thickness = 0.15;
  const walls = [
    [
      'front',
      new THREE.BoxGeometry(thickness, spec.wallHeight, spec.spanZ),
      [spec.spanX / 2, spec.wallHeight / 2, 0],
    ],
    [
      'back',
      new THREE.BoxGeometry(thickness, spec.wallHeight, spec.spanZ),
      [-spec.spanX / 2, spec.wallHeight / 2, 0],
    ],
    [
      'left',
      new THREE.BoxGeometry(spec.spanX, spec.wallHeight, thickness),
      [0, spec.wallHeight / 2, -spec.spanZ / 2],
    ],
    [
      'right',
      new THREE.BoxGeometry(spec.spanX, spec.wallHeight, thickness),
      [0, spec.wallHeight / 2, spec.spanZ / 2],
    ],
  ] as const;
  for (const [id, geometry, position] of walls) {
    const wall = semantic(new THREE.Mesh(geometry, material), [`wall.${id}`]);
    wall.name = `Wall_${id}`;
    wall.position.set(position[0], position[1], position[2]);
    root.add(wall);
  }
  const floor = semantic(
    new THREE.Mesh(new THREE.BoxGeometry(spec.spanX, 0.1, spec.spanZ), material),
    ['floor'],
  );
  floor.name = 'Floor';
  floor.position.y = -0.05;
  root.add(floor);
}

function candidateFrames(spec: RoofGateCase, face: FaceDefinition): SemanticLocalFrameV1[] {
  const ordered = normalizedVertices(face.vertices);
  const center = ordered
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / ordered.length);
  const normal = ordered[1]!
    .clone()
    .sub(ordered[0]!)
    .cross(ordered[2]!.clone().sub(ordered[0]!))
    .normalize();
  const requestedRidge =
    spec.ridgeAxis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const ridge = requestedRidge
    .clone()
    .addScaledVector(normal, -requestedRidge.dot(normal))
    .normalize();
  // Match the public gable RoofFaceFrame's right-handed basis: X is ridge,
  // Y is outward normal, and Z is downhill, so X cross Y must equal Z.
  const downhill = ridge.clone().cross(normal).normalize();
  const rotation = new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(ridge, normal, downhill))
    .normalize();
  return [
    {
      id: 'surface',
      translation: center.toArray(),
      rotation: rotation.toArray(),
    },
  ];
}

function buildRoofArm(spec: RoofGateCase, arm: Arm): BuiltRoofArm {
  const root = semantic(new THREE.Group(), [`architecture.shell.${spec.type}`]);
  root.name = `${arm}_${spec.id}`;
  root.position.set(...spec.transform.position);
  root.rotation.set(...spec.transform.rotation);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xc8ad82, roughness: 0.9 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x59616d, roughness: 0.82 });
  addShellEnvelope(root, spec, wallMaterial);

  const roof = semantic(new THREE.Group(), ['roof.assembly']);
  roof.name = 'Roof';
  roof.position.y = spec.wallHeight;
  root.add(roof);
  const expectedFaces = roofFaceDefinitions(spec);
  for (const face of expectedFaces) {
    const mesh = semantic(
      new THREE.Mesh(faceGeometry(face.vertices), roofMaterial),
      [face.role],
      arm === 'candidate' ? candidateFrames(spec, face) : [],
    );
    mesh.name = `Roof_${face.id}`;
    roof.add(mesh);
  }
  root.updateMatrixWorld(true);

  const halfRun = (spec.ridgeAxis === 'x' ? spec.spanZ : spec.spanX) / 2;
  const intent = createAssetIntentV1({
    category: 'architecture',
    architecture: {
      subtype: `${spec.type}-roof building`,
      enterable: false,
      footprint: { spanX: spec.spanX, spanZ: spec.spanZ },
      wallHeight: spec.wallHeight,
      roof: {
        type: spec.type,
        ridgeAxis: spec.ridgeAxis,
        rise: spec.rise,
        pitchDegrees: THREE.MathUtils.radToDeg(Math.atan2(spec.rise, halfRun)),
        overhang: spec.overhang,
        closedEnds: false,
      },
    },
  });
  return { root, roof, intent, expectedFaces };
}

function sceneFaceSignature(roof: THREE.Group): string[] {
  return roof.children
    .filter((node): node is THREE.Mesh => node instanceof THREE.Mesh)
    .map((mesh) => {
      const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const vertices = new Set<string>();
      for (let index = 0; index < position.count; index++) {
        vertices.add(
          vectorKey(
            new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)),
          ),
        );
      }
      return [...vertices].sort().join('|');
    })
    .sort();
}

function expectedFaceSignature(faces: readonly FaceDefinition[]): string[] {
  return faces.map((face) => [...new Set(face.vertices.map(vectorKey))].sort().join('|')).sort();
}

function faceNormal(vertices: readonly THREE.Vector3[]): THREE.Vector3 {
  const ordered = normalizedVertices(vertices);
  return ordered[1]!
    .clone()
    .sub(ordered[0]!)
    .cross(ordered[2]!.clone().sub(ordered[0]!))
    .normalize();
}

function everyTriangleFacesUp(mesh: THREE.Mesh): boolean {
  const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = mesh.geometry.getIndex();
  const draw = index
    ? Array.from({ length: index.count }, (_, offset) => index.getX(offset))
    : Array.from({ length: position.count }, (_, offset) => offset);
  if (draw.length === 0 || draw.length % 3 !== 0) return false;
  for (let offset = 0; offset < draw.length; offset += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, draw[offset]!);
    const b = new THREE.Vector3().fromBufferAttribute(position, draw[offset + 1]!);
    const c = new THREE.Vector3().fromBufferAttribute(position, draw[offset + 2]!);
    const normal = b.sub(a).cross(c.sub(a));
    if (!normal.toArray().every(Number.isFinite) || normal.lengthSq() <= EPSILON || normal.y <= 0) {
      return false;
    }
  }
  return true;
}

function frameMatchesFace(node: THREE.Object3D, face: FaceDefinition): boolean {
  const frames = readSemanticMetadataV1(node)?.frames ?? [];
  if (frames.length !== 1 || frames[0]?.id !== 'surface') return false;
  const frame = frames[0];
  const translation = new THREE.Vector3().fromArray(frame.translation);
  const rotation = new THREE.Quaternion().fromArray(frame.rotation);
  const expectedCenter = normalizedVertices(face.vertices)
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / normalizedVertices(face.vertices).length);
  const expectedNormal = faceNormal(face.vertices);
  const frameNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).normalize();
  return (
    translation.distanceTo(expectedCenter) <= EPSILON &&
    Math.abs(rotation.length() - 1) <= EPSILON &&
    frameNormal.dot(expectedNormal) >= 1 - EPSILON
  );
}

function structurePass(arm: BuiltRoofArm, armName: Arm): boolean {
  const meshes = arm.roof.children.filter((node): node is THREE.Mesh => node instanceof THREE.Mesh);
  if (
    sceneFaceSignature(arm.roof).join(';') !== expectedFaceSignature(arm.expectedFaces).join(';')
  ) {
    return false;
  }
  for (const [index, mesh] of meshes.entries()) {
    const roles = readSemanticMetadataV1(mesh)?.roles ?? [];
    if (!roles.some((role) => role.startsWith('roof.'))) return false;
    if (!everyTriangleFacesUp(mesh)) return false;
    const face = arm.expectedFaces[index];
    if (!face) return false;
    const frameCount = readSemanticMetadataV1(mesh)?.frames.length ?? 0;
    if (armName === 'baseline' ? frameCount !== 0 : !frameMatchesFace(mesh, face)) return false;
  }
  arm.root.updateMatrixWorld(true);
  const actualBounds = new THREE.Box3();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index++) {
      actualBounds.expandByPoint(
        mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)),
      );
    }
  }
  const expectedBounds = new THREE.Box3();
  for (const face of arm.expectedFaces) {
    for (const vertex of face.vertices) {
      expectedBounds.expandByPoint(arm.roof.localToWorld(vertex.clone()));
    }
  }
  return (
    !actualBounds.isEmpty() &&
    actualBounds.min.distanceTo(expectedBounds.min) <= EPSILON &&
    actualBounds.max.distanceTo(expectedBounds.max) <= EPSILON
  );
}

async function measureRoofArm(spec: RoofGateCase, armName: Arm): Promise<ArmMeasurement> {
  const arm = buildRoofArm(spec, armName);
  const first = await renderSceneToGLB(arm.root, {
    requirements: bindLegacyFixtureRequirements(arm.intent),
    optimize: 'off',
  });
  const repeat = await renderSceneToGLB(arm.root, {
    requirements: bindLegacyFixtureRequirements(arm.intent),
    optimize: 'off',
  });
  const document = await new WebIO().readBinary(first.bytes);
  const exportedFaces = document
    .getRoot()
    .listNodes()
    .filter((node) => node.getName().startsWith('Roof_'));
  const exportedFaceCount = exportedFaces.length;
  const frameCount = exportedFaces.reduce(
    (count, node) =>
      count + (readSemanticMetadataV1FromExtras(node.getExtras())?.frames.length ?? 0),
    0,
  );
  return {
    id: spec.id,
    structuralPass:
      structurePass(arm, armName) &&
      exportedFaceCount === arm.expectedFaces.length &&
      frameCount === (armName === 'candidate' ? arm.expectedFaces.length : 0) &&
      first.gltfValidation.issues.numErrors === 0,
    faceCount: arm.expectedFaces.length,
    frameCount,
    validatorErrors: first.gltfValidation.issues.numErrors,
    validatorWarnings: first.gltfValidation.issues.numWarnings,
    glbBytes: first.bytes.byteLength,
    glbSha256: sha256(first.bytes),
    repeatGlbSha256: sha256(repeat.bytes),
    semanticSha256: await canonicalSemanticGlbSha256(first.bytes),
    byteStable: sha256(first.bytes) === sha256(repeat.bytes),
  };
}

async function directionalPatternMaterial(
  compressionLevel = 9,
): Promise<THREE.MeshStandardMaterial> {
  const width = 2;
  const height = 4;
  const rows = [
    [230, 50, 45, 255],
    [230, 180, 45, 255],
    [55, 175, 90, 255],
    [55, 95, 220, 255],
  ] as const;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels.set(rows[y]!, (y * width + x) * 4);
  }
  const encoded = await sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel })
    .toBuffer();
  const texture = await loadTexture(new Uint8Array(encoded), {
    usage: 'albedo',
    name: 'Roof_RidgeU_DownhillV_TestPattern',
  });
  texture.flipY = false;
  return new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 0.8 });
}

function remapTopFaceUv(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let index = 0; index < position.count; index++) {
    if (normal.getY(index) > 0.9) {
      xs.push(position.getX(index));
      zs.push(position.getZ(index));
    }
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  for (let index = 0; index < position.count; index++) {
    if (normal.getY(index) <= 0.9) continue;
    uv.setXY(
      index,
      (position.getX(index) - minX) / (maxX - minX),
      1 - (position.getZ(index) - minZ) / (maxZ - minZ),
    );
  }
  uv.needsUpdate = true;
}

function correlation(left: readonly number[], right: readonly number[]): number {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index]! - leftMean;
    const b = right[index]! - rightMean;
    numerator += a * b;
    leftSquare += a * a;
    rightSquare += b * b;
  }
  return numerator / Math.sqrt(leftSquare * rightSquare);
}

async function inspectDirectionalUv(bytes: Uint8Array): Promise<{
  pass: boolean;
  texturedMaterials: number;
}> {
  const document = await new WebIO().readBinary(bytes);
  const texturedMaterials = document
    .getRoot()
    .listMaterials()
    .filter((material) => material.getBaseColorTexture() !== null).length;
  const roofNodes = document
    .getRoot()
    .listNodes()
    .filter((node) => node.getName().startsWith('Mesh_Roof_'));
  const passes = roofNodes.map((node) => {
    const primitive = node.getMesh()?.listPrimitives()[0];
    if (!primitive?.getMaterial()?.getBaseColorTexture()) return false;
    const positions = primitive?.getAttribute('POSITION')?.getArray();
    const normals = primitive?.getAttribute('NORMAL')?.getArray();
    const uvs = primitive?.getAttribute('TEXCOORD_0')?.getArray();
    if (!positions || !normals || !uvs) return false;
    const x: number[] = [];
    const z: number[] = [];
    const u: number[] = [];
    const v: number[] = [];
    for (let index = 0; index < normals.length / 3; index++) {
      if ((normals[index * 3 + 1] ?? -1) <= 0.9) continue;
      x.push(positions[index * 3] ?? 0);
      z.push(positions[index * 3 + 2] ?? 0);
      u.push(uvs[index * 2] ?? 0);
      v.push(uvs[index * 2 + 1] ?? 0);
    }
    return (
      x.length === 4 &&
      Math.abs(correlation(x, u)) > 1 - EPSILON &&
      Math.abs(correlation(z, v)) > 1 - EPSILON &&
      Math.abs(correlation(x, v)) < EPSILON &&
      Math.abs(correlation(z, u)) < EPSILON
    );
  });
  return { pass: roofNodes.length === 2 && passes.every(Boolean), texturedMaterials };
}

async function measureUvCase(
  spec: (typeof UV_GATE_CORPUS)[number],
  arm: Arm,
): Promise<UvMeasurement> {
  const wall = new THREE.MeshStandardMaterial({ color: 0xc8ad82, roughness: 0.9 });
  const roofMaterial = await directionalPatternMaterial();
  const shell = createGableShell(
    `Uv_${arm}_${spec.id}`,
    { wall, roof: roofMaterial },
    {
      spanX: spec.spanX,
      spanZ: spec.spanZ,
      wallHeight: 3,
      rise: spec.rise,
      overhang: spec.overhang,
      ridgeAxis: spec.ridgeAxis,
      enterable: false,
      closedEnds: true,
    },
  );
  if (arm === 'candidate') {
    for (const slope of shell.roof.slopes) {
      if (!(slope instanceof THREE.Mesh)) continue;
      slope.geometry = slope.geometry.clone();
      remapTopFaceUv(slope.geometry);
    }
  }
  const halfRun = (spec.ridgeAxis === 'x' ? spec.spanZ : spec.spanX) / 2;
  const intent = createAssetIntentV1({
    category: 'architecture',
    architecture: {
      subtype: 'gable building',
      enterable: false,
      footprint: { spanX: spec.spanX, spanZ: spec.spanZ },
      wallHeight: 3,
      roof: {
        type: 'gable',
        ridgeAxis: spec.ridgeAxis,
        rise: spec.rise,
        pitchDegrees: THREE.MathUtils.radToDeg(Math.atan2(spec.rise, halfRun)),
        overhang: spec.overhang,
        closedEnds: true,
      },
    },
  });
  const initial = await renderSceneToGLB(shell.root, {
    requirements: bindLegacyFixtureRequirements(intent),
    optimize: 'off',
    // Preserve this historical experiment's original representation. The v0.9
    // default indexing policy has its own acceptance tests in index-policy.test.ts.
    indexPolicy: 'asBuilt',
  });
  const rebaked = await optimizeGlbBytes(initial.bytes, {
    mode: 'palette',
    category: 'architecture',
  });
  if (!rebaked) throw new Error('Expected the architecture UV fixture to rebake.');
  const initialInspection = await inspectDirectionalUv(initial.bytes);
  const rebakedInspection = await inspectDirectionalUv(rebaked.bytes);
  return {
    id: spec.id,
    arm,
    directionalPass: initialInspection.pass && rebakedInspection.pass,
    initialValidatorErrors: initial.gltfValidation.issues.numErrors,
    initialValidatorWarnings: initial.gltfValidation.issues.numWarnings,
    rebakeValidatorErrors: rebaked.gltfValidation.issues.numErrors,
    rebakeValidatorWarnings: rebaked.gltfValidation.issues.numWarnings,
    initialGlbSha256: sha256(initial.bytes),
    rebakedGlbSha256: sha256(rebaked.bytes),
    initialSemanticSha256: await canonicalSemanticGlbSha256(initial.bytes),
    rebakedSemanticSha256: await canonicalSemanticGlbSha256(rebaked.bytes),
    texturedMaterials: Math.min(
      initialInspection.texturedMaterials,
      rebakedInspection.texturedMaterials,
    ),
  };
}

let baselineRoof: ArmMeasurement[];
let candidateRoof: ArmMeasurement[];
let uv: UvMeasurement[];

beforeAll(async () => {
  baselineRoof = [];
  candidateRoof = [];
  for (const spec of ROOF_GATE_CORPUS) {
    baselineRoof.push(await measureRoofArm(spec, 'baseline'));
    candidateRoof.push(await measureRoofArm(spec, 'candidate'));
  }
  uv = [];
  for (const spec of UV_GATE_CORPUS) {
    uv.push(await measureUvCase(spec, 'baseline'));
    uv.push(await measureUvCase(spec, 'candidate'));
  }
}, 40_000);

describe('W8 G-ROOF-EXPAND provider-free gate', () => {
  test('canonical semantic identity ignores codec bytes and sub-tolerance jitter but catches geometry changes', async () => {
    expect(() => canonicalNumber(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalNumber(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    const makeFixture = async (compressionLevel: number, x: number) => {
      const root = new THREE.Group();
      root.name = 'Semantic_Fingerprint_Fixture';
      root.position.x = x;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1, 3),
        await directionalPatternMaterial(compressionLevel),
      );
      mesh.name = 'Mesh_Semantic_Fingerprint';
      root.add(mesh);
      return renderSceneToGLB(root, { optimize: 'off' });
    };
    const compact = await makeFixture(9, 0);
    const fast = await makeFixture(1, 0.0000004);
    const moved = await makeFixture(9, 0.00002);
    expect(sha256(compact.bytes)).not.toBe(sha256(fast.bytes));
    expect(await canonicalSemanticGlbSha256(compact.bytes)).toBe(
      await canonicalSemanticGlbSha256(fast.bytes),
    );
    expect(await canonicalSemanticGlbSha256(compact.bytes)).not.toBe(
      await canonicalSemanticGlbSha256(moved.bytes),
    );
    await expect(
      canonicalSemanticGlbSha256(
        glbJsonFixture({
          asset: { version: '2.0' },
          extensionsUsed: ['KHR_materials_clearcoat'],
          materials: [{ extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1 } } }],
        }),
      ),
    ).rejects.toThrow(/KHR_materials_clearcoat/);
    await expect(
      canonicalSemanticGlbSha256(
        glbJsonFixture({ asset: { version: '2.0' }, extensionsUsed: 'KHR_materials_clearcoat' }),
      ),
    ).rejects.toThrow(/malformed extensionsUsed/);
    await expect(
      canonicalSemanticGlbSha256(
        glbJsonFixture({
          asset: { version: '2.0' },
          materials: [{ extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1 } } }],
        }),
      ),
    ).rejects.toThrow(/KHR_materials_clearcoat/);
  });

  test('fixed shed/hip candidate fixtures do not beat correct freeform controls', () => {
    const baselinePasses = baselineRoof.filter((entry) => entry.structuralPass).length;
    const candidatePasses = candidateRoof.filter((entry) => entry.structuralPass).length;
    const lift = candidatePasses / candidateRoof.length - baselinePasses / baselineRoof.length;
    expect(sha256(canonicalJson(ROOF_GATE_CORPUS))).toBe(
      '8facf880d90fb1e4d1b47c525ac732139dfddd00296590f265dd388215b19567',
    );
    expect(baselinePasses).toBe(8);
    expect(candidatePasses).toBe(8);
    expect(lift).toBe(0);
    expect(lift).toBeLessThan(PUBLIC_HELPER_MINIMUM_LIFT);
    expect(baselineRoof.every((entry) => entry.frameCount === 0)).toBe(true);
    expect(candidateRoof.every((entry) => entry.frameCount === entry.faceCount)).toBe(true);
  });

  test('all scaffold arms are exact, byte-stable, and Khronos-clean', () => {
    for (const entry of [...baselineRoof, ...candidateRoof]) {
      expect(entry.structuralPass, entry.id).toBe(true);
      expect(entry.validatorErrors, entry.id).toBe(0);
      expect(entry.validatorWarnings, entry.id).toBe(0);
      expect(entry.byteStable, entry.id).toBe(true);
      expect(entry.glbSha256, entry.id).toBe(entry.repeatGlbSha256);
      expect(entry.glbBytes, entry.id).toBeGreaterThan(1_000);
    }
  });

  test('existing face-local gable UVs already run ridge-to-eave through export and rebake', () => {
    expect(sha256(canonicalJson(UV_GATE_CORPUS))).toBe(
      '061cad5800ed7122da9f8e7d85bb97b013831b317b93d99c841a8178b6fb7640',
    );
    expect(uv).toHaveLength(4);
    for (const entry of uv) {
      expect(entry.directionalPass, `${entry.arm}:${entry.id}`).toBe(true);
      expect(entry.initialValidatorErrors, `${entry.arm}:${entry.id}`).toBe(0);
      expect(entry.initialValidatorWarnings, `${entry.arm}:${entry.id}`).toBe(0);
      expect(entry.rebakeValidatorErrors, `${entry.arm}:${entry.id}`).toBe(0);
      expect(entry.rebakeValidatorWarnings, `${entry.arm}:${entry.id}`).toBe(0);
      expect(entry.texturedMaterials, `${entry.arm}:${entry.id}`).toBeGreaterThanOrEqual(1);
    }
    const baselinePasses = uv.filter(
      (entry) => entry.arm === 'baseline' && entry.directionalPass,
    ).length;
    const candidatePasses = uv.filter(
      (entry) => entry.arm === 'candidate' && entry.directionalPass,
    ).length;
    expect(baselinePasses).toBe(2);
    expect(candidatePasses).toBe(2);
    expect(candidatePasses / 2 - baselinePasses / 2).toBe(0);
  });

  test('pins the complete negative gate report', () => {
    const report = {
      schemaVersion: 2,
      experimentId: 'kiln.architecture.roof-expansion.provider-free.v1',
      artifactIdentity: 'kiln.decoded-gltf-semantic.v1',
      providerCalls: 0,
      publicHelperMinimumLift: PUBLIC_HELPER_MINIMUM_LIFT,
      scaffold: {
        corpusSha256: sha256(canonicalJson(ROOF_GATE_CORPUS)),
        baselinePasses: baselineRoof.filter((entry) => entry.structuralPass).length,
        candidatePasses: candidateRoof.filter((entry) => entry.structuralPass).length,
        total: ROOF_GATE_CORPUS.length,
        lift: 0,
        candidateOwnFixtureFrames: candidateRoof.reduce((sum, entry) => sum + entry.frameCount, 0),
      },
      uv: {
        corpusSha256: sha256(canonicalJson(UV_GATE_CORPUS)),
        baselinePasses: uv.filter((entry) => entry.arm === 'baseline' && entry.directionalPass)
          .length,
        candidatePasses: uv.filter((entry) => entry.arm === 'candidate' && entry.directionalPass)
          .length,
        totalPerArm: UV_GATE_CORPUS.length,
        lift: 0,
      },
      delegatedHumanLabels: 0,
      gate: 'closed',
      gateReason:
        'Neither P2 candidate improves the fixed deterministic pass rate over the existing public surface; no public API expansion is justified.',
      artifactSemanticSha256: [...baselineRoof, ...candidateRoof].map(
        (entry) => entry.semanticSha256,
      ),
      uvArtifactSemanticSha256: uv.flatMap((entry) => [
        entry.initialSemanticSha256,
        entry.rebakedSemanticSha256,
      ]),
    } as const;
    expect(report.artifactSemanticSha256).toEqual([
      '8ef5dde9dd55cae9c191520ce796b02883fec5372fddfd5330595203d7df816e',
      'cf6ebcb813e489a6f85598a3595b185e88049c2a577a2487a90512ab86d84ffc',
      '811f166ee84858210b5c814548e9123eb5f096c6237bf9ebce59d4fb6e78deaa',
      '7e75eff22ba18aaca067997c64aa5ee95ccb994be235bc80a057b0a6c5714f5f',
      '5d5eea27ea6d18170b02a90d93a6ffd187bbaebb59d61e8259c713f7a5ab45e1',
      '91be9f341bb32719b0d0ac633b4afd8bff04fef9f9f51d6278080246f4771571',
      '26ff3a12225c2e1e8006953148ee35165f1e9c1600a00cd48614f7a0ba8c02f3',
      'b7b8d0b93180bdd9dd6c121a206ad16173d665af1469dc9596404243191d1f8e',
      '7da52ab2f2bbd34d48874ad820282eed4debdce992ce01512a0f0b619c45553b',
      '9a9ae3f4aa2a26014ca82a4e2befc2d6ff2d7823f91f03fbc2b696d6569f2968',
      'daaef40184ee572c665a88379f86ee68fcd004adb08cb0dc782cd5d420988c27',
      'ee2dfc1f5687ef9c93643c71a2802f3a66db76569372a4586ad215f28ac15eb0',
      'a6dd13db58ce6623c85d12d9240d78aeae93e4240598786fb554fdd6bd898c39',
      '881fe2bc7bebe25cc9e23f08f4a3824920bd0133d347d85dec27b931e400eb1c',
      '98edae5f31ab323530e80f11ee321c608924b56804c0430d1569bcf3f957d868',
      'ef0c35aa4b374129c28ef63a6bbda1018786f8f22146bf7ed8056954664587a4',
    ]);
    expect(report.uvArtifactSemanticSha256).toEqual([
      '4e945b321eb8e1ef058454ec2be04fe12dcce0a0f82bd5adce67809be07d9e8c',
      '1b237305e0a2d4fcb605edfddf2d1ba6798946227b2c4f6adf42eed4170f454a',
      'a8a01f015dbbfb830306311cf056def7a2b648ebf21e090f02ede0022a0938c8',
      '0ed7afed454ade27e7e852fd047c77a5eca2b16ff01bdbd13cb228d963139a31',
      '95c65fe529f271be203da5db6f7bfa552939fc63ea58b4530636163e08a77c23',
      'a3b06dbc560224a3d05b59655d47bb4f370f553154dccc6288ae1f656d1c781c',
      'fe0c383ca2027ea6642e4a3773e47923b13914ec55a421d51f291cd16e4f2028',
      '6f4f4ba10f1028ba8cde301f153200da34bebc58ba7d8a971f0b2b8338aaa177',
    ]);
    expect(sha256(canonicalJson(report.artifactSemanticSha256))).toBe(
      '35397ac0dbc9f395d31f1c83275553c227f6ef9bb9725301c264878cbcaf0ddd',
    );
    expect(sha256(canonicalJson(report.uvArtifactSemanticSha256))).toBe(
      '5b1e21ecdf2fa71a83757daf144c4334cb154dedf057aeb07f0c9c4c33fe2204',
    );
    expect(sha256(canonicalJson(report))).toBe(
      '6047b4aac6fd9d21392ca490185f2987adbda3135fba8966cc4f82d57c98a96f',
    );
  });
});
