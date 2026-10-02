/**
 * The camera and capture input shapes, stated once. `kiln_render` advertises
 * them in full; `kiln_edit`, `kiln_inspect`, `kiln_screenshot_animation` and
 * `kiln_view_interior` advertise the same records as opaque objects and
 * validate with these schemas when they run (v1 contract rule 4), and Discovery
 * serves the full JSON Schema on request as `shape:capture` and
 * `shape:camera-shot`. This module has no registry dependency so Discovery can
 * import it without a cycle.
 */
import { z } from 'zod';
import { BACKDROP_IDS, type BackdropId } from '../views/background';
import { MAX_CAPTURE_SHOT_SIZE } from '../views/capture-limits';

/**
 * A named backdrop, never a free colour: sheets must stay comparable across
 * runs, and a backdrop tuned to the asset colour hides the seams the model is
 * meant to find. Neutral is the measured default; see `views/background.ts`.
 */
export const backdropInput = z
  .enum(BACKDROP_IDS as [BackdropId, ...BackdropId[]])
  .optional()
  .describe('neutral (default); light for dark parts, dark for light parts.');

export const legacyCaptureInput = z
  .object({
    preset: z
      .enum(['1x1', '1x2', '2x1', '3x1', '2x2', '3x2', '3x3'])
      .optional()
      .describe('COLSxROWS; default 3x2. Fewer views for simple shapes, up to 3x3.'),
    cells: z
      .array(
        z.object({
          azimuthDeg: z.number().describe('0 = front, 90 = right, 180 = back, 270 = left. Wraps.'),
          elevationDeg: z
            .number()
            .describe('0 eye level; positive above, negative below. Clamped -89..89.'),
          zoom: z
            .number()
            .optional()
            .describe('Bounds padding: below 1 crops, above 1 pulls back; omit for auto-framing.'),
          name: z.string().optional().describe('Label; defaults to angles.'),
        }),
      )
      .optional()
      .describe(
        'Row-major cameras; omit for preset defaults. Count cannot exceed preset capacity (max 9).',
      ),
    backdrop: backdropInput,
  })
  .optional()
  .describe('Sheet layout and cameras; omit for six views in a 3x2 grid.');

/**
 * A three-number vector, advertised as a bounded uniform array rather than a tuple.
 *
 * `z.tuple` renders as JSON Schema 2020-12: `prefixItems` plus `items: false`, meaning
 * "nothing beyond the listed positions". That is correct, and it is also unreadable to a
 * consumer written against draft-07, where `items` must be a schema. VS Code's tool
 * validator tests `items` for truthiness, so `false` reads to it as an array with no
 * items and it refuses to register the tool at all -- `kiln_render`, `kiln_edit`,
 * `kiln_inspect`, `kiln_view_interior` and `kiln_screenshot_animation` were all
 * unusable there, which is the whole authoring loop.
 *
 * Every position holds the same type, so `minItems`/`maxItems` on a uniform array states
 * exactly the same constraint and is valid under both drafts.
 *
 * The tuple TYPE is recovered by a static assertion, so `CameraVec3` still lines up
 * across the view boundary and nothing downstream needs a cast. It is deliberately NOT
 * `.transform(v => v as [number, number, number])`, which reads as the same thing and
 * breaks every non-MCP harness: the Strands skin converts with `io: 'output'`, where zod
 * refuses outright -- "Transforms cannot be represented in JSON Schema" -- while the MCP
 * SDK converts with `io: 'input'` and never sees it. A change that looks identical on one
 * transport can take the other one down. The assertion is sound because the runtime
 * schema is unchanged: `.length(3)` still rejects every other arity.
 */
export const cameraVec3Input = z.array(z.number()).length(3) as unknown as z.ZodType<
  [number, number, number]
>;

const orbitCameraError = (issue: { code?: string; keys?: string[] }): string | undefined => {
  if (
    issue.code === 'unrecognized_keys' &&
    issue.keys?.some((key) => key === 'target' || key === 'distance')
  ) {
    return 'Orbit cameras derive target and distance from the selected subject bounds; choose subject and padding, or use an explicit camera with position and target.';
  }
  return undefined;
};

const EXPLICIT_CAMERA_KEYS =
  'type, projection, position, target, relativeTo, frame, framing, padding, targetOffset, up, halfHeight (orthographic), fovDeg (perspective, degrees), near, far';
const explicitCameraError = (issue: { code?: string; keys?: string[] }): string | undefined => {
  if (issue.code !== 'unrecognized_keys') return undefined;
  const fov = issue.keys?.some((key) => key === 'fov' || key === 'fovY' || key === 'fieldOfView');
  return `Unknown explicit camera key${issue.keys && issue.keys.length > 1 ? 's' : ''} ${(issue.keys ?? []).join(', ')}${fov ? '; use fovDeg' : ''}. Explicit cameras accept ${EXPLICIT_CAMERA_KEYS}.`;
};

const advancedCaptureError = (issue: { code?: string; keys?: string[] }): string | undefined => {
  if (
    issue.code === 'unrecognized_keys' &&
    issue.keys?.some((key) => key === 'width' || key === 'height')
  ) {
    return `Advanced capture uses one square per-shot size from 128 to ${MAX_CAPTURE_SHOT_SIZE}; width and height are returned image dimensions, not request fields.`;
  }
  return undefined;
};

export const cameraShotInput = z
  .object({
    name: z.string().optional(),
    subject: z
      .object({ path: z.string().optional(), name: z.string().optional() })
      .strict()
      .refine((v) => (v.path === undefined) !== (v.name === undefined), {
        message: 'Choose subject path OR exact name.',
      })
      .optional(),
    visibility: z.enum(['context', 'isolate']).optional(),
    hide: z.array(z.string().min(1).max(1024)).max(64).optional(),
    camera: z
      .discriminatedUnion('type', [
        z.strictObject(
          {
            type: z.literal('orbit'),
            azimuthDeg: z.number().optional(),
            elevationDeg: z.number().optional(),
            relativeTo: z.enum(['world', 'asset', 'part']).optional(),
            padding: z.number().positive().max(100).optional(),
          },
          { error: orbitCameraError },
        ),
        z.strictObject(
          {
            type: z.literal('explicit'),
            projection: z.enum(['orthographic', 'perspective']),
            position: cameraVec3Input,
            target: cameraVec3Input.optional(),
            relativeTo: z.enum(['world', 'asset', 'part', 'local']).optional(),
            frame: z
              .object({
                origin: cameraVec3Input.optional(),
                rotation: cameraVec3Input.optional(),
              })
              .strict()
              .optional(),
            framing: z.enum(['explicit', 'bounds']).optional(),
            padding: z.number().positive().max(100).optional(),
            targetOffset: cameraVec3Input.optional(),
            up: cameraVec3Input.optional(),
            halfHeight: z.number().positive().optional(),
            fovDeg: z.number().positive().lt(180).optional(),
            near: z.number().positive().optional(),
            far: z.number().positive().optional(),
          },
          { error: explicitCameraError },
        ),
      ])
      .optional(),
  })
  .strict();

export const advancedCaptureInput = z
  .strictObject(
    {
      version: z.enum(['kiln.capture.v1', 'kiln.capture.v2']),
      shots: z.array(cameraShotInput).min(1).max(9),
      cols: z.number().int().min(1).max(3).optional(),
      size: z.number().int().min(128).max(MAX_CAPTURE_SHOT_SIZE).optional(),
      output: z.enum(['grid', 'separate']).optional(),
      backdrop: backdropInput,
    },
    { error: advancedCaptureError },
  )
  .superRefine((input, context) => {
    if (input.version === 'kiln.capture.v1' && input.shots.some((shot) => shot.hide !== undefined))
      context.addIssue({
        code: 'custom',
        path: ['shots'],
        message: 'shot.hide requires version kiln.capture.v2',
      });
  });

// Error selection only: tagged input should explain its shot fields, not the
// legacy branch's unknown keys. This does not coerce values or change JSON Schema.
function taggedCaptureError(issue: { input?: unknown }): string | undefined {
  const input = issue.input;
  if (
    typeof input !== 'object' ||
    input === null ||
    !('version' in input) ||
    (input.version !== 'kiln.capture.v1' && input.version !== 'kiln.capture.v2')
  )
    return undefined;
  const parsed = advancedCaptureInput.safeParse(input);
  if (parsed.success) return undefined;
  const issues = parsed.error.issues;
  const details = issues
    .slice(0, 6)
    .map((problem) => `${problem.path.join('.') || 'capture'}: ${problem.message.slice(0, 240)}`);
  return `Invalid ${input.version}: ${details.join('; ')}${issues.length > 6 ? '; additional issues omitted' : ''}`;
}

/** The capture record itself: an orbit sheet or tagged exact shots. Discovery serves it as `shape:capture`. */
export const captureShapeInput = z.union(
  [
    advancedCaptureInput,
    z.strictObject(legacyCaptureInput.unwrap().shape, {
      error: taggedCaptureError,
    }),
  ],
  { error: taggedCaptureError },
);

/** The field as `kiln_render` advertises and enforces it. */
export const captureInput = captureShapeInput
  .optional()
  .describe(
    'Omit for six views; preset/cells for orbit sheets. Use kiln.capture.v1 or v2 with 1..9 shots for exact cameras. v2 adds hide: exact paths or unique names. Framing retains subject bounds.',
  );

/** The same record, advertised opaque by the tools that share it; they enforce `captureInput` when they run. */
export const captureRecordInput = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    'Cameras, as kiln_render capture takes them. Shape: kiln_discover ids ["shape:capture"].',
  );

/** One shot, advertised opaque; the tool enforces `cameraShotInput` when it runs. */
export const cameraShotRecordInput = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('One exact camera shot. Shape: kiln_discover ids ["shape:camera-shot"].');
