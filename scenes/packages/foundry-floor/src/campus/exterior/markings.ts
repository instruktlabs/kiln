// SPDX-License-Identifier: MIT
// Quarter-metre paint becomes subpixel at campus orbit distances. Filter only its contrast;
// keep the existing opaque ground queue, physical ribbons and depth/order contract.
import { BufferAttribute, MeshStandardNodeMaterial } from 'three/webgpu';
import { abs, attribute, dFdx, dFdy, float, length, max, min, mix, positionGeometry, saturate, smoothstep, step, varying, vec2, vec3, vec4 } from 'three/tsl';
import type { CampusRoads } from '../data';
import { hexToLinear } from '../roads';

type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** MeshBuilder.ribbon emits four vertices across +side, -side, -side, +side for each quad. */
export function markingAcross(vertices: number): BufferAttribute {
  if (vertices % 4) throw new Error('Road marking geometry must contain complete ribbon quads');
  const values = new Float32Array(vertices);
  for (let i = 0; i < vertices; i += 4) values.set([.5, -.5, -.5, .5], i);
  return new BufferAttribute(values, 1);
}

export function createMarkingMaterial(roads: CampusRoads): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: .95, metalness: 0 });
  material.name = 'campus-road-markings';
  material.depthTest = false; material.depthWrite = false;
  // The Euclidean derivative length avoids fwidth's axis/diagonal bias. This is the width
  // normal to the projected ribbon, including perspective foreshortening, in physical pixels.
  const across = varying(attribute('markAcross', 'float'), 'vRoadMarkAcross') as N;
  const pixelWidth = float(1).div(max(length(vec2(dFdx(across), dFdy(across))), 1e-6));
  const contrast = smoothstep(.25, 1, pixelWidth);

  // Match the underlying road palette and the existing end dissolves, not a dark constant.
  // The split is painted first, then the cross pass; the roundabout apron is painted above
  // both. Markings do not enter the island, parking or plazas. No road-end geometry changes.
  const p = varying(positionGeometry.xz, 'vRoadMarkPosition') as N, S = roads.split, C = roads.cross;
  const splitFade = min(saturate(p.x.sub(S.u[0]).div(S.dissolve)), saturate(float(S.u[1]).sub(p.x).div(S.dissolve)));
  const crossFade = saturate(float(C.v).sub(abs(p.y)).div(C.dissolve));
  const inCross = step(abs(p.x), C.halfWidth).mul(step(abs(p.y), C.v));
  const roadFade = mix(splitFade, crossFade, inCross);
  const grade = vec3(...hexToLinear(roads.palette.grade)), asphalt = vec3(...hexToLinear(roads.palette.asphalt));
  const apron = vec3(...hexToLinear(roads.palette.apron));
  const underlay = mix(mix(grade, asphalt, roadFade), apron, step(length(p), roads.roundabout.apronTo));
  material.colorNode = vec4(mix(underlay, attribute('color', 'vec3'), contrast), 1);
  return material;
}
