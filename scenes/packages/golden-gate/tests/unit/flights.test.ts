// Guided flyovers (SCENE-TASK "Guided flyovers"; keys are data, layout.json `flights`). Every flight is
// sampled exactly as the kit's PathRig plays it (samplePath on linear time) and must keep clear of the
// rendered terrain (the canonical decoder-free tiles of every tier set, the same surface as the web
// tiles), of the water, and of the bridge's geometry; it must never look straight up or down, never
// pass over its own target, and turn and move at a comfortable rate: the view turns at most 40 degrees
// a second, and speed over height above the surface below (terrain, water or deck; the optical flow
// under the camera) stays at most 6 per second. The deck run stays above traffic.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Vector3 } from 'three/webgpu';
import { createCollisionWorld, samplePath } from '@kiln-scenes/scene-kit';
import type { Pose } from '@kiln-scenes/scene-kit';
import { LAYOUT } from '../../scripts/authored-layout';
import { BRIDGE } from '../../src/constants';
import { buildFlights, flightPaths } from '../../src/camera/flights';
import { decodePng } from '../../src/world/png16';
import { heightFieldFromU16 } from '../../src/world/heightfield';
import { roadHeight } from '../../src/world/road';
import { BRIDGE_WEB_GLB, nodeMeshes, roadGridFromBridge } from '../../scripts/layout';
import { CANONICAL_DIR, TILE_KEYS } from '../../scripts/terrain-canonical';
import { stagedBridge, stagedDir } from '../../scripts/release';

const PACKAGE = resolve(import.meta.dir, '../..');
const STAGED = stagedDir();
const SAMPLES_PER_SECOND = 60;
/** Comfort limits: view turn rate and pitch. */
const MAX_TURN_DEG_PER_S = 40, MAX_PITCH_DEG = 75, MIN_TARGET_DISTANCE = 25, MAX_FLOW = 6;
/** Over the deck the deck run keeps this much air above the road (the bus is 3.2 m tall). */
const DECK_RUN_MIN_HEIGHT = 4;

function bridgeBytes(): Uint8Array {
  const staged = stagedBridge('web');
  return readFileSync(existsSync(staged) ? staged : BRIDGE_WEB_GLB);
}

interface Sample { t: number; position: Vector3; target: Vector3 }
function sampleFlight(index: number): Sample[] {
  const def = flightPaths(LAYOUT)[index]!, out: Sample[] = [], pose: Pose = { position: [0, 0, 0], target: [0, 0, 0] };
  const count = Math.ceil(def.seconds * SAMPLES_PER_SECOND);
  for (let i = 0; i <= count; i++) {
    samplePath(def, i / count, pose);
    out.push({ t: i / count * def.seconds, position: new Vector3().fromArray(pose.position), target: new Vector3().fromArray(pose.target) });
  }
  return out;
}

describe('guided flyovers', () => {
  // Measured: the terrain and bridge BVHs build in about 4 s and the checks run in about 2 s on the
  // development PC under load; 60 s leaves room for a cold start.
  test('clear of terrain, water and bridge; comfortable view', async () => {
    const terrain = createCollisionWorld(), bridge = createCollisionWorld();
    for (const key of TILE_KEYS) terrain.add(nodeMeshes(readFileSync(resolve(PACKAGE, CANONICAL_DIR, `${key}.glb`)), 'world'), { key });
    const bytes = bridgeBytes();
    bridge.add(nodeMeshes(bytes, 'GoldenGateBridge'), { key: 'bridge' });
    const road = roadGridFromBridge(bytes);
    const clearance = LAYOUT.flights.clearance, down = new Vector3(), from = new Vector3(), probe = new Vector3();
    /** Height of the highest terrain surface (any tier set) or the water under a point. */
    const ground = (p: Vector3) => { from.set(p.x, 3000, p.z); down.set(p.x, -200, p.z); const d = terrain.rayDistance(from, down); return Math.max(0, 3000 - d); };
    const report: Record<string, unknown> = {};
    flightPaths(LAYOUT).forEach((def, index) => {
      const samples = sampleFlight(index);
      let minTerrain = Infinity, minBridge = Infinity, maxTurn = 0, maxPitch = 0, minTarget = Infinity, maxSpeed = 0, minDeck = Infinity, maxFlow = 0, speed = 0;
      let previous: Vector3 | null = null;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]!, view = s.target.clone().sub(s.position), distance = view.length();
        minTarget = Math.min(minTarget, distance); view.normalize();
        maxPitch = Math.max(maxPitch, Math.abs(Math.asin(view.y)) * 180 / Math.PI);
        if (previous) {
          const dt = s.t - samples[i - 1]!.t;
          maxTurn = Math.max(maxTurn, previous.angleTo(view) * 180 / Math.PI / dt);
          speed = s.position.distanceTo(samples[i - 1]!.position) / dt; maxSpeed = Math.max(maxSpeed, speed);
        }
        previous = view;
        const above = s.position.y - ground(s.position);
        let near = above;
        // Nothing of the terrain within the sphere of the minimum clearance (cliffs beside the path).
        if (above < 50) { probe.copy(s.position); probe.y -= clearance.terrainMinimum; if (terrain.intersects(probe, clearance.terrainMinimum, 2 * clearance.terrainMinimum)) near = 0; }
        minTerrain = Math.min(minTerrain, near);
        probe.copy(s.position); probe.y -= clearance.bridge;
        if (bridge.intersects(probe, clearance.bridge, 2 * clearance.bridge)) minBridge = 0;
        else if (Math.abs(s.position.z) < BRIDGE.roadEndZ + 400 && Math.abs(s.position.x) < 400) {
          // Distance to the bridge where it is close enough to matter (bisected sphere radius, 0.1 m).
          let lo = clearance.bridge, hi = 40;
          probe.copy(s.position); probe.y -= hi;
          if (!bridge.intersects(probe, hi, 2 * hi)) lo = hi;
          else for (let k = 0; k < 9; k++) { const r = (lo + hi) / 2; probe.copy(s.position); probe.y -= r; if (bridge.intersects(probe, r, 2 * r)) hi = r; else lo = r; }
          minBridge = Math.min(minBridge, lo);
        }
        let below = above;
        if (Math.abs(s.position.z) < BRIDGE.roadEndZ && Math.abs(s.position.x) < BRIDGE.roadHalfWidth) {
          const deck = s.position.y - roadHeight(road, s.position.x, s.position.z);
          minDeck = Math.min(minDeck, deck); if (deck > 0) below = Math.min(below, deck);
        }
        maxFlow = Math.max(maxFlow, speed / Math.max(1, below));
      }
      report[def.name] = { minTerrain: +minTerrain.toFixed(2), minBridge: +minBridge.toFixed(2), maxTurnDegPerS: +maxTurn.toFixed(1), maxPitchDeg: +maxPitch.toFixed(1), minTargetDistance: +minTarget.toFixed(1), maxSpeed: +maxSpeed.toFixed(1), maxFlow: +maxFlow.toFixed(2), minAboveDeck: Number.isFinite(minDeck) ? +minDeck.toFixed(2) : null };
    });
    console.log(JSON.stringify(report));
    for (const [name, r] of Object.entries(report) as [string, { minTerrain: number; minBridge: number; maxTurnDegPerS: number; maxPitchDeg: number; minTargetDistance: number; maxFlow: number; minAboveDeck: number | null }][]) {
      expect({ name, ok: r.maxFlow <= MAX_FLOW }).toEqual({ name, ok: true });
      expect({ name, ok: r.minTerrain >= clearance.terrainMinimum }).toEqual({ name, ok: true });
      expect({ name, ok: r.minBridge >= clearance.bridge }).toEqual({ name, ok: true });
      expect({ name, ok: r.maxTurnDegPerS <= MAX_TURN_DEG_PER_S }).toEqual({ name, ok: true });
      expect({ name, ok: r.maxPitchDeg <= MAX_PITCH_DEG }).toEqual({ name, ok: true });
      expect({ name, ok: r.minTargetDistance >= MIN_TARGET_DISTANCE }).toEqual({ name, ok: true });
      if (name === 'deck-run') expect(r.minAboveDeck!).toBeGreaterThanOrEqual(DECK_RUN_MIN_HEIGHT);
    }
    terrain.dispose(); bridge.dispose();
  }, 60_000);

  test('the runtime terrain check accepts every flight on the collision grid', async () => {
    const scene = JSON.parse(readFileSync(resolve(STAGED, 'data/scene.json'), 'utf8')) as { terrain: { collision: { path: string; bounds: [number, number, number, number]; metresPerUnit: number; size: [number, number] } } };
    const spec = scene.terrain.collision, bytes = readFileSync(resolve(STAGED, spec.path));
    const png = await decodePng(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const flights = buildFlights(heightFieldFromU16(png.data as Uint16Array, png.width, png.height, spec.bounds, spec.metresPerUnit), LAYOUT);
    for (const info of Object.values(flights.info)) expect(info.minClearance).toBeGreaterThanOrEqual(LAYOUT.flights.clearance.terrainMinimum);
    expect(flights.info['fog-roll'].requiresPreset).toBe('fog');
  });
});
