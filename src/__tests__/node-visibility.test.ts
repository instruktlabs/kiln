/**
 * Node visibility (R44).
 *
 * `visible = false` exports as `KHR_node_visibility` under both exporters. The headline
 * triangles and bounds count what draws; hidden subtrees are listed apart with their own
 * triangles. The review scene restores the flag, so views and listings honour it, and an
 * isolated shot of a hidden part still draws that part. QA analyses visible parts only.
 */
import { describe, expect, test } from 'bun:test';
import type { Object3D } from 'three';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { renderGLBInProcess } from '../render';
import { collectTriangles, coverage } from '../views/raster';
import { decodePng } from '../views/png';
import { loadGlbGeometryFlatScene, loadGlbReviewScene } from '../views/glb';
import {
  HIDDEN_IN_LEVELS,
  HIDDEN_IN_LEVELS_TRIANGLES,
  HIDEABLE as HIDDEN,
  hideable as program,
} from './helpers/visibility-fixture';

/** The JSON chunk of a GLB, read from the bytes alone. */
function gltfJson(glb: Uint8Array): {
  nodes: { name?: string; extensions?: Record<string, { visible?: boolean }> }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
} {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)));
}

function findingCodes(report: unknown): string[] {
  const found: string[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.code === 'string' && typeof record.disposition === 'string')
      found.push(`${record.code} ${JSON.stringify(record.affected ?? null)}`);
    for (const item of Object.values(record)) walk(item);
  };
  walk(report);
  return found;
}

describe('node visibility', () => {
  for (const gltfExporter of ['legacy', 'three'] as const) {
    test(`visible = false exports KHR_node_visibility (${gltfExporter})`, async () => {
      const result = await renderGLBInProcess(HIDDEN, { gltfExporter });
      const json = gltfJson(result.glb);
      const flag = (name: string) =>
        json.nodes.find((node) => node.name === name)?.extensions?.KHR_node_visibility;
      expect(flag('Mesh_Cover')).toEqual({ visible: false });
      expect(flag('Joint_Panel')).toEqual({ visible: false });
      expect(flag('Mesh_Body')).toBeUndefined();
      expect(flag('Mesh_Inner')).toBeUndefined();
      expect(json.extensionsUsed).toContain('KHR_node_visibility');
      expect(json.extensionsRequired ?? []).not.toContain('KHR_node_visibility');
      expect(result.integrationManifest.structuralQa.validatorErrors).toBe(0);
    });
  }

  test('headline triangles and bounds count what draws; hidden nodes are listed apart', async () => {
    const result = await renderGLBInProcess(HIDDEN);
    expect(result.tris).toBe(12);
    const manifest = result.integrationManifest;
    expect(manifest.renderMetrics.triangles).toBe(12);
    expect(manifest.bounds.min).toEqual([-0.5, 0, -0.5]);
    expect(manifest.bounds.max).toEqual([0.5, 1, 0.5]);
    expect(manifest.hiddenNodes).toEqual([
      { path: '/Hideable[0]/Root[0]/Mesh_Cover[0]', name: 'Mesh_Cover', triangles: 12 },
      { path: '/Hideable[0]/Root[0]/Joint_Panel[0]', name: 'Joint_Panel', triangles: 12 },
    ]);
    const shown = await renderGLBInProcess(program(false));
    expect(shown.tris).toBe(36);
    expect(shown.integrationManifest.hiddenNodes).toBeUndefined();
  });

  test('QA analyses visible parts only', async () => {
    const shown = findingCodes((await renderGLBInProcess(program(false))).meta.qaReport);
    expect(
      shown.some((f) => f.startsWith('GEO_PART_CONNECTIVITY') && f.includes('Mesh_Cover')),
    ).toBe(true);
    expect(shown.some((f) => f.startsWith('GEO_PART_SELF_INTERSECTION '))).toBe(true);
    const hidden = findingCodes((await renderGLBInProcess(HIDDEN)).meta.qaReport);
    expect(hidden.filter((f) => f.startsWith('GEO_PART_'))).toEqual([]);
  });

  test('the review scene restores the flag and draws only visible parts', async () => {
    const { root } = await loadGlbReviewScene((await renderGLBInProcess(HIDDEN)).glb);
    const node = (name: string) => root.getObjectByName(name) as Object3D;
    expect(node('Mesh_Cover').visible).toBe(false);
    expect(node('Joint_Panel').visible).toBe(false);
    expect(node('Mesh_Body').visible).toBe(true);
    // The whole scene draws the body; a named part is measured as it draws when shown.
    expect(collectTriangles(root).tris).toHaveLength(12);
    expect(collectTriangles(node('Mesh_Cover')).tris).toHaveLength(12);
  });

  test('the geometry-flat view of the final bytes leaves hidden subtrees out', async () => {
    const flat = await loadGlbGeometryFlatScene((await renderGLBInProcess(HIDDEN)).glb);
    expect(flat.meshCount).toBe(1);
    expect(collectTriangles(flat.root).tris).toHaveLength(12);
  });

  test('hidden parts inside levels of detail stay out of the headline and each level', async () => {
    const result = await renderGLBInProcess(HIDDEN_IN_LEVELS);
    expect(result.tris).toBe(HIDDEN_IN_LEVELS_TRIANGLES.headline);
    const body = result.integrationManifest.levelsOfDetail![0]!;
    expect(body.levels.map((level) => level.triangles)).toEqual(HIDDEN_IN_LEVELS_TRIANGLES.body);
    // Hidden nodes are listed from the drawn scene; a lower level carries its own flag.
    expect(result.integrationManifest.hiddenNodes).toEqual([
      {
        path: '/Tiered%20Car[0]/Car[0]/Body_LOD0[0]/Mesh_Mirror[0]',
        name: 'Mesh_Mirror',
        triangles: 12,
      },
    ]);
    const spoiler = gltfJson(result.glb).nodes.find((node) => node.name === 'Mesh_Spoiler');
    expect(spoiler?.extensions?.KHR_node_visibility).toEqual({ visible: false });
  });

  test('an asset whose every triangle is hidden fails with the reason', async () => {
    await expect(
      renderGLBInProcess(HIDDEN.replace('cover.visible=false;', 'root.visible=false;')),
    ).rejects.toThrow('every triangle is hidden');
  });

  test('render and inspect report drawn metrics, flag hidden parts and isolate them on request', async () => {
    const tools = createKilnProgramToolRegistry();
    const render = tools.find((t) => t.name === 'kiln_render')!;
    const inspect = tools.find((t) => t.name === 'kiln_inspect')!;
    const rendered = (await render.run({ code: HIDDEN })) as {
      ok: boolean;
      programRef: string;
      tris: number;
      bbox: { min: number[]; max: number[] };
      hiddenNodes: { name: string; triangles: number }[];
    };
    expect(rendered.ok).toBe(true);
    expect(rendered.tris).toBe(12);
    expect(rendered.bbox.max[1]).toBeCloseTo(1, 6);
    expect(rendered.hiddenNodes.map((n) => [n.name, n.triangles])).toEqual([
      ['Mesh_Cover', 12],
      ['Joint_Panel', 12],
    ]);
    const listed = (await inspect.run({
      programRef: rendered.programRef,
      image: false,
      listParts: {},
    })) as {
      partListing: {
        parts: { name: string; hidden?: boolean; bounds: { min: number[]; max: number[] } }[];
      };
    };
    const part = (name: string) => listed.partListing.parts.find((p) => p.name === name)!;
    expect(part('Mesh_Cover').hidden).toBe(true);
    expect(part('Mesh_Cover:primitive-0').hidden).toBe(true);
    expect(part('Mesh_Inner').hidden).toBe(true);
    expect(part('Mesh_Body').hidden).toBeUndefined();
    expect(part('Mesh_Cover').bounds.min[1]).toBeCloseTo(2.9, 6);
    expect(part('Root').bounds.max[1]).toBeCloseTo(1, 6);
    const drawn: Record<string, number> = {};
    for (const visibility of ['isolate', 'context'] as const) {
      const shot = (await inspect.run({
        programRef: rendered.programRef,
        shot: { subject: { name: 'Mesh_Cover' }, visibility },
      })) as { ok: boolean; pngBase64: string };
      expect(shot.ok).toBe(true);
      const png = decodePng(Buffer.from(shot.pngBase64, 'base64'));
      drawn[visibility] = coverage(png.rgb, png.width);
    }
    // Isolation draws the hidden subject; context draws the scene as it draws, without it.
    expect(drawn.isolate!).toBeGreaterThan(drawn.context! + 0.05);
    const zoomed: Record<string, number> = {};
    for (const isolate of [true, false]) {
      const view = (await inspect.run({
        programRef: rendered.programRef,
        part: 'Mesh_Cover',
        isolate,
      })) as { ok: boolean; pngBase64: string };
      expect(view.ok).toBe(true);
      const png = decodePng(Buffer.from(view.pngBase64, 'base64'));
      zoomed[String(isolate)] = coverage(png.rgb, png.width);
    }
    expect(zoomed.true!).toBeGreaterThan(zoomed.false! + 0.05);
  });
});
