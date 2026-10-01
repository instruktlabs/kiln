import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetPath, hashBytes, verifyBytes, archiveProfile, verifyArchive } from './mirror-core.mjs';
import { headersFor, parseHeaderRules } from './static-validation-core.mjs';
const PREFIX = '/_review/files/';
const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.xml':'application/xml','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.woff2':'font/woff2','.glb':'model/gltf-binary','.zip':'application/zip','.gz':'application/gzip' };
/** A local HTTP adapter: original build files remain untouched; only CDN download anchor hrefs change. */
export async function createLocalReview({ dist, mirror, manifest }) {
  const artifactBytes = await readFile(join(dist,'artifact-files.json'));
  const infoBytes = await readFile(join(dist,'build-info.json'));
  const info = JSON.parse(infoBytes);
  if (hashBytes(artifactBytes) !== info.artifacts.sha256) throw new Error('Build artifact receipt differs from build-info');
  const artifacts = new Map(JSON.parse(artifactBytes).map(file => [assetPath(file.path),file]));
  const pins = new Map(manifest.files.map(file => [assetPath(file.path),file]));
  const downloads = new Map(); const rendered = new Map(); const html = [];
  const requestedDownloads = new Set(); const members = new Map(); const archives = new Map();
  const origin = new URL(manifest.base);
  for (const [path, pin] of artifacts) if(path.endsWith('.html')) {
    const bytes = verifyBytes(await readFile(join(dist,path)),pin);
    let links=0;
    const text=bytes.toString('utf8').replace(/(<a\b[^>]*\bhref=)(["'])([^"']+)\2/gi,(match,start,quote,href)=>{
      if (!href.startsWith(manifest.base)) return match;
      const url=new URL(href.replaceAll('&amp;','&')); if(url.origin!==origin.origin) return match;
      const file=assetPath(decodeURIComponent(url.pathname.slice(origin.pathname.length)));
      requestedDownloads.add(file); links++;
      return `${start}${quote}${PREFIX}${file}${url.search}${url.hash}${quote}`;
    });
    if(links) { const local=Buffer.from(text); rendered.set(path,local); html.push({path,originalSha256:pin.sha256,localSha256:hashBytes(local),downloadLinks:links}); }
  }
  for (const path of requestedDownloads) {
    const loose=pins.get(path);
    if(loose) { verifyBytes(await readFile(join(mirror,path)),loose); downloads.set(path,loose); continue; }
    // Some public model URLs are sealed members of a delivery archive, not loose mirror files.
    // Derive their pins from the verified inventory; never trust a basename or extract to disk.
    for(const [archivePath,archivePin] of pins) {
      const prefix=archivePath.slice(0,archivePath.lastIndexOf('/')+1);
      if(!archivePath.endsWith('.zip')||!path.startsWith(prefix))continue;
      if(!archives.has(archivePath)) archives.set(archivePath,verifyArchive(verifyBytes(await readFile(join(mirror,archivePath)),archivePin),archiveProfile(archivePath)));
      const archive=archives.get(archivePath); const member=path.slice(prefix.length);
      const seal=archive.manifest.files[member]; if(!seal)continue;
      const pin={path,bytes:seal.bytes,sha256:seal.sha256,archive:archivePath,member:`${archive.prefix}${member}`,archiveSha256:archivePin.sha256};
      const bytes=Buffer.from(verifyBytes(archive.files[pin.member],pin));
      const previous=downloads.get(path);
      if(previous && (previous.bytes!==pin.bytes||previous.sha256!==pin.sha256))throw new Error(`Ambiguous sealed archive download: ${path}`);
      if(!previous){downloads.set(path,pin);members.set(path,bytes);}
    }
    if(!downloads.has(path))throw new Error(`Download has no mirror pin or sealed archive member: ${path}`);
  }
  for (const [path,bytes] of [['artifact-files.json',artifactBytes],['build-info.json',infoBytes]]) artifacts.set(path,{path,bytes:bytes.length,sha256:hashBytes(bytes)});
  const headers=parseHeaderRules(await readFile(join(dist,'_headers'),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;}));
  const receipt={schema:'kiln.local-review/1',productionArtifactSha256:info.artifacts.sha256,productionBuild:info,transform:'Only anchor hrefs under the declared asset CDN base map to /_review/files/. All other build bytes and original files remain unchanged. Every requested build/download file is verified against its pin.',assetBase:manifest.base,localAssetBase:PREFIX,downloads:[...downloads.values()].sort((a,b)=>a.path.localeCompare(b.path)),html};
  const receiptBytes=Buffer.from(`${JSON.stringify(receipt,null,2)}\n`);
  const index=Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kiln local review files</title><style>body{max-width:60rem;margin:2rem auto;padding:1rem;font:18px/1.5 system-ui}a{overflow-wrap:anywhere}li{margin:1rem 0}</style><h1>Local review files</h1><p><a href="/">Open the site</a> · <a href="/_review/receipt.json">Read the exact build and download receipt</a></p><p>This local adapter maps the site's download links to verified local files. It does not upload or change the production build. The current build was made ${escape(info.builtAt)}.</p><p>Production artifact SHA-256: <code>${escape(info.artifacts.sha256)}</code></p><h2>${downloads.size} verified downloads</h2><ul>${[...downloads.values()].map(pin=>`<li><a href="${PREFIX}${escape(pin.path)}">${escape(pin.path)}</a> (${pin.bytes.toLocaleString('en-US')} bytes)<br><code>${pin.sha256}</code></li>`).join('')}</ul></html>`);
  const handler=async(req,res)=>{
    const send=(status,bytes,type='text/plain; charset=utf-8',extra={})=>{res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store',...extra});res.end(req.method==='HEAD'?undefined:bytes);};
    if(!['GET','HEAD'].includes(req.method))return send(405,Buffer.from('Read-only local review server'),undefined,{Allow:'GET, HEAD'});
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname==='/_review/'||pathname==='/_review')return send(200,index,'text/html; charset=utf-8');
      if(pathname==='/_review/receipt.json')return send(200,receiptBytes,'application/json; charset=utf-8');
      const download=pathname.startsWith(PREFIX);
      let path=assetPath(pathname.slice(download?PREFIX.length:1)||'index.html');
      if(!download && path.endsWith('/'))path+='index.html';
      const pin=(download?downloads:artifacts).get(path);
      if(!pin)return send(404,Buffer.from('File is not part of this reviewed build'));
      let bytes;
      if(download && pin.member) {
        verifyBytes(await readFile(join(mirror,pin.archive)),pins.get(pin.archive));
        bytes=verifyBytes(members.get(path),pin);
      } else bytes=verifyBytes(await readFile(join(download?mirror:dist,path)),pin);
      const body=download?bytes:rendered.get(path)??bytes;
      const type=MIME[extname(path)]??(path.endsWith('SHA256SUMS')?'text/plain; charset=utf-8':'application/octet-stream');
      send(200,body,type,{...headersFor(headers,pathname),'Cache-Control':'no-store','X-Kiln-Local-Review':download?'verified-download':rendered.has(path)?'download-links-mapped':'original-bytes'});
    } catch(error) {send(/Unsafe asset path|URI malformed/.test(String(error))?400:409,Buffer.from('Local candidate unavailable or changed; restart from a verified build.'));}
  };
  return {handler,receipt};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const option=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];};
  const dist=resolve(option('--dist','dist'));const mirror=option('--mirror',process.env.KILN_ASSET_MIRROR);if(!mirror)throw new Error('Use --mirror <verified-local-mirror>');
  const manifest=JSON.parse(await readFile(resolve(option('--manifest','src/data/mirror-manifest.json')),'utf8'));
  const review=await createLocalReview({dist,mirror:resolve(mirror),manifest});
  const receiptFile=resolve(option('--receipt','.cache/local-review/receipt.json'));await mkdir(dirname(receiptFile),{recursive:true});await writeFile(receiptFile,`${JSON.stringify(review.receipt,null,2)}\n`);
  console.log(`Verified ${review.receipt.downloads.length} local downloads; ${review.receipt.html.length} HTML pages map download links. Production artifact ${review.receipt.productionArtifactSha256}.`);
  if(!process.argv.includes('--check')){const port=Number(option('--port','4412'));const host=option('--host','127.0.0.1');createServer(review.handler).listen(port,host,()=>console.log(`Local review listening on port ${port}; entry /, files /_review/, receipt /_review/receipt.json.`));}
}
