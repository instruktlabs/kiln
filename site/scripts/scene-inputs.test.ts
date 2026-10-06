import { expect, test } from 'bun:test';
import { zipSync, strToU8 } from 'fflate';
import { checkedSceneArchive } from './scene-inputs.mjs';
import { hashBytes } from './mirror-core.mjs';

test('scene archives are hash pinned and refuse unsafe members before extraction', () => {
  const bytes = zipSync({ 'assets/pack.json': strToU8('{}') });
  const record = { bytes: bytes.length, sha256: hashBytes(bytes), path: 'scene.zip' };
  expect(Object.keys(checkedSceneArchive(bytes, record))).toEqual(['assets/pack.json']);
  expect(() => checkedSceneArchive(bytes, { ...record, sha256: '0'.repeat(64) })).toThrow('verification failed');
  const unsafe = zipSync({ '../outside.txt': strToU8('no') });
  expect(() => checkedSceneArchive(unsafe, { ...record, bytes: unsafe.length, sha256: hashBytes(unsafe) })).toThrow('Unsafe asset path');
});
test('sealed scene staging refuses invalid UTF-8 metadata before extraction, retaining valid international text and binary inputs',()=>{
 const bad=zipSync({'terrain/manifest.json':Uint8Array.of(0x7b,0x22,0x78,0x22,0x3a,0x22,0xb1,0x22,0x7d)});
 expect(()=>checkedSceneArchive(bad,{bytes:bad.length,sha256:hashBytes(bad),path:'bridge.zip'})).toThrow(/bridge\.zip.*terrain\/manifest.json.*UTF-8/);
 const manifest=strToU8('{"notes":"± m² café 日本語","height":1.25}'),model=Uint8Array.of(0xb1,0xff),good=zipSync({'terrain/manifest.json':manifest,'tiles/near.glb':model});const files=checkedSceneArchive(good,{bytes:good.length,sha256:hashBytes(good),path:'bridge.zip'});
 expect(files['terrain/manifest.json']).toEqual(manifest);expect(files['tiles/near.glb']).toEqual(model);
});
