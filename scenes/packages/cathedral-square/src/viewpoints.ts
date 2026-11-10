import type { Vec3 } from '@kiln-scenes/scene-kit';
import { ORBIT_VIEW } from './layout';

/** Repeatable views for inspecting the building; these do not teleport the walking actor. */
export const VIEWPOINTS: { id: string; label: string; position: Vec3; target: Vec3; fov: number }[] = [
  { id: 'square', label: 'Square overview', ...ORBIT_VIEW },
  { id: 'dormers', label: 'Square roof dormers', position: [84, 5, 20], target: [84, 13, 48], fov: 65 },
  { id: 'north-entry', label: 'North west entrance', position: [67, 1.8, 14.5], target: [57, 1.8, 14.5], fov: 65 },
  { id: 'south-entry', label: 'South west entrance', position: [67, 1.8, -14.5], target: [57, 1.8, -14.5], fov: 65 },
  { id: 'nave', label: 'Nave and seating', position: [41, 1.8, 0], target: [-2, 2, 0], fov: 66 },
  { id: 'pier', label: 'Column base', position: [41.4, 1.3, 3.6], target: [41.4, -1, 13], fov: 45 },
  { id: 'sanctuary', label: 'Sanctuary and crucifix', position: [-43, 2.2, 0], target: [-56.4, 4.8, 0], fov: 58 },
  { id: 'crucifix', label: 'Suspended crucifix', position: [-52.5, 8.35, .15], target: [-56.4, 8.35, 0], fov: 28 },
  { id: 'retable', label: 'Altarpiece', position: [-52, 2.8, .1], target: [-62, 2.8, 0], fov: 38 },
  { id: 'choir', label: 'Choir stalls', position: [-45, 1.8, 0], target: [-45, 1.4, 10], fov: 65 },
  { id: 'chapels', label: 'Chapels behind the altar', position: [-67, 1.8, 0], target: [-81, 2.6, 0], fov: 78 },
  { id: 'north-transept', label: 'North transept door', position: [-31.1, 1.8, 20], target: [-31.1, 4, 33], fov: 67 },
  { id: 'south-transept', label: 'South transept door', position: [-31.1, 1.8, -20], target: [-31.1, 4, -33], fov: 67 },
  { id: 'south-light', label: 'South aisle daylight', position: [31, 2.2, -11], target: [23, .3, -6.5], fov: 68 },
];
