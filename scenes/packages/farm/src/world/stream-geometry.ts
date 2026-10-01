// Sealed r33 stream-geometry.mjs; MIT, Copyright (c) 2026 Matthew Kissinger.
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { riverCenter, riverWidth, riverSlope } from './site-layout';
export const STREAM_LEVEL = -.12;
type Point = [number, number, number];
// Clip projected bed triangles at the waterline. The bed that is actually drawn supplies depth and bank contact.
export function makeStreamGeometry(grounds: BufferGeometry[]) {
  const positions: number[] = [], depths: number[] = [], flows: number[] = [], indices: number[] = [];
  const clip = (poly: Point[]): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], inside = a[1] < STREAM_LEVEL, other = b[1] < STREAM_LEVEL;
      if (inside) out.push(a);
      if (inside !== other) { const t = (STREAM_LEVEL - a[1]) / (b[1] - a[1]); out.push([a[0] + t * (b[0] - a[0]), STREAM_LEVEL, a[2] + t * (b[2] - a[2])]); }
    }
    return out;
  };
  for (const ground of grounds) {
    const p = ground.getAttribute('position'), index = ground.getIndex()!, candidates: { polygon: Point[]; seed: boolean }[] = [], parents: number[] = [], edges = new Map<string, number>();
    const find = (n: number) => { while (parents[n] !== n) { parents[n] = parents[parents[n]]; n = parents[n]; } return n; };
    for (let i = 0; i < index.count; i += 3) {
      const ids = [0, 1, 2].map(k => index.getX(i + k)), triangle = ids.map((n): Point => [p.getX(n), p.getY(n), p.getZ(n)]);
      if (!triangle.some(([x, y, z]) => y < STREAM_LEVEL && Math.abs(z - riverCenter(x)) < riverWidth(x) / 2 + .85)) continue;
      const polygon = clip(triangle); if (polygon.length < 3) continue; const n = candidates.length; parents.push(n);
      candidates.push({ polygon, seed: triangle.some(([x, y, z]) => y < STREAM_LEVEL && Math.abs(z - riverCenter(x)) <= riverWidth(x) / 2) });
      // Wet triangles only connect across a shared edge with a submerged segment.
      // A dry bank separates the lowered mill court from the connected river surface.
      for (let k = 0; k < 3; k++) {
        const j = (k + 1) % 3; if (Math.min(triangle[k][1], triangle[j][1]) >= STREAM_LEVEL) continue;
        const a = ids[k], b = ids[j], key = Math.min(a, b) + ':' + Math.max(a, b), other = edges.get(key);
        if (other === undefined) edges.set(key, n); else parents[find(n)] = find(other);
      }
    }
    const connected = new Set<number>(); for (let n = 0; n < candidates.length; n++) if (candidates[n].seed) connected.add(find(n));
    for (let n = 0; n < candidates.length; n++) {
      if (!connected.has(find(n))) continue; const polygon = candidates[n].polygon, first = positions.length / 3;
      for (const [x, y, z] of polygon) { positions.push(x, STREAM_LEVEL + .002, z); depths.push(Math.max(0, STREAM_LEVEL - y)); const slope = riverSlope(x), speed = .42 + .15 / (riverWidth(x) + .2); flows.push(speed, speed * slope); }
      for (let k = 1; k < polygon.length - 1; k++) indices.push(first, first + k, first + k + 1);
    }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(positions, 3)); g.setAttribute('waterDepth', new Float32BufferAttribute(depths, 1)); g.setAttribute('waterFlow', new Float32BufferAttribute(flows, 2));
  g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
