import * as THREE from 'three';

import type { KilnTextureMetadata } from '../textures';
import { conformancePromotionAuthorization, KILN_ENGINE_QA_OWNER, type QaRule } from './registry';
import type { QaContext, QaFinding } from './types';

type StandardMaterial = THREE.MeshStandardMaterial & {
  isMeshStandardMaterial?: boolean;
};

type EncodedTextureLike = {
  mime?: unknown;
  bytes?: unknown;
};

function textureMeta(texture: THREE.Texture): KilnTextureMetadata | undefined {
  return (texture.userData as Record<string, unknown>)['kilnTexture'] as
    | KilnTextureMetadata
    | undefined;
}

function affected(
  mesh: THREE.Mesh,
  material: THREE.Material,
  texture?: THREE.Texture,
  attribute?: string,
) {
  return {
    node: mesh.name || '(unnamed mesh)',
    material: material.name || '(unnamed material)',
    ...(texture ? { texture: texture.name || '(unnamed texture)' } : {}),
    ...(attribute ? { attribute } : {}),
  };
}

function textureHasAlpha(texture: THREE.Texture): boolean {
  const meta = textureMeta(texture);
  if (meta) return meta.hasAlpha;
  const image = texture.image as
    | { data?: ArrayLike<number>; width?: number; height?: number }
    | undefined;
  const data = image?.data;
  if (!data || data.length < 4) return false;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 255) < 255) return true;
  }
  return false;
}

function encodedTextureIsExportable(texture: THREE.Texture): boolean {
  const encoded = (texture.userData as Record<string, unknown>)['encoded'] as
    | EncodedTextureLike
    | undefined;
  if (!encoded || typeof encoded.mime !== 'string') return false;
  const bytes = encoded.bytes as ArrayLike<number> | undefined;
  if (!bytes || typeof bytes.length !== 'number' || bytes.length < 4) return false;

  if (encoded.mime === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (encoded.mime === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (encoded.mime === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

function validateTextureSlot(
  findings: QaFinding[],
  mesh: THREE.Mesh,
  material: StandardMaterial,
  texture: THREE.Texture | null,
  slot: string,
  expected: 'srgb' | 'linear',
): void {
  if (!texture) return;
  const meta = textureMeta(texture);
  const actual =
    texture.colorSpace === THREE.SRGBColorSpace
      ? 'srgb'
      : texture.colorSpace === THREE.NoColorSpace
        ? 'linear'
        : (meta?.colorSpace ?? 'linear');
  if (!meta || !encodedTextureIsExportable(texture)) {
    findings.push({
      code: 'MAT_TEXTURE_DECODE_FAILED',
      disposition: 'block',
      dimension: 'exportIntegrity',
      profile: 'material.portablePbr',
      message: `${slot} texture has no verified decoded/exportable image payload.`,
      affected: affected(mesh, material, texture, slot),
      repairText:
        'Use loadApprovedTexture(resourceId) or proceduralTexture() before assigning it. A texture built in code is baked to PNG automatically, so reaching this means its pixels were unreadable — it must be a DataTexture holding 8-bit RGB or RGBA bytes, not float data or an image element.',
    });
  }
  if (actual !== expected) {
    findings.push({
      code: 'MAT_TEXTURE_COLOR_SPACE',
      disposition: 'block',
      dimension: 'exportIntegrity',
      profile: 'material.portablePbr',
      message: `${slot} texture must use ${expected} data interpretation, not ${actual}.`,
      affected: affected(mesh, material, texture, slot),
      measurement: { name: 'colorSpace', actual, expected },
      repairText: `Choose an approved resource whose declared usage matches '${slot === 'map' ? 'albedo' : slot}', or for a texture built in code set texture.colorSpace = ${expected === 'srgb' ? 'THREE.SRGBColorSpace' : 'THREE.NoColorSpace'} — it is never set for you, because reinterpreting an author's pixels silently is exactly the failure this check exists to catch.`,
    });
  }

  const image = texture.image as { width?: number; height?: number } | undefined;
  if (
    !image ||
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    (image.width ?? 0) <= 0 ||
    (image.height ?? 0) <= 0
  ) {
    findings.push({
      code: 'MAT_TEXTURE_INVALID_DIMENSIONS',
      disposition: 'block',
      dimension: 'exportIntegrity',
      profile: 'material.portablePbr',
      message: `${slot} texture has invalid or undecodable dimensions.`,
      affected: affected(mesh, material, texture, slot),
      repairText: 'Use a decodable PNG, JPEG, or WebP with positive dimensions.',
    });
  }
  if (!mesh.geometry.getAttribute('uv')) {
    findings.push({
      code: 'MAT_TEXTURE_UV_MISSING',
      disposition: 'block',
      dimension: 'exportIntegrity',
      profile: 'material.portablePbr',
      message: `${slot} texture is used on geometry without TEXCOORD_0 UVs.`,
      affected: affected(mesh, material, texture, slot),
      repairText: 'Unwrap the geometry before assigning a texture-backed material.',
    });
  }
}

function validateMaterial(
  mesh: THREE.Mesh,
  material: THREE.Material,
  requiresPrecomputedTangents: boolean,
): QaFinding[] {
  const findings: QaFinding[] = [];
  const standard = material as StandardMaterial;
  if (!standard.isMeshStandardMaterial) return findings;

  for (const [name, value] of [
    ['roughness', standard.roughness],
    ['metalness', standard.metalness],
    ['opacity', standard.opacity],
    ['emissiveIntensity', standard.emissiveIntensity],
  ] as const) {
    if (!Number.isFinite(value)) {
      findings.push({
        code: 'MAT_NONFINITE_FACTOR',
        disposition: 'block',
        dimension: 'exportIntegrity',
        profile: 'material.portablePbr',
        message: `Material factor ${name} is non-finite.`,
        affected: affected(mesh, material),
        measurement: { name, actual: String(value) },
      });
    }
  }

  validateTextureSlot(findings, mesh, standard, standard.map, 'map', 'srgb');
  validateTextureSlot(findings, mesh, standard, standard.emissiveMap, 'emissive', 'srgb');
  validateTextureSlot(findings, mesh, standard, standard.normalMap, 'normal', 'linear');
  validateTextureSlot(
    findings,
    mesh,
    standard,
    standard.roughnessMap,
    'metallicRoughness',
    'linear',
  );
  validateTextureSlot(
    findings,
    mesh,
    standard,
    standard.metalnessMap,
    'metallicRoughness',
    'linear',
  );
  validateTextureSlot(findings, mesh, standard, standard.aoMap, 'occlusion', 'linear');

  if (standard.normalMap && !mesh.geometry.getAttribute('tangent')) {
    findings.push({
      code: 'MAT_NORMAL_TANGENTS_MISSING',
      disposition: requiresPrecomputedTangents ? 'block' : 'warn',
      dimension: 'categoryReadiness',
      profile: 'material.portablePbr',
      message: requiresPrecomputedTangents
        ? 'The trusted consumer profile requires precomputed tangents for normal-mapped geometry.'
        : 'Normal-mapped geometry has no precomputed tangents; the consumer must derive them.',
      affected: affected(mesh, material, standard.normalMap, 'normal'),
      repairText: 'Generate and export TANGENT data for the normal-mapped geometry.',
    });
  }

  if (
    standard.roughnessMap &&
    standard.metalnessMap &&
    standard.roughnessMap !== standard.metalnessMap
  ) {
    findings.push({
      code: 'MAT_SEPARATE_METALLIC_ROUGHNESS',
      disposition: 'block',
      dimension: 'exportIntegrity',
      profile: 'material.portablePbr',
      message: 'glTF requires one packed metallic-roughness texture (G=roughness, B=metalness).',
      affected: affected(mesh, material),
      repairText: 'Pack both channels and pass the result as metallicRoughness.',
    });
  }

  if (mesh.geometry.userData['kilnGeometryRole'] === 'foliageCard') {
    const validMask = standard.alphaTest > 0 && !standard.transparent;
    if (
      !standard.map ||
      !textureHasAlpha(standard.map) ||
      !validMask ||
      standard.side !== THREE.DoubleSide ||
      !mesh.geometry.getAttribute('uv')
    ) {
      findings.push({
        code: 'MAT_FOLIAGE_CARD_CONTRACT',
        disposition: 'block',
        dimension: 'categoryReadiness',
        profile: 'material.foliageCard',
        message:
          'Foliage cards require UVs, an alpha-bearing base-color texture, MASK cutoff, and double-sided output.',
        affected: affected(mesh, material, standard.map ?? undefined),
        repairText: 'Use foliageMaterial() with an alpha-bearing albedo texture.',
      });
    }
  }

  return findings;
}

export function inspectPortableSceneMaterials(
  scene: unknown,
  requiresPrecomputedTangents = false,
): QaFinding[] {
  const root = scene as THREE.Object3D | undefined;
  if (!root?.traverse) return [];
  const findings: QaFinding[] = [];
  root.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material) {
        findings.push(...validateMaterial(mesh, material, requiresPrecomputedTangents));
      }
    }
  });
  return findings;
}

export function inspectSceneMaterials(context: QaContext): QaFinding[] {
  return inspectPortableSceneMaterials(
    context.scene,
    context.intent.capabilities.includes('precomputedTangents'),
  );
}

export const MATERIAL_QA_RULE: QaRule = {
  id: 'MATERIAL_PORTABLE_PBR_RULE',
  profile: 'material.portablePbr',
  scope: { kind: 'universal' },
  ruleClass: 'exact',
  owner: KILN_ENGINE_QA_OWNER,
  promotion: conformancePromotionAuthorization(
    'material-portable-pbr-v1',
    'src/qa/material.test.ts',
    '27f7469603ba986acfac2c6acbfb293ad787717aecdf4a3d03cae625f86f45e7',
  ),
  defaultMode: 'enforce',
  evaluate: inspectSceneMaterials,
};
