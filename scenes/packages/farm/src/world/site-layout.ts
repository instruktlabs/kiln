// Sealed r33 site-layout.mjs; MIT, Copyright (c) 2026 Matthew Kissinger.
import type { FarmLayout, LayoutPatch } from './types';

const millrace = (x: number) => 1 - smooth((Math.abs(x - 25) - 3.3) / 2);
export const riverCenter = (x: number) => -26.31 + 1.8 * Math.sin((x - 25) / 9) * (1 - millrace(x));
export const riverWidth = (x: number) => .86 + 1.6 * Math.min(1, Math.abs(x - 25) / 7) * (1 - millrace(x));
export const riverSlope = (x: number) => (riverCenter(x + .01) - riverCenter(x - .01)) / .02;
export const bridgeCenter: [number, number] = [19, riverCenter(19)];
export const onBridge = (x: number, z: number, inset = 0) => Math.abs(x - bridgeCenter[0]) < 1.7 - inset && Math.abs(z - bridgeCenter[1]) < 3.3;
export const drivingHeight = (x: number, z: number) => onBridge(x, z) ? .16 : terrainHeight(x, z);
function smooth(t: number) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
export function terrainHeight(x: number, z: number) {
  const riverGap = Math.abs(z - riverCenter(x)) - riverWidth(x) / 2;
  const race = millrace(x), bankRun = 1.1 * (1 - race) + .12 * race;
  const riverGround = -.36 * (1 - smooth((riverGap + .15 * (1 - race) + .02 * race) / bankRun));
  const courtX = (1 - smooth((Math.abs(x - 25) - 3.8) / 2)) * smooth((x - 21.9) / .2), courtZ = 1 - smooth((Math.abs(z + 28.8) - 2.3) / 1.2);
  // The excavated entry court stays behind the mill wall, separated from the race.
  const dryBank = smooth((-26.93 - z) / .06);
  return Math.min(riverGround, -.25 * courtX * courtZ * dryBank);
}
export const insideRect = (x: number, z: number, r: LayoutPatch, pad = 0) => Math.abs(x - r.position[0]) <= r.width / 2 + pad && Math.abs(z - r.position[2]) <= r.depth / 2 + pad;
export function grassAllowed(x: number, z: number, layout: Pick<FarmLayout, 'presentation' | 'placements'>) {
  if (Math.abs(x) > 35 || Math.abs(z) > 35 || Math.abs(z - riverCenter(x)) < riverWidth(x) / 2 + 1) return false;
  if ([...layout.presentation.paths, ...layout.presentation.beds].some(r => insideRect(x, z, r, .24))) return false;
  for (const p of layout.placements) {
    const sizes: Record<string, [number, number]> = { farmhouse: [6.5, 5.5], barn: [5.5, 5.5], windmill: [3.2, 3.2], watermill: [4.2, 3.8], tractor: [2.5, 1.5], trailer: [3, 1.4], barrel: [.7, .7], 'hay-bale': [.65, .45] };
    const s = sizes[p.asset]; if (s && Math.abs(x - p.position[0]) < s[0] && Math.abs(z - p.position[2]) < s[1]) return false;
  }
  return true;
}

// Shared farm/surround boundary samples keep the refined mill bank watertight.
export const farmTerrainZ = [...new Set([...Array.from({ length: 145 }, (_, i) => -36 + i * .5), -26.99, -26.93, -26.88, -26.8, -26.74, -26.6, -26.31, -26.1, -25.88, -25.8])].sort((a, b) => a - b);
