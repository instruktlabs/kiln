import { LAYOUT } from '../../scripts/authored-layout';
import { expect, test } from 'bun:test';
import { DataTexture, Layers, PerspectiveCamera, Scene, Texture } from 'three/webgpu';
import type { Atmosphere } from '../../src/world/atmosphere';
import { LAYERS } from '../../src/constants';
import { FEATURES } from '../../src/tiers';
import { createAtmosphereUniforms } from '../../src/world/fog';
import { createFogBanks } from '../../src/world/fog-banks';
import type { WaterMapLevel } from '../../src/world/water-maps';
await import('three');
const { createWater } = await import('../../src/world/water');

test('High reflections exclude traffic, player and fog layers while retaining world vegetation and reflection stand-ins', () => {
  for (const standIns of [false, true]) {
    const scene = new Scene(), environment = new Texture();
    const level = (): WaterMapLevel => ({ level: 'test', bounds: [-10, -10, 10, 10], size: [2, 2], texture: new DataTexture() });
    const water = createWater(scene, {
      features: { ...FEATURES.high.water, grid: 1, levels: 1 },
      atmosphere: { uniforms: createAtmosphereUniforms(), environment } as Atmosphere,
      near: level(), mid: level(), midGrid: { bounds: [-10, -10, 10, 10], width: 2, height: 2, depth: new Float32Array(4).fill(2), shore: new Float32Array(4).fill(2) },
      passLayers: standIns ? { main: LAYERS.mainOnly, pass: LAYERS.reflectionOnly } : undefined,
    });
    try {
      const camera = new PerspectiveCamera(); camera.layers.enable(LAYERS.water); camera.layers.enable(LAYERS.dynamic); camera.layers.enable(7);
      if (standIns) camera.layers.enable(LAYERS.mainOnly);
      const mask = camera.layers.mask, virtual = water.reflectionCamera(camera)!;
      const objectLayers = (layer: number) => { const layers = new Layers(); layers.set(layer); return layers; };
      expect(virtual.layers.test(objectLayers(LAYERS.dynamic))).toBe(false); // traffic, driven car and fog banks
      expect(virtual.layers.test(objectLayers(LAYERS.world))).toBe(true); // terrain's vegetation cards remain reflected (D-71)
      expect(virtual.layers.isEnabled(7)).toBe(true);
      expect(virtual.layers.isEnabled(LAYERS.mainOnly)).toBe(false);
      expect(virtual.layers.isEnabled(LAYERS.reflectionOnly)).toBe(standIns);
      expect(camera.layers.mask).toBe(mask);
      // Every call reapplies the policy, including another camera's newly cloned virtual camera.
      virtual.layers.enable(LAYERS.dynamic);
      expect(water.reflectionCamera(camera)!.layers.isEnabled(LAYERS.dynamic)).toBe(false);
      const next = camera.clone(); expect(water.reflectionCamera(next)!.layers.isEnabled(LAYERS.dynamic)).toBe(false);
    } finally { water.dispose(); environment.dispose(); }
  }
});

test('fog-bank diagnostic hiding persists across updates and showing still respects weather opacity', () => {
  const noise = new DataTexture(), banks = createFogBanks(createAtmosphereUniforms(), noise, 1, LAYOUT.fogBanks);
  try {
    expect(banks.hidden).toBe(false); expect(banks.puffs).toBeGreaterThan(0);
    banks.update(0, .7); expect(banks.sprite.visible).toBe(true);
    banks.hidden = true; expect(banks.sprite.visible).toBe(false);
    banks.update(10, 1); banks.update(11, .7); expect(banks.sprite.visible).toBe(false);
    banks.hidden = false; expect(banks.sprite.visible).toBe(true);
    banks.update(12, 0); expect(banks.sprite.visible).toBe(false);
    banks.hidden = true; banks.update(13, 0); banks.hidden = false;
    expect(banks.sprite.visible).toBe(false);
    banks.update(14, .8); expect(banks.sprite.visible).toBe(true);
    expect(banks.sprite.layers.isEnabled(LAYERS.dynamic)).toBe(true);
  } finally { banks.dispose(); noise.dispose(); }
});
