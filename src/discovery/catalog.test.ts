import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import {
  buildSandboxGlobals,
  type boxGeo,
  copyGeometry,
  copyMaterial,
  gameMaterial,
  room,
  capsuleGeo,
} from '../primitives';
import { geometryDiagnostics } from '../geometry';
import { sweepProfile } from '../sweep';
import { listHelperSpecs } from './helper-specs';
import { parseCatalog, type DiscoveryEntry } from './catalog-schema';
import { listDiscoveryEntries, DISCOVERY_HELPER_RETIREMENTS } from './catalog';
import { helperContracts } from './helper-contracts';

const byName = () => new Map(listDiscoveryEntries().map((entry) => [entry.name, entry]));
type Executable = Extract<DiscoveryEntry, { kind: 'operation' | 'assembly' }>;
const executable = (entry: DiscoveryEntry): entry is Executable => 'contract' in entry;

describe('executable Discovery catalog', () => {
  test('foliage helper contracts disclose the placeholder texture before an agent uses the examples', () => {
    for (const name of ['foliageCardGeo', 'foliageMaterial']) {
      const entry = byName().get(name);
      if (!entry || !executable(entry)) throw new Error(`Missing helper ${name}`);
      expect(entry.contract.parameters.join(' ')).toContain('4x4 teaching placeholder');
    }
  });

  test('every retained sandbox function has exactly one complete, typed contract', () => {
    const retired = new Set<string>(DISCOVERY_HELPER_RETIREMENTS.map((entry) => entry.name));
    const names = Object.entries(buildSandboxGlobals())
      .filter(([name, value]) => typeof value === 'function' && !retired.has(name))
      .map(([name]) => name)
      .sort();
    const catalog = listDiscoveryEntries();
    const entries = catalog.filter(executable);
    expect(entries.map((entry) => entry.name).sort()).toEqual(names);
    expect(Object.keys(helperContracts).sort()).toEqual(names);
    expect(parseCatalog(catalog)).toEqual(catalog);
    expect(new Set(catalog.map((entry) => entry.id)).size).toBe(catalog.length);
    for (const entry of entries) {
      expect(entry.contract.parameters.length).toBeGreaterThan(0);
      expect(entry.contract.topology.length).toBeGreaterThan(0);
      expect(entry.contract.preservation.length).toBeGreaterThan(0);
      expect(entry.contract.semantics.length).toBeGreaterThan(0);
      expect(entry.references.length).toBeGreaterThan(0);
    }
  });

  test('retirements provide migration guidance but are never advertised executable', () => {
    expect(DISCOVERY_HELPER_RETIREMENTS.map((entry) => entry.name).sort()).toEqual([
      'boxUnwrap',
      'cloneGeometry',
      'cloneMaterial',
      'cylinderUnwrap',
      'panelRemapV',
      'planeUnwrap',
      'validateAsset',
    ]);
    const catalog = byName();
    for (const retirement of DISCOVERY_HELPER_RETIREMENTS) {
      expect(catalog.has(retirement.name)).toBe(false);
      expect(retirement.reason.length).toBeGreaterThan(0);
      expect(retirement.migration.length).toBeGreaterThan(0);
    }
    expect(
      DISCOVERY_HELPER_RETIREMENTS.find((entry) => entry.name === 'cloneGeometry')?.migration,
    ).toContain('sharing');
  });

  test('replacement helpers expose identity UV defaults and an explicit advisory budget', () => {
    const catalog = byName();
    const uv = catalog.get('remapUV');
    const advisory = catalog.get('materialBudgetAdvisory');
    expect(uv).toBeDefined();
    expect(advisory).toBeDefined();
    if (!uv || !executable(uv) || !advisory || !executable(advisory))
      throw new Error('Missing replacement contracts');
    expect(uv.contract.parameters.join(' ')).toContain('[1,1]');
    expect(uv.contract.preservation.join(' ')).toContain('tangent');
    expect(advisory.limitations.join(' ')).toContain('draw calls');
    expect(advisory.contract.parameters.join(' ')).toContain('no default');
    for (const name of ['cloneGeometry', 'cloneMaterial', 'panelRemapV', 'validateAsset'])
      expect(listHelperSpecs().some((spec) => spec.name === name)).toBe(false);
  });

  test('retains current executable signatures and examples as migration source data', () => {
    const catalog = byName();
    for (const previous of listHelperSpecs()) {
      const current = catalog.get(previous.name);
      if (!current || !executable(current)) continue;
      expect(current.contract.signature).toBe(previous.signature);
      expect(current.contract.example).toBe(previous.example);
    }
  });

  test('distinguishes shared cached primitives, independent copies and assembly sharing', () => {
    const catalog = byName();
    expect(catalog.get('boxGeo')?.kind).toBe('operation');
    expect(catalog.get('createWheelAssembly')?.kind).toBe('assembly');
    expect(catalog.get('createVehicleFrame')?.kind).toBe('assembly');
    expect(catalog.get('createWheelGeometrySet')?.kind).toBe('operation');
    const box = catalog.get('boxGeo');
    const copy = catalog.get('copyGeometry');
    const material = catalog.get('copyMaterial');
    const wheel = catalog.get('createWheelAssembly');
    if (
      !box ||
      !executable(box) ||
      !copy ||
      !executable(copy) ||
      !material ||
      !executable(material) ||
      !wheel ||
      !executable(wheel)
    )
      throw new Error('missing representative contracts');
    expect(box.contract.ownership).toContain('cached');
    expect(copy.contract.ownership).toContain('independent');
    expect(material.contract.ownership).toContain('textures remain shared');
    expect(wheel.contract.ownership).toContain('shared');
    expect(wheel.contract.axes).toContain('+Z');
  });

  test('surface, solid, async and angular units remain distinct', () => {
    const catalog = byName();
    const get = (name: string) => {
      const entry = catalog.get(name);
      if (!entry || !('contract' in entry)) throw new Error(`Missing operation ${name}`);
      return entry;
    };
    expect(get('revolveGeo').contract.units).toContain('radians');
    expect(get('revolveProfile').contract.units).toContain('degrees');
    expect(get('revolveProfile').contract.execution).toBe('async');
    expect(get('circleProfile').contract.execution).toBe('sync');
    expect(get('sweepProfile').contract.topology.join(' ')).toContain('self-intersection');
    expect(get('meshGeo').contract.topology.join(' ')).toContain('counterclockwise');
    expect(get('implicitSurface').stability).toBe('experimental');
    expect(get('positionTrack').contract.coordinates).toContain('parent-local');
  });

  test('retrieval consumers cannot mutate the catalog or another response', () => {
    const entries = listDiscoveryEntries();
    const first = entries[0]!;
    first.tags.push('contaminated');
    first.related.push({ id: 'operation:missing', relation: 'companion' });
    if ('contract' in first) first.contract.parameters.push('contaminated');
    expect(listDiscoveryEntries()[0]?.tags).not.toContain('contaminated');
    expect(() => parseCatalog(listDiscoveryEntries())).not.toThrow();
  });

  test('ownership claims match actual sandbox caching and material texture sharing', () => {
    const sandbox = buildSandboxGlobals();
    const cachedBox = sandbox.boxGeo as typeof boxGeo;
    const shared = cachedBox(1, 2, 3);
    expect(cachedBox(1, 2, 3)).toBe(shared);
    const copied = copyGeometry(shared);
    copied.translate(10, 0, 0);
    expect(copied.getAttribute('position').getX(0)).not.toBe(
      shared.getAttribute('position').getX(0),
    );
    const material = gameMaterial(0x808080);
    material.map = new THREE.Texture();
    const copiedMaterial = copyMaterial(material);
    expect(copiedMaterial).not.toBe(material);
    expect(copiedMaterial.map).toBe(material.map);
    copiedMaterial.color.setHex(0xff0000);
    expect(material.color.getHex()).toBe(0x808080);
  });

  test('axis, datum and surface limitations describe the current constructors', () => {
    const built = room('ContractRoom', gameMaterial(0x808080), { width: 2, depth: 4 });
    const floor = new THREE.Box3().setFromObject(built.floor!);
    expect(floor.getSize(new THREE.Vector3()).x).toBeCloseTo(4);
    expect(floor.getSize(new THREE.Vector3()).z).toBeCloseTo(2);
    expect(floor.max.y).toBeCloseTo(0);
    const capsule = capsuleGeo(0.5, 2);
    capsule.computeBoundingBox();
    expect(capsule.boundingBox!.getSize(new THREE.Vector3()).y).toBeCloseTo(3);
    const sheet = sweepProfile(
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
      [
        [0, 0, 0],
        [0, 2, 0],
      ],
      { cap: false },
    );
    expect(geometryDiagnostics(sheet).boundaryEdges).toBeGreaterThan(0);
    const roomContract = byName().get('room');
    if (!roomContract || !('contract' in roomContract)) throw new Error('missing room contract');
    expect(roomContract.contract.axes).toContain('Width spans Z');
  });
});
