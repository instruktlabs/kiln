import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// These two editable modules are exact-byte inputs of the pinned 06 archer-v9
// bank. A checkout conversion broke source-first startup even though JS parsed.
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const sources={
 'archer-bank.mjs':'050ce5a28b8c7cf77a6164c23cb26511593b36a2bf5d829c53bba799b24892b5',
 'archer-bow.mjs':'7a04087c4421dcc3fa217b78f071819f91e5fb326f153024ab9f5017906f6499',
};
for(const [file,expected]of Object.entries(sources)){
 test('pinned archer bank source retains exact bytes: '+file,async()=>{
  const bytes=await readFile(new URL('../web/'+file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
 });
 test('Git retains mixed line endings for exact bank input: '+file,()=>{
  const bytes=Buffer.from('// exact identity fixture\n\r\n');
  const expected=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  const actual=execFileSync('git',['hash-object','--path=scenes/packages/troy/web/'+file,'--stdin'],{cwd:root,input:bytes,encoding:'utf8'}).trim();
  assert.equal(actual,expected,'Git clean filters must preserve the source bytes sealed into a bank');
 });
}
