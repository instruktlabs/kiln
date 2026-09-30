import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FileWorkspace } from './workspace-node';
import { FileLiveReview } from './live-review-node';
import { decodeProjectBundle, projectBundleHash } from './project-bundle';

test('real MCP creates project materials, renders their exact closure, and exposes completed review', async () => {
  await mkdir(resolve('tmp'), { recursive: true });
  const root = await mkdtemp(resolve('tmp/workspace-mcp-'));
  const client = new Client({ name: 'workspace-proof', version: '1' });
  try {
    const built = await Bun.build({
      entrypoints: [resolve('src/mcp-server.ts')],
      outdir: root,
      naming: 'mcp-server.mjs',
      target: 'node',
      packages: 'external',
    });
    expect(built.success).toBe(true);
    const transport = new StdioClientTransport({
      command: 'node',
      args: [join(root, 'mcp-server.mjs')],
      cwd: root,
      env: {
        ...process.env,
        KILN_WORKSPACE: '',
        KILN_PROJECT: '',
        KILN_PROGRAM_STORE: join(root, '.kiln', 'programs'),
        KILN_RENDER: 'cpu',
        KILN_BUILD_CACHE: 'memory',
        KILN_EVALUATOR_MODE: 'in-process',
      } as Record<string, string>,
      stderr: 'pipe',
    });
    let errors = '';
    transport.stderr?.on('data', (value) => {
      errors += value.toString();
    });
    try {
      await client.connect(transport);
    } catch (error) {
      throw new Error(`MCP startup failed: ${errors}`, { cause: error });
    }
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    for (const name of ['kiln_project', 'kiln_material', 'kiln_review'])
      expect(names).toContain(name);
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await client.callTool({ name, arguments: args });
      expect(response.isError, JSON.stringify(response.content) + errors).not.toBe(true);
      return JSON.parse(
        (response.content as { type: string; text: string }[]).find(
          (block) => block.type === 'text',
        )!.text,
      );
    };
    const { material, portableSpec } = await call('kiln_material', {
      action: 'create-procedural',
      draft: {
        materialId: 'mcp-plaster',
        name: 'MCP plaster',
        tileable: true,
        sources: [
          {
            id: 'authored',
            kind: 'procedural',
            provider: 'Kiln',
            creator: 'Qualification',
            license: {
              spdx: 'CC0-1.0',
              url: 'https://creativecommons.org/publicdomain/zero/1.0/',
              attribution: '',
            },
            originalFiles: [],
          },
        ],
        maps: [
          {
            slot: 'baseColor',
            sourceId: 'authored',
            transforms: [],
            procedural: {
              schemaVersion: 2,
              usage: 'albedo',
              size: 8,
              layers: [{ op: 'noise', colorA: 0x777777, colorB: 0xbbbbbb, seed: 42 }],
            },
          },
        ],
      },
    });
    const code = `const meta={name:'MCP material proof'};async function build(){const r=createRoot('Root');const m=await compilePortableMaterialSpecV2(${JSON.stringify(portableSpec)});createPart('Body',boxGeo(1,1,1),m,{parent:r});return r;}`;
    const materialDependencies = [
      {
        resourceId: material.materialId,
        revisionId: material.revisionId,
        sha256: material.revisionId,
      },
    ];
    const standalone = await call('kiln_render', {
      code,
      materialDependencies,
      capture: { preset: '1x1' },
    });
    expect(standalone.ok).toBe(true);
    expect((await call('kiln_project', { action: 'list' })).projects).toEqual([]);
    const { project } = await call('kiln_project', {
      action: 'create',
      draft: {
        projectId: 'pilot',
        name: 'MCP pilot',
        materialDependencies: [
          {
            resourceId: material.materialId,
            revisionId: material.revisionId,
            sha256: material.revisionId,
          },
        ],
      },
    });
    const alongside = await call('kiln_render', {
      code,
      projectId: null,
      materialDependencies,
      capture: { preset: '1x1' },
    });
    expect(alongside.ok).toBe(true);
    const result = await call('kiln_render', {
      code,
      projectId: 'pilot',
      capture: { preset: '1x1' },
    });
    expect(result.ok).toBe(true);
    const workspace = new FileWorkspace(root);
    expect((await workspace.projects.read('pilot')).revisionId).toBe(project.revisionId);
    const review = new FileLiveReview(root);
    let snapshot = await review.snapshot();
    const deadline = Date.now() + 4000;
    while (
      !snapshot.operations.some(
        (operation) => operation.status === 'complete' && operation.projectId === 'pilot',
      ) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      snapshot = await review.snapshot();
    }
    const op = snapshot.operations.find(
      (operation) => operation.status === 'complete' && operation.projectId === 'pilot',
    )!;
    expect(
      snapshot.operations.filter(
        (operation) => operation.status === 'complete' && operation.projectId === undefined,
      ),
    ).toHaveLength(2);
    expect(op.projectRevision).toBe(project.revisionId);
    expect(op.transport).toBe('mcp');
    const saved = await call('kiln_review', {
      action: 'save',
      operationId: op.operationId,
      expectedRevision: op.revision,
      name: 'Exact MCP material proof',
    });
    expect(saved.asset.files['asset.glb'].sha256).toBe(
      result.artifactGlbSha256 ?? result.viewFidelity.inputGlbSha256,
    );
    const updated = await call('kiln_project', {
      action: 'update',
      projectId: 'pilot',
      expectedRevision: project.revisionId,
      patch: {
        inventory: [
          {
            id: 'cube',
            name: 'Cube',
            asset: {
              collectionId: 'project',
              assetId: saved.asset.assetId,
              revisionId: saved.asset.revisionId,
            },
          },
        ],
      },
    });
    for (const profile of ['editable', 'runtime'] as const) {
      const exported = await call('kiln_project', {
        action: 'export',
        projectId: 'pilot',
        revisionId: updated.project.revisionId,
        profile,
      });
      const response = await client.readResource({ uri: exported.resource.uri });
      const content = response.contents[0]!;
      expect('blob' in content).toBe(true);
      const bytes = Uint8Array.from(Buffer.from((content as { blob: string }).blob, 'base64'));
      expect(await projectBundleHash(bytes)).toBe(exported.resource.sha256);
      const decoded = await decodeProjectBundle(bytes);
      expect(decoded.manifest.profile).toBe(profile);
      expect(decoded.manifest.assets).toHaveLength(1);
      expect(decoded.assets).toHaveLength(profile === 'editable' ? 1 : 0);
      expect(decoded.materials).toHaveLength(profile === 'editable' ? 1 : 0);
    }
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
}, 20000);
