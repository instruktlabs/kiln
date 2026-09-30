/**
 * Node visibility fixtures (R44).
 *
 * `hideable(true)`: a visible 1 m body, a floating cover and a pivot whose inner block overlaps
 * the body; the cover and the pivot are hidden, so only the body draws (12 of 36 triangles).
 *
 * `HIDDEN_IN_LEVELS`: the tiered car with its LOD0 mirror hidden and a hidden spoiler in LOD1,
 * so the headline and every level count only what draws.
 */
import { TIERED_CAR } from './lod-fixture';

export const hideable = (hide: boolean) => `const meta={name:'Hideable'};
function build(){
  const root=createRoot('Root');
  const m=gameMaterial('#888888');
  createPart('Body',boxGeo(1,1,1),m,{parent:root,position:[0,0.5,0]});
  const cover=createPart('Cover',boxGeo(2,0.2,2),m,{parent:root,position:[0,3,0]});
  const panel=createPivot('Panel',[0,0.5,0],root);
  createPart('Inner',boxGeo(0.5,0.5,0.5),m,{parent:panel});
  ${hide ? 'cover.visible=false; panel.visible=false;' : ''}
  return root;
}`;

export const HIDEABLE = hideable(true);

const MIRROR =
  "if (lod === 0) createPart('Mirror', boxGeo(0.1, 0.1, 0.3), paint, { parent: group, position: [1, 1.4, 1.05] });";
if (!TIERED_CAR.includes(MIRROR)) throw new Error('the tiered car fixture changed');

export const HIDDEN_IN_LEVELS = TIERED_CAR.replace(
  MIRROR,
  `${MIRROR.replace('});', '}).visible = false;')}
    if (lod === 1) createPart('Spoiler', boxGeo(0.5, 0.1, 1), paint, { parent: group, position: [-1.5, 1.6, 0] }).visible = false;`,
);

/** Drawn triangles: the headline, each body level, and the whole model at each level. */
export const HIDDEN_IN_LEVELS_TRIANGLES = { headline: 60, body: [12, 12, 12], model: [60, 12, 12] };
