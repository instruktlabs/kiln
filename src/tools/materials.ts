import { z } from 'zod';
import {
  assertMaterialJson,
  materialLibraryHashSchema,
  materialLibraryIdSchema,
  materialLibraryPayloadSchema,
  materialLibraryPortableSpec,
  materialSourceSchema,
  proceduralMaterialDraftSchema,
  type MaterialLibrary,
  type MaterialManifestV1,
} from '../material-library';
import { createMaterialRecordV1, decodeMaterialLibraryPayload } from '../material-library-node';
import { createMaterialPresetDraft, listMaterialPresets } from '../material-presets';
import { nestedRecordDescription, requireActionFields } from './actions';
import type { KilnToolDef } from './registry';

const MATERIAL_ACTIONS = [
  'presets',
  'create-preset',
  'list',
  'get',
  'create-procedural',
  'import',
] as const;
type MaterialAction = (typeof MATERIAL_ACTIONS)[number];
const REQUIREMENTS: Record<MaterialAction, Parameters<typeof requireActionFields>[3]> = {
  presets: { required: [] },
  'create-preset': { required: ['presetId', 'seed', 'creator', 'license'] },
  list: { required: [] },
  get: { required: ['materialId'] },
  'create-procedural': { required: ['draft'], shapes: { draft: 'shape:material-draft' } },
  import: { required: ['payload'], shapes: { payload: 'shape:material-import' } },
};
const record = (description: string) =>
  z.record(z.string(), z.unknown()).optional().describe(description);
const tag = z.string().min(1).max(80).optional().describe('presets, list: keep one tag.');

/** One flat object; preset options sit at the root, nested records stay opaque until they run. */
export const materialToolInput = z.strictObject({
  action: z.enum(MATERIAL_ACTIONS),
  tag,
  presetId: z.string().min(1).max(80).optional().describe('create-preset: an id from presets.'),
  seed: z.number().int().min(-2147483648).max(2147483647).optional().describe('create-preset.'),
  size: z
    .union([z.literal(64), z.literal(128), z.literal(256), z.literal(512)])
    .optional()
    .describe('create-preset: map edge in pixels; default 256.'),
  creator: z.string().min(1).max(1000).optional().describe('create-preset.'),
  license: materialSourceSchema.shape.license
    .optional()
    .describe('create-preset: spdx, url and attribution.'),
  materialId: materialLibraryIdSchema
    .optional()
    .describe('get: the id a project palette lists as resourceId; create-preset: optional id.'),
  revisionId: materialLibraryHashSchema
    .optional()
    .describe("get: the immutable revision; omitted, the material's only revision."),
  draft: record(
    nestedRecordDescription(
      'create-procedural: materialId, name, tileable, sources, maps with layered procedural specs; optional tags, physicalSizeMeters, parameters.',
      'shape:material-draft',
    ),
  ),
  payload: record(
    nestedRecordDescription(
      'import: schemaVersion 1 and complete normalized records with embedded PNG bytes.',
      'shape:material-import',
    ),
  ),
});
const materialResult = (material: MaterialManifestV1) => ({
  ok: true,
  material,
  portableSpec: materialLibraryPortableSpec(material),
});
const unknownMaterial = (materialId: string, revisionId?: string) =>
  new Error(
    `Unknown material ${materialId}${revisionId ? ` at ${revisionId}` : ''}. kiln_material { action: 'list' } lists the materials in this workspace with their revision IDs.`,
  );
/**
 * The revision a `get` without `revisionId` means: the material's only one.
 * Revisions are content hashes with no order, so several are named for the
 * caller to choose (two live sessions of 1 October 2026 called get with the
 * id alone and were refused).
 */
async function onlyRevision(library: MaterialLibrary, materialId: string): Promise<string> {
  const revisions = (await library.list())
    .filter((material) => material.materialId === materialId)
    .map((material) => material.revisionId)
    .sort();
  if (revisions.length === 1) return revisions[0]!;
  if (revisions.length === 0) throw unknownMaterial(materialId);
  throw new Error(
    `Material ${materialId} has ${revisions.length} revisions: ${revisions.join(', ')}. Pass revisionId to get one.`,
  );
}
/**
 * `resourceId`, the name a project's palette and `materialDependencies` use for a
 * material, is accepted as an alias of `materialId` (w28 passed it twice; decision 25
 * of 2 October 2026). The advertised schema keeps `materialId` alone, so the alias is
 * resolved before the strict parse; the two may not disagree.
 */
function aliasMaterialId(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const { resourceId, ...rest } = raw as Record<string, unknown>;
  if (resourceId === undefined) return raw;
  if (rest.materialId !== undefined && rest.materialId !== resourceId)
    throw new Error(
      `kiln_material: resourceId (${String(resourceId)}) and materialId (${String(rest.materialId)}) name different materials; pass materialId alone.`,
    );
  return { ...rest, materialId: resourceId };
}
export function createKilnMaterialDef(library: MaterialLibrary): KilnToolDef {
  return {
    name: 'kiln_material',
    description:
      'Manage optional immutable material resources in this workspace. presets discovers shipped architecture, wood, metal, fabric and ground recipes; create-preset bakes one with an explicit seed, creator and license; list returns compact material/revision summaries; get returns full provenance, hashes, map conventions, physical repeat scale and a code-ready portable material spec; create-procedural bakes bounded editable layer recipes including optional height-derived normals; import accepts complete normalized records with embedded PNG bytes. No action downloads URLs or executes source. Pin the returned materialId/revisionId through per-invocation materialDependencies or project dependencies before authored evaluation resolves the resources; no project is required.',
    inputSchema: materialToolInput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(raw) {
      assertMaterialJson(raw);
      const input = materialToolInput.parse(aliasMaterialId(raw));
      requireActionFields('kiln_material', input.action, input, REQUIREMENTS[input.action]);
      switch (input.action) {
        case 'presets':
          return {
            ok: true,
            presets: listMaterialPresets().filter(
              (item) => !input.tag || item.tags.includes(input.tag),
            ),
          };
        case 'create-preset': {
          const options = Object.fromEntries(
            Object.entries({
              seed: input.seed,
              size: input.size,
              creator: input.creator,
              license: input.license,
              materialId: input.materialId,
            }).filter(([, value]) => value !== undefined),
          );
          const record = await createMaterialRecordV1(
            createMaterialPresetDraft(input.presetId!, options as never),
          );
          const [material] = await library.import([record]);
          return materialResult(material!);
        }
        case 'list': {
          const records = await library.list();
          return {
            ok: true,
            materials: records
              .filter((item) => !input.tag || item.tags.includes(input.tag))
              .map((item) => ({
                materialId: item.materialId,
                revisionId: item.revisionId,
                name: item.name,
                tags: item.tags,
                tileable: item.tileable,
                ...(item.physicalSizeMeters ? { physicalSizeMeters: item.physicalSizeMeters } : {}),
                slots: item.maps.map((map) => map.slot),
                licenses: [...new Set(item.sources.map((source) => source.license.spdx))],
              })),
          };
        }
        case 'get': {
          const revisionId = input.revisionId ?? (await onlyRevision(library, input.materialId!));
          try {
            return materialResult((await library.read(input.materialId!, revisionId)).manifest);
          } catch (error) {
            // Rule 9: an unknown id names the call that lists the known ones.
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
              throw unknownMaterial(input.materialId!, revisionId);
            throw error;
          }
        }
        case 'create-procedural': {
          const record = await createMaterialRecordV1(
            proceduralMaterialDraftSchema.parse(input.draft),
          );
          const [material] = await library.import([record]);
          return materialResult(material!);
        }
        case 'import': {
          const records = await decodeMaterialLibraryPayload(
            materialLibraryPayloadSchema.parse(input.payload),
          );
          const materials = await library.import(records);
          return {
            ok: true,
            materials: materials.map((material) => ({
              material,
              portableSpec: materialLibraryPortableSpec(material),
            })),
          };
        }
      }
    },
  };
}
