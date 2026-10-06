import { describe, expect, it } from 'bun:test';
import { createKilnProgramToolRegistry, createKilnNativeToolRegistry } from '../tools/registry';
import { createLocalToolContext } from '../local-runtime';
import type { DiscoveryResponse } from '../discovery/service';
import { MemoryProgramStore } from '../program-store';

const discovery = () =>
  createKilnProgramToolRegistry().find((tool) => tool.name === 'kiln_discover')!;
type Result = DiscoveryResponse;

describe('progressive capability discovery', () => {
  it('shows stability in the compact text used by both agent transports', async () => {
    for (const tools of [createKilnNativeToolRegistry({}, {}), createKilnProgramToolRegistry()]) {
      const tool = tools.find((entry) => entry.name === 'kiln_discover')!;
      for (const [id, stability] of [
        ['operation:boxGeo', 'stable'],
        ['operation:implicitSurface', 'experimental'],
        ['recipe:steerable-wheel-v1', 'experimental'],
      ]) {
        const output = await tool.run({ query: id, limit: 1 });
        expect(tool.text!(output)).toContain(`${id} [${stability}]`);
      }
    }
  });
  it('reports each selected exporter against actual exported vertex attributes', async () => {
    const source = `function build(){const root=createRoot('Attributes');const g=boxGeo(1,1,1);g.setAttribute('color',new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count).fill([1,0,0]).flat(),3));for(const key of ['uv1','uv2','uv3'])g.setAttribute(key,g.getAttribute('uv').clone());createPart('Body',g,new THREE.MeshStandardMaterial({vertexColors:true}),{parent:root});return root;}`;
    for (const exporter of ['legacy', 'three'] as const) {
      const context = createLocalToolContext(
        { programStore: new MemoryProgramStore() },
        { KILN_GLTF_EXPORTER: exporter, KILN_EVALUATOR_MODE: 'in-process' },
      );
      const tool = createKilnProgramToolRegistry(context).find((t) => t.name === 'kiln_discover')!;
      const result = (await tool.run({ capabilities: true })) as {
        capabilities: { geometry: { exporter: string; attributes: string[] } };
      };
      expect(result.capabilities.geometry.exporter).toBe(exporter);
      expect(context.assetBuildOptions?.gltfExporter).toBe(exporter);
      const rendered = await context.evaluatorPort!.render(source);
      const bytes = Buffer.from(rendered.glb);
      const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      const attributes = document.meshes[0].primitives[0].attributes;
      for (const [sourceKey, gltfKey] of [
        ['color', 'COLOR_0'],
        ['uv1', 'TEXCOORD_1'],
        ['uv2', 'TEXCOORD_2'],
        ['uv3', 'TEXCOORD_3'],
      ]) {
        const reported = result.capabilities.geometry.attributes.includes(sourceKey!);
        expect(reported).toBe(exporter === 'three');
        expect(gltfKey! in attributes).toBe(reported);
      }
    }
  });
  it('does not invent exporter capabilities for an opaque host evaluator', async () => {
    const tools = createKilnProgramToolRegistry({
      evaluatorPort: {
        render: async () => {
          throw new Error('Discovery must not evaluate');
        },
      },
    });
    const result = (await tools
      .find((t) => t.name === 'kiln_discover')!
      .run({ capabilities: true })) as {
      capabilities: { geometry: { exporter: string; attributes: unknown } };
    };
    expect(result.capabilities.geometry.exporter).toBe('unspecified-by-host');
    expect(result.capabilities.geometry.attributes).toBeNull();
  });
  it('keeps a local exporter fixed when the ambient environment changes', async () => {
    const context = createLocalToolContext(
      { programStore: new MemoryProgramStore() },
      { KILN_GLTF_EXPORTER: 'legacy', KILN_EVALUATOR_MODE: 'in-process' },
    );
    const previous = process.env.KILN_GLTF_EXPORTER;
    process.env.KILN_GLTF_EXPORTER = 'invalid-after-context-construction';
    try {
      const result = await context.evaluatorPort!.render(
        'function build(){const root=createRoot();createPart("Box",boxGeo(1,1,1),gameMaterial(0xffffff),{parent:root});return root;}',
      );
      expect(result.glb.byteLength).toBeGreaterThan(0);
    } finally {
      if (previous === undefined) delete process.env.KILN_GLTF_EXPORTER;
      else process.env.KILN_GLTF_EXPORTER = previous;
    }
  });
  it('groups exact signatures in requested order and reports every unknown name', async () => {
    const tool = discovery();
    const result = (await tool.run({
      ids: ['createPart', 'loftProfiles', 'boxGeo'],
    })) as Result;
    expect(result.entries.map((p) => p.name)).toEqual(['createPart', 'loftProfiles', 'boxGeo']);
    expect(result.total).toBe(3);
    expect(result.nextOffset).toBeNull();
    expect(result.entries.every((entry) => 'contract' in entry)).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(16384);
    const missing = (await tool.run({
      ids: ['boxGeo', 'inventedMesh', 'unknownSurface'],
    })) as Result;
    expect(missing.error?.message).toContain('inventedMesh');
    expect(missing.error?.message).toContain('unknownSurface');
    expect(missing.entries).toHaveLength(0);
    await expect(tool.run({ ids: ['boxGeo'], family: 'geometry' })).rejects.toThrow('alone');
    await expect(tool.run({ ids: Array(7).fill('boxGeo') })).rejects.toThrow();
  });
  it('reports effective host limits and current camera/export support without confusing a cache wrapper for an external evaluator', async () => {
    const local = createLocalToolContext({}, { KILN_EVALUATOR_TIMEOUT_MS: '4321' });
    const tool = createKilnProgramToolRegistry(local).find((t) => t.name === 'kiln_discover')!;
    const result = (await tool.run({ capabilities: true })) as {
      capabilities: {
        execution: { mode: string; deadlineMs?: number };
        camera: { version: string; maxShots: number };
        geometry: { materialGroups: boolean; attributes: string[] };
      };
      text: string;
    };
    expect(result.capabilities.execution.mode).toBe('subprocess');
    expect(result.capabilities.execution.deadlineMs).toBe(4321);
    expect(result.capabilities.camera.version).toBe('kiln.capture.v1');
    expect(result.capabilities.camera.maxShots).toBe(9);
    expect(result.capabilities.geometry.materialGroups).toBe(true);
    expect(result.capabilities.geometry.attributes).toContain('uv');
    // Capability replies include the configured texture IDs, grouped by slot.
    // Keep the measured catalog plus host contracts well below the 16 KiB cap.
    expect(result.text.length).toBeLessThan(8000);
    const trusted = (await discovery().run({
      capabilities: true,
    })) as typeof result;
    expect(trusted.capabilities.execution.mode).toBe('trusted-local');
    expect(trusted.capabilities.execution.deadlineMs).toBeUndefined();
  });
  it('returns a compact complete overview and an exact lookup with a usable example', async () => {
    const tool = discovery();
    const overview = (await tool.run({})) as Result;
    expect(overview.entries).toHaveLength(6);
    expect(overview.total).toBeGreaterThan(50);
    expect(overview.nextOffset).toBe(6);
    expect(JSON.stringify(overview.entries)).not.toContain('contract');
    expect(overview.text.length).toBeLessThan(12000);
    expect(overview.text).toContain('BufferGeometry');
    expect(overview.text).toContain('programRef');
    const selected = (await tool.run({ ids: ['boxGeo'] })) as Result;
    expect(selected.entries.map((entry) => entry.name)).toEqual(['boxGeo']);
    expect(selected.text).toContain('example');
    expect(selected.total).toBe(1);
    expect(selected.nextOffset).toBeNull();
  });

  it('publishes every strict procedural texture layer shape instead of hiding parameters', async () => {
    const selected = (await discovery().run({
      ids: ['proceduralTexture'],
    })) as Result;
    for (const fragment of [
      'solid: { color }',
      'checker: { colorA, colorB, squares? }',
      'stripes: { colorA, colorB, count?, angleDeg? }',
      'gradient: { from, to, angleDeg? }',
      'bricks: { brick, mortar, rows?, cols?, mortarWidth?: 0..1',
      'stagger?: 0..1',
      'noise: { colorA, colorB, scale?, octaves?, seed? }',
    ]) {
      expect(selected.text).toContain(fragment);
    }
  });

  it('searches descriptions and pages results without dropping or repeating entries', async () => {
    const tool = discovery();
    const first = (await tool.run({
      family: 'geometry',
      query: 'geo',
      limit: 2,
    })) as Result;
    expect(first.entries).toHaveLength(2);
    expect(first.nextOffset).toBe(2);
    const second = (await tool.run({
      family: 'geometry',
      query: 'geo',
      limit: 2,
      offset: first.nextOffset,
    })) as Result;
    expect(second.total).toBe(first.total);
    expect(second.entries.every((entry) => !first.entries.some((a) => a.name === entry.name))).toBe(
      true,
    );
    const holes = (await tool.run({ query: 'holes', limit: 12 })) as Result;
    expect(holes.entries.some((entry) => entry.name === 'extrudeProfile')).toBe(true);
  });

  it('explains invalid categories and missing names and bounds model-controlled input', async () => {
    const tool = discovery();
    const invalid = (await tool.run({ family: 'clay' })) as Result;
    expect(invalid.error?.code).toBe('UNKNOWN_FILTER');
    expect(invalid.text).toContain('overview');
    const missing = (await tool.run({ ids: ['inventedMesh'] })) as Result;
    expect(missing.error?.message).toContain('inventedMesh');
    expect(missing.text).toContain('query');
    await expect(tool.run({ limit: 100 })).rejects.toThrow();
    await expect(tool.run({ offset: -1 })).rejects.toThrow();
    await expect(tool.run({ accidentalField: true })).rejects.toThrow();
  });

  it('removes the retired callable from both registries and shares the current query contract', async () => {
    for (const tools of [createKilnNativeToolRegistry({}, {}), createKilnProgramToolRegistry()]) {
      expect(tools.some((tool) => tool.name === 'kiln_list_primitives')).toBe(false);
      const tool = tools.find((entry) => entry.name === 'kiln_discover')!;
      const result = (await tool.run({ ids: ['boxGeo'] })) as Result;
      expect(result.version).toBe('kiln.discovery.v1');
      expect(result.entries[0]?.name).toBe('boxGeo');
      await expect(tool.run({ name: 'boxGeo' })).rejects.toThrow();
      await expect(tool.run({ names: ['boxGeo'] })).rejects.toThrow();
      await expect(tool.run({ category: 'geometry' })).rejects.toThrow();
    }
  });

  it('reports the actual revision store usage without exporting stored source', async () => {
    const tools = createKilnProgramToolRegistry();
    const list = tools.find((t) => t.name === 'kiln_discover')!;
    const validate = tools.find((t) => t.name === 'kiln_validate')!;
    const source = 'function build(){return createRoot("Usage");}';
    await validate.run({ code: source });
    await validate.run({ code: source });
    const result = (await list.run({ capabilities: true })) as {
      capabilities: {
        source: {
          storage: { entries: number; bytes: number; eviction: string };
        };
      };
      text: string;
    };
    expect(result.capabilities.source.storage).toMatchObject({
      entries: 1,
      bytes: Buffer.byteLength(source),
      eviction: 'none',
    });
    expect(result.text).not.toContain(source);
  });

  it('explains removed helper migrations without returning callable aliases', async () => {
    const tool = discovery();
    for (const selector of ['panelRemapV', 'operation:panelRemapV']) {
      const result = (await tool.run({ ids: ['boxGeo', selector] })) as Result;
      expect(result.error?.code).toBe('REMOVED_ID');
      expect(result.text).toContain('remapUV');
      expect(result.text).toContain('[1, 0.3]');
      expect(result.entries).toEqual([]);
    }
    const advisory = (await tool.run({ ids: ['validateAsset'] })) as Result;
    expect(advisory.text).toContain('materialBudgetAdvisory');
    expect(advisory.text).toContain('does not validate');
  });
});
