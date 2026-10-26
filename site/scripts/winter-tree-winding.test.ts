import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';

// Exercise the exact published source, rather than a copy of the tube builder.
const root = resolve(import.meta.dir, '../..');
const selection = JSON.parse(readFileSync(resolve(root, 'packs/holodeck/selection.json'), 'utf8'));
const trees = Object.entries(selection.assets).filter(([slug]) => /^winter-wmc-(fir|spruce)-/.test(slug));
test('the cabin pack covers all seven tree families', () => expect(trees).toHaveLength(7));
for (const [slug, asset] of trees as [string, { assetId: string; revisionId: string }][]) {
  test(`${slug}: bark tubes face outward, with closed and consistently wound caps`, () => {
    const source = readFileSync(resolve(root, `packs/holodeck/sources/project/${asset.assetId}/${asset.revisionId}/source.kiln.js`), 'utf8');
    const tube = source.slice(source.indexOf('function tube('), source.indexOf('function snowLobe('));
    for (const sides of [3, 5, 9]) {
      const geometry = runInNewContext(`${tube}\ntube([[0,0,0],[0,1,0]], .2, .1, ${sides})`, { THREE }) as THREE.BufferGeometry;
      const position = geometry.getAttribute('position');
      const index = geometry.getIndex()!;
      let volume = 0;
      const edges = new Map<string, number>();
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const [a, b, c] = ids.map((id) => new THREE.Vector3().fromBufferAttribute(position, id));
        const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
        const center = a.clone().add(b).add(c).divideScalar(3);
        volume += a.dot(b.clone().cross(c)) / 6;
        if (center.y > 0 && center.y < 1) {
          expect(normal.dot(new THREE.Vector3(center.x, 0, center.z))).toBeGreaterThan(0);
        } else {
          expect(normal.y * (center.y === 0 ? -1 : 1)).toBeGreaterThan(0);
        }
        for (let e = 0; e < 3; e++) {
          const from = ids[e], to = ids[(e + 1) % 3];
          const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
          edges.set(key, (edges.get(key) ?? 0) + (from < to ? 1 : -1));
        }
      }
      expect(volume).toBeGreaterThan(0);
      expect([...edges.values()].every((balance) => balance === 0)).toBe(true);
      geometry.dispose();
    }
  });
}
