/**
 * Guards the primitives audit (docs/reviews/2026-11-18-primitives-audit.md):
 *
 * - the audit lists every top-level export of src/primitives.ts, so it cannot fall behind;
 * - every case of a builder designed closed that builds measures closed, manifold and outward
 *   with `geometryDiagnostics`, and matches its exact polyhedral volume where one is known.
 *
 * Known defects (flush faces, room corners, wing normals, self-intersecting torus, capsule
 * zero-area triangles) are deliberately not asserted here; their fixes go through their own
 * changes.
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
