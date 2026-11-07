import { Fn, If, float, max, min, mix, vec3 } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { REVIEW_RIG, type RigLight, backdropLinear } from './review-rig';

/** The slot the rig's mapper is installed in on each renderer (see `installReviewToneMapping`). */
export const reviewToneMapping: THREE.ToneMapping = THREE.CustomToneMapping;

/**
 * Review Neutral as a shader node: the same construction as `reviewNeutral` and as the engine's
 * `render-service/src/review-tone-mapping.mjs`, adapted from three.js r186 neutralToneMapping (MIT), with the rig's
 * constants. Both of the view's backends compile it, as they do for the render service's captures.
 */
const reviewNeutralNode = Fn(([input, exposure]: [THREE.Node<'vec3'>, THREE.Node<'float'>]) => {
  const { offset, startCompression: start, desaturation } = REVIEW_RIG.toneMapping;
  const colour = vec3(input).mul(exposure).toVar();
  const minimum = min(colour.r, min(colour.g, colour.b));
  const glare = minimum
    .lessThan(2 * offset)
    .select(minimum.sub(minimum.mul(minimum).div(4 * offset)), float(offset));
  colour.subAssign(glare);
  const peak = max(colour.r, max(colour.g, colour.b));
  // A shader return inside If needs the explicit function layout below.
  If(peak.lessThan(start), () => {
    return colour;
  });
  const d = 1 - start;
  const newPeak = float(1).sub(float(d * d).div(peak.add(1 - 2 * start)));
  colour.mulAssign(newPeak.div(peak));
  const whiteMix = float(1).sub(float(1).div(peak.sub(newPeak).mul(desaturation).add(1)));
  return mix(colour, vec3(newPeak), whiteMix);
}).setLayout({
  name: 'reviewNeutralToneMapping',
  type: 'vec3',
  inputs: [
    { name: 'color', type: 'vec3' },
    { name: 'exposure', type: 'float' },
  ],
});

/** Give a renderer the rig's mapper, in three's `CustomToneMapping` slot. */
export function installReviewToneMapping(renderer: THREE.WebGPURenderer): void {
  (
    renderer.library as unknown as {
      addToneMapping(node: unknown, mapping: THREE.ToneMapping): void;
    }
  ).addToneMapping(reviewNeutralNode, THREE.CustomToneMapping);
}

export type ToneMappingId = 'neutral' | 'aces' | 'linear';

export interface ToneMappingChoice {
  id: ToneMappingId;
  label: string;
  mapping: THREE.ToneMapping;
  exposure: number;
}

/**
 * The tone mappings the 3D view can show an asset under. The first is the rig's own and the view's default, so
 * nothing changes until a visitor picks another. ACES and Linear are what many engines ship with; a GLB carries
 * no tone mapping, so the same asset reads differently in each. The rig's exposure goes with its own mapper and
 * 1 with the others (three scales ACES by itself), so each reads as it would with no adjustment.
 */
const DEFAULT_CHOICE: ToneMappingChoice = Object.freeze({
  id: 'neutral',
  label: 'Neutral (default)',
  mapping: reviewToneMapping,
  exposure: REVIEW_RIG.exposure,
});

export const TONE_MAPPINGS: readonly ToneMappingChoice[] = Object.freeze([
  DEFAULT_CHOICE,
  Object.freeze({ id: 'aces', label: 'ACES', mapping: THREE.ACESFilmicToneMapping, exposure: 1 }),
  Object.freeze({ id: 'linear', label: 'Linear', mapping: THREE.LinearToneMapping, exposure: 1 }),
] as ToneMappingChoice[]);

export const DEFAULT_TONE_MAPPING: ToneMappingId = 'neutral';

/** The choice named `id`, or the default when the name is not one of them. */
export function toneMappingChoice(id: string): ToneMappingChoice {
  return TONE_MAPPINGS.find((choice) => choice.id === id) ?? DEFAULT_CHOICE;
}

/**
 * Put the renderer on the tone mapping named `id`. The mapping is compiled into each material's shader, so the
 * materials already in the scene are rebuilt for it.
 */
export function applyToneMapping(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  id: string,
): void {
  const choice = toneMappingChoice(id);
  renderer.toneMapping = choice.mapping;
  renderer.toneMappingExposure = choice.exposure;
  scene.background = backdropColour(choice.id);
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (!material) return;
    for (const item of Array.isArray(material) ? material : [material]) item.needsUpdate = true;
  });
}

/** The background that reads back as the rig's backdrop under the mapping named `id`. */
const backdropColour = (id: ToneMappingId) => {
  const [r, g, b] = backdropLinear(id);
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
};

function directional(spec: RigLight, name: string) {
  const light = new THREE.DirectionalLight(spec.color, spec.intensity);
  light.name = `review-rig:${name}`;
  light.position.set(...spec.position);
  light.castShadow = false;
  return light;
}

/**
 * Light `scene` the way the review rig lights a capture: the room environment at the rig's intensity, one
 * hemisphere light, key, fill and rim directional lights, no shadows, the rig's exposure and tone mapping and
 * its neutral backdrop. Returns a function that removes all of it again. The lights are fixed in the world, as
 * the rig's are, so orbiting the camera changes the view but not the light.
 */
export function applyReviewRig(renderer: THREE.WebGPURenderer, scene: THREE.Scene): () => void {
  const { environment, hemisphere, exposure } = REVIEW_RIG;
  const before = {
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    environment: scene.environment,
    intensity: scene.environmentIntensity,
    background: scene.background,
  };
  renderer.toneMapping = reviewToneMapping;
  renderer.toneMappingExposure = exposure;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, environment.sigma);
  scene.environment = target.texture;
  scene.environmentIntensity = environment.intensity;
  scene.background = backdropColour(DEFAULT_TONE_MAPPING);

  const ambient = new THREE.HemisphereLight(
    hemisphere.sky,
    hemisphere.ground,
    hemisphere.intensity,
  );
  ambient.name = 'review-rig:hemisphere';
  const lights: THREE.Light[] = [
    ambient,
    directional(REVIEW_RIG.key, 'key'),
    directional(REVIEW_RIG.fill, 'fill'),
    directional(REVIEW_RIG.rim, 'rim'),
  ];
  for (const light of lights) scene.add(light);

  return () => {
    for (const light of lights) {
      scene.remove(light);
      light.dispose();
    }
    scene.environment = before.environment;
    scene.environmentIntensity = before.intensity;
    scene.background = before.background;
    renderer.toneMapping = before.toneMapping;
    renderer.toneMappingExposure = before.exposure;
    target.dispose();
    room.dispose();
    pmrem.dispose();
  };
}
