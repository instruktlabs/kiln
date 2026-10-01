import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// M1 bookkeeping only. Qualification must finish before this script writes anything.
const workspace = resolve(import.meta.dir, '..');
const qualificationPath = 'evidence/m1/qualification-round3.json';
const readJson = async (path: string) => JSON.parse(await readFile(resolve(workspace, path), 'utf8'));
const qualification = await readJson(qualificationPath);
assert.equal(qualification.status, 'pass', 'Round-3 qualification must pass before updating acceptance');
assert.equal(qualification.milestone, 'M1');
assert.equal(qualification.profiles?.length, 2, 'Two fresh-profile reports are required');
const reportPaths: string[] = qualification.profiles.map((profile: any) => {
  assert.equal(typeof profile.evidence, 'string');
  assert(/^evidence\/m1\/[a-z0-9-]+\/browser-results\.json$/.test(profile.evidence), 'Use a workspace M1 contract report');
  return profile.evidence;
});
assert.equal(new Set(reportPaths).size, 2, 'Qualification must reference two distinct reports');
const requiredBrowser = ['B-01', 'B-02', 'B-03', 'B-04', 'B-05', 'B-11', 'B-12', 'B-15'];
const reports = await Promise.all(reportPaths.map(readJson));
for (const [index, report] of reports.entries()) {
  const last = new Map<string, any>(report.results.map((check: any) => [check.id, check]));
  for (const id of requiredBrowser) assert.equal(last.get(id)?.status, 'pass', `${reportPaths[index]}: ${id} must pass`);
  assert(report.ledger.browserClosed && report.ledger.serversClosed, 'Every qualifying report must close its owned resources');
  assert.equal(report.ledger.browserProfile, qualification.profiles[index].browserProfile, 'Qualified browser profile must match its report');
}
assert.notEqual(reports[0].ledger.browserProfile, reports[1].ledger.browserProfile, 'Separate fresh browser profiles are required');

const path = 'evidence/acceptance-matrix.json';
const matrix = await readJson(path);
const units = new Set(['U-01', 'U-01b', 'U-02', 'U-03', 'U-04', 'U-09', 'U-10', 'U-12', 'U-13', 'U-15', 'U-16', 'U-17', 'U-17b', 'U-20', 'U-21', 'U-23', 'U-24', 'U-25', 'U-26', 'U-27', 'U-28', 'U-29']);

// A new accepted protocol does not turn earlier cold/raw-heap measurements or
// the original listener rule into passing runs. Preserve the previous results.
matrix.historicalResults ??= [];
for (const check of matrix.checks) {
  if (!['B-05', 'B-15', 'X-03'].includes(check.id) || check.status !== 'fail') continue;
  if (!matrix.historicalResults.some((prior: any) => prior.id === check.id && prior.evidence === check.evidence && prior.reason === check.reason)) {
    matrix.historicalResults.push({ id: check.id, status: check.status, reason: check.reason, evidence: check.evidence,
      scope: 'Historical round-2 result; original evidence remains unchanged', supersededForCurrentDemoGateBy: qualificationPath });
  }
}
matrix.historicalColdEvidence = {
  status: 'fail-under-original-protocol',
  reason: 'Cold/raw heap growth and the original document-listener failure remain recorded. C-03 bounds the React DOM exception; C-04 separately qualifies the fixed initialized protocol.',
  evidence: ['evidence/m1/browser-auto/browser-results.json', 'evidence/m1/b05-fixed-baseline/counts.json', 'evidence/m1/cold-listeners/results.json'],
};

for (const check of matrix.checks) {
  if (check.id.startsWith('P-') && check.id !== 'P-28') {
    check.status = 'deferred'; check.reason = 'Farm implementation and parity evidence remain required after M1; no Farm parity claim yet'; check.evidence = 'PROGRESS.md';
  }
  if (units.has(check.id)) {
    check.status = 'pass'; check.reason = 'Executed deterministic M1 kit coverage; Farm-specific integration remains in its parity ids'; check.evidence = 'evidence/m1/unit-coverage.md';
  }
  if (check.id === 'U-18') {
    check.status = 'deferred'; check.reason = 'M1 HUD-store behavior passes; Farm string-table completeness remains required in M2'; check.evidence = 'evidence/m1/unit-coverage.md'; check.m1 = 'pass';
  }
  if (requiredBrowser.includes(check.id)) {
    check.status = 'pass'; check.scope = 'kit-demo'; check.evidence = qualificationPath; check.evidenceReports = reportPaths;
    check.reason = 'Kit demo contract check passes in two fresh profiles; Farm release coverage remains required';
  }
  if (check.id === 'B-05') check.reason = 'Demo teardown passes the C-03 bounded-listener assertions and C-04 fixed initialized heap gate in two fresh profiles; Farm teardown remains required; cold failures are retained separately';
  if (check.id === 'B-15') check.reason = 'Complete M1 demo features and shared contract suite pass on WebGPU and forced WebGL2; Farm acceptance remains separate';
  if (check.id === 'B-14') {
    check.status = 'deferred'; check.reason = 'Demo source consumer passes TypeScript 6.0.3 and one-three bundle assertion; Farm consumer remains required'; check.evidence = 'evidence/m1/site-compat.json';
  }
  if (check.id === 'X-03') {
    check.status = 'pass'; check.scope = 'kit-demo'; check.evidence = qualificationPath; check.evidenceReports = reportPaths;
    check.reason = 'Demo B-05 count/heap gate passes in two fresh profiles under C-03/C-04; third-block trends are recorded separately and Farm leak qualification remains required';
  }
  if (check.status === 'deferred' && check.reason === 'Preflight stop; implementation and checks not started') {
    check.reason = 'Deferred until the preceding milestone passes'; check.evidence = 'PROGRESS.md';
  }
}
matrix.date = qualification.date.slice(0, 10);
matrix.m1Qualification = qualificationPath;
matrix.trendFindings = qualification.trendFindings ?? [];
matrix.summary = {};
for (const family of ['P', 'U', 'B', 'X']) {
  const counts = { pass: 0, fail: 0, deferred: 0 };
  for (const check of matrix.checks) if (check.id.startsWith(family + '-')) counts[check.status as keyof typeof counts]++;
  matrix.summary[family] = counts;
}
await writeFile(resolve(workspace, path), JSON.stringify(matrix, null, 2) + '\n');
console.log(JSON.stringify(matrix.summary));
