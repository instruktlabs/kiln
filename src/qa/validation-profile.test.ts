/**
 * Conformance fixture for HOST_VALIDATION_PROFILE (#208). The rule's promotion
 * evidence pins this file's exact bytes: change an assertion here and the
 * registry test asks for a new owner-approved hash.
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { Document, type Material } from '@gltf-transform/core';
import { createGltfIO } from '../gltf-io';
import {
  createAssetRequirementsV1,
  requestedRequirement,
  validateAssetRequirementsV1,
} from '../contracts/requirements';
import type { ValidationProfileV1 } from '../contracts/validation-profile';
import { createAssetRequirementsStore } from '../requirements-store';
import { renderSceneToGLB } from '../render';
import { AssetQaBlockedError } from './run';
import {
  evaluateValidationProfileDocument,
  evaluateValidationProfileGlb,
  matchValidationPattern,
} from './validation-profile';

type Check = ValidationProfileV1['checks'][number];

const frondCheck: Check = {
  id: 'frond-sway',
  select: { names: ['frond_*'] },
  primitives: { exactly: 1 },
  attributes: ['POSITION', 'NORMAL', 'TEXCOORD_0'],
  gradient: {
    attribute: 'TEXCOORD_0',
    component: 1,
    axis: '+Y',
    from: 0,
    to: 1,
    tolerance: 0.1,
    monotonic: true,
  },
};

function profile(
  checks: Check[] = [frondCheck],
  mode: 'warn' | 'enforce' = 'enforce',
): ValidationProfileV1 {
  return {
    version: 'kiln.validation-profile.v1',
    profileId: 'holodeck.palm',
    mode,
    checks,
  };
}

function requirementsWith(value: unknown) {
  return validateAssetRequirementsV1({
    ...createAssetRequirementsV1(),
    requirements: { validation: { state: 'requested', value } },
  });
}

interface StripOptions {
  name?: string;
  primitives?: number;
  reversed?: boolean;
  uv?: boolean;
  material?: (doc: Document) => Material | null;
  flat?: boolean;
}

/** A vertical strip, 9 rows from y=0 to y=1, with UV.y following y. */
function addStrip(
  doc: Document,
  parent: ReturnType<Document['createNode']>,
  options: StripOptions,
) {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const mesh = doc.createMesh(options.name ?? 'frond');
  for (let p = 0; p < (options.primitives ?? 1); p++) {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (let row = 0; row <= 8; row++) {
      const y = options.flat ? 0 : row / 8;
      for (const x of [-0.1, 0.1]) {
        positions.push(x, y, 0);
        normals.push(0, 0, 1);
        uvs.push(x > 0 ? 1 : 0, options.reversed ? 1 - row / 8 : row / 8);
      }
    }
    const indices: number[] = [];
    for (let row = 0; row < 8; row++) {
      const a = row * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const accessor = (
      type: 'VEC2' | 'VEC3' | 'SCALAR',
      array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>,
    ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const primitive = doc
      .createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
      .setIndices(accessor('SCALAR', new Uint16Array(indices)));
    if (options.uv !== false)
      primitive.setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)));
    const material = options.material?.(doc);
    if (material) primitive.setMaterial(material);
    mesh.addPrimitive(primitive);
  }
  const node = doc.createNode(options.name ?? 'frond_0').setMesh(mesh);
  parent.addChild(node);
  return node;
}

function palm(...strips: StripOptions[]) {
  const doc = new Document();
  doc.createBuffer();
  const root = doc.createNode('Palm');
  doc.createScene('Scene').addChild(root);
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]!);
  for (const strip of strips) addStrip(doc, root, strip);
  return doc;
}

const codes = (result: { findings: readonly { code: string }[] }) =>
  result.findings.map((finding) => finding.code);

describe('kiln.validation-profile.v1 schema', () => {
  test('a closed profile is accepted as a requested requirement', () => {
    const result = requirementsWith(profile());
    expect(result.valid).toBe(true);
    expect(result.value!.requirements.validation).toEqual(requestedRequirement(profile()));
  });

  test('rejects unbounded or ambiguous profiles', () => {
    const many = Array.from({ length: 17 }, (_, i) => ({
      ...frondCheck,
      id: `c${i}`,
    }));
    const rejected: unknown[] = [
      profile(many),
      profile([{ ...frondCheck, select: { names: ['a'.repeat(129)] } }]),
      profile([{ ...frondCheck, select: { names: ['*a*b*c*d*'] } }]),
      profile([frondCheck, frondCheck]),
      profile([{ ...frondCheck, gradient: { ...frondCheck.gradient!, to: 0 } }]),
      profile([{ ...frondCheck, gradient: { ...frondCheck.gradient!, component: 2 } }]),
      profile([{ ...frondCheck, gradient: { ...frondCheck.gradient!, tolerance: 0 } }]),
      profile([
        {
          id: 'range',
          select: { names: ['x'] },
          range: {
            attribute: 'COLOR_0',
            component: 0,
            min: 1,
            max: 0,
            tolerance: 0,
          },
        },
      ]),
      profile([{ id: 'empty', select: { names: ['frond_*'] } }]),
      profile([
        {
          ...frondCheck,
          select: { names: ['x'], minMatches: 3, maxMatches: 2 },
        },
      ]),
      profile([{ ...frondCheck, select: { names: ['x'], maxMatches: 513 } }]),
      // v1 has one profile-level mode; a per-check mode is not part of the schema.
      profile([{ ...frondCheck, mode: 'warn' } as Check]),
      { ...profile(), extra: true },
    ];
    for (const value of rejected) expect(requirementsWith(value).valid).toBe(false);
    // 128 characters and four stars are the limits, not violations.
    expect(
      requirementsWith(profile([{ ...frondCheck, select: { names: ['a'.repeat(128)] } }])).valid,
    ).toBe(true);
    expect(
      requirementsWith(profile([{ ...frondCheck, select: { names: ['*a*b*c*'] } }])).valid,
    ).toBe(true);
  });

  test('rejects a serialized profile over 8 KiB', () => {
    const long = Array.from({ length: 8 }, (_, i) => `${'n'.repeat(120)}${i}`);
    const checks = Array.from({ length: 16 }, (_, i) => ({
      ...frondCheck,
      id: `check-${i}`,
      select: { names: long },
    }));
    expect(JSON.stringify(profile(checks)).length).toBeGreaterThan(8192);
    expect(requirementsWith(profile(checks)).valid).toBe(false);
  });
});

describe('node name patterns', () => {
  test('match whole names case-sensitively with * and ? only', () => {
    expect(matchValidationPattern('frond_*', 'frond_0')).toBe(true);
    expect(matchValidationPattern('frond_*', 'frond_')).toBe(true);
    expect(matchValidationPattern('frond_*', 'Frond_0')).toBe(false);
    expect(matchValidationPattern('frond_*', 'big_frond_0')).toBe(false);
    expect(matchValidationPattern('fr?nd', 'frond')).toBe(true);
    expect(matchValidationPattern('fr?nd', 'frnd')).toBe(false);
    expect(matchValidationPattern('?', '葉')).toBe(true);
    expect(matchValidationPattern('a.b', 'aXb')).toBe(false);
    expect(matchValidationPattern('[ab]', '[ab]')).toBe(true);
    expect(matchValidationPattern('*', '')).toBe(true);
  });

  test('stay bounded on adversarial names', () => {
    const name = 'a'.repeat(20_000);
    const started = performance.now();
    expect(matchValidationPattern('*a*a*a*b', name)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('HOST_VALIDATION_PROFILE evaluation', () => {
  test('a conforming frond passes with every check measured', () => {
    const result = evaluateValidationProfileDocument(profile(), palm({ name: 'frond_0' }));
    expect(result.findings).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.metrics).toMatchObject({
      hostValidationProfile: 'kiln.validation-profile.v1:holodeck.palm',
      hostValidationMatchedNodes: 1,
    });
  });

  test('a two-primitive frond and a reversed gradient fail at their exact node paths', () => {
    const result = evaluateValidationProfileDocument(
      profile(),
      palm({ name: 'frond_0', primitives: 2 }, { name: 'frond_1', reversed: true }),
    );
    expect(codes(result)).toEqual([
      'HOST_VALIDATION_PRIMITIVE_COUNT',
      'HOST_VALIDATION_ATTRIBUTE_GRADIENT',
    ]);
    const [count, gradient] = result.findings;
    expect(count).toMatchObject({
      disposition: 'block',
      dimension: 'categoryReadiness',
      profile: 'kiln.validation-profile.v1:holodeck.palm',
      affected: { node: 'frond_0', nodePath: '/Scene[0]/Palm[0]/frond_0[0]' },
      measurement: {
        name: 'checks.frond-sway.primitives',
        actual: 2,
        expected: 1,
      },
    });
    expect(gradient).toMatchObject({
      disposition: 'block',
      affected: {
        node: 'frond_1',
        nodePath: '/Scene[0]/Palm[0]/frond_1[0]',
        attribute: 'TEXCOORD_0',
      },
      measurement: {
        name: 'checks.frond-sway.gradient',
        breakdown: { fromMean: 1, toMean: 0 },
      },
    });
    // A reversed gradient fails both the endpoint and the monotonic test.
    expect(gradient!.message).toContain('endpoints');
    expect(gradient!.message).toContain('monotonic');
  });

  test('warn mode reports the same findings without blocking', () => {
    const result = evaluateValidationProfileDocument(
      profile([frondCheck], 'warn'),
      palm({ name: 'frond_0', reversed: true }),
    );
    expect(result.findings.map((finding) => finding.disposition)).toEqual(['warn']);
  });

  test('renaming every frond cannot pass silently', () => {
    const result = evaluateValidationProfileDocument(profile(), palm({ name: 'leaf_0' }));
    expect(codes(result)).toEqual(['HOST_VALIDATION_SELECTOR_UNMATCHED']);
    expect(result.findings[0]).toMatchObject({
      disposition: 'block',
      measurement: {
        name: 'checks.frond-sway.select',
        actual: 0,
        expected: '>= 1',
      },
    });
    const bounded = evaluateValidationProfileDocument(
      profile([{ ...frondCheck, select: { names: ['frond_*'], maxMatches: 1 } }]),
      palm({ name: 'frond_0' }, { name: 'frond_1' }),
    );
    expect(codes(bounded)).toEqual(['HOST_VALIDATION_SELECTOR_UNMATCHED']);
    const optional = evaluateValidationProfileDocument(
      profile([{ ...frondCheck, select: { names: ['frond_*'], minMatches: 0 } }]),
      palm({ name: 'leaf_0' }),
    );
    expect(optional.findings).toEqual([]);
  });

  test('missing attributes, ranges and material flags are reported per primitive', () => {
    const blend = (doc: Document) =>
      doc.createMaterial('leaf').setAlphaMode('BLEND').setDoubleSided(false);
    const result = evaluateValidationProfileDocument(
      profile([
        {
          id: 'leaf',
          select: { names: ['frond_?'] },
          attributes: ['TEXCOORD_0'],
          range: {
            attribute: 'POSITION',
            component: 1,
            min: 0,
            max: 0.5,
            tolerance: 0.01,
          },
          material: { alphaMode: 'MASK', doubleSided: true },
        },
      ]),
      palm({ name: 'frond_0', uv: false, material: blend }),
    );
    expect(codes(result)).toEqual([
      'HOST_VALIDATION_ATTRIBUTE_MISSING',
      'HOST_VALIDATION_ATTRIBUTE_RANGE',
      'HOST_VALIDATION_MATERIAL_ALPHA_MODE',
      'HOST_VALIDATION_MATERIAL_DOUBLE_SIDED',
    ]);
    expect(result.findings[0]!.affected).toMatchObject({
      attribute: 'TEXCOORD_0',
    });
    expect(result.findings[2]).toMatchObject({
      affected: { material: 'leaf' },
      measurement: { actual: 'BLEND', expected: 'MASK' },
    });
    // An absent material is the glTF default: opaque and single-sided.
    const defaults = evaluateValidationProfileDocument(
      profile([
        {
          id: 'defaults',
          select: { names: ['frond_0'] },
          material: { alphaMode: 'OPAQUE', doubleSided: false },
        },
      ]),
      palm({ name: 'frond_0' }),
    );
    expect(defaults.findings).toEqual([]);
  });

  test('a gradient on a flat axis or past the read budget is unmeasured, never a pass', () => {
    const flat = evaluateValidationProfileDocument(
      profile(),
      palm({ name: 'frond_0', flat: true }),
    );
    expect(codes(flat)).toEqual(['HOST_VALIDATION_UNMEASURED']);
    expect(flat.findings[0]!.disposition).toBe('observe');
    expect(flat.complete).toBe(false);

    const budget = evaluateValidationProfileDocument(
      profile(),
      palm({ name: 'frond_0' }, { name: 'frond_1' }, { name: 'frond_2' }),
      { maxAttributeReads: 40 },
    );
    expect(codes(budget)).toEqual(['HOST_VALIDATION_UNMEASURED']);
    expect(budget.findings[0]).toMatchObject({
      disposition: 'observe',
      measurement: { breakdown: { nodesNotMeasured: 2 } },
    });
    expect(budget.complete).toBe(false);
  });

  test('findings are capped per check and code with a summary count', () => {
    const strips = Array.from({ length: 40 }, (_, i) => ({
      name: `frond_${i}`,
      primitives: 2,
    }));
    const result = evaluateValidationProfileDocument(
      profile([{ id: 'count', select: { names: ['frond_*'] }, primitives: { max: 1 } }]),
      palm(...strips),
    );
    expect(result.findings).toHaveLength(33);
    expect(result.findings.at(-1)).toMatchObject({
      code: 'HOST_VALIDATION_PRIMITIVE_COUNT',
      measurement: { breakdown: { omitted: 8 } },
    });
  });

  test('only default-scene nodes are candidates', () => {
    const doc = palm({ name: 'frond_0' });
    const other = doc.createScene('Other');
    const stray = doc.createNode('frond_9');
    other.addChild(stray);
    addStrip(doc, stray, { name: 'frond_10', reversed: true });
    expect(evaluateValidationProfileDocument(profile(), doc).findings).toEqual([]);
  });

  test('reads the final GLB bytes', async () => {
    const bytes = await createGltfIO().writeBinary(palm({ name: 'frond_0', reversed: true }));
    const result = await evaluateValidationProfileGlb(profile(), bytes);
    expect(codes(result)).toEqual(['HOST_VALIDATION_ATTRIBUTE_GRADIENT']);
    const unreadable = await evaluateValidationProfileGlb(profile(), new Uint8Array([1, 2, 3]));
    expect(codes(unreadable)).toEqual(['HOST_VALIDATION_UNMEASURED']);
    expect(unreadable.complete).toBe(false);
  });
});

function binding(value: ValidationProfileV1) {
  return createAssetRequirementsStore().host.bind(
    { taskId: 'palm', lineageId: 'palm-a' },
    createAssetRequirementsV1({
      requirements: { validation: requestedRequirement(value) },
    }),
    {
      actor: 'holodeck',
      reason: 'Destination shader contract',
      source: 'brief',
    },
  );
}

function scenePalm(options: { split?: boolean; reversed?: boolean; name?: string } = {}) {
  const root = new THREE.Group();
  root.name = 'Palm';
  const geometry = new THREE.PlaneGeometry(0.4, 2, 1, 4);
  if (options.reversed) {
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  let material: THREE.Material | THREE.Material[] = new THREE.MeshStandardMaterial();
  if (options.split) {
    geometry.clearGroups();
    geometry.addGroup(0, 12, 0);
    geometry.addGroup(12, 12, 1);
    material = [
      new THREE.MeshStandardMaterial({ color: '#336633' }),
      new THREE.MeshStandardMaterial({ color: '#558855' }),
    ];
  }
  const frond = new THREE.Mesh(geometry, material);
  frond.name = options.name ?? 'frond_0';
  root.add(frond);
  return root;
}

describe('renderSceneToGLB with a host validation profile', () => {
  test('a conforming frond is evaluated and accepted', async () => {
    const result = await renderSceneToGLB(scenePalm(), {
      requirements: binding(profile()),
    });
    expect(result.qaReport.rules.find((rule) => rule.id === 'HOST_VALIDATION_PROFILE')).toEqual({
      id: 'HOST_VALIDATION_PROFILE',
      mode: 'enforce',
      status: 'evaluated',
    });
    expect(result.qaReport.acceptance).toBe('accepted');
    expect(result.qaReport.unevaluatedRequirements).toEqual([]);
  });

  test('enforce blocks a split or reversed frond; warn completes with a warning', async () => {
    for (const [options, code] of [
      [{ split: true }, 'HOST_VALIDATION_PRIMITIVE_COUNT'],
      [{ reversed: true }, 'HOST_VALIDATION_ATTRIBUTE_GRADIENT'],
    ] as const) {
      const blocked = await renderSceneToGLB(scenePalm(options), {
        requirements: binding(profile()),
      }).catch((error: unknown) => error);
      expect(blocked).toBeInstanceOf(AssetQaBlockedError);
      expect((blocked as AssetQaBlockedError).stage).toBe('final-glb');
      expect((blocked as Error).message).toContain(code);
      expect((blocked as Error).message).toContain('/Scene[0]/Palm[0]/frond_0[0]');

      const warned = await renderSceneToGLB(scenePalm(options), {
        requirements: binding(profile([frondCheck], 'warn')),
      });
      expect(warned.qaReport.disposition).toBe('warn');
      expect(warned.qaReport.acceptance).toBe('accepted');
      const finding = warned.qaReport.dimensions.requirementReadiness.findings.find(
        (item) => item.code === code,
      );
      expect(finding).toMatchObject({
        disposition: 'warn',
        affected: { nodePath: '/Scene[0]/Palm[0]/frond_0[0]' },
      });
    }
  });

  test('a renamed frond blocks instead of passing silently', async () => {
    await expect(
      renderSceneToGLB(scenePalm({ name: 'leaf_0' }), {
        requirements: binding(profile()),
      }),
    ).rejects.toThrow('HOST_VALIDATION_SELECTOR_UNMATCHED');
  });

  test('KILN_QA_MODE=observe relaxes the profile like any other enforced requirement', async () => {
    const previous = process.env.KILN_QA_MODE;
    process.env.KILN_QA_MODE = 'observe';
    try {
      const result = await renderSceneToGLB(scenePalm({ reversed: true }), {
        requirements: binding(profile()),
      });
      const finding = result.qaReport.dimensions.requirementReadiness.findings.find(
        (item) => item.code === 'HOST_VALIDATION_ATTRIBUTE_GRADIENT',
      );
      expect(finding?.disposition).toBe('observe');
      expect(result.qaReport.acceptance).toBe('incomplete');
    } finally {
      if (previous === undefined) delete process.env.KILN_QA_MODE;
      else process.env.KILN_QA_MODE = previous;
    }
  });

  test('a neutral binding does not run the rule', async () => {
    const result = await renderSceneToGLB(scenePalm({ reversed: true }));
    expect(
      result.qaReport.rules.find((rule) => rule.id === 'HOST_VALIDATION_PROFILE')?.status,
    ).toBe('notRequested');
    expect(result.qaReport.acceptance).toBe('accepted');
  });
});
