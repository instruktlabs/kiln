// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger

import type { ScatterRecipe, TuftRecord } from './scatter';

export const TUFT_RECORD_STRIDE = 12;

export interface GrassGroupManifest {
  readonly id: string;
  readonly offset: number;
  readonly count: number;
}

export interface GrassManifest {
  readonly version: 1;
  readonly recipe: string;
  readonly seed: number;
  readonly format: 'tuft12';
  readonly stride: 12;
  readonly encoding: {
    readonly xzRange: number;
    readonly yRange: number;
    readonly heightMin: number;
    readonly heightMax: number;
  };
  readonly groups: readonly GrassGroupManifest[];
}

export interface BakedScatter {
  readonly bytes: Uint8Array;
  readonly manifest: GrassManifest;
}

export interface TuftBuffers {
  readonly matrices: Float32Array;
  /** Per tuft: world x, world z, stable random seed, vigour. */
  readonly tufts: Float32Array;
  readonly count: number;
}

function clampSigned16(value: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(value)));
}

export function encodeScatter(
  recipeName: string,
  recipe: ScatterRecipe,
  groups: ReadonlyMap<string, readonly TuftRecord[]>,
): BakedScatter {
  const records = [...groups.values()].flat();
  const xzRange = Math.max(1, ...records.flatMap((record) => [Math.abs(record.x), Math.abs(record.z)]));
  const yRange = Math.max(1, ...records.map((record) => Math.abs(record.y)));
  const heightMin = records.length > 0
    ? Math.min(...records.map((record) => record.height))
    : 0.01;
  const heightMax = records.length > 0
    ? Math.max(...records.map((record) => record.height), heightMin + 0.01)
    : 0.02;
  const bytes = new Uint8Array(records.length * TUFT_RECORD_STRIDE);
  const view = new DataView(bytes.buffer);
  const manifestGroups: GrassGroupManifest[] = [];
  let recordOffset = 0;

  for (const groupRecipe of recipe.groups) {
    const group = groups.get(groupRecipe.id);
    if (!group) throw new Error(`No generated records for group "${groupRecipe.id}"`);
    manifestGroups.push({ id: groupRecipe.id, offset: recordOffset, count: group.length });
    for (const record of group) {
      const at = recordOffset * TUFT_RECORD_STRIDE;
      view.setInt16(at, clampSigned16((record.x / xzRange) * 32767), true);
      view.setInt16(at + 2, clampSigned16((record.z / xzRange) * 32767), true);
      view.setInt16(at + 4, clampSigned16((record.y / yRange) * 32767), true);
      view.setUint16(at + 6, Math.round(((record.yaw % (Math.PI * 2)) / (Math.PI * 2)) * 65535), true);
      view.setUint16(at + 8, Math.min(65535, Math.floor(record.seed * 65536)), true);
      view.setUint8(at + 10, Math.round(((record.height - heightMin) / (heightMax - heightMin)) * 255));
      view.setUint8(at + 11, Math.round(record.vigour * 255));
      recordOffset++;
    }
  }

  return {
    bytes,
    manifest: {
      version: 1,
      recipe: recipeName,
      seed: recipe.seed,
      format: 'tuft12',
      stride: TUFT_RECORD_STRIDE,
      encoding: { xzRange, yRange, heightMin, heightMax },
      groups: manifestGroups,
    },
  };
}

export function groupFromManifest(manifest: GrassManifest, id: string): GrassGroupManifest {
  const group = manifest.groups.find((candidate) => candidate.id === id);
  if (!group) throw new Error(`Grass manifest has no group "${id}"`);
  return group;
}

export function decodeTufts(
  source: DataView | ArrayBuffer | ArrayBufferView,
  manifest: GrassManifest,
  group: GrassGroupManifest,
  count = group.count,
  spread = 1,
): TuftBuffers {
  const records = source instanceof DataView
    ? source
    : source instanceof ArrayBuffer
      ? new DataView(source)
      : new DataView(source.buffer, source.byteOffset, source.byteLength);
  const declared = manifest.groups.reduce((sum, entry) => sum + entry.count, 0);
  if (records.byteLength !== declared * manifest.stride) {
    throw new Error(`Grass bytes hold ${records.byteLength / manifest.stride} records; manifest declares ${declared}`);
  }

  const take = Math.min(Math.max(0, Math.floor(count)), group.count);
  const matrices = new Float32Array(take * 16);
  const tufts = new Float32Array(take * 4);
  const { encoding, stride } = manifest;
  const xzScale = encoding.xzRange / 32767;
  const yScale = encoding.yRange / 32767;
  const yawScale = (Math.PI * 2) / 65535;
  const heightSpan = encoding.heightMax - encoding.heightMin;

  for (let index = 0; index < take; index++) {
    const at = (group.offset + index) * stride;
    const x = records.getInt16(at, true) * xzScale;
    const z = records.getInt16(at + 2, true) * xzScale;
    const y = records.getInt16(at + 4, true) * yScale;
    const yaw = records.getUint16(at + 6, true) * yawScale;
    const seed = records.getUint16(at + 8, true) / 65536;
    const scale = encoding.heightMin + heightSpan * (records.getUint8(at + 10) / 255);
    const vigour = records.getUint8(at + 11) / 255;
    const wide = scale * spread;
    const cosine = Math.cos(yaw) * wide;
    const sine = Math.sin(yaw) * wide;
    const matrix = index * 16;
    matrices.set([
      cosine, 0, -sine, 0,
      0, scale, 0, 0,
      sine, 0, cosine, 0,
      x, y, z, 1,
    ], matrix);
    tufts.set([x, z, seed, vigour], index * 4);
  }

  return { matrices, tufts, count: take };
}
