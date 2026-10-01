// Compare scene intake of explicit original/migrated files without replacing package pins or historical packs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseGlb, sceneTree, worldMatrices } from '../../scripts/glb';
import { bakeModel } from '../../src/scene/glb/bake';
import { entityBake } from '../../src/scene/glb/options';
import { prepareModelLevels } from '../../src/scene/glb/model-levels';
import { MAP } from '../unit/fab-geometry';
const rows = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { id: string; before: string; after: string; candidateBaseline?: string; preservation?: string }[];
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const result = [];
for (const row of rows) {
  const pair = [];
  for (const path of [row.before, row.after, ...(row.candidateBaseline ? [row.candidateBaseline] : [])]) {
    const bytes = readFileSync(path), gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
    await prepareModelLevels(gltf);
    const options = entityBake(MAP, row.id, { floorMoves: true }).options;
    const model = bakeModel(row.id, gltf, options), tree = sceneTree(parseGlb(bytes));
    pair.push({ model, tree, world: worldMatrices(tree), options });
  }
  const [before, after] = pair;
  assert(before && after);
  const originalTriangles = before.model.forms.map(f => f.triangles), triangles = after.model.forms.map(f => f.triangles);
  let preservationSha256: string | null = null;
  if (row.preservation) {
    const proof = JSON.parse(readFileSync(row.preservation, 'utf8'));
    assert.equal(proof.status, 'PASS');
    assert.equal(proof.beforeSha256, sha256(row.before));
    assert.equal(proof.afterSha256, sha256(row.after));
    preservationSha256 = sha256(row.preservation);
  }
  if (row.candidateBaseline) {
    assert(row.preservation, `${row.id}: a candidate baseline requires exact preservation evidence`);
    const proof = JSON.parse(readFileSync(row.preservation, 'utf8'));
    assert.equal(proof.status, 'PASS');
    assert.equal(proof.beforeSha256, sha256(row.before));
    assert.equal(proof.afterSha256, sha256(row.after));
    assert.equal(proof.candidateBaseline?.sha256, sha256(row.candidateBaseline));
    assert.equal(proof.candidateBaseline?.exactMatch, true);
    assert.equal(proof.candidateBaseline.geometryAndMotionDigest, proof.candidateBaseline.migratedGeometryAndMotionDigest);
    assert.deepEqual(triangles, pair[2]!.model.forms.map(f => f.triangles), `${row.id}: candidate baseline near/far triangle counts`);
    preservationSha256 = sha256(row.preservation);
  } else assert.deepEqual(triangles, originalTriangles, `${row.id}: near/far triangle counts`);
  assert.deepEqual(after.model.anchors, before.model.anchors, `${row.id}: animation/hidden anchor names`);
  for (const node of before.tree.nodes) {
    const index = after.tree.byName.get(node.name); assert(index !== undefined, `${row.id}: original node ${node.name} retained`);
    if (!before.world[node.index]) continue;
    const a = after.world[index], b = before.world[node.index]!; assert(a, `${row.id}: lower node ${node.name} has a world matrix`);
    assert(Math.max(...b.map((v, i) => Math.abs(v - a[i]!))) < 1e-5, `${row.id}: world transform ${node.name}`);
  }
  for (const clip of before.options.clips) {
    const seconds = before.model.clipSeconds(clip); assert.equal(after.model.clipSeconds(clip), seconds);
    for (let k = 0; k <= 20; k++) {
      const a = new Float32Array(after.model.anchors.length * 16), b = new Float32Array(before.model.anchors.length * 16);
      after.model.pose({ clips: [[clip, seconds * k / 20]] }, a); before.model.pose({ clips: [[clip, seconds * k / 20]] }, b);
      assert(Math.max(...b.map((v, i) => Math.abs(v - a[i]!))) < 1e-5, `${row.id}: clip ${clip} phase ${k}/20`);
    }
  }
  result.push({ id: row.id, beforeSha256: sha256(row.before), afterSha256: sha256(row.after), originalTriangles, triangles, preservationSha256, originalNodes: before.tree.nodes.length, clips: before.options.clips, ok: true });
  pair.forEach(item => item.model.dispose());
}
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ ok: true, result }, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, result }));
