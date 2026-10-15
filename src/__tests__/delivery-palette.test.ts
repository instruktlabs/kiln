/**
 * Advisory palette and the cactus recipe (delivery contract item 7).
 *
 * `definePalette([...hex])` makes every receipt list the drawn materials whose base colour is
 * farther than a CIE76 delta E threshold from the nearest palette entry, as warnings and a
 * manifest `palette` report. It never fails a build.
 */
import { describe, expect, test } from 'bun:test';
import { createAssetIntentV1, VEGETATION_SUBTYPES } from '../contracts';
import { AuthoringDiagnosticError } from '../evaluator/authoring-diagnostic';
import { definePalette, linearRgbToLab, normalizePalette } from '../palette-check';
import { buildSandboxGlobals } from '../primitives';
import { renderGLBInProcess } from '../render';
import { vegetationSubtypePromptContext } from '../vegetation-prompt';

const program = (palette: string) => `const meta={name:'Swatches'};
function build(){
  const root=createRoot('Root');
  createPart('Steel',boxGeo(1,1,1),gameMaterial('#6b6f73'),{parent:root});
  createPart('Rust',boxGeo(1,1,1),gameMaterial('#8a4b2a'),{parent:root,position:[2,0,0]});
  createPart('Alarm',boxGeo(1,1,1),gameMaterial('#ff00ff'),{parent:root,position:[4,0,0]});
  colliderBox([1,1,1],{id:'steel',parent:root});
  ${palette}
  return root;
}`;

describe('definePalette', () => {
  test('normalises hex entries and validates the threshold', () => {
    expect(normalizePalette(['#ABC', '6b6f73', '#abc'])).toEqual({
      schemaVersion: 1,
      colors: ['#aabbcc', '#6b6f73'],
      threshold: 10,
    });
    expect(definePalette(['#000000'], { threshold: 4 }).threshold).toBe(4);
    for (const bad of [[], ['red'], ['#12345']])
      expect(() => normalizePalette(bad)).toThrow(AuthoringDiagnosticError);
    expect(() => normalizePalette(['#000'], { threshold: 0 })).toThrow(/threshold/);
    expect(typeof buildSandboxGlobals().definePalette).toBe('function');
    // D65 white is L* 100, a* = b* = 0.
    const [l, a, b] = linearRgbToLab([1, 1, 1]);
    expect(l).toBeCloseTo(100, 3);
    expect(a).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  test('lists off-palette materials as advisory warnings and a manifest report', async () => {
    const result = await renderGLBInProcess(
      program(`definePalette(['#6b6f73','#8a4b2a'],{threshold:8});`),
    );
    const report = result.integrationManifest.palette!;
    expect(report.status).toBe('warn');
    expect(report.colors).toEqual(['#6b6f73', '#8a4b2a']);
    // The collider proxy material is not judged; steel and rust match exactly.
    expect(report.checkedMaterials).toBe(3);
    expect(report.offPalette).toHaveLength(1);
    expect(report.offPalette[0]).toMatchObject({ color: '#ff00ff', nearest: expect.any(String) });
    expect(report.offPalette[0]!.deltaE).toBeGreaterThan(8);
    expect(result.warnings.some((w) => w.startsWith('PALETTE_OFF') && w.includes('#ff00ff'))).toBe(
      true,
    );
    const clean = await renderGLBInProcess(
      program(`definePalette(['#6b6f73','#8a4b2a','#ff00ff']);`),
    );
    expect(clean.integrationManifest.palette).toMatchObject({ status: 'pass', offPalette: [] });
    const none = await renderGLBInProcess(program(''));
    expect(none.integrationManifest.palette).toBeUndefined();
  });
});

describe('cactus vegetation recipe', () => {
  test('is a subtype with its own recipe naming the delivery helpers', () => {
    expect(VEGETATION_SUBTYPES).toContain('cactus');
    const context = vegetationSubtypePromptContext(
      createAssetIntentV1({ category: 'vegetation', vegetation: { subtype: 'cactus' } }),
    );
    expect(context).toContain('RECIPE_CACTUS_V1');
    for (const word of ['extrudeProfile', 'pipeAlongPath', 'spine', 'defineLod', 'impostor'])
      expect(context).toContain(word);
    expect(
      createAssetIntentV1({ category: 'vegetation', subtype: 'saguaro cactus' }).vegetation
        ?.subtype,
    ).toBe('cactus');
  });
});
