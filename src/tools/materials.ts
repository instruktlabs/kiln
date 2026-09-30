import { z } from 'zod';
import {
  assertMaterialJson,
  materialLibraryHashSchema,
  materialLibraryIdSchema,
  materialLibraryPayloadSchema,
  materialLibraryPortableSpec,
  proceduralMaterialDraftSchema,
  type MaterialLibrary,
  type MaterialManifestV1,
} from '../material-library';
import { createMaterialRecordV1, decodeMaterialLibraryPayload } from '../material-library-node';
import {
  createMaterialPresetDraft,
  listMaterialPresets,
  materialPresetOptionsSchema,
} from '../material-presets';
import type { KilnToolDef } from './registry';

export const materialToolInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('presets'), tag: z.string().min(1).max(80).optional() }).strict(),
  materialPresetOptionsSchema
    .extend({ action: z.literal('create-preset'), presetId: z.string().min(1).max(80) })
    .strict(),
  z.object({ action: z.literal('list'), tag: z.string().min(1).max(80).optional() }).strict(),
  z
    .object({
      action: z.literal('get'),
      materialId: materialLibraryIdSchema,
      revisionId: materialLibraryHashSchema,
    })
    .strict(),
  z
    .object({ action: z.literal('create-procedural'), draft: proceduralMaterialDraftSchema })
    .strict(),
  z.object({ action: z.literal('import'), payload: materialLibraryPayloadSchema }).strict(),
]);
const materialResult = (material: MaterialManifestV1) => ({
  ok: true,
  material,
  portableSpec: materialLibraryPortableSpec(material),
});
export function createKilnMaterialDef(library: MaterialLibrary): KilnToolDef {
  return {
    name: 'kiln_material',
    description:
      'Manage optional immutable material resources in this workspace. presets discovers shipped architecture, wood, metal, fabric and ground recipes; create-preset bakes one with an explicit seed, creator and license. list returns compact material/revision summaries; get returns full provenance, hashes, map conventions, physical repeat scale and a code-ready portable material spec. create-procedural bakes bounded editable layer recipes including optional height-derived normals. import accepts complete normalized records with embedded PNG bytes. No operation downloads URLs or executes source. Pin returned materialId/revisionId through per-invocation materialDependencies or project dependencies before authored evaluation resolves the resources; no project is required.',
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
      if (input.action === 'presets')
        return {
          ok: true,
          presets: listMaterialPresets().filter(
            (item) => !input.tag || item.tags.includes(input.tag),
          ),
        };
      if (input.action === 'create-preset') {
        const { action: _, presetId, ...options } = input;
        const record = await createMaterialRecordV1(createMaterialPresetDraft(presetId, options));
        const [material] = await library.import([record]);
        return materialResult(material!);
      }
      if (input.action === 'list') {
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
      if (input.action === 'get')
        return materialResult((await library.read(input.materialId, input.revisionId)).manifest);
      if (input.action === 'create-procedural') {
        const record = await createMaterialRecordV1(input.draft);
        const [material] = await library.import([record]);
        return materialResult(material!);
      }
      const records = await decodeMaterialLibraryPayload(input.payload);
      const materials = await library.import(records);
      return {
        ok: true,
        materials: materials.map((material) => ({
          material,
          portableSpec: materialLibraryPortableSpec(material),
        })),
      };
    },
  };
}
