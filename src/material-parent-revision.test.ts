import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProceduralMaterialRecord } from './material-authoring-node';
import {
  createMaterialLibraryPayload,
  createMaterialRecordV1,
  createMaterialRecordV2,
  decodeMaterialLibraryPayload,
  FileMaterialLibrary,
} from './material-library-node';
import { exportMaterialMaps } from './material-map-export-node';
import { createKilnMaterialDef } from './tools/materials';

const procedural = (seed: number) => ({
  schemaVersion: 2 as const,
  size: 8,
  usage: 'albedo' as const,
  layers: [{ op: 'noise' as const, colorA: 0xddddcc, colorB: 0xeeeecc, seed }],
});
const source = {
  id: 'authored',
  kind: 'procedural' as const,
  provider: 'Kiln',
  creator: 'Test author',
  license: {
    spdx: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: '',
  },
  originalFiles: [],
};
const v1 = (materialId = 'iron', seed = 1) => ({
  materialId,
  name: 'Iron',
  tileable: true,
  sources: [source],
  maps: [
    {
      slot: 'baseColor' as const,
      sourceId: 'authored',
      transforms: [],
      procedural: procedural(seed),
    },
  ],
});
const v2 = (materialId = 'iron', seed = 1) => ({
  schemaVersion: 2 as const,
  materialId,
  name: 'Iron',
  tileable: true,
  sources: [source],
  maps: [
    {
      slot: 'baseColor' as const,
      sourceId: 'authored',
      transforms: [],
      sampler: { minFilter: 'nearest', magFilter: 'nearest', wrapS: 'repeat', wrapT: 'repeat' },
      procedural: procedural(seed),
    },
  ],
});

let root: string;
let store: FileMaterialLibrary;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-material-parent-'));
  store = new FileMaterialLibrary(join(root, 'materials'));
});
afterAll(() => rm(root, { recursive: true, force: true }));

async function save(draft: unknown, library = store) {
  const { record } = await createProceduralMaterialRecord(draft, library);
  const [manifest] = await library.import([record]);
  return manifest!;
}

describe.each([
  ['V1', v1],
  ['V2', v2],
])('%s material lineage (#310)', (_name, draft) => {
  test('a draft without a parent stores no key, so its revision id is what it was', async () => {
    const manifest = await save(draft('plain'));
    expect(manifest).not.toHaveProperty('parentRevision');
  });

  test('the parent is stored, read back and covered by the revision hash', async () => {
    const parent = await save(draft('iron', 1));
    const child = await save({ ...draft('iron', 2), parentRevision: parent.revisionId });
    expect(child.parentRevision).toBe(parent.revisionId);
    const read = await store.read('iron', child.revisionId);
    expect(read.manifest.parentRevision).toBe(parent.revisionId);
    const orphan = await save(draft('iron', 2));
    expect(orphan.revisionId).not.toBe(child.revisionId);
  });

  test('a parent that does not exist is refused by name', async () => {
    await expect(
      save({ ...draft('iron', 3), parentRevision: `sha256:${'a'.repeat(64)}` }),
    ).rejects.toThrow(/parentRevision/);
  });

  test("another material's revision is refused by name", async () => {
    const other = await save(draft('copper', 1));
    await expect(save({ ...draft('iron', 4), parentRevision: other.revisionId })).rejects.toThrow(
      /parentRevision.*iron/,
    );
  });

  test('a malformed parent is refused', async () => {
    await expect(save({ ...draft('iron', 5), parentRevision: 'latest' })).rejects.toThrow();
  });

  test('the parent survives export and import into a store that lacks it', async () => {
    const parent = await save(draft('tin', 1));
    const child = await save({ ...draft('tin', 2), parentRevision: parent.revisionId });
    const payload = await createMaterialLibraryPayload([await store.read('tin', child.revisionId)]);
    const receiving = new FileMaterialLibrary(join(root, `receiving-${_name}`));
    const [imported] = await receiving.import(
      await decodeMaterialLibraryPayload(JSON.parse(JSON.stringify(payload))),
    );
    expect(imported!.revisionId).toBe(child.revisionId);
    expect(imported!.parentRevision).toBe(parent.revisionId);
    await expect(receiving.read('tin', parent.revisionId)).rejects.toThrow();
  });
});

describe('where a material parent is reported (#310)', () => {
  test('the pure record builders accept the field', async () => {
    const parentRevision = `sha256:${'b'.repeat(64)}` as const;
    const legacy = await createMaterialRecordV1({ ...v1(), parentRevision });
    expect(legacy.manifest.parentRevision).toBe(parentRevision);
    const current = await createMaterialRecordV2({ ...v2(), parentRevision });
    expect(current.manifest.parentRevision).toBe(parentRevision);
  });

  test('kiln_material create, get and list report it', async () => {
    const library = new FileMaterialLibrary(join(root, 'tool'));
    const tool = createKilnMaterialDef(library);
    const first = (await tool.run({ action: 'create-procedural', draft: v1('steel', 1) })) as {
      material: { revisionId: string };
    };
    const second = (await tool.run({
      action: 'create-procedural',
      draft: { ...v1('steel', 2), parentRevision: first.material.revisionId },
    })) as { material: { revisionId: string; parentRevision: string } };
    expect(second.material.parentRevision).toBe(first.material.revisionId);
    const got = (await tool.run({
      action: 'get',
      materialId: 'steel',
      revisionId: second.material.revisionId,
    })) as { material: { parentRevision: string } };
    expect(got.material.parentRevision).toBe(first.material.revisionId);
    const { materials } = (await tool.run({ action: 'list' })) as {
      materials: { revisionId: string; parentRevision?: string }[];
    };
    const summary = (id: string) => materials.find((item) => item.revisionId === id)!;
    expect(summary(second.material.revisionId).parentRevision).toBe(first.material.revisionId);
    expect(summary(first.material.revisionId)).not.toHaveProperty('parentRevision');
  });

  test('the map export sidecar names it, and omits it for a root revision', async () => {
    const parent = await save(v1('zinc', 1));
    const child = await save({ ...v1('zinc', 2), parentRevision: parent.revisionId });
    const out = join(root, 'maps');
    const childExport = await exportMaterialMaps(await store.read('zinc', child.revisionId), {
      outDir: join(out, 'child'),
      size: 8,
      repeatMeters: 1,
    });
    expect(childExport.sidecar.material.parentRevision).toBe(parent.revisionId);
    const written = JSON.parse(await readFile(join(out, 'child', 'zinc.maps.json'), 'utf8'));
    expect(written.material.parentRevision).toBe(parent.revisionId);
    const rootExport = await exportMaterialMaps(await store.read('zinc', parent.revisionId), {
      outDir: join(out, 'root'),
      size: 8,
      repeatMeters: 1,
    });
    expect(rootExport.sidecar.material).not.toHaveProperty('parentRevision');
  });
});

// Measured at ~1.5 s per CLI start under load; each test runs several.
describe('kiln material procedural --parent (#310)', () => {
  const cli = join(import.meta.dir, 'cli.ts');
  const run = (cwd: string, ...args: string[]) =>
    spawnSync('bun', [cli, 'material', ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, KILN_WORKSPACE: cwd },
    });

  test('sets the parent, and refuses one that disagrees with the draft', async () => {
    const cwd = join(root, 'cli');
    await mkdir(cwd, { recursive: true });
    const first = join(cwd, 'first.json');
    const second = join(cwd, 'second.json');
    await writeFile(first, JSON.stringify(v1('lead', 1)));
    await writeFile(second, JSON.stringify(v1('lead', 2)));
    const parent = run(cwd, 'procedural', '--file', first);
    expect(parent.status, parent.stderr).toBe(0);
    const parentRevision = JSON.parse(parent.stdout).materials[0].revisionId;

    const unknown = run(
      cwd,
      'procedural',
      '--file',
      second,
      '--parent',
      `sha256:${'c'.repeat(64)}`,
    );
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('parentRevision');

    const child = run(cwd, 'procedural', '--file', second, '--parent', parentRevision);
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout).materials[0].parentRevision).toBe(parentRevision);

    const disagreeing = join(cwd, 'disagreeing.json');
    await writeFile(
      disagreeing,
      JSON.stringify({ ...v1('lead', 3), parentRevision: `sha256:${'d'.repeat(64)}` }),
    );
    const conflict = run(cwd, 'procedural', '--file', disagreeing, '--parent', parentRevision);
    expect(conflict.status).toBe(1);
    expect(conflict.stderr).toContain('--parent');
  }, 60_000);
});
