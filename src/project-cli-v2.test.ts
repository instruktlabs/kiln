import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FileWorkspace } from './workspace-node';
import { createMaterialRecordV2 } from './material-library-node';
import { materialLibraryResourceId } from './material-library';

const sampler = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'clamp-to-edge',
  wrapT: 'clamp-to-edge',
};
const draft = {
  schemaVersion: 2,
  materialId: 'source',
  name: 'Source',
  tileable: false,
  sources: [
    {
      id: 'own',
      kind: 'procedural',
      provider: 'Kiln',
      creator: 'Fixture',
      originalFiles: [],
      license: {
        spdx: 'CC0-1.0',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: '',
      },
    },
  ],
  maps: [
    {
      slot: 'baseColor',
      sourceId: 'own',
      transforms: [],
      sampler,
      procedural: {
        schemaVersion: 3,
        width: 4,
        height: 4,
        usage: 'albedo',
        background: [31, 72, 21, 255],
        operations: [],
      },
    },
  ],
};
const runner = resolve('src/cli.ts');
function run(root: string, args: string[], workspace = 'first') {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      KILN_RENDER: 'cpu',
      KILN_WORKSPACE: join(root, workspace),
      KILN_PROGRAM_STORE: join(root, workspace, '.kiln', 'programs'),
    },
  });
}

test('material CLI exports and imports the entire exact pinned atlas closure without source workspace access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-material-cli-v2-'));
  try {
    const source = await createMaterialRecordV2(draft);
    const sheet = await createMaterialRecordV2(
      {
        ...draft,
        materialId: 'sheet',
        name: 'Sheet',
        maps: [
          {
            slot: 'baseColor',
            sourceId: 'own',
            transforms: [],
            sampler,
            atlas: {
              schemaVersion: 1,
              width: 8,
              height: 8,
              usage: 'albedo',
              sampler,
              regions: [
                {
                  name: 'leaf',
                  content: { x: 2, y: 2, width: 4, height: 4 },
                  source: {
                    kind: 'resource',
                    resourceId: materialLibraryResourceId(source.manifest, 'baseColor'),
                    pin: {
                      resourceId: source.manifest.materialId,
                      revisionId: source.manifest.revisionId,
                      sha256: source.manifest.revisionId,
                    },
                  },
                },
              ],
            },
          },
        ],
      },
      { materials: [source] },
    );
    await new FileWorkspace(join(root, 'first')).materials.import([source, sheet]);
    const path = join(root, 'export.json');
    const exported = run(root, [
      'material',
      'export',
      'sheet',
      sheet.manifest.revisionId,
      '--out',
      path,
    ]);
    expect(exported.status, exported.stderr).toBe(0);
    const payload = JSON.parse(await readFile(path, 'utf8'));
    expect(payload.schemaVersion).toBe(2);
    expect(
      payload.records
        .map((r: { manifest: { revisionId: string } }) => r.manifest.revisionId)
        .sort(),
    ).toEqual([source.manifest.revisionId, sheet.manifest.revisionId].sort());
    await rm(join(root, 'first'), { recursive: true, force: true });
    const imported = run(root, ['material', 'import', '--file', path], 'second');
    expect(imported.status, imported.stderr).toBe(0);
    const restored = await new FileWorkspace(join(root, 'second')).materials.read(
      'sheet',
      sheet.manifest.revisionId,
    );
    expect(restored).toEqual(sheet);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('material CLI accepts opt-in rectangular recipe JSON and returns its immutable revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-material-cli-v2-'));
  try {
    const file = join(root, 'draft.json');
    await writeFile(file, JSON.stringify(draft));
    const created = run(root, ['material', 'procedural', '--file', file]);
    expect(created.status, created.stderr).toBe(0);
    const expected = await createMaterialRecordV2(draft);
    expect(JSON.parse(created.stdout).materials).toEqual([expected.manifest]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
