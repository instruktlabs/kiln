/**
 * Declared LOD tiers leave Kiln as one `MSFT_lod` chain per set.
 *
 * Every GLB Kiln writes from source must carry the chains in the shape other tools read: LOD0
 * in the scene with `extensions.MSFT_lod.ids` and `extras.MSFT_screencoverage`, the lower
 * levels outside every scene with their subtrees intact, `extensionsUsed` naming the
 * extension, and materials left alone. Headline triangles and bounds describe what a plain
 * loader draws: LOD0 and the parts outside the sets.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportAssetGlb } from '../asset-export';
import { FileAssetLibrary } from '../assets-node';
import { MemoryProgramStore, retainProgram } from '../program-store';
import { renderGLBInProcess } from '../render';
import { createKilnProgramToolRegistry } from '../tools/registry';
import {
  BODY_COVERAGE,
  TIERED_CAR,
  TIERED_CAR_CHAINS,
  TIERED_CAR_TRIANGLES,
  WHEEL_COVERAGE,
  WHEELS,
} from './helpers/lod-fixture';

interface NodeJson {
  name?: string;
  mesh?: number;
  children?: number[];
  extensions?: Record<string, { ids?: number[] }>;
  extras?: Record<string, unknown>;
}
interface GlbJson {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  scenes?: { nodes?: number[] }[];
  nodes?: NodeJson[];
  materials?: { extensions?: Record<string, unknown> }[];
}

function glbJson(bytes: Uint8Array): GlbJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))),
  ) as GlbJson;
}

function inScene(json: GlbJson): Set<number> {
  const reached = new Set<number>();
  const visit = (index: number) => {
    reached.add(index);
    for (const child of json.nodes?.[index]?.children ?? []) visit(child);
  };
  for (const scene of json.scenes ?? []) for (const index of scene.nodes ?? []) visit(index);
  return reached;
}

/** Asserts the body chain and the four wheel chains in written bytes. */
function expectCarChains(bytes: Uint8Array): void {
  const json = glbJson(bytes);
  const nodes = json.nodes ?? [];
  const scene = inScene(json);
  const index = (name: string) => nodes.findIndex((node) => node.name === name);
  const chain = (base: string, lower: string[], coverage: number[]) => {
    const at = index(base);
    expect(scene.has(at)).toBe(true);
    const ids = nodes[at]?.extensions?.['MSFT_lod']?.ids ?? [];
    expect(ids.map((id) => nodes[id]?.name)).toEqual(lower);
    for (const id of ids) expect(scene.has(id)).toBe(false);
    expect(nodes[at]?.extras?.['MSFT_screencoverage']).toEqual(coverage);
    return ids.map((id) => nodes[id]!);
  };

  expect(json.extensionsUsed ?? []).toContain('MSFT_lod');
  expect(json.extensionsRequired ?? []).not.toContain('MSFT_lod');
  const [mid, far] = chain('Body_LOD0', ['Body_LOD1', 'Body_LOD2'], BODY_COVERAGE);
  // A lower level keeps its subtree: the part inside it still carries its mesh.
  for (const level of [mid!, far!]) {
    expect(level.children).toHaveLength(1);
    expect(nodes[level.children![0]!]?.mesh).toBeDefined();
  }
  for (const wheel of WHEELS) {
    const [empty] = chain(`${wheel}_LOD0`, [`${wheel}_LOD1`], WHEEL_COVERAGE);
    expect(empty!.mesh).toBeUndefined();
    expect(empty!.children ?? []).toEqual([]);
  }
  expect(nodes.filter((node) => node.extensions?.['MSFT_lod'])).toHaveLength(1 + WHEELS.length);
  for (const material of json.materials ?? [])
    expect(material.extensions?.['MSFT_lod']).toBeUndefined();
  expect(new TextDecoder().decode(bytes)).not.toContain('kilnLodV1');
}

describe('export writes declared tiers as MSFT_lod chains', () => {
  test('a source build writes one chain per set and reports LOD0 as the headline', async () => {
    const result = await renderGLBInProcess(TIERED_CAR);

    expectCarChains(result.glb);
    // LOD0 body and four wheels; the lower body levels are listed per level, not drawn.
    expect(result.tris).toBe(TIERED_CAR_TRIANGLES.headline);
    expect(result.meta.tris).toBe(TIERED_CAR_TRIANGLES.headline);
    expect(result.integrationManifest.renderMetrics.triangles).toBe(TIERED_CAR_TRIANGLES.headline);
    expect(result.integrationManifest.bounds.max[1]).toBeCloseTo(1.5, 6);
    expect(result.integrationManifest.bounds.size[1]).toBeCloseTo(1.5, 6);
    expect(result.integrationManifest.levelsOfDetail).toEqual(TIERED_CAR_CHAINS);
    expect(result.integrationManifest.structuralQa.validatorErrors).toBe(0);
    expect(result.integrationManifest.structuralQa.validatorWarnings).toBe(0);
  });

  test('the experimental three.js exporter writes the same chains', async () => {
    const result = await renderGLBInProcess(TIERED_CAR, { gltfExporter: 'three' });

    expectCarChains(result.glb);
    expect(result.tris).toBe(TIERED_CAR_TRIANGLES.headline);
    expect(result.integrationManifest.levelsOfDetail).toEqual(TIERED_CAR_CHAINS);
  });

  test('an asset without tiers carries no chain and no summary', async () => {
    const result = await renderGLBInProcess(
      `const meta = { name: 'Plain' };
function build() { const root = createRoot('Plain'); createPart('Box', boxGeo(1, 1, 1), gameMaterial(0x808080), { parent: root, position: [0, 0.5, 0] }); return root; }`,
    );

    expect(glbJson(result.glb).extensionsUsed ?? []).not.toContain('MSFT_lod');
    expect(result.integrationManifest.levelsOfDetail).toBeUndefined();
  });

  test('kiln_render reports the headline and each level', async () => {
    const [render] = createKilnProgramToolRegistry({
      evaluatorPort: { render: renderGLBInProcess },
    }).filter((definition) => definition.name === 'kiln_render');
    const result = (await render!.run({ code: TIERED_CAR })) as {
      ok: boolean;
      tris: number;
      bbox: { max: number[] };
      levelsOfDetail?: unknown;
    };

    expect(result.ok).toBe(true);
    expect(result.tris).toBe(TIERED_CAR_TRIANGLES.headline);
    expect(result.bbox.max[1]).toBeCloseTo(1.5, 6);
    // The default sheet's six views all drew LOD0.
    expect(result.levelsOfDetail).toEqual(
      TIERED_CAR_CHAINS.map((chain) => ({ ...chain, drawn: [0, 0, 0, 0, 0, 0] })),
    );
  });

  test('the saved revision and the runtime export profile keep the chains', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiln-lod-export-'));
    try {
      const programStore = new MemoryProgramStore();
      const assetLibrary = new FileAssetLibrary({ project: root, library: join(root, 'personal') });
      const programRef = await retainProgram(programStore, TIERED_CAR);
      const [save] = createKilnProgramToolRegistry({ programStore, assetLibrary }).filter(
        (definition) => definition.name === 'kiln_save',
      );
      const saved = (await save!.run({ programRef, name: 'Tiered Car' })) as {
        asset: { assetId: string; revisionId: string };
      };
      const record = await assetLibrary.read(
        'project',
        saved.asset.assetId,
        saved.asset.revisionId,
      );

      expectCarChains(record.files['asset.glb']!);
      const runtime = await exportAssetGlb(record, { profile: 'runtime' });
      expectCarChains(runtime.glb);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('the evaluator boundary carries the chain summary', () => {
  test('a subprocess build returns the same headline and chains', async () => {
    const { renderGLBViaSubprocess } = await import('../evaluator/subprocess');
    const result = await renderGLBViaSubprocess(TIERED_CAR);

    expectCarChains(result.glb);
    expect(result.tris).toBe(TIERED_CAR_TRIANGLES.headline);
    expect(result.integrationManifest.levelsOfDetail).toEqual(TIERED_CAR_CHAINS);
  }, 20000);
});
