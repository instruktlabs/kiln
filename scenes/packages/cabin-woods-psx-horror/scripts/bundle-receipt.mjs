import path from 'node:path';import fs from 'node:fs';import {createHash} from 'node:crypto';
export function bundleReceipt(){return {name:'cabin-woods-bundle-identity',generateBundle(_options,bundle){
 const ids=Object.values(bundle).flatMap(c=>c.type==='chunk'?Object.keys(c.modules):[]),roots=new Map(),deps=new Map();
 for(const id of ids){if(!id.includes('node_modules'))continue;let dir=path.dirname(id.split('?')[0]);while(dir!==path.dirname(dir)){const file=path.join(dir,'package.json');if(fs.existsSync(file)){const p=JSON.parse(fs.readFileSync(file,'utf8'));if(p.name){const set=roots.get(p.name)??new Set();set.add(dir);roots.set(p.name,set);deps.set(p.name,p.version);break;}}dir=path.dirname(dir);}}
 for(const name of ['three','react','react-dom','@react-three/fiber'])if(roots.get(name)?.size!==1)this.error(`Expected exactly one physical ${name} package.`);
 const files=Object.entries(bundle).map(([name,c])=>{const bytes=Buffer.from(c.type==='chunk'?c.code:c.source);return {path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
 this.emitFile({type:'asset',fileName:'bundle-receipt.json',source:JSON.stringify({schemaVersion:1,dependencies:Object.fromEntries([...deps].sort()),packageCopies:Object.fromEntries([...roots].map(([name,dirs])=>[name,dirs.size])),files},null,2)+'\n'});
}};}
