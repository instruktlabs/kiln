/**
 * Shared grid compositor for view cells — the single owner of the grid layout
 * constants (cell padding, gutter color, 3-column default) used by the six-view
 * grid, the animation strip, and the interior cutaway row. Extracted so the
 * PbrRenderPort path can composite host-rendered per-view PNGs into the SAME
 * 3x2 layout the CPU rasterizer produces without duplicating layout math.
 * Pure and deterministic.
 */

import { annotateViewCell } from './annotate';
import { encodePng } from './png';
import { decodePngShared } from './png-memo';

export const PAD = 4;
export const PAD_COLOR: [number, number, number] = [10, 11, 13];
/** Default column count of the view grids (3x2 for six views). */
export const GRID_COLS = 3;

export interface ComposedCellGrid {
  /** Row-major RGB bytes (width*height*3). */
  rgb: Uint8Array;
  width: number;
  height: number;
}

/**
 * Composite equal-size square RGB cells (size*size*3 bytes each) into a padded
 * row-major grid. `cols` columns; rows grow as needed (6 cells @ 3 cols = 3x2).
 */
export function compositeCellGrid(
  cells: readonly Uint8Array[],
  size: number,
  cols: number = GRID_COLS,
): ComposedCellGrid {
  if (cells.length === 0) throw new Error('compositeCellGrid: no cells to composite');
  const rows = Math.ceil(cells.length / cols);
  const width = cols * size + (cols + 1) * PAD;
  const height = rows * size + (rows + 1) * PAD;

  const grid = new Uint8Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    grid[p * 3] = PAD_COLOR[0];
    grid[p * 3 + 1] = PAD_COLOR[1];
    grid[p * 3 + 2] = PAD_COLOR[2];
  }

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    if (cell.length !== size * size * 3) {
      throw new Error(
        `compositeCellGrid: cell ${i} must be ${size * size * 3} bytes (size ${size}), got ${cell.length}`,
      );
    }
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = PAD + col * (size + PAD);
    const y0 = PAD + row * (size + PAD);
    for (let y = 0; y < size; y++) {
      const src = y * size * 3;
      const dst = ((y0 + y) * width + x0) * 3;
      grid.set(cell.subarray(src, src + size * 3), dst);
    }
  }

  return { rgb: grid, width, height };
}

export interface ComposedPngGrid {
  png: Buffer;
  width: number;
  height: number;
  /** The square cell size shared by every view. */
  cellSize: number;
}

/**
 * Decode per-view PNGs (e.g. from a host PbrRenderPort) and composite them into
 * the same padded grid layout the CPU view path produces. Every view must be
 * the same square size; unsupported PNG formats or mismatched sizes throw — the
 * caller treats that as a render-port degrade.
 *
 * Pass `views` to stamp each cell with its name and axis gnomon, exactly as the
 * CPU rasterizer does. A host renders pixels; it does not know the Kiln camera
 * vocabulary, so the annotation has to happen here or the GPU sheet arrives
 * unlabelled — a silent loss of the model's orientation cues on the one path
 * where the run cannot tell it happened. `views` must align 1:1 with `pngs`.
 */
export function compositeViewPngGrid(
  pngs: readonly Uint8Array[],
  cols: number = GRID_COLS,
  views?: readonly { name: string; dir: readonly number[] }[],
): ComposedPngGrid {
  if (pngs.length === 0) throw new Error('compositeViewPngGrid: no views to composite');
  if (views && views.length !== pngs.length) {
    throw new Error(
      `compositeViewPngGrid: ${views.length} view specs for ${pngs.length} PNGs — they must align 1:1`,
    );
  }
  const decoded = pngs.map((png) => decodePngShared(png));
  const size = decoded[0]!.width;
  for (const d of decoded) {
    if (d.width !== size || d.height !== size) {
      throw new Error(
        `compositeViewPngGrid: every view must be a ${size}x${size} square; got ${d.width}x${d.height}`,
      );
    }
  }
  if (views) {
    // decodePngShared returns cell-owned buffers, so this mutates nothing the caller
    // still holds — the host's PNG bytes are untouched.
    for (let i = 0; i < decoded.length; i++) annotateViewCell(decoded[i]!.rgb, size, views[i]!);
  }
  const { rgb, width, height } = compositeCellGrid(
    decoded.map((d) => d.rgb),
    size,
    cols,
  );
  return { png: encodePng(rgb, width, height), width, height, cellSize: size };
}
