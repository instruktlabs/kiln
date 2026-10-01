// D-21: the fab's truth is data. Sim-spec 12 tests 1 (seats under rails) and 2 (the rail graph) run on
// data/rail-graph.json; the other checks hold the tool set, the route and the generated files to the spec.
import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { FAB_DATA } from '../../src/sim/data';
import type { GraphEdgeData, Vec3 } from '../../src/sim/data';
import { LANDING_CAMERA } from '../../src/landing-camera';

const PACKAGE = resolve(import.meta.dir, '../..');
const SCENES = resolve(PACKAGE, '../..');
const { graph, tools, route, layout } = FAB_DATA;
const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

/** Point and unit tangent (x, z) of an edge at its start (u = 0) or end (u = 1). */
function edgeEnd(e: GraphEdgeData, u: 0 | 1): { p: Vec3; tx: number; tz: number } {
  const g = e.geometry;
  if (g.type === 'line') {
    const dx = g.to[0] - g.from[0], dz = g.to[2] - g.from[2], len = Math.hypot(dx, dz);
    return { p: u === 0 ? g.from : g.to, tx: dx / len, tz: dz / len };
  }
  const a = ((g.startDeg + g.sweepDeg * u) * Math.PI) / 180, sgn = Math.sign(g.sweepDeg);
  return {
    p: [g.center[0] + g.radius * Math.cos(a), g.center[1], g.center[2] + g.radius * Math.sin(a)],
    tx: -Math.sin(a) * sgn, tz: Math.cos(a) * sgn,
  };
}

describe('sim-spec 12 test 1: seats under rails', () => {
  test('every seat is within 5 mm (X and Z) of its rail port node, at Y 0.90 (load, stocker) or 3.20 (UTS)', () => {
    expect(graph.ports.length).toBe(175);
    for (const p of graph.ports) {
      const n = nodeById.get(p.node);
      expect(n, p.id).toBeDefined();
      if (!n) continue;
      expect(Math.abs(n.position[0] - p.seat[0]), p.id).toBeLessThanOrEqual(0.005);
      expect(Math.abs(n.position[2] - p.seat[2]), p.id).toBeLessThanOrEqual(0.005);
      expect(p.seat[1], p.id).toBeCloseTo(p.kind === 'uts' ? 3.2 : 0.9, 6);
    }
  });

  test('each load and stocker port lies on the right of the direction of travel; UTS seats hang under the rail', () => {
    const owners = new Map<string, Vec3>([...tools.tools.map(t => [t.id, t.position] as const), ...tools.stockers.map(s => [s.id, s.position] as const)]);
    for (const p of graph.ports) {
      if (p.kind === 'uts') { expect(p.side, p.id).toBe('under'); continue; }
      expect(p.side, p.id).toBe('right');
      const owner = owners.get(p.owner), n = nodeById.get(p.node);
      expect(owner, p.id).toBeDefined();
      if (!owner || !n) continue;
      // North-up top view, +X right, +Z down: the right of heading (hx, hz) is (-hz, hx).
      const dx = owner[0] - n.position[0], dz = owner[2] - n.position[2];
      expect(dx * -p.heading[2] + dz * p.heading[0], p.id).toBeGreaterThan(0);
    }
  });
});

describe('sim-spec 12 test 2: rail graph', () => {
  test('strongly connected: every node reaches every other', () => {
    const out = new Map<string, string[]>(), back = new Map<string, string[]>();
    for (const e of graph.edges) {
      out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
      back.set(e.to, [...(back.get(e.to) ?? []), e.from]);
    }
    const reach = (adj: Map<string, string[]>) => {
      const seen = new Set([graph.nodes[0]?.id as string]), stack = [...seen];
      while (stack.length) for (const m of adj.get(stack.pop() as string) ?? []) if (!seen.has(m)) { seen.add(m); stack.push(m); }
      return seen.size;
    };
    expect(reach(out)).toBe(graph.nodes.length);
    expect(reach(back)).toBe(graph.nodes.length);
  });

  test('piece joints meet within 1 mm and tangents match within 1 degree', () => {
    const tangents = new Map<string, [number, number][]>();
    let worstGap = 0, worstDeg = 0;
    for (const e of graph.edges) {
      for (const u of [0, 1] as const) {
        const end = edgeEnd(e, u), n = nodeById.get(u === 0 ? e.from : e.to);
        expect(n, e.id).toBeDefined();
        if (!n) continue;
        worstGap = Math.max(worstGap, Math.hypot(end.p[0] - n.position[0], end.p[1] - n.position[1], end.p[2] - n.position[2]));
        tangents.set(n.id, [...(tangents.get(n.id) ?? []), [end.tx, end.tz]]);
      }
    }
    for (const list of tangents.values()) {
      const [a] = list as [[number, number]];
      for (const b of list) worstDeg = Math.max(worstDeg, (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1])) * 180) / Math.PI);
    }
    expect(worstGap).toBeLessThanOrEqual(0.001);
    expect(worstDeg).toBeLessThanOrEqual(1);
  });

  test('edge lengths match their geometry and the graph totals', () => {
    let total = 0;
    for (const e of graph.edges) {
      const g = e.geometry;
      const len = g.type === 'line' ? Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1], g.to[2] - g.from[2]) : (Math.abs(g.sweepDeg) * Math.PI * g.radius) / 180;
      expect(Math.abs(len - e.length), e.id).toBeLessThan(0.001);
      total += e.length;
    }
    expect(Math.abs(total - graph.counts.lengthM)).toBeLessThan(0.01);
  });
});

describe('the tool set and the route', () => {
  test('42 tools (38 process tools and 4 tracks), 4 litho cells, 2 stockers, 32 UTS shelves', () => {
    expect(tools.tools.length).toBe(42);
    expect(tools.tools.filter(t => t.type === 'coater-developer-track').length).toBe(4);
    expect(tools.tools.filter(t => t.cell !== undefined).length).toBe(8);
    expect(tools.cells.length).toBe(4);
    expect(tools.stockers.length).toBe(2);
    expect(tools.uts.length).toBe(32);
    expect(new Set(tools.tools.map(t => t.id)).size).toBe(42);
    const ports = new Set(graph.ports.map(p => p.id));
    for (const t of tools.tools) for (const p of t.ports) expect(ports.has(p), `${t.id} ${p}`).toBe(true);
    for (const s of tools.stockers) for (const p of s.ports) expect(ports.has(p), `${s.id} ${p}`).toBe(true);
  });

  test('the 240-step route has the passes of sim-spec 4 and 137 h of raw process time', () => {
    expect(route.steps).toBe(240);
    expect(route.route.length).toBe(240);
    expect(route.passes).toEqual({ clean: 40, furnace: 6, cvd: 24, duv: 24, metrology: 35, etch: 38, cmp: 17, implant: 10, euv: 18, ald: 11, pvd: 16, probe: 1 });
    expect(Math.round(route.rawProcessHours)).toBe(137);
  });

  test('the landing camera is the gallery view of sim-spec 10, and the page opens on it before the pack loads', () => {
    // Through the middle of glazed panel wall-s-11 from the walk start: a segment's own eye point falls on a wall mullion.
    expect(layout.cameras.landing.position).toEqual([1.8, 1.6, 25.4]);
    expect(layout.cameras.landing.position).toEqual([layout.cameras.walk.start.position[0], layout.cameras.walk.eyeY, layout.cameras.walk.start.position[2]]);
    expect(layout.cameras.landing.target).toEqual([0, 3, 10.2]);
    expect(LANDING_CAMERA).toEqual({ position: layout.cameras.landing.position, fov: layout.cameras.landing.fov });
  });

  // Measured 0.1 s for the three generators on this PC under load; budget 60 s for a cold start.
  test('generated files are current (layout, rail graph, tables)', () => {
    for (const script of ['build-layout.ts', 'build-rail-graph.ts', 'build-tables.ts']) {
      const run = Bun.spawnSync([process.execPath, resolve(PACKAGE, 'scripts', script), '--check'], { cwd: SCENES, stdout: 'pipe', stderr: 'pipe' });
      expect(`${script}: exit ${run.exitCode} ${run.stdout.toString().slice(0, 200)}`).toBe(`${script}: exit 0 ${run.stdout.toString().slice(0, 200)}`);
      expect(run.stdout.toString()).not.toContain('"stale":true');
    }
  }, 60_000);
});
