import {expect,test} from 'bun:test';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {validatePublicText,publicSourceRoots} from './validate-public-text.mjs';

test('published text validation sees nested JSON, encoded JavaScript and invalid bytes while skipping binary models',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kiln-public-text-'));
 try{await mkdir(join(root,'runtime'));await writeFile(join(root,'runtime','metadata.json'),Uint8Array.of(0x7b,0x22,0x78,0x22,0x3a,0x22,0xb1,0x22,0x7d));await writeFile(join(root,'bundle.js'),String.raw`const label="\u00e2\u20ac\u00a6";`);await writeFile(join(root,'model.glb'),Uint8Array.of(0xb1));await writeFile(join(root,'index.html'),'<p>café 日本語 ·</p>');const result=await validatePublicText({roots:[root],base:root});expect(result.checked).toBe(3);expect(result.errors.some(e=>e.file==='runtime/metadata.json'&&e.kind==='utf8')).toBe(true);expect(result.errors.some(e=>e.file==='bundle.js'&&e.kind==='mojibake')).toBe(true);}finally{await rm(root,{recursive:true,force:true});}
});
test('source gate covers all maintained scene UIs and site source without applying a broad fixture whitelist',()=>{
 const paths=publicSourceRoots('/repository').map(path=>path.replaceAll('\\','/'));for(const suffix of ['site/src','packages/troy/web','packages/farm/src','packages/golden-gate/src','packages/foundry-floor/src'])expect(paths.some(path=>path.endsWith(suffix))).toBe(true);expect(paths.some(path=>path.includes('/tests'))).toBe(false);
});
