// Sealed r33 terrain.mjs; MIT, Copyright (c) 2026 Matthew Kissinger.
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { terrainHeight, insideRect, riverCenter, riverWidth, farmTerrainZ } from './site-layout';
import type { FarmLayout } from './types';

export function makeTerrainGeometry(layout: Pick<FarmLayout, 'presentation'>) {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], groups: number[][] = [[], [], []], N = 144, step = 72 / N;
  // Extra rows resolve the narrow millrace and retaining bank without refining the whole farm.
  const zs = farmTerrainZ;
  for (let iz = 0; iz < zs.length; iz++) for (let ix = 0; ix <= N; ix++) {
    const x = -36 + ix * step, z = zs[iz], y = terrainHeight(x, z), v = .93 + .07 * Math.sin(x * .19 + z * .11) * Math.cos(z * .25);
    positions.push(x, y, z); colors.push(v, v, v); uvs.push(x * .25, z * .25);
  }
  for (let z = 0; z < zs.length - 1; z++) for (let x = 0; x < N; x++) {
    const cx = -36 + (x + .5) * step, cz = (zs[z] + zs[z + 1]) / 2;
    const mat = Math.abs(cz - riverCenter(cx)) < riverWidth(cx) / 2 + .9 || layout.presentation.beds.some(r => insideRect(cx, cz, r)) ? 2 : layout.presentation.paths.some(r => insideRect(cx, cz, r)) ? 1 : 0;
    const a = z * (N + 1) + x, b = a + N + 1; groups[mat].push(a, b, b + 1, a, b + 1, a + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3)); geo.setAttribute('color', new Float32BufferAttribute(colors, 3)); geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  let start = 0; for (let i = 0; i < 3; i++) { geo.addGroup(start, groups[i].length, i); start += groups[i].length; }
  geo.setIndex(groups.flat()); geo.computeVertexNormals(); return geo;
}
