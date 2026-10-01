// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger

import * as THREE from 'three/webgpu';
import { wakeSampleResponse } from '../core/recovery';

export const INTERACTION_KIND_OFFSET = 64;

export interface InteractionFootprint {
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly falloff: number;
}

export interface GrassInteractor {
  /** Stable integer in [0, maxBodies). It owns one zero-allocation trail. */
  readonly slot: number;
  readonly x: number;
  readonly z: number;
  /** Heading in radians, with local forward along +x. */
  readonly heading: number;
  /** Selects footprints[0] or footprints[1]. */
  readonly kind?: 0 | 1;
  readonly active?: boolean;
}

export interface InteractionFieldConfig {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** World-space resolution of the accumulated deformation texture. */
  readonly cellSize: number;
  readonly maxBodies: number;
  readonly ghostsPerBody: number;
  /** Seconds for a newly deposited wake sample to reach full strength. */
  readonly ghostBirthDuration: number;
  /** A new wake sample is emitted only after the body moves this far. */
  readonly minGhostDistance: number;
  /** Seconds until the shared recovery curve reaches exact zero. */
  readonly maxAge: number;
  readonly strength: number;
  /** Downward displacement as a fraction of horizontal interaction strength. */
  readonly flattenRatio: number;
  /** Maximum sideways fan applied across an interactor footprint. */
  readonly lateralSpread: number;
  /** Stable per-blade angular variation in radians around the accumulated force. */
  readonly bladeDirectionSpread: number;
  readonly footprints: readonly [InteractionFootprint, InteractionFootprint];
}

export const DEFAULT_INTERACTION_CONFIG: InteractionFieldConfig = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50,
  cellSize: 0.5,
  maxBodies: 32,
  ghostsPerBody: 8,
  ghostBirthDuration: 0.135,
  minGhostDistance: 0.58,
  maxAge: 0.92,
  strength: 0.58,
  flattenRatio: 0.72,
  lateralSpread: 0.28,
  bladeDirectionSpread: 1.75,
  footprints: [
    { halfLength: 1.16, halfWidth: 0.48, falloff: 0.68 },
    { halfLength: 1.68, halfWidth: 0.6, falloff: 0.68 },
  ],
};

export interface InteractionField {
  readonly config: InteractionFieldConfig;
  /** RGBA32F diagnostics: x, z, heading + kind * offset, age. */
  readonly interactors: THREE.DataTexture;
  /** RGBA8 signed deformation vector plus aggregate influence, linearly filtered. */
  readonly deformation: THREE.DataTexture;
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly activeInteractorCount: number;
  update(dt: number, bodies: readonly GrassInteractor[]): void;
  reset(): void;
  dispose(): void;
}

function recordTexture(data: Float32Array, width: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function deformationTexture(data: Uint8Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function encodeSigned(value: number, limit: number): number {
  if (limit <= 0) return 128;
  return Math.round(clamp(value / limit, -1, 1) * 127 + 128);
}

export function createInteractionField(
  overrides: Partial<InteractionFieldConfig> = {},
): InteractionField {
  const config: InteractionFieldConfig = {
    ...DEFAULT_INTERACTION_CONFIG,
    ...overrides,
    footprints: overrides.footprints ?? DEFAULT_INTERACTION_CONFIG.footprints,
  };
  if (
    config.maxX <= config.minX
    || config.maxZ <= config.minZ
    || config.maxBodies < 1
    || config.ghostsPerBody < 0
    || config.cellSize <= 0
    || config.strength <= 0
    || config.flattenRatio <= 0
    || config.lateralSpread < 0
    || config.bladeDirectionSpread < 0
    || config.ghostBirthDuration <= 0
    || config.minGhostDistance <= 0
    || config.maxAge <= 0
  ) {
    throw new Error('Interaction field needs ordered bounds and positive resolution, timing, and strength');
  }

  const gridColumns = Math.max(1, Math.ceil((config.maxX - config.minX) / config.cellSize));
  const gridRows = Math.max(1, Math.ceil((config.maxZ - config.minZ) / config.cellSize));
  const maxInteractors = config.maxBodies * (config.ghostsPerBody + 1);
  const interactorData = new Float32Array(maxInteractors * 4);
  const deformationData = new Uint8Array(gridColumns * gridRows * 4);
  const accumulation = new Float32Array(gridColumns * gridRows * 4);
  const interactors = recordTexture(interactorData, maxInteractors);
  const deformation = deformationTexture(deformationData, gridColumns, gridRows);
  const trailData = new Float32Array(config.maxBodies * config.ghostsPerBody * 4);
  const trailTime = new Float32Array(config.maxBodies * config.ghostsPerBody).fill(-Infinity);
  const lastGhostX = new Float64Array(config.maxBodies);
  const lastGhostZ = new Float64Array(config.maxBodies);
  const lastGhostHeading = new Float32Array(config.maxBodies);
  const lastGhostKind = new Uint8Array(config.maxBodies);
  const lastGhostValid = new Uint8Array(config.maxBodies);
  const activeSlots = new Uint8Array(config.maxBodies);
  const presentSlots = new Uint8Array(config.maxBodies);
  const ghostCursor = new Uint32Array(config.maxBodies);
  const lastObservedX = new Float64Array(config.maxBodies);
  const lastObservedZ = new Float64Array(config.maxBodies);
  let elapsed = 0;
  let count = 0;

  function clearDeformation(): void {
    accumulation.fill(0);
    for (let base = 0; base < deformationData.length; base += 4) {
      deformationData[base] = 128;
      deformationData[base + 1] = 128;
      deformationData[base + 2] = 128;
      deformationData[base + 3] = 0;
    }
  }

  function accumulate(
    x: number,
    z: number,
    heading: number,
    kind: 0 | 1,
    age: number,
    live: boolean,
  ): void {
    if (count >= maxInteractors) return;
    const record = count++;
    const recordBase = record * 4;
    interactorData[recordBase] = x;
    interactorData[recordBase + 1] = z;
    interactorData[recordBase + 2] = heading + kind * INTERACTION_KIND_OFFSET;
    interactorData[recordBase + 3] = live ? 0 : Math.max(age, 0.0002);

    const response = live
      ? 1
      : wakeSampleResponse(age, config.maxAge, config.ghostBirthDuration);
    if (response <= 0) return;

    const footprint = config.footprints[kind];
    const influence = Math.max(footprint.halfLength, footprint.halfWidth) + footprint.falloff;
    const x0 = Math.max(0, Math.floor((x - influence - config.minX) / config.cellSize));
    const x1 = Math.min(gridColumns - 1, Math.floor((x + influence - config.minX) / config.cellSize));
    const z0 = Math.max(0, Math.floor((z - influence - config.minZ) / config.cellSize));
    const z1 = Math.min(gridRows - 1, Math.floor((z + influence - config.minZ) / config.cellSize));
    const forwardX = Math.cos(heading);
    const forwardZ = Math.sin(heading);
    const rightX = forwardZ;
    const rightZ = -forwardX;

    for (let zCell = z0; zCell <= z1; zCell++) {
      const cellZ = config.minZ + (zCell + 0.5) * config.cellSize;
      for (let xCell = x0; xCell <= x1; xCell++) {
        const cellX = config.minX + (xCell + 0.5) * config.cellSize;
        const offsetX = cellX - x;
        const offsetZ = cellZ - z;
        const localX = offsetX * rightX + offsetZ * rightZ;
        const localZ = offsetX * forwardX + offsetZ * forwardZ;
        const qx = Math.abs(localX) - footprint.halfWidth;
        const qz = Math.abs(localZ) - footprint.halfLength;
        const sdf = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
        if (sdf >= footprint.falloff) continue;
        const edge = clamp(sdf / footprint.falloff, 0, 1);
        const press = 1 - edge * edge * (3 - 2 * edge);
        const strength = press * response * config.strength;
        const lateral = clamp(localX / Math.max(footprint.halfWidth, 0.001), -1, 1);
        const bendX = forwardX + rightX * lateral * config.lateralSpread;
        const bendZ = forwardZ + rightZ * lateral * config.lateralSpread;
        const bendLength = Math.max(0.0001, Math.hypot(bendX, bendZ));
        const cellBase = (zCell * gridColumns + xCell) * 4;
        accumulation[cellBase] = accumulation[cellBase]! + bendX / bendLength * strength;
        accumulation[cellBase + 1] = accumulation[cellBase + 1]! + bendZ / bendLength * strength;
        accumulation[cellBase + 2] = accumulation[cellBase + 2]! - strength * config.flattenRatio;
        accumulation[cellBase + 3] = Math.max(accumulation[cellBase + 3]!, press * response);
      }
    }
  }

  function finalizeDeformation(): void {
    const verticalLimit = config.strength * config.flattenRatio;
    for (let base = 0; base < accumulation.length; base += 4) {
      let x = accumulation[base]!;
      let z = accumulation[base + 1]!;
      const magnitude = Math.hypot(x, z);
      if (magnitude > config.strength) {
        const scale = config.strength / magnitude;
        x *= scale;
        z *= scale;
      }
      const y = clamp(accumulation[base + 2]!, -verticalLimit, verticalLimit * 0.5);
      deformationData[base] = encodeSigned(x, config.strength);
      deformationData[base + 1] = encodeSigned(z, config.strength);
      deformationData[base + 2] = encodeSigned(y, verticalLimit);
      deformationData[base + 3] = Math.round(clamp(accumulation[base + 3]!, 0, 1) * 255);
    }
  }

  function reset(): void {
    elapsed = 0;
    count = 0;
    ghostCursor.fill(0);
    interactorData.fill(0);
    trailData.fill(0);
    trailTime.fill(-Infinity);
    lastGhostX.fill(0);
    lastGhostZ.fill(0);
    lastGhostHeading.fill(0);
    lastGhostKind.fill(0);
    lastGhostValid.fill(0);
    lastObservedX.fill(0);
    lastObservedZ.fill(0);
    activeSlots.fill(0);
    presentSlots.fill(0);
    clearDeformation();
    interactors.needsUpdate = true;
    deformation.needsUpdate = true;
  }

  reset();

  return {
    config,
    interactors,
    deformation,
    gridColumns,
    gridRows,
    get activeInteractorCount(): number {
      return count;
    },
    update(dt, bodies): void {
      elapsed += Math.max(0, dt);
      presentSlots.fill(0);
      for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex++) {
        const body = bodies[bodyIndex]!;
        if (body.active === false || body.slot < 0 || body.slot >= config.maxBodies) continue;
        presentSlots[body.slot] = 1;
      }
      for (let slot = 0; slot < config.maxBodies; slot++) {
        if (presentSlots[slot] !== 0 || activeSlots[slot] === 0) continue;
        activeSlots[slot] = 0;
        lastGhostValid[slot] = 0;
        for (let ghost = 0; ghost < config.ghostsPerBody; ghost++) {
          trailTime[slot * config.ghostsPerBody + ghost] = -Infinity;
        }
      }

      if (config.ghostsPerBody > 0) {
        for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex++) {
          const body = bodies[bodyIndex]!;
          if (body.active === false || body.slot < 0 || body.slot >= config.maxBodies) continue;
          const bodySlot = body.slot;
          activeSlots[bodySlot] = 1;
          if (lastGhostValid[bodySlot] === 0) {
            lastGhostX[bodySlot] = body.x;
            lastGhostZ[bodySlot] = body.z;
            lastGhostHeading[bodySlot] = body.heading;
            lastGhostKind[bodySlot] = body.kind ?? 0;
            lastGhostValid[bodySlot] = 1;
            lastObservedX[bodySlot] = body.x;
            lastObservedZ[bodySlot] = body.z;
            continue;
          }
          const previousX = lastObservedX[bodySlot]!;
          const previousZ = lastObservedZ[bodySlot]!;
          const frameDx = body.x - previousX;
          const frameDz = body.z - previousZ;
          const frameDistance = Math.hypot(frameDx, frameDz);
          let anchorDx = body.x - lastGhostX[bodySlot]!;
          let anchorDz = body.z - lastGhostZ[bodySlot]!;
          let anchorDistance = Math.hypot(anchorDx, anchorDz);
          while (anchorDistance + config.minGhostDistance * 1e-4 >= config.minGhostDistance) {
            const cursor = ghostCursor[bodySlot]! % config.ghostsPerBody;
            const trail = bodySlot * config.ghostsPerBody + cursor;
            const existingAge = elapsed - trailTime[trail]!;
            if (existingAge >= config.maxAge) {
              trailData[trail * 4] = lastGhostX[bodySlot]!;
              trailData[trail * 4 + 1] = lastGhostZ[bodySlot]!;
              trailData[trail * 4 + 2] = lastGhostHeading[bodySlot]!;
              trailData[trail * 4 + 3] = lastGhostKind[bodySlot]!;
              const directionX = anchorDx / anchorDistance;
              const directionZ = anchorDz / anchorDistance;
              const crossingX = lastGhostX[bodySlot]! + directionX * config.minGhostDistance;
              const crossingZ = lastGhostZ[bodySlot]! + directionZ * config.minGhostDistance;
              const alongFrame = frameDistance > 0
                ? ((crossingX - previousX) * frameDx + (crossingZ - previousZ) * frameDz)
                  / (frameDistance * frameDistance)
                : 1;
              trailTime[trail] = elapsed - Math.max(0, dt) * (1 - clamp(alongFrame, 0, 1));
              ghostCursor[bodySlot] = ghostCursor[bodySlot]! + 1;
            }
            const directionX = anchorDx / anchorDistance;
            const directionZ = anchorDz / anchorDistance;
            lastGhostX[bodySlot] = lastGhostX[bodySlot]! + directionX * config.minGhostDistance;
            lastGhostZ[bodySlot] = lastGhostZ[bodySlot]! + directionZ * config.minGhostDistance;
            lastGhostHeading[bodySlot] = body.heading;
            lastGhostKind[bodySlot] = body.kind ?? 0;
            anchorDx = body.x - lastGhostX[bodySlot]!;
            anchorDz = body.z - lastGhostZ[bodySlot]!;
            anchorDistance = Math.hypot(anchorDx, anchorDz);
          }
          lastObservedX[bodySlot] = body.x;
          lastObservedZ[bodySlot] = body.z;
        }
      }

      count = 0;
      interactorData.fill(0);
      clearDeformation();
      for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex++) {
        const body = bodies[bodyIndex]!;
        if (body.active === false || body.slot < 0 || body.slot >= config.maxBodies) continue;
        accumulate(body.x, body.z, body.heading, body.kind ?? 0, 0, true);
        for (let ghost = 0; ghost < config.ghostsPerBody; ghost++) {
          const trail = body.slot * config.ghostsPerBody + ghost;
          const age = elapsed - trailTime[trail]!;
          if (age < 0 || age > config.maxAge) continue;
          accumulate(
            trailData[trail * 4]!,
            trailData[trail * 4 + 1]!,
            trailData[trail * 4 + 2]!,
            trailData[trail * 4 + 3] === 1 ? 1 : 0,
            age,
            false,
          );
        }
      }
      finalizeDeformation();
      interactors.needsUpdate = true;
      deformation.needsUpdate = true;
    },
    reset,
    dispose(): void {
      interactors.dispose();
      deformation.dispose();
    },
  };
}
