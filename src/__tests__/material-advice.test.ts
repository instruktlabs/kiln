/**
 * Material measurements keep declared budgets apart from optional advice (#176).
 *
 * With no material limit declared, the reference profile's figures are optimization notes:
 * `observe` QA findings and `materialAdvice[]` beside `budget`, never budget wording. A
 * `defineBudget({ images, decodedBytes, materialTier })` declaration is measured in
 * `budget.materials`, counts toward `budget.status` (and so `--strict-budget`), and replaces
 * the notes.
 */
import { describe, expect, test } from 'bun:test';
import { defineBudget, evaluateBudget } from '../budget';
import { AuthoringDiagnosticError } from '../evaluator/authoring-diagnostic';
import type { MaterialMetricsV1 } from '../material-metrics';
import { renderGLBInProcess } from '../render';

// One material with five maps: one image over the four-image web.portable.v1/standard figure.
const textured = (budget: string) => `
const meta = { name: 'FiveMaps', category: 'prop' };
async function build() {
  const root = createRoot('FiveMaps');
  const albedo = proceduralTexture({ schemaVersion: 2, size: 8, usage: 'albedo', name: 'Albedo', layers: [{ op: 'noise', colorA: 0x102030, colorB: 0x8090a0, scale: 2 }] });
  const normal = normalMapFromHeight(albedo, { name: 'Normal' });
  const mr = proceduralTexture({ schemaVersion: 2, size: 8, usage: 'metallicRoughness', name: 'MetallicRoughness', layers: [{ op: 'checker', colorA: 0x0040c0, colorB: 0x00c040, squares: 2 }] });
  const ao = proceduralTexture({ schemaVersion: 2, size: 8, usage: 'occlusion', name: 'Occlusion', layers: [{ op: 'solid', color: 0x808080 }] });
  const emissive = proceduralTexture({ schemaVersion: 2, size: 8, usage: 'emissive', name: 'Emissive', layers: [{ op: 'stripes', colorA: 0x00ffff, colorB: 0x000000, count: 2 }] });
  root.add(createPart('Body', copyGeometry(boxGeo(1, 1, 1)), pbrMaterial({ albedo, normal, metallicRoughness: mr, aoMap: ao, emissive }), {}));
  ${budget}
  return root;
}
`;

const materialFindings = (report: unknown) =>
  Object.values(
    (
      report as {
        dimensions: Record<
          string,
          { findings: { code: string; disposition: string; message: string }[] }
        >;
      }
    ).dimensions,
  )
    .flatMap((dimension) => dimension.findings)
    .filter((finding) => finding.code.startsWith('MATERIAL_'));

const metrics = (over: Partial<MaterialMetricsV1>): MaterialMetricsV1 =>
  ({
    imageCount: 0,
    maxImageDimension: 0,
    decodedImageBytesRgba8: 0,
    blendedSurfaceAreaRatio: 0,
    images: [],
    ...over,
  }) as MaterialMetricsV1;

describe('defineBudget material limits', () => {
  test('declares images, decodedBytes or a reference tier without triangles', () => {
    expect(defineBudget({ images: 6 })).toEqual({
      schemaVersion: 1,
      triangles: {},
      materials: { images: 6 },
    });
    expect(defineBudget({ triangles: 900, decodedBytes: 4_000_000 })).toEqual({
      schemaVersion: 1,
      triangles: { LOD0: 900 },
      materials: { decodedBytes: 4_000_000 },
    });
    // A tier adopts every figure of that reference tier; explicit limits override it.
    expect(defineBudget({ materialTier: 'web.portable.v1/hero', images: 10 })).toEqual({
      schemaVersion: 1,
      triangles: {},
      materials: {
        tier: 'web.portable.v1/hero',
        images: 10,
        decodedBytes: 128 * 1024 * 1024,
        imageSize: 4096,
        blendedAreaRatio: 0.35,
      },
    });
    for (const bad of [
      {},
      { images: 0 },
      { images: 2.5 },
      { decodedBytes: -1 },
      { materialTier: 'web.portable.v1/huge' },
      { materialTier: 'standard' },
    ])
      expect(() => defineBudget(bad as never)).toThrow(AuthoringDiagnosticError);
  });

  test('measures declared material limits and folds them into the status', () => {
    const declaration = defineBudget({ triangles: 100, images: 4, decodedBytes: 1000 });
    const report = evaluateBudget(
      declaration,
      { triangles: 12, draws: 1 },
      [],
      metrics({ imageCount: 5, decodedImageBytesRgba8: 800 }),
    );
    expect(report.materials).toEqual([
      { limit: 'images', declared: 4, measured: 5, status: 'fail' },
      { limit: 'decodedBytes', declared: 1000, measured: 800, status: 'pass' },
    ]);
    expect(report.tiers.map((tier) => tier.status)).toEqual(['pass']);
    expect(report.status).toBe('fail');
  });
});

describe('render material notes', () => {
  test('an unbudgeted textured asset gets observe notes, not budget warnings', async () => {
    const result = await renderGLBInProcess(textured(''));
    const findings = materialFindings(result.meta.qaReport);
    expect(findings.map((finding) => [finding.code, finding.disposition])).toEqual([
      ['MATERIAL_IMAGE_COUNT_ADVICE', 'observe'],
    ]);
    const manifest = result.integrationManifest;
    expect(manifest.budget).toBeUndefined();
    expect(manifest.materialAdvice).toHaveLength(1);
    const [advice] = manifest.materialAdvice!;
    expect(advice).toMatchObject({
      code: 'MATERIAL_IMAGE_COUNT_ADVICE',
      disposition: 'advisory',
      reference: 'web.portable.v1/standard',
      measurement: { name: 'imageCount', actual: 5, reference: 4, unit: 'images' },
    });
    // Notes never read as a cap the author must meet.
    for (const text of [advice!.message, findings[0]!.message]) {
      expect(text).not.toMatch(/\bbudget\b|exceed|allows/i);
      expect(text).toMatch(/not a requirement/);
      expect(text).toMatch(/defineBudget/);
    }
  });

  test('a declared image budget replaces the notes and is measured', async () => {
    const passing = await renderGLBInProcess(textured('defineBudget({ images: 6 });'));
    expect(materialFindings(passing.meta.qaReport)).toEqual([]);
    expect(passing.integrationManifest.materialAdvice).toBeUndefined();
    expect(passing.integrationManifest.budget).toEqual({
      status: 'pass',
      tiers: [],
      materials: [{ limit: 'images', declared: 6, measured: 5, status: 'pass' }],
    });

    const failing = await renderGLBInProcess(textured('defineBudget({ images: 3 });'));
    expect(failing.integrationManifest.budget).toMatchObject({
      status: 'fail',
      materials: [{ limit: 'images', declared: 3, measured: 5, status: 'fail' }],
    });
    // A declared budget stays advisory for QA acceptance.
    expect(materialFindings(failing.meta.qaReport)).toEqual([]);
    expect((failing.meta.qaReport as { acceptance: string }).acceptance).toBe(
      (passing.meta.qaReport as { acceptance: string }).acceptance,
    );
  });
});
