import { z } from 'zod';
import type { SceneRenderReceipt } from './render-port';
import { assertNoPrototypeKeys, canonicalContractJson, sha256ContractJson } from './contract-utils';

export const PRESENTATION_DOCUMENT_V1_SCHEMA_VERSION = 'kiln.presentation.v1' as const;
/** Renderer-aligned ceiling across every requested camera frame. */
export const PRESENTATION_MAX_TOTAL_PIXELS_V1 = 16_777_216;

const finite = z.number().finite();
const vec3 = z.tuple([finite, finite, finite]);
const contentSha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const cameraSchema = z
  .object({
    id,
    cell: z
      .object({
        column: z.number().int().min(0).max(11),
        row: z.number().int().min(0).max(11),
      })
      .strict(),
    position: vec3,
    target: vec3,
    up: vec3,
    fovDeg: finite.gt(0).lt(180),
    aspect: finite.positive(),
    near: finite.positive(),
    far: finite.positive(),
  })
  .strict()
  .superRefine((camera, ctx) => {
    if (camera.far <= camera.near) {
      ctx.addIssue({ code: 'custom', path: ['far'], message: 'far must exceed near' });
    }
    const view = camera.target.map((entry, axis) => entry - camera.position[axis]!) as [
      number,
      number,
      number,
    ];
    if (Math.hypot(...view) === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'target must differ from position',
      });
    }
    if (Math.hypot(...camera.up) === 0) {
      ctx.addIssue({ code: 'custom', path: ['up'], message: 'up must be non-zero' });
    }
    const cross = [
      view[1] * camera.up[2] - view[2] * camera.up[1],
      view[2] * camera.up[0] - view[0] * camera.up[2],
      view[0] * camera.up[1] - view[1] * camera.up[0],
    ];
    if (Math.hypot(...cross) <= Math.hypot(...view) * Math.hypot(...camera.up) * 1e-9) {
      ctx.addIssue({ code: 'custom', path: ['up'], message: 'up must not be collinear with view' });
    }
  });

const presentationParameterFields = {
  schemaVersion: z.literal(PRESENTATION_DOCUMENT_V1_SCHEMA_VERSION),
  grid: z
    .object({
      columns: z.number().int().min(1).max(4),
      rows: z.number().int().min(1).max(3),
      cellWidth: z.number().int().min(1).max(4096),
      cellHeight: z.number().int().min(1).max(4096),
    })
    .strict(),
  lightingPresetId: id,
  receiptPolicy: z
    .object({
      requirePerCameraOutputSha256: z.boolean(),
      requireOutputSetSha256: z.boolean(),
    })
    .strict(),
  cameras: z.array(cameraSchema).min(1).max(12),
};

type PresentationShape = {
  grid: { columns: number; rows: number; cellWidth: number; cellHeight: number };
  cameras: Array<{ id: string; cell: { column: number; row: number }; aspect: number }>;
};

function refinePresentation(document: PresentationShape, ctx: z.RefinementCtx): void {
  if (document.cameras.length > document.grid.columns * document.grid.rows) {
    ctx.addIssue({ code: 'custom', path: ['cameras'], message: 'camera count exceeds grid cells' });
  }
  const totalPixels = document.cameras.length * document.grid.cellWidth * document.grid.cellHeight;
  if (totalPixels > PRESENTATION_MAX_TOTAL_PIXELS_V1) {
    ctx.addIssue({
      code: 'custom',
      path: ['grid'],
      message: `presentation total pixel budget ${totalPixels} exceeds ${PRESENTATION_MAX_TOTAL_PIXELS_V1}`,
    });
  }
  const ids = new Set<string>();
  const cells = new Set<string>();
  const cellAspect = document.grid.cellWidth / document.grid.cellHeight;
  for (let index = 0; index < document.cameras.length; index++) {
    const camera = document.cameras[index]!;
    if (ids.has(camera.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cameras', index, 'id'],
        message: 'camera id must be unique',
      });
    }
    ids.add(camera.id);
    if (camera.cell.column >= document.grid.columns || camera.cell.row >= document.grid.rows) {
      ctx.addIssue({
        code: 'custom',
        path: ['cameras', index, 'cell'],
        message: 'camera cell is outside grid',
      });
    }
    const cell = `${camera.cell.column}:${camera.cell.row}`;
    if (cells.has(cell)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cameras', index, 'cell'],
        message: 'camera cell must be unique',
      });
    }
    cells.add(cell);
    if (Math.abs(camera.aspect - cellAspect) > Math.max(1, cellAspect) * 1e-9) {
      ctx.addIssue({
        code: 'custom',
        path: ['cameras', index, 'aspect'],
        message: 'aspect must equal grid cell aspect',
      });
    }
  }
}

/** Model-authorable parameters persisted in WorldDocumentV2; no self-referential hash. */
export const PresentationParametersV1Schema = z
  .object(presentationParameterFields)
  .strict()
  .superRefine(refinePresentation);

/** Capture-time presentation contract bound to an immutable world/GLB input. */
export const PresentationDocumentV1Schema = z
  .object({
    ...presentationParameterFields,
    artifactBinding: z.object({ kind: z.enum(['world', 'glb']), sha256: contentSha256 }).strict(),
  })
  .strict()
  .superRefine(refinePresentation);

export type PresentationParametersV1 = z.infer<typeof PresentationParametersV1Schema>;
export type PresentationDocumentV1 = z.infer<typeof PresentationDocumentV1Schema>;

export function parsePresentationParametersV1(input: unknown): PresentationParametersV1 {
  assertNoPrototypeKeys(input);
  return PresentationParametersV1Schema.parse(input);
}

export function parsePresentationDocumentV1(input: unknown): PresentationDocumentV1 {
  assertNoPrototypeKeys(input);
  return PresentationDocumentV1Schema.parse(input);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

/**
 * Engine-owned baseline for new Composer worlds. The ordered cameras mirror the
 * three bounded inspection directions used by the canonical scene renderer,
 * while exact output hashes remain mandatory. Hosts should persist a fresh copy
 * from {@link createDefaultPresentationParametersV1} rather than duplicating
 * these values.
 */
export const DEFAULT_PRESENTATION_PARAMETERS_V1 = deepFreeze(
  parsePresentationParametersV1({
    schemaVersion: PRESENTATION_DOCUMENT_V1_SCHEMA_VERSION,
    grid: { columns: 3, rows: 1, cellWidth: 512, cellHeight: 512 },
    lightingPresetId: 'review-neutral-v1',
    receiptPolicy: {
      requirePerCameraOutputSha256: true,
      requireOutputSetSha256: true,
    },
    cameras: [
      {
        id: 'front-right',
        cell: { column: 0, row: 0 },
        position: [10, 7, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fovDeg: 50,
        aspect: 1,
        near: 0.05,
        far: 100,
      },
      {
        id: 'front-left',
        cell: { column: 1, row: 0 },
        position: [-10, 5.5, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fovDeg: 50,
        aspect: 1,
        near: 0.05,
        far: 100,
      },
      {
        id: 'rear-overview',
        cell: { column: 2, row: 0 },
        position: [2, 11, -10],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fovDeg: 50,
        aspect: 1,
        near: 0.05,
        far: 100,
      },
    ],
  }),
);

/** Return an independently mutable, strictly parsed copy of the Engine default. */
export function createDefaultPresentationParametersV1(): PresentationParametersV1 {
  return parsePresentationParametersV1(DEFAULT_PRESENTATION_PARAMETERS_V1);
}

/** Bind the Engine default presentation to exact canonical world or GLB bytes. */
export function createDefaultPresentationDocumentV1(
  artifactBinding: unknown,
): PresentationDocumentV1 {
  return parsePresentationDocumentV1({
    ...createDefaultPresentationParametersV1(),
    artifactBinding,
  });
}

export function canonicalPresentationDocumentV1Json(input: unknown): string {
  return canonicalContractJson(parsePresentationDocumentV1(input));
}

export function hashPresentationDocumentV1(input: unknown): Promise<`sha256:${string}`> {
  return sha256ContractJson(parsePresentationDocumentV1(input));
}

export type PresentationReceiptReasonV1 =
  | 'INPUT_HASH_MISMATCH'
  | 'OUTPUT_SIZE_MISMATCH'
  | 'LIGHTING_PROFILE_MISMATCH'
  | 'CAMERA_ORDER_MISMATCH'
  | 'PER_CAMERA_HASHES_REQUIRED'
  | 'OUTPUT_SET_HASH_REQUIRED';

export type PresentationReceiptValidationV1 =
  | { ok: true }
  | { ok: false; reason: PresentationReceiptReasonV1 };

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function validatePresentationReceiptV1(
  documentInput: unknown,
  receipt: SceneRenderReceipt,
): PresentationReceiptValidationV1 {
  const document = parsePresentationDocumentV1(documentInput);
  if (receipt.worldHash !== document.artifactBinding.sha256) {
    return { ok: false, reason: 'INPUT_HASH_MISMATCH' };
  }
  if (receipt.width !== document.grid.cellWidth || receipt.height !== document.grid.cellHeight) {
    return { ok: false, reason: 'OUTPUT_SIZE_MISMATCH' };
  }
  if (receipt.lightingPresetId !== document.lightingPresetId) {
    return { ok: false, reason: 'LIGHTING_PROFILE_MISMATCH' };
  }
  if (
    receipt.cameras.length !== document.cameras.length ||
    receipt.cameras.some((actual, index) => {
      const expected = document.cameras[index]!;
      return !(
        sameNumbers(actual.position, expected.position) &&
        sameNumbers(actual.target, expected.target) &&
        sameNumbers(actual.up, expected.up) &&
        actual.fovDeg === expected.fovDeg &&
        actual.aspect === expected.aspect &&
        actual.near === expected.near &&
        actual.far === expected.far
      );
    })
  ) {
    return { ok: false, reason: 'CAMERA_ORDER_MISMATCH' };
  }
  if (
    document.receiptPolicy.requirePerCameraOutputSha256 &&
    receipt.perCameraOutputSha256?.length !== document.cameras.length
  ) {
    return { ok: false, reason: 'PER_CAMERA_HASHES_REQUIRED' };
  }
  if (document.receiptPolicy.requireOutputSetSha256 && !receipt.outputSetSha256) {
    return { ok: false, reason: 'OUTPUT_SET_HASH_REQUIRED' };
  }
  return { ok: true };
}
