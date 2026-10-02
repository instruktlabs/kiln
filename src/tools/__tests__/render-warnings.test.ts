import { expect, test } from 'bun:test';
import { createKilnProgramToolRegistry } from '../registry';

/** Forty-seven separated boxes: every part floats, so one structural check names them all. */
const code = `const meta={name:'Scattered'};function build(){
const root=createRoot('Root'), m=gameMaterial('#888888');
for(let i=0;i<45;i++)createPart('Panel'+i,boxGeo(.1,.1,.1),m,{parent:root,position:[i*.2,0,0]});
const joint=createPivot('Nested',[0,1,0],root);
for(let i=0;i<2;i++)createPart('Lug'+i,boxGeo(.1,.1,.1),m,{parent:joint,position:[i,0,0]});
return root;}`;

interface Output {
  ok: boolean;
  warnings: string[];
}

test('a render result carries the export-time structural warnings once, under authored names', async () => {
  // The export already inspects the authored scene; a second pass over the
  // re-imported review scene repeated every floating part under its
  // primitive name, doubling the largest field of the result.
  const render = createKilnProgramToolRegistry().find((t) => t.name === 'kiln_render')!;
  for (const capture of [
    { preset: '1x1' },
    { version: 'kiln.capture.v1', shots: [{}], size: 128 },
  ]) {
    const output = (await render.run({ code, capture, detail: 'full' })) as Output;
    expect(output.ok).toBe(true);
    const floating = output.warnings.filter((w) => w.startsWith('Floating parts'));
    expect(floating).toHaveLength(1);
    expect(floating[0]).toContain('"Mesh_Panel0"');
    expect(floating[0]).not.toContain(':primitive-0');
    expect(JSON.stringify(output.warnings).length).toBeLessThan(2500);
  }
});
