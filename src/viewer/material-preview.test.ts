import { expect, test } from 'bun:test';
import {
  createMaterialLibraryPayload,
  createMaterialRecordV1,
  createMaterialRecordV2,
} from '../material-library-node';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileWorkspace } from '../workspace-node';
import { FileAssetLibrary } from '../assets-node';
import { FileLiveReview } from '../live-review-node';
import { startAssetViewer } from '../asset-viewer';
import { renderGLBInProcess } from '../render';
import {
  materialPreviewModel,
  materialViewerHref,
  materialViewerSelection,
  materialEvaluationDependencies,
  RAW_MAP_FIDELITY,
} from './material-preview';
const sampler = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'clamp-to-edge',
  wrapT: 'clamp-to-edge',
} as const;
const source = {
  id: 'authored',
  kind: 'procedural' as const,
  provider: 'Kiln',
  creator: 'Fixture',
  license: {
    spdx: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: '',
  },
  originalFiles: [],
};
const draft = {
  materialId: 'atlas',
  name: 'Atlas fixture',
  tileable: false,
  sources: [source],
  maps: [
    {
      slot: 'baseColor',
      sourceId: 'authored',
      transforms: [],
      sampler,
      atlas: {
        schemaVersion: 1,
        width: 8,
        height: 4,
        usage: 'albedo',
        sampler,
        regions: [
          {
            name: 'corner',
            content: { x: 1, y: 1, width: 2, height: 2 },
            gutter: 1,
            edgeMode: 'copy-edge',
            crop: { x: 0, y: 0, width: 2, height: 2 },
            source: {
              kind: 'procedural',
              spec: {
                schemaVersion: 3,
                width: 4,
                height: 4,
                usage: 'albedo',
                background: [100, 50, 20, 255],
                operations: [],
              },
            },
          },
        ],
      },
    },
  ],
};
test('atlas presentation identifies exact revision, sampler and native sheet rectangles', async () => {
  const record = await createMaterialRecordV2({ schemaVersion: 2, ...draft }),
    model = materialPreviewModel(record.manifest);
  expect(model.materialId).toBe('atlas');
  expect(model.revisionId).toBe(record.manifest.revisionId);
  expect(model.maps[0]!.sampler).toEqual(sampler);
  expect(model.maps[0]!.regions).toEqual([
    {
      name: 'corner',
      content: { x: 1, y: 1, width: 2, height: 2 },
      allocation: { x: 0, y: 0, width: 4, height: 4 },
      leftPercent: 12.5,
      topPercent: 25,
      widthPercent: 25,
      heightPercent: 50,
    },
  ]);
  expect(model.maps[0]!.url).toContain(encodeURIComponent(record.manifest.revisionId));
  expect(model.fidelity).toBe(RAW_MAP_FIDELITY);
  model.maps[0]!.sampler!.wrapS = 'repeat';
  expect(record.manifest.maps[0]!.sampler.wrapS).toBe('clamp-to-edge');
});
test('viewer APIs expose the same older saved revision to Library and selected Live Review after a material update', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-preview-api-')),
    workspace = new FileWorkspace(root),
    assets = new FileAssetLibrary({ local: join(root, 'assets') }, workspace.materials),
    review = new FileLiveReview(root);
  let viewer: Awaited<ReturnType<typeof startAssetViewer>> | undefined;
  try {
    const record = await createMaterialRecordV2({ schemaVersion: 2, ...draft });
    await workspace.materials.import([record]);
    const newer = await createMaterialRecordV2({
      schemaVersion: 2,
      ...draft,
      name: 'Updated atlas',
    });
    await workspace.materials.import([newer]);
    const code =
      "const meta={name:'Preview declaration fixture'};function build(){const root=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#886644'),{parent:root});return root;}";
    const rendered = await renderGLBInProcess(code, {
      materialResources: await createMaterialLibraryPayload([record]),
    });
    const asset = await assets.save('local', {
      name: 'Preview declaration fixture',
      code,
      glb: rendered.glb,
      build: {
        engine: 'fixture',
        options: rendered.rebuildOptions!,
        warnings: [],
        dependencies: [
          { kind: 'kiln.material.v2', delivery: 'runtime', manifest: record.manifest },
        ],
        rebuild: 'external-dependencies-required',
      },
    });
    await review.observe('kiln_render', {}, async () => {
      review.artifact(code, rendered);
      return { ok: true };
    });
    await review.flush();
    viewer = await startAssetViewer(assets, { port: 0, workspace, liveReview: review });
    const library = (await (await fetch(`${viewer.url}api/assets?collection=local`)).json()) as {
      assets: (typeof asset)[];
    };
    expect(library.assets[0]!.revisionId).toBe(asset.revisionId);
    const snapshot = (await (await fetch(`${viewer.url}api/live`)).json()) as {
      operations: { operationId: string; artifact: { sha256: string } }[];
    };
    const op = snapshot.operations[0]!;
    const evaluation = await (
      await fetch(`${viewer.url}api/live/${op.operationId}/evaluation.json`)
    ).json();
    const dependencies = materialEvaluationDependencies(evaluation, op.artifact.sha256);
    expect(dependencies[0]!.revisionId).toBe(record.manifest.revisionId);
    expect(dependencies[0]!.revisionId).not.toBe(newer.manifest.revisionId);
    const model = materialPreviewModel(dependencies[0]!),
      png = await fetch(new URL(model.maps[0]!.url, viewer.url));
    expect(png.status).toBe(200);
    expect(new Uint8Array(await png.arrayBuffer())).toEqual(
      Uint8Array.from(record.files['baseColor.png']!),
    );
    const exact = (await (
      await fetch(
        new URL(model.maps[0]!.url.slice(0, model.maps[0]!.url.lastIndexOf('/')), viewer.url),
      )
    ).json()) as { manifest: { revisionId: string } };
    expect(exact.manifest.revisionId).toBe(record.manifest.revisionId);
  } finally {
    await viewer?.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('old records have no invented sampling declaration or atlas requirement', async () => {
  const record = await createMaterialRecordV1({
    materialId: 'legacy',
    name: 'Legacy',
    tileable: true,
    sources: [source],
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        procedural: { schemaVersion: 2, size: 4, layers: [{ op: 'solid', color: 0x334455 }] },
      },
    ],
  });
  const model = materialPreviewModel(record.manifest);
  expect(model.maps[0]!.sampler).toBeUndefined();
  expect(model.maps[0]!.regions).toEqual([]);
  expect(model.maps[0]!.atlas).toBe(false);
});
test('material links select one exact compound identity and reject loose or malformed URLs', () => {
  const selection = { materialId: 'same_id', revisionId: `sha256:${'a'.repeat(64)}` };
  expect(materialViewerSelection(materialViewerHref(selection))).toEqual(selection);
  for (const query of [
    '?material=same_id',
    '?material=same_id&materialRevision=latest',
    '?material=../escape&materialRevision=sha256:abc',
    '?material=same_id&materialRevision=sha256:' +
      'a'.repeat(64) +
      '&materialRevision=sha256:' +
      'b'.repeat(64),
  ])
    expect(materialViewerSelection(query)).toBeUndefined();
});
test('live dependency inspection is bound to displayed artifact hash and never a newer operation', async () => {
  const record = await createMaterialRecordV2({ schemaVersion: 2, ...draft }),
    hash = `sha256:${'b'.repeat(64)}`;
  expect(
    materialEvaluationDependencies(
      { artifactGlbSha256: hash, materialLibraryDependencies: [record.manifest] },
      hash,
    ),
  ).toEqual([record.manifest]);
  expect(() =>
    materialEvaluationDependencies(
      {
        artifactGlbSha256: `sha256:${'c'.repeat(64)}`,
        materialLibraryDependencies: [record.manifest],
      },
      hash,
    ),
  ).toThrow(/artifact/i);
  expect(materialEvaluationDependencies({ artifactGlbSha256: hash }, hash)).toEqual([]);
});
