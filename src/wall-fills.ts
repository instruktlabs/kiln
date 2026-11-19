/**
 * What fills a `wallWithOpening` aperture (#410): frame, glazing, glazing bars, sill, lintel,
 * shutters, and a door or casement leaf on a named hinge pivot.
 *
 * Every fill is a box placed from the opening and the wall, so moving or widening an opening
 * moves its fills. Depths are metres inward from the wall's outer face (0 is the outer face,
 * the wall thickness is the inner face, negative is proud of the wall). The outer face is the
 * one `outward` points to along the wall's thickness axis.
 *
 * The fills meet the wall and each other face to face or with a gap; none passes through
 * another. Pieces inside the aperture (frame, glazing, bars, leaf) stay within it; pieces on
 * the outer face (sill, lintel, shutters) stand against it. Glazing stands 1 mm clear of the
 * frame, the bars and the reveal, because glass is usually drawn on both sides and two faces
 * touching there would z-fight. Every piece is a `boxGeo`: closed, outward, with UV0.
 *
 * Everything is checked before the first piece is made; a fill that does not fit throws.
 */
import * as THREE from 'three';
import { boxGeo } from './primitives';

type Range = [number, number];

export interface OpeningFrameFill {
  /** Face width of each frame member. Default 0.06. */
  width?: number;
  /** Depth range from the outer face. Default [0, thickness]: the frame lines the reveal. */
  depth?: Range;
}
export interface OpeningGlazingFill {
  /** Pane thickness. Default 0.01. */
  thickness?: number;
  /** Depth of the pane's centre from the outer face. Default: the middle of the frame. */
  depth?: number;
}
export interface OpeningBarsFill {
  /** Vertical bars at these fractions (0..1) of the clear width. */
  vertical?: number[];
  /** Horizontal bars at these fractions (0..1) of the clear height. */
  horizontal?: number[];
  /** Bar face width. Default 0.03. */
  width?: number;
  /** Depth range; default 2 cm either side of the glazing centre. */
  depth?: Range;
}
export interface OpeningFaceFill {
  /** Extra length beyond each side of the opening. */
  overhang?: number;
  /** How far it stands proud of the outer face. */
  projection?: number;
  /** Height. */
  height?: number;
}
export interface OpeningShuttersFill {
  /** Width of each leaf. Default half the opening width. */
  width?: number;
  /** Thickness, proud of the outer face. Default 0.035. */
  thickness?: number;
  /** Gap between the opening edge and each shutter. Default 0.02. */
  gap?: number;
}
export interface OpeningHandleFill {
  /** Centre height above the bottom of the leaf. Default 1.0 for a door, mid-leaf otherwise. */
  height?: number;
  /** Centre distance from the leaf's free edge. Default 0.06. */
  inset?: number;
  /** [along the run, height, projection]. Default [0.03, 0.12, 0.04]. */
  size?: [number, number, number];
}
export interface OpeningLeafFill {
  /** Default 0.04. */
  thickness?: number;
  /** Gap to the frame (or reveal) on every side, and to the floor. Default 0.005. */
  clearance?: number;
  /** Depth of the leaf's outer face. Default: centred in the frame depth. */
  depth?: number;
  /** Hinge side along the run axis: start is the lower coordinate. Default 'start'. */
  hinge?: 'start' | 'end';
  /** Pivot name; the node is named `Joint_<pivot>` as createPivot names it. */
  pivot?: string;
  /** A handle on the outer face near the free edge. */
  handle?: boolean | OpeningHandleFill;
}
export interface OpeningFill {
  frame?: true | OpeningFrameFill;
  glazing?: true | OpeningGlazingFill;
  bars?: OpeningBarsFill;
  /** Windows only: a sill below the opening on the outer face. */
  sill?: true | OpeningFaceFill;
  /** A lintel above the opening on the outer face. */
  lintel?: true | OpeningFaceFill;
  /** A pair of shutters hung open beside the opening on the outer face. */
  shutters?: true | OpeningShuttersFill;
  /** A door or casement leaf under a hinge pivot. Not with glazing or bars. */
  leaf?: true | OpeningLeafFill;
}

export const WALL_FILL_ROLES = [
  'frame',
  'glazing',
  'bars',
  'sill',
  'lintel',
  'shutter',
  'leaf',
  'hardware',
] as const;
export type WallFillRole = (typeof WALL_FILL_ROLES)[number];
export type WallFillMaterials = Partial<Record<WallFillRole, THREE.Material>>;

/** The opening as `buildWallPanels` validated it, plus what the caller asked to fill it with. */
export interface FillOpening {
  kind: 'door' | 'window';
  left: number;
  right: number;
  sill: number;
  top: number;
  fill?: OpeningFill;
  name?: string;
  names?: Record<string, string>;
}

export interface WallFillContext {
  name: string;
  axis: 'x' | 'z';
  outward: 1 | -1;
  length: number;
  height: number;
  thickness: number;
  material: THREE.Material;
  materials?: WallFillMaterials;
}

interface Piece {
  key: string;
  name: string;
  role: WallFillRole;
  s: Range;
  y: Range;
  d: Range;
  /** Index into the plan's pivots when the piece hangs on a hinge. */
  pivot?: number;
}
interface Pivot {
  name: string;
  /** The opening's part-name prefix, for naming what merges under the pivot. */
  prefix: string;
  s: number;
  y: number;
  d: number;
}
export interface WallFillPlan {
  pieces: Piece[];
  pivots: Pivot[];
  materials: Record<WallFillRole, THREE.Material | undefined>;
}

/** Glazing stands this far clear of the frame, bars and reveal (see the module note). */
export const GLAZING_CLEARANCE = 0.001;

const fail = (message: string): never => {
  throw new RangeError(`wallWithOpening: ${message}`);
};
const finite = (value: unknown, label: string): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(`${label} must be a finite number.`);
const positive = (value: unknown, label: string): number =>
  finite(value, label) > 0 ? (value as number) : fail(`${label} must be positive.`);
const nonNegative = (value: unknown, label: string): number =>
  finite(value, label) >= 0 ? (value as number) : fail(`${label} must not be negative.`);
const range = (value: unknown, label: string): Range => {
  if (!Array.isArray(value) || value.length !== 2) return fail(`${label} must be [from, to].`);
  const [a, b] = [finite(value[0], label), finite(value[1], label)];
  if (!(a < b)) fail(`${label} must run from a smaller to a larger depth.`);
  return [a, b];
};
function options<T extends object>(value: true | T | undefined, label: string, keys: string[]): T {
  if (value === true) return {} as T;
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be true or an options object.`);
  for (const key of Object.keys(value as object))
    if (!keys.includes(key))
      fail(`${label}.${key} is not an option; use ${keys.join(', ') || 'no keys'}.`);
  return value as T;
}
const fractions = (value: unknown, label: string): number[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return fail(`${label} must be an array of fractions.`);
  const list = value.map((f, i) => finite(f, `${label}[${i}]`));
  list.forEach((f, i) => {
    if (!(f > 0 && f < 1)) fail(`${label}[${i}] must be between 0 and 1.`);
    if (i > 0 && !(f > list[i - 1]!)) fail(`${label} must increase.`);
  });
  return list;
};
const overlaps = (a: Range, b: Range) => a[0] < b[1] && b[0] < a[1];

const FILL_KEYS = ['frame', 'glazing', 'bars', 'sill', 'lintel', 'shutters', 'leaf'];

/** One opening's pieces while they are laid out. */
interface Layout {
  /** Error label: `<prefix> fill`. */
  label: string;
  prefix: string;
  window: boolean;
  own: Piece[];
}
/** The aperture the frame leaves clear, and the depth range the fills centre on. */
interface Clear {
  s: Range;
  y: Range;
  middle: number;
  frameDepth?: Range;
}
interface FaceRect {
  opening: number;
  s: Range;
  y: Range;
}

function addPiece(
  layout: Layout,
  key: string,
  role: WallFillRole,
  s: Range,
  y: Range,
  d: Range,
  pivot?: number,
): void {
  layout.own.push({
    key,
    name: `${layout.prefix}_${key}`,
    role,
    s,
    y,
    d,
    ...(pivot === undefined ? {} : { pivot }),
  });
}

/** Each role's material: supplied, else the frame's, else the wall's; glazing must be supplied. */
function fillMaterials(context: WallFillContext): WallFillPlan['materials'] {
  const supplied = context.materials ?? {};
  if (supplied === null || typeof supplied !== 'object' || Array.isArray(supplied))
    fail('materials must map fill roles to materials.');
  for (const [role, material] of Object.entries(supplied)) {
    if (!(WALL_FILL_ROLES as readonly string[]).includes(role))
      fail(`materials.${role} is not a fill role; use ${WALL_FILL_ROLES.join(', ')}.`);
    if ((material as { isMaterial?: boolean } | null)?.isMaterial !== true)
      fail(`materials.${role} must be a material, such as gameMaterial(0x808080).`);
  }
  return Object.fromEntries(
    WALL_FILL_ROLES.map((role) => [
      role,
      role === 'glazing'
        ? supplied.glazing
        : (supplied[role] ?? supplied.frame ?? context.material),
    ]),
  ) as WallFillPlan['materials'];
}

/** The frame, and the clear opening it leaves. */
function planFrame(
  layout: Layout,
  value: OpeningFill['frame'],
  opening: FillOpening,
  thickness: number,
): Clear {
  const { left: s0, right: s1, sill: y0, top: y1 } = opening;
  if (value === undefined) return { s: [s0, s1], y: [y0, y1], middle: thickness / 2 };
  const { label, window } = layout;
  const frame = options<OpeningFrameFill>(value, `${label}.frame`, ['width', 'depth']);
  const w = positive(frame.width ?? 0.06, `${label}.frame.width`);
  const frameDepth = range(frame.depth ?? [0, thickness], `${label}.frame.depth`);
  if (!(2 * w < s1 - s0)) fail(`${label}.frame.width leaves no clear width.`);
  if (!((window ? 2 : 1) * w < y1 - y0)) fail(`${label}.frame.width leaves no clear height.`);
  addPiece(layout, 'FrameStart', 'frame', [s0, s0 + w], [y0, y1], frameDepth);
  addPiece(layout, 'FrameEnd', 'frame', [s1 - w, s1], [y0, y1], frameDepth);
  addPiece(layout, 'FrameHead', 'frame', [s0 + w, s1 - w], [y1 - w, y1], frameDepth);
  if (window) addPiece(layout, 'FrameBottom', 'frame', [s0 + w, s1 - w], [y0, y0 + w], frameDepth);
  return {
    s: [s0 + w, s1 - w],
    y: [window ? y0 + w : y0, y1 - w],
    middle: (frameDepth[0] + frameDepth[1]) / 2,
    frameDepth,
  };
}

/** The glazing's depth range; its panes are added once the bars have cut the opening. */
function planGlazing(
  layout: Layout,
  value: OpeningFill['glazing'],
  material: THREE.Material | undefined,
  clear: Clear,
): Range | undefined {
  if (value === undefined) return undefined;
  const { label } = layout;
  if (!material) fail(`${label}.glazing needs materials.glazing, such as glassMaterial(0x9fc4d0).`);
  const glazing = options<OpeningGlazingFill>(value, `${label}.glazing`, ['thickness', 'depth']);
  const t = positive(glazing.thickness ?? 0.01, `${label}.glazing.thickness`);
  const centre = finite(glazing.depth ?? clear.middle, `${label}.glazing.depth`);
  const glass: Range = [centre - t / 2, centre + t / 2];
  const frame = clear.frameDepth;
  if (frame && !(frame[0] < glass[0] && glass[1] < frame[1]))
    fail(`${label}.glazing must lie inside the frame depth.`);
  return glass;
}

/** Split [a, b] at each fraction, leaving a bar of width w across each cut. */
function cutCells(label: string, list: readonly number[], [a, b]: Range, w: number): Range[] {
  const cells: Range[] = [];
  let from = a;
  for (const f of list) {
    const at = a + f * (b - a);
    const cell: Range = [from, at - w / 2];
    if (!(cell[1] - cell[0] > 2 * GLAZING_CLEARANCE))
      fail(`${label} bars touch each other or the frame.`);
    cells.push(cell);
    from = at + w / 2;
  }
  if (!(b - from > 2 * GLAZING_CLEARANCE)) fail(`${label} bars touch each other or the frame.`);
  cells.push([from, b]);
  return cells;
}

/** Glazing bars, and the cells they cut the clear opening into. */
function planBars(
  layout: Layout,
  value: OpeningBarsFill | undefined,
  clear: Clear,
  glass: Range | undefined,
): { s: Range[]; y: Range[] } {
  if (value === undefined) return { s: [clear.s], y: [clear.y] };
  const { label } = layout;
  const bars = options<OpeningBarsFill>(value, `${label}.bars`, [
    'vertical',
    'horizontal',
    'width',
    'depth',
  ]);
  const w = positive(bars.width ?? 0.03, `${label}.bars.width`);
  const centre = glass ? (glass[0] + glass[1]) / 2 : clear.middle;
  const depth = range(bars.depth ?? [centre - 0.02, centre + 0.02], `${label}.bars.depth`);
  if (glass && !(depth[0] < glass[0] && glass[1] < depth[1]))
    fail(`${label}.bars.depth must contain the glazing.`);
  const vertical = fractions(bars.vertical, `${label}.bars.vertical`);
  const horizontal = fractions(bars.horizontal, `${label}.bars.horizontal`);
  const s = cutCells(`${label}.bars.vertical`, vertical, clear.s, w);
  const y = cutCells(`${label}.bars.horizontal`, horizontal, clear.y, w);
  for (let i = 0; i < vertical.length; i++)
    addPiece(layout, `BarV${i + 1}`, 'bars', [s[i]![1], s[i + 1]![0]], clear.y, depth);
  for (let j = 0; j < horizontal.length; j++)
    for (let k = 0; k < s.length; k++)
      addPiece(
        layout,
        s.length === 1 ? `BarH${j + 1}` : `BarH${j + 1}_${k + 1}`,
        'bars',
        s[k]!,
        [y[j]![1], y[j + 1]![0]],
        depth,
      );
  return { s, y };
}

/** One pane per cell, standing clear of the bars, the frame and the reveal. */
function addPanes(layout: Layout, glass: Range, cellsS: Range[], cellsY: Range[]): void {
  const panes = cellsS.length * cellsY.length;
  let n = 0;
  for (const y of cellsY)
    for (const s of cellsS) {
      n++;
      addPiece(
        layout,
        panes === 1 ? 'Glass' : `Glass${n}`,
        'glazing',
        [s[0] + GLAZING_CLEARANCE, s[1] - GLAZING_CLEARANCE],
        [y[0] + GLAZING_CLEARANCE, y[1] - GLAZING_CLEARANCE],
        glass,
      );
    }
}

interface HungLeaf {
  s: Range;
  y: Range;
  outer: number;
  hinge: 'start' | 'end';
  pivot: number;
}

/** A leaf hangs on its own pivot so it can swing. */
function planLeaf(layout: Layout, value: OpeningFill['leaf'], clear: Clear, pivots: Pivot[]): void {
  if (value === undefined) return;
  const { label, prefix } = layout;
  const leaf = options<OpeningLeafFill>(value, `${label}.leaf`, [
    'thickness',
    'clearance',
    'depth',
    'hinge',
    'pivot',
    'handle',
  ]);
  const t = positive(leaf.thickness ?? 0.04, `${label}.leaf.thickness`);
  const c = nonNegative(leaf.clearance ?? 0.005, `${label}.leaf.clearance`);
  const outer = finite(leaf.depth ?? clear.middle - t / 2, `${label}.leaf.depth`);
  const hinge = leaf.hinge ?? 'start';
  if (hinge !== 'start' && hinge !== 'end') fail(`${label}.leaf.hinge must be start or end.`);
  const pivotName = leaf.pivot ?? `${prefix}_Hinge`;
  if (typeof pivotName !== 'string' || !pivotName)
    fail(`${label}.leaf.pivot must be a non-empty name.`);
  const s: Range = [clear.s[0] + c, clear.s[1] - c];
  const y: Range = [clear.y[0] + c, clear.y[1] - c];
  if (!(s[1] > s[0] && y[1] > y[0])) fail(`${label}.leaf.clearance leaves no leaf.`);
  pivots.push({
    name: pivotName.startsWith('Joint_') ? pivotName : `Joint_${pivotName}`,
    prefix,
    s: hinge === 'start' ? s[0] : s[1],
    y: y[0],
    d: outer,
  });
  const pivot = pivots.length - 1;
  addPiece(layout, 'Leaf', 'leaf', s, y, [outer, outer + t], pivot);
  if (leaf.handle !== undefined && leaf.handle !== false)
    planHandle(layout, leaf.handle, { s, y, outer, hinge, pivot });
}

/** A handle on the leaf's outer face near its free edge, on the leaf's pivot. */
function planHandle(layout: Layout, value: true | OpeningHandleFill, leaf: HungLeaf): void {
  const { label, window } = layout;
  const { s, y, outer, hinge, pivot } = leaf;
  const handle = options<OpeningHandleFill>(value, `${label}.leaf.handle`, [
    'height',
    'inset',
    'size',
  ]);
  const size = handle.size ?? [0.03, 0.12, 0.04];
  if (!Array.isArray(size) || size.length !== 3)
    fail(`${label}.leaf.handle.size must be [along, height, projection].`);
  const [sw, sh, sp] = size.map((v, i) => positive(v, `${label}.leaf.handle.size[${i}]`)) as [
    number,
    number,
    number,
  ];
  const inset = positive(handle.inset ?? 0.06, `${label}.leaf.handle.inset`);
  const lift = finite(
    handle.height ?? (window ? (y[1] - y[0]) / 2 : 1),
    `${label}.leaf.handle.height`,
  );
  const free = hinge === 'start' ? s[1] - inset : s[0] + inset;
  const hs: Range = [free - sw / 2, free + sw / 2];
  const hy: Range = [y[0] + lift - sh / 2, y[0] + lift + sh / 2];
  if (!(hs[0] >= s[0] && hs[1] <= s[1] && hy[0] >= y[0] && hy[1] <= y[1]))
    fail(`${label}.leaf.handle must sit on the leaf.`);
  addPiece(layout, 'Handle', 'hardware', hs, hy, [outer - sp, outer], pivot);
}

/** A sill or lintel's dimensions, read in a fixed order so the first bad value is reported. */
function faceOptions(
  value: true | OpeningFaceFill,
  label: string,
  defaults: Required<OpeningFaceFill>,
): Required<OpeningFaceFill> {
  const face = options<OpeningFaceFill>(value, label, ['overhang', 'projection', 'height']);
  const overhang = nonNegative(face.overhang ?? defaults.overhang, `${label}.overhang`);
  const height = positive(face.height ?? defaults.height, `${label}.height`);
  const projection = positive(face.projection ?? defaults.projection, `${label}.projection`);
  return { overhang, height, projection };
}

/** Pieces that stand against the outer face: sill, lintel and shutters. */
function planFacePieces(
  layout: Layout,
  fill: OpeningFill,
  opening: FillOpening,
  context: WallFillContext,
  faceRects: FaceRect[],
  index: number,
): void {
  const { label, window } = layout;
  const { left: s0, right: s1, sill: y0, top: y1 } = opening;
  const face = (key: string, role: WallFillRole, s: Range, y: Range, projection: number) => {
    if (
      s[0] < -context.length / 2 ||
      s[1] > context.length / 2 ||
      y[0] < 0 ||
      y[1] > context.height
    )
      fail(`${label}.${key.charAt(0).toLowerCase() + key.slice(1)} runs past the wall.`);
    faceRects.push({ opening: index, s, y });
    addPiece(layout, key, role, s, y, [-projection, 0]);
  };
  if (fill.sill !== undefined) {
    if (!window) fail(`${label}.sill: a sill is for windows; a door opening reaches the base.`);
    const sill = faceOptions(fill.sill, `${label}.sill`, {
      overhang: 0.05,
      projection: 0.05,
      height: 0.05,
    });
    const [ov, h] = [sill.overhang, sill.height];
    face('Sill', 'sill', [s0 - ov, s1 + ov], [y0 - h, y0], sill.projection);
  }
  if (fill.lintel !== undefined) {
    const lintel = faceOptions(fill.lintel, `${label}.lintel`, {
      overhang: 0.1,
      projection: 0.03,
      height: 0.12,
    });
    const [ov, h] = [lintel.overhang, lintel.height];
    face('Lintel', 'lintel', [s0 - ov, s1 + ov], [y1, y1 + h], lintel.projection);
  }
  if (fill.shutters !== undefined) {
    const shutters = options<OpeningShuttersFill>(fill.shutters, `${label}.shutters`, [
      'width',
      'thickness',
      'gap',
    ]);
    const w = positive(shutters.width ?? (s1 - s0) / 2, `${label}.shutters.width`);
    const t = positive(shutters.thickness ?? 0.035, `${label}.shutters.thickness`);
    const gap = nonNegative(shutters.gap ?? 0.02, `${label}.shutters.gap`);
    face('ShutterStart', 'shutter', [s0 - gap - w, s0 - gap], [y0, y1], t);
    face('ShutterEnd', 'shutter', [s1 + gap, s1 + gap + w], [y0, y1], t);
  }
}

/** Caller names replace default suffixes, so an existing name contract can be kept. */
function applyNames(layout: Layout, names: Record<string, string> | undefined): void {
  if (names === undefined) return;
  const { label, own } = layout;
  if (names === null || typeof names !== 'object')
    fail(`${label}: names must map piece names to part names.`);
  const keys = own.map((piece) => piece.key);
  for (const [key, value] of Object.entries(names)) {
    const piece = own.find((p) => p.key === key);
    if (!piece)
      fail(`${label}: names.${key} names no piece; this opening makes ${keys.join(', ')}.`);
    if (typeof value !== 'string' || !value)
      fail(`${label}: names.${key} must be a non-empty string.`);
    piece!.name = value;
  }
}

/** One opening's pieces, in a fixed order: frame, bars, glass, leaf, sill, lintel, shutters. */
function planOpening(
  context: WallFillContext,
  materials: WallFillPlan['materials'],
  opening: FillOpening,
  at: { index: number; ordinal: number },
  pivots: Pivot[],
  faceRects: FaceRect[],
): Piece[] {
  const { index, ordinal } = at;
  const fill = opening.fill;
  if (fill === undefined) {
    if (opening.names !== undefined) fail(`opening ${index + 1} has names but no fill.`);
    return [];
  }
  if (fill === null || typeof fill !== 'object' || Array.isArray(fill))
    fail(`opening ${index + 1} fill must be an object.`);
  for (const key of Object.keys(fill))
    if (!FILL_KEYS.includes(key)) fail(`fill.${key} is not a fill; use ${FILL_KEYS.join(', ')}.`);
  const prefix =
    opening.name ?? `${context.name}_${opening.kind === 'door' ? 'Door' : 'Window'}${ordinal}`;
  if (typeof prefix !== 'string' || !prefix) fail('opening name must be a non-empty string.');
  const layout: Layout = {
    label: `${prefix} fill`,
    prefix,
    window: opening.kind === 'window',
    own: [],
  };
  const clear = planFrame(layout, fill.frame, opening, context.thickness);
  if (fill.leaf !== undefined && (fill.glazing !== undefined || fill.bars !== undefined))
    fail(`${layout.label}: a leaf fills the opening, so it cannot also take glazing or bars.`);
  const glass = planGlazing(layout, fill.glazing, materials.glazing, clear);
  const cells = planBars(layout, fill.bars, clear, glass);
  if (glass) addPanes(layout, glass, cells.s, cells.y);
  planLeaf(layout, fill.leaf, clear, pivots);
  planFacePieces(layout, fill, opening, context, faceRects, index);
  applyNames(layout, opening.names);
  return layout.own;
}

/** Pieces on the face must not cover another opening or overlap its face pieces. */
function checkFaceRects(faceRects: readonly FaceRect[], openings: readonly FillOpening[]): void {
  for (let i = 0; i < faceRects.length; i++) {
    const a = faceRects[i]!;
    for (const [j, other] of openings.entries())
      if (
        j !== a.opening &&
        overlaps(a.s, [other.left, other.right]) &&
        overlaps(a.y, [other.sill, other.top])
      )
        fail(`a fill of opening ${a.opening + 1} covers opening ${j + 1}.`);
    for (let k = i + 1; k < faceRects.length; k++) {
      const b = faceRects[k]!;
      if (a.opening !== b.opening && overlaps(a.s, b.s) && overlaps(a.y, b.y))
        fail(`the fills of openings ${a.opening + 1} and ${b.opening + 1} overlap.`);
    }
  }
}

/** Validate every fill and lay out its pieces. Allocates no geometry. */
export function planWallFills(
  context: WallFillContext,
  openings: readonly FillOpening[],
  panelNames: readonly string[],
): WallFillPlan {
  const materials = fillMaterials(context);
  const pieces: Piece[] = [];
  const pivots: Pivot[] = [];
  const faceRects: FaceRect[] = [];
  const counts = { door: 0, window: 0 };
  for (const [index, opening] of openings.entries()) {
    const ordinal = ++counts[opening.kind];
    const at = { index, ordinal };
    pieces.push(...planOpening(context, materials, opening, at, pivots, faceRects));
  }
  checkFaceRects(faceRects, openings);
  const names = new Set(panelNames);
  for (const piece of pieces) {
    if (names.has(piece.name)) fail(`two parts would be named ${piece.name}.`);
    names.add(piece.name);
  }
  return { pieces, pivots, materials };
}

/**
 * Make the planned pieces under `group`, recording each piece's role and each pivot's opening
 * prefix for a later merge.
 */
export function emitWallFills(
  context: WallFillContext,
  plan: WallFillPlan,
  group: THREE.Object3D,
  roles: Map<THREE.Mesh, string>,
  pivotPrefixes: Map<THREE.Object3D, string>,
): void {
  const { axis, outward, thickness } = context;
  const t = (d: number) => outward * (thickness / 2 - d);
  const local = (s: number, y: number, d: number): [number, number, number] =>
    axis === 'z' ? [t(d), y, s] : [s, y, t(d)];
  // A pivot is made where its first piece is, so node order follows the plan.
  const pivots: THREE.Object3D[] = [];
  const pivotNode = (index: number): THREE.Object3D => {
    if (pivots[index]) return pivots[index]!;
    const pivot = plan.pivots[index]!;
    const node = new THREE.Object3D();
    node.name = pivot.name;
    node.position.set(...local(pivot.s, pivot.y, pivot.d));
    group.add(node);
    pivotPrefixes.set(node, pivot.prefix);
    pivots[index] = node;
    return node;
  };
  for (const piece of plan.pieces) {
    const [s0, s1] = piece.s;
    const [y0, y1] = piece.y;
    const ta = t(piece.d[0]);
    const tb = t(piece.d[1]);
    const ts = Math.abs(tb - ta);
    const geometry = axis === 'z' ? boxGeo(ts, y1 - y0, s1 - s0) : boxGeo(s1 - s0, y1 - y0, ts);
    const centre = local((s0 + s1) / 2, (y0 + y1) / 2, (piece.d[0] + piece.d[1]) / 2);
    const parent = piece.pivot === undefined ? group : pivotNode(piece.pivot);
    if (piece.pivot !== undefined) {
      const at = parent.position;
      centre[0] -= at.x;
      centre[1] -= at.y;
      centre[2] -= at.z;
    }
    const mesh = new THREE.Mesh(geometry, plan.materials[piece.role]!);
    mesh.name = `Mesh_${piece.name}`;
    mesh.position.set(...centre);
    parent.add(mesh);
    roles.set(mesh, piece.role);
  }
}
