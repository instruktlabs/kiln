// Tool panels, the tour's stop lines and follow-a-wafer (TASK-FF2 item 4): every line restates the twin's read-only
// views (toolView, stockerView, lotView, kpis) and the route data, the same state gives the same words and a later
// state gives later words; nothing is scripted. Tap-to-inspect: a ray from each tour stop to its subject opens that
// subject's panel. The follow camera stays out of tool bodies and inside the fab floor's room.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFab, FAB_DATA, HOUR_MS } from '../../src/sim/index';
import type { LotView } from '../../src/sim/fab';
import { duration, E10_WORDS, followInfo, lotChoices, lotWhere, panelContext, panelFor, stockerPanel, tourStopLines } from '../../src/scene/panels';
import type { PanelContext } from '../../src/scene/panels';
import { obstructionDistance, pickBoxes, pickRay, rayBox, roomLimits } from '../../src/scene/picking';
import { FOLLOW, followOffset, followPlaces, preferredYaw } from '../../src/scene/follow';
import type { Vec3 } from '../../src/sim/data';

const PACKAGE = resolve(import.meta.dir, '../..');
const WARM = readFileSync(resolve(PACKAGE, 'data/warm/seed-1.json'), 'utf8');
const { layout, route } = FAB_DATA;
const IDS = [...layout.tools.map(t => t.id), ...layout.stockers.map(s => s.id)];

/** The warm start (day 30, megafab) stepped `hours` on. */
function fabAt(hours: number) {
  const fab = createFab({ snapshot: WARM, mode: 'megafab' });
  fab.step(fab.now() + hours * HOUR_MS);
  return fab;
}
const words = (ctx: PanelContext) => IDS.map(id => { const p = panelFor(ctx, id); return p ? [p.title, ...p.lines].join(' | ') : null; });

describe('tool and stocker panels (from the twin state)', () => {
  const fab = fabAt(2), ctx = panelContext(fab.sim, FAB_DATA);

  test('every tool and stocker has a panel restating its view; a cell member opens its cell', () => {
    for (const t of layout.tools) {
      const panel = panelFor(ctx, t.id), ri = ctx.resOf.get(t.id);
      expect(panel, t.id).not.toBeNull();
      expect(ri, t.id).toBeDefined();
      const v = fab.sim.toolView(ri!), text = panel!.lines.join('\n');
      expect(panel!.id).toBe(v.id);
      if (t.cell) expect(panel!.id).toBe(t.cell);
      expect(text).toContain(`${E10_WORDS[v.state]} (`);
      expect(panel!.lines.some(line => line.startsWith(`Queue ${v.queued} lot`)), t.id).toBe(true);
      if (v.processing.length === 0) expect(panel!.lines).toContain('No lot processing');
      else if (v.batch) expect(text).toContain(`Batch of ${v.processing.length} lot`);
      else expect(text).toContain(`Processing lot ${v.processing[0]} (`);
      const ports = panel!.lines[panel!.lines.length - 1]!;
      expect(ports.startsWith('Ports: ')).toBe(true);
      for (const port of v.ports) expect(ports).toContain(port.id.slice(port.id.lastIndexOf('.') + 1));
    }
    for (const s of layout.stockers) {
      const v = fab.sim.stockerView(ctx.stockerOf.get(s.id)!), panel = stockerPanel(ctx, s.id)!;
      expect(panel.lines[0]).toBe(`Stocker: ${v.used} of ${v.usable} slots in use`);
      expect(panel.lines[1]!.startsWith('Crane ')).toBe(true);
    }
    expect(panelFor(ctx, 'no-such-tool')).toBeNull();
  });

  test('the same state gives the same words; an hour later the words have moved with the twin', () => {
    const a = fabAt(2), b = fabAt(2), ca = panelContext(a.sim, FAB_DATA), cb = panelContext(b.sim, FAB_DATA);
    const before = words(ca);
    expect(words(cb)).toEqual(before);
    expect(before).toEqual(words(ctx));
    a.step(a.now() + HOUR_MS); b.step(b.now() + HOUR_MS);
    const after = words(ca);
    expect(after).not.toEqual(before);
    expect(words(cb)).toEqual(after);
  });

  test('each tour stop has lines from the state; the tool and stocker stops repeat their panels', () => {
    const features = layout.cameras.tour.features;
    for (const [name, feature] of Object.entries(features)) {
      const lines = tourStopLines(ctx, feature);
      expect(lines.length, name).toBeGreaterThan(0);
      if (feature.lines === 'tool' || feature.lines === 'stocker') {
        const panel = panelFor(ctx, feature.subject)!;
        expect(lines).toEqual([panel.title, ...panel.lines]);
      }
    }
    const k = fab.sim.kpis();
    expect(tourStopLines(ctx, features.landing!)[0]).toBe(`WIP ${k.wipLots} lots, ${Math.round(k.movesPerHour)} moves an hour`);
    expect(tourStopLines(ctx, features.spine!)[0]).toMatch(/^\d+ vehicles on the rails, \d+ carrying lots$/);
  });

  test('the fleet line says what each vehicle is doing now (a registered wait for the next block is not a stop)', () => {
    // A vehicle in a convoy registers its wait for the block ahead while still moving on its authority: only one
    // standing still (its closed-form plan speed at the twin's time) is stopped for it.
    const feature = layout.cameras.tour.features.spine!, pose = new Float64Array(8);
    for (const at of [fabAt(0), fab]) {
      const sim = at.sim, c = panelContext(sim, FAB_DATA);
      let alive = 0, moving = 0, stopped = 0, handing = 0, parked = 0, registered = 0;
      sim.S.vehicles.forEach((v, i) => {
        if (!v.alive) return;
        alive++;
        const st = sim.vehicleState(i);
        if (st === 'WAIT_BLOCK') registered++;
        if (st === 'HANDOFF_PICK' || st === 'HANDOFF_DROP') handing++;
        else if (sim.vehiclePose(i, sim.S.t, pose) && (pose[5] as number) > 0.05) moving++;
        else if (st === 'WAIT_BLOCK') stopped++;
        else parked++;
      });
      const line = tourStopLines(c, feature)[1];
      expect(line).toBe(`${moving} moving, ${stopped} stopped for the block ahead, ${handing} handing a FOUP over${parked ? `, ${parked} parked` : ''}`);
      expect(moving + stopped + handing + parked).toBe(alive);
      expect(moving).toBeGreaterThan(0);
      expect(stopped).toBeLessThan(registered);
    }
  });

  test('durations read in minutes, or hours and minutes', () => {
    expect([0, 59, 60, 125, 24 * 60].map(m => duration(m * 60_000))).toEqual(['0 min', '59 min', '1 h', '2 h 05 min', '24 h']);
  });
});

describe('follow-a-wafer (from the lot view and the route)', () => {
  const fab = fabAt(2), ctx = panelContext(fab.sim, FAB_DATA);
  const rank = (v: LotView) => (v.lotClass === 'hot' ? 0 : v.loc === 'vehicle' ? 1 : v.state === 'PROCESSING' ? 2 : 3);

  test('the picker offers hot lots first, then lots riding a vehicle, then lots processing', () => {
    const choices = lotChoices(ctx, 6), views = choices.map(c => fab.sim.lotView(c.id)!);
    expect(choices.length).toBe(6);
    for (let i = 1; i < views.length; i++) expect(rank(views[i]!)).toBeGreaterThanOrEqual(rank(views[i - 1]!));
    views.forEach((v, i) => expect(choices[i]!.label.startsWith(`Lot ${v.id}, ${v.lotClass}, step ${Math.min(v.step + 1, v.steps)} of ${v.steps}: `)).toBe(true));
  });

  test('step, place and route progress restate the lot view as the lot moves; a shipped lot is done', () => {
    const lots = fab.sim.lots().map(l => l.id).slice(0, 40);
    const check = () => {
      for (const id of lots) {
        const v = fab.sim.lotView(id), info = followInfo(ctx, id);
        if (!v) { expect(info.done).toBe(true); continue; }
        expect(info.title).toBe(`Lot ${id} (${v.lotClass})`);
        if (v.step < v.steps) {
          const step = route.route[v.step]!;
          expect(info.lines[0]!.startsWith(`Step ${v.step + 1} of ${v.steps}: `)).toBe(true);
          expect(info.lines[0]!.endsWith(route.modules[step[1]]!.name)).toBe(true);
        } else expect(info.lines[0]).toBe(`All ${v.steps} steps done`);
        expect(info.lines[1]).toBe(lotWhere(ctx, v));
        expect(info.progress).toBeCloseTo(Math.min(v.step, v.steps) / v.steps, 12);
        expect(info.lines[2]!.startsWith(`${Math.floor((100 * Math.min(v.step, v.steps)) / v.steps)}% of the route, `)).toBe(true);
      }
    };
    check();
    const steps = lots.map(id => fab.sim.lotView(id)?.step ?? -1);
    fab.step(fab.now() + 3 * HOUR_MS);
    check();
    expect(lots.some((id, i) => (fab.sim.lotView(id)?.step ?? -1) !== steps[i])).toBe(true);
    expect(followInfo(ctx, 10_000_000)).toMatchObject({ done: true, progress: 1 });
  });
});

describe('tap to inspect and the follow camera', () => {
  const boxes = pickBoxes(layout), bodies = pickBoxes(layout, { ports: false }), room = roomLimits(layout, 0.3);
  const fab = fabAt(0), ctx = panelContext(fab.sim, FAB_DATA);

  test('boxes for every tool body, each of its load ports and every stocker', () => {
    expect([...new Set(boxes.map(b => b.id))]).toEqual(IDS);
    expect(boxes.length).toBe(IDS.length + layout.tools.reduce((n, t) => n + t.ports.length, 0));
    expect(bodies.map(b => b.id)).toEqual(IDS);
    for (const t of layout.tools) {
      const own = boxes.filter(x => x.id === t.id);
      expect(own[0]).toEqual({ id: t.id, kind: 'tool', min: t.footprint.min, max: t.footprint.max });
      t.ports.forEach((p, i) => {
        const b = own[i + 1]!;
        for (const k of [0, 1, 2] as const) { expect(p.seat[k]).toBeGreaterThanOrEqual(b.min[k]); expect(p.seat[k]).toBeLessThanOrEqual(b.max[k]); }
      });
    }
    expect(rayBox([0, 0, 0], [1, 0, 0], [2, -1, -1], [3, 1, 1])).toBe(2);
    expect(rayBox([0, 0, 0], [-1, 0, 0], [2, -1, -1], [3, 1, 1])).toBe(Infinity);
    expect(rayBox([2.5, 0, 0], [1, 0, 0], [2, -1, -1], [3, 1, 1])).toBe(0);
  });

  test('from each tour stop, a tap on its tool or stocker opens that panel', () => {
    for (const [name, feature] of Object.entries(layout.cameras.tour.features)) {
      if (feature.lines !== 'tool' && feature.lines !== 'stocker') continue;
      const o = layout.cameras[name as 'litho'].position, a = feature.anchor;
      const hit = pickRay(boxes, o, [a[0] - o[0], a[1] - o[1], a[2] - o[2]], 200);
      expect(hit, name).not.toBeNull();
      expect(panelFor(ctx, hit!.box.id)?.id, name).toBe(feature.subject);
    }
  });

  test('the follow camera stops at tool bodies, the floor, the FFU face and the walls, and sees over the aisle', () => {
    const t = layout.tools.find(x => x.id === 'etch-03')!, seat = t.ports[0]!.seat, foup: [number, number, number] = [seat[0], seat[1] + 0.2, seat[2]];
    // A FOUP at a load port stands outside its tool's body box, so the body stops a camera behind the tool.
    expect(bodies.some(b => foup.every((c, k) => c >= b.min[k]! && c <= b.max[k]!))).toBe(false);
    const body = bodies.find(b => b.id === t.id)!, behind: [number, number, number] = [t.position[0], foup[1], t.position[2]];
    const into = obstructionDistance(bodies, room, foup, behind);
    expect(into).toBeLessThan(Math.hypot(behind[0] - foup[0], behind[2] - foup[2]));
    expect(rayBox(foup, [behind[0] - foup[0], 0, behind[2] - foup[2]].map(c => c / Math.hypot(behind[0] - foup[0], behind[2] - foup[2])), body.min, body.max)).toBeCloseTo(into, 9);
    // Out over the aisle and up: clear.
    const out = Math.sign(seat[0] - t.position[0]);
    expect(obstructionDistance(bodies, room, foup, [foup[0] + out * 3, foup[1] + 1.4, foup[2] + 1])).toBe(Infinity);
    // Straight up: the FFU face less the pad; straight down: the raised floor plus the pad.
    expect(obstructionDistance(bodies, room, foup, [foup[0], 12, foup[2]])).toBeCloseTo(layout.heights.ffuFace! - 0.3 - foup[1], 9);
    expect(obstructionDistance(bodies, room, foup, [foup[0], -3, foup[2]])).toBeCloseTo(foup[1] - 0.3, 9);
    // Through the west wall.
    const west = obstructionDistance(bodies, room, [layout.cleanroom.x[0] + 2, 2, 0], [layout.cleanroom.x[0] - 5, 2, 0]);
    expect(west).toBeCloseTo(2 - 0.3, 9);
  });

  test('follow framing: from every place a lot can be, the camera starts on a clear side under the FFU face', () => {
    const places = followPlaces(layout), ffu = layout.heights.ffuFace!;
    const ports = [...layout.tools.flatMap(t => t.ports), ...layout.stockers.flatMap(st => [...st.ports, st.manualPort]), ...layout.uts.flatMap(u => u.seats)];
    for (const p of ports) expect(places.front.get(p.id), p.id).toEqual([p.seat[0], p.seat[1] + FOLLOW.foupMidM, p.seat[2]]);
    for (const t of layout.tools) if (t.ports.length) { expect(places.front.has(t.id)).toBe(true); expect(places.facing.has(t.id)).toBe(true); }
    for (const st of layout.stockers) expect(places.facing.get(st.id)).toEqual(st.facing);
    const inside = (q: readonly number[]) => bodies.some(b => q.every((c, k) => c > b.min[k]! && c < b.max[k]!));
    const aims: [string, Vec3][] = [...places.front].map(([id, aim]) => [id, aim]);
    // A FOUP riding a vehicle over each rail piece's middle.
    for (const piece of FAB_DATA.graph.pieces) aims.push([piece.id, [piece.position[0], layout.heights.vehicleFoupBase! + FOLLOW.foupMidM, piece.position[2]]]);
    const blocked: string[] = [];
    for (const [id, aim] of aims) {
      const v = { at: id } as never, yaw = preferredYaw(places, v, aim, [0, 30, 60]), offset = followOffset(bodies, room, layout, aim, yaw);
      const cam = [aim[0] + offset[0], aim[1] + offset[1], aim[2] + offset[2]];
      expect(cam[1]!, id).toBeLessThanOrEqual(ffu - 0.4 + 1e-9);
      expect(Math.hypot(offset[0], offset[2])).toBeCloseTo(FOLLOW.outM, 9);
      if (obstructionDistance(bodies, room, aim, cam) !== Infinity || inside(cam)) blocked.push(id);
    }
    expect(aims.length).toBeGreaterThan(300);
    expect(blocked).toEqual([]);
    // Facing first: a load port's camera stands on its aisle side.
    const port = layout.tools.find(t => t.id === 'etch-03')!.ports[1]!, aim = places.front.get(port.id)!;
    const off = followOffset(bodies, room, layout, aim, preferredYaw(places, { at: port.id } as never, aim, [0, 30, 60]));
    expect(off[0] * port.facing![0] + off[2] * port.facing![2]).toBeGreaterThan(0.5 * FOLLOW.outM);
  });
});
