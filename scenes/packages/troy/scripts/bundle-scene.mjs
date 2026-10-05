import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative,join,sep} from 'node:path';
import {parse} from 'acorn';
import {preserveSourceModuleUrl} from './source-module-url.mjs';
const [webArg,threeArg]=process.argv.slice(2);
if(!webArg||!threeArg||typeof Bun==='undefined')throw Error('Usage: bun bundle-scene.mjs STAGED_WEB THREE_PACKAGE');
const web=await realpath(resolve(webArg)),three=await realpath(resolve(threeArg)),outdir=join(web,'bundle');await mkdir(outdir,{recursive:true});
const result=await Bun.build({entrypoints:[join(web,'main.mjs')],outdir,target:'browser',format:'esm',splitting:true,minify:true,naming:{entry:'[name].js',chunk:'[name]-[hash].js',asset:'[name]-[hash].[ext]'},plugins:[{name:'troy-source-url',setup(build){
 build.onResolve({filter:/^three(?:\/|$)/},args=>{let path;if(args.path==='three'||args.path==='three/webgpu')path=join(three,'build/three.webgpu.js');else if(args.path==='three/tsl')path=join(three,'build/three.tsl.js');else if(args.path.startsWith('three/addons/'))path=join(three,'examples/jsm',args.path.slice('three/addons/'.length));return path?{path}:undefined;});
 build.onLoad({filter:/\.(?:mjs|js)$/},async args=>{const file=await realpath(args.path);let path;if(file.startsWith(web+sep))path=relative(web,file).replaceAll('\\','/');else if(file.startsWith(three+sep))path='vendor/three/'+relative(three,file).replaceAll('\\','/');else throw Error('Unexpected browser bundle dependency '+file);return {contents:preserveSourceModuleUrl(await readFile(file,'utf8'),path,parse),loader:'js'};});
}}]});
if(!result.success)throw new AggregateError(result.logs,'Troy bundle failed');
const entry=join(outdir,'main.js');const html=await readFile(join(web,'index.html'),'utf8');if(!html.includes('src="./main.mjs"'))throw Error('Expected unbundled entry in staged index.html');await writeFile(join(web,'index.html'),html.replace('src="./main.mjs"','src="./bundle/main.js"'));
console.log(JSON.stringify({entry,outputs:result.outputs.map(x=>({path:relative(web,x.path).replaceAll('\\','/'),bytes:x.size})),totalBytes:result.outputs.reduce((n,x)=>n+x.size,0)}));
