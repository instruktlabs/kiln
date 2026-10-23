/**
 * `kiln_export_to` (#207): a host-enabled tool that writes one saved revision's
 * GLB (and, for runtime, its metadata sidecar) under the host's export root,
 * through the CLI's never-replace writer, and returns the CLI `--json` receipt
 * with root-relative paths. `kiln_export` stays read-only and unchanged.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

import type { AssetManifest } from '../../assets';
import { FileAssetLibrary } from '../../assets-node';
import { createExportRootWriter } from '../../export-root-node';
import type { ExportRootWriter } from '../../export-root';
import { createKilnMcpServer } from '../../mcp-engine';
import { toolManifestEntry } from '../../mcp-manifest';
import { renderGLBInProcess } from '../../render';
import {
  createKilnNativeToolRegistry,
  createKilnProgramToolRegistry,
  type KilnToolDef,
} from '../registry';

const CODE =
  "const meta = { name: 'Box' }; function build() { const root = createRoot('Box'); createPart('Body', boxGeo(1,1,1), gameMaterial(0x88aa66), {parent: root, position: [0,0.5,0]}); return root; }";
const sha256 = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const names = (defs: KilnToolDef[]) => defs.map((def) => def.name);
const unusedWriter: ExportRootWriter = {
  writeNew: async () => {
    throw new Error('not used');
  },
};

let base: string;
let library: FileAssetLibrary;
let asset: AssetManifest;
let roots = 0;

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'kiln-export-to-')));
  library = new FileAssetLibrary({ project: join(base, 'collection') });
  const rendered = await renderGLBInProcess(CODE);
  asset = await library.save('project', { name: 'Box', code: CODE, glb: rendered.glb });
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

/** A fresh export root, and the tool bound to it. */
async function exportTo() {
  const root = join(base, `exports-${++roots}`);
  await mkdir(root);
  const def = createKilnProgramToolRegistry({
    assetLibrary: library,
    exportRoot: createExportRootWriter(root),
  }).find((candidate) => candidate.name === 'kiln_export_to')!;
  const selector = { collection: 'project', assetId: asset.assetId, revisionId: asset.revisionId };
  return { root, run: (input: Record<string, unknown>) => def.run({ ...selector, ...input }) };
}

describe('kiln_export_to advertisement', () => {
  test('is defined only with an export root and an asset library; kiln_export is unchanged', async () => {
    expect(names(createKilnProgramToolRegistry({ assetLibrary: library }))).not.toContain(
      'kiln_export_to',
    );
    expect(names(createKilnProgramToolRegistry({ exportRoot: unusedWriter }))).not.toContain(
      'kiln_export_to',
    );
    const plain = createKilnProgramToolRegistry({ assetLibrary: library });
    const enabled = createKilnProgramToolRegistry({
      assetLibrary: library,
      exportRoot: unusedWriter,
    });
    expect(names(enabled)).toContain('kiln_export_to');
    expect(names(enabled).filter((name) => name !== 'kiln_export_to')).toEqual(names(plain));
    const entry = (defs: KilnToolDef[], name: string) =>
      JSON.stringify(toolManifestEntry(defs.find((def) => def.name === name)!));
    expect(entry(enabled, 'kiln_export')).toBe(entry(plain, 'kiln_export'));
    const exportTo = toolManifestEntry(enabled.find((def) => def.name === 'kiln_export_to')!);
    expect(exportTo.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
    // A destination, not project membership.
    expect(Object.keys(exportTo.inputSchema['properties'] as object).sort()).toEqual([
      'assetId',
      'collection',
      'path',
      'profile',
      'revisionId',
      'target',
    ]);
    // Native: a delivery tool, present only with both host services.
    expect(names(createKilnNativeToolRegistry({ exportRoot: unusedWriter }, {}))).not.toContain(
      'kiln_export_to',
    );
    expect(names(createKilnNativeToolRegistry({ assetLibrary: library }, {}))).not.toContain(
      'kiln_export_to',
    );
    expect(
      names(createKilnNativeToolRegistry({ assetLibrary: library, exportRoot: unusedWriter }, {})),
    ).toContain('kiln_export_to');
    // Over the wire: honest annotations on both tools.
    const server = createKilnMcpServer({ assetLibrary: library, exportRoot: unusedWriter });
    const client = new Client({ name: 'export-to', version: '0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      expect(tools.find((tool) => tool.name === 'kiln_export')?.annotations?.readOnlyHint).toBe(
        true,
      );
      expect(tools.find((tool) => tool.name === 'kiln_export_to')?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  test('Discovery capabilities name kiln_export_to exactly when it is advertised', async () => {
    const exportTo = async (context: Parameters<typeof createKilnProgramToolRegistry>[0]) => {
      const discover = createKilnProgramToolRegistry(context).find(
        (def) => def.name === 'kiln_discover',
      )!;
      const output = (await discover.run({ capabilities: true })) as {
        capabilities: { assets: { exportTo: unknown } };
      };
      return output.capabilities.assets.exportTo;
    };
    expect(await exportTo({ assetLibrary: library })).toBeNull();
    expect(await exportTo({ exportRoot: unusedWriter })).toBeNull();
    const enabled = await exportTo({ assetLibrary: library, exportRoot: unusedWriter });
    expect(enabled).toBeString();
    expect(enabled as string).toStartWith('kiln_export_to ');
    // Root-relative only: the host's absolute root is never shown to the agent.
    expect(enabled as string).toContain('relative to the host export root');
  });
});

describe('kiln_export_to writes', () => {
  test('writes a runtime GLB and sidecar with the CLI receipt shape and root-relative paths', async () => {
    const before = await library.read('project', asset.assetId, asset.revisionId);
    const { root, run } = await exportTo();
    const receipt = (await run({ path: 'game/props/box.glb' })) as Record<string, unknown>;
    const glb = new Uint8Array(await readFile(join(root, 'game', 'props', 'box.glb')));
    const metadata = new Uint8Array(
      await readFile(join(root, 'game', 'props', 'box.kiln-metadata.json')),
    );
    expect(receipt).toEqual({
      ok: true,
      collection: 'project',
      assetId: asset.assetId,
      revisionId: asset.revisionId,
      profile: 'runtime',
      format: 'glb',
      drawDiagnostics: expect.any(Object),
      files: [
        { kind: 'glb', path: 'game/props/box.glb', bytes: glb.byteLength, sha256: sha256(glb) },
        {
          kind: 'metadata',
          path: 'game/props/box.kiln-metadata.json',
          bytes: metadata.byteLength,
          sha256: sha256(metadata),
        },
      ],
    });
    expect(JSON.stringify(receipt)).not.toContain(base);
    expect(JSON.parse(new TextDecoder().decode(metadata)).source.revisionId).toBe(asset.revisionId);
    // The canonical revision never changes.
    expect(await library.read('project', asset.assetId, asset.revisionId)).toEqual(before);
  });

  test('editable writes the exact saved GLB and nothing else', async () => {
    const { root, run } = await exportTo();
    const receipt = (await run({ path: 'box.glb', profile: 'editable' })) as {
      profile: string;
      files: { kind: string; path: string }[];
    };
    const saved = (await library.read('project', asset.assetId, asset.revisionId)).files[
      'asset.glb'
    ]!;
    expect(sha256(await readFile(join(root, 'box.glb')))).toBe(sha256(saved));
    expect(receipt.profile).toBe('editable');
    expect(receipt.files.map(({ kind, path }) => [kind, path])).toEqual([['glb', 'box.glb']]);
    expect(await readdir(root)).toEqual(['box.glb']);
  });

  test('target three writes the same bytes as CLI export --profile runtime --target three', async () => {
    const { root, run } = await exportTo();
    const receipt = (await run({ path: 'door.glb', target: 'three' })) as {
      target: string;
      files: { kind: string; sha256: string }[];
    };
    expect(receipt.target).toBe('three');
    const cliOut = join(base, `cli-${roots}`, 'door.glb');
    const cli = spawnSync(
      process.execPath,
      [
        resolve('src/cli.ts'),
        'export',
        asset.assetId,
        asset.revisionId,
        '--out',
        cliOut,
        '--profile',
        'runtime',
        '--target',
        'three',
        '--json',
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
    const cliReceipt = JSON.parse(cli.stdout) as { files: { kind: string; sha256: string }[] };
    expect(receipt.files.map(({ kind, sha256 }) => [kind, sha256])).toEqual(
      cliReceipt.files.map(({ kind, sha256 }) => [kind, sha256]),
    );
    expect((await readdir(root)).sort()).toEqual(['door.glb', 'door.kiln-metadata.json']);
  });
});

describe('kiln_export_to refusals', () => {
  test('refuses unsafe paths and target without runtime, writing nothing', async () => {
    const { root, run } = await exportTo();
    for (const path of [
      '../escape.glb',
      '/abs/box.glb',
      'C:/box.glb',
      '//host/share/box.glb',
      'models\\box.glb',
      'box.gltf',
      'con/box.glb',
      'aux.glb',
      'models/',
    ]) {
      const message = await run({ path }).then(
        () => 'written',
        (error: Error) => error.message,
      );
      expect(message, path).toMatch(/^Export path/);
    }
    await expect(run({ path: 'box.glb', profile: 'editable', target: 'three' })).rejects.toThrow(
      /target requires profile runtime/,
    );
    expect(await readdir(root)).toEqual([]);
  });

  test('never replaces an existing GLB or sidecar', async () => {
    const { root, run } = await exportTo();
    await run({ path: 'box.glb' });
    const glb = await readFile(join(root, 'box.glb'));
    const failure = await run({ path: 'box.glb' }).catch((error: Error) => error.message);
    expect(failure).toContain('already exists in the export root and is never replaced');
    expect(failure).not.toContain(base);
    expect(await readFile(join(root, 'box.glb'))).toEqual(glb);
    await expect(run({ path: 'box.glb', profile: 'editable' })).rejects.toThrow(
      'box.glb already exists',
    );
    // An orphan sidecar stops the pair before any GLB is published.
    await writeFile(join(root, 'gate.kiln-metadata.json'), 'orphan');
    await expect(run({ path: 'gate.glb' })).rejects.toThrow(
      'gate.kiln-metadata.json already exists',
    );
    expect((await readdir(root)).sort()).toEqual([
      'box.glb',
      'box.kiln-metadata.json',
      'gate.kiln-metadata.json',
    ]);
    expect(await readFile(join(root, 'gate.kiln-metadata.json'), 'utf8')).toBe('orphan');
  });
});
