import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { FileAssetLibrary } from '../src/assets-node';
import { materialLibraryPortableSpec } from '../src/material-library';
import { createMaterialLibraryPayload, createMaterialRecordV1 } from '../src/material-library-node';
import { createMaterialPresetDraft } from '../src/material-presets';
import { renderGLBInProcess } from '../src/render';
import {
  buildEntry,
  compareRuns,
  CORPUS_GATE_VERSION,
  createRegeneratingMaterialLibrary,
  engineModules,
  type EntryResult,
  formatComparison,
  indexPackMaterials,
  listCorpus,
  nodePinNote,
  parseExpectFile,
  type RunHeader,
  summarizeGlb,
} from './corpus-gate';

const header = (overrides: Partial<RunHeader> = {}): RunHeader => ({
  kind: CORPUS_GATE_VERSION,
  platform: 'win32',
  arch: 'x64',
  cpu: 'fixture',
  bun: '1.4.2',
  node: 'v22.23.4',
  sharp: 'fixture',
  engine: { commit: 'c'.repeat(40), dirty: false, identity: 'sha256:fixture' },
  selection: {},
  controls: { deadlineMs: 120000, heapMb: 4096 },
  startedAt: 'fixture',
  ...overrides,
});
const glb = (sha: string, sections: Record<string, string> = {}, geometry = 'g', images = 'i') => ({
  sha256: sha,
  bytes: 100,
  json: {
    sha256: `json-${sha}`,
    bytes: 60,
    sections: { meshes: 'm', materials: 'mat', ...sections },
  },
  bin: { sha256: `bin-${geometry}-${images}`, bytes: 40, parts: { geometry, images } },
});
const built = (key: string, sha: string, extra: Partial<EntryResult> = {}): EntryResult => ({
  key,
  pack: key.split('/')[0]!,
  kind: 'pack-revision',
  sourceSha256: 'sha256:source',
  status: 'built',
  glb: glb(sha),
  tris: 12,
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  ms: 1,
  ...extra,
});
const failed = (key: string, code: string, message: string): EntryResult => ({
  key,
  pack: key.split('/')[0]!,
  kind: 'pack-revision',
  sourceSha256: 'sha256:source',
  status: 'failed',
  error: { code, message },
  ms: 1,
});
const run = (results: EntryResult[], overrides: Partial<RunHeader> = {}) => ({
  header: header(overrides),
  results: new Map(results.map((result) => [result.key, result])),
});

test('the corpus lists saved revisions, pack snapshots and archive programs by stable key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-corpus-list-'));
  try {
    const put = async (path: string, text = '{}') => {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), text);
    };
    await put('packs/farm/sources/project/a_1/r_2/source.kiln.js', 'x');
    await put('packs/farm/sources/project/a_1/r_2/manifest.json');
    await put('packs/farm/sources/project/a_1/r_1/source.kiln.js', 'x');
    await put('packs/farm/sources/project/a_1/r_1/manifest.json');
    await put('packs/farm/sources/project/a_9/r_1/source.kiln.js', 'no manifest, not a revision');
    await put('packs/troy/assets/horse.kiln.js', 'x');
    await put('packs/troy/assets/horse.manifest.json');
    await put('packs/troy/assets/horse.materials.kiln.json');
    await put('packs/troy/assets/fig.kiln.js', 'no manifest, not a snapshot');
    await put('archive/examples/robot.kiln.js', 'x');
    await put('archive/site/examples/history/robot/initial.kiln.js', 'x');
    await put('archive/site/examples/canopy.kiln.js', 'x');
    const archive = join(root, 'archive');
    const keys = (selection = {}) =>
      listCorpus(root, selection, archive).map((entry) => `${entry.kind}:${entry.key}`);
    expect(keys()).toEqual([
      'archive:archive/examples/robot',
      'archive:archive/site/canopy',
      'archive:archive/site/history/robot/initial',
      'pack-revision:farm/project/a_1/r_1',
      'pack-revision:farm/project/a_1/r_2',
      'pack-snapshot:troy/assets/horse',
    ]);
    expect(listCorpus(root, {}, archive).at(-1)?.materialsPath).toBe(
      join(root, 'packs/troy/assets/horse.materials.kiln.json'),
    );
    expect(keys({ packs: ['troy'] })).toEqual(['pack-snapshot:troy/assets/horse']);
    expect(keys({ keys: ['farm/project/a_1/r_2', 'archive/site/history/'] })).toEqual([
      'archive:archive/site/history/robot/initial',
      'pack-revision:farm/project/a_1/r_2',
    ]);
    expect(keys({ archive: false })).toHaveLength(3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a GLB summary splits JSON by section and BIN into images and geometry', async () => {
  const io = new NodeIO();
  const make = async (roughness: number, y: number, pixel: number) => {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const position = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, y, 0]))
      .setBuffer(buffer);
    const texture = doc
      .createTexture()
      .setMimeType('image/png')
      .setImage(new Uint8Array([137, 80, 78, 71, pixel]));
    const material = doc
      .createMaterial()
      .setRoughnessFactor(roughness)
      .setBaseColorTexture(texture);
    const mesh = doc
      .createMesh()
      .addPrimitive(doc.createPrimitive().setAttribute('POSITION', position).setMaterial(material));
    doc.createScene().addChild(doc.createNode('Body').setMesh(mesh));
    return summarizeGlb(await io.writeBinary(doc));
  };
  const base = await make(0.5, 1, 1);
  expect(base.json.sections.materials).toBeDefined();
  expect(Object.keys(base.bin!.parts)).toEqual(['geometry', 'images']);
  expect(await make(0.5, 1, 1)).toEqual(base);
  const material = await make(0.8, 1, 1);
  const changedSections = (other: typeof base) =>
    Object.keys(base.json.sections).filter(
      (name) => base.json.sections[name] !== other.json.sections[name],
    );
  expect(changedSections(material)).toEqual(['materials']);
  expect(material.bin).toEqual(base.bin);
  const geometry = await make(0.5, 2, 1);
  expect(geometry.bin!.parts.geometry).not.toBe(base.bin!.parts.geometry);
  expect(geometry.bin!.parts.images).toBe(base.bin!.parts.images);
  const image = await make(0.5, 1, 2);
  expect(image.bin!.parts.images).not.toBe(base.bin!.parts.images);
  expect(image.bin!.parts.geometry).toBe(base.bin!.parts.geometry);
  expect(() => summarizeGlb(new Uint8Array(24))).toThrow('Not a GLB');
});

test('comparison is exact, explains each change and honours stated expectations', () => {
  const baseline = run([
    built('farm/project/a/r1', 'same'),
    built('farm/project/a/r2', 'old'),
    built('troy/project/b/r1', 'old', { tris: 10 }),
    failed('troy/project/b/r2', 'EXECUTION_REJECTED', 'boom'),
    failed('troy/project/b/r3', 'EXECUTION_REJECTED', 'boom'),
    built('vehicles/project/c/r1', 'gone'),
    failed('vehicles/project/c/r2', 'INPUT_INVALID', 'bad'),
  ]);
  const candidate = run([
    built('farm/project/a/r1', 'same'),
    built('farm/project/a/r2', 'new', {
      glb: glb('new', { materials: 'mat2' }),
    }),
    built('troy/project/b/r1', 'new', {
      tris: 14,
      glb: glb('new', {}, 'g2'),
      bounds: { min: [0, 0, 0], max: [1, 2, 1] },
    }),
    failed('troy/project/b/r2', 'EXECUTION_REJECTED', 'boom'),
    failed('troy/project/b/r3', 'EXECUTION_REJECTED', 'other'),
    built('vehicles/project/c/r2', 'fixed'),
    built('vehicles/project/c/r9', 'brand-new'),
  ]);
  const comparison = compareRuns(baseline, candidate, ['farm/project/a/r2', 'farm/project/a/r1']);
  expect(comparison).toMatchObject({
    mismatch: [],
    compared: 7,
    identical: 1,
    identicalFailures: 1,
    unexpected: 4,
    expectedUnchanged: ['farm/project/a/r1'],
    added: ['vehicles/project/c/r9'],
  });
  const byKey = Object.fromEntries(comparison.changes.map((change) => [change.key, change]));
  expect(byKey['farm/project/a/r2']).toMatchObject({
    kind: 'output',
    expected: true,
    json: ['materials'],
    bin: [],
  });
  expect(byKey['troy/project/b/r1']).toMatchObject({
    kind: 'output',
    expected: false,
    json: [],
    bin: ['geometry'],
    tris: [10, 14],
    bounds: { baseline: { max: [1, 1, 1] }, candidate: { max: [1, 2, 1] } },
  });
  expect(byKey['troy/project/b/r3']?.kind).toBe('failure');
  expect(byKey['vehicles/project/c/r1']?.kind).toBe('missing');
  expect(byKey['vehicles/project/c/r2']?.kind).toBe('built-now');
  const report = formatComparison(comparison);
  expect(report).toContain(
    '7 compared: 1 identical, 1 identical failures, 5 changed (4 unexpected).',
  );
  expect(report).toContain('UNEXPECTED troy/project/b/r1');
  expect(report).toContain('BIN geometry; bytes 100 -> 100; tris 10 -> 14; bounds');
  expect(report.indexOf('farm (1)')).toBeLessThan(report.indexOf('troy (2)'));

  // A candidate restricted to one pack is compared only within that pack.
  const scoped = compareRuns(
    baseline,
    run([built('farm/project/a/r1', 'same'), built('farm/project/a/r2', 'old')], {
      selection: { packs: ['farm'] },
    }),
  );
  expect(scoped).toMatchObject({ compared: 2, identical: 2, unexpected: 0 });
  expect(compareRuns(baseline, run([], { platform: 'linux' })).mismatch).toEqual([
    'platform win32 vs linux',
  ]);
  // The evaluator's Node moves bytes on its own: Math.pow differs between Node 22 and 24, and
  // three.js uses it to convert every material colour to linear.
  const otherNode = compareRuns(baseline, run([], { node: 'v24.20.0' }));
  expect(otherNode.mismatch).toEqual(['node v22.23.4 vs v24.20.0']);
  expect(formatComparison(otherNode)).toContain('node v22.23.4 vs v24.20.0');
  expect(parseExpectFile('farm/  # helper rename\n\n# note\ntroy/project/b/r1\n')).toEqual([
    'farm/',
    'troy/project/b/r1',
  ]);
});

test('regenerated map bytes must reproduce the recorded sha256', async () => {
  const material = await createMaterialRecordV1(
    createMaterialPresetDraft('warm-brick', {
      materialId: 'fixture-brick',
      creator: 'Test fixture',
      size: 64,
      seed: 7,
      license: {
        spdx: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: '',
      },
    }),
  );
  const manifest = material.manifest as never as Parameters<
    ReturnType<typeof createRegeneratingMaterialLibrary>['remember']
  >[0][number];
  const id = [material.manifest.materialId, material.manifest.revisionId] as const;
  const engine = (files: Record<string, Uint8Array>) => ({
    createMaterialRecordV1: async () => ({ files }),
    createMaterialRecordV2: async () => ({ files }),
  });
  const exact = createRegeneratingMaterialLibrary(new Map(), engine(material.files));
  exact.remember([manifest]);
  expect((await exact.readRecordFiles(...id)).files).toEqual(material.files);
  const drifted = Object.fromEntries(
    Object.entries(material.files).map(([name, bytes]) => [name, Uint8Array.from([...bytes, 0])]),
  );
  const encoder = createRegeneratingMaterialLibrary(new Map(), engine(drifted));
  encoder.remember([manifest]);
  await expect(encoder.readRecordFiles(...id)).rejects.toThrow(
    'does not regenerate to its recorded bytes',
  );
  await expect(encoder.readManifest('fixture-brick', 'sha256:missing')).rejects.toThrow(
    'is in no pack',
  );
});

test('a saved revision rebuilds through the worker with its saved options and regenerated materials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-corpus-build-'));
  const scratch = join(root, 'scratch');
  try {
    await mkdir(scratch);
    const material = await createMaterialRecordV1(
      createMaterialPresetDraft('warm-brick', {
        materialId: 'fixture-brick',
        creator: 'Test fixture',
        size: 64,
        seed: 7,
        license: {
          spdx: 'CC0-1.0',
          url: 'https://creativecommons.org/publicdomain/zero/1.0/',
          attribution: '',
        },
      }),
    );
    const code = `const meta={name:'Brick cube'}; async function build(){const root=createRoot('Root');const material=await compilePortableMaterialSpecV2(${JSON.stringify(materialLibraryPortableSpec(material.manifest))});createPart('Body',boxGeo(1,1,1),material,{parent:root});return root;}`;
    const rendered = await renderGLBInProcess(code, {
      gltfExporter: 'legacy',
      optimize: 'off',
      instance: 'off',
      materialResources: await createMaterialLibraryPayload([material]),
    });
    const library = new FileAssetLibrary({ project: join(root, 'workspace') });
    const saved = await library.save('project', {
      name: 'Brick',
      code,
      glb: rendered.glb,
      build: {
        engine: 'fixture',
        options: { ...rendered.rebuildOptions, requirements: rendered.requirements },
        dependencies: [
          { kind: 'kiln.material.v1', delivery: 'runtime', manifest: material.manifest },
        ],
        warnings: [],
      },
    });
    const from = join(root, 'workspace', saved.assetId, 'revisions', saved.revisionId);
    const to = join(
      root,
      'packs',
      'fixture',
      'sources',
      'project',
      saved.assetId,
      saved.revisionId,
    );
    await mkdir(to, { recursive: true });
    for (const file of ['manifest.json', 'source.kiln.js'])
      await cp(join(from, file), join(to, file));
    // A material map saved from external bytes has no recipe, and the repository holds no
    // PNGs: that revision is unavailable, never rebuilt with something else.
    const photo = new Uint8Array(
      await sharp(Buffer.alloc(4 * 4 * 4, 128), { raw: { width: 4, height: 4, channels: 4 } })
        .png()
        .toBuffer(),
    );
    const external = await createMaterialRecordV1({
      materialId: 'fixture-photo',
      name: 'Photo',
      tileable: false,
      sources: [
        {
          id: 'photo',
          kind: 'external',
          assetUrl: 'https://example.com/photo.png',
          provider: 'Test fixture',
          creator: 'Test fixture',
          license: {
            spdx: 'CC0-1.0',
            url: 'https://creativecommons.org/publicdomain/zero/1.0/',
            attribution: '',
          },
          originalFiles: [
            {
              name: 'photo.png',
              sha256: `sha256:${createHash('sha256').update(photo).digest('hex')}`,
              bytes: photo.length,
            },
          ],
        },
      ],
      maps: [
        {
          slot: 'baseColor',
          sourceId: 'photo',
          transforms: [],
          originalFile: 'photo.png',
          bytes: photo,
        },
      ],
    });
    const unavailable = structuredClone(saved) as unknown as {
      revisionId: string;
      build: { dependencies: { manifest: unknown }[] };
    };
    unavailable.revisionId = 'r_external';
    unavailable.build.dependencies[0]!.manifest = external.manifest;
    const externalDir = join(
      root,
      'packs',
      'fixture',
      'sources',
      'project',
      saved.assetId,
      'r_external',
    );
    await mkdir(externalDir, { recursive: true });
    await writeFile(join(externalDir, 'manifest.json'), JSON.stringify(unavailable));
    await cp(join(from, 'source.kiln.js'), join(externalDir, 'source.kiln.js'));

    const engine = await engineModules();
    const context = {
      engine,
      library: createRegeneratingMaterialLibrary(indexPackMaterials(root), engine.materialsNode),
      payloads: new Map<string, Promise<unknown>>(),
      controls: { deadlineMs: 60000, heapMb: 512 },
      scratch,
    };
    const results = await Promise.all(listCorpus(root).map((entry) => buildEntry(entry, context)));
    expect(results).toHaveLength(2);
    const good = results.find((result) => result.revisionId === saved.revisionId);
    const bad = results.find((result) => result.revisionId === 'r_external');
    expect(good).toMatchObject({
      status: 'built',
      assetId: saved.assetId,
      revisionId: saved.revisionId,
      tris: 12,
      textures: 3,
      bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      manifestGlbSha256: saved.files['asset.glb']!.sha256,
    });
    // Same source, options and materials through the Node worker: the saved bytes come back.
    expect(good!.matchesManifest).toBe(true);
    expect(good!.glb!.sha256).toBe(saved.files['asset.glb']!.sha256);
    expect(good!.workerMaxRssKb).toBeGreaterThan(0);
    expect(bad).toMatchObject({ status: 'failed', error: { code: 'MATERIALS_UNAVAILABLE' } });
    expect(bad!.error!.message).toContain('fixture-photo map baseColor has no saved recipe');
    expect(await readFile(join(to, 'manifest.json'), 'utf8')).toContain(saved.revisionId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  // Two Node worker launches plus a material bake: 10.6 s measured on a Windows host at 100% CPU.
}, 60000);

test('a build on another Node than the toolchain pin says which Node it compares with', () => {
  expect(nodePinNote('v22.23.4', '22.23.4')).toBeUndefined();
  const note = nodePinNote('v24.20.0', '22.23.4');
  expect(note).toContain('v24.20.0');
  expect(note).toContain('22.23.4');
  expect(note).toContain('KILN_CORPUS_GATE_NODE');
});
