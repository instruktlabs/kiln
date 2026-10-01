import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const baseline=JSON.parse(await readFile('evidence/m1/bundle-baseline.json','utf8'));
const current=JSON.parse(await readFile('evidence/m1/bundle-public.json','utf8'));
assert.equal(baseline.budget.maximumBytes,Math.ceil(baseline.measurement.totalBytes*1.1));
assert.equal(baseline.budget.maximumGzipBytes,Math.ceil(baseline.measurement.totalGzipBytes*1.1));
const result={decision:'D-15',current:{bytes:current.totalBytes,gzipBytes:current.totalGzipBytes},maximum:baseline.budget,
  pass:current.totalBytes<=baseline.budget.maximumBytes&&current.totalGzipBytes<=baseline.budget.maximumGzipBytes};
await writeFile('evidence/m1/bundle-budget-check.json',JSON.stringify(result,null,2)+'\n');
assert(result.pass,'Public demo exceeds its recorded D-15 budget');console.log(JSON.stringify(result));
