import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

// Run once at the M1 handoff. This never creates a readiness marker or advances Farm.
const workspace = resolve(import.meta.dir, '..');
const local = (path: string) => {
  const target = resolve(workspace, path), rel = relative(workspace, target);
  assert(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), 'Report inputs must remain in the workspace');
  return target;
};
const text = (path: string) => readFile(local(path), 'utf8');
const json = async (path: string) => JSON.parse(await text(path));
const qualificationPath = 'evidence/m1/qualification-round3.json';
const qualification = await json(qualificationPath);
assert.equal(qualification.status, 'pass', 'M1 qualification must pass before REPORT changes');
assert.equal(qualification.milestone, 'M1');
assert.equal(qualification.profiles?.length, 2);
const progress = await text('PROGRESS.md');
const marker = progress.match(/^KIT-M1: READY ([^\r\n]+)$/m);
assert(marker, 'The exact KIT-M1: READY <date> line must exist before REPORT changes');
const readyDate = marker[1]!.trim();

const matrix = await json('evidence/acceptance-matrix.json');
assert.equal(matrix.m1Qualification, qualificationPath, 'Run the guarded acceptance updater first');
assert.equal(new Set(matrix.checks.map((check: any) => check.id)).size, 102);
assert.equal(matrix.checks.length, 102);
const required = ['B-01', 'B-02', 'B-03', 'B-04', 'B-05', 'B-11', 'B-12', 'B-15', 'X-03'];
for (const id of required) assert.equal(matrix.checks.find((check: any) => check.id === id)?.status, 'pass', `${id} must pass`);
const profiles = qualification.profiles as any[];
const reports = await Promise.all(profiles.map(profile => json(profile.evidence)));
for (const report of reports) {
  const latest = new Map<string, any>(report.results.map((check: any) => [check.id, check]));
  for (const id of required.filter(id => id.startsWith('B-'))) assert.equal(latest.get(id)?.status, 'pass');
  assert(report.ledger.browserClosed && report.ledger.serversClosed);
}
assert.notEqual(reports[0].ledger.browserProfile, reports[1].ledger.browserProfile);
const units = await text(qualification.unitEvidence);
const total = Number(units.match(/\b(\d+) pass\b/)?.[1]);
const assertions = Number(units.match(/\b(\d+) expect\(\) calls/)?.[1]);
const files = Number(units.match(/across (\d+) files/)?.[1]);
assert(total > 0 && assertions > 0 && files > 0 && /\b0 fail\b/.test(units), 'Current unit evidence must pass');
const exports = await json(qualification.exports);
assert.deepEqual(exports.missing, []);
const baseline = await json('evidence/m1/bundle-baseline.json');
assert.equal(baseline.measurement.totalBytes, 1415817, 'Preserve the recovered first-build baseline');
assert.equal(baseline.measurement.totalGzipBytes, 411533);
const budget = await json(qualification.bundleBudget);
assert.equal(budget.pass, true);
assert.equal(budget.maximum.maximumBytes, 1557399);
assert.equal(budget.maximum.maximumGzipBytes, 452687);
const bundles = await Promise.all(['public', 'test', 'dev'].map(mode => json(`evidence/m1/bundle-${mode}.json`)));
assert.equal(bundles[0].totalBytes, budget.current.bytes);
assert.equal(bundles[0].totalGzipBytes, budget.current.gzipBytes);

const original = (await text('REPORT.md')).replaceAll('\r\n', '\n');
const sections = new Map<string, string>();
for (const match of original.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) sections.set(match[1]!, match[2]!.trim());
const section = (name: string) => { const value = sections.get(name); assert(value, `Existing report section missing: ${name}`); return value; };
const clean = (value: unknown) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const number = (value: number) => value.toLocaleString('en-US');
const links = profiles.map((profile, index) => `[Profile ${index + 1}](${profile.evidence})`).join(', ');
const c03 = 'Known pinned-infrastructure limitation under **C-03**: React DOM 19.3.0 installs one shared nonpassive document `selectionchange` listener (`react-dom-client.production.js:13824`), and its unmount path (`:18499`) retains it. The cold-mount audit and every qualified teardown identify React’s true `_reactListening*` marker and leave exactly that one listener, with no other document/window listener or count growth. No supported RootOptions fix exists; no mounting architecture, dependency patch or document-method interception was introduced. [Cold proof](evidence/m1/cold-listeners-c03/results.json), [exact source locations and rejected alternatives](evidence/m1/stop-rule-03.md).';

sections.set('Milestones', [
  '| Milestone | State | Date |', '|---|---|---|',
  '| M0 | Complete continuation gate; B-00e fails with required Z4 fallback | 2026-09-29 |',
  `| M1 | PASS; kit API released | ${readyDate} |`,
  '| M2 | Starting Farm parity; no Farm acceptance claimed by this M1 report | — |',
  '| M3 | New features not started | — |',
  '| M4 | Hardening and final delivery pending | — |', '',
  `The recorded release line is \`KIT-M1: READY ${readyDate}\`. Golden Gate may consume the frozen kit API; later changes must be compatible additions. Farm parity and delivery remain outstanding.`,
].join('\n'));

sections.set('Build, stage, serve and test', [
  'The workspace, lockfile, exact pins, kit modules, generated demo pack and public/test/dev outputs are qualified. The source consumer compiles under TypeScript 6.0.3 and resolves one three installation. Run from the workspace root; the wrapper selects the installed Node 22.23.2 and workspace npm 12.0.2 process-locally, with Bun 1.4.2.', '',
  '```powershell', '& ./scripts/toolchain-run.ps1 run check:toolchain', '& ./scripts/toolchain-run.ps1 run check:pins', '& ./scripts/toolchain-run.ps1 run typecheck', '& ./scripts/toolchain-run.ps1 test', '& ./scripts/toolchain-run.ps1 run demo:build', '& ./scripts/toolchain-run.ps1 run check:hygiene', '& ./scripts/toolchain-run.ps1 run check:licenses', '& ./scripts/toolchain-run.ps1 run check:site-compat', '& ./scripts/toolchain-run.ps1 run demo:serve', '```', '',
  '`demo:build` stages the five-file, 4,699-byte synthetic pack and builds all three outputs. `demo:serve` verifies and serves `packages/scene-kit/dist/standalone/` at `http://127.0.0.1:4400/`; stop it with Ctrl+C. Every output contains a Node-builtins-only `serve.mjs` and third-party notices.', '',
  `The two completed qualification reports are ${links}. Their fresh browser profiles are distinct, and each records closed owned browsers and servers. [Qualification gate](${qualificationPath}). The separate cold-document audit bounds the C-03 exception; an initialized heap baseline does not replace it.`,
].join('\n'));

const summaries = ['| Family | Passing | Failing | Deferred |', '|---|---:|---:|---:|'];
for (const family of ['P', 'U', 'B', 'X']) {
  const counts = { pass: 0, fail: 0, deferred: 0 };
  for (const check of matrix.checks) if (check.id.startsWith(family + '-')) counts[check.status as keyof typeof counts]++;
  assert.deepEqual(counts, matrix.summary[family], `Stale ${family} matrix summary`);
  summaries.push(`| ${family} | ${counts.pass} | ${counts.fail} | ${counts.deferred} |`);
}
const rows = ['| Id | Subject | State | Reason and evidence |', '|---|---|---|---|', ...matrix.checks.map((check: any) => `| ${check.id} | ${clean(check.subject)} | ${check.status} | ${clean(check.reason)}. [Evidence](${check.evidence}) |`)];
sections.set('Acceptance matrix', [
  'Counts expand B-00 into eight subchecks and count suffixed U ids separately. P-28 is page-owned. Passing kit/demo checks do not establish Farm parity. U-18’s kit HUD behavior passes; its Farm string table remains deferred. B-15 includes the completed shared contract suite. The remaining B failure is the recorded B-00e defect with its required Z4 fallback.', '',
  summaries.join('\n'), '', '[Machine-readable matrix, including separate historical failures](evidence/acceptance-matrix.json).', '', rows.join('\n'),
].join('\n'));

sections.set('Validation, parity thresholds and limits', [
  `**${number(total)} unit tests pass, zero fail, with ${number(assertions)} assertions across ${files} files.** [Current raw output](${qualification.unitEvidence}), [coverage and limits](evidence/m1/unit-coverage.md). [TS7](evidence/m1/validation/typecheck-round3.log) and [TS6 source consumer](evidence/m1/site-compat.json) pass. All ${exports.expectedCount} explicit SPEC sections 5–13 export names resolve through the TS6 compiler, with none missing; this name audit is separate from behavior tests. [Export evidence](${qualification.exports}).`, '',
  `B-01–B-05, B-11, B-12 and B-15 pass in both fresh-profile reports: ${links}. This includes zero-size recovery, six scoped React/callback faults, public-mode axe with zero serious/critical violations, keyboard and reduced-motion behavior, and public/developer hygiene.`, '',
  'B-15 proves RGB pixel dominance, dynamic writes/density/cells/zones, normal-map derivative shading, AgX, path handback, vehicle obstruction, presets and keyboard/pointer/touch HUD operation. Earlier focused captures retain normal-map linear-luminance differences .000892–.001279 against the .02 limit, with zero repeat-capture noise in those views. [Focused evidence](evidence/m1/demo-features-summary.md). These are demo proofs, not Farm parity.', '',
  'Farm r33/r34 captures, noise-floor baselines, batching comparisons, woodland A/B, mobile flows and ACES/Neutral view pairs remain required in their later milestones. No pilot behavior has been changed or claimed equivalent by M1.',
].join('\n'));

const oldHeap = section('Heap findings, performance deferrals and hub kit').split(/\n\n(?:R2-13 predeclares|The preceding cold\/diagnostic failures remain)/)[0]!;
const trendRows = ['| Fresh profile | Measured baseline B | Measured final B | Growth B / percent | Third-block growth B | Investigate before M4 |', '|---|---:|---:|---:|---:|---|', ...profiles.map((profile, index) => `| [${index + 1}](${profile.evidence}) | ${number(profile.beforeBytes)} | ${number(profile.afterBytes)} | ${number(profile.measuredGrowthBytes)} / ${profile.measuredGrowthPercent.toFixed(3)}% | ${number(profile.trend.growthBytes)} | ${profile.trend.investigateBeforeM4 ? 'Yes' : 'No'} |`)];
sections.set('Heap findings, performance deferrals and hub kit', [
  oldHeap, '',
  'The preceding cold/diagnostic failures remain historical failures under their original protocols. C-04 endorses R2-13’s fixed, non-adaptive initialization: 120 normal frames per backend, ten initialization cycles, forced GC, then ten measured alternating cycles plus loading/error cancellation. Both fresh profiles pass the strict growth limit below 5%. C-03 listener identity/count, root removal, callbacks and owned backend release are checked throughout.', '',
  trendRows.join('\n'), '',
  'Each run also records the required third block of ten cycles. Its byte growth is compared with the measured block; growth at least as large is an investigation finding before M4, never a replacement baseline or a different gate. All initialization, measured and trend samples remain in the reports. [Qualification summary](evidence/m1/qualification-round3.json).', '',
  'No local performance timing ran, and the optional five-second smoke was not used. There are no FPS, startup-time, CPU-time or GPU-time claims. X-01 and X-04–X-10 await authorized idle-machine qualification. Demo X-03 passes; Farm rendering counts, leaks, bytes, allocation checks and the runnable hub kit remain later work. No hub connection occurred.',
].join('\n'));
sections.set('three 0.186.0 evidence', section('three 0.186.0 evidence').replace('overall B-05 still fails', 'demo B-05 now passes under C-03/C-04; Farm qualification remains required').replace('Farm Field Grass vendoring and parity not started', 'Farm Field Grass vendoring and parity remain M2 work'));
sections.set('Decisions and deviations', section('Decisions and deviations').split(/\n\n(?:STOP-03 is an unmet requirement|Known pinned-infrastructure limitation under)/)[0]! + '\n\n' + c03 + '\n\nC-04 changes only the predeclared heap initialization/diagnostic protocol; cold failures remain preserved. D-15 uses the recovered earlier build measurement and its fixed 10% budget below. No public API name was removed or Farm parity requirement waived.');

const licenseParagraph = section('Bundle sizes, hygiene and licenses').split('\n\n').find(value => value.startsWith('[Public hygiene]'));
assert(licenseParagraph, 'Keep the existing license qualification paragraph');
const bundleRows = ['| Output | JavaScript/CSS bytes | gzip bytes | Evidence |', '|---|---:|---:|---|', ...bundles.map((bundle, index) => `| ${['Public demo', 'Test demo', 'Developer demo'][index]} | ${number(bundle.totalBytes)} | ${number(bundle.totalGzipBytes)} | [${bundle.mode}](evidence/m1/bundle-${bundle.mode}.json) |`)];
sections.set('Bundle sizes, hygiene and licenses', [bundleRows.join('\n'), '',
  `D-15 baseline: **${number(baseline.measurement.totalBytes)} B / ${number(baseline.measurement.totalGzipBytes)} B gzip**, chunk \`${baseline.measurement.chunk}\`. The budget is **${number(baseline.budget.maximumBytes)} B / ${number(baseline.budget.maximumGzipBytes)} B gzip**, computed as ceil(baseline × 1.1); the current public output passes. [Baseline/provenance](evidence/m1/bundle-baseline.json), [budget check](evidence/m1/bundle-budget-check.json).`, '',
  `${baseline.provenance} ${baseline.limitation}`, '',
  'The synthetic pack adds 4,699 B separately. These are demo sizes, not Farm totals. No larger current build was substituted for the recovered earlier baseline.', '', licenseParagraph,
].join('\n'));

sections.set('Open decision, ownership and command log', [
  'No M1 owner question remains after C-03/C-04. D-12 upload/CORS approval and D-18 Farm look review remain later owner actions; settled decisions are not reopened.', '',
  'The qualification reports each record closure of their owned browser and servers. The [round-2 OS audit](evidence/m1/final-audit.json) is historical evidence, not a claim about processes during ongoing Farm work. A fresh ownership audit is required before final delivery. No hub access, commit, branch mutation, upload, publication or paid/live model call is authorized; inputs remain read-only and generated/staged dependencies stay ignored.', '',
  '| Command group | Evidence |', '|---|---|',
  '| Pin metadata, install and replay | [Pins](evidence/preflight/pin-audit.log), [install](evidence/m0/install.log), [replay](evidence/m0/install-frozen.log) |',
  '| Toolchain and pin checks | [Toolchain](evidence/m0/toolchain.log), [pins](evidence/m0/pins.log) |',
  '| `spike:test` | [B-00 results and retained attempts](evidence/m0/browser-results.json) |',
  `| Unit/type/source checks | [Units](${qualification.unitEvidence}), [TS7](evidence/m1/validation/typecheck-round3.log), [TS6 consumer](evidence/m1/site-compat.json), [exports](evidence/m1/export-audit.json) |`,
  '| `demo:build` | Public/test/dev byte manifests and notices above |',
  `| Full browser qualification | ${links}; [qualification gate](${qualificationPath}) |`,
  '| Cold listener and scoped fault checks | [C-03](evidence/m1/cold-listeners-c03/results.json), [faults](evidence/m1/contract-faults/results.json) |',
  '| Earlier failures | [Cold heap](evidence/m1/b05-fixed-baseline/counts.json), [old full run](evidence/m1/browser-auto/browser-results.json), [focused corrections](evidence/m1/demo-features-summary.md) |',
].join('\n'));
sections.set('Site-owner handoff', [
  `The kit API is released as of \`KIT-M1: READY ${readyDate}\`; Golden Gate can consume it. **The Farm rewrite is not ready for website integration.** Keep the pilot fallback and current page behavior while M2 begins. No website, pilot, mirror or Kiln engine edit is part of this handoff.`, '',
  'The [kit README](packages/scene-kit/README.md) and source consumer demonstrate `sceneSourceConfig(\'public\')`: merge the source aliases, bare-three Clock compatibility facade, deduplication and compile-time flags into the host’s Vite configuration. The kit stylesheet is injected, so no separate CSS setup is needed. The host owns loading/error presentation, Exit and fullscreen; mount the scene as a client-only island.', '',
  '**Website infrastructure exception (C-03):** preserve React DOM’s one shared nonpassive document `selectionchange` listener for the page lifetime. Scene teardown releases every scene-owned listener. Its count remains one through cold mount and all cycles; do not intercept document methods, remove the shared listener or patch React. [Exact pinned source locations](evidence/m1/stop-rule-03.md), [cold proof](evidence/m1/cold-listeners-c03/results.json).', '',
  'Farm upload files/hashes, r33/r34 staging, final import/mount signatures and the runnable hub kit remain unqualified by M1. D-12 reserves uploads and CORS headers for the owner. D-11 reserves website mobile-copy changes for the coordinator after B-09 passes. D-18 keeps Farm ACES Filmic at .95 and requires later ACES/Neutral comparison captures for owner review. No publishing or deployment is authorized by this report.',
].join('\n'));

const report = `# Scenes build report — M1 released; Farm parity starting\n\nDate: ${qualification.date.slice(0, 10)}. Workspace: \`C:/Users/Mattm/X/kiln-commons/scenes/\`. Branch remains \`work/scenes-v1\`.\n\nM0 passed its continuation gate and M1 is **released** at \`KIT-M1: READY ${readyDate}\`. Both fresh-profile full suites pass under C-03/C-04. This is the M1 handoff report and starting point for Farm work, not completed Farm or M4 delivery. [Qualification](${qualificationPath}).\n\n${c03}\n\n` + [...sections].map(([heading, body]) => `## ${heading}\n\n${body}`).join('\n\n') + '\n';
for (const match of report.matchAll(/\]\(([^)]+)\)/g)) if (!/^https?:/.test(match[1]!)) await access(local(match[1]!));
for (const stale of ['M1 is unreleased', 'no M1 readiness marker', 'no acceptance execution occurred', 'STOP-03 independently prevents', 'overall B-05 still fails']) assert(!report.includes(stale), `Stale report claim: ${stale}`);
await writeFile(local('REPORT.md'), report);
await writeFile(local('evidence/m1/report-validation.json'), JSON.stringify({ date: qualification.date, milestone: 'M1', status: 'pass', qualification: qualificationPath, matrixIds: 102, summary: matrix.summary, reportLinks: 'all present', readinessMarker: marker[0], ownershipAudit: 'Historical round-2 audit; final audit pending' }, null, 2) + '\n');
console.log(JSON.stringify({ report: 'REPORT.md', readiness: marker[0], matrixIds: 102, unitTests: total, assertions, summary: matrix.summary }));
