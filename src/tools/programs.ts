import { z } from 'zod';
import { programRefPattern, retainProgram, type ProgramStore } from '../program-store';
import type { KilnToolDef } from './registry';

const refInput = z
  .string()
  .regex(programRefPattern)
  .describe('Returned p_ handle or full sha256 ref.');

/**
 * Adapt source-taking definitions once, for all hosts. Legacy definitions remain unchanged.
 * A host that can read workspace files also accepts `file`, a path relative to the workspace
 * root, so a code-mode harness need not quote a program into an argument.
 */
export function withProgramReferences(
  def: KilnToolDef,
  store: ProgramStore,
  readSourceFile?: (file: string) => Promise<string>,
): KilnToolDef {
  if (!(def.inputSchema instanceof z.ZodObject))
    throw new Error(`${def.name} must have an object input schema.`);
  const sources = readSourceFile ? 'code, programRef OR file' : 'code OR programRef';
  const inputSchema = def.inputSchema
    .extend({
      code: z.string().optional().describe('New source.'),
      programRef: refInput.optional(),
      ...(readSourceFile
        ? {
            file: z
              .string()
              .min(1)
              .max(1024)
              .optional()
              .describe('A program file inside the workspace, relative to its root.'),
          }
        : {}),
      ...(def.name === 'kiln_edit'
        ? {
            includeCode: z
              .boolean()
              .optional()
              .describe(
                'Return the full updated source. Defaults to false with programRef, true with code.',
              ),
          }
        : {}),
    })
    .refine(
      (input) =>
        [input.code, input.programRef, (input as { file?: string }).file].filter(
          (value) => value !== undefined,
        ).length === 1,
      { message: `Supply exactly one of ${sources.replace(' OR ', ' or ')}.` },
    );
  const summaries: Record<string, string> = {
    kiln_validate:
      'Check program syntax, sandbox rules and retired globals before building. Returns findings with codes, lines and repair hints where available; use kiln_render to evaluate geometry and see the asset.',
    kiln_render:
      'Build and return metrics, part paths and images. If partsTruncated, use kiln_inspect listParts. Omit capture for six views, preset/cells for orbit grids, or kiln.capture.v1/v2 shots for exact orthographic/perspective cameras; v2 adds hide. Check viewFidelity before judging materials. Failed builds return errors without images.',
    kiln_screenshot_animation:
      'Review animation images, poseBounds and loopClosure endpoint evidence. loopIntent is createClip({loop}); open is valid for one-shots; closed endpoints do not prove smooth velocity. Check motion, attachments and requested clearance; sampled bounds do not certify continuous contact or collision safety. Use shot for camera/subject, frameTimes for phases, and framing locked (default) or follow. Add phases when symmetry hides motion. The program must define animate(). Check viewFidelity before judging materials.',
    kiln_view_interior:
      'Render roof-off floor-plan, dollhouse, and eye-level cutaway views. Optional versioned capture selects custom roof-off shots. Select a roof by nodeName or let Kiln resolve its role/name. Review roofsHidden and warnings for unresolved occlusion.',
    kiln_inspect:
      'List part paths and inspect joints, clearances and edit preservation. listParts filters names/paths with query; follow partListing.nextOffset on the same programRef/query. measure/surfacePairs return distances, not fit certificates. compare reports static changes and separate animation channel changes; paths adds complete static subtree summaries. image:false skips rendering. Otherwise use part/orbit or exact shot; check viewFidelity for materials.',
  };
  // Every tool that returns a handle states how long the bound store keeps it.
  const kept = store.retention ?? 'kept by the host program store';
  const description =
    def.name === 'kiln_edit'
      ? `Atomically apply ordered exact-string replacements and render. Copy anchors from kiln_source. Supply ${sources}. Returns programRef (${kept}), parentRef, diff and preservation comparing static data and animation channels. Review changes; use kiln_inspect compare for more pages or protected subtrees. Failed comparison preserves the repair; render:false leaves preservation not_assessed. capture selects cameras; includeCode returns full source.`
      : `${summaries[def.name] ?? def.description} Supply ${sources} (${kept}). Invalid drafts keep a ref.`;
  return {
    ...def,
    inputSchema,
    description,
    run: async (input) => {
      const args = inputSchema.parse(input) as Record<string, unknown> & {
        code?: string;
        programRef?: string;
        file?: string;
        includeCode?: boolean;
      };
      const code =
        typeof args.code === 'string'
          ? args.code
          : typeof args.file === 'string' && readSourceFile
            ? await readSourceFile(args.file)
            : await store.get(args.programRef as string);
      // Keep malformed drafts too, so a failed build can be repaired by reference.
      const parentRef = await retainProgram(store, code);
      const { programRef: _inner, ...output } = (await def.run({ ...args, code })) as Record<
        string,
        unknown
      >;
      // Refs lead the result, so a reader finds them before a long render report.
      if (def.name !== 'kiln_edit' || output.ok !== true || typeof output.code !== 'string')
        return { programRef: parentRef, ...output };
      const programRef = await retainProgram(store, output.code);
      const { code: updatedCode, ...rest } = output;
      const includeCode = args.includeCode ?? args.code !== undefined;
      const diff = typeof rest.diff === 'string' ? rest.diff : '';
      return {
        programRef,
        parentRef,
        ...rest,
        ...(includeCode
          ? { code: updatedCode }
          : {
              diff: diff.slice(0, 8000),
              diffTruncated: diff.length > 8000 || typeof rest.diffOmitted === 'number',
            }),
      };
    },
  };
}

export function createKilnSourceDef(store: ProgramStore): KilnToolDef {
  const inputSchema = z.object({
    programRef: refInput,
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('UTF-16 character offset; use nextOffset to continue.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(16000)
      .default(8000)
      .describe('Maximum characters returned.'),
    query: z
      .string()
      .min(1)
      .max(1000)
      .optional()
      .describe('Find literal text at or after offset; return bounded surrounding source.'),
  });
  return {
    name: 'kiln_source',
    description:
      'Read a saved program revision without changing it. Returns exact source text in bounded pages, or searches for literal text with surrounding context. Copy edit anchors from code. Follow nextOffset for more; use matchOffset + 1 to find the next match. Offsets count UTF-16 characters, not bytes.',
    inputSchema,
    run: async (input) => {
      const { programRef, offset, limit, query } = inputSchema.parse(input);
      const source = await store.get(programRef);
      const matchOffset = query ? source.indexOf(query, offset) : undefined;
      const start =
        matchOffset !== undefined && matchOffset >= 0
          ? Math.max(offset, matchOffset - Math.floor(limit / 4))
          : Math.min(offset, source.length);
      const code = matchOffset === -1 ? '' : source.slice(start, start + limit);
      const end = start + code.length;
      return {
        programRef,
        code,
        offset: start,
        nextOffset: matchOffset === -1 || end >= source.length ? null : end,
        totalCharacters: source.length,
        totalBytes: new TextEncoder().encode(source).length,
        ...(matchOffset !== undefined ? { matchOffset, found: matchOffset >= 0 } : {}),
      };
    },
  };
}
