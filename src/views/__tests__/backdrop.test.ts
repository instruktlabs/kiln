import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACKDROPS,
  BACKDROP_IDS,
  DEFAULT_BACKDROP_ID,
  GRID_BACKGROUND_HEX,
  GRID_BACKGROUND_RGB,
  resolveBackdrop,
} from '../background';
import { coverage, rasterizeView } from '../raster';
import { rasterizeCamera, cameraFromBounds } from '../camera';
import { resolveCapture } from '../capture';
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three';

function darkCube(): Scene {
  const scene = new Scene();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x0a0a0a })));
  return scene;
}

describe('backdrop table', () => {
  it('defaults to the neutral studio grey measured against the example set', () => {
    expect(DEFAULT_BACKDROP_ID).toBe('neutral');
    expect(BACKDROPS.neutral.hex).toBe('#aab1bc');
    expect(GRID_BACKGROUND_HEX).toBe(BACKDROPS.neutral.hex);
    expect(GRID_BACKGROUND_RGB).toEqual(BACKDROPS.neutral.rgb);
  });

  it('keeps hex and rgb forms of every backdrop in agreement', () => {
    for (const id of BACKDROP_IDS) {
      const { rgb, hex } = BACKDROPS[id];
      expect(hex).toBe(`#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`);
    }
  });

  it('resolves an omitted id to the default and rejects an unknown one', () => {
    expect(resolveBackdrop(undefined)).toBe(BACKDROPS.neutral);
    expect(resolveBackdrop('dark').hex).toBe('#1a1a1a');
    expect(() => resolveBackdrop('#ff00ff' as never)).toThrow(/backdrop/);
  });

  it('matches the render service table byte for byte', async () => {
    const servicePath = join(
      import.meta.dir,
      '..',
      '..',
      '..',
      'render-service',
      'src',
      'backdrops.mjs',
    );
    const service = (await import(servicePath)) as {
      BACKDROP_IDS: readonly string[];
      BACKDROP_HEX: Record<string, string>;
      DEFAULT_BACKDROP_ID: string;
    };
    expect([...service.BACKDROP_IDS]).toEqual([...BACKDROP_IDS]);
    expect(service.DEFAULT_BACKDROP_ID).toBe(DEFAULT_BACKDROP_ID);
    for (const id of BACKDROP_IDS) expect(service.BACKDROP_HEX[id]).toBe(BACKDROPS[id].hex);
    // The GPU renderer paints from this table through its display transform, and
    // the presentation presets carry no colour of their own, so there is no second
    // source a GPU sheet could disagree with a CPU sheet about.
    const serviceSrc = join(import.meta.dir, '..', '..', '..', 'render-service', 'src');
    expect(readFileSync(join(serviceSrc, 'renderer.mjs'), 'utf8')).toContain(
      'backdropClearColor(BACKDROP_HEX[backdrop], preset.exposure, preset.toneMapping)',
    );
    expect(readFileSync(join(serviceSrc, 'presentation-presets.mjs'), 'utf8')).not.toContain(
      'background',
    );
  });
});

describe('backdrop in the rasterizer', () => {
  it('clears to the requested backdrop and coverage follows it', () => {
    const size = 16;
    const empty = new Scene();
    const dark = rasterizeView(empty, [1, 0, 0], { size, backdrop: 'dark' });
    expect([dark[0], dark[1], dark[2]]).toEqual([...BACKDROPS.dark.rgb]);
    expect(coverage(dark, size, 'dark')).toBe(0);
    // Measured against the wrong backdrop, every pixel looks filled.
    expect(coverage(dark, size, 'neutral')).toBe(1);
    const neutral = rasterizeView(empty, [1, 0, 0], { size });
    expect([neutral[0], neutral[1], neutral[2]]).toEqual([...BACKDROPS.neutral.rgb]);
  });

  it('a near-black asset has a visible edge on the default backdrop', () => {
    const size = 64;
    const rgb = rasterizeView(darkCube(), [0.7, 0.5, 0.7], { size });
    const bg = BACKDROPS.neutral.rgb;
    let edge = 0;
    let weak = 0;
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        const isBg = (p: number) =>
          rgb[p * 3] === bg[0] && rgb[p * 3 + 1] === bg[1] && rgb[p * 3 + 2] === bg[2];
        if (isBg(i) || !(isBg(i - 1) || isBg(i + 1) || isBg(i - size) || isBg(i + size))) continue;
        edge++;
        const luma = 0.2126 * rgb[i * 3]! + 0.7152 * rgb[i * 3 + 1]! + 0.0722 * rgb[i * 3 + 2]!;
        const bgLuma = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
        if (Math.abs(luma - bgLuma) < 40) weak++;
      }
    expect(edge).toBeGreaterThan(20);
    expect(weak / edge).toBeLessThan(0.05);
  });

  it('the camera rasterizer honours the backdrop too', () => {
    const scene = new Scene();
    const camera = cameraFromBounds({ min: [-1, -1, -1], max: [1, 1, 1] }, [1, 0, 0]);
    const rgb = rasterizeCamera(scene, camera, 8, true, 'light');
    expect([rgb[0], rgb[1], rgb[2]]).toEqual([...BACKDROPS.light.rgb]);
  });
});

describe('backdrop in the capture config', () => {
  it('resolves to neutral by default and echoes an explicit choice', () => {
    expect(resolveCapture(undefined).backdrop).toBe('neutral');
    expect(resolveCapture({ preset: '1x1', backdrop: 'dark' }).backdrop).toBe('dark');
    expect(resolveCapture({ backdrop: 'light' }).backdrop).toBe('light');
  });

  it('rejects an unknown backdrop with a message naming the choices', () => {
    expect(() => resolveCapture({ backdrop: 'pink' as never })).toThrow(/neutral, dark, light/);
  });
});
