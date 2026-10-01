// SPDX-License-Identifier: MIT
// Generates data/rail-graph.json, the directed OHT rail graph, from data/layout.json (the rail plan:
// straight runs, curves and switches in travel order, and every seat) and the rail-kit piece dimensions
// the briefs define (straight 3.6 m with fillers scaled 0.25-1.0, curve radius 1.8 m over 90 degrees,
// switch 1.8 m with a diverge or merge branch). Nodes are rail joins, switch throats and one port node
// above every load-port seat, stocker port and UTS seat (sim-spec 3.3). Edges are one-way with a length,
// a speed limit and a piece. Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/build-rail-graph.ts [--write | --check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
type V3 = [number, number, number];
const q = (x: number) => { const v = Math.round(x * 10000) / 10000; return Object.is(v, -0) ? 0 : v; };
const qa = (x: number) => { const v = Math.round(x * 1e6) / 1e6; return Object.is(v, -0) ? 0 : v; };
function rotateY(yaw: number, p: readonly number[]): V3 { const t = yaw * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return [p[0]! * c + p[2]! * s, p[1]!, -p[0]! * s + p[2]! * c]; }
const add = (a: V3, b: readonly number[]): V3 => [q(a[0] + b[0]!), q(a[1] + b[1]!), q(a[2] + b[2]!)];

interface Layout {
  heights: { ohtRailDatum: number };
  rails: {
    datumY: number; kit: { straight: { length: number; fillerScale: [number, number] }; curve: { radius: number }; switch: { length: number } };
    speeds: { straight: { value: number }; curve: { value: number }; switch: { value: number } };
    runs: { id: string; from: V3; to: V3; spine: boolean }[];
    curves: { id: string; center: V3; radius: number; from: V3; to: V3; turn: 'left' | 'right' }[];
    switches: { id: string; bay: string; use: 'diverge' | 'merge'; origin: V3; yaw: number }[];
  };
  tools: { id: string; ports: { id: string; seat: V3; facing: V3 }[] }[];
  stockers: { id: string; facing: V3; ports: { id: string; seat: V3 }[] }[];
  uts: { id: string; seats: { id: string; seat: V3 }[] }[];
}
export function buildRailGraph(layout: Layout) {
  const R = layout.rails, Y = R.datumY, STRAIGHT = R.kit.straight.length;
  const nodes: { id: string; position: V3; kind: string; port?: string }[] = [], byKey = new Map<string, number>(), portNode = new Map<string, number>();
  const key = (p: V3) => `${Math.round(p[0] * 1000)},${Math.round(p[2] * 1000)}`;
  function node(p: V3, kind: string, port?: string): number {
    const k = key(p), found = byKey.get(k);
    if (found !== undefined) { const n = nodes[found]!; if (port) { if (n.port) throw new Error(`two ports at ${k}`); n.port = port; n.kind = 'port'; n.id = `p:${port}`; portNode.set(port, found); } else if (kind === 'throat') n.kind = 'throat'; return found; }
    nodes.push({ id: port ? `p:${port}` : `n${nodes.length}`, position: [q(p[0]), Y, q(p[2])], kind: port ? 'port' : kind, ...(port ? { port } : {}) });
    byKey.set(k, nodes.length - 1); if (port) portNode.set(port, nodes.length - 1); return nodes.length - 1;
  }
  type Geometry = { type: 'line'; from: V3; to: V3 } | { type: 'arc'; center: V3; radius: number; startDeg: number; sweepDeg: number };
  const edges: { id: string; from: number; to: number; length: number; speed: number; kind: string; piece: string; switch?: string; spine: boolean; geometry: Geometry }[] = [];
  const pieces: { id: string; type: 'straight' | 'curve' | 'switch'; position: V3; yaw: number; scaleX?: number; reversed?: boolean; use?: string; hide?: string[]; length: number }[] = [];

  // Every seat becomes a rail point directly above it.
  const ports: { id: string; kind: 'load' | 'stocker' | 'uts'; owner: string; seat: V3; point: V3; facing?: V3 }[] = [];
  for (const t of layout.tools) for (const p of t.ports) ports.push({ id: p.id, kind: 'load', owner: t.id, seat: p.seat, point: [p.seat[0], Y, p.seat[2]], facing: p.facing });
  for (const s of layout.stockers) for (const p of s.ports) ports.push({ id: p.id, kind: 'stocker', owner: s.id, seat: p.seat, point: [p.seat[0], Y, p.seat[2]], facing: s.facing });
  for (const u of layout.uts) for (const p of u.seats) ports.push({ id: p.id, kind: 'uts', owner: u.id, seat: p.seat, point: [p.seat[0], Y, p.seat[2]] });
  const placed = new Set<string>();

  // Straight runs: pieces of 3.6 m, a filler for any remainder, then port nodes split the pieces into edges.
  for (const run of R.runs) {
    const d = [run.to[0] - run.from[0], 0, run.to[2] - run.from[2]], L = Math.hypot(d[0]!, d[2]!), u = [d[0]! / L, 0, d[2]! / L];
    const yaw = q(Math.atan2(-u[2]!, u[0]!) * 180 / Math.PI);
    const full = Math.floor(L / STRAIGHT + 1e-6), rest = q(L - full * STRAIGHT);
    const cuts: { at: number; kind: string; port?: string }[] = [{ at: 0, kind: 'join' }];
    const pieceSpans: { from: number; to: number; id: string }[] = [];
    let at = 0;
    for (let i = 0; i < full; i++) { pieceSpans.push({ from: at, to: q(at + STRAIGHT), id: `${run.id}.${i + 1}` }); at = q(at + STRAIGHT); cuts.push({ at, kind: 'join' }); }
    if (rest > 1e-6) {
      const scale = rest / STRAIGHT;
      if (scale < R.kit.straight.fillerScale[0] - 1e-9 || scale > R.kit.straight.fillerScale[1] + 1e-9) throw new Error(`${run.id}: filler scale ${scale}`);
      pieceSpans.push({ from: at, to: q(L), id: `${run.id}.f` }); cuts.push({ at: q(L), kind: 'join' });
    }
    for (const span of pieceSpans) {
      const mid = (span.from + span.to) / 2, len = span.to - span.from;
      pieces.push({ id: span.id, type: 'straight', position: [q(run.from[0] + u[0]! * mid), Y, q(run.from[2] + u[2]! * mid)], yaw, ...(Math.abs(len - STRAIGHT) > 1e-6 ? { scaleX: qa(len / STRAIGHT) } : {}), length: q(len) });
    }
    for (const p of ports) {
      const rel = [p.point[0] - run.from[0], p.point[2] - run.from[2]], along = rel[0]! * u[0]! + rel[1]! * u[2]!, across = Math.abs(rel[0]! * u[2]! - rel[1]! * u[0]!);
      if (across < 0.001 && along > 1e-6 && along < L - 1e-6) { if (placed.has(p.id)) throw new Error(`port ${p.id} on two runs`); placed.add(p.id); cuts.push({ at: q(along), kind: 'port', port: p.id }); }
    }
    cuts.sort((a, b) => a.at - b.at || (a.port ? 1 : -1));
    const merged: typeof cuts = [];
    for (const c of cuts) { const last = merged[merged.length - 1]; if (last && Math.abs(last.at - c.at) < 0.0005) { if (c.port) { if (last.port) throw new Error(`ports ${last.port} and ${c.port} coincide`); last.port = c.port; last.kind = 'port'; } continue; } merged.push({ ...c }); }
    const ids = merged.map(c => node([run.from[0] + u[0]! * c.at, Y, run.from[2] + u[2]! * c.at], c.kind, c.port));
    for (let i = 0; i + 1 < merged.length; i++) {
      const a = merged[i]!.at, b = merged[i + 1]!.at, mid = (a + b) / 2, span = pieceSpans.find(s => mid > s.from && mid < s.to)!;
      edges.push({ id: `e${edges.length}`, from: ids[i]!, to: ids[i + 1]!, length: q(b - a), speed: R.speeds.straight.value, kind: 'straight', piece: span.id, spine: run.spine,
        geometry: { type: 'line', from: nodes[ids[i]!]!.position, to: nodes[ids[i + 1]!]!.position } });
    }
  }
  // Curves: one piece and one edge each. Right turn: piece origin at the entry, +X along the entry heading.
  // Left turn: the piece is traversed in reverse, so its origin is the exit and its +X points against the exit heading.
  for (const c of R.curves) {
    const a0 = Math.atan2(c.from[2] - c.center[2], c.from[0] - c.center[0]), a1 = Math.atan2(c.to[2] - c.center[2], c.to[0] - c.center[0]);
    let sweep = a1 - a0; while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
    if ((sweep > 0) !== (c.turn === 'right')) throw new Error(`${c.id}: turn direction`);
    const heading = (a: number, s: number): V3 => [-Math.sin(a) * Math.sign(s), 0, Math.cos(a) * Math.sign(s)];
    const hIn = heading(a0, sweep), hOut = heading(a1, sweep);
    const yawOf = (h: V3) => q(Math.atan2(-h[2], h[0]) * 180 / Math.PI);
    const right = c.turn === 'right';
    pieces.push({ id: c.id, type: 'curve', position: right ? [c.from[0], Y, c.from[2]] : [c.to[0], Y, c.to[2]], yaw: right ? yawOf(hIn) : yawOf([-hOut[0], 0, -hOut[2]]), ...(right ? {} : { reversed: true }), length: q(Math.abs(sweep) * c.radius) });
    edges.push({ id: `e${edges.length}`, from: node(c.from, 'join'), to: node(c.to, 'join'), length: q(Math.abs(sweep) * c.radius), speed: R.speeds.curve.value, kind: 'curve', piece: c.id, spine: c.id.startsWith('cu-spine'),
      geometry: { type: 'arc', center: [c.center[0], Y, c.center[2]], radius: c.radius, startDeg: qa(a0 * 180 / Math.PI), sweepDeg: qa(sweep * 180 / Math.PI) } });
  }
  // Switches: the main edge along local +X and the branch the placement uses (the other branch is hidden by node name).
  for (const s of R.switches) {
    const o = s.origin, at = (p: readonly number[]) => add(o, rotateY(s.yaw, p)), len = R.kit.switch.length, arc = Math.PI / 2 * len;
    const mainFrom = at([0, 0, 0]), mainTo = at([len, 0, 0]);
    pieces.push({ id: s.id, type: 'switch', position: [o[0], Y, o[2]], yaw: s.yaw, use: s.use, hide: s.use === 'diverge' ? ['branchMerge', 'gateMerge', 'lod1BranchMerge'] : ['branchDiverge', 'gateDiverge', 'lod1BranchDiverge'], length: len });
    const throat = node(s.use === 'diverge' ? mainFrom : mainTo, 'throat');
    const mainEdge = { id: `e${edges.length}`, from: s.use === 'diverge' ? throat : node(mainFrom, 'join'), to: s.use === 'diverge' ? node(mainTo, 'join') : throat, length: len, speed: R.speeds.switch.value, kind: 'switch-main', piece: s.id, switch: s.id, spine: true,
      geometry: { type: 'line' as const, from: mainFrom, to: mainTo } };
    edges.push(mainEdge);
    const center = s.use === 'diverge' ? at([0, 0, len]) : at([len, 0, len]);
    const bFrom = s.use === 'diverge' ? mainFrom : at([0, 0, len]), bTo = s.use === 'diverge' ? at([len, 0, len]) : mainTo;
    const a0 = Math.atan2(bFrom[2] - center[2], bFrom[0] - center[0]), a1 = Math.atan2(bTo[2] - center[2], bTo[0] - center[0]);
    let sweep = a1 - a0; while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
    edges.push({ id: `e${edges.length}`, from: s.use === 'diverge' ? throat : node(bFrom, 'join'), to: s.use === 'diverge' ? node(bTo, 'join') : throat, length: q(arc), speed: R.speeds.switch.value, kind: 'switch-branch', piece: s.id, switch: s.id, spine: false,
      geometry: { type: 'arc', center: [center[0], Y, center[2]], radius: len, startDeg: qa(a0 * 180 / Math.PI), sweepDeg: qa(sweep * 180 / Math.PI) } });
  }
  const unplaced = ports.filter(p => !placed.has(p.id));
  if (unplaced.length) throw new Error(`ports not under a straight run: ${unplaced.map(p => p.id).join(', ')}`);

  // Port records with the side of travel (the tool or stocker must stand on the right).
  const outEdge = (n: number) => edges.find(e => e.from === n)!;
  const portRecords = ports.map(p => {
    const n = portNode.get(p.id)!, e = outEdge(n), g = e.geometry as { type: 'line'; from: V3; to: V3 };
    if (Math.abs(nodes[n]!.position[0] - p.point[0]) > 0.001 || Math.abs(nodes[n]!.position[2] - p.point[2]) > 0.001) throw new Error(`port ${p.id} node drifted`);
    const h = [g.to[0] - g.from[0], g.to[2] - g.from[2]], hl = Math.hypot(h[0]!, h[1]!), right = [-h[1]! / hl, h[0]! / hl];
    let side = 'under';
    if (p.facing) { const dot = -p.facing[0] * right[0]! - p.facing[2] * right[1]!; side = dot > 0.99 ? 'right' : dot < -0.99 ? 'left' : 'oblique'; }
    return { id: p.id, kind: p.kind, owner: p.owner, node: nodes[n]!.id, seat: p.seat, hoistM: q(R.datumY - 0.9 - p.seat[1]), side, heading: [qa(h[0]! / hl), 0, qa(h[1]! / hl)] as V3 };
  });
  return { nodes, edges, pieces, ports: portRecords };
}

/** Strong connectivity by forward and reverse reachability from node 0. */
export function stronglyConnected(nodeCount: number, edges: { from: number; to: number }[]): boolean {
  const reach = (forward: boolean) => {
    const adj: number[][] = Array.from({ length: nodeCount }, () => []);
    for (const e of edges) (forward ? adj[e.from] : adj[e.to])!.push(forward ? e.to : e.from);
    const seen = new Uint8Array(nodeCount), stack = [0]; seen[0] = 1;
    while (stack.length) for (const n of adj[stack.pop()!]!) if (!seen[n]) { seen[n] = 1; stack.push(n); }
    return seen.every(v => v === 1);
  };
  return reach(true) && reach(false);
}

if (import.meta.main) {
  const layout = JSON.parse(readFileSync(resolve(ROOT, 'data/layout.json'), 'utf8')) as Layout;
  const g = buildRailGraph(layout);
  const out = {
    schema: 'foundry-floor.rail-graph/1',
    generatedBy: 'scripts/build-rail-graph.ts from data/layout.json and the rail-kit piece dimensions',
    basis: 'E (sim-spec 3.3 and 5); straight-rail speed C',
    datumY: layout.rails.datumY,
    conventions: { units: 'metres, metres per second, degrees', arc: 'point = center + radius (cos a, 0, sin a) for a = startDeg + sweepDeg * u / length; a positive sweep turns right (clockwise in a north-up top view)', side: 'the tool or stocker a port serves stands on the right of the direction of travel; UTS seats hang directly under the rail', hoistM: 'hoist travel from the carried position (FOUP base 0.90 m under the datum) to the seat' },
    counts: { nodes: g.nodes.length, edges: g.edges.length, ports: g.ports.length, pieces: { straight: g.pieces.filter(p => p.type === 'straight').length, curve: g.pieces.filter(p => p.type === 'curve').length, switch: g.pieces.filter(p => p.type === 'switch').length }, lengthM: q(g.edges.reduce((s, e) => s + e.length, 0)) },
    nodes: g.nodes.map(n => ({ id: n.id, kind: n.kind, position: n.position })),
    edges: g.edges.map(e => ({ id: e.id, from: g.nodes[e.from]!.id, to: g.nodes[e.to]!.id, length: e.length, speed: e.speed, kind: e.kind, piece: e.piece, ...(e.switch ? { switch: e.switch } : {}), spine: e.spine, geometry: e.geometry })),
    ports: g.ports,
    pieces: g.pieces,
  };
  if (!stronglyConnected(g.nodes.length, g.edges)) throw new Error('rail graph is not strongly connected');
  const text = JSON.stringify(out, null, 1) + '\n', path = resolve(ROOT, 'data/rail-graph.json');
  const check = process.argv.includes('--check');
  let stale = false;
  if (check) { let old = ''; try { old = readFileSync(path, 'utf8'); } catch { /* missing */ } stale = old !== text; }
  else writeFileSync(path, text);
  console.log(JSON.stringify({ ...out.counts, mode: check ? 'check' : 'write', stale, sides: Object.fromEntries(['right', 'left', 'under', 'oblique'].map(s => [s, g.ports.filter(p => p.side === s).length])) }));
  if (stale) process.exit(1);
}
