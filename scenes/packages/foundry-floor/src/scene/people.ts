// SPDX-License-Identifier: MIT
// People on the fab floor, drawn from the twin's service visits (FabSim.serviceVisits: repair, PM and qualification
// visits derived from tool state). The twin never waits for a walker (sim-spec 3.8 and the stub provider in
// sim/service.ts), so the walk is presentation: a person comes in through the fab door when the visit starts, walks
// the aisle path of layout.people at the class's walk speed, services the tool (repair, PM) or idles beside it
// (qualification), and walks out when the tool's state moves on. A PM followed by its qualification keeps one person
// when one class draws both kinds; with FF3's split the robot walks out after the PM and a technician walks in.
// Pure: no three, React or DOM, so bun tests check paths, timing and clip phases.
//
// Every people class sits behind PeopleSource: FF2 has the cleanroom technician; FF3's humanoid work robot is a
// second class with its own entity and clips, and sim-config gives it the PM and repair visits of the stub provider
// (the technician keeps the qualifications).
import type { ServiceKind, ServiceVisit } from '../sim/service';

export type Activity = 'walk' | 'idle' | 'service';
/** One drawn person: floor position, yaw (radians, three's rotation.y: the asset's +X is its facing), the activity
 *  and the seconds into that activity's clip. */
export interface PersonPose { key: string; x: number; z: number; yaw: number; activity: Activity; clipS: number }

export interface ServicePoint { at: readonly number[]; yaw: number; path: readonly (readonly number[])[]; lengthM: number }
export interface PeopleLayout {
  door: { panel: string; position: readonly number[]; inside: readonly number[] };
  serviceOutM: number;
  targets: Readonly<Record<string, ServicePoint>>;
}
/** A walker's clip timing (asset-map `people` and clip durations). The walk is baked in place for designSpeedMps. */
export interface WalkerSpec { speedMps: number; designSpeedMps: number; walkS: number; idleS: number; serviceS: number }

/** The interface every people class implements (the technician now, the humanoid in FF3). */
export interface PeopleSource {
  readonly id: string;
  /** Poses at sim time t; `loop(startMs, clipS)` gives the seconds into a looping clip under the presentation rules. */
  poses(t: number, out: PersonPose[], loop: (startMs: number, clipS: number) => number): number;
}

interface Route { pts: number[]; cum: number[]; total: number; point: ServicePoint }
interface Walker { tool: string; kind: ServiceKind; since: number; left: number | null; turnS: number }

/** Clip seconds of a walk after s metres: one cycle covers designSpeed x walkS metres, so the feet stay planted at
 *  any walking speed (the clip's rate is speed / designSpeed). */
export function walkClipS(s: number, spec: WalkerSpec): number {
  const stride = spec.designSpeedMps * spec.walkS;
  const r = s % stride;
  return ((r < 0 ? r + stride : r) / stride) * spec.walkS;
}

/** The walk routes: outside the door (serviceOutM beyond it), through it, then the target's aisle path. */
export function serviceRoutes(layout: PeopleLayout): Map<string, Route> {
  const [dx, , dz] = layout.door.position as [number, number, number], [ix, , iz] = layout.door.inside as [number, number, number];
  const len = Math.hypot(dx - ix, dz - iz) || 1;
  const outside = [dx + ((dx - ix) / len) * layout.serviceOutM, dz + ((dz - iz) / len) * layout.serviceOutM];
  const routes = new Map<string, Route>();
  for (const [tool, point] of Object.entries(layout.targets)) {
    const pts = [outside[0] as number, outside[1] as number, ...point.path.flatMap(p => [p[0] as number, p[1] as number])];
    const cum = [0];
    for (let i = 2; i < pts.length; i += 2) cum.push((cum[cum.length - 1] as number) + Math.hypot((pts[i] as number) - (pts[i - 2] as number), (pts[i + 1] as number) - (pts[i - 1] as number)));
    routes.set(tool, { pts, cum, total: cum[cum.length - 1] as number, point });
  }
  return routes;
}

/** Position and heading s metres along a route (clamped to its ends); heading is the travel direction's yaw. */
function along(r: Route, s: number, backwards: boolean, out: PersonPose): void {
  const d = Math.min(Math.max(s, 0), r.total);
  let i = 1;
  while (i < r.cum.length - 1 && (r.cum[i] as number) < d) i++;
  const a = r.cum[i - 1] as number, b = r.cum[i] as number, f = b > a ? (d - a) / (b - a) : 0;
  const x0 = r.pts[(i - 1) * 2] as number, z0 = r.pts[(i - 1) * 2 + 1] as number, x1 = r.pts[i * 2] as number, z1 = r.pts[i * 2 + 1] as number;
  out.x = x0 + (x1 - x0) * f;
  out.z = z0 + (z1 - z0) * f;
  const hx = backwards ? x0 - x1 : x1 - x0, hz = backwards ? z0 - z1 : z1 - z0;
  out.yaw = Math.atan2(-hz, hx);
}

/**
 * The cleanroom technicians: one per tool (or litho cell) with a visit, keyed by the visit's tool. `update` takes the
 * current visits each frame; a person whose visit ended walks out from the moment the tool's state moved on
 * (`endedAt`, the tool's state start), so opening the page mid-visit shows the person already at the tool.
 */
export class ServiceWalkers implements PeopleSource {
  readonly routes: Map<string, Route>;
  private readonly walkers = new Map<string, Walker>();

  /** `kinds`: the visit kinds this class draws (sim-config movers `visits`); every kind when omitted. */
  constructor(readonly id: string, layout: PeopleLayout, readonly spec: WalkerSpec, readonly capacity: number, readonly kinds?: ReadonlySet<ServiceKind>) {
    this.routes = serviceRoutes(layout);
  }

  /** Metres walked in from `since` by sim time t. */
  private walked(since: number, t: number): number { return ((t - since) / 1000) * this.spec.speedMps; }

  update(t: number, visits: readonly ServiceVisit[], endedAt: (tool: string) => number): void {
    const current = new Set<string>();
    for (const v of visits) {
      if (!this.routes.has(v.tool) || (this.kinds && !this.kinds.has(v.kind))) continue;
      current.add(v.tool);
      const w = this.walkers.get(v.tool);
      // A PM followed by its qualification is one visit for the person; a new failure after the walk-out began
      // starts a new walk from the door.
      if (!w || w.left !== null) this.walkers.set(v.tool, { tool: v.tool, kind: v.kind, since: v.since, left: null, turnS: 0 });
      else w.kind = v.kind;
    }
    for (const w of this.walkers.values()) {
      if (w.left === null && !current.has(w.tool)) {
        w.left = Math.max(endedAt(w.tool), w.since);
        const route = this.routes.get(w.tool) as Route;
        w.turnS = Math.min(this.walked(w.since, w.left), route.total);
      }
      if (w.left !== null && this.walked(w.left, t) >= w.turnS) this.walkers.delete(w.tool);
    }
  }

  poses(t: number, out: PersonPose[], loop: (startMs: number, clipS: number) => number): number {
    let n = 0;
    for (const w of this.walkers.values()) {
      if (n >= this.capacity) break;
      if (t < w.since) continue;
      const route = this.routes.get(w.tool) as Route;
      const p = out[n] ?? (out[n] = { key: '', x: 0, z: 0, yaw: 0, activity: 'walk', clipS: 0 });
      p.key = w.tool;
      if (w.left !== null && t >= w.left) {
        const back = this.walked(w.left, t);
        if (back >= w.turnS) continue;
        along(route, w.turnS - back, true, p);
        p.activity = 'walk';
        p.clipS = walkClipS(back, this.spec);
      } else {
        const s = this.walked(w.since, t);
        if (s < route.total) {
          along(route, s, false, p);
          p.activity = 'walk';
          p.clipS = walkClipS(s, this.spec);
        } else {
          const at = route.point.at;
          p.x = at[0] as number; p.z = at[2] as number; p.yaw = (route.point.yaw * Math.PI) / 180;
          const arrived = w.since + (route.total / this.spec.speedMps) * 1000;
          if (w.kind === 'qualification') { p.activity = 'idle'; p.clipS = loop(arrived, this.spec.idleS); }
          else { p.activity = 'service'; p.clipS = loop(arrived, this.spec.serviceS); }
        }
      }
      n++;
    }
    return n;
  }

  /** People currently tracked (drawn or walking out), for tests and stats. */
  count(): number { return this.walkers.size; }
}
