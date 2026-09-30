/**
 * Scene palettes — the configurable-palette snap + scene composition primitives.
 *
 * Covers:
 *   - palette-snap pure math: hex→linear, kind-aware chooseSlot (greens→green,
 *     neutrals→neutral, emissive→glow, transparent→glass)
 *   - snapGlbToPalette: rewrites a finished GLB's flat materials to a user palette,
 *     collapses the material count, re-grades; undefined on junk bytes / empty palette
 *   - composeSceneGLB: merges N placed GLBs into one (transforms applied, rotation→quat,
 *     dedup collapses repeated blueprints, animations dropped by default)
 *   - renderPaletteDirective(slots) generalizes to a custom palette
 */
import { describe, it, expect } from 'bun:test';
import * as THREE from 'three';
import { WebIO } from '@gltf-transform/core';
import { createRoot, createPart, boxGeo, gameMaterial, glassMaterial } from '../primitives';
import {
  renderSceneToGLB,
  snapGlbToPalette,
  composeSceneGLB,
  type SnapPaletteSlot,
} from '../render';
import { createGltfIO } from '../gltf-io';
import { collectGlbMetrics } from '../metrics';
import { hexToLinearRgb, buildSlotIndex, chooseSlot } from '../palette-snap';
import {
  renderPaletteDirective,
  OPTIMIZED_PALETTE,
  GENERAL_RENDER_PALETTE,
  paletteToSnapSlots,
} from '../palette';

const hue = (i: number, n: number): number => new THREE.Color().setHSL(i / n, 0.7, 0.5).getHex();

function manyColorScene(n: number): THREE.Object3D {
  const root = createRoot('Palette');
  for (let i = 0; i < n; i++) {
    createPart(`Box${i}`, boxGeo(1, 1, 1), gameMaterial(hue(i, n)), {
      position: [i * 1.5, 0, 0],
      parent: root,
    });
  }
  return root;
}

const PAL: SnapPaletteSlot[] = [
  { color: '#e8e8e6' }, // 0 white
  { color: '#1a1c1f' }, // 1 black
  { color: '#4f8f3f' }, // 2 green
  { color: '#b8584a' }, // 3 red
  { color: '#2f6fd0' }, // 4 blue
  { color: '#cdb27a' }, // 5 sand
];

describe('palette-snap (pure)', () => {
  it('hexToLinearRgb maps the endpoints', () => {
    expect(hexToLinearRgb('#000000')).toEqual([0, 0, 0]);
    const w = hexToLinearRgb('#ffffff');
    expect(w[0]).toBeCloseTo(1, 5);
    expect(w[1]).toBeCloseTo(1, 5);
    expect(w[2]).toBeCloseTo(1, 5);
    // shorthand + missing-hash both parse
    expect(hexToLinearRgb('fff')).toEqual(hexToLinearRgb('#ffffff'));
  });

  it('chooseSlot routes by hue, not lightness (greens→green, reds→red)', () => {
    const idx = buildSlotIndex(PAL);
    const pick = (hex: string) => chooseSlot(idx, { baseLinear: hexToLinearRgb(hex) });
    expect(pick('#3a8f30')).toBe(2); // a green → green
    expect(pick('#c23a2a')).toBe(3); // a red → red
    expect(pick('#3a5fc0')).toBe(4); // a blue → blue
  });

  it('neutrals snap to neutral slots (a grey never picks up a tint)', () => {
    const idx = buildSlotIndex(PAL);
    const pick = chooseSlot(idx, { baseLinear: hexToLinearRgb('#8a8a8a') });
    expect(pick).toBeDefined();
    expect([0, 1]).toContain(pick!); // white or black, never green/red/blue
  });

  it('emissive → glow slot, transparent → glass slot when present', () => {
    const idx = buildSlotIndex([
      { color: '#888888' },
      { color: '#aacbe0', kind: 'glass' },
      { color: '#ffd9a0', kind: 'glow' },
    ]);
    expect(chooseSlot(idx, { baseLinear: [0.1, 0.1, 0.1], emissiveLinear: [0.8, 0.6, 0.3] })).toBe(
      2,
    );
    expect(chooseSlot(idx, { baseLinear: [0.5, 0.6, 0.7], transparent: true })).toBe(1);
    expect(chooseSlot(idx, { baseLinear: [0.05, 0.05, 0.05] })).toBe(0); // opaque fallback
  });

  it('general render palette keeps dark foliage green and bark brown', () => {
    const slots = paletteToSnapSlots(GENERAL_RENDER_PALETTE);
    const idx = buildSlotIndex(slots);
    const pickName = (hex: string): string | undefined => {
      const slotI = chooseSlot(idx, { baseLinear: hexToLinearRgb(hex) });
      return slotI === undefined ? undefined : GENERAL_RENDER_PALETTE[slotI]?.name;
    };

    expect(pickName('#2d5a27')).toBe('leaf-dark');
    expect(pickName('#35503a')).toBe('leaf-dark');
    expect(pickName('#556b2f')).toBe('leaf-olive');
    expect(pickName('#4a3424')).toBe('bark');
  });
});

describe('snapGlbToPalette', () => {
  it('rewrites flat materials to the palette and collapses the material count', async () => {
    const baked = await renderSceneToGLB(manyColorScene(14));
    expect(baked.instanceability!.grade).toBe('F'); // 14 distinct materials

    const out = await snapGlbToPalette(baked.bytes, PAL, { category: 'prop' });
    expect(out).toBeDefined();
    expect(out!.snapped).toBe(14);
    expect(out!.skipped).toBe(0);
    expect(out!.summary.materialsBefore).toBe(14);
    // 14 distinct hues collapse to ≤ the palette's slot count (here they land on 4 slots),
    // lifting the grade off F — the snap's guarantee is a bounded, coherent material set.
    expect(out!.report!.metrics.uniqueMaterials).toBeLessThanOrEqual(PAL.length);
    expect(out!.summary.materialsAfter).toBeLessThan(out!.summary.materialsBefore);
    expect(out!.report!.grade).not.toBe('F');
    expect(out!.gltfValidation.issues.numErrors).toBe(0);
    // valid GLB out
    const doc = await new WebIO().readBinary(out!.bytes);
    expect(doc.getRoot().listNodes().length).toBeGreaterThan(0);
  });

  it('snaps a transparent material to the glass slot (transparency preserved)', async () => {
    const root = createRoot('Glassy');
    for (let i = 0; i < 6; i++) {
      createPart(`Wall${i}`, boxGeo(1, 1, 1), gameMaterial(hue(i, 6)), {
        position: [i * 1.5, 0, 0],
        parent: root,
      });
    }
    createPart('Window', boxGeo(1, 1, 0.05), glassMaterial(0x88ccff, { opacity: 0.4 }), {
      position: [0, 2, 0],
      parent: root,
    });
    const baked = await renderSceneToGLB(root);
    const palWithGlass: SnapPaletteSlot[] = [
      ...PAL,
      { color: '#aacbe0', kind: 'glass', opacity: 0.4 },
    ];
    const out = await snapGlbToPalette(baked.bytes, palWithGlass);
    expect(out!.report!.metrics.transparentMaterials).toBeGreaterThanOrEqual(1);
  });

  it('a glow slot sets the emitted colour and clears the old emissive strength', async () => {
    const root = createRoot('Lamps');
    for (let i = 0; i < 6; i++) {
      createPart(`Wall${i}`, boxGeo(1, 1, 1), gameMaterial(hue(i, 6)), {
        position: [i * 1.5, 0, 0],
        parent: root,
      });
    }
    const bulb = new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: 0xffaa33,
      emissiveIntensity: 6,
    });
    createPart('Bulb', boxGeo(0.3, 0.3, 0.3), bulb, { position: [0, 2, 0], parent: root });
    const baked = await renderSceneToGLB(root);
    const glow = '#ffd9a0';
    const out = await snapGlbToPalette(baked.bytes, [...PAL, { color: glow, kind: 'glow' }]);
    const io = createGltfIO();
    const json = (await io.writeJSON(await io.readBinary(out!.bytes))).json;
    const glowing = (json.materials ?? []).filter((material) =>
      (material.emissiveFactor ?? [0, 0, 0]).some((channel) => channel > 0),
    );
    expect(glowing).toHaveLength(1);
    expect(glowing[0]!.extensions?.['KHR_materials_emissive_strength']).toBeUndefined();
    const expected = hexToLinearRgb(glow);
    for (const [i, channel] of glowing[0]!.emissiveFactor!.entries()) {
      expect(channel).toBeCloseTo(expected[i]!, 5);
    }
  });

  it('returns undefined on junk bytes or an empty palette', async () => {
    expect(await snapGlbToPalette(new Uint8Array([1, 2, 3, 4]), PAL)).toBeUndefined();
    const baked = await renderSceneToGLB(manyColorScene(3));
    expect(await snapGlbToPalette(baked.bytes, [])).toBeUndefined();
  });
});

describe('composeSceneGLB', () => {
  async function glbOf(scene: THREE.Object3D): Promise<Uint8Array> {
    return (await renderSceneToGLB(scene)).bytes;
  }

  it('merges parts, applies transforms, and sums triangles', async () => {
    const a = await glbOf(manyColorScene(3));
    const b = await glbOf(
      (() => {
        const r = createRoot('B');
        createPart('BBox', boxGeo(2, 2, 2), gameMaterial(0x4444ff), { parent: r });
        return r;
      })(),
    );
    const aTris = (await renderSceneToGLB(manyColorScene(3))).tris;

    const out = await composeSceneGLB([
      {
        bytes: a,
        transform: { pos: [0, 0, 0], rotDeg: [0, 0, 0], scale: [1, 1, 1] },
        name: 'PLACE_A',
      },
      {
        bytes: b,
        transform: { pos: [10, 0, 0], rotDeg: [0, 90, 0], scale: [1, 1, 1] },
        name: 'PLACE_B',
      },
    ]);
    expect(out.tris).toBe(aTris + 12); // a 2×2×2 box = 12 tris
    expect(out.draws).toBeGreaterThan(0);

    // The wrapper node carries the placement transform (pos + a 90° Y quaternion). Use a
    // unique name so it can't collide with a source GLB's own root node.
    const doc = await new WebIO().readBinary(out.bytes);
    const bNode = doc
      .getRoot()
      .listNodes()
      .find((nd) => nd.getName() === 'PLACE_B');
    expect(bNode).toBeDefined();
    const t = bNode!.getTranslation();
    expect(t[0]).toBeCloseTo(10, 4);
    const q = bNode!.getRotation();
    expect(q[1]).toBeCloseTo(Math.SQRT1_2, 3); // y of a 90° Y rotation
    expect(q[3]).toBeCloseTo(Math.SQRT1_2, 3); // w
  });

  it('dedup collapses a repeated blueprint (same GLB placed twice shares geometry)', async () => {
    const a = await glbOf(
      (() => {
        const r = createRoot('One');
        createPart('Box', boxGeo(1, 1, 1), gameMaterial(0x808080), { parent: r });
        return r;
      })(),
    );
    const out = await composeSceneGLB([
      { bytes: a, transform: { pos: [0, 0, 0], rotDeg: [0, 0, 0], scale: [1, 1, 1] } },
      { bytes: a, transform: { pos: [5, 0, 0], rotDeg: [0, 0, 0], scale: [1, 1, 1] } },
    ]);
    const metrics = collectGlbMetrics(await new WebIO().readBinary(out.bytes));
    expect(metrics.uniqueGeometries).toBe(1); // two placements, one shared geometry
    expect(metrics.triangles).toBe(24); // both boxes still drawn (12 each)
  });

  it('optionally names retained clips by instance while preserving their distinct targets', async () => {
    const io = new WebIO();
    const src = await io.readBinary(await glbOf(manyColorScene(1)));
    const target = src
      .getRoot()
      .listNodes()
      .find((node) => node.getMesh())!;
    const buffer = src.getRoot().listBuffers()[0]!;
    const times = src
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Float32Array([0, 1]))
      .setBuffer(buffer);
    const values = src
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 0, 1, 0]))
      .setBuffer(buffer);
    for (const name of ['Walk', 'Walk', '']) {
      const sampler = src
        .createAnimationSampler()
        .setInput(times)
        .setOutput(values)
        .setInterpolation('LINEAR');
      const channel = src
        .createAnimationChannel()
        .setSampler(sampler)
        .setTargetNode(target)
        .setTargetPath('translation');
      src.createAnimation(name).addSampler(sampler).addChannel(channel);
    }
    const bytes = await io.writeBinary(src);
    const transform: {
      pos: [number, number, number];
      rotDeg: [number, number, number];
      scale: [number, number, number];
    } = { pos: [0, 0, 0], rotDeg: [0, 0, 0], scale: [1, 1, 1] };
    const parts = [
      { bytes, name: 'Animal', transform },
      { bytes, name: 'Animal', transform },
    ];
    const composed = await composeSceneGLB(parts, {
      optimize: 'off',
      keepAnimations: true,
      animationNaming: 'instance',
    });
    const result = await io.readBinary(composed.bytes);
    const clips = result.getRoot().listAnimations();
    expect(clips.map((clip) => clip.getName())).toEqual([
      '0:Animal/0:Walk',
      '0:Animal/1:Walk',
      '0:Animal/2:clip',
      '1:Animal/0:Walk',
      '1:Animal/1:Walk',
      '1:Animal/2:clip',
    ]);
    const targets = clips.map((clip) => clip.listChannels()[0]!.getTargetNode());
    expect(targets[0]).not.toBe(targets[3]);
    expect(targets[0]).toBe(targets[1]);
    for (const clip of clips) {
      expect(clip.listChannels()[0]!.getTargetPath()).toBe('translation');
      expect(Array.from(clip.listSamplers()[0]!.getOutput()!.getArray()!)).toEqual([
        0, 0, 0, 0, 1, 0,
      ]);
    }
    const preserved = await io.readBinary(
      (await composeSceneGLB(parts, { optimize: 'off', keepAnimations: true })).bytes,
    );
    expect(
      preserved
        .getRoot()
        .listAnimations()
        .map((clip) => clip.getName()),
    ).toEqual(['Walk', 'Walk', '', 'Walk', 'Walk', '']);
    const staticScene = await io.readBinary(
      (await composeSceneGLB(parts, { animationNaming: 'instance' })).bytes,
    );
    expect(staticScene.getRoot().listAnimations()).toHaveLength(0);
    expect((await io.readBinary(bytes)).getRoot().listAnimations()[0]!.getName()).toBe('Walk');
  });
});

describe('renderPaletteDirective(slots)', () => {
  it('defaults to the canonical palette and adapts to a custom one', () => {
    expect(renderPaletteDirective()).toBe(renderPaletteDirective(OPTIMIZED_PALETTE));
    const custom = renderPaletteDirective([
      {
        index: 0,
        name: 'siding-mint',
        color: '#9fc9a3',
        metalness: 0,
        roughness: 0.8,
        use: 'house siding',
      },
      { index: 1, name: 'asphalt', color: '#45454a', metalness: 0, roughness: 0.9, use: 'road' },
    ]);
    expect(custom).toContain('siding-mint: house siding');
    expect(custom).toContain('asphalt: road');
    // no glass/glow slot → directive says keep everything opaque, names no glass role
    expect(custom).toContain('no transparent role');
  });
});
