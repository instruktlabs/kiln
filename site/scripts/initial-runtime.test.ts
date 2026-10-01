import { expect, test } from 'bun:test';
import { measureInitialLoad } from './initial-runtime.mjs';
import { hashBytes } from './mirror-core.mjs';
import { gzipMeasure } from './scene-runtime.mjs';
const code = {
  'index-root.js': 'export const start = () => import("./exterior-part.js"); export const enter = () => import("./interior-part.js");',
  'exterior-part.js': 'import "./index-root.js"; import "./camera-part.js";',
  'camera-part.js': 'import "./index-root.js";',
  'interior-part.js': 'import "./index-root.js"; import "./camera-part.js"; export const twin = true;',
};
const chunks = Object.entries(code).map(([file, value]) => ({file,bytes:Buffer.byteLength(value),gzipBytes:gzipMeasure(Buffer.from(value)).bytes,sha256:hashBytes(Buffer.from(value))}));
const initial = chunks.filter(chunk => !chunk.file.startsWith('interior'));
const receipt = () => ({ mode:'public',release:'ff3',chunks:chunks.map(chunk=>({...chunk,name:`assets/${chunk.file}`,role:chunk.file.startsWith('index')?'startup':chunk.file.startsWith('interior')?'interior':'exterior',kind:chunk.file.startsWith('index')?'entry':chunk.file.startsWith('camera')?'shared':'dynamic entry',imports:chunk.file.startsWith('index')?[]:chunk.file.startsWith('camera')?['assets/index-root.js']:['assets/index-root.js','assets/camera-part.js']})),initialChunks:initial.map(chunk=>`assets/${chunk.file}`),initialCode:{bytes:initial.reduce((n,c)=>n+c.bytes,0),gzipBytes:initial.reduce((n,c)=>n+c.gzipBytes,0)}});
test('initial campus closure excludes only verified dynamic interior while retaining delivery totals', async()=>{
 const result=await measureInitialLoad({receipt:receipt(),chunks,code});
 expect(result.files).toEqual(['camera-part.js','exterior-part.js','index-root.js']);
 expect(result.bytes).toBe(receipt().initialCode.bytes);
 expect(result.deferredFiles).toEqual(['interior-part.js']);
});
test('the registered-floor review release keeps the same verified initial closure', async()=>{
 const next={...receipt(),release:'ff3-review2'};
 const result=await measureInitialLoad({receipt:next,chunks,code,packRelease:'ff3-review2'});
 expect(result.files).toEqual(['camera-part.js','exterior-part.js','index-root.js']);
 expect(result.bytes).toBe(next.initialCode.bytes);
 await expect(measureInitialLoad({receipt:next,chunks,code,packRelease:'ff3'})).rejects.toThrow(/release/);
 await expect(measureInitialLoad({receipt:{...next,release:'ff3-unreviewed'},chunks,code,packRelease:'ff3-unreviewed'})).rejects.toThrow(/receipt/);
});
test('missing chunks, forged hashes, omitted static dependencies and non-dynamic interiors fail closed',async()=>{
 const missing=receipt();missing.chunks.pop();await expect(measureInitialLoad({receipt:missing,chunks,code})).rejects.toThrow(/chunk inventory/);
 const hash=receipt();hash.chunks[0]!.sha256='0'.repeat(64);await expect(measureInitialLoad({receipt:hash,chunks,code})).rejects.toThrow(/pin/);
 const omission=receipt();omission.initialChunks=omission.initialChunks.filter(name=>!name.includes('camera'));await expect(measureInitialLoad({receipt:omission,chunks,code})).rejects.toThrow(/closure/);
 const imports=receipt();imports.chunks[1]!.imports=[];await expect(measureInitialLoad({receipt:imports,chunks,code})).rejects.toThrow(/static imports/);
 const noDynamic={...code,'index-root.js':'export const start = () => import("./exterior-part.js");'};await expect(measureInitialLoad({receipt:receipt(),chunks,code:noDynamic})).rejects.toThrow(/dynamic interior/);
});
import { checkCeiling } from './scene-runtime.mjs';
import { verifyInitialLoad } from './initial-runtime.mjs';
test('D15 measures an explicit initial closure while all delivery totals remain intact',()=>{
 const initialLoad={files:initial.map(c=>c.file),...receipt().initialCode,deferredFiles:['interior-part.js']};
 expect(checkCeiling('foundry-floor',{bytes:2_000_000,gzipBytes:600_000,initialLoad}).within).toBe(true);
 expect(()=>verifyInitialLoad({file:'index-root.js',chunks,initialLoad})).not.toThrow();
 expect(()=>verifyInitialLoad({file:'index-root.js',chunks,initialLoad:{...initialLoad,bytes:1}})).toThrow(/aggregate/);
});
