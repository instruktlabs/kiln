import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('the retained X-02 count baseline covers every recorded backend, tier and camera and names its original receipt', () => {
  const root = resolve(import.meta.dir, '../..');
  const baseline = JSON.parse(readFileSync(resolve(root, 'fixtures/x02-baseline.json'), 'utf8'));
  const layout = JSON.parse(readFileSync(resolve(root, 'data/layout.json'), 'utf8'));
  expect(baseline.id).toBe('X-02');
  expect(baseline.captured).toBe('2026-10-02T08:42:56.568Z');
  expect(baseline.provenance.originalSha256).toBe('ec58dc339b8c56018a0a1f2ecdff137915752e30ba8c9af958249db0a4ad233d');
  expect(baseline.build.chunks).toEqual(['index-D-gELBet.js', 'route-contact-CxuZU847.js']);
  expect(baseline.build.source).toBe('working tree');
  // These pins identify the recorded g9 binary, independently of later delivery labels.
  expect(baseline.build.release).toBe('g9');
  expect(baseline.build.packSha256).toBe('c2a1d83fce6caf07a7b3e87070ccb8a983dd68e0c7f98eee3f1ba5255ce059cb');
  expect(createHash('sha256').update(JSON.stringify(baseline.cases)).digest('hex')).toBe(baseline.provenance.casesSha256);
  expect(baseline.cases.map((c: { backend: string; tier: string }) => `${c.backend}/${c.tier}`).sort()).toEqual([
    'webgl2/balanced', 'webgl2/economy', 'webgl2/high', 'webgpu/balanced', 'webgpu/economy', 'webgpu/high',
  ]);
  const views = [...Object.keys(layout.cameras.named), ...[0, 90, 180, 270].map(degrees => `hero-orbit-${degrees}deg`), 'drive-chase'].sort();
  expect(views).toHaveLength(16);
  for (const c of baseline.cases) {
    expect(c.views.map((v: { view: string }) => v.view).sort()).toEqual(views);
    for (const v of c.views) {
      expect(Number.isSafeInteger(v.drawCalls) && v.drawCalls > 0).toBe(true);
      expect(Number.isSafeInteger(v.triangles) && v.triangles > 0).toBe(true);
    }
  }
  // The published report's first high/WebGPU row is an independent witness for the extracted counts.
  expect(baseline.cases.find((c: { backend: string; tier: string }) => c.backend === 'webgpu' && c.tier === 'high').views[0])
    .toEqual({ view: 'arrival', drawCalls: 103, triangles: 1426047 });
});
