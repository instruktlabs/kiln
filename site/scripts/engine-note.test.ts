import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engineNoteErrors, factsOf, isAssetPageRoute, readGlbFacts } from './engine-note.mjs';
import { inspectHtml } from './static-validation-core.mjs';

const NOTE =
  'For your engine. The download is a standard glTF 2.0 binary (GLB) with PBR metallic-roughness materials. glTF stores materials, not lighting or tone mapping, so your engine decides how they read. This 3D view tone-maps with Review Neutral, the Khronos PBR Neutral construction with a smaller glare offset (0.015 instead of 0.04), at exposure 0.9. Its Tone mapping control also shows ACES and Linear, for comparison.';
const VEHICLE_NOTE = NOTE.replace('materials.', 'materials, and the vehicle files also declare the optional MSFT_lod extension for their detail tiers.');
const plain = { container: 2, version: '2.0', extensionsUsed: [], extensionsRequired: [], materials: 3 };

const pages = (entries: Record<string, { engineNotes: string[] }>) => new Map(Object.entries(entries));
const run = (entries: Record<string, { engineNotes: string[] }>, facts: Record<string, unknown>) =>
  engineNoteErrors({ pages: pages(entries) as never, facts: new Map(Object.entries(facts)) as never }).map((error: { page: string; message: string }) => `${error.page}: ${error.message}`);

describe('which pages carry a 3D view of a GLB', () => {
  test('a reviewed asset page and an archive item, and nothing else', () => {
    expect(isAssetPageRoute('/gallery/farmhouse/')).toBe(true);
    expect(isAssetPageRoute('/gallery/archive/robot-arm/')).toBe(true);
    expect(isAssetPageRoute('/gallery/')).toBe(false);
    expect(isAssetPageRoute('/gallery/archive/')).toBe(false);
    expect(isAssetPageRoute('/packs/farm/')).toBe(false);
    expect(isAssetPageRoute('/gallery/archive/robot-arm/extra/')).toBe(false);
  });
});

describe('the page markup the note is read from', () => {
  test('inspection returns the note text and the GLB the 3D view loads', () => {
    const html = `<html lang="en"><head><title>x</title></head><body><asset-viewer data-name="Barn" data-model="/models/farm/barn.glb?revision=r_1"></asset-viewer><p data-engine-note><strong>For your engine.</strong> The download   is
    standard.</p></body></html>`;
    const result = inspectHtml(html);
    expect(result.engineNotes).toEqual(['For your engine. The download is standard.']);
    expect(result.viewerModels).toEqual(['/models/farm/barn.glb?revision=r_1']);
    expect(inspectHtml('<html lang="en"><head><title>x</title></head><body></body></html>')).toMatchObject({ engineNotes: [], viewerModels: [] });
  });
});

describe('what a GLB says about itself', () => {
  test('facts come from the JSON chunk: glTF version, declared extensions, material count', () => {
    expect(factsOf({ asset: { version: '2.0' }, extensionsUsed: ['MSFT_lod', 'KHR_x'], materials: [{}, {}] }, 2)).toEqual({
      container: 2,
      version: '2.0',
      extensionsUsed: ['KHR_x', 'MSFT_lod'],
      extensionsRequired: [],
      materials: 2,
    });
    expect(factsOf({}, 2)).toMatchObject({ version: undefined, extensionsUsed: [], materials: 0 });
  });

  test('a GLB is read from its header and first chunk only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'glb-facts-'));
    try {
      const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, extensionsUsed: ['MSFT_lod'], materials: [{ pbrMetallicRoughness: {} }] }));
      const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
      const header = Buffer.alloc(20);
      header.write('glTF', 0, 'latin1');
      header.writeUInt32LE(2, 4);
      header.writeUInt32LE(20 + padded.length + 1000, 8);
      header.writeUInt32LE(padded.length, 12);
      header.write('JSON', 16, 'latin1');
      const good = join(directory, 'good.glb');
      await writeFile(good, Buffer.concat([header, padded, Buffer.alloc(1000)]));
      expect(await readGlbFacts(good)).toEqual({ container: 2, version: '2.0', extensionsUsed: ['MSFT_lod'], extensionsRequired: [], materials: 1 });
      const bad = join(directory, 'bad.glb');
      await writeFile(bad, Buffer.from('not a glb, only text that is long enough to read a header from'));
      await expect(readGlbFacts(bad)).rejects.toThrow('not a GLB');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('the engine note on asset pages', () => {
  test('passes when every asset page has the note and the GLB it describes is plain glTF 2.0', () => {
    expect(run({ '/gallery/farmhouse/': { engineNotes: [NOTE] }, '/gallery/': { engineNotes: [] } }, { '/gallery/farmhouse/': plain })).toEqual([]);
  });

  test('a page without the note, or with it twice, fails', () => {
    expect(run({ '/gallery/farmhouse/': { engineNotes: [] } }, { '/gallery/farmhouse/': plain })).toEqual(['/gallery/farmhouse/: Asset page must carry exactly one engine note, found 0']);
    expect(run({ '/gallery/farmhouse/': { engineNotes: [NOTE, NOTE] } }, { '/gallery/farmhouse/': plain })).toEqual(['/gallery/farmhouse/: Asset page must carry exactly one engine note, found 2']);
  });

  test('the note must say what it promises: glTF 2.0, PBR metallic-roughness, the preview tone mapping and the choices', () => {
    const errors = run({ '/gallery/farmhouse/': { engineNotes: ['For your engine. Nothing useful here.'] } }, { '/gallery/farmhouse/': plain });
    expect(errors.length).toBe(5);
    for (const phrase of ['glTF 2.0', 'PBR metallic-roughness', 'Review Neutral', 'ACES', 'Linear']) expect(errors.join('\n')).toContain(`"${phrase}"`);
  });

  test('a page whose 3D view names no GLB cannot be checked, and a GLB that could not be read is reported', () => {
    expect(run({ '/gallery/farmhouse/': { engineNotes: [NOTE] } }, {})).toEqual(['/gallery/farmhouse/: The 3D view names no GLB that the engine note can be checked against']);
    expect(run({ '/gallery/farmhouse/': { engineNotes: [NOTE] } }, { '/gallery/farmhouse/': { error: 'ENOENT' } })).toEqual(['/gallery/farmhouse/: The GLB behind the 3D view could not be read: ENOENT']);
  });

  test('the note is true of the GLB: glTF 2.0, nothing required, no other shading model', () => {
    expect(run({ '/gallery/a/': { engineNotes: [NOTE] } }, { '/gallery/a/': { ...plain, version: '1.0' } })).toEqual(['/gallery/a/: The engine note says glTF 2.0 but the GLB declares 1.0']);
    expect(run({ '/gallery/a/': { engineNotes: [NOTE] } }, { '/gallery/a/': { ...plain, extensionsRequired: ['KHR_draco_mesh_compression'] } })).toEqual(['/gallery/a/: The GLB requires KHR_draco_mesh_compression, so it is not plain glTF 2.0 for every engine']);
    expect(run({ '/gallery/a/': { engineNotes: [NOTE] } }, { '/gallery/a/': { ...plain, extensionsUsed: ['KHR_materials_unlit'] } })[0]).toContain('KHR_materials_unlit');
    expect(run({ '/gallery/a/': { engineNotes: [NOTE] } }, { '/gallery/a/': { ...plain, extensionsUsed: ['KHR_materials_pbrSpecularGlossiness'] } })[0]).toContain('KHR_materials_pbrSpecularGlossiness');
  });

  test('MSFT_lod is named in the note exactly when the GLB declares it', () => {
    const lod = { ...plain, extensionsUsed: ['MSFT_lod'] };
    expect(run({ '/gallery/sedan/': { engineNotes: [VEHICLE_NOTE] } }, { '/gallery/sedan/': lod })).toEqual([]);
    expect(run({ '/gallery/sedan/': { engineNotes: [NOTE] } }, { '/gallery/sedan/': lod })).toEqual(['/gallery/sedan/: The GLB declares MSFT_lod but the engine note does not mention it']);
    expect(run({ '/gallery/barn/': { engineNotes: [VEHICLE_NOTE] } }, { '/gallery/barn/': plain })).toEqual(['/gallery/barn/: The engine note mentions MSFT_lod but the GLB does not declare it']);
  });

  test('any other declared extension is one the note has not told the reader about', () => {
    expect(run({ '/gallery/a/': { engineNotes: [NOTE] } }, { '/gallery/a/': { ...plain, extensionsUsed: ['KHR_texture_transform'] } })).toEqual(['/gallery/a/: The GLB declares KHR_texture_transform, which the engine note does not mention']);
  });
});
