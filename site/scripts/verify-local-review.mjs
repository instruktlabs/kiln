import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hashBytes, verifyBytes } from './mirror-core.mjs';
import { inspectHtml } from './static-validation-core.mjs';

const [base='http://127.0.0.1:4412', destination='.cache/round-4/local-review'] = process.argv.slice(2);
const out=resolve(destination); await mkdir(out,{recursive:true});
const receipt=await (await fetch(new URL('/_review/receipt.json',base))).json();
assert.equal(receipt.schema,'kiln.local-review/1');
const report={base,productionArtifactSha256:receipt.productionArtifactSha256,downloads:[],html:[],siteFileLinks:[],checksums:[],errors:[]};
const queue=[...receipt.downloads];
await Promise.all([0,1,2,3].map(async()=>{
 let pin;
 while((pin=queue.shift()))try {
  const response=await fetch(new URL(`${receipt.localAssetBase}${pin.path}`,base)); assert.equal(response.status,200,pin.path);
  const bytes=verifyBytes(Buffer.from(await response.arrayBuffer()),pin);
  assert.equal(response.headers.get('x-kiln-local-review'),'verified-download');
  report.downloads.push({path:pin.path,bytes:bytes.length,sha256:hashBytes(bytes),contentType:response.headers.get('content-type'),archive:pin.archive});
 } catch(error){report.errors.push(String(error));}
}));
for(const page of receipt.html)try {
 const response=await fetch(new URL(`/${page.path.replace(/index\.html$/,'')}`,base)); assert.equal(response.status,200,page.path);
 const text=await response.text(); assert.equal(hashBytes(text),page.localSha256);
 assert.ok(!text.match(/<a\b[^>]*\bhref=["']https:\/\/assets\.kilnstudio\.tools\//i),page.path);
 report.html.push({path:page.path,sha256:hashBytes(text)});
}catch(error){report.errors.push(String(error));}
const artifacts=await (await fetch(new URL('/artifact-files.json',base))).json();
const artifactPins=new Map(artifacts.map(pin=>[pin.path,pin]));
const linkedFiles=new Set();
for(const pin of artifacts.filter(file=>file.path.endsWith('.html')))try {
 const url=new URL(`/${pin.path}`,base); const response=await fetch(url);assert.equal(response.status,200,pin.path);
 const text=await response.text();const mapped=receipt.html.find(page=>page.path===pin.path);
 assert.equal(hashBytes(text),mapped?.localSha256??pin.sha256);
 for(const link of inspectHtml(text).references.filter(ref=>ref.tag==='a'&&ref.attribute==='href')) {
  const target=new URL(link.url,url);if(target.origin!==url.origin)continue;
  const path=decodeURIComponent(target.pathname).slice(1);
  if(artifactPins.has(path)&&!path.endsWith('.html'))linkedFiles.add(path);
 }
}catch(error){report.errors.push(String(error));}
for(const path of linkedFiles)try {
 const pin=artifactPins.get(path);const response=await fetch(new URL(`/${path}`,base));assert.equal(response.status,200,path);
 const bytes=verifyBytes(Buffer.from(await response.arrayBuffer()),pin);
 report.siteFileLinks.push({path,bytes:bytes.length,sha256:hashBytes(bytes)});
}catch(error){report.errors.push(String(error));}
for(const pin of artifacts.filter(file=>file.path.endsWith('SHA256SUMS')))try {
 const response=await fetch(new URL(`/${pin.path}`,base)); assert.equal(response.status,200,pin.path);
 const bytes=verifyBytes(Buffer.from(await response.arrayBuffer()),pin); report.checksums.push({path:pin.path,sha256:hashBytes(bytes)});
}catch(error){report.errors.push(String(error));}
await writeFile(join(out,'http-checks.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(`Verified ${report.downloads.length} mapped downloads, ${report.siteFileLinks.length} linked site files, ${report.html.length} mapped HTML pages and ${report.checksums.length} SHA256SUMS endpoints; ${report.errors.length} errors.`);
assert.equal(report.errors.length,0,report.errors.join('\n'));
