// The campus (TASK-FF-CAMPUS-1 items 1 to 3, 7 and 9): data/campus.json is exactly what scripts/build-campus.ts builds
// from the accepted structure exports, and its nine checks pass (seams, negative scale, clear heights, the road
// profile, lanes on the road, the road envelope, extents, the interior fit, dressing clear); the tiers step down in
// every knob; and the committed ffc1 pack (read-only since FF3 changed the layout and the asset map) holds everything
// staged/ff2 holds plus the campus.
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCampus, campusJson, CAMPUS_PATH } from '../../scripts/build-campus';
import { CAMPUS_RELEASE, CAMPUS_STAGED_DIR, compareWithFf2, structureModels, vehicleModels, VEHICLE_TYPES } from '../../scripts/stage-campus';
import { CAMPUS_TIER_NAMES, parseCampus } from '../../src/campus/data';
import { parseDriving } from '../../src/campus/drive/driving';
import { trafficClasses, TrafficSim } from '../../src/campus/drive/traffic-sim';
import { vehicleBodies } from '../../scripts/drive-check';

const PACKAGE = resolve(import.meta.dir, '../..');
const committed = readFileSync(CAMPUS_PATH, 'utf8'), campus = parseCampus(committed);
const DRIVING = parseDriving(readFileSync(resolve(PACKAGE, 'data/driving.json')));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let built: ReturnType<typeof buildCampus> | null = null;
/** The build from the accepted exports (measures every placed mesh; shared by the tests below). */
const build = () => (built ??= buildCampus());
const checkOf = (name: string) => { const c = build().data.checks.find(x => x.name === name); if (!c) throw new Error(`no check ${name}`); return c; };

describe('campus data (items 1 to 3)', () => {
  // Measured 2026-09-30: the build (the twelve structure exports read and measured) and this whole file take about
  // 4 s on this PC; the budget leaves room for a slower runner.
  test('data/campus.json is the build output (build-campus.ts --check) and all nine checks pass', () => {
    const { data, problems } = build();
    expect(problems).toEqual([]);
    expect(campusJson(data)).toBe(committed);
    expect(data.checks.map(c => c.name)).toEqual(['seams', 'negative-scale', 'clear-height', 'road-profile', 'lanes-on-road', 'road-envelope', 'extents', 'interior-fit', 'dressing-clear']);
    for (const c of data.checks) expect({ name: c.name, pass: c.pass }).toEqual({ name: c.name, pass: true });
  }, 60_000);

  test('seams: head and hall meet at the plane in both buildings of each pair, no gap and no envelope cap', () => {
    const m = checkOf('seams').measured as { buildings: Record<string, { pass: boolean; reachPastSeam: { head: number; hall: number }; caps: { envelope: { head: number; hall: number } }; outerOutline: Record<string, { unexplainedM: number }> }> };
    expect(Object.keys(m.buildings).sort()).toEqual(['NE', 'NW', 'SE', 'SW']);
    for (const b of Object.values(m.buildings)) {
      expect(b.pass).toBe(true);
      expect(b.reachPastSeam).toEqual({ head: 0, hall: 0 });
      expect(b.caps.envelope).toEqual({ head: 0, hall: 0 });
      for (const o of Object.values(b.outerOutline)) expect(o.unexplainedM).toBe(0);
    }
  }, 60_000);

  test('clear heights: all eight S5 bridges clear the split road by 29.4 m, full and far shells', () => {
    const m = checkOf('clear-height').measured as { bridges: Record<string, { clearM: number; farClearM: number }> };
    expect(Object.keys(m.bridges)).toHaveLength(8);
    for (const b of Object.values(m.bridges)) { expect(b.clearM).toBeGreaterThanOrEqual(29.4); expect(b.farClearM).toBeGreaterThanOrEqual(29.4); }
  }, 60_000);

  test('road profile: every grade, road, ring and marking vertex lies at the grade height', () => {
    const m = checkOf('road-profile').measured as { vertices: number; maxOffsetFromGradeM: number; gradeY: number };
    expect(m.vertices).toBeGreaterThan(10_000);
    expect(m.maxOffsetFromGradeM).toBe(0);
    expect(m.gradeY).toBe(campus.roads.gradeY);
  }, 60_000);

  test('the road envelope and the lanes: no structure inside the drivable band, every lane a vehicle half width on the road', () => {
    expect((checkOf('road-envelope').measured as { trianglesInside: number }).trianglesInside).toBe(0);
    const lanes = (checkOf('lanes-on-road').measured as { lanes: Record<string, { leastMarginM: number }> }).lanes;
    expect(Object.keys(lanes)).toHaveLength(8);
    for (const l of Object.values(lanes)) expect(l.leastMarginM).toBeGreaterThan(0);
  }, 60_000);
});

describe('tiers (item 7)', () => {
  test('each tier from minimal to high draws full shells farther, parks more cars, runs denser traffic and sees farther', () => {
    const t = CAMPUS_TIER_NAMES.map(name => campus.tiers[name]);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.fullWithin).toBeGreaterThan(t[i - 1]!.fullWithin);
      expect(t[i]!.parking).toBeGreaterThan(t[i - 1]!.parking);
      expect(t[i]!.trafficHeadway).toBeLessThan(t[i - 1]!.trafficHeadway);
      expect(t[i]!.trafficPerLane).toBeGreaterThan(t[i - 1]!.trafficPerLane);
      expect(t[i]!.far).toBeGreaterThan(t[i - 1]!.far);
      t[i]!.trafficLod.forEach((d, k) => expect(d).toBeGreaterThan(t[i - 1]!.trafficLod[k]!));
    }
    expect(t.at(-1)!.parking).toBe(1);
  });

  test('the traffic flow fills the lanes per tier: more vehicles at higher tiers, never more than a lane holds', () => {
    const bodies = vehicleBodies(), classes = trafficClasses(DRIVING.flow, [...VEHICLE_TYPES], type => bodies[type]);
    const counts = CAMPUS_TIER_NAMES.map(name => {
      const tier = campus.tiers[name];
      const sim = new TrafficSim({ lanes: campus.lanes, flow: DRIVING.flow, classes, meanHeadway: tier.trafficHeadway, perLaneMax: tier.trafficPerLane, halfLane: campus.roads.split.lanes.width / 2 });
      sim.populate();
      for (const lane of sim.lanes) expect(lane.length).toBeLessThanOrEqual(tier.trafficPerLane);
      return sim.count;
    });
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThan(counts[i - 1]!);
  });
});

describe('the ffc1 pack (item 9)', () => {
  // FF-C1 staged this pack into a scratch folder from the package data. FF3 changed data/layout.json and
  // data/assets.json (D-42), so a restage from today's data is no longer ffc1: the committed pack is verified in place,
  // read-only (nothing is staged, and staged/generated-ffc1 is not written). tests/unit/ff3-pack.test.ts stages FF3's.
  const ff2 = resolve(PACKAGE, 'staged/ff2/pack.json'), ffc1 = resolve(CAMPUS_STAGED_DIR, 'pack.json');
  test.skipIf(!existsSync(ff2) || !existsSync(ffc1))('holds everything staged/ff2 holds plus the campus data, twelve structures and six vehicles, each at its pinned bytes', () => {
    const out = CAMPUS_STAGED_DIR;
    const manifest = JSON.parse(readFileSync(ffc1, 'utf8')) as { release: string; models: { id: string; path: string }[]; data: Record<string, string>; files: { path: string; bytes: number; sha256: string }[] };
    expect(manifest.release).toBe(CAMPUS_RELEASE);
    // Every listed file is on disk at its recorded bytes and hash, and SHA256SUMS lists it with that hash.
    const sums = readFileSync(resolve(out, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+\*?/));
    for (const f of manifest.files) {
      const bytes = new Uint8Array(readFileSync(resolve(out, f.path)));
      expect({ path: f.path, bytes: bytes.length, sha256: sha(bytes) }).toEqual({ path: f.path, bytes: f.bytes, sha256: f.sha256 });
      expect(sums.some(([hash, path]) => path === f.path && hash === f.sha256)).toBe(true);
    }
    const structures = structureModels(), vehicles = vehicleModels();
    expect(structures).toHaveLength(12);
    expect(vehicles).toHaveLength(6);
    for (const m of [...structures, ...vehicles]) {
      expect(manifest.models.some(x => x.id === m.id && x.path === m.to)).toBe(true);
      const bytes = new Uint8Array(readFileSync(resolve(out, m.to)));
      expect({ id: m.id, bytes: bytes.length, sha256: sha(bytes) }).toEqual({ id: m.id, bytes: m.bytes, sha256: m.sha256 });
    }
    expect(manifest.data.campus).toBe('data/campus.json');
    expect(manifest.data.driving).toBe('data/driving.json');
    expect(readFileSync(resolve(out, 'data/campus.json'), 'utf8')).toBe(committed);
    // The licence names every structure and vehicle with its author and revision, CC0-1.0 with the Farm scope (D-35).
    const licence = readFileSync(resolve(out, 'licenses/ASSET-LICENSE.txt'), 'utf8');
    expect(licence).toContain('SPDX-License-Identifier: CC0-1.0');
    expect(licence).toContain('The campus structures and the vehicles carry the same licence and scope as the Farm pack (DECISIONS D-35).');
    for (const m of [...structures, ...vehicles]) expect(licence).toContain(`${m.to}  ${m.asset}  Kiln revision ${m.revision}  showcase/authors/${m.author}  SHA-256 ${m.sha256}`);
    // Everything staged/ff2 holds, byte-identical except the two recorded extends.
    const same = compareWithFf2(out);
    expect(same.problems).toEqual([]);
    expect(same.changed.map(c => c.path).sort()).toEqual(['data/assets.json', 'licenses/ASSET-LICENSE.txt']);
    expect(same.same + same.changed.length).toBe(same.ff2Files);
  }, 60_000);
});
