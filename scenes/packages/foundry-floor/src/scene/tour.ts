// SPDX-License-Identifier: MIT
// The guided tour (TASK-FF2 item 4, sim-spec 10): the camera visits the layout's named views in order (landing, spine,
// an EUV litho cell, the etch bay, the stocker canyon, the gallery, the section cut), holding at each while the HUD
// shows that stop's live state. Between stops on the fab floor it flies along the aisles (the layout's `via` points,
// corners rounded, eased along the path's length, looking from the stop's view into the direction of travel and on to
// the next stop's view); between separate spaces (gallery, fab floor, the view outside the cut) it cuts through a fade.
// With reduced motion every leg is a cut. On a narrow screen the vertical field of view widens so the horizontal one
// keeps at least the layout's minimum (sim-spec 12 test 9 checks the framing at 16:9 and 9:19.5 with this rule).
// Pure: no three, React or DOM, so bun tests sample the same timeline the page plays.
import type { LayoutData, NamedView, TourData, TourFeatureData, Vec3 } from '../sim/data';

export interface TourPose { position: Vec3; target: Vec3; fov: number }
export interface TourStop extends TourPose { name: NamedView; label: string; feature: TourFeatureData }
/** A fly leg's path: the rounded polyline (xyz triplets) with cumulative lengths, and the direction of travel sampled
 *  along it (yaw unwrapped, so the camera turns the short way without a jump). */
export interface FlyPath {
  points: Float64Array; cum: Float64Array; length: number;
  step: number; travelYaw: Float64Array; travelPitch: Float64Array;
  /** The turn from the stop's view into the direction of travel, and from it into the next stop's view (radians). */
  turnIn: number; turnOut: number; pitchIn: number; pitchOut: number;
}
export type TourPhase = 'cut' | 'hold' | 'fly' | 'done';
export interface TourSegment {
  kind: 'cut' | 'hold' | 'fly'; t0: number; t1: number;
  /** The stop this segment arrives at or holds. */
  stop: number;
  /** The stop it leaves; -1 for the camera's pose when the tour started. */
  from: number;
  path?: FlyPath;
}
export interface Tour { data: TourData; stops: TourStop[]; segments: TourSegment[]; total: number }
export interface TourFrame {
  position: Vec3; target: Vec3;
  /** The stop's vertical field of view (before the narrow-screen rule, tourFov). */
  fov: number;
  /** Black overlay opacity, 0 to 1 (cuts only). */
  fade: number;
  /** The stop held, being cut to, or flown to. */
  stop: number;
  phase: TourPhase;
  segment: number;
}

/** A cut fades out over this share of its time, holds black, and fades in over the same share. */
const CUT_FADE = 0.4;
const LOOK_AHEAD_M = 5;
const TRAVEL_CHORD_M = 2.5;
const PATH_STEP_M = 0.05;
const FILLET_PIECES = 16;

const smoothstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smootherstep = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * t * (t * (t * 6 - 15) + 10); };
const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
/** The layout's yaw of a direction (0 faces +X, pi/2 faces -Z) and its pitch (positive up). */
const yawOf = (d: readonly number[]): number => Math.atan2(-(d[2] as number), d[0] as number);
const pitchOf = (d: readonly number[]): number => Math.atan2(d[1] as number, Math.hypot(d[0] as number, d[2] as number));
function viewDir(p: TourPose): number[] {
  const d = [p.target[0] - p.position[0], p.target[1] - p.position[1], p.target[2] - p.position[2]], l = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
  return [d[0]! / l, d[1]! / l, d[2]! / l];
}

/** The vertical field of view the tour uses at `aspect` (width / height): the stop's, widened so the horizontal field
 *  of view is at least `minHorizontalDeg`. */
export function tourFov(fov: number, aspect: number, minHorizontalDeg: number): number {
  const needed = (2 * Math.atan(Math.tan((minHorizontalDeg * Math.PI) / 360) / Math.max(1e-6, aspect)) * 180) / Math.PI;
  return Math.max(fov, needed);
}

/** Writes the point at arc length s along the path into out. */
export function pathPoint(path: FlyPath, s: number, out: number[]): number[] {
  const { points, cum } = path, n = cum.length;
  const d = Math.min(path.length, Math.max(0, s));
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((cum[mid] as number) <= d) lo = mid; else hi = mid; }
  const span = (cum[hi] as number) - (cum[lo] as number), f = span > 1e-12 ? (d - (cum[lo] as number)) / span : 0;
  for (let k = 0; k < 3; k++) out[k] = (points[lo * 3 + k] as number) + ((points[hi * 3 + k] as number) - (points[lo * 3 + k] as number)) * f;
  return out;
}

/** The fly path through `corners` with each interior corner rounded (a quadratic Bezier over up to `fillet` metres
 *  either side), and the direction of travel from `from` (the leaving view) to `to` (the arriving view). */
export function flyPath(corners: readonly Vec3[], fillet: number, from: TourPose, to: TourPose): FlyPath {
  if (corners.length < 2) throw new Error('a fly path needs two points');
  const pts: number[] = [...corners[0]!];
  for (let i = 1; i < corners.length - 1; i++) {
    const a = corners[i - 1]!, b = corners[i]!, c = corners[i + 1]!;
    const lin = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), lout = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
    const r = Math.min(fillet, 0.45 * lin, 0.45 * lout);
    if (r < 1e-6) { pts.push(...b); continue; }
    const p0 = [0, 1, 2].map(k => b[k]! + (a[k]! - b[k]!) * (r / lin)), p2 = [0, 1, 2].map(k => b[k]! + (c[k]! - b[k]!) * (r / lout));
    for (let j = 0; j <= FILLET_PIECES; j++) {
      const s = j / FILLET_PIECES, w0 = (1 - s) * (1 - s), w1 = 2 * (1 - s) * s, w2 = s * s;
      pts.push(...[0, 1, 2].map(k => w0 * p0[k]! + w1 * b[k]! + w2 * p2[k]!));
    }
  }
  pts.push(...corners[corners.length - 1]!);
  const n = pts.length / 3, cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = (cum[i - 1] as number) + Math.hypot(pts[i * 3]! - pts[i * 3 - 3]!, pts[i * 3 + 1]! - pts[i * 3 - 2]!, pts[i * 3 + 2]! - pts[i * 3 - 1]!);
  const path: FlyPath = { points: Float64Array.from(pts), cum, length: cum[n - 1] as number, step: PATH_STEP_M, travelYaw: new Float64Array(0), travelPitch: new Float64Array(0), turnIn: 0, turnOut: 0, pitchIn: 0, pitchOut: 0 };
  // The direction of travel (a short chord) along the path, its yaw unwrapped so it stays continuous.
  const m = Math.max(2, Math.ceil(path.length / PATH_STEP_M) + 1), yaw = new Float64Array(m), pitch = new Float64Array(m);
  const ahead = [0, 0, 0], behind = [0, 0, 0];
  for (let i = 0; i < m; i++) {
    const s = (i / (m - 1)) * path.length;
    pathPoint(path, s + TRAVEL_CHORD_M, ahead); pathPoint(path, s - TRAVEL_CHORD_M, behind);
    const d = [ahead[0]! - behind[0]!, ahead[1]! - behind[1]!, ahead[2]! - behind[2]!];
    const y = yawOf(d);
    yaw[i] = i === 0 ? y : (yaw[i - 1] as number) + wrap(y - (yaw[i - 1] as number));
    pitch[i] = pitchOf(d);
  }
  path.step = path.length / (m - 1); path.travelYaw = yaw; path.travelPitch = pitch;
  const df = viewDir(from), dt = viewDir(to);
  path.turnIn = wrap((yaw[0] as number) - yawOf(df));
  path.turnOut = wrap(yawOf(dt) - (yaw[m - 1] as number));
  path.pitchIn = (pitch[0] as number) - pitchOf(df);
  path.pitchOut = pitchOf(dt) - (pitch[m - 1] as number);
  return path;
}

/** The tour for a layout: a cut to the first stop, then for each stop a hold and the leg to the next. */
export function buildTour(layout: LayoutData, options: { reduced?: boolean } = {}): Tour {
  const t = layout.cameras.tour;
  const stops: TourStop[] = t.stops.map(name => {
    const c = layout.cameras[name], feature = t.features[name];
    if (!feature) throw new Error(`tour stop ${name} has no feature`);
    return { name, label: c.label ?? name, position: c.position, target: c.target, fov: c.fov, feature };
  });
  const segments: TourSegment[] = [];
  let time = 0;
  const push = (kind: TourSegment['kind'], seconds: number, stop: number, from: number, path?: FlyPath) => {
    segments.push({ kind, t0: time, t1: time + seconds, stop, from, ...(path ? { path } : {}) });
    time += seconds;
  };
  push('cut', t.cutSeconds, 0, -1);
  push('hold', t.holdSeconds, 0, 0);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!, b = stops[i]!;
    const leg = t.legs.find(l => l.from === a.name && l.to === b.name);
    if (!leg) throw new Error(`no tour leg from ${a.name} to ${b.name}`);
    if (leg.kind === 'fly' && !options.reduced) {
      const path = flyPath([a.position, ...(leg.via ?? []), b.position], t.filletM, a, b);
      push('fly', Math.max(t.legSeconds, path.length / t.flySpeedMps), i, i - 1, path);
    } else push('cut', t.cutSeconds, i, i - 1);
    push('hold', t.holdSeconds, i, i);
  }
  return { data: t, stops, segments, total: time };
}

function setPose(out: TourFrame, p: TourPose): void {
  out.position[0] = p.position[0]; out.position[1] = p.position[1]; out.position[2] = p.position[2];
  out.target[0] = p.target[0]; out.target[1] = p.target[1]; out.target[2] = p.target[2];
  out.fov = p.fov;
}

export function newTourFrame(): TourFrame { return { position: [0, 0, 0], target: [0, 0, 0], fov: 55, fade: 0, stop: 0, phase: 'cut', segment: 0 }; }

const scratch = [0, 0, 0];
/** The camera at tour time t (seconds); `start` is the camera's pose when the tour began (the first cut leaves it). */
export function sampleTour(tour: Tour, t: number, out: TourFrame, start?: TourPose): TourFrame {
  const segs = tour.segments, last = tour.stops.length - 1;
  if (!(t < tour.total)) {
    setPose(out, tour.stops[last]!);
    out.fade = 0; out.stop = last; out.phase = 'done'; out.segment = segs.length;
    return out;
  }
  let k = 0;
  while (k < segs.length - 1 && t >= (segs[k] as TourSegment).t1) k++;
  const seg = segs[k] as TourSegment, u = Math.min(1, Math.max(0, (t - seg.t0) / (seg.t1 - seg.t0)));
  out.segment = k; out.phase = seg.kind; out.fade = 0;
  const to = tour.stops[seg.stop] as TourStop;
  if (seg.kind === 'hold') { setPose(out, to); out.stop = seg.stop; return out; }
  if (seg.kind === 'cut') {
    const from = seg.from < 0 ? (start ?? to) : (tour.stops[seg.from] as TourStop);
    out.fade = u < CUT_FADE ? u / CUT_FADE : u > 1 - CUT_FADE ? (1 - u) / CUT_FADE : 1;
    setPose(out, u < 0.5 ? from : to);
    out.stop = u < 0.5 && seg.from >= 0 ? seg.from : seg.stop;
    return out;
  }
  // Fly: eased along the path's length; the view turns from the leaving stop's into the direction of travel over the
  // first 35% of the time and from it into the arriving stop's over the last 35%.
  const path = seg.path as FlyPath, from = tour.stops[seg.from] as TourStop;
  const s = smootherstep(u) * path.length;
  pathPoint(path, s, out.position);
  const i = Math.min(path.travelYaw.length - 2, Math.floor(s / path.step)), f = Math.min(1, Math.max(0, s / path.step - i));
  const ty = (path.travelYaw[i] as number) + ((path.travelYaw[i + 1] as number) - (path.travelYaw[i] as number)) * f;
  const tp = (path.travelPitch[i] as number) + ((path.travelPitch[i + 1] as number) - (path.travelPitch[i] as number)) * f;
  const a = smoothstep(0, 0.35, u), b = smoothstep(0.65, 1, u);
  const yaw = ty - path.turnIn * (1 - a) + path.turnOut * b;
  const pitch = tp - path.pitchIn * (1 - a) + path.pitchOut * b;
  const cp = Math.cos(pitch);
  scratch[0] = Math.cos(yaw) * cp; scratch[1] = Math.sin(pitch); scratch[2] = -Math.sin(yaw) * cp;
  for (let k2 = 0; k2 < 3; k2++) out.target[k2] = (out.position[k2] as number) + (scratch[k2] as number) * LOOK_AHEAD_M;
  out.fov = from.fov + (to.fov - from.fov) * smoothstep(0, 1, u);
  out.stop = seg.stop;
  return out;
}

/** The segment index and time at which the tour holds stop `i` (for seeking). */
export function holdTime(tour: Tour, stop: number): number {
  const seg = tour.segments.find(s => s.kind === 'hold' && s.stop === stop);
  if (!seg) throw new Error(`no hold for stop ${stop}`);
  return seg.t0;
}
