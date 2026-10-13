import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {bundleReceipt} from './scripts/bundle-receipt.mjs';
const maintainedFacade=new URL('../scene-kit/src/renderer/three-runtime.ts',import.meta.url);
const portableFacade=new URL('./shared/three-runtime.ts',import.meta.url);
export default defineConfig({
 base:'./',
 plugins:[bundleReceipt()],
 publicDir:'.runtime',
 server:{host:'127.0.0.1',port:4431,strictPort:true},
 resolve:{alias:[{find:/^three$/,replacement:fileURLToPath(existsSync(maintainedFacade)?maintainedFacade:portableFacade)}],dedupe:['three','react','react-dom','@react-three/fiber']},
 build:{outDir:'dist',rolldownOptions:{input:{game:'game.html'}}}
});
