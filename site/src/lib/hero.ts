import { farm, bridge } from './catalog';
/** Change only this selection to replace the public hero. Environment override is for review builds. */
export const heroSelection = 'farmhouse';
const variants = {
  farmhouse: {
    asset: farm.assets[0]!,
    callouts: [
      { name: 'Mesh_RoofShingles', x: 378, y: 245, endX: 470, endY: 114 },
      { name: 'Mesh_PorchTimber', x: 478, y: 407, endX: 570, endY: 368 },
    ],
  },
  'golden-gate-bridge': {
    asset: bridge,
    callouts: [
      { name: 'SouthTower', x: 355, y: 264, endX: 455, endY: 154 },
      { name: 'MainCableWest', x: 311, y: 346, endX: 518, endY: 392 },
    ],
  },
};
export const hero =
  variants[
    import.meta.env.KILN_SITE_HERO === 'golden-gate-bridge' ? 'golden-gate-bridge' : heroSelection
  ];
