import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inspectPublicText} from './public-text.mjs';

const SITE=fileURLToPath(new URL('../',import.meta.url));
export const isPublicTextFile=path=>/\.(?:html|astro|[cm]?js|jsx|ts|tsx|json|map|css|txt|md|xml|svg|wgsl|glsl|vert|frag|csv|ya?ml)$/.test(path)||['_headers','_redirects','LICENSE','NOTICE'].includes(basename(path));
// Deliberately maintained inputs only: test/negative fixtures and historical
// evidence are not public UI. Published output has no fixture exemption.
export function publicSourceRoots(repo){return [
 'site/src','scenes/packages/scene-kit/src','scenes/packages/farm/src','scenes/packages/farm/standalone',
 'scenes/packages/foundry-floor/src','scenes/packages/foundry-floor/standalone','scenes/packages/foundry-floor/standalone-campus',
 'scenes/packages/golden-gate/src','scenes/packages/golden-gate/standalone','scenes/packages/golden-gate/data','scenes/packages/golden-gate/source-data',
 'scenes/packages/troy/web',
].map(path=>resolve(repo,path));}
export async function validatePublicText({roots,base}={}){
 const files=[];async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=resolve(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()&&isPublicTextFile(file))files.push(file);}}
 for(const root of roots)await walk(root);
 const errors=[];for(const file of files.sort()){const path=relative(base,file).replaceAll('\\','/');for(const problem of inspectPublicText(await readFile(file),path))errors.push({file:path,...problem});}
 return {checked:files.length,errors};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),source=args.includes('--source'),dist=args.includes('--dist')?resolve(args[args.indexOf('--dist')+1]):resolve(SITE,'dist');
 const base=source?resolve(SITE,'..'):dist,roots=source?publicSourceRoots(base):[dist],result=await validatePublicText({roots,base});
 console.log(`Public text (${source?'maintained source':'published output'}): ${result.checked} files, ${result.errors.length} errors.`);
 for(const error of result.errors.slice(0,50))console.error(`${error.file}: ${error.kind}: ${error.context}: ${error.message}`);
 if(result.errors.length)process.exitCode=1;
}
