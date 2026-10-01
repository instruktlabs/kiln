import { expect,test } from 'bun:test';
import { buildHeaders } from './finalize-site.mjs';
import { scriptHashSource } from './static-validation-core.mjs';
test('response policy hashes only the actual emitted scripts in each build mode',()=>{
 const template="/*\n  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-old='; worker-src blob:\n  X-Content-Type-Options: nosniff\n";
 const preupload=buildHeaders(template,[{inlineScripts:['base()','base()']}]);
 expect(preupload).toContain(`script-src 'self' 'wasm-unsafe-eval' ${scriptHashSource('base()')};`);
 expect(preupload).not.toContain('sha256-old=');expect(preupload).toContain('worker-src blob:');expect(preupload).toContain('X-Content-Type-Options: nosniff');
 const full=buildHeaders(template,[{inlineScripts:['base()','frame()']}]);expect(full).toContain(scriptHashSource('frame()'));expect(preupload).not.toContain(scriptHashSource('frame()'));
 expect(()=>buildHeaders('/*\n  Content-Security-Policy: script-src self\n',[])).toThrow('report-only');
});
