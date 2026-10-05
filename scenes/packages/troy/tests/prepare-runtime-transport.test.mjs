import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {prepareRuntimeTransport} from '../scripts/prepare-runtime-transport.mjs';
test('transport preparation preserves source bytes, compresses banks and aliases exact duplicates deterministically',async()=>{const root=await mkdtemp(join(tmpdir(),'troy-transport-'));try{await mkdir(join(root,'runtime'));const bank=Buffer.alloc(128*1024,42),model=Buffer.from('fixture model');await writeFile(join(root,'runtime','a.bin'),bank);await writeFile(join(root,'runtime','b.bin'),bank);await writeFile(join(root,'runtime','crew.glb'),model);await writeFile(join(root,'runtime','hands.glb'),model);const first=await prepareRuntimeTransport(root),manifest=await readFile(join(root,'transport.json'));assert.equal(first.unique,2);assert.equal(first.duplicates,2);assert.ok(first.transportBytes<first.sourceBytes/10);const data=JSON.parse(manifest);assert.equal(data.files['runtime/b.bin'].file,'runtime/a.bin.gz');assert.equal(data.files['runtime/hands.glb'].file,'runtime/crew.glb');assert.deepEqual(gunzipSync(await readFile(join(root,'runtime/a.bin.gz'))),bank);assert.deepEqual(await readFile(join(root,'runtime/a.bin')),bank);await prepareRuntimeTransport(root);assert.deepEqual(await readFile(join(root,'transport.json')),manifest);}finally{await rm(root,{recursive:true});}});
