/**
 * Time-sampled posing for the Kiln animation-feedback loop.
 *
 * The static six-view grid (./index, ./raster) shows the agent its REST pose, so
 * it self-corrects geometry/orientation defects. But it is blind to its
 * animations — a sideways walk, a backward-bending knee, an attack that swings
 * behind the body, or a held item that doesn't track the hand are all MOTION
 * defects invisible at author time. This module poses an executed scene at a
 * given clip time so the rasterizer can render it; ./index composes the result
 * into an annotated frame strip (kiln_screenshot_animation).
 *
 * Strictly duck-typed across the sandbox/module-realm boundary (see ../render):
 * clips are read via `.tracks[].name/.times/.values`, nodes are found by
 * `root.traverse` + `.name`, and transforms are written by calling the node's own
 * `.position/.quaternion/.scale .set()` methods — no `instanceof`, no THREE import.
 */

/** Minimal duck-typed view of a Three.js node we pose. */
interface DuckNode {
  name?: string;
  position?: { set(x: number, y: number, z: number): void };
  quaternion?: { set(x: number, y: number, z: number, w: number): void };
  scale?: { set(x: number, y: number, z: number): void };
  updateMatrixWorld?(force?: boolean): void;
  traverse?(cb: (obj: unknown) => void): void;
}

/** Minimal duck-typed view of a Three.js KeyframeTrack. */
interface DuckTrack {
  name?: string;
  times?: ArrayLike<number>;
  values?: ArrayLike<number>;
  getInterpolation?(): number;
}

/** Minimal duck-typed view of a Three.js AnimationClip. */
export interface DuckClip {
  name?: string;
  duration?: number;
  tracks?: DuckTrack[];
  userData?: { kilnLoopIntent?: unknown };
}

type Prop = 'position' | 'quaternion' | 'scale';

interface PreparedTrack {
  nodeName: string;
  prop: Prop;
  stride: number;
  times: number[];
  values: number[];
  interpolation: 'LINEAR' | 'STEP';
}

/** A clip prepared for repeated time-sampling: parsed tracks + a derived duration. */
export interface PreparedClip {
  name: string;
  duration: number;
  tracks: PreparedTrack[];
  /** Track target names that resolve to no node in the scene (the "frozen clip" signal). */
  unresolved: string[];
}

const PROP_STRIDE: Record<Prop, number> = { position: 3, quaternion: 4, scale: 3 };

/** Find a clip by name (case-insensitive, trimmed). Returns the first exact match,
 *  else the first whose name contains the query, else undefined. */
export function findClip(clips: readonly DuckClip[], name: string): DuckClip | undefined {
  const q = name.trim().toLowerCase();
  const named = clips.filter((c) => typeof c.name === 'string');
  return (
    named.find((c) => c.name!.toLowerCase() === q) ??
    named.find((c) => c.name!.toLowerCase().includes(q)) ??
    undefined
  );
}

/** All clip names (for error messages when a requested clip isn't found). */
export function clipNames(clips: readonly DuckClip[]): string[] {
  return clips.map((c) => (typeof c.name === 'string' ? c.name : '(unnamed)'));
}

/**
 * Parse a clip's tracks into a reusable sampling plan and resolve each track's
 * target against the scene. Derives a duration from the keyframe times when the
 * clip doesn't carry one.
 */
export function prepareClip(root: DuckNode, clip: DuckClip): PreparedClip {
  const nodeNames = new Set<string>();
  root.traverse?.((obj) => {
    const n = (obj as DuckNode).name;
    if (n) nodeNames.add(n);
  });

  const tracks: PreparedTrack[] = [];
  const unresolved: string[] = [];
  let maxTime = 0;

  for (const track of clip.tracks ?? []) {
    const raw = track.name;
    if (!raw) continue;
    const dot = raw.lastIndexOf('.');
    if (dot === -1) continue;
    const nodeName = raw.slice(0, dot);
    const property = raw.slice(dot + 1) as Prop;
    if (property !== 'position' && property !== 'quaternion' && property !== 'scale') continue;

    const times = track.times ? Array.from(track.times) : [];
    const values = track.values ? Array.from(track.values) : [];
    if (times.length === 0 || values.length === 0) continue;

    // Three's stable interpolation constants, read without importing its module or
    // relying on class identity across realms. Plain historical duck tracks are linear.
    const mode = track.getInterpolation?.();
    if (mode !== undefined && mode !== 2300 && mode !== 2301) {
      throw new Error(`Unsupported animation interpolation on ${raw}; use LINEAR or STEP.`);
    }
    const interpolation = mode === 2300 ? 'STEP' : 'LINEAR';

    if (!nodeNames.has(nodeName)) unresolved.push(raw);
    if (times[times.length - 1]! > maxTime) maxTime = times[times.length - 1]!;

    tracks.push({
      nodeName,
      prop: property,
      stride: PROP_STRIDE[property],
      times,
      values,
      interpolation,
    });
  }

  const duration = clip.duration && clip.duration > 0 ? clip.duration : maxTime;
  return { name: clip.name ?? '(unnamed)', duration, tracks, unresolved };
}

/** Index of the last keyframe at or before `t`, via linear scan (keyframe counts
 *  are tiny). Returns -1 when `t` precedes the first key. */
function keyframeIndexAtOrBefore(times: number[], t: number): number {
  let i = -1;
  for (let k = 0; k < times.length; k++) {
    if (times[k]! <= t) i = k;
    else break;
  }
  return i;
}

/** Spherical-linear interpolation of two flat quaternions into `out` (THREE's
 *  slerpFlat algorithm; dependency-free so this module stays realm-agnostic). */
function slerpFlat(
  out: number[],
  src0: number[],
  o0: number,
  src1: number[],
  o1: number,
  t: number,
): void {
  const x0 = src0[o0]!,
    y0 = src0[o0 + 1]!,
    z0 = src0[o0 + 2]!,
    w0 = src0[o0 + 3]!;
  const x1 = src1[o1]!,
    y1 = src1[o1 + 1]!,
    z1 = src1[o1 + 2]!,
    w1 = src1[o1 + 3]!;
  let cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
  let bx = x1,
    by = y1,
    bz = z1,
    bw = w1;
  if (cos < 0) {
    cos = -cos;
    bx = -x1;
    by = -y1;
    bz = -z1;
    bw = -w1;
  }
  let s0: number, s1: number;
  if (cos > 0.9995) {
    s0 = 1 - t;
    s1 = t;
  } else {
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    s0 = Math.sin((1 - t) * theta) / sin;
    s1 = Math.sin(t * theta) / sin;
  }
  const rx = s0 * x0 + s1 * bx;
  const ry = s0 * y0 + s1 * by;
  const rz = s0 * z0 + s1 * bz;
  const rw = s0 * w0 + s1 * bw;
  const len = Math.hypot(rx, ry, rz, rw) || 1;
  out[0] = rx / len;
  out[1] = ry / len;
  out[2] = rz / len;
  out[3] = rw / len;
}

const quatTmp: number[] = [0, 0, 0, 1];

/** Sample one prepared track at time `t` into `out` (length = stride). STEP holds
 *  the previous key until the exact next time. LINEAR uses vector lerp/quaternion
 *  slerp. Both clamp outside the keyframe range. */
function sampleTrack(track: PreparedTrack, t: number, out: number[]): void {
  const { times, values, stride } = track;
  const i = keyframeIndexAtOrBefore(times, t);

  if (i < 0) {
    for (let s = 0; s < stride; s++) out[s] = values[s]!;
    return;
  }
  if (i >= times.length - 1) {
    const base = (times.length - 1) * stride;
    for (let s = 0; s < stride; s++) out[s] = values[base + s]!;
    return;
  }
  if (track.interpolation === 'STEP') {
    for (let s = 0; s < stride; s++) out[s] = values[i * stride + s]!;
    return;
  }

  const t0 = times[i]!;
  const t1 = times[i + 1]!;
  const span = t1 - t0;
  const a = span > 0 ? (t - t0) / span : 0;
  const o0 = i * stride;
  const o1 = (i + 1) * stride;

  if (stride === 4) {
    slerpFlat(quatTmp, values, o0, values, o1, a);
    out[0] = quatTmp[0]!;
    out[1] = quatTmp[1]!;
    out[2] = quatTmp[2]!;
    out[3] = quatTmp[3]!;
  } else {
    for (let s = 0; s < stride; s++)
      out[s] = values[o0 + s]! + (values[o1 + s]! - values[o0 + s]!) * a;
  }
}

export interface LoopClosureEvidence {
  version: 'kiln.loop-closure.v1';
  status: 'closed' | 'open' | 'incomplete';
  /** From createClip({ loop }): 'loop' should close, 'once' may stay open. */
  loopIntent: 'loop' | 'once' | 'unspecified';
  scope: string;
  tolerances: { positionDistance: number; rotationDegrees: number; scaleDistance: number };
  checkedTracks: number;
  unassessedTracks: number;
  mismatchCount: number;
  maxPositionDistance: number;
  maxRotationDegrees: number;
  maxScaleDistance: number;
  mismatches: { track: string; delta: number; unit: string }[];
  detailsTruncated: boolean;
}

function declaredLoopIntent(clip: DuckClip): LoopClosureEvidence['loopIntent'] {
  const intent = clip.userData?.kilnLoopIntent;
  return intent === 'loop' || intent === 'once' ? intent : 'unspecified';
}

/** A declared loop whose end pose differs from its start, as one warning line. */
export function loopIntentWarning(
  clipName: string,
  evidence: LoopClosureEvidence,
): string | undefined {
  if (evidence.loopIntent !== 'loop' || evidence.status !== 'open') return undefined;
  const worst = evidence.mismatches.reduce<LoopClosureEvidence['mismatches'][number] | undefined>(
    (max, entry) => (!max || entry.delta > max.delta ? entry : max),
    undefined,
  );
  const gap = worst
    ? ` (${worst.track} differs by ${Number(worst.delta.toPrecision(4))} ${worst.unit})`
    : '';
  return `LOOP_NOT_CLOSED: clip "${clipName}" is declared loop: true but its end pose differs from its start${gap}; close the loop or declare loop: false.`;
}

/** Endpoint C0 continuity, without assuming the clip was intended to loop.
 * Uses the same clamping/interpolation as preview, independent of chosen frames.
 * Quaternion distance is invariant to sign. Does not mutate the scene. */
export function measureLoopClosure(root: DuckNode, clip: DuckClip): LoopClosureEvidence {
  const tolerances = { positionDistance: 1e-6, rotationDegrees: 0.001, scaleDistance: 1e-6 };
  const result: LoopClosureEvidence = {
    version: 'kiln.loop-closure.v1',
    status: 'incomplete',
    loopIntent: declaredLoopIntent(clip),
    scope:
      'Local transform values at time 0 and clip duration; endpoint continuity only. loopIntent comes from createClip({ loop }): a declared loop should close, a one-shot (once) may stay open, and unspecified intent cannot tell them apart. Velocity continuity, contacts and collision are not assessed.',
    tolerances,
    checkedTracks: 0,
    unassessedTracks: 0,
    mismatchCount: 0,
    maxPositionDistance: 0,
    maxRotationDegrees: 0,
    maxScaleDistance: 0,
    mismatches: [],
    detailsTruncated: false,
  };
  const total = clip.tracks?.length ?? 0;
  let prepared: PreparedClip;
  try {
    prepared = prepareClip(root, clip);
  } catch {
    result.unassessedTracks = total;
    return result;
  }
  if (!Number.isFinite(prepared.duration) || prepared.duration <= 0) {
    result.unassessedTracks = total;
    return result;
  }
  result.unassessedTracks = total - prepared.tracks.length;
  for (const track of prepared.tracks) {
    const name = `${track.nodeName}.${track.prop}`;
    const valid =
      !prepared.unresolved.includes(name) &&
      track.values.length === track.times.length * track.stride &&
      track.values.every(Number.isFinite) &&
      track.times.every(
        (t, i) => Number.isFinite(t) && t >= 0 && (i === 0 || t > track.times[i - 1]!),
      ) &&
      (track.prop !== 'quaternion' ||
        track.times.every((_, i) => Math.hypot(...track.values.slice(i * 4, i * 4 + 4)) > 1e-12));
    if (!valid) {
      result.unassessedTracks++;
      continue;
    }
    const start: number[] = [],
      end: number[] = [];
    sampleTrack(track, 0, start);
    sampleTrack(track, prepared.duration, end);
    let delta: number, tolerance: number, unit: string;
    if (track.prop === 'quaternion') {
      const norm = Math.hypot(...start) * Math.hypot(...end);
      const dot = start.reduce((sum, v, i) => sum + v * end[i]!, 0) / norm;
      delta = (2 * Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
      tolerance = tolerances.rotationDegrees;
      unit = 'degrees';
      result.maxRotationDegrees = Math.max(result.maxRotationDegrees, delta);
    } else {
      delta = Math.hypot(...start.map((v, i) => v - end[i]!));
      if (track.prop === 'position') {
        tolerance = tolerances.positionDistance;
        unit = 'asset units (local)';
        result.maxPositionDistance = Math.max(result.maxPositionDistance, delta);
      } else {
        tolerance = tolerances.scaleDistance;
        unit = 'scale';
        result.maxScaleDistance = Math.max(result.maxScaleDistance, delta);
      }
    }
    result.checkedTracks++;
    if (delta > tolerance) {
      result.mismatchCount++;
      if (result.mismatches.length < 32) result.mismatches.push({ track: name, delta, unit });
    }
  }
  result.detailsTruncated = result.mismatchCount > result.mismatches.length;
  result.status =
    result.unassessedTracks || !result.checkedTracks
      ? 'incomplete'
      : result.mismatchCount
        ? 'open'
        : 'closed';
  return result;
}

/**
 * Pose `root` at clip time `t`: for every track, sample the value and write it to
 * the target node's transform, then refresh world matrices. MUTATES the scene
 * (callers pass a throwaway root — the screenshot tool executes fresh code each
 * call). Non-animated nodes keep their build transform, exactly as a single clip
 * played in isolation would leave them.
 */
export function poseSceneAtTime(root: DuckNode, prepared: PreparedClip, t: number): void {
  // Resolve targets each call (cheap; the scene is small) — robust to callers that
  // pass a clip prepared against a different (but identical) executed root.
  const byName = new Map<string, DuckNode>();
  root.traverse?.((obj) => {
    const node = obj as DuckNode;
    if (node.name && !byName.has(node.name)) byName.set(node.name, node);
  });

  const buf: number[] = [0, 0, 0, 0];
  for (const track of prepared.tracks) {
    const node = byName.get(track.nodeName);
    if (!node) continue;
    sampleTrack(track, t, buf);
    if (track.prop === 'position') node.position?.set(buf[0]!, buf[1]!, buf[2]!);
    else if (track.prop === 'scale') node.scale?.set(buf[0]!, buf[1]!, buf[2]!);
    else node.quaternion?.set(buf[0]!, buf[1]!, buf[2]!, buf[3]!);
  }

  root.updateMatrixWorld?.(true);
}

/**
 * The times (seconds) at which to sample a clip of `duration` into `count` frames,
 * inclusive of both endpoints (0 → duration). For a one-shot clip the last frame is
 * the final pose; for a seamless loop the last frame returns to the start (expected).
 */
export function planFrameTimes(duration: number, count: number): number[] {
  if (count <= 1 || duration <= 0) return new Array(Math.max(1, count)).fill(0);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push((duration * i) / (count - 1));
  return out;
}

// =============================================================================
// Tiny bitmap label stamp (annotate each frame with its phase)
// =============================================================================

// 3x5 glyphs (msb = leftmost column). Digits + % for phase labels; H-30 added
// the uppercase alphabet so view-name labels (FRONT/.../3/4, Eye-level, gnomon
// axis letters) render as real text — letters previously fell through to the
// blank space glyph, leaving unreadable backdrop boxes.
const GLYPHS: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  '%': [0b101, 0b001, 0b010, 0b100, 0b101],
  ' ': [0, 0, 0, 0, 0],
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b010],
  K: [0b101, 0b101, 0b110, 0b101, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b101, 0b111, 0b111, 0b111, 0b101],
  O: [0b010, 0b101, 0b101, 0b101, 0b010],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  Q: [0b010, 0b101, 0b101, 0b010, 0b001],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b111],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  W: [0b101, 0b101, 0b101, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  '/': [0b001, 0b001, 0b010, 0b100, 0b100],
  '-': [0b000, 0b000, 0b111, 0b000, 0b000],
  '.': [0b000, 0b000, 0b000, 0b000, 0b010],
};

const LABEL_FG: [number, number, number] = [255, 224, 64]; // amber, reads on dark + lit faces
const LABEL_BG: [number, number, number] = [12, 12, 14];

/**
 * Stamp `text` into an RGB buffer at (x0, y0) using the 3x5 font scaled by `scale`,
 * over a dark backdrop for legibility. Clipped to the buffer bounds. Used to label
 * each animation frame with its phase percentage.
 */
export function stampLabel(
  rgb: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  text: string,
  scale = 3,
): void {
  const gw = 3 * scale;
  const gh = 5 * scale;
  const gap = scale;
  const pad = scale;
  const totalW = text.length * gw + (text.length - 1) * gap + pad * 2;
  const totalH = gh + pad * 2;

  // Backdrop.
  for (let y = y0; y < y0 + totalH; y++) {
    for (let x = x0; x < x0 + totalW; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const p = (y * width + x) * 3;
      rgb[p] = LABEL_BG[0];
      rgb[p + 1] = LABEL_BG[1];
      rgb[p + 2] = LABEL_BG[2];
    }
  }

  // Glyphs.
  let cx = x0 + pad;
  const cy = y0 + pad;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' ']!;
    for (let row = 0; row < 5; row++) {
      const bits = glyph[row]!;
      for (let col = 0; col < 3; col++) {
        if (!(bits & (1 << (2 - col)))) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = cx + col * scale + sx;
            const y = cy + row * scale + sy;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const p = (y * width + x) * 3;
            rgb[p] = LABEL_FG[0];
            rgb[p + 1] = LABEL_FG[1];
            rgb[p + 2] = LABEL_FG[2];
          }
        }
      }
    }
    cx += gw + gap;
  }
}
