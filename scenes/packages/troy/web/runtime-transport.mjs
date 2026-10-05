const DEFAULT_LIMIT=64*1024*1024;
const digest=async bytes=>'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const relative=path=>typeof path==='string'&&path.length>0&&!path.startsWith('/')&&!path.includes('\\')&&!path.includes('?')&&!path.includes('#')&&!path.includes(':')&&path.split('/').every(p=>p!=='.'&&p!=='..'&&p.length>0)&&decodeURIComponent(path)===path;
async function bounded(stream,limit,label,signal){
 const reader=stream.getReader(),chunks=[];let size=0;
 const abort=()=>{reader.cancel(signal.reason).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{if(signal?.aborted)throw signal.reason;while(true){const {done,value}=await reader.read();if(signal?.aborted)throw signal.reason;if(done)break;size+=value.byteLength;if(size>limit)throw Error(label+' byte limit');chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes.buffer;}
 catch(error){await reader.cancel(error).catch(()=>{});throw error;}finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}
// Transport is a delivery derivative. All consumers still receive and verify the
// original bank bytes, so clips, bounds and source manifests remain unchanged.
export function createRuntimeReader({base,fetch:request=globalThis.fetch,manifest=undefined,concurrency=4,maxBytes=DEFAULT_LIMIT,decode=typeof DecompressionStream==='function'?stream=>stream.pipeThrough(new DecompressionStream('gzip')):null}={}){
 base=new URL(base);if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid runtime reader limits');
 const controller=new AbortController(),queue=[],cache=new Map();let active=0,closed=false,retain=true,manifestPromise;
 const signal=controller.signal;
 const pump=()=>{while(!closed&&active<concurrency&&queue.length){const job=queue.shift();active++;Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{active--;pump();});}};
 const schedule=run=>new Promise((resolve,reject)=>{if(closed)return reject(signal.reason);queue.push({run,resolve,reject});pump();});
 const readResponse=async(url,limit,label,entry)=>{const response=await request(url,{signal});if(!response.ok)throw Error('Missing runtime payload '+url);const httpGzip=entry?.encoding==='gzip'&&(response.headers.get('Content-Encoding')??'').split(',').some(value=>['gzip','x-gzip'].includes(value.trim().toLowerCase()));if(httpGzip){limit=Math.max(limit,entry.decodedBytes);label='Decoded payload';}const length=Number(response.headers.get('Content-Length'));if(length>limit){await response.body?.cancel().catch(()=>{});throw Error(label+' byte limit');}if(!response.body)throw Error('Empty runtime response '+url);return {bytes:await bounded(response.body,limit,label,signal),httpGzip};};
 const validate=record=>{if(record===null)return null;if(record?.schema!=='troy.runtime-transport/1'||!record.files||Array.isArray(record.files)||Object.keys(record.files).length>1024)throw Error('Invalid transport manifest');for(const [path,entry]of Object.entries(record.files)){if(!relative(path)||!relative(entry.file)||!['gzip','identity'].includes(entry.encoding)||![entry.bytes,entry.decodedBytes].every(n=>Number.isSafeInteger(n)&&n>0&&n<=maxBytes)||![entry.sha256,entry.decodedSha256].every(hash=>/^sha256:[a-f0-9]{64}$/.test(hash)))throw Error('Invalid transport manifest entry '+path);}return record;};
 const inventory=()=>manifestPromise??=Promise.resolve().then(async()=>{if(manifest!==undefined)return validate(manifest);const response=await request(new URL('transport.json',base),{signal});if(response.status===404)return null;if(!response.ok)throw Error('Missing transport manifest');return validate(JSON.parse(new TextDecoder().decode(await bounded(response.body,1024*1024,'Transport manifest',signal))));});
 async function read(path){
  if(closed)throw signal.reason;const url=new URL(path,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw Error('Runtime payload outside scene');const key=url.pathname.slice(base.pathname.length),record=await inventory(),entry=record&&Object.hasOwn(record.files,key)?record.files[key]:null;
  const cacheKey=entry?.decodedSha256??url.href;
  if(retain&&cache.has(cacheKey))return cache.get(cacheKey);
  const pending=schedule(async()=>{if(signal.aborted)throw signal.reason;if(!entry)return (await readResponse(url,maxBytes,'Runtime payload')).bytes;
   const canDecode=entry.encoding==='identity'||decode!==null,target=canDecode?new URL(entry.file,base):url,limit=canDecode?entry.bytes:entry.decodedBytes;
   const response=await readResponse(target,limit,canDecode?'Transport payload':'Decoded payload',canDecode?entry:null);let bytes=response.bytes;
   if(canDecode){const sealedTransport=bytes.byteLength===entry.bytes&&await digest(bytes)===entry.sha256;
    // HTTP decoding makes wire bytes unavailable. A retained inner gzip must
    // still match its transport seal; an exposed original must match its exact
    // decoded seal below. Headers alone never accept a payload.
    if(sealedTransport){if(entry.encoding==='gzip')bytes=await bounded(decode(new Blob([bytes]).stream()),entry.decodedBytes,'Decoded payload',signal);}
    else if(!response.httpGzip){if(bytes.byteLength!==entry.bytes)throw Error('Transport size mismatch');throw Error('Transport hash mismatch');}
   }
   if(bytes.byteLength!==entry.decodedBytes)throw Error('Decoded size mismatch');if(await digest(bytes)!==entry.decodedSha256)throw Error('Decoded hash mismatch');if(signal.aborted)throw signal.reason;return bytes;
  });
  if(retain){cache.set(cacheKey,pending);pending.catch(()=>{if(cache.get(cacheKey)===pending)cache.delete(cacheKey);});}return pending;
 }
 return {read,release(){retain=false;cache.clear();},close(){if(closed)return;closed=true;controller.abort(Error('Runtime reader closed'));for(const job of queue.splice(0))job.reject(signal.reason);cache.clear();},stats:()=>({active,queued:queue.length,cached:cache.size,closed})};
}
let shared;
export function runtimeReader(){return shared??=createRuntimeReader({base:new URL('./',import.meta.url),manifest:typeof location==='undefined'?null:undefined});}
export const readRuntimeBytes=url=>runtimeReader().read(url);
