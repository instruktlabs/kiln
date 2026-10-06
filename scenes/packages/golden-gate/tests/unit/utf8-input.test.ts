import {expect,test} from 'bun:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {decodeUtf8,readUtf8} from '../../scripts/utf8';
import {checkVehicleGlb} from '../../scripts/stage';

test('Bridge textual readers reject legacy bytes with input identity rather than inserting replacement text',()=>{
 expect(()=>decodeUtf8(Uint8Array.of(0xb1),'terrain/manifest.json')).toThrow(/terrain\/manifest.json.*UTF-8/);
 const dir=mkdtempSync(join(tmpdir(),'bridge-utf8-'));try{const file=join(dir,'manifest.json');writeFileSync(file,Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xb1,0x22,0x7d]));expect(()=>readUtf8(file)).toThrow(/manifest\.json.*UTF-8/);}finally{rmSync(dir,{recursive:true,force:true});}
 const text='{"notes":"± m² café 日本語","height":1.25}';expect(JSON.parse(decodeUtf8(new TextEncoder().encode(text),'valid.json'))).toEqual({notes:'± m² café 日本語',height:1.25});
});
test('actual staged vehicle JSON chunk refuses invalid UTF-8 even with structurally valid LOD data',()=>{
 const json=JSON.stringify({nodes:[{children:[1,4,5,6,7]},{name:'LOD0',extensions:{MSFT_lod:{ids:[2,3]}}},{name:'LOD1'},{name:'LOD2'},...['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'].map(name=>({name}))],scenes:[{nodes:[0]}],note:'X'});
 const body=Buffer.from(json),offset=body.indexOf('X');body[offset]=0xb1;const bytes=Buffer.alloc(20+body.length);bytes.writeUInt32LE(body.length,12);body.copy(bytes,20);
 expect(()=>checkVehicleGlb('sedan',bytes)).toThrow(/Vehicle sedan GLB JSON.*UTF-8/);
});
