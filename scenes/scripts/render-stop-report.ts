import {readFile,writeFile,access} from 'node:fs/promises';
const matrix=JSON.parse(await readFile('evidence/acceptance-matrix.json','utf8'));
const clean=(value:string)=>value.replaceAll('|','\\|').replaceAll('\n',' ');
const summary=['| Family | Passing | Failing | Deferred |','|---|---:|---:|---:|',...Object.entries(matrix.summary).map(([id,count]:[string,any])=>`| ${id} | ${count.pass} | ${count.fail} | ${count.deferred} |`)];
const rows=['| Id | Subject | State | Reason and evidence |','|---|---|---|---|',...matrix.checks.map((c:any)=>`| ${c.id} | ${clean(c.subject)} | ${c.status} | ${clean(c.reason)}. [Evidence](${c.evidence}) |`)];
const template=await readFile('REPORT.md','utf8');
if(!template.includes('<!-- ACCEPTANCE_MATRIX -->'))throw new Error('Stop report matrix marker is missing');
const report=template.replace('<!-- ACCEPTANCE_MATRIX -->',summary.join('\n')+'\n\n[Machine-readable matrix](evidence/acceptance-matrix.json).\n\n'+rows.join('\n'));
const problems:string[]=[];
for(const match of report.matchAll(/\]\(([^)]+)\)/g))if(!match[1]!.startsWith('http'))try{await access(match[1]!);}catch{problems.push(`Missing report target: ${match[1]}`);}
const progress=await readFile('PROGRESS.md','utf8');
if(/^KIT-M1: READY/m.test(progress))problems.push('Readiness marker exists despite STOP-03');
if(new Set(matrix.checks.map((c:any)=>c.id)).size!==102)problems.push('Acceptance IDs are missing or duplicated');
if(problems.length)throw new Error(problems.join('\n'));
await writeFile('REPORT.md',report);
await writeFile('evidence/m1/report-validation.json',JSON.stringify({date:'2026-09-29',stop:'STOP-03',matrixIds:102,summary:matrix.summary,reportLinks:'all present',readinessMarker:false},null,2)+'\n');
console.log('Stop report rendered: 102 acceptance ids, all evidence links present, no readiness marker.');
