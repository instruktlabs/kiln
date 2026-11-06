import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from '../../assets-node';
import { KILN_RESOURCE_TEMPLATES } from '../../mcp-core';
import { createKilnToolHost } from '../../mcp-engine';
import { MemoryProgramStore } from '../../program-store';
import { createKilnProgramToolRegistry } from '../registry';

const CODE = `const meta = { name: 'Bracket' };
function build() {
  const root = createRoot('Bracket');
  createPart('plate', new THREE.BoxGeometry(1, 0.1, 1), gameMaterial(0x808080), { parent: root });
  createPart('post', new THREE.BoxGeometry(0.1, 1, 0.1), gameMaterial(0x404040), {
    parent: root,
    position: [0, 0.55, 0],
  });
  return root;
}`;

interface ExportResult {
  ok: boolean;
  programRef: string;
  profile: string;
  sha256: string;
  triangles: number;
  drawDiagnostics?: { currentDraws: number };
  resources: { name: string; uri: string; mimeType: string; size: number }[];
}

let root: string;
let assetLibrary: FileAssetLibrary;
let programStore: MemoryProgramStore;
let ref: string;
const tool = (name: string) =>
  createKilnProgramToolRegistry({ assetLibrary, programStore }).find((def) => def.name === name)!;
const host = () => createKilnToolHost({ assetLibrary, programStore });
const blob = async (uri: string) => {
  const read = (await host().readResource(uri)) as { mimeType: string; blob: string };
  return { mimeType: read.mimeType, bytes: Buffer.from(read.blob, 'base64') };
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'kiln-export-program-'));
  assetLibrary = new FileAssetLibrary({ project: root });
  programStore = new MemoryProgramStore();
  ref = await programStore.put(CODE);
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('kiln_export by programRef (#309)', () => {
  test('returns readable bytes and writes nothing to the library', async () => {
    const output = (await tool('kiln_export').run({ programRef: ref })) as ExportResult;
    expect(output).toMatchObject({ ok: true, programRef: ref, profile: 'editable' });
    expect(output.triangles).toBeGreaterThan(0);
    expect(output.drawDiagnostics?.currentDraws).toBe(2);
    const [link] = output.resources;
    expect(link).toMatchObject({ name: 'asset.glb', mimeType: 'model/gltf-binary' });
    const { bytes, mimeType } = await blob(link!.uri);
    expect(mimeType).toBe('model/gltf-binary');
    expect(bytes.subarray(0, 4).toString()).toBe('glTF');
    expect(bytes.byteLength).toBe(link!.size);
    expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(output.sha256);
    expect(await assetLibrary.list('project')).toEqual([]);
  });

  test('the bytes are the ones kiln_save then persists', async () => {
    const output = (await tool('kiln_export').run({ programRef: ref })) as ExportResult;
    const { bytes } = await blob(output.resources[0]!.uri);
    const saved = (await tool('kiln_save').run({
      programRef: ref,
      name: 'Bracket',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } };
    const record = await assetLibrary.read('project', saved.asset.assetId, saved.asset.revisionId);
    expect(Buffer.from(record.files['asset.glb']!).equals(bytes)).toBe(true);
  });

  test('a saved revision is still selected as before', async () => {
    const saved = (await tool('kiln_save').run({
      programRef: ref,
      name: 'Bracket again',
      collection: 'project',
    })) as { asset: { assetId: string; revisionId: string } };
    const output = (await tool('kiln_export').run({
      assetId: saved.asset.assetId,
      revisionId: saved.asset.revisionId,
    })) as { ok: boolean; asset: { revisionId: string } };
    expect(output.ok).toBe(true);
    expect(output.asset.revisionId).toBe(saved.asset.revisionId);
  });

  test('both selectors are refused by name', async () => {
    await expect(
      tool('kiln_export').run({ programRef: ref, assetId: 'a_x', revisionId: 'r_x' }),
    ).rejects.toThrow(/programRef.*assetId|assetId.*programRef/);
  });

  test('no selector is refused by name', async () => {
    await expect(tool('kiln_export').run({})).rejects.toThrow(/assetId.*programRef/);
    await expect(tool('kiln_export').run({ assetId: 'a_x' })).rejects.toThrow(/revisionId/);
  });

  test('the runtime profile needs a saved revision, and says so', async () => {
    await expect(tool('kiln_export').run({ programRef: ref, profile: 'runtime' })).rejects.toThrow(
      /runtime.*kiln_save/,
    );
  });

  test('kiln_present still requires a saved revision', () => {
    const schema = tool('kiln_present').inputSchema as unknown as {
      safeParse(value: unknown): { success: boolean };
    };
    expect(schema.safeParse({ programRef: ref }).success).toBe(false);
  });
});

describe('the program build resource (#309)', () => {
  test('is advertised as a template', () => {
    expect(KILN_RESOURCE_TEMPLATES.programBuild.uriTemplate).toBe(
      'kiln://programs/{program}/{sha256}/asset.glb',
    );
  });

  test('refuses a URI whose hash the program no longer builds to', async () => {
    const encoded = encodeURIComponent(ref);
    await expect(
      host().readResource(`kiln://programs/${encoded}/${'a'.repeat(64)}/asset.glb`),
    ).rejects.toThrow(/kiln_export/);
  });

  test.each(['other.glb', 'asset.glb/extra'])('refuses the file %s', async (file) => {
    await expect(
      host().readResource(`kiln://programs/${encodeURIComponent(ref)}/${'a'.repeat(64)}/${file}`),
    ).rejects.toThrow('Invalid program build URI');
  });

  test('without a program store it says what is missing', async () => {
    const bare = createKilnToolHost({ assetLibrary });
    await expect(
      bare.readResource(`kiln://programs/${encodeURIComponent(ref)}/${'a'.repeat(64)}/asset.glb`),
    ).rejects.toThrow(/program store/);
  });
});
