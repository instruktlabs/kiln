import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';
import {decodeUtf8,textProblems,inspectPublicText} from './public-text.mjs';

test('strict UTF-8 rejects legacy bytes, truncation and overlong encodings with a file context',()=>{
 for(const bytes of [Uint8Array.of(0xb1),Uint8Array.of(0xc3),Uint8Array.of(0xc0,0xaf)])expect(()=>decodeUtf8(bytes,'terrain/manifest.json')).toThrow(/terrain\/manifest.json.*UTF-8/);
 expect(decodeUtf8(new TextEncoder().encode('± m² café 日本語'),'valid.json')).toBe('± m² café 日本語');
});
test('known first-stage and repeated mojibake are rejected without banning multilingual text',()=>{
 for(const damaged of ['Loading \u00e2\u20ac\u00a6','Loading \u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a6','\u00c3\u0192\u00e2\u20ac\u0161·','caf\u00c3\u00a9','\u00e2\u201a\u00ac','\ufffd'])expect(textProblems(damaged).length).toBeGreaterThan(0);
 for(const valid of ['café · 50%…','São Tomé; Ângela; Ã; â; £; ©','日本語 中文 한국어 العربية Ελληνικά','± 2 m²; “quoted” — text'])expect(textProblems(valid)).toEqual([]);
});
test('decoded JavaScript literals, templates, HTML entities and JSON strings cannot hide corruption',()=>{
 for(const [source,name]of [
  [String.raw`const status="Loading \u00e2\u20ac\u00a6";`,'bundle.js'],
  ['const status=`Loading \\u00c3\\u00a2\\u00e2\\u201a\\u00ac\\u00c2\\u00a6 ${1}`;','module.mjs'],
  ['<p>Loading &#226;&#8364;&#166;</p>','index.html'],
  ['<button title="caf&#195;&#169;">Go</button>','index.html'],
  [String.raw`{"label":"Loading \u00e2\u20ac\u00a6"}`,'runtime.json'],
  [String.raw`<script>const label="caf\u00c3\u00a9";</script>`,'frame.html'],
  [String.raw`<button onclick="this.textContent='caf\u00c3\u00a9'">Go</button>`,'index.html'],
  ['const html="Loading &#226;&#8364;&#166;";','bundle.js'],
 ])expect(inspectPublicText(new TextEncoder().encode(source),name).some(p=>p.kind==='mojibake')).toBe(true);
 expect(inspectPublicText(new TextEncoder().encode('export const label="café 日本語 ·";'),'good.mjs')).toEqual([]);
});
test('malformed textual input is reported instead of silently escaping parsing checks',()=>{
 expect(inspectPublicText(new TextEncoder().encode('const x = "unterminated'),'bad.js').some(p=>p.kind==='syntax')).toBe(true);
 expect(inspectPublicText(new TextEncoder().encode('{"x":'),'bad.json').some(p=>p.kind==='syntax')).toBe(true);
 expect(inspectPublicText(Uint8Array.of(0xb1),'bad.json').some(p=>p.kind==='utf8')).toBe(true);
});
test('Astro expressions and expression attributes expose cooked strings without treating self-closing scripts as HTML',()=>{
 for(const source of [String.raw`<p>{"Loading \u00e2\u20ac\u00a6"}</p>`,String.raw`<p title={"Loading \u00e2\u20ac\u00a6"}>ok</p>`])expect(inspectPublicText(new TextEncoder().encode(source),'page.astro').some(p=>p.kind==='mojibake')).toBe(true);
 expect(inspectPublicText(new TextEncoder().encode('<script type="application/ld+json" set:html={JSON.stringify({name:"café"})} /><p>日本語</p>'),'good.astro')).toEqual([]);
});
test('Troy initial loading text is actually readable after HTML parsing',async()=>{
 const html=await readFile(new URL('../../scenes/packages/troy/web/index.html',import.meta.url));const document=parse(decodeUtf8(html,'index.html'));let status='';
 function visit(node:any){if(node.attrs?.some((a:any)=>a.name==='id'&&a.value==='status'))status=node.childNodes.map((child:any)=>child.value??'').join('');for(const child of node.childNodes??[])visit(child);}visit(document);
 expect(status).toBe('Loading the saved assets...');
});
test('Troy scene status and playback templates contain readable decoded labels',async()=>{
 const bytes=await readFile(new URL('../../scenes/packages/troy/web/main.mjs',import.meta.url));
 expect(inspectPublicText(bytes,'main.mjs')).toEqual([]);
});
