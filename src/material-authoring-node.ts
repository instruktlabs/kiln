/** Shared CLI/MCP JSON authoring boundary. Library pins never imply project membership. */
import {
  MATERIAL_LIBRARY_LIMITS,
  assertMaterialJson,
  proceduralMaterialDraftSchema,
  proceduralMaterialDraftV2Schema,
  type MaterialLibrary,
  type MaterialManifest,
  type MaterialRecord,
} from './material-library';
import {
  createMaterialRecordV1,
  createMaterialRecordV2,
  resolveMaterialRecordClosure,
} from './material-library-node';
import { canonicalizeTextureAtlasSpecV1 } from './texture-atlas-contract';
import type { MaterialMapPinV1 } from './pinned-material-map';

export async function createProceduralMaterialRecord(
  value: unknown,
  library: MaterialLibrary,
): Promise<{ record: MaterialRecord; dependencies: MaterialRecord[] }> {
  assertMaterialJson(value);
  if (
    new TextEncoder().encode(JSON.stringify(value)).length >
    MATERIAL_LIBRARY_LIMITS.maxManifestBytes
  )
    throw new Error('Material draft exceeds size limit');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Material draft must be a JSON object');
  if (!Object.hasOwn(value, 'schemaVersion'))
    return {
      record: await createMaterialRecordV1(proceduralMaterialDraftSchema.parse(value)),
      dependencies: [],
    };

  const draft = proceduralMaterialDraftV2Schema.parse(value);
  const pins = new Map<string, MaterialMapPinV1>();
  for (const map of draft.maps) {
    if (!map.atlas) continue;
    for (const region of canonicalizeTextureAtlasSpecV1(map.atlas).regions) {
      if (region.source.kind !== 'resource') continue;
      const pin = region.source.pin;
      pins.set(`${pin.resourceId}@${pin.revisionId}`, pin);
    }
  }
  if (pins.size > MATERIAL_LIBRARY_LIMITS.maxPayloadRecords)
    throw new Error('Material source closure count limit exceeded');
  const roots: MaterialManifest[] = [];
  if (pins.size && !library.readManifest)
    throw new Error('Pinned atlas creation requires a material library with readManifest support.');
  for (const pin of pins.values()) {
    const manifest = await library.readManifest!(pin.resourceId, pin.revisionId);
    if (manifest.materialId !== pin.resourceId || manifest.revisionId !== pin.revisionId)
      throw new Error('Material source pin identity mismatch');
    roots.push(manifest);
  }
  const dependencies = roots.length
    ? await resolveMaterialRecordClosure(roots, {
        readManifest: (id, revision) => library.readManifest!(id, revision),
        read: (id, revision) =>
          library.readRecordFiles
            ? library.readRecordFiles(id, revision)
            : library.read(id, revision),
      })
    : [];
  return { record: await createMaterialRecordV2(draft, { materials: dependencies }), dependencies };
}
