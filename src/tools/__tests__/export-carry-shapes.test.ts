/**
 * Carried sizes over MCP: `kiln_export` with `carryShapes` returns the runtime GLB and sidecar
 * `kiln export --profile runtime --carry-shapes` writes for the same saved revision, as
 * resources whose reads rebuild those same bytes; `kiln_export_to` writes them under the
 * export root. Both refuse what the CLI refuses.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { FileAssetLibrary } from '../../assets-node';
import { createExportRootWriter } from '../../export-root-node';
import { createKilnToolHost } from '../../mcp-engine';
import { MemoryProgramStore } from '../../program-store';
import { createKilnProgramToolRegistry } from '../registry';

const SHELF = `const meta = { name: 'Shelf' };
const P = defineParams({
  width: { type: 'range', default: 1.0, min: 0.6, max: 1.6, unit: 'm' },
  bays: { type: 'int', default: 2, min: 1, max: 4 },
});
function build() {
  const root = createRoot('Shelf');
  const wood = gameMaterial(0x8a5a33);
  createPart('Board', boxGeo(0.3, 0.04, P.width), wood, { parent: root, position: [0, 0.52, 0] });
  createPart('Left', boxGeo(0.3, 0.5, 0.04), wood, { parent: root, position: [0, 0.25, -P.width / 2 + 0.02] });
  createPart('Right', boxGeo(0.3, 0.5, 0.04), wood, { parent: root, position: [0, 0.25, P.width / 2 - 0.02] });
  for (let i = 1; i < P.bays; i++)
    createPart('Divider' + i, boxGeo(0.28, 0.5, 0.02), wood, { parent: root, position: [0, 0.25, -P.width / 2 + (P.width * i) / P.bays] });
  return root;
}`;

const sha256 = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

let base: string;
let library: FileAssetLibrary;
let programStore: MemoryProgramStore;
let saved: { assetId: string; revisionId: string };
let binaryOnly: { assetId: string; revisionId: string };
let cliGlb: Uint8Array;
let cliMetadata: Uint8Array;
let roots = 0;

/**
 * Budget: one CLI export that sweeps two sizes, measured at about 4 s on Windows on
 * 2026-11-13, plus the in-process save.
 */
beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'kiln-export-carry-shapes-')));
  library = new FileAssetLibrary({ project: join(base, 'collection') });
  programStore = new MemoryProgramStore();
  const save = createKilnProgramToolRegistry({ assetLibrary: library, programStore }).find(
    (def) => def.name === 'kiln_save',
  )!;
  saved = (
    (await save.run({
      programRef: await programStore.put(SHELF),
      name: 'Shelf',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } }
  ).asset;
  // The same GLB and build record with no source beside them.
  const record = await library.read('project', saved.assetId, saved.revisionId);
  binaryOnly = await library.save('project', {
    name: 'Shelf binary',
    glb: record.files['asset.glb']!,
    build: record.manifest.build!,
  });

  const out = join(base, 'cli', 'runtime.glb');
  const cli = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dir, '../../cli.ts'),
      'export',
      saved.assetId,
      saved.revisionId,
      '--profile',
      'runtime',
      '--format',
      'glb',
      '--carry-shapes',
      '--out',
      out,
    ],
    {
      cwd: base,
      env: {
        ...process.env,
        KILN_RENDER: 'cpu',
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_LIVE_REVIEW: 'off',
        KILN_PROGRAM_STORE: join(base, '.kiln', 'programs'),
        KILN_COLLECTIONS: JSON.stringify({ project: join(base, 'collection') }),
      },
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  expect(cli.stderr).toBe('');
  expect(cli.status).toBe(0);
  cliGlb = new Uint8Array(await readFile(out));
  cliMetadata = new Uint8Array(await readFile(join(base, 'cli', 'runtime.kiln-metadata.json')));
}, 120_000);

afterAll(() => rm(base, { recursive: true, force: true }));

const shapesOf = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes)).params?.shapes as Record<string, unknown> | undefined;

describe('kiln_export carryShapes', () => {
  const host = () => createKilnToolHost({ assetLibrary: library, programStore });
  const run = (input: Record<string, unknown>) =>
    host()
      .defs.find((def) => def.name === 'kiln_export')!
      .run({ collection: 'project', ...input });
  const read = async (uri: string) => {
    const contents = (await host().readResource(uri)) as { blob?: string; text?: string };
    return contents.blob !== undefined
      ? new Uint8Array(Buffer.from(contents.blob, 'base64'))
      : new TextEncoder().encode(contents.text!);
  };

  test('serves the bytes the CLI writes for the same revision', async () => {
    const result = (await run({ ...saved, profile: 'runtime', carryShapes: true })) as {
      ok: boolean;
      resources: { name: string; uri: string; size: number }[];
    };
    expect(result.ok).toBe(true);
    const glbLink = result.resources.find((link) => link.name === 'runtime.glb')!;
    const metadataLink = result.resources.find(
      (link) => link.name === 'runtime.kiln-metadata.json',
    )!;
    expect(glbLink.size).toBe(cliGlb.byteLength);
    expect(metadataLink.size).toBe(cliMetadata.byteLength);
    const glb = await read(glbLink.uri);
    const metadata = await read(metadataLink.uri);
    expect(sha256(glb)).toBe(sha256(cliGlb));
    expect(shapesOf(metadata)).toEqual(shapesOf(cliMetadata));
    expect(shapesOf(metadata)).toMatchObject({
      width: { mode: 'morph', clip: 'kiln.param.width' },
      bays: { mode: 'rebuild' },
    });
    expect(sha256(metadata)).toBe(sha256(cliMetadata));

    // The plain runtime links still read the plain export, with no sizes.
    const plain = (await run({ ...saved, profile: 'runtime' })) as {
      resources: { name: string; uri: string }[];
    };
    const plainMetadata = plain.resources.find(
      (link) => link.name === 'runtime.kiln-metadata.json',
    )!;
    expect(plainMetadata.uri).not.toContain('?');
    expect(shapesOf(await read(plainMetadata.uri))).toBeUndefined();
  }, 120_000);

  test('one host builds the carried export once for the call and both link reads', async () => {
    // A revision no earlier test exported, so nothing is held for it yet.
    const save = createKilnProgramToolRegistry({ assetLibrary: library, programStore }).find(
      (def) => def.name === 'kiln_save',
    )!;
    const other = (
      (await save.run({
        programRef: await programStore.put(SHELF.replace("'Shelf'", "'Shelf two'")),
        name: 'Shelf two',
        collection: 'project',
      })) as { asset: { assetId: string; revisionId: string } }
    ).asset;
    const one = host();
    // Each build of a carried export retains the revision's source once.
    const put = programStore.put.bind(programStore);
    let retained = 0;
    programStore.put = async (code: string) => {
      retained++;
      return put(code);
    };
    try {
      const result = (await one.defs
        .find((def) => def.name === 'kiln_export')!
        .run({ collection: 'project', ...other, profile: 'runtime', carryShapes: true })) as {
        resources: { name: string; uri: string; size: number }[];
      };
      for (const link of result.resources) {
        const contents = (await one.readResource(link.uri)) as { blob?: string; text?: string };
        const bytes =
          contents.blob !== undefined
            ? Buffer.from(contents.blob, 'base64').byteLength
            : new TextEncoder().encode(contents.text!).byteLength;
        expect(bytes).toBe(link.size);
      }
      expect(result.resources).toHaveLength(2);
      expect(retained).toBe(1);
    } finally {
      programStore.put = put;
    }
  }, 120_000);

  test('refuses what the CLI refuses, naming the next step', async () => {
    await expect(run({ ...saved, carryShapes: true })).rejects.toThrow(
      'carryShapes requires profile runtime',
    );
    await expect(
      run({ programRef: await programStore.put(SHELF), profile: 'runtime', carryShapes: true }),
    ).rejects.toThrow('carryShapes exports a saved revision');
    await expect(
      run({
        ...saved,
        profile: 'runtime',
        carryShapes: true,
        params: { values: { bays: 3 } },
      }),
    ).rejects.toThrow('carryShapes carries every size');
    await expect(run({ ...binaryOnly, profile: 'runtime', carryShapes: true })).rejects.toThrow(
      'no source to rebuild its sizes from',
    );
    // A carried link takes no other query.
    const uri = `kiln://assets/project/${saved.assetId}/${saved.revisionId}/runtime.glb`;
    await expect(read(`${uri}?carryShapes=false`)).rejects.toThrow('Invalid asset resource URI');
    await expect(
      read(`kiln://assets/project/${saved.assetId}/${saved.revisionId}/asset.glb?carryShapes=true`),
    ).rejects.toThrow('Invalid asset resource URI');
  }, 60_000);
});

describe('kiln_export_to carryShapes', () => {
  async function exportTo() {
    const root = join(base, `exports-${++roots}`);
    await mkdir(root);
    const def = createKilnProgramToolRegistry({
      assetLibrary: library,
      programStore,
      exportRoot: createExportRootWriter(root),
    }).find((candidate) => candidate.name === 'kiln_export_to')!;
    return {
      root,
      run: (input: Record<string, unknown>) => def.run({ collection: 'project', ...input }),
    };
  }

  test('writes the bytes the CLI writes for the same revision', async () => {
    const { root, run } = await exportTo();
    await run({ ...saved, path: 'runtime.glb', carryShapes: true });
    expect(sha256(new Uint8Array(await readFile(join(root, 'runtime.glb'))))).toBe(sha256(cliGlb));
    expect(sha256(new Uint8Array(await readFile(join(root, 'runtime.kiln-metadata.json'))))).toBe(
      sha256(cliMetadata),
    );
  }, 120_000);

  test('refuses what the CLI refuses, writing nothing', async () => {
    const { root, run } = await exportTo();
    await expect(
      run({ ...saved, path: 'a.glb', profile: 'editable', carryShapes: true }),
    ).rejects.toThrow('carryShapes requires profile runtime');
    await expect(
      run({ ...saved, path: 'b.glb', target: 'three', carryShapes: true }),
    ).rejects.toThrow('carryShapes requires profile runtime without target');
    await expect(run({ ...binaryOnly, path: 'c.glb', carryShapes: true })).rejects.toThrow(
      'no source to rebuild its sizes from',
    );
    expect(await readdir(root)).toEqual([]);
  }, 60_000);
});
