// Sim-spec 12 test 4 (hand-off) on the accepted GLBs:
//   - at the end of HoistDown the carried FOUP's base is within 1 mm of the target seat, for every seat type: at all 175
//     ports through the vehicle GLB (the hoist at the clip time the scene's inverted table gives for the port's hoist
//     length, the FOUP hanging from foupGrip by its gripPoint), and in the running twin through foup-poses.ts at the
//     exact end of HoistDown of every hand-off over twelve hours of the pilot line from the stored day-30 state;
//   - during Dock, DoorOpen and DoorRemove (and back through DoorClose, DoorReplace and Undock) the FOUP and the doors
//     never interpenetrate the load-port frame: the GLBs posed as the scene poses them (the FOUP riding the stage, the
//     two door clips run together over the port's opening time), sampled at 101 points per phase, triangles tested for
//     crossings 0.1 mm deep or more (touching and seating contact pass).
// FF_SIMSPEC_EVIDENCE=1 writes evidence/sim-spec/ff2/handoff.json; otherwise the run is compared with it.
import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { foupPoseContext, foupPoses, foupYawForHeading } from '../../src/scene/foup-poses';
import type { FoupPose } from '../../src/scene/foup-poses';
import { hoistClipTime } from '../../src/scene/world/glb-world';
import { yawOf } from '../../src/scene/world/placements';
import { createFab, FAB_DATA, HOUR_MS } from '../../src/sim/index';
import { crossings } from './envelopes';
import { bakedEntity, GLBS_AVAILABLE, loadModels, MAP, PACKAGE, posedParts } from './fab-geometry';

const { graph, layout, config } = FAB_DATA;
const EVIDENCE = resolve(PACKAGE, 'evidence/sim-spec/ff3-floor/handoff.json');
const WRITE = process.env.FF_SIMSPEC_EVIDENCE === '1';
const MM = 0.001, EPS = 1e-4;
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const evidence: Record<string, unknown> = {};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

let models: Map<string, GLTF>;
beforeAll(async () => { if (GLBS_AVAILABLE) models = await loadModels(); });

describe.skipIf(!GLBS_AVAILABLE)('sim-spec 12 test 4: hand-off on the accepted geometry', () => {
  test('the vehicle GLB lowers the FOUP base to within 1 mm of every seat at the end of HoistDown', () => {
    const { model } = bakedEntity(models, 'vehicle');
    const at = hoistClipTime(model, 'HoistDown', model.clipSeconds('HoistDown'));
    const grip = model.locator('foupGrip')!, gripPos = new Vector3().setFromMatrixPosition(grip);
    const hoistRest = model.trackValue('HoistDown', 'hoist', 'position', 0) as number[];
    // foupGrip rides the hoist: its offset from the hoist node, fixed through the clip.
    const off = [gripPos.x - (hoistRest[0] as number), gripPos.y - (hoistRest[1] as number), gripPos.z - (hoistRest[2] as number)];
    const gripPoint = MAP.entities.foup!.locators!.gripPoint!;
    const nodes = new Map(graph.nodes.map(n => [n.id, n.position]));
    const worst: Record<string, { ports: number; maxErrorM: number; port: string }> = {};
    for (const p of graph.ports) {
      const node = nodes.get(p.node)!, t = at(p.hoistM), h = model.trackValue('HoistDown', 'hoist', 'position', t) as number[];
      const yaw = yawOf(p.heading[0], p.heading[2]), c = Math.cos(yaw), s = Math.sin(yaw);
      const lx = (h[0] as number) + (off[0] as number) - gripPoint[0], lz = (h[2] as number) + (off[2] as number) - gripPoint[2];
      const base = [node[0] + c * lx + s * lz, graph.datumY + (h[1] as number) + (off[1] as number) - gripPoint[1], node[2] - s * lx + c * lz];
      const err = Math.hypot(base[0]! - p.seat[0], base[1]! - p.seat[1], base[2]! - p.seat[2]);
      const w = (worst[p.kind] ??= { ports: 0, maxErrorM: 0, port: '' });
      w.ports++;
      if (err > w.maxErrorM) { w.maxErrorM = err; w.port = p.id; }
      expect(err, p.id).toBeLessThanOrEqual(MM);
    }
    evidence.glbHoist = {
      rule: 'vehicle root on the port node at the rail datum, turned to the rail heading; HoistDown at the clip time the scene\'s inverted table gives for the port\'s hoist length; FOUP base = foupGrip minus the FOUP\'s gripPoint',
      byKind: Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, { ports: v.ports, maxErrorM: r5(v.maxErrorM), worst: v.port }])),
    };
    expect(Object.keys(worst).sort()).toEqual(['load', 'stocker', 'uts']);
  });

  test('in the running twin the drawn FOUP sits on its seat at the end of every HoistDown', () => {
    const fab = createFab({ snapshot: readFileSync(resolve(PACKAGE, 'data/warm/seed-1.json'), 'utf8'), mode: 'pilot' });
    const sim = fab.sim, ctx = foupPoseContext(sim, FAB_DATA), out: FoupPose[] = [], scratch = new Float64Array(8), pose = new Float64Array(8);
    const end0 = (v: { ho: { place: number; t0: number } | null }) => {
      const tm = sim.placeInfo(v.ho!.place).kind === 'uts' ? config.vehicle.utsHandoff : config.vehicle.handoff;
      return v.ho!.t0 + tm.e84Ms + tm.hoistDownMs;
    };
    const tally: Record<string, { handoffs: number; maxBaseErrorM: number; maxHoistErrorM: number }> = {};
    let t = fab.now();
    const stop = t + 12 * HOUR_MS;
    while (t < stop) {
      let next = t + 1000;
      for (const v of sim.S.vehicles) if (v.alive && v.ho) { const e = end0(v); if (e > t && e < next) next = e; }
      fab.step(next);
      t = next;
      sim.S.vehicles.forEach((v, vi) => {
        if (!v.alive || !v.ho || end0(v) !== t) return;
        const place = sim.placeInfo(v.ho.place);
        expect(sim.vehiclePose(vi, t, pose)).toBe(true);
        const n = foupPoses(ctx, t, out, scratch), f = out.slice(0, n).find(q => q.vehicle === vi);
        expect(f, `${v.ho.kind} at ${place.id}`).toBeDefined();
        const baseErr = Math.hypot(f!.x - place.seat[0], f!.y - place.seat[1], f!.z - place.seat[2]);
        const hoistErr = Math.abs((pose[6] as number) - place.hoistM) + Math.abs((pose[1] as number) - graph.datumY);
        expect(baseErr, `${v.ho.kind} at ${place.id}`).toBeLessThanOrEqual(MM);
        expect(hoistErr, `${v.ho.kind} at ${place.id}`).toBeLessThanOrEqual(MM);
        const k = (tally[`${place.kind} ${v.ho.kind}`] ??= { handoffs: 0, maxBaseErrorM: 0, maxHoistErrorM: 0 });
        k.handoffs++;
        k.maxBaseErrorM = Math.max(k.maxBaseErrorM, baseErr);
        k.maxHoistErrorM = Math.max(k.maxHoistErrorM, hoistErr);
      });
    }
    evidence.twinHoist = {
      rule: 'pilot mode from the stored day-30 state for 12 simulated hours, stepped to the exact end of HoistDown of every hand-off; the FOUP pose from foup-poses.ts (what the scene draws) against the seat, and the vehicle\'s hoist against the port\'s hoist length',
      byKind: Object.fromEntries(Object.entries(tally).sort().map(([k, v]) => [k, { handoffs: v.handoffs, maxBaseErrorM: r5(v.maxBaseErrorM), maxHoistErrorM: r5(v.maxHoistErrorM) }])),
    };
    for (const kind of ['load drop', 'load pick', 'stocker drop', 'stocker pick', 'uts drop', 'uts pick']) expect(tally[kind]?.handoffs ?? 0, kind).toBeGreaterThan(0);
  }, 120_000);

  test('the FOUP and the doors never interpenetrate the load-port frame during Dock, DoorOpen and DoorRemove', () => {
    const port = MAP.entities.loadPort!, seat = port.locators!.foupSeat!;
    // Every load port turns its FOUP door toward the tool (the FOUP half a turn from the port) and its seat is the GLB's
    // foupSeat, so one port in its own frame stands for all 103.
    let seats = 0;
    for (const tool of layout.tools) for (const lp of tool.ports) {
      const g = graph.ports.find(q => q.id === lp.id)!, f = lp.facing ?? [1, 0, 0], py = yawOf(f[0], f[2]);
      expect(Math.abs(wrap(foupYawForHeading(g.heading[0], g.heading[2]) - py - Math.PI)), lp.id).toBeLessThan(1e-6);
      const m = lp.mount!, c = Math.cos(py), s = Math.sin(py);
      const want = [m[0] + c * seat[0] + s * seat[2], m[1] + seat[1], m[2] - s * seat[0] + c * seat[2]];
      expect(Math.hypot(want[0]! - g.seat[0], want[1]! - g.seat[1], want[2]! - g.seat[2]), lp.id).toBeLessThanOrEqual(MM);
      seats++;
    }
    expect(seats).toBe(103);

    const { model: portModel } = bakedEntity(models, 'loadPort'), { model: foupModel } = bakedEntity(models, 'foup');
    const S = (name: string, m: typeof portModel) => m.clipSeconds(name);
    // The world's FOUP rides the stage by the stage's X at the clip time (the stage rests at X 0, so that is its travel).
    expect(portModel.trackValue('Dock', 'stage', 'position', 0)[0]).toBe(0);
    const stageX = (clip: string, t: number) => portModel.trackValue(clip, 'stage', 'position', t)[0] as number;
    const identity = new Matrix4(), yawHalf = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI), one = new Vector3(1, 1, 1);
    const frameParts = ['frame', 'pedestal', 'statusPanel'];
    const cat = (...xs: (Float64Array | undefined)[]) => { const list = xs.filter((x): x is Float64Array => !!x); const o = new Float64Array(list.reduce((n, x) => n + x.length, 0)); let k = 0; for (const x of list) { o.set(x, k); k += x.length; } return o; };
    type Phase = { name: string; port: (f: number) => [string, number][]; foup: (f: number) => [string, number][]; dx: (f: number) => number; open: boolean };
    const dockS = S('Dock', portModel), undockS = S('Undock', portModel);
    const phases: Phase[] = [
      { name: 'Dock', port: f => [['Dock', f * dockS]], foup: () => [], dx: f => stageX('Dock', f * dockS), open: false },
      { name: 'DoorOpen + DoorRemove', port: f => [['Dock', dockS], ['DoorOpen', f * S('DoorOpen', portModel)]], foup: f => [['DoorRemove', f * S('DoorRemove', foupModel)]], dx: () => stageX('Dock', dockS), open: true },
      { name: 'DoorClose + DoorReplace', port: f => [['Dock', dockS], ['DoorClose', f * S('DoorClose', portModel)]], foup: f => [['DoorReplace', f * S('DoorReplace', foupModel)]], dx: () => stageX('Dock', dockS), open: true },
      { name: 'Undock', port: f => [['Undock', f * undockS]], foup: () => [], dx: f => stageX('Undock', f * undockS), open: false },
    ];
    const posed = (portClips: [string, number][], foupClips: [string, number][], dx: number, open: boolean) => {
      const pp = posedParts(models, 'loadPort', identity, { clips: portClips }, frameParts);
      const world = new Matrix4().compose(new Vector3(seat[0] + dx, seat[1], seat[2]), yawHalf, one);
      const fp = posedParts(models, 'foup', world, { clips: foupClips }, ['shell', 'topFlange', 'handles', 'baseplate']);
      return {
        frame: cat(...frameParts.map(n => pp.get(n))), portDoor: pp.get('portDoor')!, foupDoor: fp.get('door')!,
        foup: cat(fp.get('shell'), fp.get('topFlange'), fp.get('handles'), fp.get('baseplate'), fp.get('door'), open ? fp.get('waferStack') : undefined),
      };
    };
    const results: Record<string, { samples: number; foupFrame: number; portDoorFrame: number; foupDoorFrame: number; foupDoorPortDoor: number; stageTravelM: number[] }> = {};
    for (const ph of phases) {
      const r = (results[ph.name] = { samples: 0, foupFrame: 0, portDoorFrame: 0, foupDoorFrame: 0, foupDoorPortDoor: 0, stageTravelM: [Infinity, -Infinity] });
      for (let k = 0; k <= 100; k++) {
        const f = k / 100, dx = ph.dx(f), p = posed(ph.port(f), ph.foup(f), dx, ph.open);
        r.samples++;
        r.foupFrame += crossings(p.foup, p.frame, EPS).count;
        r.foupDoorFrame += crossings(p.foupDoor, p.frame, EPS).count;
        r.portDoorFrame += crossings(p.portDoor, p.frame, EPS).count;
        r.foupDoorPortDoor += crossings(p.foupDoor, p.portDoor, EPS).count;
        r.stageTravelM = [Math.min(r.stageTravelM[0]!, dx), Math.max(r.stageTravelM[1]!, dx)];
      }
    }
    // Control: the same check must see the frame. Push the docked, closed FOUP further toward the tool until its triangles
    // cross the frame's; the travel left over is the docked gap (to 0.1 mm, plus the 0.1 mm crossing depth).
    const docked = stageX('Dock', dockS), hitsAt = (extra: number) => {
      const p = posed([['Dock', dockS]], [], docked - extra, false);
      return crossings(p.foup, p.frame, EPS).count > 0;
    };
    expect(hitsAt(0)).toBe(false);
    expect(hitsAt(0.1), 'a FOUP pushed 0.1 m past its docked position crosses the frame').toBe(true);
    let lo = 0, hi = 0.1;
    while (hi - lo > 1e-4) { const mid = (lo + hi) / 2; if (hitsAt(mid)) hi = mid; else lo = mid; }
    evidence.loadPortSequence = {
      rule: 'the load port in its own frame, the FOUP on its foupSeat turned half a turn (door to the tool) and moved by the stage\'s X, clips posed as the scene poses them, 101 samples per phase; a crossing is a triangle edge through a triangle by 0.1 mm or more',
      frame: 'the load port\'s frame, pedestal and status panel (the stage carries the FOUP and the port door is tested against the frame)',
      phases: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ...v, stageTravelM: v.stageTravelM.map(r5) }])),
      foupDoorPortDoor: 'information only: the port door takes the FOUP door, so the two may touch or overlap; the spec asks for the frame',
      dockedGapToFrameM: Math.round(hi * 1e4) / 1e4,
    };
    for (const [name, r] of Object.entries(results)) {
      expect(r.samples, name).toBe(101);
      expect(r.foupFrame, `${name}: FOUP through the frame`).toBe(0);
      expect(r.foupDoorFrame, `${name}: FOUP door through the frame`).toBe(0);
      expect(r.portDoorFrame, `${name}: port door through the frame`).toBe(0);
    }
  }, 60_000);

  test('the record matches evidence/sim-spec/ff3-floor/handoff.json (FF2 retained)', () => {
    const record = { schema: 'foundry-floor.evidence.handoff/1', test: 'sim-spec 12 test 4', ...evidence };
    if (WRITE) {
      mkdirSync(dirname(EVIDENCE), { recursive: true });
      writeFileSync(EVIDENCE, `${JSON.stringify(record, null, 2)}\n`);
      return;
    }
    expect(existsSync(EVIDENCE)).toBe(true);
    expect(record).toEqual(JSON.parse(readFileSync(EVIDENCE, 'utf8')));
  });
});
