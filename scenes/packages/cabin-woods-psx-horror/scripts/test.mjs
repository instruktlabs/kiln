import {readdirSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const tests=readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
if(!tests.length)throw Error('No portable scene tests found.');
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status??1;
