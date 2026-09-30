/**
 * Capture configuration for the view grid (T3.2).
 *
 * The contact sheet was a fixed 3x2 of six named cameras. That is the right
 * default and stays the default, but it is wrong often enough to matter: a
 * symmetric prop wastes four cells restating the same silhouette, and a
 * complex asset with an occluded interior needs angles the six do not include.
 * This module lets the model choose the grid shape and, if it wants, every
 * cell's camera.
 *
 * ## The one hard rule
 *
 * Omitting `capture` must reproduce the existing 3x2 output **byte for byte**.
 * Every default here is arranged around that: {@link DEFAULT_CAPTURE_PRESET} is
 * `3x2`, its cells are `SIX_VIEWS` by identity (not a copy that could drift),
 * and per-cell `zoom` is only applied when explicitly supplied, because passing
 * frame bounds at all changes the framing path away from per-cell auto-framing.
 *
 * ## Preset naming
 *
 * `COLSxROWS`, matching how the existing grid is described throughout the
 * codebase ("6 cells @ 3 cols = 3x2"). So `3x1` is a wide strip and `1x2` is a
 * tall pair.
 */

import { SIX_VIEWS, type ViewSpec, orbitAnglesOf, orbitDir, resolveGridViews } from './raster';
import { BACKDROP_IDS, DEFAULT_BACKDROP_ID, isBackdropId, type BackdropId } from './background';

/** Grid shapes the model may ask for. `COLS x ROWS`. */
export type CapturePreset = '1x1' | '1x2' | '2x1' | '3x1' | '2x2' | '3x2' | '3x3';

export const CAPTURE_PRESETS: readonly CapturePreset[] = [
  '1x1',
  '1x2',
  '2x1',
  '3x1',
  '2x2',
  '3x2',
  '3x3',
] as const;

/** The shipped contact sheet. Omitting `capture` resolves to exactly this. */
export const DEFAULT_CAPTURE_PRESET: CapturePreset = '3x2';

/** Hard cap on cells, so a runaway config cannot blow up render time or tokens. */
export const MAX_CAPTURE_CELLS = 9;

/** One model-specified camera. Angles are object-relative, same frame as `kiln_inspect`. */
export interface CaptureCell {
  azimuthDeg: number;
  elevationDeg: number;
  /** Padding multiplier around the asset bounds. Omit for the default auto-framing. */
  zoom?: number;
  /** Optional cell label. Auto-derived from the angles when omitted. */
  name?: string;
}

export interface CaptureConfig {
  version?: 'kiln.capture.v1';
  shots?: import('./camera').CameraShotV1[];
  cols?: number;
  size?: number;
  output?: 'grid' | 'separate';
  preset?: CapturePreset;
  cells?: CaptureCell[];
  /**
   * Named backdrop behind every cell. Omit for the default. One of three fixed
   * colours rather than a free hex, so sheets stay comparable across runs and a
   * backdrop can never be tuned to hide a seam. See `views/background.ts`.
   */
  backdrop?: BackdropId;
}

/** Columns for each preset. Rows follow from the cell count. */
const PRESET_COLS: Record<CapturePreset, number> = {
  '1x1': 1,
  '1x2': 1,
  '2x1': 2,
  '3x1': 3,
  '2x2': 2,
  '3x2': 3,
  '3x3': 3,
};

/** Cell capacity of each preset. */
const PRESET_CAPACITY: Record<CapturePreset, number> = {
  '1x1': 1,
  '1x2': 2,
  '2x1': 2,
  '3x1': 3,
  '2x2': 4,
  '3x2': 6,
  '3x3': 9,
};

/** Two extra cameras the six-view set has no room for. */
const BOTTOM: ViewSpec = { name: 'BOTTOM', dir: [0, -1, 0.0001] };
const THREE_QUARTER_REAR: ViewSpec = { name: 'REAR 34', dir: [-0.7, 0.5, -0.7] };
const THREE_QUARTER_LOW: ViewSpec = { name: 'LOW 34', dir: [0.7, -0.35, 0.7] };

/**
 * Default cameras per preset, chosen so a smaller grid drops the least
 * informative cells rather than simply truncating the six in order.
 *
 * A single cell is the 3/4, not the front: one orthographic elevation reads as
 * a flat rectangle for most assets, while the quarter view carries depth,
 * proportion and silhouette at once. Two cells add the front for a readable
 * measurement reference. `3x2` is `SIX_VIEWS` itself — same array identity, so
 * a future edit to the six-view set cannot silently desynchronise the default.
 */
const PRESET_VIEWS: Record<CapturePreset, ViewSpec[]> = {
  '1x1': [SIX_VIEWS[5]!],
  '1x2': [SIX_VIEWS[0]!, SIX_VIEWS[5]!],
  '2x1': [SIX_VIEWS[0]!, SIX_VIEWS[5]!],
  '3x1': [SIX_VIEWS[0]!, SIX_VIEWS[1]!, SIX_VIEWS[5]!],
  '2x2': [SIX_VIEWS[0]!, SIX_VIEWS[1]!, SIX_VIEWS[4]!, SIX_VIEWS[5]!],
  '3x2': SIX_VIEWS,
  '3x3': [...SIX_VIEWS, BOTTOM, THREE_QUARTER_REAR, THREE_QUARTER_LOW],
};

/**
 * Label an orbit cell using only glyphs the 3x5 bitmap font actually has
 * (uppercase, digits, space — there is no minus sign, so elevation sign is
 * carried by U/D rather than a `-` that would render as a blank box).
 */
export function captureCellLabel(azimuthDeg: number, elevationDeg: number): string {
  const az = Math.round(((azimuthDeg % 360) + 360) % 360);
  const el = Math.round(elevationDeg);
  return `A${az} ${el < 0 ? 'D' : 'U'}${Math.abs(el)}`;
}

export interface ResolvedCapture {
  preset: CapturePreset;
  views: ViewSpec[];
  cols: number;
  /** Per-cell zoom, aligned with `views`. `undefined` means auto-frame. */
  zooms: Array<number | undefined>;
  /** True when the result is the untouched shipped default. */
  isDefault: boolean;
  /** The backdrop every cell is painted on. */
  backdrop: BackdropId;
}

/**
 * The layout a contact sheet was actually produced in, reported alongside it.
 *
 * Shared by the tool result, the `views` artifact and the render port so a
 * consumer never has to infer the grid shape by dividing image dimensions.
 */
export interface CaptureShape {
  preset: string;
  cols: number;
  cells: number;
  /** Echoed so the model never has to guess what colour it is looking at. */
  backdrop?: BackdropId;
  /**
   * Delivery of a versioned capture: one sheet (`grid`, laid out as `preset`)
   * or one image per shot (`separate`). Absent for the default six-view sheet.
   */
  output?: 'grid' | 'separate';
}

export class CaptureConfigError extends Error {}

/** Validate an optional backdrop id, naming the choices on a miss. */
export function resolveCaptureBackdrop(backdrop: unknown): BackdropId {
  if (backdrop === undefined) return DEFAULT_BACKDROP_ID;
  if (!isBackdropId(backdrop))
    throw new CaptureConfigError(
      `capture.backdrop must be one of ${BACKDROP_IDS.join(', ')} (got ${JSON.stringify(backdrop)}).`,
    );
  return backdrop;
}

/**
 * Resolve a capture config into the view list, column count and per-cell zooms
 * the grid renderer needs.
 *
 * Throws {@link CaptureConfigError} on anything the model got wrong, with a
 * message naming the fix — these come back through the tool result, so they are
 * the model's only feedback channel.
 */
export function resolveCapture(config?: CaptureConfig): ResolvedCapture {
  const backdrop = resolveCaptureBackdrop(config?.backdrop);
  if (!config || (config.preset === undefined && config.cells === undefined)) {
    return {
      preset: DEFAULT_CAPTURE_PRESET,
      views: PRESET_VIEWS[DEFAULT_CAPTURE_PRESET],
      cols: PRESET_COLS[DEFAULT_CAPTURE_PRESET],
      zooms: new Array(PRESET_CAPACITY[DEFAULT_CAPTURE_PRESET]).fill(undefined),
      isDefault: true,
      backdrop,
    };
  }

  const cells = config.cells;
  let preset = config.preset;

  if (preset !== undefined && !CAPTURE_PRESETS.includes(preset)) {
    throw new CaptureConfigError(
      `capture.preset must be one of ${CAPTURE_PRESETS.join(', ')} (got ${JSON.stringify(preset)}).`,
    );
  }

  if (cells !== undefined) {
    if (!Array.isArray(cells) || cells.length === 0) {
      throw new CaptureConfigError('capture.cells must be a non-empty array of camera angles.');
    }
    if (cells.length > MAX_CAPTURE_CELLS) {
      throw new CaptureConfigError(
        `capture.cells has ${cells.length} entries; the maximum is ${MAX_CAPTURE_CELLS}.`,
      );
    }
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!;
      if (!Number.isFinite(c?.azimuthDeg) || !Number.isFinite(c?.elevationDeg)) {
        throw new CaptureConfigError(
          `capture.cells[${i}] needs finite azimuthDeg and elevationDeg (got ${JSON.stringify(c)}).`,
        );
      }
      if (c.zoom !== undefined && (!Number.isFinite(c.zoom) || c.zoom <= 0)) {
        throw new CaptureConfigError(
          `capture.cells[${i}].zoom must be a positive number (got ${c.zoom}).`,
        );
      }
    }

    // Pick the tightest preset that fits when none was named, so `cells` alone
    // is a complete request rather than an error about a missing preset.
    if (preset === undefined) {
      preset = CAPTURE_PRESETS.find((p) => PRESET_CAPACITY[p] >= cells.length)!;
    } else if (cells.length > PRESET_CAPACITY[preset]) {
      throw new CaptureConfigError(
        `capture.preset ${preset} holds ${PRESET_CAPACITY[preset]} cells but ${cells.length} were given. ` +
          `Use a larger preset or fewer cells.`,
      );
    }

    return {
      preset,
      views: cells.map((c) => ({
        name: c.name?.trim().toUpperCase() || captureCellLabel(c.azimuthDeg, c.elevationDeg),
        dir: orbitDir(c.azimuthDeg, c.elevationDeg),
      })),
      cols: PRESET_COLS[preset],
      zooms: cells.map((c) => c.zoom),
      isDefault: false,
      backdrop,
    };
  }

  // Preset only: use its default cameras.
  const chosen = preset!;
  return {
    preset: chosen,
    views: PRESET_VIEWS[chosen],
    cols: PRESET_COLS[chosen],
    zooms: new Array(PRESET_VIEWS[chosen].length).fill(undefined),
    isDefault: chosen === DEFAULT_CAPTURE_PRESET,
    backdrop,
  };
}

/**
 * Resolve a capture config the way every grid producer must (T3.3).
 *
 * There are two producers of the same contact sheet — the CPU rasterizer and the
 * GPU render port — and they have to agree on the layout down to the cell order,
 * or a run's artifact silently changes shape depending on whether a GPU happened
 * to be reachable. This is the one function both call, so the precedence rule
 * exists once:
 *
 *   capture supplied  -> exactly what it asks for
 *   capture omitted   -> the `KILN_GRID_VARIANT` view set at the shipped 3 cols
 *
 * The env variant only applies to the omitted case on purpose: it swaps the
 * *default* six cameras for a bench arm, and silently rewriting a caller's
 * explicitly-requested angles would make the request a lie.
 */
export function resolveGridCapture(config?: CaptureConfig, envVariant?: string): ResolvedCapture {
  const resolved = resolveCapture(config);
  if (config) return resolved;
  const views = resolveGridViews(envVariant);
  // Identity when the variant is unset/unknown, so the default stays the exact
  // object the byte-identity tests pin.
  return views === resolved.views ? resolved : { ...resolved, views };
}

/** Describe a resolved capture for the tool result, in the model's own coordinates. */
export function describeCapture(resolved: ResolvedCapture): string {
  const angles = resolved.views
    .map((v) => {
      const { azimuthDeg, elevationDeg } = orbitAnglesOf(v.dir);
      return `${v.name} (az ${azimuthDeg}, el ${elevationDeg})`;
    })
    .join('; ');
  return `${resolved.preset} grid, ${resolved.views.length} cell${
    resolved.views.length === 1 ? '' : 's'
  }: ${angles}`;
}
