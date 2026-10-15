import { describe, expect, test } from 'bun:test';

import {
  ARCHITECTURE_INTERIOR_MODES,
  ARCHITECTURE_ROOF_MODES,
  ARCHITECTURE_ROOF_TYPES,
  ASSET_CATEGORIES,
  KILN_ASSET_FRAME,
  createAssetIntentV1,
  isAssetIntentV1,
  migrateLegacyAssetIntentV1Scope,
  validateAssetIntentV1,
  VEGETATION_SUBTYPES,
} from './asset';
import { ASSET_SCOPES, VFX_SUBTYPES } from './breadth';

describe('asset contracts', () => {
  test('SCOPE-001 normalizes mandatory scope from request closure without model metadata', () => {
    expect(ASSET_SCOPES).toEqual(['single', 'cluster', 'modularSet', 'packMember']);
    expect(createAssetIntentV1({ category: 'prop' }).scope).toEqual({
      schemaVersion: 1,
      scope: 'single',
      explicit: false,
    });
    expect(
      createAssetIntentV1({ category: 'environment', subtype: 'set-dressing-cluster' }).scope.scope,
    ).toBe('cluster');
    expect(
      createAssetIntentV1({ category: 'architecture', subtype: 'modular-wall' }).scope.scope,
    ).toBe('modularSet');
    expect(
      createAssetIntentV1({
        category: 'prop',
        scope: { scope: 'packMember', explicit: true },
      }).scope,
    ).toEqual({ schemaVersion: 1, scope: 'packMember', explicit: true });
  });

  test('migrates only missing legacy scope while keeping VFX contract validation strict', () => {
    const current = createAssetIntentV1({ category: 'prop', subtype: 'crate' });
    const { scope: _scope, ...legacy } = current;
    expect(validateAssetIntentV1(legacy).issues.map((issue) => issue.code)).toContain(
      'INVALID_ASSET_SCOPE',
    );
    const migratedWithUntrustedMeta = migrateLegacyAssetIntentV1Scope({
      ...legacy,
      meta: { scope: 'cluster' },
    });
    expect(migratedWithUntrustedMeta.valid).toBe(true);
    expect(migratedWithUntrustedMeta.issues).toEqual([]);
    expect(migratedWithUntrustedMeta.migratedScope).toBe(true);
    expect(migratedWithUntrustedMeta.value?.scope).toEqual(current.scope);
    expect((migratedWithUntrustedMeta.value as unknown as { meta?: unknown })?.meta).toEqual({
      scope: 'cluster',
    });

    const vfx = createAssetIntentV1({ category: 'vfx', subtype: 'portal' });
    const { scope: _vfxScope, vfx: _vfx, ...legacyVfx } = vfx;
    const migrated = migrateLegacyAssetIntentV1Scope(legacyVfx);
    expect(migrated.migratedScope).toBe(true);
    expect(migrated.valid).toBe(false);
    expect(migrated.issues.map((issue) => issue.code)).toContain('EXPECTED_OBJECT');
  });

  test('VFX-001 normalizes every subtype and enforces category-exclusive portability truth', () => {
    for (const subtype of VFX_SUBTYPES) {
      const intent = createAssetIntentV1({ category: 'vfx', subtype });
      expect(intent.vfx?.subtype).toBe(subtype);
      expect(intent.subtype).toBe(subtype);
      expect(intent.material.transparency).toBe(intent.vfx?.transparency);
      expect(intent.capabilities).toContain('transparentSurface');
      expect(validateAssetIntentV1(intent).valid).toBe(true);
      if (subtype === 'runtimeShader') {
        expect(intent.vfx?.portability).toBe('sidecar');
        expect(intent.material.mode).toBe('runtimeTsl');
        expect(intent.capabilities).toContain('runtimeShader');
      }
    }
    const vfx = createAssetIntentV1({ category: 'vfx', subtype: 'billboard' });
    expect(vfx.vfx?.facing).toMatchObject({
      source: 'inferred',
      mode: 'camera-spherical',
    });
    expect(
      validateAssetIntentV1({
        ...createAssetIntentV1({ category: 'prop' }),
        vfx: vfx.vfx,
      }).issues.map((issue) => issue.code),
    ).toContain('VFX_INTENT_CATEGORY_MISMATCH');
    expect(
      validateAssetIntentV1({
        ...vfx,
        material: { ...vfx.material, transparency: 'opaque' },
      }).issues.map((issue) => issue.code),
    ).toContain('VFX_MATERIAL_TRANSPARENCY_MISMATCH');
  });
  test('VEG-001 normalizes every supported vegetation growth form into trusted intent', () => {
    expect(VEGETATION_SUBTYPES).toEqual([
      'tree',
      'conifer',
      'shrub',
      'grass',
      'frond/palm',
      'vine',
      'crop/flower',
      'succulent',
      'cactus',
      'fungus',
      'aquatic',
      'bare/dead',
      'custom',
    ]);
    for (const subtype of VEGETATION_SUBTYPES) {
      const intent = createAssetIntentV1({ category: 'vegetation', vegetation: { subtype } });
      expect(intent.subtype).toBe(subtype);
      expect(intent.vegetation?.subtype).toBe(subtype);
      expect(intent.vegetation?.growthState).toBe(subtype === 'bare/dead' ? 'bare' : 'lush');
      expect(intent.capabilities).toContain('grounded');
      expect(validateAssetIntentV1(intent).valid).toBe(true);
    }
  });

  test('VEG-001 rejects category drift and inconsistent bare canopy state', () => {
    const intent = createAssetIntentV1({
      category: 'vegetation',
      vegetation: { subtype: 'tree', growthState: 'sparse' },
    });
    expect(
      validateAssetIntentV1({
        ...intent,
        vegetation: { ...intent.vegetation, subtype: 'conifer' },
      }).issues.map((issue) => issue.code),
    ).toContain('VEGETATION_SUBTYPE_MISMATCH');
    expect(
      validateAssetIntentV1({
        ...intent,
        vegetation: { ...intent.vegetation, growthState: 'bare', canopyProfile: 'broadleaf' },
      }).issues.map((issue) => issue.code),
    ).toContain('VEGETATION_BARE_PROFILE_MISMATCH');
  });

  test('publishes one exact frame and all seven canonical categories', () => {
    expect(KILN_ASSET_FRAME).toEqual({
      units: 'm',
      forward: '+X',
      up: '+Y',
      right: '+Z',
      groundY: 0,
    });
    expect(ASSET_CATEGORIES).toEqual([
      'prop',
      'character',
      'vfx',
      'environment',
      'architecture',
      'vegetation',
      'vehicle',
    ]);
  });

  test('creates a fully normalized intent with portable PBR as the default', () => {
    const intent = createAssetIntentV1({
      category: 'vehicle',
      subtype: 'wheeled',
      capabilities: ['driveable', 'grounded'],
      bounds: { x: 4.2, y: 1.6, z: 1.8, units: 'm' },
      requiredParts: ['chassis', 'wheel.frontLeft'],
      forbiddenExtras: ['terrainBase'],
    });

    expect(intent.schemaVersion).toBe(1);
    expect(intent.frame).toBe(KILN_ASSET_FRAME);
    expect(intent.material).toEqual({ mode: 'pbrRecipe' });
    expect(intent.qaProfile).toBe('vehicle.default');
    expect(isAssetIntentV1(intent)).toBe(true);
  });

  test('copies trusted arrays instead of retaining mutable caller references', () => {
    const required = ['body'];
    const intent = createAssetIntentV1({ category: 'prop', requiredParts: required });
    required.push('surprise');
    expect(intent.requiredParts).toEqual(['body']);
  });

  test('normalizes explicit character construction and per-clip playback semantics', () => {
    const intent = createAssetIntentV1({
      category: 'character',
      subtype: 'quadruped',
      animation: {
        clips: ['Walk', 'Death'],
        locomotionDirection: '+X',
        rootMotion: 'forward',
        gait: 'trot',
      },
      character: { grounded: true, heldItem: { required: true, attachmentRole: 'grip.right' } },
    });

    expect(intent.character).toEqual({
      bodyPlan: 'quadruped',
      grounded: true,
      locomotion: 'walk',
      gait: 'trot',
      rootMotion: 'forward',
      clips: [
        { name: 'Walk', playback: 'loop' },
        { name: 'Death', playback: 'oneShot' },
      ],
      heldItem: { required: true, attachmentRole: 'grip.right' },
    });
    expect(intent.capabilities).toContain('grounded');
    expect(validateAssetIntentV1(intent).valid).toBe(true);
  });

  test('normalizes subtype-specific vehicle assemblies without leaking wheel rules to boats', () => {
    const car = createAssetIntentV1({ category: 'vehicle', subtype: 'wheeled' });
    const boat = createAssetIntentV1({ category: 'vehicle', subtype: 'watercraft' });

    expect(car.vehicle).toMatchObject({
      subtype: 'wheeled',
      supportAssemblies: ['wheel'],
      wheelCount: 4,
      axleCount: 2,
      steering: 'front',
      supportPolicy: 'grounded',
    });
    expect(boat.vehicle).toEqual({
      subtype: 'watercraft',
      supportAssemblies: ['hull'],
      propulsionAssemblies: ['propeller'],
      wheelCount: 0,
      axleCount: 0,
      steering: 'rear',
      supportPolicy: 'waterborne',
      animationAssemblies: [],
    });
    expect(boat.capabilities).not.toContain('grounded');
  });

  test('rejects category-specific character and vehicle contract drift', () => {
    const character = createAssetIntentV1({ category: 'character', subtype: 'biped' });
    const badCharacter = {
      ...character,
      character: { ...character.character!, bodyPlan: 'centaur' },
    };
    expect(validateAssetIntentV1(badCharacter).issues.map((issue) => issue.code)).toContain(
      'INVALID_CHARACTER_BODY_PLAN',
    );

    const boat = createAssetIntentV1({ category: 'vehicle', subtype: 'watercraft' });
    const wheeledBoat = { ...boat, vehicle: { ...boat.vehicle!, wheelCount: 4, axleCount: 2 } };
    expect(validateAssetIntentV1(wheeledBoat).issues.map((issue) => issue.code)).toContain(
      'VEHICLE_WHEEL_POLICY_MISMATCH',
    );
  });

  test('normalizes the architecture lifecycle contract while preserving legacy enterable input', () => {
    expect(ARCHITECTURE_INTERIOR_MODES).toEqual(['none', 'shell', 'navigable']);
    expect(ARCHITECTURE_ROOF_MODES).toEqual(['auto', 'fixed', 'removable', 'none']);
    expect(ARCHITECTURE_ROOF_TYPES).toContain('dome');

    const legacy = createAssetIntentV1({
      category: 'architecture',
      architecture: { enterable: true },
    });
    expect(legacy.architecture).toMatchObject({
      enterable: true,
      storeyCount: 1,
      interiorMode: 'navigable',
      roofMode: 'auto',
    });
    expect(legacy.capabilities).toEqual(expect.arrayContaining(['enterable', 'navigable']));

    const shell = createAssetIntentV1({
      category: 'architecture',
      architecture: {
        storeyCount: 5,
        interiorMode: 'shell',
        roofMode: 'removable',
      },
    });
    expect(shell.architecture).toMatchObject({
      enterable: false,
      storeyCount: 5,
      interiorMode: 'shell',
      roofMode: 'removable',
    });
    expect(shell.capabilities).not.toContain('enterable');
    expect(shell.capabilities).not.toContain('navigable');
    expect(validateAssetIntentV1(shell).valid).toBe(true);
  });

  test('normalizes dome/rotunda intent and rejects invalid architecture lifecycle values', () => {
    const rotunda = createAssetIntentV1({
      category: 'architecture',
      subtype: 'rotunda',
      architecture: {
        storeyCount: 1,
        interiorMode: 'navigable',
        roofMode: 'fixed',
        roof: { type: 'dome', rise: 5.5, pitchDegrees: 0, closedEnds: false },
      },
    });
    expect(rotunda.architecture).toMatchObject({
      subtype: 'rotunda',
      storeyCount: 1,
      interiorMode: 'navigable',
      roofMode: 'fixed',
      roof: { type: 'dome', rise: 5.5, pitchDegrees: 0 },
    });
    expect(validateAssetIntentV1(rotunda).valid).toBe(true);

    for (const architecture of [
      { ...rotunda.architecture!, storeyCount: 0 },
      { ...rotunda.architecture!, storeyCount: 6 },
      { ...rotunda.architecture!, storeyCount: 1.5 },
      { ...rotunda.architecture!, interiorMode: 'decorative' },
      { ...rotunda.architecture!, roofMode: 'hinged' },
      { ...rotunda.architecture!, enterable: false },
      {
        ...rotunda.architecture!,
        roofMode: 'none',
        roof: { ...rotunda.architecture!.roof, type: 'dome' },
      },
    ]) {
      expect(validateAssetIntentV1({ ...rotunda, architecture }).valid).toBe(false);
    }
  });

  test('continues to validate pre-lifecycle architecture v1 payloads using legacy semantics', () => {
    const current = createAssetIntentV1({
      category: 'architecture',
      architecture: { enterable: false, roof: { type: 'none' } },
    });
    const {
      storeyCount: _storeys,
      interiorMode: _interior,
      roofMode: _roofMode,
      ...legacy
    } = current.architecture!;
    expect(validateAssetIntentV1({ ...current, architecture: legacy }).valid).toBe(true);
  });

  test('normalizes a complete architecture intent with consistent pitch, rise, and portal clearance', () => {
    const intent = createAssetIntentV1({
      category: 'architecture',
      subtype: 'barn',
      architecture: {
        enterable: true,
        footprint: { spanX: 8, spanZ: 6 },
        wallHeight: 3.2,
        scaleMode: 'realistic',
        roof: { type: 'gable', ridgeAxis: 'x', pitchDegrees: 35, overhang: 0.45 },
        portal: { width: 1.8, height: 2.5, depth: 0.2 },
      },
    });

    expect(intent.architecture).toMatchObject({
      subtype: 'barn',
      enterable: true,
      footprint: { spanX: 8, spanZ: 6, units: 'm' },
      wallHeight: 3.2,
      scaleMode: 'realistic',
      roof: {
        type: 'gable',
        ridgeAxis: 'x',
        pitchDegrees: 35,
        overhang: 0.45,
        closedEnds: true,
      },
      portal: { width: 1.8, height: 2.5, depth: 0.2 },
    });
    expect(intent.architecture!.roof.rise).toBeCloseTo(Math.tan((35 * Math.PI) / 180) * 3);
    expect(intent.capabilities).toContain('enterable');
    expect(validateAssetIntentV1(intent)).toEqual({ valid: true, value: intent, issues: [] });
  });

  test('rejects inconsistent architecture geometry and category-specific fields on another category', () => {
    const architecture = createAssetIntentV1({ category: 'architecture' });
    const inconsistent = {
      ...architecture,
      architecture: {
        ...architecture.architecture!,
        roof: { ...architecture.architecture!.roof, rise: 99 },
      },
    };
    expect(validateAssetIntentV1(inconsistent).issues.map((issue) => issue.code)).toContain(
      'ARCHITECTURE_ROOF_GEOMETRY_MISMATCH',
    );

    const propWithArchitecture = {
      ...createAssetIntentV1({ category: 'prop' }),
      architecture: architecture.architecture,
    };
    expect(validateAssetIntentV1(propWithArchitecture).issues.map((issue) => issue.code)).toContain(
      'ARCHITECTURE_INTENT_CATEGORY_MISMATCH',
    );
  });

  test('rejects category/frame drift, invalid extents, and contradictory parts', () => {
    const value = {
      ...createAssetIntentV1({ category: 'architecture', requiredParts: ['roof'] }),
      category: 'building',
      frame: { ...KILN_ASSET_FRAME, forward: '+Z' },
      bounds: { x: -1, units: 'cm' },
      forbiddenExtras: ['roof'],
    };

    const result = validateAssetIntentV1(value);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'INVALID_CATEGORY',
        'FRAME_CONTRACT_MISMATCH',
        'INVALID_UNITS',
        'INVALID_BOUND_EXTENT',
        'CONTRADICTORY_PART_REQUIREMENT',
      ]),
    );
  });

  test('rejects unknown and duplicate capabilities deterministically', () => {
    const value = {
      ...createAssetIntentV1({ category: 'environment' }),
      capabilities: ['tileable', 'tileable', 'telepathic'],
    };
    const result = validateAssetIntentV1(value);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'DUPLICATE_VALUE',
      'INVALID_CAPABILITY',
    ]);
  });
});
