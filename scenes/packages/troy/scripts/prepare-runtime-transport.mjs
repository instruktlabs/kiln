import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {resolve,relative,join,extname} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
// Generate delivery companions after staging. Original files remain portable
// fallback inputs and are never rewritten, so existing exact bank manifests work.
export async function prepareRuntimeTransport(web){
 web=resolve(web);const files=[],inventory={schema:'troy.runtime-transport/1',files:{}},seen=new Map();
 async function visit(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(item.isSymbolicLink())throw Error('Runtime transport refuses symlinks');const path=join(dir,item.name);if(item.isDirectory()){if(item.name!=='vendor')await visit(path);}else if(['.bin','.glb'].includes(extname(path)))files.push(path);}}
 await visit(web);let sourceBytes=0,transportBytes=0,duplicates=0;
 for(const file of files.sort()){const size=(await stat(file)).size;if(size>64*1024*1024)throw Error('Runtime file exceeds byte limit');const key=relative(web,file).replaceAll('\\','/'),bytes=await readFile(file),identity=hash(bytes);let entry=seen.get(identity);
  if(entry){inventory.files[key]=entry;duplicates++;continue;}
  let encoded=bytes,encoding='identity',path=key;
  if(extname(file)==='.bin'&&size>=65536){const compressed=gzipSync(bytes,{level:9});if(compressed.byteLength<size*.9){encoded=compressed;encoding='gzip';path=key+'.gz';await writeFile(resolve(web,path),encoded);}}
  entry={file:path,encoding,bytes:encoded.byteLength,sha256:hash(encoded),decodedBytes:size,decodedSha256:identity};seen.set(identity,entry);inventory.files[key]=entry;sourceBytes+=size;transportBytes+=encoded.byteLength;
 }
 await writeFile(resolve(web,'transport.json'),JSON.stringify(inventory,null,2)+'\n');return {files:files.length,unique:seen.size,duplicates,sourceBytes,transportBytes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const web=process.argv[2];if(!web)throw Error('Usage: node prepare-runtime-transport.mjs STAGED_WEB_DIRECTORY');console.log(JSON.stringify(await prepareRuntimeTransport(web)));}
