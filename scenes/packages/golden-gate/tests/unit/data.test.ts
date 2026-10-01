// D-21: the scene's truth is data. These tests check the data files field by field (the JSON imports
// are typed by assertion), that the lanes match the bridge's roadway, and that the modules the
// renderer uses expose exactly the data's values.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DRIVING_DATA, LAYOUT, PRESET_DATA, TIER_DATA, TRAFFIC_DATA, WATER_DATA } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { BRIDGE, CAMERA, LANE_CENTERS, NAMED_CAMERAS, POSTCARD, laneDirection, laneX } from '../../src/constants';
import { PRESETS, PRESET_ORDER } from '../../src/presets';
import { FEATURES, goldenGateTiers } from '../../src/tiers';
import { CLASS_TABLE, TRAFFIC_FLOW, laneStation } from '../../src/traffic/config';
import { VEHICLE_TYPES } from '../../scripts/stage';
import { BRIDGE_WEB_GLB, laneDrift, roadGridFromBridge } from '../../scripts/layout';
import { stagedBridge } from '../../scripts/release';
import { roadHeight } from '../../src/world/road';
import { fogFactor } from '../../src/world/fog';

const PACKAGE = resolve(import.meta.dir, '../..');
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const vec3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(finite);
/** The approved bridge bytes: the staged copy when present (identical to the source by staging's check), else the source. */
function bridgeBytes(): Uint8Array {
  const staged = stagedBridge('web');
  return readFileSync(existsSync(staged) ? staged : BRIDGE_WEB_GLB);
}

describe('layout.json', () => {
  test('flight easing names', () => {
    for (const path of LAYOUT.flights.paths) expect([undefined, 'ease-in-out', 'smoothstep']).toContain(path.easing);
  });
  test('frame, bridge and placements', () => {
    expect(LAYOUT.schema).toBe('golden-gate-layout/1');
    for (const key of ['units', 'frame', 'colours', 'generated', 'behaviour']) expect(typeof LAYOUT.conventions[key]).toBe('string');
    for (const key of ['towerZ', 'towerTop', 'roadHalfWidth', 'roadEndZ', 'medianHalfWidth', 'medianTop', 'curbOuter', 'suspenderInner', 'railOuter'] as const) expect(finite(BRIDGE[key])).toBe(true);
    expect(BRIDGE.obstructionNodes.length).toBeGreaterThan(5);
    const ids = LAYOUT.placements.map(p => p.id);
    expect(ids).toEqual(['bridge', 'terrain', 'water', 'fog-banks', 'traffic', 'player-car']);
    for (const p of LAYOUT.placements) if ('position' in p) expect(vec3(p.position)).toBe(true);
    for (const file of Object.values(LAYOUT.files)) if (file !== 'scene.json') expect(existsSync(resolve(PACKAGE, 'data', file))).toBe(true);
  });

  test('six mirrored lanes over the whole route, approach end to approach end', () => {
    expect(LAYOUT.lanes.map(l => l.id)).toEqual(['nb-inner', 'nb-middle', 'nb-outer', 'sb-inner', 'sb-middle', 'sb-outer']);
    LAYOUT.lanes.forEach((lane, i) => {
      expect(lane.index).toBe(i);
      expect(laneX(i)).toBe(lane.x);
      expect(laneDirection(i)).toBe(lane.direction === 'north' ? 1 : -1);
      expect(Math.abs(Math.abs(lane.x) - LANE_CENTERS[i % 3]!)).toBeLessThan(1e-9);
      // Lanes sit between the median and the curb, centred in thirds of the carriageway.
      expect(Math.abs(lane.x)).toBeCloseTo(BRIDGE.medianHalfWidth + (BRIDGE.roadHalfWidth - BRIDGE.medianHalfWidth) / 3 * (i % 3 + .5), 4);
      // The polyline is the lane on the Roadway, deck end to deck end; the lane itself runs on over both
      // approach roads to their ends (entry and exit, at route stations `stations`).
      const sign = lane.direction === 'north' ? 1 : -1, ends = LAYOUT.approaches;
      expect(lane.polyline[0]![2]).toBeCloseTo(-sign * BRIDGE.roadEndZ, 6);
      expect(lane.polyline.at(-1)![2]).toBeCloseTo(sign * BRIDGE.roadEndZ, 6);
      expect(lane.stations[0]).toBeCloseTo(sign > 0 ? -(BRIDGE.roadEndZ + ends.south.length) : BRIDGE.roadEndZ + ends.north.length, 6);
      expect(lane.stations[1]).toBeCloseTo(sign > 0 ? BRIDGE.roadEndZ + ends.north.length : -(BRIDGE.roadEndZ + ends.south.length), 6);
      expect(vec3(lane.entry) && vec3(lane.exit)).toBe(true);
      for (let k = 1; k < lane.polyline.length; k++) {
        const a = lane.polyline[k - 1]!, b = lane.polyline[k]!, dz = (b[2] - a[2]) * sign;
        expect(a[0]).toBe(lane.x);
        expect(dz).toBeGreaterThan(0);
      }
      expect(finite(lane.speed) && lane.speed > 15 && lane.speed < 25).toBe(true);
      for (const cls of lane.classes) expect(VEHICLE_TYPES as readonly string[]).toContain(cls);
      // laneStation walks the lane from its entry station to its exit station.
      expect(laneStation(i, 0)).toBeCloseTo(lane.stations[0], 6);
      expect(laneStation(i, TRAFFIC_FLOW.laneLength)).toBeCloseTo(lane.stations[1], 6);
    });
  });

  test('lane polylines match the bridge Roadway (layout.ts --check)', () => {
    const grid = roadGridFromBridge(bridgeBytes());
    expect(laneDrift(LAYOUT, grid)).toBeLessThanOrEqual(.002);
    // Between polyline vertices the straight segments stay on the deck within 1 cm.
    let worst = 0;
    for (const lane of LAYOUT.lanes) for (let k = 1; k < lane.polyline.length; k++) {
      const a = lane.polyline[k - 1]!, b = lane.polyline[k]!;
      for (let t = .05; t < 1; t += .05) worst = Math.max(worst, Math.abs(a[1] + (b[1] - a[1]) * t - roadHeight(grid, lane.x, a[2] + (b[2] - a[2]) * t)));
    }
    console.log(JSON.stringify({ laneSegmentDeviation: +worst.toFixed(4) }));
    expect(worst).toBeLessThan(.01);
  });

  test('cameras', () => {
    expect(CAMERA.near).toBe(.5); expect(CAMERA.far).toBe(160_000);
    expect(CAMERA.orbit.maxPolar).toBeCloseTo(Math.PI * .497, 4);
    expect(Object.keys(NAMED_CAMERAS)).toContain(LAYOUT.cameras.default);
    expect(POSTCARD.position).toEqual(LAYOUT.cameras.named.postcard!.position);
    for (const [name, pose] of Object.entries(LAYOUT.cameras.named)) {
      expect(vec3(pose.position) && vec3(pose.target)).toBe(true);
      expect(pose.fov > 20 && pose.fov < 90).toBe(true);
      expect(NAMED_CAMERAS[name]!.note.length).toBeGreaterThan(10);
    }
    for (const name of LAYOUT.cameras.waterReview) expect(LAYOUT.cameras.named[name]).toBeDefined();
    for (const value of Object.values(LAYOUT.cameras.chase)) if (typeof value === 'number') expect(finite(value)).toBe(true);
  });

  test('flights, fog banks, lights', () => {
    expect(LAYOUT.flights.paths.map(p => p.name)).toEqual(['postcard-sweep', 'tower-rise', 'fog-roll', 'deck-run']);
    for (const path of LAYOUT.flights.paths) {
      expect(path.keys.length).toBeGreaterThanOrEqual(2);
      for (const key of path.keys) { expect(vec3(key.position) && vec3(key.target)).toBe(true); expect(key.fov > 30 && key.fov < 80).toBe(true); }
      const given = path.keys.slice(1).filter(k => k.seconds !== undefined).reduce((s, k) => s + k.seconds!, 0);
      if (path.keys.slice(1).every(k => k.seconds !== undefined)) expect(given).toBeCloseTo(path.seconds, 6); else expect(given).toBeLessThan(path.seconds);
    }
    const fog = LAYOUT.fogBanks;
    expect(fog.banks.length).toBe(TIER_DATA.features.high.fogBanks);
    for (const bank of fog.banks) { expect([bank.x, bank.y, bank.z, ...bank.spread, bank.puffs].every(finite)).toBe(true); expect(bank.x).toBeLessThan(fog.wrap.west); expect(bank.x).toBeGreaterThan(fog.wrap.east); }
    const lamps = LAYOUT.lights.vehicleLamps;
    expect(Object.values(lamps.materials).sort()).toEqual(['brake', 'head', 'tail']);
    for (const k of ['head', 'tail', 'brake'] as const) expect(lamps.gain[k].every(finite)).toBe(true);
    expect(LAYOUT.lights.bridgeLamps.materials).toEqual(['LampGlass', 'BeaconEmissive']);
    expect(LAYOUT.referenceColours.internationalOrange).toBe('#C0362C');
  });
});

describe('presets.json', () => {
  test('three presets with every value', () => {
    expect(PRESET_DATA.order).toEqual([...PRESET_ORDER]);
    const fields = Object.keys(PRESET_DATA.presets.day!).sort();
    for (const name of PRESET_ORDER) {
      const data = PRESET_DATA.presets[name]!;
      expect(Object.keys(data).sort()).toEqual(fields);
      for (const [key, value] of Object.entries(data)) if (key !== 'label') expect(finite(value) || vec3(value)).toBe(true);
      // The scene's preset: the data minus its label, with the sun direction resolved from azimuth and elevation.
      const preset = PRESETS[name], a = data.sunAzimuthDeg * Math.PI / 180, e = data.sunElevationDeg * Math.PI / 180;
      expect(preset.sunDir[0]).toBeCloseTo(Math.cos(e) * Math.cos(a), 12);
      expect(preset.sunDir[1]).toBeCloseTo(Math.sin(e), 12);
      expect(preset.sunDir[2]).toBeCloseTo(Math.cos(e) * Math.sin(a), 12);
      expect(preset.exposure).toBe(data.exposure);
      expect('label' in preset || 'sunAzimuthDeg' in preset).toBe(false);
    }
  });
  test('Fog keeps the water in fog while the far tower and the span read from the postcard', () => {
    // Owner decision 2026-09-29 (fix round 1, item 7). fogFactor is the CPU twin of the scene's fog node. The
    // g1 densities fogged the far (south) tower at mid-height 0.38 and the mid-span deck 0.45 from the postcard.
    const fog = PRESETS.fog, from = POSTCARD.position;
    const layers = [{ density: fog.hazeDensity, height: fog.hazeHeight }, { density: fog.marineDensity, height: fog.marineHeight }];
    expect(fogFactor(layers, from, [0, 150, -BRIDGE.towerZ])).toBeLessThan(.25);  // far tower, mid-height
    expect(fogFactor(layers, from, [0, 76, 0])).toBeLessThan(.33);                // mid-span deck
    expect(fogFactor(layers, from, [300, 0, 100])).toBeGreaterThan(.55);          // the water 1 km out stays in fog
  });
});

describe('tiers.json', () => {
  test('feature levels and the SPEC 21.1 map', () => {
    for (const level of ['high', 'medium', 'low'] as const) {
      const f = FEATURES[level];
      expect(f.feature).toBe(level); expect(f.terrainSet).toBe(level);
      const [lod1, lod2, cull] = f.traffic.lod;
      expect(lod1 < lod2 && lod2 < cull).toBe(true);
    }
    // Owner contract: LOD1 from about 60 m, LOD2 from about 250 m, cull at 1.5 km (Low shortens them).
    expect(FEATURES.high.traffic.lod).toEqual([60, 250, 1500]);
    expect(FEATURES.medium.traffic.lod).toEqual([60, 250, 1500]);
    // One shadow cascade at High only; contact shadows under the vehicles where there is no shadow map.
    for (const level of ['high', 'medium', 'low'] as const) expect(FEATURES[level].traffic.contactShadow > 0).toBe(!FEATURES[level].shadows.enabled);
    expect(FEATURES.high.shadows).toMatchObject({ enabled: true, cascades: 1 });
    expect(FEATURES.medium.shadows.enabled || FEATURES.low.shadows.enabled).toBe(false);
    const desktop = { form: 'desktop' } as never, phone = { form: 'phone' } as never;
    const resolveTier = (name: 'minimal' | 'economy' | 'balanced' | 'high', device: never) => { const t = (goldenGateTiers as unknown as Record<string, unknown>)[name]; return (typeof t === 'function' ? t(device) : t) as { gg: { feature: string }; pixelRatioCap: number; shadows: { enabled: boolean; maxCasters: number } }; };
    expect(resolveTier('minimal', desktop).gg.feature).toBe('low');
    expect(resolveTier('economy', desktop).gg.feature).toBe('low');
    expect(resolveTier('balanced', desktop).gg.feature).toBe('medium');
    expect(resolveTier('high', desktop).gg.feature).toBe('high');
    expect(resolveTier('high', phone).gg.feature).toBe('medium');
    expect(resolveTier('high', desktop).shadows).toMatchObject({ enabled: true, maxCasters: 1 });
    expect(resolveTier('high', phone).shadows.enabled).toBe(false);
    expect(resolveTier('minimal', desktop).pixelRatioCap).toBe(TIER_DATA.tiers.minimal.pixelRatioCap);
  });
});

describe('traffic.json and water.json', () => {
  test('vehicles, palette and flow', () => {
    expect(Object.keys(TRAFFIC_DATA.vehicles).sort()).toEqual([...VEHICLE_TYPES].sort());
    expect(Object.values(TRAFFIC_DATA.vehicles).reduce((s, v) => s + v.weight, 0)).toBeCloseTo(1, 9);
    expect(TRAFFIC_DATA.palette.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(100, 9);
    for (const p of TRAFFIC_DATA.palette) expect(p.srgb.every(c => Number.isInteger(c) && c >= 0 && c <= 255)).toBe(true);
    // Trucks and buses stay out of the inner lanes; cars may use every lane.
    expect(CLASS_TABLE['box-truck'].lanes).toEqual([1, 2]);
    expect(CLASS_TABLE['transit-bus'].lanes).toEqual([1, 2]);
    expect(CLASS_TABLE.sedan.lanes).toEqual([0, 1, 2]);
    expect(TRAFFIC_FLOW.laneSpeeds).toEqual([22, 20.5, 19]);
    expect(TRAFFIC_FLOW.laneLength).toBeCloseTo(2 * BRIDGE.roadEndZ + LAYOUT.approaches.south.length + LAYOUT.approaches.north.length, 6);
    // Vehicles fade only inside the dissolve stretches at the approach ends.
    for (const name of ['south', 'north'] as const) {
      const [from, to] = LAYOUT.approaches[name].ends.dissolve;
      expect(TRAFFIC_FLOW.fade).toBeLessThanOrEqual(to - from); expect(to).toBe(LAYOUT.approaches[name].length);
    }
    expect(TRAFFIC_FLOW.seed).toBe(0x6a7e);
    for (const value of Object.values(TRAFFIC_DATA.idm)) expect(finite(value)).toBe(true);
  });

  test('water parameters', () => {
    expect(WATER_DATA.waves.length).toBe(6);
    for (const w of WATER_DATA.waves) expect([w.wavelength, w.amplitude, w.direction, w.steepness].every(finite)).toBe(true);
    // Longest first: tiers displace with the leading waves.
    for (let i = 1; i < WATER_DATA.waves.length; i++) expect(WATER_DATA.waves[i]!.wavelength).toBeLessThan(WATER_DATA.waves[i - 1]!.wavelength);
    expect(WATER_DATA.detailLayers.length).toBe(3);
    expect(WATER_DATA.macroTiles.length).toBe(2);
  });
});

describe('driving.json', () => {
  test('vehicle, start, dynamics, controls', () => {
    const d = DRIVING_DATA;
    expect(d.schema).toBe('golden-gate-driving/1');
    expect(VEHICLE_TYPES).toContain(d.vehicle as typeof VEHICLE_TYPES[number]);
    expect(TRAFFIC_DATA.palette.map(p => p.name)).toContain(d.paint);
    const lane = LAYOUT.lanes.find(l => l.id === d.start.lane)!;
    expect(lane).toBeDefined();
    expect(d.start.window[0]).toBeLessThanOrEqual(d.start.z); expect(d.start.z).toBeLessThanOrEqual(d.start.window[1]);
    // The start window lies on the deck, well short of the end stops on the approach roads.
    const stop = BRIDGE.roadEndZ;
    expect(Math.min(...d.start.window)).toBeGreaterThan(-stop); expect(Math.max(...d.start.window)).toBeLessThan(stop);
    for (const value of [d.topSpeed, d.accel, d.brake, d.handbrake, d.start.speed, d.reverse.accel, d.reverse.maxSpeed, d.reverse.afterStopSeconds,
      d.coast.constant, d.coast.quadratic, d.steer.rateDegPerSecond, d.steer.fullRateSpeed, d.curb.clearance, d.curb.speedKept, d.curb.cooldown, d.curb.bumpDeg,
      d.traffic.minGap, d.traffic.followGain, d.traffic.lateralMargin, d.traffic.longitudinalMargin, d.roadEnd.promptDistance, d.roadEnd.stopDistance, d.roadEnd.fadeSeconds, d.roadEnd.holdSeconds])
      expect(finite(value) && value >= 0).toBe(true);
    for (const pair of [d.steer.headingDeg, d.steer.wheelDeg]) { expect(pair.length).toBe(2); expect(pair[0]).toBeGreaterThanOrEqual(pair[1]); }
    expect(d.start.speed).toBeLessThanOrEqual(d.topSpeed); expect(d.curb.speedKept).toBeLessThanOrEqual(1);
    expect(d.roadEnd.promptDistance).toBeGreaterThan(d.roadEnd.stopDistance);
    for (const keys of Object.values(d.controls)) expect(keys.length).toBeGreaterThan(0);
    // No key does two things.
    const all = Object.values(d.controls).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

export type { Vec3 };
