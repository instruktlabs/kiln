// SPDX-License-Identifier: MIT
// The words of the tool panels, the tour's stop lines and follow-a-wafer (TASK-FF2 item 4). Every line is derived from
// the twin's state through its read-only views (fab.ts toolView, stockerView, lotView, kpis) and the route and tool
// data, recomputed each time the HUD refreshes; nothing is scripted. Pure (no three, React or DOM), so bun tests hold
// the lines to the state they describe.
import about from '../../data/about.json';
import type { FabData, TourFeatureData } from '../sim/data';
import type { E10State, FabSim, LotView, PlaceState, PortView } from '../sim/fab';
import { SIM_CONFIG } from '../sim/config';
import { STATE_ORDER } from './hud-text';

export interface InfoPanel { kind: 'tool' | 'stocker'; id: string; title: string; lines: string[] }
export interface FollowInfo { lot: number; title: string; lines: string[]; progress: number; done: boolean }
export interface LotChoice { id: number; label: string }

const LETTERS = about.stateLetters as Record<E10State, string>;
export const E10_WORDS: Record<E10State, string> = {
  PRODUCTIVE: 'Productive', STANDBY: 'Standby', ENGINEERING: 'Engineering', SCHEDULED_DOWN: 'Scheduled down',
  UNSCHEDULED_DOWN: 'Unscheduled down', NON_SCHEDULED: 'Non-scheduled',
};
const PORT_WORDS: Record<PlaceState, string> = {
  EMPTY: 'empty', RESERVED: 'reserved', LOADING: 'loading', DOCKING: 'docking', OPENING: 'opening', OPEN: 'open', CLOSING: 'closing',
  UNDOCKING: 'undocking', READY_TO_UNLOAD: 'ready to unload', UNLOADING: 'unloading', OCCUPIED: 'occupied', PASS_IN: 'passing in',
  WAIT_CRANE: 'waiting for the crane', PASS_OUT: 'passing out',
};
const FAMILY_WORDS: Record<string, string> = {
  clean: 'wet clean', furnace: 'furnace', cvd: 'CVD deposition', ald: 'ALD deposition', duv: 'DUV litho', euv: 'EUV litho',
  metrology: 'metrology', etch: 'etch', cmp: 'CMP', implant: 'ion implant', pvd: 'PVD metallisation', probe: 'wafer sort',
};
const CRANE_WORDS = { IDLE: 'idle', MOVING: 'moving', FORK: 'handling a FOUP' } as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A vehicle's pose scratch for the fleet line, and the speed above which it counts as moving. */
const FLEET_POSE = new Float64Array(8), MOVING_MPS = 0.05;
/** A duration in whole minutes, or hours and minutes. */
export function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}
/** The short name of a port or seat within its owner: etch-03.lp2 is lp2. */
const portName = (id: string) => id.slice(id.lastIndexOf('.') + 1);
/** The owner of a place: etch-03.lp2 belongs to etch-03, uts-n04.a to uts-n04. */
const ownerOf = (id: string) => id.slice(0, id.lastIndexOf('.')) || id;

export interface PanelContext {
  sim: FabSim; data: FabData;
  /** Tool id (a cell's track or scanner, or the cell) to resource index. */
  resOf: Map<string, number>;
  /** Stocker id to stocker index. */
  stockerOf: Map<string, number>;
  bayOf: Map<string, string>;
}
export function panelContext(sim: FabSim, data: FabData): PanelContext {
  const resOf = new Map<string, number>();
  sim.res.forEach((r, ri) => { resOf.set(r.id, ri); for (const m of r.members) resOf.set(m, ri); });
  return {
    sim, data, resOf,
    stockerOf: new Map(data.tools.stockers.map((s, si) => [s.id, si])),
    bayOf: new Map(data.layout.tools.map(t => [t.id, t.bay])),
  };
}

function portsLine(ports: readonly PortView[]): string {
  return `Ports: ${ports.map(p => `${portName(p.id)} ${PORT_WORDS[p.state]}${p.lot >= 0 ? ` (lot ${p.lot})` : p.reservedFor >= 0 ? ` for lot ${p.reservedFor}` : ''}`).join(', ')}`;
}

/** The panel of a tool (a litho cell's track or scanner opens the cell's), or null when the id is not a tool. */
export function toolPanel(ctx: PanelContext, id: string): InfoPanel | null {
  const ri = ctx.resOf.get(id);
  if (ri === undefined) return null;
  const { sim, data } = ctx, v = sim.toolView(ri), now = sim.S.t, group = data.tools.groups[v.group];
  const lines = [v.members.length > 1 ? `${group?.label ?? v.group}: ${v.members.join(' and ')}` : `${group?.label ?? v.group}, bay ${ctx.bayOf.get(v.id) ?? '?'}`];
  let state = `${E10_WORDS[v.state]} (${LETTERS[v.state]}) for ${duration(now - v.since)}`;
  if (v.downUntil > now) state += `, planned back in ${duration(v.downUntil - now)}`;
  if (!v.scheduled) state += ', held out of the schedule';
  lines.push(state);
  if (v.processing.length === 0) lines.push('No lot processing');
  else if (v.batch) lines.push(`Batch of ${plural(v.processing.length, 'lot')} in the tube, ${duration(v.endsAt - now)} left`);
  else {
    const lot = sim.lotView(v.processing[0] as number);
    lines.push(lot ? `Processing lot ${lot.id} (${lot.lotClass}), step ${lot.step + 1} of ${lot.steps}, ${duration(v.endsAt - now)} left` : 'No lot processing');
  }
  let queue = `Queue ${plural(v.queued, 'lot')}`;
  if (v.ready) queue += `, ${v.ready} ${v.batch ? 'in the buffer' : 'at the ports'}`;
  if (v.done) queue += `, ${v.done} done waiting to leave`;
  lines.push(queue, portsLine(v.ports));
  return { kind: 'tool', id: v.id, title: v.id, lines };
}

/** The panel of a stocker, or null when the id is not a stocker. */
export function stockerPanel(ctx: PanelContext, id: string): InfoPanel | null {
  const si = ctx.stockerOf.get(id);
  if (si === undefined) return null;
  const v = ctx.sim.stockerView(si);
  const lines = [`Stocker: ${v.used} of ${v.usable} slots in use`, `Crane ${CRANE_WORDS[v.crane]}${v.jobs ? `, ${plural(v.jobs, 'job')} queued` : ''}`];
  if (v.manual) lines.push(`${plural(v.manual, 'lot')} at the manual port`);
  if (v.waiting) lines.push(`${plural(v.waiting, 'lot')} waiting for a port`);
  lines.push(portsLine(v.ports));
  return { kind: 'stocker', id: v.id, title: v.id, lines };
}

export function panelFor(ctx: PanelContext, id: string): InfoPanel | null { return toolPanel(ctx, id) ?? stockerPanel(ctx, id); }

function placeWords(v: LotView): string {
  if (v.placeKind === 'load') return `${ownerOf(v.at)} port ${portName(v.at)}`;
  if (v.placeKind === 'uts') return `under-track shelf ${ownerOf(v.at)}`;
  if (v.placeKind === 'stocker') return `the ${ownerOf(v.at)} port`;
  return v.at;
}

/** Where a lot is and what it waits for, as one line. */
export function lotWhere(ctx: PanelContext, v: LotView): string {
  const now = ctx.sim.S.t;
  switch (v.state) {
    case 'PROCESSING': {
      const ri = v.tool ? ctx.resOf.get(v.tool) : undefined, end = ri !== undefined ? ctx.sim.toolView(ri).endsAt : -1;
      return `Processing at ${v.tool}${end > now ? `, ${duration(end - now)} left` : ''}`;
    }
    case 'AT_PORT': return v.loc === 'buffer' ? `In the ${v.at} buffer, waiting for a batch` : `At ${placeWords(v)}, waiting to start`;
    case 'DONE_AT_TOOL': return `Done at ${placeWords(v)}, waiting for a vehicle`;
    case 'IN_TRANSIT':
      if (v.loc === 'vehicle') return `Riding vehicle ${v.vehicle + 1}${v.dest ? ` to ${ownerOf(v.dest)}` : ''}`;
      if (v.loc === 'crane') return `On the ${v.at} crane`;
      return `Passing through ${placeWords(v)}`;
    case 'QUEUED': return v.loc === 'slot' ? `Stored in ${v.at}, queued for ${v.tool}` : `Queued for ${v.tool} at ${placeWords(v)}`;
    case 'WAIT_MOVE':
      if (v.loc === 'manual') return `At the ${v.at} manual port${v.ship ? ', waiting to ship' : ''}`;
      if (v.loc === 'slot') return `Stored in ${v.at}`;
      return `Waiting for a vehicle at ${placeWords(v)}${v.dest ? ` to ${ownerOf(v.dest)}` : ''}`;
    case 'COMPLETE':
      if (v.loc === 'manual') return `At the ${v.at} manual port, waiting to ship`;
      if (v.loc === 'vehicle') return `Complete, riding vehicle ${v.vehicle + 1} to ${v.dest ? ownerOf(v.dest) : 'a stocker'}`;
      return `Complete, going to ship from ${v.loc === 'place' ? placeWords(v) : v.at}`;
  }
}

/** Follow-a-wafer's HUD for lot `id`: its step on the route, where it is, and route progress. */
export function followInfo(ctx: PanelContext, id: number): FollowInfo {
  const { sim, data } = ctx, v = sim.lotView(id);
  if (!v) return { lot: id, title: `Lot ${id}`, lines: ['Shipped: the lot has left the fab'], progress: 1, done: true };
  const now = sim.S.t, step = data.route.route[v.step];
  const lines = [step
    ? `Step ${v.step + 1} of ${v.steps}: ${FAMILY_WORDS[step[0]] ?? step[0]}, ${data.route.modules[step[1]]?.name ?? `module ${step[1] + 1}`}`
    : `All ${v.steps} steps done`];
  lines.push(lotWhere(ctx, v), `${Math.floor((100 * Math.min(v.step, v.steps)) / v.steps)}% of the route, ${duration(now - v.released)} since release`);
  return { lot: id, title: `Lot ${id} (${v.lotClass})`, lines, progress: Math.min(v.step, v.steps) / v.steps, done: false };
}

/** Lots worth following, from the twin's state: hot lots first, then lots riding a vehicle, then lots processing, then
 *  the rest, lowest id first within each; at most `limit`. */
export function lotChoices(ctx: PanelContext, limit = 6): LotChoice[] {
  const rank = (v: LotView) => (v.lotClass === 'hot' ? 0 : v.loc === 'vehicle' ? 1 : v.state === 'PROCESSING' ? 2 : 3);
  const views = ctx.sim.lots().map(l => ctx.sim.lotView(l.id)).filter((v): v is LotView => !!v);
  views.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  return views.slice(0, limit).map(v => {
    const where = lotWhere(ctx, v);
    return { id: v.id, label: `Lot ${v.id}, ${v.lotClass}, step ${Math.min(v.step + 1, v.steps)} of ${v.steps}: ${where.charAt(0).toLowerCase()}${where.slice(1)}` };
  });
}

/** A tour stop's lines for its feature: the fab at a glance, the fleet, a tool or stocker panel, the output, the tools. */
export function tourStopLines(ctx: PanelContext, feature: TourFeatureData): string[] {
  const { sim } = ctx, k = sim.kpis();
  switch (feature.lines) {
    case 'fab': return [`WIP ${plural(k.wipLots, 'lot')}, ${Math.round(k.movesPerHour)} moves an hour`, `${plural(k.lotsOutToday, 'lot')} out today`, `Vehicles busy ${k.vehiclesBusy} of ${k.vehiclesTotal}`];
    case 'fleet': {
      // What each vehicle does now: a convoy vehicle registers its wait for the next block while it still moves on its
      // authority, so only one standing still (its plan's speed at the twin's time) is stopped for the block ahead.
      let alive = 0, carrying = 0, moving = 0, stopped = 0, handing = 0, parked = 0, synthetic = 0;
      sim.S.vehicles.forEach((v, i) => {
        if (!v.alive) return;
        alive++;
        if (v.syn) synthetic++;
        if (v.lot >= 0) carrying++;
        const st = sim.vehicleState(i);
        if (st === 'HANDOFF_PICK' || st === 'HANDOFF_DROP') handing++;
        else if (sim.vehiclePose(i, sim.S.t, FLEET_POSE) && (FLEET_POSE[5] as number) > MOVING_MPS) moving++;
        else if (st === 'WAIT_BLOCK') stopped++;
        else parked++;
      });
      const lines = [`${plural(alive, 'vehicle')} on the rails, ${carrying} carrying lots`,
        `${moving} moving, ${stopped} stopped for the block ahead, ${handing} handing a FOUP over${parked ? `, ${parked} parked` : ''}`];
      if (synthetic) lines.push(`${synthetic} of them ${SIM_CONFIG.modes.megafab.syntheticLabel}`);
      return lines;
    }
    case 'tool': case 'stocker': {
      const panel = panelFor(ctx, feature.subject);
      return panel ? [panel.title, ...panel.lines] : [];
    }
    case 'outputs': return [`${plural(k.lotsOutToday, 'lot')} out today`, `Cycle time ${k.cycleTimeDays.toFixed(1)} days, X-factor ${k.xFactor.toFixed(1)}`, `WIP ${plural(k.wipLots, 'lot')}`];
    case 'tools': {
      const down = sim.res.flatMap((r, ri) => {
        const st = sim.toolState(ri);
        return st === 'UNSCHEDULED_DOWN' || st === 'SCHEDULED_DOWN' ? [`${r.id} (${LETTERS[st]})`] : [];
      });
      return [`Tools ${STATE_ORDER.map(st => `${LETTERS[st]} ${k.toolCounts[st] ?? 0}`).join('  ')}`, down.length ? `Down now: ${down.join(', ')}` : 'No tool down now'];
    }
  }
}
