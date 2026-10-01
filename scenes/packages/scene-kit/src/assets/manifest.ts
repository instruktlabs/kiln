import { SceneError } from '../contract/core';
export interface PackFile {path:string;bytes:number;sha256:string}
export interface CreditEntry {name:string;licence:string;holder?:string;source?:string;note?:string}
export interface PackCell {id:string;center:[number,number,number];radius:number;files:string[];zone?:string}
export interface PackManifest {schema:'kiln.scene-pack/1';id:string;release:string;three:string;models:{id:string;path:string}[];data:Record<string,string>;files:PackFile[];credits?:CreditEntry[];cells?:PackCell[]}
/** Relative pack paths are deliberately stricter than general URL references. */
export function assertPackPath(path:string):void {
 if(typeof path!=='string'||!path||/[\\:#?\x00-\x1f]/.test(path)||path.startsWith('/'))throw new SceneError('pack-invalid',`Invalid pack path: ${String(path)}`);
 let decoded=path;for(let i=0;i<4;i++){let next:string;try{next=decodeURIComponent(decoded);}catch{throw new SceneError('pack-invalid',`Invalid pack path: ${path}`);}if(next===decoded)break;decoded=next;}
 if(/[\\:#?\x00-\x1f]/.test(decoded)||decoded.split('/').some(p=>!p||p==='.'||p==='..'))throw new SceneError('pack-invalid',`Invalid pack path: ${path}`);
}
export function resolveAssetUrl(assetBase:string,path:string,baseURI=globalThis.document?.baseURI??'http://localhost/'):URL {
 assertPackPath(path);const base=new URL(assetBase,baseURI);base.pathname=base.pathname.replace(/\/*$/,'/');base.search='';base.hash='';const result=new URL(path,base);if(result.origin!==base.origin||!result.pathname.startsWith(base.pathname))throw new SceneError('pack-invalid',`Asset outside pack: ${path}`);return result;
}
export function validateManifest(value:unknown):PackManifest {
 const fail=(s:string):never=>{throw new SceneError('pack-invalid',`Invalid pack.json: ${s}`);};
 if(!value||typeof value!=='object')fail('object required');const p=value as PackManifest;
 if(p.schema!=='kiln.scene-pack/1'||typeof p.id!=='string'||!p.id||typeof p.release!=='string'||typeof p.three!=='string'||!Array.isArray(p.models)||!Array.isArray(p.files)||!p.data||typeof p.data!=='object'||Array.isArray(p.data))fail('schema or required fields');
 const files=new Set<string>();for(const f of p.files){if(!f||typeof f.path!=='string')fail('file path');assertPackPath(f.path);if(files.has(f.path))fail(`duplicate ${f.path}`);if(!Number.isSafeInteger(f.bytes)||f.bytes<0||!(/^[0-9a-f]{64}$/).test(f.sha256))fail(f.path);files.add(f.path);}
 const ref=(path:string)=>{assertPackPath(path);if(!files.has(path))fail(`missing file ${path}`);};const ids=new Set<string>();for(const m of p.models){if(!m||typeof m.id!=='string'||!m.id||ids.has(m.id))fail('model id');ids.add(m.id);ref(m.path);}for(const path of Object.values(p.data))ref(path);
 if(p.credits!==undefined){if(!Array.isArray(p.credits))fail('credits');for(const c of p.credits)if(!c||typeof c.name!=='string'||typeof c.licence!=='string')fail('credit entry');}
 if(p.cells!==undefined){if(!Array.isArray(p.cells))fail('cells');const cells=new Set<string>();for(const c of p.cells){if(!c||typeof c.id!=='string'||cells.has(c.id)||!Array.isArray(c.center)||c.center.length!==3||!c.center.every(Number.isFinite)||!Number.isFinite(c.radius)||c.radius<0||!Array.isArray(c.files))fail('cell entry');cells.add(c.id);for(const path of c.files)ref(path);}}
 return p;
}
