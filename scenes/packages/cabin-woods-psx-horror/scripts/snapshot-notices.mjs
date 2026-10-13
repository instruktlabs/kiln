import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const receipt=JSON.parse(await fs.readFile(path.join(root,'dist/bundle-receipt.json'),'utf8'));
const dependencies={...receipt.dependencies,fflate:'0.8.3',vite:'8.3.2'};
const resolvers=[require,...['react','react-dom','@react-three/fiber','vite','fflate'].map(name=>createRequire(require.resolve(name)))];
let output='Cabin in the Woods: PSX Horror\nThird-party software notices\n\nScene source retains its accompanying MIT LICENSE. Runtime bundled dependencies and standalone build/hydration tools are listed below. Asset content retains the separately supplied asset licence.\n';
for(const [name,version] of Object.entries(dependencies).sort()){
 let resolved;for(const resolver of resolvers){try{resolved=resolver.resolve(name);break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
 if(!resolved)throw Error('Missing resolved bundle dependency: '+name);
 let directory=path.dirname(resolved),manifest;
 while(directory!==path.dirname(directory)){try{const candidate=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8'));if(candidate.name===name){manifest=candidate;break;}}catch(error){if(error.code!=='ENOENT')throw error;}directory=path.dirname(directory);}
 if(!manifest||manifest.version!==version)throw Error('Notice identity differs from bundle: '+name);
 const names=(await fs.readdir(directory,{withFileTypes:true})).filter(e=>e.isFile()&&/^(?:licen[cs]e|copying|notice)(?:\.|-|$)/i.test(e.name)).map(e=>e.name).sort();
 output+=`\n===== ${name}@${version} (${typeof manifest.license==='string'?manifest.license:'see licence'}) =====\n`;
 if(!names.length){if(typeof manifest.license!=='string')throw Error('Missing actual dependency licence declaration: '+name);output+=`\nLicense declared in the installed package.json: ${manifest.license}. This package archive does not contain a separate LICENSE/COPYING/NOTICE file.\nSource: ${typeof manifest.repository==='string'?manifest.repository:manifest.repository?.url??manifest.homepage??name}\n`;}
 for(const file of names)output+='\n'+await fs.readFile(path.join(directory,file),'utf8')+'\n';
}
await fs.writeFile(path.join(root,'THIRD-PARTY-NOTICES.txt'),output);
console.log(JSON.stringify({packages:Object.keys(dependencies).length,bytes:Buffer.byteLength(output)}));
