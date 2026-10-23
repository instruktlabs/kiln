import { createKilnProgramToolRegistry } from '../tools/registry';
import { expect, test } from 'bun:test';
import { evaluateEvaluatorRequestV2 } from './handler';
import {
  createEvaluatorRequestV2,
  decodeEvaluatorResultV2,
  createEvaluatorPortV2,
} from './protocol';
import { renderGLBViaSubprocess } from './subprocess';
import { authoringDiagnosticAdvice } from './authoring-diagnostic';
import { TEXTURE_USAGES } from '../texture-contract';
import {
  canonicalizeProceduralTextureSpecV2,
  canonicalizePortableMaterialSpecV2,
} from '../procedural-material-v2';
const code = `function build(){const uvs=[];new THREE.Float32BufferAttribute(uv,2);return createRoot('Duct');}`;
const request = () => createEvaluatorRequestV2({ requestId: 'diagnostic', code }).json;

test('invalid custom mesh Float32 data retains bounded repair advice through the worker', async () => {
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const render = defs.find((d) => d.name === 'kiln_render')!;
  for (const data of [
    `positions:[0,0,0,1,0,0,0,1,[0,0][2]-[1,1][2]]`,
    `positions:[0,0,0,1,0,0,0,1,0],uvs:[0,0,1,0,0,1e80]`,
    `positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,'PRIVATE_SOURCE_MARKER']`,
  ]) {
    const source = `function build(){return createPart('Panel',meshGeo({${data}}),gameMaterial(0x888888));}`;
    const wire = await evaluateEvaluatorRequestV2(
      createEvaluatorRequestV2({ requestId: 'mesh-data', code: source }).json,
    );
    expect(JSON.parse(wire).error.diagnostic).toBe('MESH_DATA_NONFINITE');
    const out = (await render.run({ code: source })) as { ok: boolean; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toContain('meshGeo');
    expect(out.error).toContain('Float32');
    expect(out.error).toContain('missing XYZ components');
    expect(wire + out.error).not.toContain('PRIVATE_SOURCE_MARKER');
  }
  const control = (await render.run({
    code: `function build(){return createPart('Panel',meshGeo({positions:[0,0,0,1,0,0,0,1,0]}),gameMaterial(0x888888));}`,
  })) as { ok: boolean };
  expect(control.ok).toBe(true);
}, 20000);

test.each(['12', "'PRIVATE_SOURCE_MARKER'"])(
  'taperConeGeo misplaced axis %s retains its positional repair contract through the worker',
  async (axis) => {
    const defs = createKilnProgramToolRegistry({
      evaluatorPort: { render: renderGLBViaSubprocess },
    });
    const render = defs.find((d) => d.name === 'kiln_render')!;
    const source = (value: string) =>
      `function build(){return createPart('Cap',taperConeGeo(.03,.02,.01,${value},12),gameMaterial(0x888888));}`;
    const rejected = (await render.run({ code: source(axis) })) as { ok: boolean; error: string };
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toContain('fourth argument');
    expect(rejected.error).toContain('fifth argument');
    expect(rejected.error).toContain('taperConeGeo');
    expect(rejected.error).not.toContain('PRIVATE_SOURCE_MARKER');
    const repaired = (await render.run({ code: source("'x'") })) as { ok: boolean };
    expect(repaired.ok).toBe(true);
  },
);

test('unsupported texture blends retain closed repair advice through the worker', async () => {
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  for (const blend of ['soft-light', 'PRIVATE_SOURCE_MARKER']) {
    const result = (await defs
      .find((d) => d.name === 'kiln_render')!
      .run({
        code: `function build(){proceduralTexture({schemaVersion:2,layers:[{op:'solid',color:0x888888,blend:'${blend}'}]});return createRoot('Root');}`,
      })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('blend');
    expect(result.error).toContain('normal, multiply, screen, or overlay');
    expect(result.error).not.toContain('PRIVATE_SOURCE_MARKER');
  }
});

test('part argument repair hints survive the worker without authored names', async () => {
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  for (const [args, advice] of [
    ["createRoot('PRIVATE_SOURCE_MARKER'),boxGeo(1,1,1),gameMaterial(0x888888)", 'first argument'],
    ["'PRIVATE_SOURCE_MARKER',roundedBoxGeo(1,1,1,.1),gameMaterial(0x888888)", 'await'],
    ["'PRIVATE_SOURCE_MARKER',boxGeo,gameMaterial(0x888888)", 'Call geometry helpers'],
    ["'PRIVATE_SOURCE_MARKER',boxGeo(1,1,1),0x888888", 'third argument'],
  ]) {
    const result = (await defs
      .find((d) => d.name === 'kiln_render')!
      .run({
        code: `async function build(){return createPart(${args});}`,
      })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('createPart');
    expect(result.error).toContain(advice!);
    expect(result.error).not.toContain('PRIVATE_SOURCE_MARKER');
  }
});

test('material color argument mistakes retain safe repair advice through the worker', async () => {
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  for (const helper of ['gameMaterial', 'basicMaterial', 'glassMaterial', 'lambertMaterial']) {
    const result = (await defs
      .find((d) => d.name === 'kiln_render')!
      .run({
        code: `function build(){return createPart('Body',boxGeo(1,1,1),${helper}({PRIVATE_SOURCE_MARKER:1,color:0x9a9a96}));}`,
      })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('color');
    expect(result.error).toContain('second argument');
    expect(result.error).toContain('pbrMaterial');
    expect(result.error).not.toContain('PRIVATE_SOURCE_MARKER');
  }
});

test('packed material texture mistakes retain the channel contract through the worker', async () => {
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  for (const fields of [
    'roughness:a',
    'metalness:a',
    'roughness:a,metalness:b',
    'metallicRoughness:a,roughness:a',
  ]) {
    const result = (await defs
      .find((d) => d.name === 'kiln_render')!
      .run({
        code: `function build(){const PRIVATE_SOURCE_MARKER=1,a=new THREE.Texture(),b=new THREE.Texture();return createPart('Body',boxGeo(1,1,1),pbrMaterial({${fields}}));}`,
      })) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('packed');
    expect(result.error).toContain('G=roughness');
    expect(result.error).toContain('B=metalness');
    expect(result.error).not.toContain('PRIVATE_SOURCE_MARKER');
  }
});

test.each([
  [
    "await materialRecipe('kiln.material.emissive.v1',{emissiveIntensity:1.8})",
    'materialRecipe',
    '0..1',
  ],
  ['await extrudeProfile([[0,0],[0.1,0],[0.1,0.02],[0,0.02]],{bevel:0.02})', 'bevel', 'narrowest'],
  [
    'await revolveProfile([[0.067,0.038],[0.069,0.038],[0.069,0.046],[0.067,0.046]],{bevel:0.001})',
    'bevel',
    'narrowest',
  ],
])('repair advice through worker: %s', async (expression, helper, range) => {
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const result = (await defs
    .find((d) => d.name === 'kiln_render')!
    .run({
      code: `async function build(){const PRIVATE_SOURCE_MARKER=1;${expression};return createRoot('Root');}`,
    })) as { ok: boolean; error: string };
  expect(result.ok).toBe(false);
  expect(result.error).toContain(helper!);
  expect(result.error).toContain(range!);
  expect(result.error).not.toContain('PRIVATE_SOURCE_MARKER');
});

test('missing tube radius gets a shared safe repair hint through the worker', async () => {
  for (const helper of ['curveToMesh', 'pipeAlongPath']) {
    const source = `function build(){const PRIVATE_DIMENSIONS={};const g=${helper}([[0,0,0],[0,0.2,0]],PRIVATE_DIMENSIONS.radius);return createPart('Body',g,gameMaterial('#888888'));}`;
    const defs = createKilnProgramToolRegistry({
      evaluatorPort: { render: renderGLBViaSubprocess },
    });
    const result = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
      ok: boolean;
      error: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('explicit');
    expect(result.error).toContain('radius');
    expect(result.error).toContain('undefined');
    expect(result.error).not.toContain('PRIVATE_DIMENSIONS');
  }
});

test('alpha mode errors carry exact input values through worker-backed tools', async () => {
  for (const expression of [
    "pbrMaterial({alphaMode:'OPAQUE'})",
    "compilePortableMaterialSpecV2({schemaVersion:2,model:'pbrMetallicRoughness',alphaMode:'PRIVATE_SOURCE_MARKER'})",
  ]) {
    const source = `async function build(){await ${expression};return createRoot('Root');}`;
    const defs = createKilnProgramToolRegistry({
      evaluatorPort: { render: renderGLBViaSubprocess },
    });
    const result = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
      ok: boolean;
      error: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('lowercase');
    expect(result.error).toContain('"opaque", "mask", or "blend"');
    expect(result.error).not.toContain('PRIVATE_SOURCE_MARKER');
  }
});

test('removed helper migration survives the evaluator boundary without authored error text', async () => {
  const source = `throw new Error('PRIVATE_SOURCE_MARKER'); function build(){function unrelated(cloneGeometry){} cloneGeometry();return createRoot('Root');}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'removed-helper', code: source }).json,
  );
  expect(JSON.parse(wire).error.diagnostic).toBe('REMOVED_HELPER');
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const validation = (await defs
    .find((d) => d.name === 'kiln_validate')!
    .run({ code: source })) as {
    valid: boolean;
    issues: { code: string; fixHint?: string }[];
  };
  expect(validation.valid).toBe(false);
  expect(validation.issues).toContainEqual(
    expect.objectContaining({
      code: 'REMOVED_HELPER',
      fixHint: expect.stringContaining('copyGeometry'),
    }),
  );
  const result = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
    ok: boolean;
    error: string;
  };
  expect(result.ok).toBe(false);
  expect(result.error).toContain('kiln_validate');
  expect(result.error).toContain('migration');
  expect(wire + result.error).not.toContain('PRIVATE_SOURCE_MARKER');
});

test('collapsed profile correspondence retains safe repair advice through the worker', async () => {
  const source = `function build(){const p=[[-1,-1],[1,-1],[1,1],[-1,1]];loftProfiles([{profile:p},{profile:[...p.slice(2),...p.slice(0,2)],frame:{origin:[0,2,0]}}]);return createRoot('PRIVATE_SOURCE_MARKER');}`;
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const result = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
    ok: boolean;
    error: string;
  };
  expect(result.ok).toBe(false);
  expect(result.error).toContain('corresponding');
  expect(result.error).toContain('intermediate');
  expect(result.error).not.toContain('PRIVATE_SOURCE_MARKER');
});

test('unsupported profile holes retain repair advice across the worker and shared tools', async () => {
  const outlines = 'const p=[[-1,-1],[1,-1],[1,1],[-1,1]]; const holes=[p];';
  for (const expression of [
    'loftProfiles([{profile:p},{profile:p,frame:{origin:[0,2,0]}}],{holes})',
    'loftProfiles([{profile:p,holes},{profile:p,frame:{origin:[0,2,0]}}])',
    'sweepProfile(p,[[0,0,0],[0,2,0]],{holes})',
  ]) {
    const source = `function build(){${outlines}${expression};return createRoot('PRIVATE_SOURCE_MARKER');}`;
    const wire = await evaluateEvaluatorRequestV2(
      createEvaluatorRequestV2({ requestId: 'profile-holes', code: source }).json,
    );
    expect(JSON.parse(wire).error.diagnostic).toBe('PROFILE_HOLES_UNSUPPORTED');
    const defs = createKilnProgramToolRegistry({
      evaluatorPort: { render: renderGLBViaSubprocess },
    });
    const out = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
      ok: boolean;
      error: string;
    };
    expect(out.ok).toBe(false);
    expect(out.error).toContain('extrudeProfile');
    expect(out.error).toContain('holes');
    expect(wire + out.error).not.toContain('PRIVATE_SOURCE_MARKER');
  }
});

test('material fraction mistakes receive actionable private-value-free advice across evaluator and tools', async () => {
  const source = `function build(){proceduralTexture({schemaVersion:2,layers:[{op:'bricks',brick:0,mortar:0,mortarWidth:2}]});return createRoot('PRIVATE_SOURCE_MARKER');}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'material-fraction', code: source }).json,
  );
  expect(JSON.parse(wire).error).toEqual({
    code: 'EXECUTION_REJECTED',
    message: 'Generated asset execution was rejected.',
    diagnostic: 'MATERIAL_FRACTION_RANGE',
  });
  expect(decodeEvaluatorResultV2(wire, 100000, 'material-fraction').ok).toBe(false);
  const error = await renderGLBViaSubprocess(source).catch((error: unknown) => error);
  expect(error).toMatchObject({
    code: 'EXECUTION_REJECTED',
    diagnostic: 'MATERIAL_FRACTION_RANGE',
  });
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const out = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
    ok: boolean;
    error: string;
  };
  expect(out.ok).toBe(false);
  for (const output of [String(error), out.error]) {
    expect(output).toContain('between 0 and 1');
    expect(output).toContain('mortarWidth and stagger are fractions');
    expect(output).not.toContain('got 2');
    expect(output).not.toContain('procedural-material-v2.ts');
    expect(output).not.toContain('PRIVATE_SOURCE_MARKER');
  }
}, 20000);

test('fraction hints cover supported texture and portable material fields without changing valid endpoints', () => {
  for (const field of [
    'mortarWidth',
    'stagger',
    'opacity',
    'roughness',
    'metalness',
    'alphaCutoff',
  ]) {
    const canonicalize = (value: unknown) =>
      ['mortarWidth', 'stagger', 'opacity'].includes(field)
        ? canonicalizeProceduralTextureSpecV2({
            schemaVersion: 2,
            layers: [{ op: 'bricks', brick: 0, mortar: 0, [field]: value }],
          })
        : canonicalizePortableMaterialSpecV2({
            schemaVersion: 2,
            model: 'pbrMetallicRoughness',
            [field]: value,
          });
    for (const value of [-0.1, 2, NaN, Infinity, 'PRIVATE_SOURCE_MARKER']) {
      let thrown: unknown;
      try {
        canonicalize(value);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ diagnostic: 'MATERIAL_FRACTION_RANGE' });
    }
    for (const value of [undefined, 0, 0.5, 1]) expect(() => canonicalize(value)).not.toThrow();
  }
});

test('rounded box radius boundary gets a closed hint through handler, subprocess, and registry', async () => {
  const source = `async function build(){await roundedBoxGeo(0.28,0.068,0.012,0.006);return createRoot('PRIVATE_SOURCE_MARKER');}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'rounded-box', code: source }).json,
  );
  expect(JSON.parse(wire).error).toEqual({
    code: 'EXECUTION_REJECTED',
    message: 'Generated asset execution was rejected.',
    diagnostic: 'ROUNDED_BOX_RADIUS',
  });
  const decoded = decodeEvaluatorResultV2(wire, 100000, 'rounded-box');
  expect(decoded.ok).toBe(false);
  const invalidOutcome = JSON.parse(wire);
  invalidOutcome.error.code = 'WORKER_FAILED';
  invalidOutcome.error.message = 'Evaluator worker failed.';
  expect(() =>
    decodeEvaluatorResultV2(JSON.stringify(invalidOutcome), 100000, 'rounded-box'),
  ).toThrow();
  const error = await renderGLBViaSubprocess(source).catch((error: unknown) => error);
  expect(error).toMatchObject({
    code: 'EXECUTION_REJECTED',
    diagnostic: 'ROUNDED_BOX_RADIUS',
  });
  expect(String(error)).toContain('radius must be less than half the smallest dimension');
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const out = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
    ok: boolean;
    error: string;
  };
  expect(out.ok).toBe(false);
  expect(out.error).toContain('radius must be less than half the smallest dimension');
  for (const output of [wire, String(error), out.error]) {
    for (const privateValue of ['0.006', '0.012', 'PRIVATE_SOURCE_MARKER', 'profile.ts']) {
      expect(output).not.toContain(privateValue);
    }
  }
}, 20000);
test('gear radii mistakes receive a closed repair hint through handler and actual subprocess', async () => {
  const source = `function build(){const root=createRoot('Lens');createPart('Gear',gearGeo({teeth:28,tipRadius:0.075,boreRadius:0.012,height:0.024}),gameMaterial(0x909090),{parent:root});return root;}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'gear', code: source }).json,
  );
  expect(JSON.parse(wire).error.diagnostic).toBe('GEAR_RADII_ORDER');
  expect(wire).not.toContain('0.075');
  await expect(renderGLBViaSubprocess(source)).rejects.toMatchObject({
    code: 'EXECUTION_REJECTED',
    diagnostic: 'GEAR_RADII_ORDER',
  });
  await expect(renderGLBViaSubprocess(source)).rejects.toThrow(
    'specify rootRadius when changing tipRadius',
  );
}, 20000);
test('procedural texture unknown keys receive closed repair advice through render tooling', async () => {
  const source = `function build(){proceduralTexture({schemaVersion:2,layers:[{op:'solid',color:0,frequency:'PRIVATE_VALUE'}]});return createRoot('PRIVATE_SOURCE_MARKER');}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'procedural-key', code: source }).json,
  );
  expect(JSON.parse(wire).error).toEqual({
    code: 'EXECUTION_REJECTED',
    message: 'Generated asset execution was rejected.',
    diagnostic: 'PROCEDURAL_TEXTURE_UNKNOWN_KEY',
  });
  await expect(renderGLBViaSubprocess(source)).rejects.toMatchObject({
    code: 'EXECUTION_REJECTED',
    diagnostic: 'PROCEDURAL_TEXTURE_UNKNOWN_KEY',
  });
  await expect(renderGLBViaSubprocess(source)).rejects.toThrow(
    'Remove unsupported proceduralTexture fields',
  );
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const out = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
    ok: boolean;
    error: string;
  };
  expect(out.ok).toBe(false);
  expect(out.error).toContain('Remove unsupported proceduralTexture fields');
  for (const output of [wire, out.error]) {
    expect(output).not.toContain('frequency');
    expect(output).not.toContain('PRIVATE_VALUE');
    expect(output).not.toContain('PRIVATE_SOURCE_MARKER');
  }
}, 20000);

test('periodic surface endpoint mismatches receive closed repair advice through render tooling', async () => {
  const source = `function build(){parametricSurface((u,v)=>[u,v,0],{periodicU:true});return createRoot('PRIVATE_SOURCE_MARKER');}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({ requestId: 'periodic-endpoint', code: source }).json,
  );
  expect(JSON.parse(wire).error).toEqual({
    code: 'EXECUTION_REJECTED',
    message: 'Generated asset execution was rejected.',
    diagnostic: 'PARAMETRIC_PERIODIC_ENDPOINT',
  });
  await expect(renderGLBViaSubprocess(source)).rejects.toMatchObject({
    code: 'EXECUTION_REJECTED',
    diagnostic: 'PARAMETRIC_PERIODIC_ENDPOINT',
  });
  await expect(renderGLBViaSubprocess(source)).rejects.toThrow(
    'Periodic parametricSurface endpoints must return matching positions',
  );
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const out = (await defs.find((d) => d.name === 'kiln_render')!.run({ code: source })) as {
    ok: boolean;
    error: string;
  };
  expect(out.ok).toBe(false);
  expect(out.error).toContain('Periodic parametricSurface endpoints');
  for (const output of [wire, out.error]) {
    expect(output).not.toContain('endpoint positions do not match');
    expect(output).not.toContain('PRIVATE_SOURCE_MARKER');
  }
}, 20000);
test('undeclared variable gets bounded actionable diagnostic through handler and port', async () => {
  const wire = await evaluateEvaluatorRequestV2(request());
  expect(JSON.parse(wire).error.diagnostic).toBe('UNBOUND_VARIABLE');
  expect(wire).not.toContain('uv');
  // Request IDs are checked, so use the actual request in the transport.
  const checked = createEvaluatorPortV2(async (json) => evaluateEvaluatorRequestV2(json));
  await expect(checked.render(code)).rejects.toThrow('Check variable spelling and scope');
});
test('actual subprocess retains safe repair advice without source or exception text', async () => {
  await expect(renderGLBViaSubprocess(code)).rejects.toMatchObject({
    code: 'EXECUTION_REJECTED',
    diagnostic: 'UNBOUND_VARIABLE',
  });
  await expect(renderGLBViaSubprocess(code)).rejects.toThrow('Check variable spelling and scope');
}, 20000);
test('diagnostic decoder rejects arbitrary strings, extra data, and inappropriate outcome codes', async () => {
  const wire = JSON.parse(await evaluateEvaluatorRequestV2(request()));
  for (const diagnostic of ['SECRET_VALUE', { code: 'UNBOUND_VARIABLE', stack: 'HOST_PATH' }]) {
    expect(() =>
      decodeEvaluatorResultV2(
        JSON.stringify({ ...wire, error: { ...wire.error, diagnostic } }),
        100000,
        'diagnostic',
      ),
    ).toThrow();
  }
  expect(() =>
    decodeEvaluatorResultV2(
      JSON.stringify({
        ...wire,
        error: {
          code: 'WORKER_FAILED',
          message: 'Evaluator worker failed.',
          diagnostic: 'UNBOUND_VARIABLE',
        },
      }),
      100000,
      'diagnostic',
    ),
  ).toThrow();
});
test('arbitrary exceptions and safety denials retain generic rejection', async () => {
  for (const source of [
    `function build(){throw new Error('SECRET_HOST_PATH');}`,
    `function build(){throw new Error('roundedBoxGeo: radius must be less than half the smallest dimension SECRET_HOST_PATH');}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'ROUNDED_BOX_RADIUS'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PROCEDURAL_TEXTURE_UNKNOWN_KEY'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PROCEDURAL_TEXTURE_BLEND'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PROCEDURAL_TEXTURE_USAGE'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'MATERIAL_FRACTION_RANGE'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'MATERIAL_COLOR_ARGUMENT'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'MATERIAL_PACKED_CHANNELS'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'MATERIAL_RECIPE_TEXTURE_BINDING'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PORTABLE_TEXTURE_REFERENCE'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PORTABLE_COLOR_ARGUMENT'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PART_NAME_ARGUMENT'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PART_GEOMETRY_ARGUMENT'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PART_MATERIAL_ARGUMENT'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PARAMETRIC_PERIODIC_ENDPOINT'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PROFILE_HOLES_UNSUPPORTED'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'TUBE_RADIUS'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'TAPER_CONE_AXIS'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'PROFILE_BEVEL_COLLAPSE'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'SOLID_FLOAT32_COLLAPSE'});}`,
    `function build(){throw Object.assign(new Error('SECRET_HOST_PATH'),{name:'AuthoringDiagnosticError',diagnostic:'MESH_DATA_NONFINITE'});}`,
    `function build(){return process.env.SECRET;}`,
  ]) {
    const result = JSON.parse(
      await evaluateEvaluatorRequestV2(
        createEvaluatorRequestV2({ requestId: 'safe', code: source }).json,
      ),
    );
    expect(result.error).toEqual({
      code: 'EXECUTION_REJECTED',
      message: 'Generated asset execution was rejected.',
    });
  }
});

test('shipping registry exposes repair advice from its isolated evaluator', async () => {
  const defs = createKilnProgramToolRegistry({ evaluatorPort: { render: renderGLBViaSubprocess } });
  const out = (await defs.find((d) => d.name === 'kiln_render')!.run({ code })) as {
    ok: boolean;
    error: string;
  };
  expect(out.ok).toBe(false);
  expect(out.error).toContain('Check variable spelling and scope');
  expect(out.error).not.toContain('uv');
}, 15000);

test('procedural texture usage errors list the accepted usages without crossing the message', async () => {
  const sources = [
    `function build(){proceduralTexture({schemaVersion:2,usage:'data',name:'PRIVATE_SOURCE_MARKER',layers:[{op:'solid',color:0}]});return createRoot('Cove');}`,
    `function build(){proceduralTexture({schemaVersion:3,width:4,height:4,usage:'height',operations:[]});return createRoot('Cove');}`,
    `async function build(){await compilePortableMaterialSpecV2({schemaVersion:2,model:'pbrMetallicRoughness',textures:{normal:{kind:'procedural',spec:{schemaVersion:2,usage:'albedo',layers:[{op:'solid',color:0}]}}}});return createRoot('Cove');}`,
    `async function build(){await compilePortableMaterialSpecV3({schemaVersion:3,model:'pbrMetallicRoughness',textures:{normal:{kind:'procedural',sampler:{minFilter:'linear',magFilter:'linear',wrapS:'repeat',wrapT:'repeat'},spec:{schemaVersion:3,width:4,height:4,usage:'albedo',operations:[]}}}});return createRoot('Cove');}`,
  ];
  for (const source of sources) {
    const wire = await evaluateEvaluatorRequestV2(
      createEvaluatorRequestV2({ requestId: 'procedural-usage', code: source }).json,
    );
    expect(JSON.parse(wire).error).toEqual({
      code: 'EXECUTION_REJECTED',
      message: 'Generated asset execution was rejected.',
      diagnostic: 'PROCEDURAL_TEXTURE_USAGE',
    });
    for (const secret of ['PRIVATE_SOURCE_MARKER', 'data', 'height'])
      expect(wire).not.toContain(secret);
  }
  await expect(renderGLBViaSubprocess(sources[0]!)).rejects.toMatchObject({
    code: 'EXECUTION_REJECTED',
    diagnostic: 'PROCEDURAL_TEXTURE_USAGE',
  });
  const advice = authoringDiagnosticAdvice('PROCEDURAL_TEXTURE_USAGE');
  for (const usage of TEXTURE_USAGES) expect(advice).toContain(usage);
  for (const slot of ['baseColor', 'normal', 'metallicRoughness', 'emissive', 'occlusion'])
    expect(advice).toContain(slot);
  await expect(renderGLBViaSubprocess(sources[0]!)).rejects.toThrow(advice);
}, 20000);
