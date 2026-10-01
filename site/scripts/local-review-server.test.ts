import { expect, test } from 'bun:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashBytes } from './mirror-core.mjs';
import { zipSync } from 'fflate';
import { createLocalReview } from './local-review-server.mjs';

test('local review rewrites download anchors only, serves verified bytes and refuses changed or unlisted files', async () => {
 const root = await mkdtemp(join(tmpdir(),'kiln-local-review-')); let server;
 try {
  const dist=join(root,'dist'), mirror=join(root,'mirror'); await mkdir(dist); await mkdir(join(mirror,'packs'),{recursive:true});
  const data=Buffer.from('sealed archive'); const pin={path:'packs/test.zip',bytes:data.length,sha256:hashBytes(data)};
  const html='<a href="https://assets.kilnstudio.tools/packs/test.zip">Download</a><script type="application/ld+json">{"url":"https://assets.kilnstudio.tools/packs/test.zip"}</script>';
  await writeFile(join(dist,'index.html'),html); await writeFile(join(dist,'SHA256SUMS'),'seal'); await writeFile(join(mirror,pin.path),data);
  const files=[{path:'index.html',bytes:Buffer.byteLength(html),sha256:hashBytes(html)},{path:'SHA256SUMS',bytes:4,sha256:hashBytes('seal')}];
  const receipt=JSON.stringify(files); await writeFile(join(dist,'artifact-files.json'),receipt); await writeFile(join(dist,'build-info.json'),JSON.stringify({artifacts:{sha256:hashBytes(receipt)},builtAt:'fixture'}));
  const review=await createLocalReview({dist,mirror,manifest:{base:'https://assets.kilnstudio.tools/',files:[pin]}});
  expect(review.receipt.html[0].originalSha256).toBe(hashBytes(html)); expect(review.receipt.html[0].localSha256).not.toBe(hashBytes(html));
  server=createServer(review.handler); await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve)); const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const served=await (await fetch(base)).text(); expect(served).toContain('href="/_review/files/packs/test.zip"'); expect(served).toContain('"url":"https://assets.kilnstudio.tools/packs/test.zip"'); expect(await readFile(join(dist,'index.html'),'utf8')).toBe(html);
  expect(Buffer.from(await (await fetch(`${base}/_review/files/packs/test.zip`)).arrayBuffer())).toEqual(data);
  expect(await (await fetch(`${base}/SHA256SUMS`)).text()).toBe('seal');
  expect((await fetch(`${base}/_review/files/unknown.zip`)).status).toBe(404);
  expect((await fetch(`${base}/_review/files/%2e%2e%5csecret`)).status).toBe(400);
  expect((await fetch(base,{method:'POST'})).status).toBe(405);
  await writeFile(join(mirror,pin.path),'changed'); expect((await fetch(`${base}/_review/files/packs/test.zip`)).status).toBe(409);
  await writeFile(join(dist,'index.html'),'changed'); expect((await fetch(base)).status).toBe(409);
 } finally { if(server)await new Promise<void>(resolve=>server.close(()=>resolve())); await rm(root,{recursive:true,force:true}); }
});

test('local review derives loose downloads only from verified sealed archive members and detects an altered parent', async () => {
 const root=await mkdtemp(join(tmpdir(),'kiln-local-review-member-')); let server;
 try {
  const dist=join(root,'dist'),mirror=join(root,'mirror'); await mkdir(dist); await mkdir(join(mirror,'packs/farm/r34'),{recursive:true});
  const data=Buffer.from('actual model'); const member={bytes:data.length,sha256:hashBytes(data)};
  const archive=Buffer.from(zipSync({'models/barn.glb':data,'delivery.json':Buffer.from(JSON.stringify({files:{'models/barn.glb':member}}))}));
  const pin={path:'packs/farm/r34/runtime.zip',bytes:archive.length,sha256:hashBytes(archive)};
  const html='<a href="https://assets.kilnstudio.tools/packs/farm/r34/models/barn.glb">Model</a>';
  await writeFile(join(dist,'index.html'),html); await writeFile(join(mirror,pin.path),archive);
  const artifacts=JSON.stringify([{path:'index.html',bytes:Buffer.byteLength(html),sha256:hashBytes(html)}]);
  await writeFile(join(dist,'artifact-files.json'),artifacts); await writeFile(join(dist,'build-info.json'),JSON.stringify({artifacts:{sha256:hashBytes(artifacts)}}));
  const review=await createLocalReview({dist,mirror,manifest:{base:'https://assets.kilnstudio.tools/',files:[pin]}});
  expect(review.receipt.downloads[0]).toEqual({path:'packs/farm/r34/models/barn.glb',...member,archive:pin.path,member:'models/barn.glb',archiveSha256:pin.sha256});
  server=createServer(review.handler); await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/_review/files/packs/farm/r34/models/barn.glb`;
  expect(Buffer.from(await (await fetch(url)).arrayBuffer())).toEqual(data);
  await writeFile(join(mirror,pin.path),'modified parent'); expect((await fetch(url)).status).toBe(409);
 } finally { if(server)await new Promise<void>(resolve=>server.close(()=>resolve())); await rm(root,{recursive:true,force:true}); }
});
