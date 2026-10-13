import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { hydrateRuntime } from '../scripts/hydrate-runtime.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t, { files = { 'web/woodland/assets/a.glb': Buffer.from('model'), 'web/woodland/collection.json': Buffer.from('{}') }, extras = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cabin-hydrate-')); t.after(() => rm(root, { recursive: true, force: true }));
  const seals = Object.fromEntries(Object.entries(files).map(([path, data]) => [path, { bytes: data.length, sha256: hash(data) }]));
  const pin = { schemaVersion: 1, release: 'review-test', selectionSha256: 'a'.repeat(64), maxArchiveBytes: 64 * 1024 * 1024, files: Object.entries(seals).map(([path, seal]) => ({ path, ...seal })) };
  const delivery = { schemaVersion: 1, group: 'cabin-woods-psx-horror', profile: 'scene', release: pin.release, selectionSha256: pin.selectionSha256, files: { ...seals, ...Object.fromEntries(Object.entries(extras).map(([path, data]) => [path, { bytes: data.length, sha256: hash(data) }])) } };
  const archive = join(root, 'scene.zip');
  const pack = async (members = files, envelope = delivery) => writeFile(archive, zipSync({ ...members, ...extras, 'delivery.json': strToU8(JSON.stringify(envelope)) }));
  await pack(); return { root, archive, pin, files, delivery, pack };
}
test('member-pinned hydration avoids an outer ZIP hash cycle and imports no downloaded JavaScript', async t => {
  const f = await fixture(t, { extras: { 'web/assets/downloaded.js': strToU8('throw Error("never execute")'), 'scene-source/runtime-pin.json': strToU8('{}') } });
  const result = await hydrateRuntime(f); assert.equal(result.files, 2); assert.equal(result.release, f.pin.release);
  assert.equal(await readFile(join(f.root, '.runtime/woodland/assets/a.glb'), 'utf8'), 'model');
  await assert.rejects(access(join(f.root, '.runtime/assets/downloaded.js')));
  await hydrateRuntime(f); // exact known candidates can be verified and reused
});
test('missing or mismatched final member rejects before any destination write', async t => {
  const f = await fixture(t); await f.pack({ ...f.files, 'web/woodland/collection.json': Buffer.from('{"bad":1}') });
  await assert.rejects(hydrateRuntime(f), /seal|hash/i); await assert.rejects(access(join(f.root, '.runtime')));
  await f.pack({ 'web/woodland/assets/a.glb': f.files['web/woodland/assets/a.glb'] });
  await assert.rejects(hydrateRuntime(f), /missing|incomplete/i); await assert.rejects(access(join(f.root, '.runtime')));
});
test('delivery identity and duplicate pin entries reject', async t => {
  const f = await fixture(t); await f.pack(f.files, { ...f.delivery, release: 'wrong' });
  await assert.rejects(hydrateRuntime(f), /identity|release/i);
  await f.pack(); f.pin.files.push(f.pin.files[0]); await assert.rejects(hydrateRuntime(f), /duplicate/i);
});
test('unsafe and duplicate ZIP names are rejected before inflation or writes', async t => {
  const f = await fixture(t); await f.pack({ ...f.files, '../escape.json': strToU8('{}') });
  await assert.rejects(hydrateRuntime(f), /unsafe/i);
  const members = { 'web/woodland/assets/a.glb': strToU8('a'), 'web/woodland/assets/b.glb': strToU8('b') };
  await f.pack(members); const bytes = await readFile(f.archive);
  for (let index = 0; (index = bytes.indexOf('web/woodland/assets/b.glb', index)) >= 0; index++) bytes[index + 'web/woodland/assets/'.length] = 97;
  await writeFile(f.archive, bytes); await assert.rejects(hydrateRuntime(f), /duplicate/i);
  await assert.rejects(access(join(f.root, '.runtime')));
});
test('oversized metadata is rejected before inflating a highly compressed member', async t => {
  const f = await fixture(t); const bytes = await readFile(f.archive); const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(512 * 1024 * 1024 + 1, central + 24); await writeFile(f.archive, bytes);
  await assert.rejects(hydrateRuntime(f), /budget|size/i); await assert.rejects(access(join(f.root, '.runtime')));
});
test('destination symlinks and unknown old leftovers are retained and rejected', async t => {
  const f = await fixture(t); const outside = join(f.root, 'outside'); await mkdir(outside); await symlink(outside, join(f.root, '.runtime'), 'junction');
  await assert.rejects(hydrateRuntime(f), /symlink/i); await assert.rejects(access(join(outside, 'woodland')));
  await rm(join(f.root, '.runtime')); await mkdir(join(f.root, '.runtime')); await writeFile(join(f.root, '.runtime/private-old.js'), 'preserve');
  await assert.rejects(hydrateRuntime(f), /unknown|unsealed/i); assert.equal(await readFile(join(f.root, '.runtime/private-old.js'), 'utf8'), 'preserve');
});
test('Windows alias names, controls and unpinned woodland members reject before writes', async t => {
  const f = await fixture(t);
  for (const name of ['web/woodland/assets/A.glb', 'web/woodland/assets/CON.glb', 'web/woodland/assets/b\u0000.glb']) {
    await f.pack({ ...f.files, [name]: strToU8('extra') }); await assert.rejects(hydrateRuntime(f), /duplicate|unsafe|unpinned/i);
  }
  await f.pack({ ...f.files, 'web/woodland/assets/unpinned.glb': strToU8('extra') });
  await assert.rejects(hydrateRuntime(f), /unpinned/i); await assert.rejects(access(join(f.root, '.runtime')));
});
test('pin contract rejects malformed or excessive budgets and requires complete collection entry', async t => {
  const f = await fixture(t);
  for (const pin of [{ ...f.pin, schemaVersion: 2 }, { ...f.pin, maxArchiveBytes: 65 * 1024 * 1024 }, { ...f.pin, files: [f.pin.files[0]] }]) await assert.rejects(hydrateRuntime({ ...f, pin }), /contract|collection/i);
});
test('filtered hydration never inflates downloaded JavaScript and rejects empty unknown directories', async t => {
  const name='web/assets/downloaded.js'; const f=await fixture(t,{extras:{[name]:strToU8('downloaded source '.repeat(200))}}); const bytes=await readFile(f.archive);
  let offset=0; while(bytes.readUInt32LE(offset)===0x04034b50){const length=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),compressed=bytes.readUInt32LE(offset+18),start=offset+30+length+extra;if(bytes.toString('utf8',offset+30,offset+30+length)===name){bytes.fill(255,start,start+compressed);break;}offset=start+compressed;}
  await writeFile(f.archive,bytes); await hydrateRuntime(f); assert.equal(await readFile(join(f.root,'.runtime/woodland/assets/a.glb'),'utf8'),'model');
  await mkdir(join(f.root,'.runtime/private-empty')); await assert.rejects(hydrateRuntime(f),/unknown|unsealed/i);
});
test('pinned runtime sidecars hydrate byte-exact and tampering rejects before writes', async t => {
  const files={'web/woodland/assets/a.glb':strToU8('model'),'web/woodland/collection.json':strToU8('{}'),'web/woodland/assets/a.kiln-metadata.json':strToU8('{"version":"kiln.runtime-metadata.v1"}')};
  const f=await fixture(t,{files});await hydrateRuntime(f);assert.equal(await readFile(join(f.root,'.runtime/woodland/assets/a.kiln-metadata.json'),'utf8'),'{"version":"kiln.runtime-metadata.v1"}');
  const g=await fixture(t,{files});await g.pack({...files,'web/woodland/assets/a.kiln-metadata.json':strToU8('tampered')});await assert.rejects(hydrateRuntime(g),/seal|size|hash/i);await assert.rejects(access(join(g.root,'.runtime')));
});
