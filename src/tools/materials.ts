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
  get: { required: ['materialId', 'revisionId'] },
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
  materialId: materialLibraryIdSchema.optional().describe('get; create-preset: optional id.'),
  revisionId: materialLibraryHashSchema.optional().describe('get: the immutable revision.'),
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
      const input = materialToolInput.parse(raw);
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
        case 'get':
          return materialResult(
            (await library.read(input.materialId!, input.revisionId!)).manifest,
          );
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
