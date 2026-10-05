import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {assetPath,ASSET_BASE,verifyBytes} from './mirror-core.mjs';

/** Offline validation of the exact bytes a viewer requests, including pinned R2 inputs. */
export async function viewerModelInput(model,{dist,mirror,records}){
 const url=new URL(model,'https://kilnstudio.tools/');url.search='';url.hash='';
 if(url.origin==='https://kilnstudio.tools')return resolve(dist,assetPath(decodeURIComponent(url.pathname).replace(/^\//,'')));
 if(url.origin!==new URL(ASSET_BASE).origin)throw Error('Unsupported external viewer origin: '+url.origin);
 const pin=records.find(record=>new URL(record.path,ASSET_BASE).href===url.href);
 if(!pin)throw Error('Unpinned external viewer model: '+url.href);
 const file=join(mirror,assetPath(pin.path));verifyBytes(await readFile(file),pin,pin.path);return file;
}
