/** Deterministic material/texture metrics and advisory tier/profile budgets. */

import type { Accessor, Document, Material, Node, Primitive, Texture } from '@gltf-transform/core';

export interface MaterialImageMetricV1 {
  name: string;
  width: number;
  height: number;
  maxDimension: number;
  decodedBytesRgba8: number;
  estimatedGpuBytesWithMipmaps: number;
}

export interface MaterialMetricsV1 {
  schemaVersion: 1;
  materialCount: number;
  opaqueMaterials: number;
  maskedMaterials: number;
  blendedMaterials: number;
  singleSidedMaterials: number;
  doubleSidedMaterials: number;
  texturedMaterials: number;
  untexturedMaterials: number;
  extensionCount: number;
  extensionsUsed: string[];
  materialExtensionCount: number;
  materialExtensionsUsed: string[];
  imageCount: number;
  images: MaterialImageMetricV1[];
  maxImageDimension: number;
  totalImagePixels: number;
  decodedImageBytesRgba8: number;
  estimatedGpuBytesWithMipmaps: number;
  totalSurfaceArea: number;
  blendedSurfaceArea: number;
  blendedSurfaceAreaRatio: number;
  /** BLEND materials with surface area, largest first; `ratio` is of the total surface area. */
  blendedMaterialAreas?: MaterialAreaMetricV1[];
}

export interface MaterialAreaMetricV1 {
  name: string;
  area: number;
  ratio: number;
}

export type MaterialBudgetProfileId = 'web.portable.v1' | 'mobile.portable.v1';
export type MaterialAssetTier = 'hero' | 'standard' | 'background';

export interface MaterialBudgetLimitsV1 {
  maxImageDimension: number;
  maxImageCount: number;
  maxDecodedBytesRgba8: number;
  maxBlendedSurfaceAreaRatio: number;
}

export interface MaterialBudgetWarningV1 {
  code:
    | 'MATERIAL_TEXTURE_RESOLUTION_BUDGET'
    | 'MATERIAL_IMAGE_COUNT_BUDGET'
    | 'MATERIAL_DECODED_MEMORY_BUDGET'
    | 'MATERIAL_BLEND_AREA_BUDGET';
  disposition: 'warn';
  profile: MaterialBudgetProfileId;
  tier: MaterialAssetTier;
  message: string;
  measurement: {
    name: string;
    actual: number;
    threshold: number;
    unit: 'px' | 'images' | 'bytes' | 'ratio';
  };
  advice: string;
}

export const MATERIAL_BUDGET_PROFILES_V1: Readonly<
  Record<MaterialBudgetProfileId, Readonly<Record<MaterialAssetTier, MaterialBudgetLimitsV1>>>
> = Object.freeze({
  'web.portable.v1': Object.freeze({
    hero: Object.freeze({
      maxImageDimension: 4096,
      maxImageCount: 8,
      maxDecodedBytesRgba8: 128 * 1024 * 1024,
      maxBlendedSurfaceAreaRatio: 0.35,
    }),
    standard: Object.freeze({
      maxImageDimension: 2048,
      maxImageCount: 4,
      maxDecodedBytesRgba8: 32 * 1024 * 1024,
      maxBlendedSurfaceAreaRatio: 0.15,
    }),
    background: Object.freeze({
      maxImageDimension: 1024,
      maxImageCount: 2,
      maxDecodedBytesRgba8: 8 * 1024 * 1024,
      maxBlendedSurfaceAreaRatio: 0.05,
    }),
  }),
  'mobile.portable.v1': Object.freeze({
    hero: Object.freeze({
      maxImageDimension: 2048,
      maxImageCount: 6,
      maxDecodedBytesRgba8: 48 * 1024 * 1024,
      maxBlendedSurfaceAreaRatio: 0.2,
    }),
    standard: Object.freeze({
      maxImageDimension: 1024,
      maxImageCount: 3,
      maxDecodedBytesRgba8: 16 * 1024 * 1024,
      maxBlendedSurfaceAreaRatio: 0.1,
    }),
    background: Object.freeze({
      maxImageDimension: 512,
      maxImageCount: 1,
      maxDecodedBytesRgba8: 4 * 1024 * 1024,
      maxBlendedSurfaceAreaRatio: 0.03,
    }),
  }),
});

const materialTextures = (material: Material): Array<Texture | null> => [
  material.getBaseColorTexture(),
  material.getMetallicRoughnessTexture(),
  material.getNormalTexture(),
  material.getOcclusionTexture(),
  material.getEmissiveTexture(),
];

const hasTexture = (material: Material): boolean => materialTextures(material).some(Boolean);

const transformPoint = (
  matrix: readonly number[],
  x: number,
  y: number,
  z: number,
): [number, number, number] => {
  const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  const reciprocal = w === 0 ? 1 : 1 / w;
  return [
    (matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!) * reciprocal,
    (matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!) * reciprocal,
    (matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!) * reciprocal,
  ];
};

const accessorPoint = (
  accessor: Accessor,
  index: number,
  matrix: readonly number[],
): [number, number, number] => {
  const array = accessor.getArray();
  if (!array) return [0, 0, 0];
  const size = accessor.getElementSize();
  const offset = index * size;
  return transformPoint(
    matrix,
    Number(array[offset]),
    Number(array[offset + 1]),
    Number(array[offset + 2]),
  );
};

const triangleArea = (a: readonly number[], b: readonly number[], c: readonly number[]): number => {
  const abx = b[0]! - a[0]!;
  const aby = b[1]! - a[1]!;
  const abz = b[2]! - a[2]!;
  const acx = c[0]! - a[0]!;
  const acy = c[1]! - a[1]!;
  const acz = c[2]! - a[2]!;
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;
  return Math.hypot(crossX, crossY, crossZ) / 2;
};

function primitiveSurfaceArea(primitive: Primitive, node: Node): number {
  // TRIANGLES only. Lines/points are not a meaningful blend-area proxy.
  if (primitive.getMode() !== 4) return 0;
  const position = primitive.getAttribute('POSITION');
  if (!position) return 0;
  const indices = primitive.getIndices()?.getArray();
  const count = indices?.length ?? position.getCount();
  const matrix = node.getWorldMatrix();
  let area = 0;
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const aIndex = indices ? Number(indices[offset]) : offset;
    const bIndex = indices ? Number(indices[offset + 1]) : offset + 1;
    const cIndex = indices ? Number(indices[offset + 2]) : offset + 2;
    area += triangleArea(
      accessorPoint(position, aIndex, matrix),
      accessorPoint(position, bIndex, matrix),
      accessorPoint(position, cIndex, matrix),
    );
  }
  return area;
}

/** Collect material signals independently of the A-F instanceability grade. */
export function collectMaterialMetricsV1(document: Document): MaterialMetricsV1 {
  const root = document.getRoot();
  const materials = root.listMaterials();
  const images = root.listTextures().map((texture, index): MaterialImageMetricV1 => {
    const size = texture.getSize() ?? [0, 0];
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    const decodedBytesRgba8 = width * height * 4;
    return {
      name: texture.getName() || `image-${index + 1}`,
      width,
      height,
      maxDimension: Math.max(width, height),
      decodedBytesRgba8,
      estimatedGpuBytesWithMipmaps: Math.ceil((decodedBytesRgba8 * 4) / 3),
    };
  });
  let totalSurfaceArea = 0;
  let blendedSurfaceArea = 0;
  const blendedAreaByMaterial = new Map<Material, number>();
  const visit = (node: Node): void => {
    const mesh = node.getMesh();
    if (mesh) {
      for (const primitive of mesh.listPrimitives()) {
        const area = primitiveSurfaceArea(primitive, node);
        totalSurfaceArea += area;
        const material = primitive.getMaterial();
        if (material?.getAlphaMode() === 'BLEND') {
          blendedSurfaceArea += area;
          blendedAreaByMaterial.set(material, (blendedAreaByMaterial.get(material) ?? 0) + area);
        }
      }
    }
    node.listChildren().forEach(visit);
  };
  for (const scene of root.listScenes()) scene.listChildren().forEach(visit);
  // Largest first; equal areas keep document material order.
  const blendedMaterialAreas = materials
    .map((material, index) => ({
      name: material.getName() || `material-${index + 1}`,
      area: blendedAreaByMaterial.get(material) ?? 0,
    }))
    .filter(({ area }) => area > 0)
    .sort((a, b) => b.area - a.area)
    .map(({ name, area }) => ({ name, area, ratio: area / totalSurfaceArea }));
  const extensionsUsed = root
    .listExtensionsUsed()
    .map((extension) => extension.extensionName)
    .sort();
  const materialExtensionsUsed = extensionsUsed.filter((name) =>
    /^(?:KHR|EXT)_materials_/.test(name),
  );
  const opaqueMaterials = materials.filter(
    (material) => material.getAlphaMode() === 'OPAQUE',
  ).length;
  const maskedMaterials = materials.filter((material) => material.getAlphaMode() === 'MASK').length;
  const blendedMaterials = materials.filter(
    (material) => material.getAlphaMode() === 'BLEND',
  ).length;
  const doubleSidedMaterials = materials.filter((material) => material.getDoubleSided()).length;
  const texturedMaterials = materials.filter(hasTexture).length;
  return {
    schemaVersion: 1,
    materialCount: materials.length,
    opaqueMaterials,
    maskedMaterials,
    blendedMaterials,
    singleSidedMaterials: materials.length - doubleSidedMaterials,
    doubleSidedMaterials,
    texturedMaterials,
    untexturedMaterials: materials.length - texturedMaterials,
    extensionCount: extensionsUsed.length,
    extensionsUsed,
    materialExtensionCount: materialExtensionsUsed.length,
    materialExtensionsUsed,
    imageCount: images.length,
    images,
    maxImageDimension: Math.max(0, ...images.map((image) => image.maxDimension)),
    totalImagePixels: images.reduce((sum, image) => sum + image.width * image.height, 0),
    decodedImageBytesRgba8: images.reduce((sum, image) => sum + image.decodedBytesRgba8, 0),
    estimatedGpuBytesWithMipmaps: images.reduce(
      (sum, image) => sum + image.estimatedGpuBytesWithMipmaps,
      0,
    ),
    totalSurfaceArea,
    blendedSurfaceArea,
    blendedSurfaceAreaRatio: totalSurfaceArea > 0 ? blendedSurfaceArea / totalSurfaceArea : 0,
    blendedMaterialAreas,
  };
}

/** BLEND materials named in the blend-area finding; the count covers the rest. */
const BLEND_MATERIALS_NAMED = 3;

const mib = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;

export function materialBudgetProfileForQaProfile(qaProfile: string): MaterialBudgetProfileId {
  return /(?:mobile|constrained|low-memory)/i.test(qaProfile)
    ? 'mobile.portable.v1'
    : 'web.portable.v1';
}

/** Advisory-only budget evaluation with measured costs and concrete remediation. */
export function evaluateMaterialBudgetV1(
  metrics: MaterialMetricsV1,
  options: { profile: MaterialBudgetProfileId; tier: MaterialAssetTier },
): MaterialBudgetWarningV1[] {
  const limits = MATERIAL_BUDGET_PROFILES_V1[options.profile][options.tier];
  const warnings: MaterialBudgetWarningV1[] = [];
  if (metrics.maxImageDimension > limits.maxImageDimension) {
    const offenders = metrics.images
      .filter((image) => image.maxDimension > limits.maxImageDimension)
      .map((image) => `${image.name} ${image.width}x${image.height}`)
      .join(', ');
    warnings.push({
      code: 'MATERIAL_TEXTURE_RESOLUTION_BUDGET',
      disposition: 'warn',
      profile: options.profile,
      tier: options.tier,
      message: `Maximum image dimension is ${metrics.maxImageDimension}px; ${options.profile}/${options.tier} allows ${limits.maxImageDimension}px. Offenders: ${offenders}.`,
      measurement: {
        name: 'maxImageDimension',
        actual: metrics.maxImageDimension,
        threshold: limits.maxImageDimension,
        unit: 'px',
      },
      advice: `Downscale the named images so their longest edge is at most ${limits.maxImageDimension}px; preserve aspect ratio and rerun glTF validation.`,
    });
  }
  if (metrics.imageCount > limits.maxImageCount) {
    warnings.push({
      code: 'MATERIAL_IMAGE_COUNT_BUDGET',
      disposition: 'warn',
      profile: options.profile,
      tier: options.tier,
      message: `${metrics.imageCount} images exceed the ${limits.maxImageCount}-image ${options.profile}/${options.tier} budget.`,
      measurement: {
        name: 'imageCount',
        actual: metrics.imageCount,
        threshold: limits.maxImageCount,
        unit: 'images',
      },
      advice:
        'Reuse approved resource IDs, remove unused images, or atlas compatible same-color-space slots; never atlas normal/data maps into an sRGB image.',
    });
  }
  if (metrics.decodedImageBytesRgba8 > limits.maxDecodedBytesRgba8) {
    const scale = Math.sqrt(limits.maxDecodedBytesRgba8 / metrics.decodedImageBytesRgba8);
    warnings.push({
      code: 'MATERIAL_DECODED_MEMORY_BUDGET',
      disposition: 'warn',
      profile: options.profile,
      tier: options.tier,
      message: `Decoded RGBA8 image memory is ${mib(metrics.decodedImageBytesRgba8)}; ${options.profile}/${options.tier} allows ${mib(limits.maxDecodedBytesRgba8)} before mip overhead.`,
      measurement: {
        name: 'decodedImageBytesRgba8',
        actual: metrics.decodedImageBytesRgba8,
        threshold: limits.maxDecodedBytesRgba8,
        unit: 'bytes',
      },
      advice: `Downscale image width and height by approximately ${(Math.min(1, scale) * 100).toFixed(0)}% in aggregate, then verify small details and alpha cutouts remain legible.`,
    });
  }
  if (metrics.blendedSurfaceAreaRatio > limits.maxBlendedSurfaceAreaRatio) {
    // Name the materials that drive the share so the author knows which parts to change.
    const blended = metrics.blendedMaterialAreas ?? [];
    const named = blended
      .slice(0, BLEND_MATERIALS_NAMED)
      .map(({ name, ratio }) => `${JSON.stringify(name)} ${(ratio * 100).toFixed(1)}%`);
    const more =
      blended.length > BLEND_MATERIALS_NAMED
        ? `, and ${blended.length - BLEND_MATERIALS_NAMED} more`
        : '';
    const drivers = named.length
      ? ` Largest BLEND materials by share of surface area: ${named.join(', ')}${more}.`
      : '';
    warnings.push({
      code: 'MATERIAL_BLEND_AREA_BUDGET',
      disposition: 'warn',
      profile: options.profile,
      tier: options.tier,
      message: `Blended primitive surface area is ${(metrics.blendedSurfaceAreaRatio * 100).toFixed(1)}% (${metrics.blendedSurfaceArea.toFixed(3)} of ${metrics.totalSurfaceArea.toFixed(3)} square asset units); the budget is ${(limits.maxBlendedSurfaceAreaRatio * 100).toFixed(1)}%.${drivers}`,
      measurement: {
        name: 'blendedSurfaceAreaRatio',
        actual: metrics.blendedSurfaceAreaRatio,
        threshold: limits.maxBlendedSurfaceAreaRatio,
        unit: 'ratio',
      },
      advice:
        'Use MASK for binary cutouts such as foliage, reduce layered transparent surfaces, and reserve BLEND for genuinely translucent glass/effects.',
    });
  }
  return warnings;
}
