import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileWorkspace } from './workspace-node';
import { createLocalToolContext, createPackagedLocalToolContext } from './local-runtime';
import { createMaterialRecordV1, createMaterialLibraryPayload } from './material-library-node';
import { createKilnProgramToolRegistry } from './tools/registry';

const code = `const meta={name:'Cache fixture'};function build(){const root=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#88aa66'),{parent:root});return root;}`;
test('project resource closure enters both local and packaged cache keys before lookup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-workspace-cache-'));
  try {
    const workspace = new FileWorkspace(root);
    const record = await createMaterialRecordV1({
      materialId: 'plaster',
      name: 'Plaster',
      tileable: true,
      sources: [
        {
          id: 'authored',
          kind: 'procedural',
          provider: 'Kiln',
          creator: 'Fixture',
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
            layers: [{ op: 'noise', colorA: 0xaaaaaa, colorB: 0xffffff, seed: 9 }],
          },
        },
      ],
    });
    await workspace.materials.import([record]);
    await workspace.projects.create({ projectId: 'empty', name: 'Empty', brief: 'No resources' });
    await workspace.projects.create({
      projectId: 'textured',
      name: 'Textured',
      brief: 'Pinned resources',
      materialDependencies: [
        {
          resourceId: record.manifest.materialId,
          revisionId: record.manifest.revisionId,
          sha256: record.manifest.revisionId,
        },
      ],
    });
    const env = {
      KILN_WORKSPACE: root,
      KILN_EVALUATOR_MODE: 'in-process',
      KILN_BUILD_CACHE: 'memory',
      KILN_LIVE_REVIEW: 'off',
    };
    const embeddedPayload = await createMaterialLibraryPayload([record]);
    for (const context of [
      createLocalToolContext({ workspace }, env),
      await createPackagedLocalToolContext({ workspace }, env),
    ]) {
      const render = createKilnProgramToolRegistry(context).find(
        (def) => def.name === 'kiln_render',
      )!;
      const a = (await render.run({ code, projectId: 'empty' })) as {
        buildCache: { hit: boolean; key: string };
      };
      const b = (await render.run({ code, projectId: 'textured' })) as {
        buildCache: { hit: boolean; key: string };
      };
      const again = (await render.run({ code, projectId: 'textured' })) as {
        buildCache: { hit: boolean; key: string };
      };
      expect(a.buildCache.hit).toBe(false);
      expect(b.buildCache.hit).toBe(false);
      expect(a.buildCache.key).not.toBe(b.buildCache.key);
      expect(again.buildCache.hit).toBe(true);
      const standalone = (await render.run({
        code,
        projectId: null,
        materialDependencies: [
          {
            resourceId: record.manifest.materialId,
            revisionId: record.manifest.revisionId,
            sha256: record.manifest.revisionId,
          },
        ],
      })) as typeof b;
      expect(standalone.buildCache.key).toBe(b.buildCache.key);
      expect(standalone.buildCache.hit).toBe(true);
      const embedded = await workspace.run({ projectId: null }, () =>
        context.evaluatorPort!.render(code, { materialResources: embeddedPayload }),
      );
      expect(embedded.materialLibraryDependencies).toEqual([record.manifest]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
