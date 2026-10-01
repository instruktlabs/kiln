// SPDX-License-Identifier: MIT
// The runtime rail graph (sim-spec 3.3 and 6): index arrays over data/rail-graph.json, blocks (every edge is a
// block; every switch is one exclusive block shared by its main and branch edges), and the all-pairs
// shortest-time table with next-hop edges (edge time = length / speed limit, plus 0.5 s per switch edge;
// ties go to the lower edge index). Geometry evaluation is for rendering only.
import type { ArcGeometry, GraphPortData, LineGeometry, RailGraphData, Vec3 } from './data';

export interface RuntimeGraph {
  n: number;
  e: number;
  nodeIds: string[];
  nodeIndex: Map<string, number>;
  nodePos: Vec3[];
  from: Int32Array;
  to: Int32Array;
  len: Float64Array;
  limit: Float64Array;
  /** Block id per edge: the edge index, or e + switch index for switch edges. */
  block: Int32Array;
  nBlocks: number;
  /** 1 for straights, curves and switch mains; 0 for switch branches. */
  main: Uint8Array;
  spine: Uint8Array;
  isSwitch: Uint8Array;
  out: number[][];
  inn: number[][];
  geometry: (LineGeometry | ArcGeometry)[];
  edgeIds: string[];
  /** Shortest time (s) from node u to node v at [u * n + v]. */
  cost: Float64Array;
  /** First edge on the shortest path from u to v at [u * n + v], or -1. */
  next: Int32Array;
  portNode: Map<string, number>;
  ports: Map<string, GraphPortData>;
}

const cache = new WeakMap<RailGraphData, RuntimeGraph>();

export function runtimeGraph(data: RailGraphData, switchPenaltyS: number): RuntimeGraph {
  const hit = cache.get(data);
  if (hit) return hit;
  const n = data.nodes.length, e = data.edges.length;
  const nodeIndex = new Map<string, number>();
  data.nodes.forEach((node, i) => nodeIndex.set(node.id, i));
  const from = new Int32Array(e), to = new Int32Array(e), len = new Float64Array(e), limit = new Float64Array(e);
  const block = new Int32Array(e), main = new Uint8Array(e), spine = new Uint8Array(e), isSwitch = new Uint8Array(e);
  const switchIndex = new Map<string, number>();
  const out: number[][] = Array.from({ length: n }, () => []), inn: number[][] = Array.from({ length: n }, () => []);
  data.edges.forEach((edge, i) => {
    const a = nodeIndex.get(edge.from), b = nodeIndex.get(edge.to);
    if (a === undefined || b === undefined) throw new Error(`edge ${edge.id} has an unknown node`);
    from[i] = a; to[i] = b; len[i] = edge.length; limit[i] = edge.speed;
    spine[i] = edge.spine ? 1 : 0;
    main[i] = edge.kind === 'switch-branch' ? 0 : 1;
    if (edge.switch) {
      isSwitch[i] = 1;
      let s = switchIndex.get(edge.switch);
      if (s === undefined) { s = switchIndex.size; switchIndex.set(edge.switch, s); }
      block[i] = e + s;
    } else block[i] = i;
    (out[a] as number[]).push(i);
    (inn[b] as number[]).push(i);
  });
  const edgeCost = new Float64Array(e);
  for (let i = 0; i < e; i++) edgeCost[i] = (len[i] as number) / (limit[i] as number) + (isSwitch[i] ? switchPenaltyS : 0);
  const cost = new Float64Array(n * n).fill(Infinity);
  const next = new Int32Array(n * n).fill(-1);
  // Dijkstra toward each target over reversed edges, with a binary heap on (distance, node).
  const dist = new Float64Array(n);
  const heapD: number[] = [], heapN: number[] = [];
  const push = (d: number, v: number) => {
    heapD.push(d); heapN.push(v);
    let i = heapD.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((heapD[p] as number) < d || ((heapD[p] as number) === d && (heapN[p] as number) <= v)) break;
      heapD[i] = heapD[p] as number; heapN[i] = heapN[p] as number; i = p;
    }
    heapD[i] = d; heapN[i] = v;
  };
  const pop = (): [number, number] => {
    const d = heapD[0] as number, v = heapN[0] as number;
    const ld = heapD.pop() as number, lv = heapN.pop() as number;
    if (heapD.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= heapD.length) break;
        const r = l + 1;
        const c = r < heapD.length && ((heapD[r] as number) < (heapD[l] as number) || ((heapD[r] as number) === (heapD[l] as number) && (heapN[r] as number) < (heapN[l] as number))) ? r : l;
        if ((heapD[c] as number) > ld || ((heapD[c] as number) === ld && (heapN[c] as number) > lv)) break;
        heapD[i] = heapD[c] as number; heapN[i] = heapN[c] as number; i = c;
      }
      heapD[i] = ld; heapN[i] = lv;
    }
    return [d, v];
  };
  for (let target = 0; target < n; target++) {
    dist.fill(Infinity);
    dist[target] = 0;
    push(0, target);
    while (heapD.length > 0) {
      const [d, v] = pop();
      if (d > (dist[v] as number)) continue;
      for (const ei of inn[v] as number[]) {
        const u = from[ei] as number, nd = d + (edgeCost[ei] as number);
        if (nd < (dist[u] as number)) { dist[u] = nd; push(nd, u); }
      }
    }
    for (let u = 0; u < n; u++) {
      cost[u * n + target] = dist[u] as number;
      if (u === target) continue;
      let best = -1, bestCost = Infinity;
      for (const ei of out[u] as number[]) {
        const c = (edgeCost[ei] as number) + (dist[to[ei] as number] as number);
        if (c < bestCost) { bestCost = c; best = ei; }
      }
      next[u * n + target] = best;
    }
  }
  const portNode = new Map<string, number>(), ports = new Map<string, GraphPortData>();
  for (const port of data.ports) {
    const idx = nodeIndex.get(port.node);
    if (idx === undefined) throw new Error(`port ${port.id} has no node`);
    portNode.set(port.id, idx);
    ports.set(port.id, port);
  }
  const graph: RuntimeGraph = {
    n, e, nodeIds: data.nodes.map(x => x.id), nodeIndex, nodePos: data.nodes.map(x => x.position),
    from, to, len, limit, block, nBlocks: e + switchIndex.size, main, spine, isSwitch, out, inn,
    geometry: data.edges.map(x => x.geometry), edgeIds: data.edges.map(x => x.id), cost, next, portNode, ports,
  };
  cache.set(data, graph);
  return graph;
}

/** Writes the point at distance u along edge ei into out[0..2] and the unit heading into out[3..5]. Rendering only. */
export function edgePoint(graph: RuntimeGraph, ei: number, u: number, out: Float64Array | number[]): void {
  const g = graph.geometry[ei] as LineGeometry | ArcGeometry;
  const L = graph.len[ei] as number;
  const f = L > 0 ? Math.min(1, Math.max(0, u / L)) : 0;
  if (g.type === 'line') {
    const dx = g.to[0] - g.from[0], dy = g.to[1] - g.from[1], dz = g.to[2] - g.from[2];
    out[0] = g.from[0] + dx * f; out[1] = g.from[1] + dy * f; out[2] = g.from[2] + dz * f;
    const m = Math.hypot(dx, dy, dz) || 1;
    out[3] = dx / m; out[4] = dy / m; out[5] = dz / m;
    return;
  }
  const a = ((g.startDeg + g.sweepDeg * f) * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a), sign = g.sweepDeg >= 0 ? 1 : -1;
  out[0] = g.center[0] + g.radius * c; out[1] = g.center[1]; out[2] = g.center[2] + g.radius * s;
  out[3] = -s * sign; out[4] = 0; out[5] = c * sign;
}
