import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const source=new URL('../../scene-kit/src/renderer/three-runtime.ts',import.meta.url),destination=new URL('../shared/three-runtime.ts',import.meta.url);
const bytes=await fs.readFile(source);await fs.mkdir(new URL('../shared/',import.meta.url),{recursive:true});await fs.writeFile(destination,bytes);
console.log(JSON.stringify({source:'scene-kit/src/renderer/three-runtime.ts',snapshot:fileURLToPath(destination),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
