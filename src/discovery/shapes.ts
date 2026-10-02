/**
 * Input shapes served on request. The advertised tool schemas keep their nested
 * records opaque (v1 contract rule 4: at most 5,000 bytes each), and the full
 * JSON Schema of each record is a Discovery entry:
 * `kiln_discover({ ids: ['shape:project-draft'] })`.
 *
 * The schemas are the ones the actions validate with, converted once here, so
 * the shape a model reads is the shape the server enforces.
 */
import { z } from 'zod';
import { materialLibraryPayloadSchema, proceduralMaterialDraftSchema } from '../material-library';
import { projectDraftSchema, projectPatchSchema } from '../projects';
import { cameraShotInput, captureShapeInput } from '../tools/capture-input';
import type { DiscoveryEntry } from './catalog-schema';

type ShapeEntry = Extract<DiscoveryEntry, { kind: 'shape' }>;

const jsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io: 'input' });
  return rest;
};

const shape = (
  name: string,
  tool: string,
  field: string,
  summary: string,
  schema: z.ZodType,
  extra: Partial<Pick<ShapeEntry, 'aliases' | 'intents' | 'limitations' | 'references'>> = {},
): ShapeEntry => ({
  version: 'kiln.catalog-entry.v1',
  id: `shape:${name}`,
  kind: 'shape',
  name,
  summary,
  family: 'tool-input',
  tags: ['schema', tool, field],
  aliases: extra.aliases ?? [],
  intents: extra.intents ?? [],
  stability: 'stable',
  related: [],
  references: extra.references ?? [],
  limitations: extra.limitations ?? [],
  shape: { tool, field, schema: jsonSchema(schema) },
});

export const discoveryShapes: ShapeEntry[] = [
  shape(
    'project-draft',
    'kiln_project',
    'draft',
    'The record kiln_project create takes: name, brief, design (style, scale, palette, materialRoles, conventions, exceptions), inventory, deliveryProfiles, materialDependencies, references and reviews, with an optional projectId.',
    projectDraftSchema,
    {
      aliases: ['project draft', 'new project fields', 'project record'],
      intents: ['create a project for a pack', 'write a project brief and inventory'],
      references: ['docs/projects-and-live-review.md'],
    },
  ),
  shape(
    'project-patch',
    'kiln_project',
    'patch',
    'The record kiln_project update takes: the same top-level fields as the draft, each optional; a supplied field replaces its previous value whole, so read and merge design before changing one preference.',
    projectPatchSchema,
    {
      aliases: ['project patch', 'project update fields'],
      intents: ['update a project brief, design, inventory or material pins'],
      references: ['docs/projects-and-live-review.md'],
    },
  ),
  shape(
    'material-draft',
    'kiln_material',
    'draft',
    'The record kiln_material create-procedural takes: materialId, name, tileable, sources with license, and maps whose layered procedural specs (solid, checker, stripes, gradient, bricks, noise) bake into PNG maps; optional tags, physicalSizeMeters and parameters.',
    proceduralMaterialDraftSchema,
    {
      aliases: ['procedural material', 'material recipe draft', 'texture layers'],
      intents: ['bake a custom tileable material from layers'],
      references: ['docs/projects-and-live-review.md'],
    },
  ),
  shape(
    'material-import',
    'kiln_material',
    'payload',
    'The record kiln_material import takes: schemaVersion 1 and complete normalized material records, each a manifest plus base64 PNG files keyed by map name.',
    materialLibraryPayloadSchema,
    {
      aliases: ['material import payload', 'material records'],
      intents: ['import a material library payload'],
      references: ['docs/projects-and-live-review.md'],
    },
  ),
  shape(
    'capture',
    'kiln_render',
    'capture',
    'The capture record kiln_render, kiln_edit and kiln_view_interior take: either preset/cells/backdrop for an orbit sheet, or kiln.capture.v1 or v2 with 1 to 9 shots, cols, size, output and backdrop; v2 shots may hide nodes.',
    captureShapeInput,
    {
      aliases: ['capture config', 'camera sheet', 'exact cameras', 'orbit grid'],
      intents: ['choose cameras for a render', 'render exact orthographic or perspective views'],
      references: ['docs/cameras.md'],
    },
  ),
  shape(
    'camera-shot',
    'kiln_inspect',
    'shot',
    'One shot, as kiln_inspect shot and kiln_screenshot_animation shot take it and as capture.shots lists it: optional name, subject (path or exact name), visibility, hide, and an orbit or explicit camera.',
    cameraShotInput,
    {
      aliases: ['camera shot', 'explicit camera', 'orbit camera'],
      intents: ['frame one part with an exact camera'],
      references: ['docs/cameras.md'],
    },
  ),
];
