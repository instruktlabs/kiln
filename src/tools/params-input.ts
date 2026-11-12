/**
 * The `params` record of the tools that build a program: values for the parameters it
 * declares with `defineParams`, or a sweep of their range. Stated once here; the tools
 * advertise it opaque and Discovery serves the shape as `shape:params`.
 */
import { z } from 'zod';

const value = z.union([z.number(), z.boolean(), z.string().max(60)]);

/** Values for one build: a declared preset, then explicit values over it. */
export const paramValuesInput = z
  .object({
    preset: z.string().max(40).optional().describe('A preset the program declares.'),
    values: z
      .record(z.string().max(40), value)
      .optional()
      .describe(
        'Declared parameter names to values: a number for range, int and seed, true or false for toggle, #rrggbb for color, an option for choice.',
      ),
  })
  .strict();

/** `kiln_render` also takes `sweep`, which builds every probe point itself. */
export const paramsInput = paramValuesInput
  .extend({
    sweep: z
      .boolean()
      .optional()
      .describe(
        'Build the defaults, each parameter alone at its minimum and maximum, its other toggle state or each other option, and every preset; report each build without images. Takes no preset or values.',
      ),
  })
  .strict()
  .refine((input) => !input.sweep || (input.preset === undefined && input.values === undefined), {
    message: 'params.sweep builds every point itself: omit preset and values.',
  });

/**
 * The same record, advertised opaque; the tool enforces `paramsInput` when it runs. It carries
 * no description: kiln_render sits at the 5,000-byte schema limit, so the tool description
 * states what the field does and names `shape:params`.
 */
export const paramsRecordInput = z.record(z.string(), z.unknown()).optional();
