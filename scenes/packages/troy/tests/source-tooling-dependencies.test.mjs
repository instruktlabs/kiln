import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Troy declares its source parser without relying on the engine root install',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
 assert.equal(manifest.devDependencies.acorn,'8.18.0');
 const bundler=await readFile(new URL('../scripts/bundle-scene.mjs',import.meta.url),'utf8');
 assert.match(bundler,/import\s*\{\s*parse\s*\}\s*from\s*['"]acorn['"]/);
 assert.doesNotMatch(bundler,/parserRootArg|createRequire/);
});
