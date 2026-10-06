import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { EXTENSION_ID as MCP_APPS_EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server';
import { createKilnMcpServer } from './mcp-engine';
import { FileAssetLibrary } from './assets-node';
import { MemoryProgramStore, retainProgram } from './program-store';
import { createKilnProgramToolRegistry } from './tools/registry';
import { decodeWidgetAsset } from './widget-transfer';
import { readAssetResource } from './assets-resources';
import { BACKDROPS } from './views/background';
import { PAD } from './views/grid';
import { decodePng } from './views/png';

test('MCP saves an editable revision, exposes exact downloadable bytes, and restores source in a new session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-asset-tools-'));
  const assetLibrary = new FileAssetLibrary({
    project: root,
    library: join(root, 'personal'),
  });
  const programStore = new MemoryProgramStore();
  const code =
    "\ufeffconst meta = { name: 'Box', category: 'prop' }; function build() { const root = createRoot('Box'); createPart('Body', boxGeo(1,1,1), gameMaterial(0x88aa66), {parent: root, position: [0,0.5,0]}); return root; }";
  const programRef = await retainProgram(programStore, code);
  const server = createKilnMcpServer(
    {
      programStore,
      assetLibrary,
      assetDownloadUrls: async () => ({ 'asset.glb': 'https://example.com/asset.glb' }),
    },
    { artifactResourceLinks: true },
  );
  const client = new Client({ name: 'asset-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  try {
    const definitions = await client.listTools();
    const saveDefinition = definitions.tools.find((tool) => tool.name === 'kiln_save')!;
    expect(saveDefinition.description).toContain('user-requested collection');
    const collectionProperty = saveDefinition.inputSchema.properties?.collection as
      | { description?: string }
      | undefined;
    expect(collectionProperty?.description).toContain('kiln_assets action=collections');
    const presentation = definitions.tools.find((tool) => tool.name === 'kiln_present')!;
    expect(presentation.description).toContain('does not launch a local browser');
    expect(presentation.outputSchema).toBeDefined();
    expect(presentation._meta?.ui).toBeDefined();
    const uiMeta = presentation._meta?.ui as { resourceUri?: string } | undefined;
    expect(presentation._meta?.['ui/resourceUri']).toBe(uiMeta?.resourceUri);
    expect(client.getServerCapabilities()?.extensions?.[MCP_APPS_EXTENSION_ID]).toEqual({
      mimeTypes: ['text/html;profile=mcp-app'],
    });
    const result = await client.callTool({
      name: 'kiln_save',
      arguments: { programRef, name: 'Box' },
    });
    expect(result.isError).not.toBe(true);
    const content = result.content as {
      type: string;
      text?: string;
      uri?: string;
    }[];
    const data = JSON.parse(content.find((b) => b.type === 'text')!.text!);
    expect(data.asset.editable).toBe(true);
    const present = await client.callTool({
      name: 'kiln_present',
      arguments: {
        collection: 'project',
        assetId: data.asset.assetId,
        revisionId: data.asset.revisionId,
      },
    });
    expect(present.isError).not.toBe(true);
    expect(JSON.stringify(present.content).length).toBeLessThan(6000);
    expect((present.structuredContent as { asset?: unknown })?.asset).toBeDefined();
    const widget = present._meta?.kilnAsset as {
      files?: Record<string, string | { encoding: string; data: string }>;
      downloadUrls?: Record<string, string>;
    };
    expect(widget.downloadUrls?.['asset.glb']).toBe('https://example.com/asset.glb');
    expect(widget.files?.['asset.glb']).toBeDefined();
    const wireGlb = widget.files!['asset.glb']!;
    expect(JSON.stringify(present.content)).not.toContain(
      typeof wireGlb === 'string' ? wireGlb : wireGlb.data,
    );
    const decoded = await decodeWidgetAsset(widget);
    expect(decoded.record).toEqual(
      await assetLibrary.read('project', data.asset.assetId, data.asset.revisionId),
    );
    const sourceLink = content.find((b) => b.uri?.endsWith('/source.kiln.js'))!;
    expect(sourceLink).toBeDefined();
    const source = await client.readResource({ uri: sourceLink.uri! });
    expect('text' in source.contents[0]! ? source.contents[0].text : undefined).toBe(code);
    const fresh = new MemoryProgramStore();
    const defs = createKilnProgramToolRegistry({
      programStore: fresh,
      assetLibrary,
    });
    const restored = (await defs
      .find((d) => d.name === 'kiln_assets')!
      .run({
        action: 'restore',
        collection: 'project',
        assetId: data.asset.assetId,
        revisionId: data.asset.revisionId,
      })) as { programRef: string };
    expect(await fresh.get(restored.programRef)).toBe(code);
    // c40 (1 October 2026) called get with the asset id alone and was refused. A get or
    // restore without a revisionId reads the newest revision: the one no later revision
    // names as its parent.
    const assets = defs.find((d) => d.name === 'kiln_assets')!;
    const latest = (await assets.run({
      action: 'restore',
      collection: 'project',
      assetId: data.asset.assetId,
    })) as { programRef: string; asset: { revisionId: string } };
    expect(latest.asset.revisionId).toBe(data.asset.revisionId);
    expect(await fresh.get(latest.programRef)).toBe(code);
    const first = await assetLibrary.read('project', data.asset.assetId, data.asset.revisionId);
    const child = await assetLibrary.save('project', {
      assetId: data.asset.assetId,
      parentRevision: data.asset.revisionId,
      name: 'Crate again',
      code,
      glb: first.files['asset.glb']!,
      build: { engine: 'test', options: {}, warnings: [], integration: {} },
    });
    const newest = (await assets.run({
      action: 'get',
      collection: 'project',
      assetId: data.asset.assetId,
    })) as { asset: { revisionId: string } };
    expect(newest.asset.revisionId).toBe(child.revisionId);
    await expect(
      assets.run({ action: 'get', collection: 'project', assetId: 'nope' }),
    ).rejects.toThrow("kiln_assets { action: 'list', collection: 'project' } lists them");
    const copy = (await defs
      .find((d) => d.name === 'kiln_import')!
      .run({
        sourceCollection: 'project',
        collection: 'library',
        assetId: data.asset.assetId,
        revisionId: data.asset.revisionId,
      })) as { asset: { revisionId: string } };
    expect(copy.asset.revisionId).toBe(data.asset.revisionId);
    // Large provenance belongs in a downloadable manifest, not every tool reply.
    const record = await assetLibrary.read('project', data.asset.assetId, data.asset.revisionId);
    const verbose = await assetLibrary.save('project', {
      name: 'Verbose',
      code,
      glb: record.files['asset.glb']!,
      build: {
        engine: 'test',
        options: {},
        warnings: [],
        integration: { details: 'x'.repeat(50000) },
      },
    });
    const exported = await defs
      .find((d) => d.name === 'kiln_export')!
      .run({
        collection: 'project',
        assetId: verbose.assetId,
        revisionId: verbose.revisionId,
      });
    expect(JSON.stringify(exported).length).toBeLessThan(6000);
    const runtime = await client.callTool({
      name: 'kiln_export',
      arguments: {
        collection: 'project',
        assetId: data.asset.assetId,
        revisionId: data.asset.revisionId,
        profile: 'runtime',
      },
    });
    expect(runtime.isError).not.toBe(true);
    const runtimePayload = JSON.parse(
      (runtime.content as { type: string; text?: string }[]).find((block) => block.type === 'text')!
        .text!,
    );
    expect(runtimePayload.profile).toBe('runtime');
    const runtimeLinks = runtime.content.filter((block) => block.type === 'resource_link') as {
      type: string;
      name: string;
      uri: string;
      size: number;
    }[];
    expect(runtimeLinks.map((link) => link.name)).toEqual([
      'runtime.glb',
      'runtime.kiln-metadata.json',
    ]);
    expect(runtimePayload.downloadUrls).toBeUndefined();
    for (const descriptor of runtimeLinks) {
      const resource = await client.readResource({ uri: descriptor.uri });
      const file = resource.contents[0]!;
      const bytes = 'blob' in file ? Buffer.from(file.blob, 'base64') : Buffer.from(file.text);
      expect(bytes.length).toBe(descriptor.size);
      if (descriptor.name.endsWith('.json'))
        expect(JSON.parse(bytes.toString()).source.revisionId).toBe(data.asset.revisionId);
    }
    expect(await assetLibrary.read('project', data.asset.assetId, data.asset.revisionId)).toEqual(
      record,
    );
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * A `resource_link` says "here is where the bytes are", and a client has to decide
 * whether to spend context on them. The spec gives it two fields for that decision --
 * `size` and `annotations.audience` -- and emitting neither leaves the client guessing
 * from a MIME type. `editable.zip` is also not advertised: it is a bundle of the other
 * files, so a client that resolves every link pays for the same bytes twice. It stays
 * readable at its URI, which is what the widget's download button uses.
 */
test('every advertised asset link says how big it is and who it is for', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-asset-links-'));
  const assetLibrary = new FileAssetLibrary({ project: root });
  const programStore = new MemoryProgramStore();
  const programRef = await retainProgram(
    programStore,
    "const meta = { name: 'Box', category: 'prop' }; function build() { const root = createRoot('Box'); createPart('Body', boxGeo(1,1,1), gameMaterial(0x88aa66), {parent: root, position: [0,0.5,0]}); return root; }",
  );
  const server = createKilnMcpServer(
    { programStore, assetLibrary },
    { artifactResourceLinks: true },
  );
  const client = new Client({ name: 'asset-link-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  try {
    const saved = await client.callTool({
      name: 'kiln_save',
      arguments: { programRef, name: 'Box' },
    });
    const blocks = saved.content as { type: string; text?: string }[];
    const data = JSON.parse(blocks.find((block) => block.type === 'text')!.text!);
    const links = blocks.filter((block) => block.type === 'resource_link') as unknown as {
      name: string;
      uri: string;
      size?: number;
      annotations?: { audience?: string[]; priority?: number };
    }[];
    expect(links.length).toBeGreaterThan(0);
    expect(links.map((link) => link.name)).not.toContain('editable.zip');

    const record = await assetLibrary.read('project', data.asset.assetId, data.asset.revisionId);
    for (const link of links) {
      // A declared size a client cannot trust is worse than no size at all, so this
      // compares against the bytes `resources/read` actually returns for that URI.
      const served = await readAssetResource(assetLibrary, link.uri);
      expect(link.size).toBe(served.bytes.byteLength);
      expect(link.annotations?.audience?.length).toBeGreaterThan(0);
      expect(typeof link.annotations?.priority).toBe('number');
    }
    // The renders and the GLB are download artifacts; the model already sees images
    // from kiln_render and never needs to spend context decoding a mesh.
    for (const name of ['asset.glb', 'preview.png']) {
      expect(links.find((link) => link.name === name)!.annotations!.audience).toEqual(['user']);
    }
    // Dropped from the advertised list, still readable where the widget expects it.
    const bundle = await readAssetResource(
      assetLibrary,
      `kiln://assets/project/${data.asset.assetId}/${data.asset.revisionId}/editable.zip`,
    );
    expect(bundle.bytes.byteLength).toBeGreaterThan(0);
    expect(Object.keys(record.files)).toContain('asset.glb');
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('the default MCP transport keeps artifact URIs readable without resource-link blocks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-resource-link-compat-'));
  const programStore = new MemoryProgramStore();
  const assetLibrary = new FileAssetLibrary({ project: root });
  const server = createKilnMcpServer({ programStore, assetLibrary });
  const client = new Client({ name: 'portable-result-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  try {
    const code =
      "const meta = { name: 'Box', category: 'prop' }; function build() { const root = createRoot('Box'); createPart('Body', boxGeo(1,1,1), gameMaterial(0x88aa66), {parent: root, position: [0,0.5,0]}); return root; }";
    const programRef = await retainProgram(programStore, code);
    const result = await client.callTool({
      name: 'kiln_save',
      arguments: { programRef, name: 'Compatibility Box' },
    });
    expect(result.content.map((block) => block.type)).toEqual(['text']);
    const payload = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(payload.resources.length).toBeGreaterThan(0);
    expect(
      payload.resources.every((link: { uri?: string }) => link.uri?.startsWith('kiln://assets/')),
    ).toBe(true);
    const source = payload.resources.find(
      (link: { name?: string }) => link.name === 'source.kiln.js',
    );
    const read = await client.readResource({ uri: source.uri });
    expect('text' in read.contents[0]! ? read.contents[0].text : undefined).toBe(code);
    // Decision 27 of 2 October 2026 (H26): the manifest is pretty-printed on disk and one
    // line as a resource (a Codex session read 33,563 characters of it, a quarter of
    // them line breaks and indentation).
    const manifest = payload.resources.find(
      (link: { name?: string }) => link.name === 'manifest.json',
    );
    const manifestRead = await client.readResource({ uri: manifest.uri });
    const manifestText =
      'text' in manifestRead.contents[0]! ? manifestRead.contents[0].text : undefined;
    expect(manifestText).not.toContain('\n');
    expect(JSON.parse(manifestText!).assetId).toBe(payload.asset.assetId);
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * A saved preview is a render like any other, so it takes the same named backdrop
 * and the manifest records which one it was painted on. Without that, the model
 * could review a grey asset on `dark` and then ship a preview where it vanishes
 * into the neutral grey, and nothing downstream could tell.
 */
test('kiln_save paints its preview on the named backdrop and records it in the manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-save-backdrop-'));
  const assetLibrary = new FileAssetLibrary({ project: root });
  const programStore = new MemoryProgramStore();
  const programRef = await retainProgram(
    programStore,
    "const meta = { name: 'Box', category: 'prop' }; function build() { const root = createRoot('Box'); createPart('Body', boxGeo(1,1,1), gameMaterial(0x88aa66), {parent: root, position: [0,0.5,0]}); return root; }",
  );
  const server = createKilnMcpServer({ programStore, assetLibrary });
  const client = new Client({ name: 'save-backdrop-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  const corner = (png: Uint8Array) => {
    const decoded = decodePng(png);
    const at = ((PAD + 1) * decoded.width + (decoded.width - PAD - 2)) * 3;
    return [...decoded.rgb.subarray(at, at + 3)];
  };
  try {
    for (const [args, expected] of [
      [{ programRef, name: 'Box' }, 'neutral'],
      [{ programRef, name: 'Box on dark', backdrop: 'dark' }, 'dark'],
    ] as const) {
      const saved = await client.callTool({ name: 'kiln_save', arguments: { ...args } });
      const blocks = saved.content as { type: string; text?: string }[];
      const data = JSON.parse(blocks.find((block) => block.type === 'text')!.text!);
      expect(data.ok).toBe(true);
      const record = await assetLibrary.read('project', data.asset.assetId, data.asset.revisionId);
      expect(record.manifest.preview?.backdrop).toBe(expected);
      expect(corner(record.files['preview.png']!)).toEqual([...BACKDROPS[expected].rgb]);
      // The preview depicts the very bytes this save persisted, so it is a view
      // of the artifact rather than of an unpersisted in-loop build.
      const fidelity = record.manifest.preview?.fidelity as {
        exactArtifact: boolean;
        inputGlbSha256: string;
        reasonCodes?: string[];
      };
      expect(fidelity.inputGlbSha256).toBe(record.manifest.files['asset.glb']!.sha256);
      expect(fidelity.exactArtifact).toBe(true);
      expect(fidelity.reasonCodes ?? []).not.toContain('IN_LOOP_BUILD_NOT_PERSISTED');
    }
    const bad = await client.callTool({
      name: 'kiln_save',
      arguments: { programRef, name: 'Box', backdrop: '#000000' },
    });
    expect(bad.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
