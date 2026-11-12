/**
 * Declared parameters through save and export: the saved GLB is the default build and its
 * manifest records the declaration; kiln_export builds a variant of a program or of a saved
 * revision's source and serves it as a resource pinned to its bytes and values.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from '../../assets-node';
import { createKilnToolHost } from '../../mcp-engine';
import { validateParamsReport } from '../../params';
import { MemoryProgramStore } from '../../program-store';
import { createKilnProgramToolRegistry } from '../registry';

const CODE = `const meta = { name: 'Shelf' };
const P = defineParams({
  width: { type: 'range', default: 1, min: 0.5, max: 2 },
  shelves: { type: 'int', default: 2, min: 1, max: 4 },
}, { presets: { wide: { width: 2 } } });
function build() {
  const root = createRoot('Shelf');
  for (let i = 0; i < P.shelves; i++)
    createPart('Board' + i, boxGeo(P.width, 0.05, 0.3), gameMaterial(0x8a5a33), {
      parent: root,
      position: [0, 0.3 + i * 0.4, 0],
    });
  return root;
}`;
const PLAIN = `const meta = { name: 'Plain' };
function build() {
  const root = createRoot('Plain');
  createPart('Box', boxGeo(1, 1, 1), gameMaterial(0x808080), { parent: root, position: [0, 0.5, 0] });
  return root;
}`;

interface ExportResult {
  ok: boolean;
  programRef?: string;
  sha256: string;
  triangles: number;
  params?: { preset?: string; values: Record<string, unknown> };
  defaultBuildMatchesSaved?: boolean;
  asset?: { assetId: string; revisionId: string };
  resources: { name: string; uri: string; size: number }[];
}

let root: string;
let assetLibrary: FileAssetLibrary;
let programStore: MemoryProgramStore;
let ref: string;
let plainRef: string;
const tool = (name: string) =>
  createKilnProgramToolRegistry({ assetLibrary, programStore }).find((def) => def.name === name)!;
const read = async (uri: string) => {
  const host = createKilnToolHost({ assetLibrary, programStore });
  const result = (await host.readResource(uri)) as { blob: string };
  return Buffer.from(result.blob, 'base64');
};
const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-export-params-'));
  assetLibrary = new FileAssetLibrary({ project: root });
  programStore = new MemoryProgramStore();
  ref = await programStore.put(CODE);
  plainRef = await programStore.put(PLAIN);
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('kiln_save with declared parameters', () => {
  test('saves the default build and records the declaration', async () => {
    const built = (await tool('kiln_export').run({ programRef: ref })) as ExportResult;
    const saved = (await tool('kiln_save').run({
      programRef: ref,
      name: 'Shelf',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } };
    const record = await assetLibrary.read('project', saved.asset.assetId, saved.asset.revisionId);
    expect(sha(record.files['asset.glb']!)).toBe(built.sha256);
    const declaration = record.manifest.build?.params as { params: Record<string, unknown> };
    expect(Object.keys(declaration.params)).toEqual(['width', 'shelves']);
    expect(() =>
      validateParamsReport({
        version: 'kiln.params.v1',
        declaration,
        values: { width: 1, shelves: 2 },
      }),
    ).not.toThrow();
    const plain = (await tool('kiln_save').run({
      programRef: plainRef,
      name: 'Plain',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } };
    const plainRecord = await assetLibrary.read(
      'project',
      plain.asset.assetId,
      plain.asset.revisionId,
    );
    expect(plainRecord.manifest.build?.params).toBeUndefined();
  }, 60_000);
});

describe('kiln_export params', () => {
  test('builds a variant of a program and serves exactly those bytes', async () => {
    const base = (await tool('kiln_export').run({ programRef: ref })) as ExportResult;
    const variant = (await tool('kiln_export').run({
      programRef: ref,
      params: { preset: 'wide', values: { shelves: 4 } },
    })) as ExportResult;
    expect(variant).toMatchObject({
      ok: true,
      programRef: ref,
      triangles: 48,
      params: { preset: 'wide', values: { width: 2, shelves: 4 } },
    });
    expect(variant.sha256).not.toBe(base.sha256);
    const [link] = variant.resources;
    expect(link!.uri).toContain('?params=');
    const bytes = await read(link!.uri);
    expect(sha(bytes)).toBe(variant.sha256);
    expect(bytes.byteLength).toBe(link!.size);
    // The default link still reads the default bytes.
    expect(sha(await read(base.resources[0]!.uri))).toBe(base.sha256);
    expect(base.resources[0]!.uri).not.toContain('?');
    expect(base.params).toEqual({ values: { width: 1, shelves: 2 } });
  }, 60_000);

  test('a link is pinned to its values: other values do not read under its hash', async () => {
    const variant = (await tool('kiln_export').run({
      programRef: ref,
      params: { values: { shelves: 3 } },
    })) as ExportResult;
    const uri = variant.resources[0]!.uri;
    const other = Buffer.from(JSON.stringify({ values: { shelves: 4 } })).toString('base64url');
    await expect(read(uri.replace(/\?params=.*$/, `?params=${other}`))).rejects.toThrow(
      /kiln_export/,
    );
    await expect(read(uri.replace(/\?params=.*$/, '?params=not-json'))).rejects.toThrow(
      'Invalid program build URI',
    );
    await expect(read(`${uri}&extra=1`)).rejects.toThrow('Invalid program build URI');
  }, 60_000);

  test('names a refused value and refuses a program without parameters', async () => {
    await expect(
      tool('kiln_export').run({ programRef: ref, params: { values: { shelves: 9 } } }),
    ).rejects.toThrow('shelves takes 1 to 4');
    await expect(
      tool('kiln_export').run({ programRef: plainRef, params: { values: { shelves: 2 } } }),
    ).rejects.toThrow('declares no parameters');
    await expect(
      tool('kiln_export').run({ programRef: ref, params: { sweep: true } }),
    ).rejects.toThrow();
  }, 60_000);

  test('builds a variant from a saved revision without saving anything', async () => {
    const saved = (await tool('kiln_save').run({
      programRef: ref,
      name: 'Shelf for variants',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } };
    const before = (await assetLibrary.list('project')).length;
    const variant = (await tool('kiln_export').run({
      assetId: saved.asset.assetId,
      revisionId: saved.asset.revisionId,
      params: { values: { shelves: 1 } },
    })) as ExportResult;
    expect(variant).toMatchObject({
      ok: true,
      triangles: 12,
      params: { values: { width: 1, shelves: 1 } },
      defaultBuildMatchesSaved: true,
      asset: { assetId: saved.asset.assetId, revisionId: saved.asset.revisionId },
    });
    expect(sha(await read(variant.resources[0]!.uri))).toBe(variant.sha256);
    expect((await assetLibrary.list('project')).length).toBe(before);
    await expect(
      tool('kiln_export').run({
        assetId: saved.asset.assetId,
        revisionId: saved.asset.revisionId,
        profile: 'runtime',
        params: { values: { shelves: 1 } },
      }),
    ).rejects.toThrow(/runtime/);
  }, 60_000);
});
