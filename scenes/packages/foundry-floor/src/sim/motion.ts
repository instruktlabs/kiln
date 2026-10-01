// SPDX-License-Identifier: MIT
// Analytic motion (sim-spec 8): vehicles hold constant-acceleration pieces that the scene evaluates in closed
// form at any fractional sim time. Planning uses only +, -, x, / and a fixed-iteration Newton square root, so
// every engine computes identical pieces.

/** One constant-acceleration piece: start time t (ms, fractional), duration d (s), start position s (m),
 *  start speed v (m/s) and acceleration a (m/s^2). */
export interface Piece {
  t: number;
  d: number;
  s: number;
  v: number;
  a: number;
}

/** A stretch of path with one speed limit. */
export interface Segment {
  len: number;
  lim: number;
}

/** Square root by scaling into [1, 4) with exact powers of four, then six Newton steps. */
export function dsqrt(x: number): number {
  if (!(x > 0)) return 0;
  let y = x, scale = 1;
  while (y >= 4) { y /= 4; scale *= 2; }
  while (y < 1) { y *= 4; scale /= 2; }
  let r = (1 + y) / 2;
  for (let i = 0; i < 6; i++) r = (r + y / r) / 2;
  return r * scale;
}

export function stopDistance(v: number, dec: number): number {
  return (v * v) / (2 * dec);
}

/** Distance covered by a piece over its whole duration. */
export function pieceLength(p: Piece): number {
  return p.v * p.d + 0.5 * p.a * p.d * p.d;
}

export function planEnd(pieces: readonly Piece[], t0: number, s0: number): { t: number; s: number } {
  const last = pieces[pieces.length - 1];
  if (!last) return { t: t0, s: s0 };
  return { t: last.t + last.d * 1000, s: last.s + pieceLength(last) };
}

/**
 * Plans a stop at the end of `segs`, starting at time t0 (ms), position s0 and speed v0. Forward and backward
 * passes bound the speed at every segment boundary; each segment is then accelerate, cruise, decelerate.
 * Returns the pieces and whether the stop needed more than the service deceleration (never expected).
 */
export function planStop(t0: number, s0: number, v0: number, segs: readonly Segment[], acc: number, dec: number): { pieces: Piece[]; emergency: boolean } {
  const n = segs.length;
  const pieces: Piece[] = [];
  if (n === 0) return { pieces, emergency: v0 > 1e-6 };
  const vb = new Array<number>(n + 1);
  vb[0] = v0;
  for (let i = 0; i < n; i++) {
    const seg = segs[i] as Segment, next = segs[i + 1];
    const cap = next ? Math.min(seg.lim, next.lim) : 0;
    vb[i + 1] = Math.min(cap, dsqrt((vb[i] as number) * (vb[i] as number) + 2 * acc * seg.len));
  }
  vb[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    const reach = dsqrt((vb[i + 1] as number) * (vb[i + 1] as number) + 2 * dec * (segs[i] as Segment).len);
    if (reach < (vb[i] as number)) vb[i] = reach;
  }
  let t = t0, s = s0;
  if ((vb[0] as number) < v0 - 1e-9) {
    // Not enough room at the service rate for some boundary cap: brake at the smallest constant rate that meets
    // every cap, down to the binding boundary, then plan normally from there. A rate within 0.1% of the service
    // rate is rounding, not an emergency.
    let D = 0, rate = dec, bind = -1, bindD = 0;
    for (let j = 0; j < n; j++) {
      D += (segs[j] as Segment).len;
      const c = vb[j + 1] as number;
      if (D > 1e-12 && v0 > c) {
        const a = (v0 * v0 - c * c) / (2 * D);
        if (a > rate) { rate = a; bind = j; bindD = D; }
      }
    }
    if (bind < 0) {
      if (D <= 1e-9) return { pieces, emergency: v0 > 1e-6 };
    } else {
      const c = vb[bind + 1] as number, d = (v0 - c) / rate;
      pieces.push({ t, d, s, v: v0, a: -rate });
      const rest = planStop(t + d * 1000, s + bindD, c, segs.slice(bind + 1), acc, dec);
      return { pieces: pieces.concat(rest.pieces), emergency: rate > dec * 1.001 || rest.emergency };
    }
  }
  for (let i = 0; i < n; i++) {
    const seg = segs[i] as Segment;
    const vs = i === 0 ? v0 : (vb[i] as number), ve = vb[i + 1] as number;
    const lim = Math.max(seg.lim, vs, ve);
    const L = seg.len;
    if (L <= 1e-9) continue;
    let vp = dsqrt((2 * acc * dec * L + dec * vs * vs + acc * ve * ve) / (acc + dec));
    if (vp > lim) vp = lim;
    if (vp < vs) vp = vs;
    if (vp < ve) vp = ve;
    const segEnd = s + L;
    if (vp > vs) {
      const d = (vp - vs) / acc;
      pieces.push({ t, d, s, v: vs, a: acc });
      t += d * 1000;
      s += (vp * vp - vs * vs) / (2 * acc);
    }
    const dd = (vp * vp - ve * ve) / (2 * dec);
    const cruise = segEnd - dd - s;
    if (cruise > 1e-9 && vp > 1e-9) {
      const d = cruise / vp;
      pieces.push({ t, d, s, v: vp, a: 0 });
      t += d * 1000;
      s += cruise;
    }
    if (vp > ve) {
      const d = (vp - ve) / dec;
      pieces.push({ t, d, s, v: vp, a: -dec });
      t += d * 1000;
    }
    s = segEnd;
  }
  return { pieces, emergency: false };
}

function findPiece(pieces: readonly Piece[], t: number): number {
  let lo = 0, hi = pieces.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((pieces[mid] as Piece).t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Position and speed at time t (ms). Before the plan: its start; after it: stopped at its end. */
export function evalPlan(pieces: readonly Piece[], t: number, restS: number): { s: number; v: number } {
  if (pieces.length === 0) return { s: restS, v: 0 };
  const first = pieces[0] as Piece;
  if (t <= first.t) return { s: first.s, v: first.v };
  const p = pieces[findPiece(pieces, t)] as Piece;
  let tau = (t - p.t) / 1000;
  if (tau >= p.d) {
    const last = pieces[pieces.length - 1] as Piece;
    if (p === last) return { s: p.s + pieceLength(p), v: 0 };
    tau = p.d;
  }
  return { s: p.s + p.v * tau + 0.5 * p.a * tau * tau, v: p.v + p.a * tau };
}

/** The first time (ms) the plan reaches position x, or null if it stops short of it. */
export function timeAt(pieces: readonly Piece[], x: number): number | null {
  for (const p of pieces) {
    const len = pieceLength(p);
    if (x > p.s + len + 1e-9) continue;
    const dx = x - p.s;
    if (dx <= 0) return p.t;
    let tau: number;
    if (p.a === 0) tau = p.v > 0 ? dx / p.v : 0;
    else tau = (dsqrt(Math.max(0, p.v * p.v + 2 * p.a * dx)) - p.v) / p.a;
    if (tau < 0) tau = 0;
    if (tau > p.d) tau = p.d;
    return p.t + tau * 1000;
  }
  return null;
}

/** Start time (ms) of the uninterrupted braking that ends the plan, if it ends in braking. */
export function brakeStart(pieces: readonly Piece[]): number | null {
  let i = pieces.length - 1;
  if (i < 0 || (pieces[i] as Piece).a >= 0) return null;
  while (i > 0 && (pieces[i - 1] as Piece).a < 0) i--;
  return (pieces[i] as Piece).t;
}
