import { describe, expect, test } from 'bun:test';
import { coverageToDistance, ensureVehicleWheelLod, inspectVehicleGlb, loaderDraws, parseGlb, sha256Of } from './vehicle-glb.mjs';
import { coverageAt, glbBytes, sha, vehicleJson } from './vehicle-test-fixtures';

/** The fixture's LOD0 body is 4.2 x 1.15 x 1.8 m; each of its four tyres is 0.6 x 0.6 x 0.2 m. */
const bodyRadius = 0.5 * Math.hypot(4.2, 1.15, 1.8);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe('GLB container', () => {
  test('returns the JSON document and the raw binary chunk', () => {
    const bin = Buffer.alloc(64, 9);
    const { json, binBytes, jsonBytes } = parseGlb(glbBytes({ asset: { version: '2.0' }, nodes: [] }, bin));
    expect(json.asset.version).toBe('2.0');
    expect(binBytes.equals(bin)).toBe(true);
    expect(jsonBytes.length % 4).toBe(0);
  });

  test('refuses a file that is not a version 2 GLB or whose lengths do not add up', () => {
    const good = glbBytes({ asset: { version: '2.0' } });
    const badMagic = Buffer.from(good);
    badMagic.write('JUNK', 0, 'ascii');
    expect(() => parseGlb(badMagic)).toThrow('Not a binary glTF');
    expect(() => parseGlb(Buffer.from('glTF'))).toThrow('Not a binary glTF');
    const badVersion = Buffer.from(good);
    badVersion.writeUInt32LE(1, 4);
    expect(() => parseGlb(badVersion)).toThrow('Not a glTF 2 binary');
    expect(() => parseGlb(good.subarray(0, good.length - 4))).toThrow('header length differs');
    const overlong = Buffer.from(good);
    overlong.writeUInt32LE(good.length * 2, 12);
    expect(() => parseGlb(overlong)).toThrow('runs past the end');
  });

  test('refuses a file with no JSON chunk', () => {
    const header = Buffer.alloc(12);
    header.write('glTF', 0, 'ascii');
    header.writeUInt32LE(2, 4);
    const chunk = Buffer.alloc(8 + 4);
    chunk.writeUInt32LE(4, 0);
    chunk.write('BIN\0', 4, 'latin1');
    const bytes = Buffer.concat([header, chunk]);
    bytes.writeUInt32LE(bytes.length, 8);
    expect(() => parseGlb(bytes)).toThrow('no JSON chunk');
  });

  test('hashes bytes as lower-case SHA-256', () => {
    expect(sha256Of(Buffer.from('kiln'))).toBe(sha('kiln'));
    expect(sha256Of(Buffer.from('kiln'))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('coverage and distance', () => {
  test('is the inverse of the thresholds the delivered files were written with', () => {
    for (const distance of [12, 60, 250, 1500]) {
      expect(coverageToDistance(3, coverageAt(3, distance))).toBeCloseTo(distance, 6);
    }
    // A bigger sphere covers the same fraction of the screen from further away.
    expect(coverageToDistance(6, coverageAt(3, 100))).toBeCloseTo(200, 6);
  });

  test('a threshold of zero or less never means a distance', () => {
    expect(coverageToDistance(3, 0)).toBeNull();
    expect(coverageToDistance(3, -0.5)).toBeNull();
  });
});

describe('vehicle measurement', () => {
  const saved = inspectVehicleGlb(glbBytes(vehicleJson('named-groups')));
  const delivered = inspectVehicleGlb(glbBytes(vehicleJson('MSFT_lod')));

  test('reads the author\'s saved export as three named groups and four wheels', () => {
    expect(saved.form).toBe('named-groups');
    expect(saved.root).toBe('Car');
    expect(saved.tiers.map((tier) => tier.tier)).toEqual(['LOD0', 'LOD1', 'LOD2']);
    // LOD0 is paint (100 triangles) plus glass (30); the four tyres are 20 each.
    expect(saved.tiers.map((tier) => tier.bodyTriangles)).toEqual([130, 20, 5]);
    expect(saved.wheels.map((wheel) => wheel.name)).toEqual(['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']);
    expect(saved.wheels.every((wheel) => wheel.triangles === 20)).toBe(true);
    expect(saved.wheels[0]).toMatchObject({ pivot: [1.3, 0.3, -0.8], radius: 0.3, width: 0.2, hiddenBeyondMetres: null });
    // Without the extension nothing hides the wheels.
    expect(saved.tiers.map((tier) => tier.wheelsShown)).toEqual([true, true, true]);
    expect(saved.wheelsHiddenBeyondMetres).toBeNull();
    expect(saved.wheelsHiddenAtLastTier).toBe(false);
    expect(saved.culledBelow).toBeNull();
    expect(saved.extensionsUsed).toEqual([]);
  });

  test('measures the body and the union with the wheels from the accessors', () => {
    expect(saved.tiers[0]!.bodyBounds.size).toEqual([4.2, 1.15, 1.8]);
    // The tyres reach the ground (y 0) below the body's 0.25 m.
    expect(saved.tiers[0]!.bounds.size).toEqual([4.2, 1.4, 1.8]);
    expect(saved.tiers[0]!.bounds.min).toEqual([-2.1, 0, -0.9]);
    expect(saved.tiers[0]!.parts).toEqual(['Car/LOD0/Mesh_Paint_L0', 'Car/LOD0/Mesh_Glass_L0']);
    expect(saved.tiers[0]!.materials).toEqual(['Glass', 'Paint']);
    expect(saved.materials).toEqual(['Glass', 'Paint', 'Tyre']);
  });

  test('reads the delivered file\'s links back into distances and drops the wheels where LOD2 starts', () => {
    expect(delivered.form).toBe('MSFT_lod');
    expect(delivered.extensionsUsed).toEqual(['MSFT_lod']);
    expect(delivered.extensionsRequired).toEqual([]);
    expect(delivered.tiers.map((tier) => tier.tier)).toEqual(['LOD0', 'LOD1', 'LOD2']);
    expect(delivered.tiers.map((tier) => tier.distanceMetres)).toEqual([null, 60, 250]);
    expect(delivered.tiers.map((tier) => tier.wheelsShown)).toEqual([true, true, false]);
    expect(delivered.tiers.map((tier) => tier.triangles)).toEqual([130 + 80, 20 + 80, 5]);
    expect(delivered.wheelsHiddenBeyondMetres).toBe(250);
    expect(delivered.wheelsHiddenAtLastTier).toBe(true);
    expect(delivered.culledDistanceMetres).toBe(1500);
    expect(delivered.culledBelow).toBeCloseTo(coverageAt(bodyRadius, 1500), 12);
    expect(delivered.wheels.every((wheel) => wheel.hiddenBeyondMetres === 250)).toBe(true);
  });

  test('says what a loader that ignores MSFT_lod draws: the top tier and the wheels', () => {
    expect(delivered.drawnByPlainLoader).toEqual({ tier: 'LOD0', triangles: 130 + 80, bounds: delivered.tiers[0]!.bounds, materials: ['Glass', 'Paint', 'Tyre'] });
    // The far tiers hang off LOD0 and are not children of the root, so they are not drawn by a plain loader.
    expect(delivered.tiers[1]!.parts).toEqual(['Car/LOD1/Mesh_Paint_L1']);
  });

  test('body geometry of a tier is the same in both forms; only the links differ', () => {
    delivered.tiers.forEach((tier, index) => {
      const before = saved.tiers[index]!;
      expect(tier.bodyTriangles).toBe(before.bodyTriangles);
      expect(tier.bodyBounds).toEqual(before.bodyBounds);
      expect(tier.materials).toEqual(before.materials);
      expect(tier.parts).toEqual(before.parts);
    });
    const geometry = ({ hiddenBeyondMetres, ...wheel }: { hiddenBeyondMetres: number | null }) => wheel;
    expect(delivered.wheels.map(geometry)).toEqual(saved.wheels.map(geometry));
  });

  test('wheels that vanish somewhere other than where the last tier starts are not "at the last tier"', () => {
    // Later than LOD2's start: LOD2 still draws them.
    const later = inspectVehicleGlb(glbBytes(vehicleJson('MSFT_lod', { wheelsHideAt: 400 })));
    expect(later.wheelsHiddenBeyondMetres).toBe(400);
    expect(later.tiers.map((tier) => tier.wheelsShown)).toEqual([true, true, true]);
    expect(later.wheelsHiddenAtLastTier).toBe(false);
    // Earlier than LOD2's start: LOD2 does not draw them, but they do not go where the tier starts.
    const earlier = inspectVehicleGlb(glbBytes(vehicleJson('MSFT_lod', { wheelsHideAt: 100 })));
    expect(earlier.tiers.map((tier) => tier.wheelsShown)).toEqual([true, true, false]);
    expect(earlier.wheelsHiddenAtLastTier).toBe(false);
    // Within the 2 % tolerance of the last tier's start is the same place.
    const near = inspectVehicleGlb(glbBytes(vehicleJson('MSFT_lod', { wheelsHideAt: 251 })));
    expect(near.wheelsHiddenAtLastTier).toBe(true);
    const off = inspectVehicleGlb(glbBytes(vehicleJson('MSFT_lod', { wheelsHideAt: 260 })));
    expect(off.wheelsHiddenAtLastTier).toBe(false);
  });

  test('a delivered file whose wheels have no far level never hides them', () => {
    const shown = inspectVehicleGlb(glbBytes(vehicleJson('MSFT_lod', { wheelsHidden: false })));
    expect(shown.wheelsHiddenBeyondMetres).toBeNull();
    expect(shown.wheelsHiddenAtLastTier).toBe(false);
    expect(shown.tiers.map((tier) => tier.wheelsShown)).toEqual([true, true, true]);
  });
});

describe('what three.js draws', () => {
  test('a loader that ignores MSFT_lod draws the top tier and the wheels of the delivered file, as measured', async () => {
    const delivered = glbBytes(vehicleJson('MSFT_lod'));
    const measured = inspectVehicleGlb(delivered).drawnByPlainLoader;
    // LOD0 is two meshes (paint and glass), and each of the four wheels is one.
    expect(await loaderDraws(delivered)).toEqual({ meshes: 6, triangles: measured.triangles });
    expect(measured.triangles).toBe(130 + 80);
  });

  test('the saved export, whose tiers are all in the scene tree, is drawn in full: the reason the delivered form exists', async () => {
    expect(await loaderDraws(glbBytes(vehicleJson('named-groups')))).toEqual({ meshes: 8, triangles: 130 + 20 + 5 + 80 });
  });
});

describe('runtime wheel LOD composition', () => {
  test('adds wheel culling to existing body LOD without changing geometry, pivots, materials or near tiers', async () => {
    const json = clone(vehicleJson('MSFT_lod', { wheelsHidden: false })) as any;
    json.nodes[0].translation = [7, 0, -3];
    json.nodes[4].extras = { purpose: 'independent wheel pivot' };
    json.nodes[4].extensions = { EXT_example: { retained: true } };
    json.extensionsUsed.push('EXT_example');
    const before = glbBytes(json);
    const output = ensureVehicleWheelLod(before);
    const prior = inspectVehicleGlb(before);
    const next = inspectVehicleGlb(output);
    expect(next.tiers.map((tier) => tier.wheelsShown)).toEqual([true, true, false]);
    expect(next.tiers.map((tier) => tier.triangles)).toEqual([210, 100, 5]);
    expect(next.wheels.every((wheel) => wheel.hiddenBeyondMetres === 250)).toBe(true);
    expect(next.wheelsHiddenAtLastTier).toBe(true);
    expect(next.tiers.slice(0, 2)).toEqual(prior.tiers.slice(0, 2));
    expect(next.drawnByPlainLoader).toEqual(prior.drawnByPlainLoader);
    expect(await loaderDraws(output)).toEqual(await loaderDraws(before));
    const after = parseGlb(output);
    expect(after.binBytes.equals(parseGlb(before).binBytes)).toBe(true);
    expect(after.json.nodes).toHaveLength(json.nodes.length + 4);
    const normalized = clone(after.json);
    normalized.nodes.length = json.nodes.length;
    for (let index = 4; index <= 7; index++) {
      const { extensions, extras, ...node } = normalized.nodes[index];
      expect(node).toEqual(Object.fromEntries(Object.entries(json.nodes[index]).filter(([key]) => key !== 'extensions' && key !== 'extras')));
      expect(extensions).toMatchObject(json.nodes[index].extensions ?? {});
      expect(extras).toMatchObject(json.nodes[index].extras ?? {});
      normalized.nodes[index] = json.nodes[index];
    }
    expect(normalized).toEqual(json);
    expect(ensureVehicleWheelLod(output).equals(output)).toBe(true);
    expect(parseGlb(before).json).toEqual(json);
  });

  test('keeps already-qualified runtime bytes and existing wheel links unchanged', () => {
    const complete = glbBytes(vehicleJson('MSFT_lod'));
    expect(ensureVehicleWheelLod(complete).equals(complete)).toBe(true);
    const partial = clone(vehicleJson('MSFT_lod')) as any;
    delete partial.nodes[4].extensions;
    delete partial.nodes[4].extras;
    const output = parseGlb(ensureVehicleWheelLod(glbBytes(partial))).json;
    expect(output.nodes).toHaveLength(partial.nodes.length + 1);
    for (const index of [5, 6, 7]) expect(output.nodes[index]).toEqual(partial.nodes[index]);
    expect(inspectVehicleGlb(ensureVehicleWheelLod(glbBytes(partial))).wheelsHiddenAtLastTier).toBe(true);
  });

  test('preserves unknown non-JSON chunks when composing the delivery', () => {
    const input = glbBytes(vehicleJson('MSFT_lod', { wheelsHidden: false }));
    const extra = Buffer.from([4, 0, 0, 0, 84, 69, 83, 84, 9, 8, 7, 6]);
    const withExtra = Buffer.concat([input, extra]);
    withExtra.writeUInt32LE(withExtra.length, 8);
    const output = ensureVehicleWheelLod(withExtra);
    expect(output.subarray(-extra.length).equals(extra)).toBe(true);
    expect(inspectVehicleGlb(output).wheelsHiddenAtLastTier).toBe(true);
  });

  test('refuses conflicting existing wheel policy and leaves named-group conversion to its caller', () => {
    expect(() => ensureVehicleWheelLod(glbBytes(vehicleJson('MSFT_lod', { wheelsHideAt: 400 })))).toThrow(/wheel.*LOD2/i);
    expect(() => ensureVehicleWheelLod(glbBytes(vehicleJson('named-groups')))).toThrow(/body.*MSFT_lod/i);
    const missing = clone(vehicleJson('MSFT_lod', { wheelsHidden: false })) as any;
    missing.nodes[0].children = missing.nodes[0].children.filter((index: number) => index !== 4);
    expect(() => ensureVehicleWheelLod(glbBytes(missing))).toThrow(/four.*wheel/i);
  });
});

describe('vehicle files that are not vehicles', () => {
  test('a scene with two roots is refused', () => {
    const json = clone(vehicleJson('named-groups')) as any;
    json.scenes[0].nodes = [0, 1];
    expect(() => inspectVehicleGlb(glbBytes(json))).toThrow('one root node');
  });

  test('a vehicle without LOD0 is refused', () => {
    const json = clone(vehicleJson('named-groups')) as any;
    json.nodes[1].name = 'Body';
    expect(() => inspectVehicleGlb(glbBytes(json))).toThrow('no LOD0');
  });

  test('a missing middle tier is refused rather than renumbered', () => {
    const json = clone(vehicleJson('named-groups')) as any;
    json.nodes[0].children = json.nodes[0].children.filter((index: number) => index !== 2);
    expect(() => inspectVehicleGlb(glbBytes(json))).toThrow('Tier 1 is named LOD2, not LOD1');
  });

  test('MSFT_lod without one coverage threshold per tier is refused', () => {
    const json = clone(vehicleJson('MSFT_lod')) as any;
    json.nodes[1].extras.MSFT_screencoverage = [0.01];
    expect(() => inspectVehicleGlb(glbBytes(json))).toThrow('one threshold per tier');
    delete json.nodes[1].extras;
    expect(() => inspectVehicleGlb(glbBytes(json))).toThrow('one threshold per tier');
  });

  test('a mesh without position bounds cannot be measured', () => {
    const json = clone(vehicleJson('named-groups')) as any;
    delete json.accessors[0].min;
    expect(() => inspectVehicleGlb(glbBytes(json))).toThrow('position bounds missing');
  });

  test('non-triangle primitives add no triangles', () => {
    const json = clone(vehicleJson('named-groups')) as any;
    json.meshes[0].primitives[0].mode = 1;
    expect(inspectVehicleGlb(glbBytes(json)).tiers[0]!.bodyTriangles).toBe(30);
  });
});
