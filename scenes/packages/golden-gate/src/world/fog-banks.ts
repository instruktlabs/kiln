// Low fog banks rolling in from the Pacific (High tier; WATER-SPEC "Sky and fog"). Soft camera-facing
// puffs in one instanced sprite draw on the dynamic layer (never reflected). Each puff fades with
// a radial profile broken by noise, against scene depth (soft particles), near and far from the
// camera, and at the water plane. Their colour is the scene fog's own in-scatter, so they read as
// denser pockets of the same air. Opacity follows the preset's `banks` value.
import { InstancedBufferAttribute, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import type { DataTexture } from 'three/webgpu';
import { Fn, cameraFar, cameraNear, cameraPosition, float, instancedBufferAttribute, length, mix, normalize, perspectiveDepthToViewZ, positionView, positionWorld, saturate, smoothstep, texture, uniform, uv, vec2, vec3, vec4, viewportDepthTexture } from 'three/tsl';
import { mulberry32 } from './detail-textures';
import { fogColorNode } from './fog';
import type { AtmosphereUniforms } from './fog';
import { LAYERS } from '../constants';
import { LAYOUT } from '../data';

type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Bank centres in scene metres (+X west, +Z north): west of the Gate, in the strait and over the headlands (layout.json fogBanks). */
const FOG = LAYOUT.fogBanks, BANKS = FOG.banks, PUFF = FOG.puff;
export const FOG_BANK_RANGE = FOG.wrap; // puffs drift toward -X and wrap
export const FOG_BANK_SPEED = FOG.driftSpeed; // m/s

export interface FogBanks { sprite: Sprite; update(time: number, opacity: number): void; readonly puffs: number; dispose(): void }

export function createFogBanks(atmosphere: AtmosphereUniforms, noise: DataTexture, count: number): FogBanks {
  const banks = BANKS.slice(0, Math.max(0, Math.min(BANKS.length, count))), rand = mulberry32(FOG.seed);
  const base: number[] = [];
  for (const bank of banks) for (let i = 0; i < bank.puffs; i++) {
    const u = rand() * 2 - 1, v = rand() * 2 - 1, size = PUFF.sizeMin + rand() * PUFF.sizeRange;
    base.push(bank.x + u * bank.spread[0], bank.y + rand() * PUFF.heightJitter + size * PUFF.heightPerSize, bank.z + v * bank.spread[1], size, rand());
  }
  const puffs = base.length / 5;
  const centres = new InstancedBufferAttribute(new Float32Array(puffs * 4), 4), seeds = new InstancedBufferAttribute(new Float32Array(puffs), 1);
  for (let i = 0; i < puffs; i++) seeds.array[i] = base[i * 5 + 4]!;
  const opacity = uniform(0);
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
  material.name = 'fog-banks'; material.fog = false; // colour is already the fog's in-scatter
  const centre = instancedBufferAttribute(centres) as N, seed = instancedBufferAttribute(seeds) as N;
  material.positionNode = centre.xyz;
  material.scaleNode = vec2(centre.w.mul(PUFF.aspect), centre.w);
  material.colorNode = Fn(() => {
    const p = uv().sub(.5).mul(2) as N, r = length(p);
    const lumps = texture(noise, uv().mul(.55).add(vec2(seed.mul(17.3), seed.mul(5.1)))) as N;
    const profile = saturate(float(1).sub(r.mul(r))).pow(1.6).mul(smoothstep(.2, .75, lumps.x.mul(.7).add(lumps.y.mul(.5))));
    const direction = normalize(positionWorld.sub(cameraPosition));
    const inscatter = fogColorNode(atmosphere, direction) as N;
    const lit = mix(inscatter, inscatter.add(vec3(atmosphere.sunRadiance as N).mul(.05)), saturate(p.y.negate().mul(.5).add(.5)));
    // Soft intersection with terrain, the bridge and anything else that wrote depth.
    const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
    const soft = smoothstep(0, 60, (positionView.z as N).sub(sceneZ).negate());
    const distance = length(positionWorld.sub(cameraPosition));
    const near = smoothstep(30, 220, distance), far = float(1).sub(smoothstep(9000, 16000, distance));
    const water = smoothstep(0, 18, (positionWorld as N).y);
    return vec4(lit as N, (profile as N).mul(soft).mul(near).mul(far).mul(water).mul(opacity).mul(.55));
  })();
  const sprite = new Sprite(material);
  sprite.name = 'fog-banks'; sprite.count = puffs; sprite.frustumCulled = false; sprite.renderOrder = 20;
  sprite.layers.set(LAYERS.dynamic); sprite.castShadow = sprite.receiveShadow = false;
  const span = FOG_BANK_RANGE.west - FOG_BANK_RANGE.east;
  return {
    sprite, puffs,
    update(time, value) {
      opacity.value = value; sprite.visible = value > .001;
      if (!sprite.visible) return;
      const a = centres.array as Float32Array;
      for (let i = 0; i < puffs; i++) {
        const x = base[i * 5]! - FOG_BANK_SPEED * time;
        a[i * 4] = FOG_BANK_RANGE.east + ((((x - FOG_BANK_RANGE.east) % span) + span) % span);
        a[i * 4 + 1] = base[i * 5 + 1]!; a[i * 4 + 2] = base[i * 5 + 2]!; a[i * 4 + 3] = base[i * 5 + 3]!;
      }
      centres.needsUpdate = true;
    },
    dispose() { sprite.removeFromParent(); material.dispose(); sprite.geometry.dispose(); },
  };
}
export const FOG_BANK_COUNT = BANKS.length;
