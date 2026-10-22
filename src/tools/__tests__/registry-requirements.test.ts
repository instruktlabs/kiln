import { expect, test } from 'bun:test';
import { createKilnProgramToolRegistry, createKilnNativeToolRegistry } from '../registry';
import { createAssetRequirementsStore } from '../../requirements-store';
import { createAssetRequirementsV1, requestedRequirement } from '../../contracts/requirements';
import type { ValidationProfileV1 } from '../../contracts/validation-profile';
import { MemoryProgramStore } from '../../program-store';
import { ProgramArtifactStore } from '../program-artifacts';
import { FileAssetLibrary } from '../../assets-node';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from '../../inspect';
import { renderGLBInProcess } from '../../render';
import type { RequirementsContext } from '../../requirements-context';

const source = `const meta={name:'Box',category:'vehicle',requirements:{}};
function build(){const r=createRoot('Box');createPart('Body',boxGeo(1,1,1),gameMaterial('#777777'),{parent:r});return r;}`;
function binding(lineageId: string) {
  return createAssetRequirementsStore().host.bind(
    { taskId: 'brief', lineageId },
    createAssetRequirementsV1({ labels: ['roofless arena'] }),
    { actor: 'owner', reason: 'Asset brief', source: 'brief' },
  );
}
async function call(
  registry: ReturnType<typeof createKilnProgramToolRegistry>,
  name: string,
  input: unknown,
) {
  return (await registry.find((tool) => tool.name === name)!.run(input)) as {
    requirements: RequirementsContext;
    qaReport: { schemaVersion: number; category?: string };
    validationScope?: string;
  };
}

test('neutral tools expose the resolved requirements without promoting authored labels', async () => {
  const tools = createKilnProgramToolRegistry();
  const syntax = await call(tools, 'kiln_validate', { code: source });
  const rendered = await call(tools, 'kiln_render', { code: source });
  expect(syntax.validationScope).toBe('syntax-and-sandbox');
  expect(syntax.requirements.binding).toBeUndefined();
  expect(rendered.requirements).toEqual(syntax.requirements);
  expect(rendered.qaReport.schemaVersion).toBe(2);
  expect(rendered.qaReport.category).toBeUndefined();
});

test('independent asset contexts retain their own binding with identical source', async () => {
  const a = binding('arena');
  const b = binding('display');
  const [left, right] = await Promise.all(
    [a, b].map((requirements) =>
      call(createKilnProgramToolRegistry({ requirements }), 'kiln_render', {
        code: source,
      }),
    ),
  );
  expect(left!.requirements.binding).toEqual(a);
  expect(right!.requirements.binding).toEqual(b);
  const report = await inspect(source, { requirements: a });
  expect(report.requirements.binding).toEqual(a);
});

test('evaluation snapshots a binding before an asynchronous host can change its input', async () => {
  const requirements = binding('before');
  const tools = createKilnProgramToolRegistry({
    requirements,
    evaluatorPort: {
      render: async (code, options) => {
        requirements.lineageId = 'changed-after-dispatch';
        return renderGLBInProcess(code, options);
      },
    },
  });
  const rendered = await call(tools, 'kiln_render', { code: source });
  expect(rendered.requirements.binding!.lineageId).toBe('before');
});

test('legacy host category is rejected when constructing both tool surfaces', () => {
  expect(() => createKilnNativeToolRegistry({ category: 'prop' }, {})).toThrow(
    'explicit migration',
  );
  expect(() => createKilnProgramToolRegistry({ category: 'vehicle' })).toThrow(
    'explicit migration',
  );
});

// Host validation profile (#208): the host binding is the only source of the profile.
const frondSource = (
  name: string,
) => `const meta={name:'Palm',requirements:{validation:{state:'inapplicable'}}};
function build(){const r=createRoot('Palm');const f=createPart('${name}',boxGeo(0.2,2,0.05),gameMaterial('#336633'),{parent:r});f.userData.requirements={validation:{state:'inapplicable'}};f.userData.kilnValidation={pass:true};return r;}`;
function validationProfile(material?: { doubleSided: boolean }): ValidationProfileV1 {
  return {
    version: 'kiln.validation-profile.v1',
    profileId: 'holodeck.palm',
    mode: 'enforce',
    checks: [
      {
        id: 'frond',
        // createPart('frond_0') exports its mesh node as Mesh_frond_0; patterns match final names.
        select: { names: ['Mesh_frond_*'] },
        primitives: { exactly: 1 },
        ...(material ? { material } : {}),
      },
    ],
  };
}
const profileKey = { taskId: 'palm', lineageId: 'palm-a' };
const hostAuthority = {
  actor: 'holodeck',
  reason: 'Destination shader contract',
  source: 'brief' as const,
};
function profileBinding(profile = validationProfile()) {
  return createAssetRequirementsStore().host.bind(
    profileKey,
    createAssetRequirementsV1({ requirements: { validation: requestedRequirement(profile) } }),
    hostAuthority,
  );
}
async function renderResult(
  registry: ReturnType<typeof createKilnProgramToolRegistry>,
  input: Record<string, unknown>,
) {
  return (await registry.find((tool) => tool.name === 'kiln_render')!.run(input)) as {
    ok: boolean;
    error?: string;
    qaReport?: { acceptance: string };
  };
}

test('tool input, source meta and userData cannot weaken a bound validation profile', async () => {
  const tools = createKilnProgramToolRegistry({ requirements: profileBinding() });
  const weakening = {
    requirements: { validation: { state: 'inapplicable' } },
    validation: { mode: 'warn', checks: [] },
  };
  const renamed = await renderResult(tools, { code: frondSource('leaf_0'), ...weakening });
  expect(renamed.ok).toBe(false);
  expect(renamed.error).toContain('HOST_VALIDATION_SELECTOR_UNMATCHED');
  const conforming = await renderResult(tools, { code: frondSource('frond_0'), ...weakening });
  expect(conforming.ok).toBe(true);
  expect(conforming.qaReport?.acceptance).toBe('accepted');
});

test('a validation profile change invalidates earlier finish, render and save authorization', async () => {
  const store = createAssetRequirementsStore();
  const v1 = store.host.bind(
    profileKey,
    createAssetRequirementsV1({
      requirements: { validation: requestedRequirement(validationProfile()) },
    }),
    hostAuthority,
  );
  const v2 = store.host.replace(
    profileKey,
    v1.revision,
    createAssetRequirementsV1({
      requirements: {
        validation: requestedRequirement(validationProfile({ doubleSided: true })),
      },
    }),
    { ...hostAuthority, reason: 'Fronds render both faces' },
  );
  expect(v2.policyHash).not.toBe(v1.policyHash);
  expect(v2.history.at(-1)?.previousPolicyHash).toBe(v1.policyHash);

  const programStore = new MemoryProgramStore();
  const programArtifacts = new ProgramArtifactStore();
  const shared = { programStore, programArtifacts, cacheEvaluations: false };
  const programRef = await programStore.put(frondSource('frond_0'));
  const before = createKilnNativeToolRegistry({ ...shared, requirements: v1 }, {});
  const reviewed = (await before
    .find((tool) => tool.name === 'kiln_render')!
    .run({ programRef, capture: { preset: '1x1' } })) as { ok: boolean };
  expect(reviewed.ok).toBe(true);
  const after = createKilnNativeToolRegistry({ ...shared, requirements: v2 }, {});
  await expect(
    after.find((tool) => tool.name === 'kiln_finish')!.run({ programRef }),
  ).rejects.toThrow('requirements');
  const stricter = (await after
    .find((tool) => tool.name === 'kiln_render')!
    .run({ programRef, capture: { preset: '1x1' } })) as { ok: boolean; error?: string };
  expect(stricter.ok).toBe(false);
  expect(stricter.error).toContain('HOST_VALIDATION_MATERIAL_DOUBLE_SIDED');

  const directory = await mkdtemp(join(tmpdir(), 'kiln-validation-profile-'));
  try {
    const assetLibrary = new FileAssetLibrary({ project: directory });
    const saving = createKilnProgramToolRegistry({ assetLibrary, programStore, requirements: v2 });
    await expect(
      saving.find((tool) => tool.name === 'kiln_save')!.run({ programRef, name: 'Palm' }),
    ).rejects.toThrow('HOST_VALIDATION_MATERIAL_DOUBLE_SIDED');
    expect(await assetLibrary.list('project')).toHaveLength(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
