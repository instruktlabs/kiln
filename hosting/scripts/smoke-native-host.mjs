import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const image = process.argv[2];
if (!image || !/^[a-zA-Z0-9._:/@-]+$/.test(image))
  throw new Error('Supply the built image reference');
const output = resolve(process.argv[3] ?? join(root, '.cache/native-host-image/qualification'));
if (!output.startsWith(join(root, '.cache') + sep))
  throw new Error('Receipt must be in the checkout cache');
await mkdir(output, { recursive: true });
const name = `kiln-host-qualification-${randomUUID()}`;
const published = JSON.parse(
  await readFile(join(root, '.github/published-candidate.json'), 'utf8'),
);
const receipt = {
  image,
  container: name,
  engine: published,
  status: 'running',
  cloudflareQualified: false,
};

async function docker(args, input) {
  return new Promise((done, fail) => {
    const child = spawn('docker', args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    const stdout = [],
      stderr = [];
    let bytes = 0;
    for (const [stream, chunks] of [
      [child.stdout, stdout],
      [child.stderr, stderr],
    ])
      stream.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) child.kill();
        else chunks.push(chunk);
      });
    child.stdin.on('error', () => {});
    child.once('error', fail);
    child.once('close', (code) =>
      code === 0
        ? done(Buffer.concat(stdout).toString('utf8'))
        : fail(new Error(`Docker ${args[0]} failed: ${Buffer.concat(stderr).toString('utf8')}`)),
    );
    child.stdin.end(input);
  });
}

const check = `
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const pkg=JSON.parse(await readFile('/opt/kiln/node_modules/@instruktlabs/kiln/package.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
function call(path,method='GET',headers={},body='') {return new Promise((resolve,reject)=>{
 const req=request({hostname:'127.0.0.1',port:3000,path,method,headers:{host:'kiln-native.internal',...headers}},res=>{
  let text='';res.on('data',c=>{text+=c;if(text.length>256*1024)req.destroy();});res.on('end',()=>resolve({status:res.statusCode,text}));res.on('error',reject);
 });req.on('error',reject);req.end(body);
});}
let ready=false;for(let i=0;i<100;i++){try{ready=(await call('/_ready')).status===204;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert(ready);
const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'native-host-fixture',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}};
const headers={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28','mcp-method':'tools/list'};
const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{_meta:meta}});
const listed=await call('/mcp','POST',headers,body);assert.equal(listed.status,200);const result=JSON.parse(listed.text);assert(!result.error);
const names=result.result.tools.map(t=>t.name).sort();assert.equal(new Set(names).size,names.length);for(const n of ['kiln_discover','kiln_render','kiln_save','kiln_source','kiln_export','kiln_material'])assert(names.includes(n));
assert(result.result.tools.find(t=>t.name==='kiln_render').inputSchema.properties.materialDependencies);
const presets=await call('/mcp','POST',{...headers,'mcp-method':'tools/call','mcp-name':'kiln_material'},JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/call',params:{_meta:meta,name:'kiln_material',arguments:{action:'presets'}}}));assert.equal(presets.status,200);const presetResult=JSON.parse(presets.text).result;assert(!presetResult.isError);assert(JSON.parse(presetResult.content.find(x=>x.type==='text').text).presets.length>0);
const legacy=await call('/mcp','POST',{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'},JSON.stringify({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'legacy-fixture',version:'1'}}}));assert.equal(legacy.status,200);assert(legacy.text.includes(pkg.version));
assert.equal((await call('/mcp','POST',{...headers,host:'foreign.example'},body)).status,421);
assert.equal((await call('/mcp','POST',{...headers,authorization:'Bearer PRIVATE_FIXTURE'},body)).status,403);
const failed=await call('/mcp','POST',{...headers,'mcp-method':'tools/call','mcp-name':'kiln_render'},JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{_meta:meta,name:'kiln_render',arguments:{code:'function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}'}}}));assert.equal(failed.status,200);const failure=JSON.parse(failed.text).result;assert.equal(failure.isError,true);assert(!failure.content.some(x=>x.type==='image'));
// Trusted fixed fixture tests the installed protocol adapter, not VM isolation.
const {loadContainerMcpRuntime}=await import('/opt/kiln/native-mcp.mjs');
const {evaluateEvaluatorRequestV2}=await import('/opt/kiln/node_modules/@instruktlabs/kiln/lib/evaluator/index.js');
const fixtureSource='function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}';
const fixtureImage='sha256:'+'a'.repeat(64);
const fixtureTransport=withIdentity=>async request=>{const input=await request.text();assert.equal(JSON.parse(input).code,fixtureSource);return new Response(await evaluateEvaluatorRequestV2(input),{headers:withIdentity?{'x-kiln-execution-image':fixtureImage}:{}});};
const qualified=await loadContainerMcpRuntime({fetch:fixtureTransport(true)});
const evaluated=await qualified.evaluatorPort.render(fixtureSource);
assert.equal(qualified.evaluatorPort.executionImage(evaluated),fixtureImage);
assert.equal(qualified.evaluatorPort.executionImage({...evaluated}),undefined);
const unqualified=await loadContainerMcpRuntime({fetch:fixtureTransport(false)});
await assert.rejects(unqualified.evaluatorPort.render(fixtureSource),error=>error.code==='WORKER_FAILED');
console.log(JSON.stringify({version:pkg.version,archiveSha256:hash(await readFile('/opt/kiln/candidate.tgz')),tools:names,checks:['ready','modern-tool-catalog','material-binding-schema','material-presets-from-installed-package','legacy-initialize','foreign-host-denied','credentials-denied','missing-private-services-fail-closed','controller-image-bound-to-installed-evaluation','missing-controller-image-denied'],bundleSha256:Object.fromEntries(await Promise.all(['native-host.mjs','native-mcp.mjs','serve.mjs'].map(async name=>[name,hash(await readFile('/opt/kiln/'+name))])))}));
`;

try {
  receipt.imageIdentity = JSON.parse(
    await docker([
      'image',
      'inspect',
      image,
      '--format',
      '{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"user":{{json .Config.User}}}',
    ]),
  );
  assert.equal(receipt.imageIdentity.os, 'linux');
  assert.equal(receipt.imageIdentity.architecture, 'amd64');
  assert.equal(receipt.imageIdentity.user, 'node');
  await docker([
    'create',
    '--name',
    name,
    '--network',
    'none',
    '--cpus',
    '1',
    '--memory',
    '1g',
    '--memory-swap',
    '1g',
    '--pids-limit',
    '128',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--env',
    'KILN_PUBLIC_ORIGIN=https://kiln.example.com',
    image,
  ]);
  await docker(['start', name]);
  assert.equal(
    (await docker(['inspect', name, '--format', '{{.Image}}'])).trim(),
    receipt.imageIdentity.id,
  );
  receipt.result = JSON.parse(
    await docker(['exec', '-i', '--user', '1000:1000', name, 'node', '--input-type=module'], check),
  );
  assert.equal(receipt.result.version, published.version);
  assert.equal(receipt.result.archiveSha256, published.sha256);
  for (const file of ['package-lock.json', 'os-packages.txt', 'node-version.txt'])
    await docker(['cp', `${name}:/opt/kiln/${file}`, join(output, file)]);
  receipt.lockSha256 = createHash('sha256')
    .update(await readFile(join(output, 'package-lock.json')))
    .digest('hex');
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  process.exitCode = 1;
} finally {
  try {
    await docker(['rm', '--force', name]);
    receipt.removed = true;
  } catch (error) {
    receipt.cleanupError = error.message;
    receipt.status = 'failed';
    process.exitCode = 1;
  }
  await writeFile(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}
console.log(JSON.stringify(receipt, null, 2));
