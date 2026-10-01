// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger

import { mulberry32, shuffleInPlace } from './rng';

export interface ScatterBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ScatterGroupRecipe {
  readonly id: string;
  readonly count: number;
  readonly bounds: ScatterBounds;
  /** A second seed keeps editing one group from moving every other group. */
  readonly seed?: number;
  readonly heightMin?: number;
  readonly heightMax?: number;
}

export interface ScatterRecipe {
  readonly seed: number;
  readonly groups: readonly ScatterGroupRecipe[];
}

export interface TuftSample {
  readonly y: number;
  readonly vigour?: number;
  readonly accept?: boolean;
}

export interface TuftRecord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly seed: number;
  readonly height: number;
  readonly vigour: number;
}

export type TuftSampler = (
  x: number,
  z: number,
  group: ScatterGroupRecipe,
  random: () => number,
) => TuftSample;

/**
 * Produce an exact-count, stratified scatter. Each group is shuffled after
 * placement, so any prefix remains a fair spatial subset for quality tiers.
 */
export function generateScatter(
  recipe: ScatterRecipe,
  sample: TuftSampler = () => ({ y: 0 }),
): Map<string, TuftRecord[]> {
  const result = new Map<string, TuftRecord[]>();

  for (let groupIndex = 0; groupIndex < recipe.groups.length; groupIndex++) {
    const group = recipe.groups[groupIndex]!;
    if (!Number.isInteger(group.count) || group.count < 0) {
      throw new Error(`Scatter group "${group.id}" needs a non-negative integer count`);
    }
    const width = group.bounds.maxX - group.bounds.minX;
    const depth = group.bounds.maxZ - group.bounds.minZ;
    if (!(width > 0) || !(depth > 0)) {
      throw new Error(`Scatter group "${group.id}" has empty bounds`);
    }

    const seed = (group.seed ?? (recipe.seed ^ Math.imul(groupIndex + 1, 0x9e3779b9))) >>> 0;
    const rng = mulberry32(seed);
    const columns = Math.max(1, Math.ceil(Math.sqrt(group.count * (width / depth))));
    const rows = Math.max(1, Math.ceil(group.count / columns));
    const cellWidth = width / columns;
    const cellDepth = depth / rows;
    const records: TuftRecord[] = [];
    const maxAttempts = Math.max(group.count * 16, 64);
    let attempts = 0;

    while (records.length < group.count && attempts < maxAttempts) {
      const cell = attempts % (columns * rows);
      const cycle = Math.floor(attempts / (columns * rows));
      const column = cell % columns;
      const row = Math.floor(cell / columns);
      // A cycle-specific offset avoids retrying a rejected exclusion at the
      // same point while keeping the distribution stratified and reproducible.
      const jitterX = (rng() + cycle * 0.38196601125) % 1;
      const jitterZ = (rng() + cycle * 0.61803398875) % 1;
      const x = group.bounds.minX + (column + jitterX) * cellWidth;
      const z = group.bounds.minZ + (row + jitterZ) * cellDepth;
      const sampled = sample(x, z, group, rng);
      attempts++;
      if (sampled.accept === false) continue;
      const heightMin = group.heightMin ?? 0.7;
      const heightMax = group.heightMax ?? 1.25;
      records.push({
        x,
        y: sampled.y,
        z,
        yaw: rng() * Math.PI * 2,
        seed: rng(),
        height: heightMin + (heightMax - heightMin) * rng(),
        vigour: Math.max(0, Math.min(1, sampled.vigour ?? (0.72 + rng() * 0.28))),
      });
    }

    if (records.length !== group.count) {
      throw new Error(
        `Scatter group "${group.id}" accepted ${records.length}/${group.count} records after ${attempts} attempts`,
      );
    }
    result.set(group.id, shuffleInPlace(records, mulberry32(seed ^ 0xa511e9b3)));
  }

  return result;
}
