// Sealed r33 landscape.mjs terrain section; MIT, Copyright (c) 2026 Matthew Kissinger.
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { terrainHeight, riverCenter, riverWidth, farmTerrainZ } from './site-layout';
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function landscapeHeight(x: number, z: number) {
  const outside = Math.max(Math.abs(x), Math.abs(z)) - 36, blend = smooth(outside / 45);
  const hills = .4 + .6 * Math.sin(x * .028 + .8) * Math.cos(z * .021) + .35 * Math.sin(z * .047 + x * .013);
  const bank = smooth((Math.abs(z - riverCenter(x)) - riverWidth(x) / 2) / 8);
  return terrainHeight(x, z) + blend * hills * bank;
}
type Row = { id: number; z: number }[];
export function makeSurroundingTerrainGeometry() {
  // Refine along the channel; boundary rows retain the farm's exact seams.
  const outer = [40, 52, 72, 104, 152, 224, 320, 384], p: number[] = [], uv: number[] = [], colors: number[] = [], groups: number[][] = [[], []];
  const row = (x: number, zs: number[]): Row => zs.map(z => { const id = p.length / 3; p.push(x, landscapeHeight(x, z), z); uv.push(x * .25, z * .25); const shade = .93 + .07 * Math.sin(x * .19 + z * .11) * Math.cos(z * .25); colors.push(shade, shade, shade); return { id, z }; });
  const triangle = (a: number, b: number, c: number) => { const x = (p[a * 3] + p[b * 3] + p[c * 3]) / 3, z = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3; groups[Math.abs(z - riverCenter(x)) < riverWidth(x) / 2 + .9 ? 1 : 0].push(a, b, c); };
  const join = (a: Row, b: Row) => { let i = 0, j = 0; while (i < a.length - 1 || j < b.length - 1) { if (j === b.length - 1 || (i < a.length - 1 && a[i + 1].z <= b[j + 1].z)) { triangle(a[i].id, a[i + 1].id, b[j].id); i++; } else { triangle(a[i].id, b[j + 1].id, b[j].id); j++; } } };
  const sideZ = (x: number) => { const c = riverCenter(x), w = riverWidth(x) / 2; return [...outer.map(v => -v), -36, ...[-1.6, -1, -.55, 0].map(d => c - w + d), c - w * .5, c, c + w * .5, ...[0, .55, 1, 1.6].map(d => c + w + d), 0, 36, ...outer].sort((a, b) => a - b); };
  const edgeZ = [...outer.map(v => -v).reverse(), ...farmTerrainZ, ...outer];
  for (const sign of [-1, 1]) { let previous: Row | null = null; for (let d = 36; d <= 384; d += d < 120 ? .5 : 2) { const x = sign * d, next = row(x, d === 36 ? edgeZ : sideZ(x)); if (previous) sign > 0 ? join(previous, next) : join(next, previous); previous = next; } }
  for (const sign of [-1, 1]) { let previous: Row | null = null; const zs = [36, ...outer].map(v => v * sign).sort((a, b) => a - b); for (let x = -36; x <= 36; x += .5) { const next = row(x, zs); if (previous) join(previous, next); previous = next; } }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(p, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.addGroup(0, groups[0].length, 0); g.addGroup(groups[0].length, groups[1].length, 1); g.setIndex(groups.flat()); g.computeVertexNormals(); return g;
}
