import { expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { FileAssetLibrary } from '../assets-node';
import { createAssetIntentV1 } from '../contracts';
import { createAssetRequirementsV1 } from '../contracts/requirements';
import { createAssetRequirementsStore } from '../requirements-store';
import { renderGLBInProcess } from '../render';
import { rebuildLegacyAsset } from '../migration-rebuild';
import { createLocalToolContext } from '../local-runtime';

const code = `const meta={name:'LegacyBox',category:'prop'};function build(){const r=createRoot('Asset');createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});return r;}`;
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'kiln-migration-rebuild-'));
  const library = new FileAssetLibrary({ project: join(dir, 'assets') });
  const rendered = await renderGLBInProcess(code);
  const original = await library.save('project', {
    name: 'LegacyBox',
    code,
    glb: rendered.glb,
    build: {
      engine: 'historical-fixture',
      options: {
        category: 'prop',
        intent: createAssetIntentV1({ category: 'prop', bounds: { units: 'm', x: 1 } }),
        optimize: 'off',
      },
      warnings: [],
      qa: { disposition: 'pass', historicalOnly: true },
    },
  });
  const binding = createAssetRequirementsStore().host.bind(
    { taskId: 'migration-review', lineageId: original.assetId },
    createAssetRequirementsV1({
      requirements: { bounds: { state: 'requested', value: { units: 'm', x: 1 } } },
    }),
    {
      actor: 'owner',
      source: 'migration',
      reason:
        'Use the reviewed one-meter bound under current policy; retain old policy as provenance.',
    },
  );
  await writeFile(join(dir, 'binding.json'), JSON.stringify(binding));
  const run = (args: string[]) =>
    Bun.spawnSync([process.execPath, resolve(import.meta.dir, '../cli.ts'), ...args], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        KILN_RENDER: 'cpu',
        KILN_COLLECTIONS: JSON.stringify({ project: join(dir, 'assets') }),
        KILN_WORKSPACE: dir,
        KILN_PROGRAM_STORE: join(dir, 'programs'),
        KILN_BUILD_CACHE_DIR: join(dir, 'cache'),
      },
    });
  const args = [
    'migrate',
    'rebuild',
    original.assetId,
    original.revisionId,
    '--requirements',
    'binding.json',
    '--render',
    'cpu',
  ];
  return { dir, library, original, binding, run, args };
}

test('explicit CLI migration rebuilds an immutable child with current policy and allows subsequent ordinary edits', async () => {
  const f = await fixture();
  try {
    const before = await f.library.read('project', f.original.assetId, f.original.revisionId);
    const result = f.run(f.args);
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout.toString());
    const next = await f.library.read('project', f.original.assetId, output.asset.revisionId);
    expect(next.manifest.parentRevision).toBe(f.original.revisionId);
    expect(next.manifest.build?.options).not.toHaveProperty('intent');
    expect(next.manifest.build?.options.requirements).toMatchObject({ binding: f.binding });
    expect(next.manifest.build?.qa).not.toHaveProperty('historicalOnly');
    expect(next.manifest.build?.options.migration).toMatchObject({
      policyDisposition: 'explicit-replacement',
      original: before.manifest,
    });
    expect(output.policyChanges.length).toBeGreaterThan(0);
    expect(next.files['source.kiln.js']).toEqual(before.files['source.kiln.js']);
    expect(await f.library.read('project', f.original.assetId, f.original.revisionId)).toEqual(
      before,
    );
    expect(
      f.run([
        'asset',
        f.original.assetId,
        output.asset.revisionId,
        '--restore',
        '--requirements',
        'binding.json',
      ]).exitCode,
    ).toBe(0);
    await writeFile(join(f.dir, 'edited.js'), code.replace("'#888888'", "'#4488cc'"));
    const edited = f.run([
      'save',
      'edited.js',
      '--name',
      'EditedBox',
      '--asset',
      f.original.assetId,
      '--parent',
      output.asset.revisionId,
      '--requirements',
      'binding.json',
      '--render',
      'cpu',
    ]);
    expect(edited.exitCode).toBe(0);
    expect((await f.library.list('project')).length).toBe(3);
    const alreadyCurrent = f.run([
      'migrate',
      'rebuild',
      f.original.assetId,
      output.asset.revisionId,
      '--requirements',
      'binding.json',
      '--render',
      'cpu',
    ]);
    expect(alreadyCurrent.exitCode).toBe(3);
    expect(alreadyCurrent.stdout.toString()).toContain('CURRENT_REQUIREMENTS_PRESENT');
    expect((await f.library.list('project')).length).toBe(3);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
}, 20000);

test('unresolved data, wrong authority and failed rebuilds leave the old revision as the only revision', async () => {
  const f = await fixture();
  try {
    const file = join(
      f.dir,
      'assets',
      f.original.assetId,
      'revisions',
      f.original.revisionId,
      'manifest.json',
    );
    const originalText = await readFile(file, 'utf8');
    await writeFile(file, JSON.stringify({ ...f.original, unexplainedPolicy: true }));
    const unknown = f.run(f.args);
    expect(unknown.exitCode).toBe(3);
    expect(unknown.stdout.toString()).toContain('UNMAPPED_MANIFEST_FIELD');
    expect((await f.library.list('project')).length).toBe(1);
    await writeFile(file, originalText);
    const unmatchedOptions = structuredClone(f.original);
    unmatchedOptions.build!.options.optimize = 'palette';
    await writeFile(file, JSON.stringify(unmatchedOptions));
    expect(f.run(f.args).exitCode).toBe(3);
    await writeFile(file, originalText);
    const wrongAuthority = structuredClone(f.binding);
    wrongAuthority.history[0]!.source = 'brief';
    await writeFile(join(f.dir, 'binding.json'), JSON.stringify(wrongAuthority));
    expect(f.run(f.args).exitCode).toBe(1);
    await writeFile(join(f.dir, 'binding.json'), JSON.stringify(f.binding));
    await writeFile(join(f.dir, 'bad.js'), 'function build(){return createRoot("Empty");}');
    expect(f.run([...f.args, '--source', 'bad.js']).exitCode).toBe(1);
    expect((await f.library.list('project')).length).toBe(1);
    expect(await readFile(file, 'utf8')).toBe(originalText);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
}, 20000);

test('an explicit source repair retains its identity and incomplete current checks are never promoted', async () => {
  const f = await fixture();
  try {
    const binding = createAssetRequirementsStore().host.bind(
      { taskId: 'migration-review', lineageId: f.original.assetId },
      createAssetRequirementsV1({ requirements: { opening: { state: 'requested', value: {} } } }),
      {
        actor: 'owner',
        source: 'migration',
        reason: 'Reviewed opening request remains unmeasured; preserve that limitation.',
      },
    );
    await writeFile(join(f.dir, 'binding.json'), JSON.stringify(binding));
    const updated = `\uFEFF${code.replace("'#888888'", "'#4488cc'")}`;
    await writeFile(join(f.dir, 'updated.js'), updated);
    const result = f.run([...f.args, '--source', 'updated.js']);
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout.toString());
    expect(output.acceptance).toBe('incomplete');
    const saved = await f.library.read('project', f.original.assetId, output.asset.revisionId);
    expect(saved.files['source.kiln.js']).toEqual(new TextEncoder().encode(updated));
    expect(saved.manifest.build!.options.migration).toMatchObject({
      sourceChanged: true,
      rebuiltSourceSha256: saved.manifest.files['source.kiln.js']!.sha256,
    });
    expect(saved.manifest.build!.qa).toMatchObject({ acceptance: 'incomplete' });
    expect(
      (await f.library.read('project', f.original.assetId, f.original.revisionId)).files[
        'source.kiln.js'
      ],
    ).toEqual(new TextEncoder().encode(code));
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
}, 20000);

test('missing legacy intent needs explicit recovery and the original record is never rewritten', async () => {
  const f = await fixture();
  try {
    const original = structuredClone(f.original);
    const intent = original.build!.options.intent;
    delete original.build!.options.intent;
    const file = join(
      f.dir,
      'assets',
      original.assetId,
      'revisions',
      original.revisionId,
      'manifest.json',
    );
    const bytes = JSON.stringify(original, null, 2);
    await writeFile(file, bytes);
    const missing = f.run(f.args);
    expect(missing.exitCode).toBe(3);
    expect(missing.stdout.toString()).toContain('MISSING_LEGACY_INTENT');
    await writeFile(join(f.dir, 'recovered.json'), JSON.stringify(intent));
    const recovered = f.run([...f.args, '--legacy-intent', 'recovered.json']);
    expect(recovered.exitCode).toBe(0);
    const output = JSON.parse(recovered.stdout.toString());
    expect(output.asset.build.options.migration.recoveredIntent).toEqual({
      source: 'host-reconstruction',
      value: intent,
    });
    expect(output.asset.build.options.migration.original.build.options).not.toHaveProperty(
      'intent',
    );
    expect(await readFile(file, 'utf8')).toBe(bytes);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
}, 20000);

test('embedded migration snapshots host policy and destination before asynchronous reads', async () => {
  const f = await fixture();
  try {
    const requestedBinding = structuredClone(f.binding);
    const selection = {
      collection: 'project',
      assetId: f.original.assetId,
      revisionId: f.original.revisionId,
    };
    const context = createLocalToolContext(
      {
        requirements: f.binding,
        assetLibrary: {
          collections: () => f.library.collections(),
          list: (c) => f.library.list(c),
          save: (c, d) => f.library.save(c, d),
          import: (c, r) => f.library.import(c, r),
          read: async (c, a, r) => {
            const record = await f.library.read(c, a, r);
            selection.assetId = 'a_unrelated';
            f.binding.requirements.requirements = {};
            return record;
          },
        },
      },
      {
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_WORKSPACE: f.dir,
        KILN_PROGRAM_STORE: join(f.dir, 'programs'),
      },
    );
    const result = await rebuildLegacyAsset(context, selection);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Unexpected unresolved migration');
    expect(result.asset.assetId).toBe(f.original.assetId);
    expect(result.asset.build!.options.requirements).toMatchObject({ binding: requestedBinding });
    expect(result.policyChanges.find((c) => c.path === 'requirements.parts')).toMatchObject({
      before: { present: true },
      after: { present: false },
    });
    expect((await f.library.list('project')).length).toBe(2);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
}, 20000);
