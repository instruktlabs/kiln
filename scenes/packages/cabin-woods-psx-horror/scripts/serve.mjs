import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url)),port=Number(process.argv[2]??4432);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\/+/, '')||'game.html';if(relative.includes('\\'))throw Error('Invalid path');const target=path.resolve(root,relative);if(!target.startsWith(path.resolve(root)+path.sep))throw Error('Invalid path');const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(port,'127.0.0.1',()=>console.log(`Cabin in the Woods: PSX Horror · http://127.0.0.1:${port}/game.html`));
