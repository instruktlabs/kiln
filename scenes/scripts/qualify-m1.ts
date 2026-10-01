import {readFile,writeFile,access} from 'node:fs/promises';
import assert from 'node:assert/strict';

const paths=process.argv.slice(2);
assert.equal(paths.length,2,'Supply the two fresh-profile contract reports');
const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const required=['B-01','B-02','B-03','B-04','B-05','B-11','B-12','B-15'];
const reports=await Promise.all(paths.map(read));
const profiles=reports.map((report,index)=>{
  const latest=new Map<string,any>(report.results.map((entry:any)=>[entry.id,entry]));
  for(const id of required)assert.equal(latest.get(id)?.status,'pass',`${paths[index]} ${id} must pass`);
  assert(report.ledger.browserClosed&&report.ledger.serversClosed,'Owned resources must be closed');
  const leak=latest.get('B-05').details;
  assert.equal(leak.cycles.length,10);assert.equal(leak.trend.cycles.length,10);
  assert(leak.afterBytes<leak.beforeBytes*1.05);
  assert.equal(latest.get('B-12').details.publicAxeViolations.length,0);
  assert.equal(typeof report.ledger.browserProfile,'string');
  return {evidence:paths[index],browserPid:report.ledger.browserPid,browserProfile:report.ledger.browserProfile,checks:required,
    beforeBytes:leak.beforeBytes,afterBytes:leak.afterBytes,measuredGrowthBytes:leak.afterBytes-leak.beforeBytes,
    measuredGrowthPercent:100*(leak.afterBytes/leak.beforeBytes-1),trend:leak.trend};
});
assert.notEqual(profiles[0]!.browserProfile,profiles[1]!.browserProfile,'Use separate freshly-created Chrome profiles');
const cold=await read('evidence/m1/cold-listeners-c03/results.json');assert.equal(cold.status,'pass');
const exports=await read('evidence/m1/export-audit.json');
assert.deepEqual(exports.missing,[]);
const consumer=await read('evidence/m1/site-compat.json');assert.equal(consumer.typecheck,'pass');assert.equal(consumer.threeCopies,1);
const budget=await read('evidence/m1/bundle-budget-check.json');assert.equal(budget.pass,true);
for(const mode of ['standalone','test','dev'])await access(`packages/scene-kit/dist/${mode}/index.html`);
const units=await readFile('evidence/m1/validation/unit-round3.log','utf8');assert(/\b0 fail\b/.test(units));
const result={date:new Date().toISOString(),milestone:'M1',status:'pass',profiles,
  requiredChecks:required,unitEvidence:'evidence/m1/validation/unit-round3.log',exports:'evidence/m1/export-audit.json',
  coldListenerEvidence:'evidence/m1/cold-listeners-c03/results.json',sourceConsumer:'evidence/m1/site-compat.json',
  bundleBudget:'evidence/m1/bundle-budget-check.json',knownExceptions:['C-03 React DOM selectionchange','Z4 startup-only DPR'],
  farmNotStarted:true,trendFindings:profiles.filter(p=>p.trend.investigateBeforeM4).map(p=>p.evidence)};
await writeFile('evidence/m1/qualification-round3.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,profiles:profiles.map(({evidence,measuredGrowthPercent,trend})=>({evidence,measuredGrowthPercent,trendGrowthBytes:trend.growthBytes,investigateBeforeM4:trend.investigateBeforeM4}))}));
