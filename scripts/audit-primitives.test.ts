/**
 * Guards the primitives audit (docs/reviews/2026-11-18-primitives-audit.md):
 *
 * - the audit lists every top-level export of src/primitives.ts, so it cannot fall behind;
 * - every case of a builder designed closed that builds measures closed, manifold and outward
 *   with `geometryDiagnostics`, and matches its exact polyhedral volume where one is known;
 * - fixed defects stay fixed: the composition builders listed below share no faces even with
 *   a textured material (#403, #404), wing vertex normals are their face normals (#405), and
 *   no closed builder emits a zero-area triangle (#407).
 *
 * The self-intersecting torus (#406) is deliberately not asserted here; its fix goes through
 * its own change.
 */
import { expect, test } from 'bun:test';
import { runAudit } from './audit-primitives';

const audit = runAudit();

test('the audit covers every top-level export of src/primitives.ts', () => {
  expect(audit.rows.length).toBe(audit.exports);
  expect(audit.exports).toBeGreaterThan(0);
});

test('closed-by-design builders measure closed, manifold and outward, with exact volumes', () => {
  const failures: string[] = [];
  for (const row of audit.rows) {
    if (row.design !== 'closed') continue;
    for (const c of row.cases) {
      if (c.error) continue;
      for (const mesh of c.meshes)
        if (!mesh.closed || !mesh.manifold || mesh.orientation !== 'outward')
          failures.push(`${row.name} ${c.label} ${mesh.name}`);
      if (c.expectedVolume !== undefined) {
        const volume = c.meshes.reduce((sum, mesh) => sum + mesh.signedVolume, 0);
        if (Math.abs(volume - c.expectedVolume) > 1e-5)
          failures.push(`${row.name} ${c.label} volume ${volume} != ${c.expectedVolume}`);
      }
    }
  }
  expect(failures).toEqual([]);
});

test('composition builders share no faces between their parts, even with a texture', () => {
  const failures: string[] = [];
  for (const row of audit.rows) {
    if (!['createStairs', 'room'].includes(row.name)) continue;
    for (const c of row.cases) {
      if (c.error || !c.flushTextured) continue;
      if (c.flushPlain!.candidates + c.flushPlain!.matching + c.flushTextured.candidates > 0)
        failures.push(`${row.name} ${c.label}: ${c.flushTextured.worst ?? 'matching pairs'}`);
    }
  }
  expect(failures).toEqual([]);
});

test('wing faces carry their own normals in every measured case', () => {
  const failures: string[] = [];
  for (const row of audit.rows) {
    if (!['wingGeo', 'createWingPair'].includes(row.name)) continue;
    for (const c of row.cases)
      for (const mesh of c.meshes)
        if (mesh.normalsOpposed > 0 || mesh.maxNormalDeviationDeg >= 1)
          failures.push(`${row.name} ${c.label} ${mesh.name}: ${mesh.maxNormalDeviationDeg} deg`);
  }
  expect(failures).toEqual([]);
});

test('closed-by-design builders emit no zero-area triangles', () => {
  const failures: string[] = [];
  for (const row of audit.rows) {
    if (row.design !== 'closed') continue;
    for (const c of row.cases)
      for (const mesh of c.meshes)
        if (mesh.degenerateTriangles > 0 || mesh.collapsedByToleranceTriangles > 0)
          failures.push(`${row.name} ${c.label} ${mesh.name}: ${mesh.degenerateTriangles}`);
  }
  expect(failures).toEqual([]);
});
