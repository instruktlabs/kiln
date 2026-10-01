// SPDX-License-Identifier: MIT
// Boxes for what has no accepted GLB: the proxy parts of a pending asset-map entity (D-21's wiring rule; none in ff2,
// where every entity is accepted), the viewing landing east of the cut (floor, the gallery's outer wall, handrails), the
// 1.1 m handrail along the cut where the raised floor ends and the section row's end walls. One InstancedMesh with
// per-instance colours. Pure box lists (proxyBoxes) so the walk and clearance tests read the same geometry.
import { BoxGeometry, Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { Group, Material } from 'three/webgpu';
import type { AssetMap } from '../assets/asset-map';
import type { FabData, Vec3 } from '../../sim/data';
import { floorStockerDock } from '../../sim/floor-transport';
import { worldPoint } from './placements';
import type { Placements } from './placements';

export interface ProxyBox { name: string; min: Vec3; max: Vec3; colour: string }

const RAIL = 0.05;
function rail(name: string, from: [number, number], to: [number, number], top: number, colour: string, out: ProxyBox[]): void {
  const [x0, z0] = from, [x1, z1] = to, len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 1.8));
  const lo = (a: number, b: number) => Math.min(a, b) - RAIL / 2, hi = (a: number, b: number) => Math.max(a, b) + RAIL / 2;
  for (const y of [top, top / 2]) out.push({ name: `${name}.rail`, min: [lo(x0, x1), y - RAIL, lo(z0, z1)], max: [hi(x0, x1), y, hi(z0, z1)], colour });
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
    out.push({ name: `${name}.post`, min: [x - RAIL / 2, 0, z - RAIL / 2], max: [x + RAIL / 2, top, z + RAIL / 2], colour });
  }
}

/** Every proxy box in world coordinates. */
export function proxyBoxes(map: AssetMap, placements: Placements, data: FabData): ProxyBox[] {
  const out: ProxyBox[] = [], { layout } = data, palette = map.palette;
  // Pending entities with proxy parts (none in ff2): each part through its placement (yaws are multiples of 90).
  for (const [id, e] of Object.entries(map.entities)) {
    if (e.glb || !e.proxy) continue;
    for (const p of placements[id] ?? []) for (const part of e.proxy.parts) {
      const a = worldPoint(p, part.min), b = worldPoint(p, part.max);
      out.push({ name: `${p.id}.${part.name}`, min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])], colour: part.colour });
    }
  }
  // The viewing landing: a floor flush with the visitor level, the gallery's outer wall continued, and two handrails.
  const L = layout.gallery.landing, G = layout.gallery;
  out.push({ name: 'landing.floor', min: [L.x[0], -0.3, L.z[0]], max: [L.x[1], 0, L.z[1]], colour: palette.floor });
  out.push({ name: 'landing.wall-s', min: [L.x[0], 0, G.z[1] - 0.1], max: [L.x[1], G.top, G.z[1]], colour: palette.shell });
  rail('landing.rail-n', [L.x[0], L.z[0]], [L.x[1], L.z[0]], L.handrailY, palette.graphite, out);
  rail('landing.rail-e', [L.x[1], L.z[0]], [L.x[1], L.z[1]], L.handrailY, palette.graphite, out);
  // The handrail along the section cut, on the raised floor's edge.
  const cut = layout.cameras.walk.edges.find(e => e.id === 'section-cut-rail');
  if (cut) rail('section-cut-rail', [cut.from[0] - RAIL / 2, cut.from[1]], [cut.to[0] - RAIL / 2, cut.to[1]], L.handrailY, palette.graphite, out);
  // The section row's open ends, below the clean-room floor and above the FFU face (the fab walls close the band between).
  for (const w of layout.sectionCut.endWalls) out.push({ name: w.id, min: w.min, max: w.max, colour: palette.panel });
  if (data.config.floorTransport?.enabled) layout.stockers.forEach((st, si) => {
    const dock = floorStockerDock(data, si), seat = dock.seat, manual = st.manualPort.seat;
    // Scene-owned conveyor extension: the unchanged stocker counter feeds an outboard longitudinal transfer track.
    const box = (name: string, a: Vec3, b: Vec3, halfWidth: number) => out.push({ name,
      min: [Math.min(a[0], b[0]) - halfWidth, 0.82, Math.min(a[2], b[2]) - halfWidth],
      max: [Math.max(a[0], b[0]) + halfWidth, 0.9, Math.max(a[2], b[2]) + halfWidth], colour: palette.graphite });
    const corner: Vec3 = [seat[0], seat[1], manual[2]];
    box(`floor-transfer-${si}.counter`, manual, corner, 0.24);
    box(`floor-transfer-${si}.track`, corner, seat, 0.24);
    for (const [i, p] of [corner, seat].entries()) out.push({ name: `floor-transfer-${si}.support-${i}`,
      min: [p[0] - 0.05, 0, p[2] - 0.05], max: [p[0] + 0.05, 0.82, p[2] + 0.05], colour: palette.graphite });
  });
  return out;
}

export function buildProxyMesh(boxes: readonly ProxyBox[], material: Material, parent: Group): { mesh: InstancedMesh; dispose(): void } {
  const geometry = new BoxGeometry(1, 1, 1);
  const mesh = new InstancedMesh(geometry, material, Math.max(1, boxes.length));
  mesh.name = 'foundry-floor-proxies';
  const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), c = new Color();
  boxes.forEach((b, i) => {
    p.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    s.set(Math.max(1e-3, b.max[0] - b.min[0]), Math.max(1e-3, b.max[1] - b.min[1]), Math.max(1e-3, b.max[2] - b.min[2]));
    mesh.setMatrixAt(i, m.compose(p, q, s));
    mesh.setColorAt(i, c.set(b.colour));
  });
  mesh.count = boxes.length;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return { mesh, dispose() { mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); } };
}
