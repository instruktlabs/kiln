// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger

import * as THREE from 'three/webgpu';
import type { TuftBuffers } from '../core/baked';
import {
  DEFAULT_GRASS_PALETTE,
  DEFAULT_GRASS_STYLE,
  makeGrassMaterial,
  STORYBOOK_GRASS_STYLE,
  type GrassMaterialInputs,
  type GrassMaterialStyle,
  type GrassPalette,
} from './grassMaterial';
import {
  buildTuftGeometry,
  FIELD_TUFT,
  STORYBOOK_TUFT,
  type TuftShape,
} from './tuftGeometry';

export interface GrassPreset {
  readonly name: string;
  readonly shape: TuftShape;
  readonly palette: GrassPalette;
  readonly style: GrassMaterialStyle;
}

export const FIELD_GRASS_PRESET: GrassPreset = {
  name: 'field',
  shape: FIELD_TUFT,
  palette: DEFAULT_GRASS_PALETTE,
  style: DEFAULT_GRASS_STYLE,
};

export const STORYBOOK_GRASS_PRESET: GrassPreset = {
  name: 'storybook',
  shape: STORYBOOK_TUFT,
  palette: {
    dark: '#6f8756',
    light: '#a9bc72',
    surround: '#879665',
    wornEarth: '#b99b72',
    sunGlow: '#e8ca83',
  },
  style: STORYBOOK_GRASS_STYLE,
};

export interface GrassLayerOptions extends Omit<GrassMaterialInputs, 'tufts'> {
  /** A complete data preset. Explicit shape, palette, or style wins over it. */
  readonly preset?: GrassPreset;
  readonly shape?: TuftShape;
  readonly name?: string;
}

export interface GrassLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.MeshBasicNodeMaterial;
  dispose(): void;
}

/** Build one instanced draw from decoded baked records. */
export function createGrassLayer(buffers: TuftBuffers, options: GrassLayerOptions = {}): GrassLayer {
  const preset = options.preset ?? FIELD_GRASS_PRESET;
  const geometry = buildTuftGeometry(options.shape ?? preset.shape);
  const tuftAttribute = new THREE.InstancedBufferAttribute(buffers.tufts, 4, false);
  const material = makeGrassMaterial({
    tufts: tuftAttribute,
    timeNode: options.timeNode,
    interaction: options.interaction,
    palette: options.palette ?? preset.palette,
    style: options.style ?? preset.style,
    sunDirection: options.sunDirection,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, buffers.count);
  mesh.name = options.name ?? 'field-grass';
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(buffers.matrices, 16, false);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return {
    mesh,
    material,
    dispose(): void {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
