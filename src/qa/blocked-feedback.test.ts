import { expect, test } from 'bun:test';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { renderGLBViaSubprocess } from '../evaluator/subprocess';

const code = `function build(){
  const root=createRoot('Assembly');
  const texture=proceduralTexture({schemaVersion:2,layers:[{op:'solid',color:0x996633}]});
  const material=pbrMaterial({albedo:texture,roughness:.8,metalness:0});
  material.name='Wood';
  createPart('GoodRail',boxGeo(1,1,1),material,{parent:root});
  for(const name of ['CapFront','CapRear']){
    const geometry=boxGeo(.1,.1,.1);
    geometry.deleteAttribute('uv');
    createPart(name,geometry,material,{parent:root,position:[0,1,0]});
  }
  return root;
}`;

test.each(['in-process', 'worker'] as const)(
  '%s blocked render identifies only the affected parts so an author can repair UVs selectively',
  async (mode) => {
    const registry = createKilnProgramToolRegistry(
      mode === 'worker' ? { evaluatorPort: { render: renderGLBViaSubprocess } } : {},
    );
    const render = registry.find((tool) => tool.name === 'kiln_render')!;
    const failed = (await render.run({ code })) as { ok: boolean; error: string };
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain('MAT_TEXTURE_UV_MISSING');
    expect(failed.error).toContain('"node":"Mesh_CapFront"');
    expect(failed.error).toContain('"node":"Mesh_CapRear"');
    expect(failed.error).toContain('"material":"Wood"');
    expect(failed.error).toContain('"attribute":"map"');
    expect(failed.error).not.toContain('GoodRail');
    expect(failed.error).toContain('FIX: ');
    expect(failed.error).toContain('projectUV');
    expect(failed.error).toContain('autoUnwrap');

    const repaired = (await render.run({
      code: code.replace("geometry.deleteAttribute('uv');", ''),
      capture: { preset: '1x1' },
    })) as { ok: boolean; error?: string };
    expect(repaired.ok).toBe(true);
    expect(repaired.error).toBeUndefined();
  },
);
