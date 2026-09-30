/**
 * Part-framed close-up rendering for the Kiln vision loop (kiln_inspect).
 *
 * Renders ONE orthographic view of an executed scene, framed to a named part's
 * world bounds (the part and its descendants) instead of the whole asset, so
 * the agent can inspect a suspect region — a joint, a contact point, a
 * proportion — at full-image detail instead of one grid cell. Part selection is
 * name-driven by design (the model authored the names via createPart), NOT a
 * free camera: an unresolved name comes back with the list of available part
 * names so the model can retry. Surrounding geometry stays visible by default
 * (and may occlude the part from some angles), matching the diagnostic views'
 * focus-bounds framing model (see ./diagnostic.ts); `isolate` opts out of that
 * and hides everything outside the part so nothing can block the view.
 */

import { measureBounds, orbitAnglesOf, orbitDir, rasterizeView } from './raster';
import { encodePng } from './png';

/** Square close-up size in pixels — one big view, not a grid cell. */
export const INSPECT_SIZE = 512;
export const INSPECT_DEFAULT_ZOOM = 1.2;
export const INSPECT_MIN_ZOOM = 1;
export const INSPECT_MAX_ZOOM = 4;
/** Cap on the part-name listing returned for an unresolved part. */
export const INSPECT_MAX_PART_NAMES = 40;

/** Camera names accepted by kiln_inspect (same directions as the six-view grid). */
export const INSPECT_CAMERAS: Record<string, [number, number, number]> = {
  front: [1, 0, 0],
  right: [0, 0, 1],
  back: [-1, 0, 0],
  left: [0, 0, -1],
  top: [0, 1, 0.0001],
  'three-quarter': [0.7, 0.5, 0.7],
};

/** Minimal duck-typed view of a (possibly cross-realm) scene node. */
interface DuckNamedNode {
  name?: string;
  isMesh?: boolean;
  visible?: boolean;
  parent?: DuckNamedNode | null;
  updateMatrixWorld?(force?: boolean): void;
  traverse?(cb: (obj: unknown) => void): void;
}

export interface InspectViewOptions {
  /** Part to frame, by node name (case-insensitive exact match, then substring).
   *  Omit to frame the whole asset. */
  part?: string;
  /** Camera angle: front, right, back, left, top, or three-quarter (default).
   *  Unknown names fall back to three-quarter. Ignored when `azimuthDeg` or
   *  `elevationDeg` is supplied. */
  view?: string;
  /** Object-relative orbit azimuth in degrees: 0 = front, 90 = right,
   *  180 = back, 270 = left. Wraps. Supplying either orbit angle switches the
   *  camera off the named presets. */
  azimuthDeg?: number;
  /** Object-relative orbit elevation in degrees: 0 = eye level, positive looks
   *  down from above. Clamped to -89..89. */
  elevationDeg?: number;
  /** Padding multiplier around the framed bounds, clamped to 1..4. Default 1.2. */
  zoom?: number;
  /** Square output size in pixels. Default {@link INSPECT_SIZE}. */
  size?: number;
  /** Hide every mesh outside the framed part's subtree, so surrounding geometry
   *  cannot occlude it from any angle. Requires `part` — with nothing singled
   *  out there is nothing to isolate, so it is a no-op. Default false. */
  isolate?: boolean;
}

export type InspectViewResult =
  | {
      ok: true;
      /** Resolved node name that was framed (absent when the whole asset was framed). */
      part?: string;
      /** Resolved camera name, or `'orbit'` when orbit angles were supplied. */
      view: string;
      /** Effective orbit angles actually rendered — present for BOTH named and
       *  orbit cameras, so the model always learns where the camera was and can
       *  nudge from there. Elevation reflects the clamp. */
      azimuthDeg: number;
      elevationDeg: number;
      /** Effective (clamped) padding multiplier. */
      zoom: number;
      /** Whether everything outside the framed part was actually hidden. False
       *  whenever no part was singled out, even if `isolate` was requested. */
      isolated: boolean;
      width: number;
      height: number;
      png: Buffer;
    }
  | {
      ok: false;
      view: string;
      zoom: number;
      error: string;
      /** Named nodes available for framing (deduped, scene order, capped). */
      availableParts: string[];
    };

export type PreparedInspectView =
  | {
      ok: true;
      root: unknown;
      part?: string;
      view: string;
      viewSpec: { name: string; dir: [number, number, number] };
      azimuthDeg: number;
      elevationDeg: number;
      zoom: number;
      isolated: boolean;
      size: number;
      frameBounds: Bounds;
    }
  | {
      ok: false;
      view: string;
      zoom: number;
      error: string;
      availableParts: string[];
    };

/** Named scene nodes in traversal (scene) order, deduped, capped. */
export function listPartNames(root: unknown, cap = INSPECT_MAX_PART_NAMES): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  (root as DuckNamedNode).traverse?.((obj) => {
    const name = (obj as DuckNamedNode).name?.trim();
    if (!name || seen.has(name) || names.length >= cap) return;
    seen.add(name);
    names.push(name);
  });
  return names;
}

/** First node whose name matches `part` case-insensitively — exact before substring. */
function findPartNode(root: unknown, part: string): DuckNamedNode | undefined {
  const query = part.trim().toLowerCase();
  if (!query) return undefined;
  let exact: DuckNamedNode | undefined;
  let partial: DuckNamedNode | undefined;
  (root as DuckNamedNode).traverse?.((obj) => {
    const node = obj as DuckNamedNode;
    const name = node.name?.trim().toLowerCase();
    if (!name) return;
    if (!exact && name === query) exact = node;
    else if (!partial && name.includes(query)) partial = node;
  });
  return exact ?? partial;
}

type Bounds = { min: [number, number, number]; max: [number, number, number] };

/** Grow a bounds box about its center by `factor` (the zoom padding). */
function expandBounds(b: Bounds, factor: number): Bounds {
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const center = (b.min[a]! + b.max[a]!) / 2;
    const half = ((b.max[a]! - b.min[a]!) / 2) * factor;
    min[a] = center - half;
    max[a] = center + half;
  }
  return { min, max };
}

/** The all-zero sentinel measureBounds returns for a triangle-free subtree. */
function isEmptyBounds(b: Bounds): boolean {
  return b.min.every((v) => v === 0) && b.max.every((v) => v === 0);
}

/**
 * Hide every mesh that is NOT inside `keep`'s subtree, so the framed part cannot
 * be occluded from any angle, and show `keep` with its ancestors: an isolated part
 * draws even when it is hidden (`visible = false`); hidden parts inside it stay
 * hidden. Hiding meshes rather than groups keeps `keep`'s ancestors drawing.
 *
 * MUTATES `.visible` on the passed scene — safe because every caller renders a
 * freshly executed program, the same contract `renderInteriorGrid` relies on.
 */
function isolateSubtree(root: unknown, keep: DuckNamedNode): void {
  for (let node: DuckNamedNode | null | undefined = keep; node; node = node.parent)
    if (node.visible === false) node.visible = true;
  const kept = new Set<unknown>();
  keep.traverse?.((obj) => kept.add(obj));
  (root as DuckNamedNode).traverse?.((obj) => {
    const node = obj as DuckNamedNode;
    if (!node.isMesh || kept.has(obj)) return;
    node.visible = false;
  });
}

/**
 * Render one close-up view framed to a named part's world bounds (or the whole
 * asset when no part is given). Never throws on a bad part name — that comes
 * back as { ok:false, availableParts } so the agent loop can retry by name.
 */
export function prepareInspectView(
  root: unknown,
  opts: InspectViewOptions = {},
): PreparedInspectView {
  const size = opts.size ?? INSPECT_SIZE;

  // Orbit angles win over the named presets, but ONLY when at least one is
  // supplied — omitting both must reproduce the previous behavior exactly, so
  // the named direction vectors stay authoritative rather than being
  // regenerated from angles (`top` is [0, 1, 0.0001], which is not orbitDir's
  // 89-degree elevation, and re-deriving it would silently move that camera).
  const hasOrbit = opts.azimuthDeg !== undefined || opts.elevationDeg !== undefined;
  const viewKey = (opts.view ?? 'three-quarter').trim().toLowerCase();
  const view = hasOrbit ? 'orbit' : viewKey in INSPECT_CAMERAS ? viewKey : 'three-quarter';
  const namedDir = INSPECT_CAMERAS[view in INSPECT_CAMERAS ? view : 'three-quarter']!;
  const dir = hasOrbit ? orbitDir(opts.azimuthDeg ?? 0, opts.elevationDeg ?? 0) : namedDir;
  const angles = orbitAnglesOf(dir);

  const zoom = Math.min(
    INSPECT_MAX_ZOOM,
    Math.max(INSPECT_MIN_ZOOM, opts.zoom ?? INSPECT_DEFAULT_ZOOM),
  );

  // World matrices must be current before measuring a subtree in isolation
  // (measureBounds on a child composes from its parent's matrixWorld).
  (root as DuckNamedNode).updateMatrixWorld?.(true);

  let part: string | undefined;
  let bounds: Bounds;
  let isolated = false;
  const requested = opts.part?.trim();
  if (requested) {
    const node = findPartNode(root, requested);
    if (!node) {
      return {
        ok: false,
        view,
        zoom,
        error: `no part named "${requested}" in the scene`,
        availableParts: listPartNames(root),
      };
    }
    const b = measureBounds(node);
    if (isEmptyBounds(b)) {
      return {
        ok: false,
        view,
        zoom,
        error: `part "${node.name}" has no visible geometry to frame`,
        availableParts: listPartNames(root),
      };
    }
    part = node.name!.trim();
    bounds = b;
    // Framing is measured first: isolation only removes geometry OUTSIDE the
    // part, so the framed box is identical either way.
    if (opts.isolate) {
      isolateSubtree(root, node);
      isolated = true;
    }
  } else {
    bounds = measureBounds(root);
  }

  return {
    ok: true,
    root,
    ...(part ? { part } : {}),
    view,
    viewSpec: { name: view, dir },
    ...angles,
    zoom,
    isolated,
    size,
    frameBounds: expandBounds(bounds, zoom),
  };
}

export function renderInspectView(root: unknown, opts: InspectViewOptions = {}): InspectViewResult {
  const prepared = prepareInspectView(root, opts);
  if (!prepared.ok) return prepared;
  const rgb = rasterizeView(prepared.root, prepared.viewSpec.dir, {
    size: prepared.size,
    frameBounds: prepared.frameBounds,
  });
  return {
    ok: true,
    ...(prepared.part ? { part: prepared.part } : {}),
    view: prepared.view,
    azimuthDeg: prepared.azimuthDeg,
    elevationDeg: prepared.elevationDeg,
    zoom: prepared.zoom,
    isolated: prepared.isolated,
    width: prepared.size,
    height: prepared.size,
    png: encodePng(rgb, prepared.size, prepared.size),
  };
}
