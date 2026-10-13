/** Browser-safe presentation of saved raw maps. No renderer or source loading. */
import {
  canonicalMaterialJson,
  validateMaterialManifestAny,
  type MaterialManifest,
} from '../material-library';
import type { PortableSamplerV1 } from '../portable-sampler';
export const RAW_MAP_FIDELITY = 'Raw map pixels · unshaded · not GPU capture evidence';
export interface MaterialViewerSelection {
  materialId: string;
  revisionId: string;
}
const id = /^[a-z][a-z0-9_-]{0,79}$/;
const revision = /^sha256:[a-f0-9]{64}$/;
export function materialViewerSelection(search: string): MaterialViewerSelection | undefined {
  const query = new URLSearchParams(
    search.startsWith('?') ? search : search.slice(search.indexOf('?') + 1),
  );
  const materialId = query.get('material'),
    revisionId = query.get('materialRevision');
  if (
    query.getAll('material').length !== 1 ||
    query.getAll('materialRevision').length !== 1 ||
    !materialId ||
    !revisionId ||
    !id.test(materialId) ||
    !revision.test(revisionId)
  )
    return undefined;
  return { materialId, revisionId };
}
export function materialViewerHref(selection: MaterialViewerSelection): string {
  if (!id.test(selection.materialId) || !revision.test(selection.revisionId))
    throw new Error('Invalid exact material selection');
  return `/?${new URLSearchParams({ material: selection.materialId, materialRevision: selection.revisionId })}`;
}
export function materialApiBase(selection: MaterialViewerSelection): string {
  if (!id.test(selection.materialId) || !revision.test(selection.revisionId))
    throw new Error('Invalid exact material selection');
  return `/api/materials/${encodeURIComponent(selection.materialId)}/${encodeURIComponent(selection.revisionId)}`;
}
interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface MaterialPreviewRegion {
  name: string;
  content: Rectangle;
  allocation: Rectangle;
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
}
export interface MaterialPreviewMap {
  slot: string;
  file: string;
  url: string;
  width: number;
  height: number;
  colorSpace: string;
  imageSha256: string;
  pixelHash?: string;
  sampler?: PortableSamplerV1;
  atlas: boolean;
  compilerId?: string;
  manifestHash?: string;
  regions: MaterialPreviewRegion[];
}
export function materialPreviewModel(value: MaterialManifest) {
  const material = validateMaterialManifestAny(value);
  const base = materialApiBase(material);
  const maps: MaterialPreviewMap[] = material.maps.map((map) => {
    const modern = 'recipe' in map ? map : undefined;
    const atlas = modern?.recipe?.kind === 'atlas' ? modern.recipe : undefined;
    return {
      slot: map.slot,
      file: map.file,
      url: `${base}/${encodeURIComponent(map.file)}`,
      width: map.width,
      height: map.height,
      colorSpace: map.colorSpace,
      imageSha256: map.sha256,
      ...('pixelHash' in map ? { pixelHash: map.pixelHash } : {}),
      ...('sampler' in map ? { sampler: { ...map.sampler } } : {}),
      atlas: !!atlas,
      ...(modern?.recipe ? { compilerId: modern.recipe.compilerId } : {}),
      ...(atlas ? { manifestHash: atlas.manifest.manifestHash } : {}),
      regions: atlas
        ? atlas.manifest.regions.map((region) => ({
            name: region.name,
            content: { ...region.content },
            allocation: { ...region.allocation },
            leftPercent: (region.content.x / map.width) * 100,
            topPercent: (region.content.y / map.height) * 100,
            widthPercent: (region.content.width / map.width) * 100,
            heightPercent: (region.content.height / map.height) * 100,
          }))
        : [],
    };
  });
  return {
    materialId: material.materialId,
    revisionId: material.revisionId,
    name: material.name,
    fidelity: RAW_MAP_FIDELITY,
    maps,
  };
}
/** The retained evaluation and artifact are independently hash-bound by the host. */
export function materialEvaluationDependencies(
  value: unknown,
  artifactSha256: string,
): MaterialManifest[] {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as Record<string, unknown>)['artifactGlbSha256'] !== artifactSha256
  )
    throw new Error('Retained evaluation does not identify the displayed artifact');
  const dependencies = (value as Record<string, unknown>)['materialLibraryDependencies'];
  if (dependencies === undefined) return [];
  if (!Array.isArray(dependencies) || dependencies.length > 16)
    throw new Error('Invalid retained material dependency list');
  const result = new Map<string, MaterialManifest>();
  for (const raw of dependencies) {
    const manifest = validateMaterialManifestAny(raw),
      key = `${manifest.materialId}/${manifest.revisionId}`,
      existing = result.get(key);
    if (existing && canonicalMaterialJson(existing) !== canonicalMaterialJson(manifest))
      throw new Error('Conflicting retained material identity');
    result.set(key, manifest);
  }
  return [...result.values()];
}
