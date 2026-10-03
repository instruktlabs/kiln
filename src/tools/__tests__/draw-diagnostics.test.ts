import { expect, spyOn, test } from 'bun:test';
import { Document } from '@gltf-transform/core';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAssetLibrary } from '../../assets-node';
import * as assetExport from '../../asset-export';
import { readAssetResource } from '../../assets-resources';
import { createGltfIO } from '../../gltf-io';
import type { DrawDiagnostics } from '../../draw-diagnostics';
import { inspect } from '../../inspect';
import { renderGLB } from '../../render';
import { createKilnProgramToolRegistry } from '../registry';

const code = `const meta={name:'TwoParts'}; function build(){const root=createRoot('TwoParts'); const m=gameMaterial('#888888');createPart('A',boxGeo(1,1,1),m,{parent:root});createPart('B',boxGeo(1,1,1),m,{parent:root,position:[2,0,0]});return root;}`;
type Output = { ok: boolean; drawDiagnostics?: DrawDiagnostics };

test('library inspection exposes bounded draw diagnostics', async () => {
  const library = await inspect(code);
  expect(library.drawDiagnostics.currentDraws).toBe(2);
  expect(library.drawDiagnostics.mergeEstimate?.draws).toBe(1);
});

test('kiln_inspect exposes diagnostics while kiln_render stays unchanged', async () => {
  const defs = createKilnProgramToolRegistry();
  const report = (await defs
    .find((t) => t.name === 'kiln_inspect')!
    .run({ code, image: false, listParts: {} })) as Output;
  expect(report.ok).toBe(true);
  expect(report.drawDiagnostics?.mergeEstimate?.draws).toBe(1);
  const render = (await defs
    .find((t) => t.name === 'kiln_render')!
    .run({ code, capture: { preset: '1x1' } })) as Output;
  expect(render.ok).toBe(true);
  expect(render.drawDiagnostics).toBeUndefined();
});

test('editable and runtime exports summarize the saved geometry without changing canonical revision bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-draw-diagnostics-'));
  try {
    const assetLibrary = new FileAssetLibrary({ project: root });
    const baked = await renderGLB(code, { optimize: 'off' });
    const manifest = await assetLibrary.save('project', { name: 'TwoParts', code, glb: baked.glb });
    const before = await assetLibrary.read('project', manifest.assetId, manifest.revisionId);
    const tool = createKilnProgramToolRegistry({ assetLibrary }).find(
      (t) => t.name === 'kiln_export',
    )!;
    for (const profile of ['editable', 'runtime']) {
      const output = (await tool.run({
        collection: 'project',
        assetId: manifest.assetId,
        revisionId: manifest.revisionId,
        profile,
      })) as Output;
      expect(output.ok).toBe(true);
      expect(output.drawDiagnostics?.currentDraws).toBe(2);
      expect(output.drawDiagnostics?.mergeEstimate?.draws).toBe(1);
    }
    expect(await assetLibrary.read('project', manifest.assetId, manifest.revisionId)).toEqual(
      before,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runtime export diagnoses its derived bytes once when removed review data exceeded the analysis limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-runtime-diagnostics-'));
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = doc
    .createAccessor()
    .setBuffer(buffer)
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  doc
    .createScene('Scene')
    .addChild(
      doc
        .createNode('Part')
        .setMesh(
          doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', positions)),
        ),
    )
    // Cross only the 32 MiB diagnostics limit; stay well below the 64 MiB asset limit.
    .setExtras({
      kilnReviewClipsV1: { version: 1, clips: [], fixturePadding: 'x'.repeat(32 * 1024 * 1024) },
    });
  const canonical = await createGltfIO().writeBinary(doc);
  expect(canonical.length).toBeGreaterThan(32 * 1024 * 1024);
  expect(canonical.length).toBeLessThan(32 * 1024 * 1024 + 4096);
  const canonicalHash = digest(canonical);
  try {
    const assetLibrary = new FileAssetLibrary({ project: root });
    const manifest = await assetLibrary.save('project', {
      name: 'Runtime boundary',
      glb: canonical,
    });
    const record = await assetLibrary.read('project', manifest.assetId, manifest.revisionId);
    const expected = await assetExport.exportAssetGlb(record, { profile: 'runtime' });
    expect(expected.glb.length).toBeLessThan(4096);
    const tool = createKilnProgramToolRegistry({ assetLibrary }).find(
      (t) => t.name === 'kiln_export',
    )!;
    const derive = spyOn(assetExport, 'exportAssetGlb');
    let output: Output & { resources: { name: string; uri: string; size: number }[] };
    try {
      output = (await tool.run({
        collection: 'project',
        assetId: manifest.assetId,
        revisionId: manifest.revisionId,
        profile: 'runtime',
      })) as typeof output;
      expect(output.drawDiagnostics).toMatchObject({ status: 'assessed', currentDraws: 1 });
      expect(derive).toHaveBeenCalledTimes(1);
    } finally {
      derive.mockRestore();
    }
    const glbLink = output.resources.find((link) => link.name === 'runtime.glb')!;
    const delivered = await readAssetResource(assetLibrary, glbLink.uri);
    expect(glbLink.size).toBe(expected.glb.length);
    expect(delivered.bytes).toEqual(expected.glb);
    expect(digest(delivered.bytes)).toBe(digest(expected.glb));
    expect(
      digest(
        (await assetLibrary.read('project', manifest.assetId, manifest.revisionId)).files[
          'asset.glb'
        ]!,
      ),
    ).toBe(canonicalHash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
