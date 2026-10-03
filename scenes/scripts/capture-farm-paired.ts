/** D-68: explicit accepted/candidate builds against one sealed pilot pair and phase. No timing. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { launchChrome, serveOwned, workspacePath } from '../packages/scene-kit/src/testing/node';
import { verifyStaged } from '../packages/scene-kit/src/staging';
import { captureFarmNew, capturePilotPair, PLAY_FIXTURES, serveSealedPilot, type ParityBackend } from './capture-farm-parity';
import { compareParityImages, type RgbaImage } from './parity-images';
import { closeExtraStartupPages } from './browser-startup';

export function pairedFarmVerdict(accepted: { pass: boolean }, candidate: { pass: boolean }) {
  assert(typeof accepted.pass === 'boolean' && typeof candidate.pass === 'boolean', 'Both paired verdicts must be present');
  const regression = accepted.pass && !candidate.pass;
  return { pass: !regression, regression };
}

/** A capture error never becomes an accepted shared failure. Each capture opens a fresh page. */
export async function captureSamePhasePair<T extends { png: RgbaImage }>(o: {
  pilot: { first: RgbaImage; repeat: RgbaImage; phase: number };
  capture(side: 'accepted' | 'candidate', phase: number): Promise<T>;
}) {
  const { first, repeat, phase } = o.pilot;
  assert(Number.isFinite(phase) && phase >= 0, 'Pilot phase must be a finite nonnegative number');
  const accepted = await o.capture('accepted', phase), candidate = await o.capture('candidate', phase);
  const a = compareParityImages(first, repeat, accepted.png), b = compareParityImages(first, repeat, candidate.png);
  return { phase, accepted: { capture: accepted, metric: a }, candidate: { capture: candidate, metric: b }, verdict: pairedFarmVerdict(a, b) };
}

export function pairedFarmCoverage(views: readonly string[], rows: readonly { view: string; backend: string; status: string }[], acceptedBuildVerified = false) {
  const required = views.flatMap(view => ['webgpu', 'webgl2'].map(backend => `${view}/${backend}`));
  const keys = rows.map(row => `${row.view}/${row.backend}`), missing = required.filter(key => !keys.includes(key));
  const duplicate = keys.filter((key, i) => keys.indexOf(key) !== i), extra = keys.filter(key => !required.includes(key));
  const passing = rows.filter(row => row.status === 'pass').length;
  return { releaseQualified: acceptedBuildVerified && required.length > 0 && !missing.length && !duplicate.length && !extra.length && passing === required.length, acceptedBuildVerified,
    expected: required.length, checked: rows.length, passing, missing, duplicate, extra };
}

/** A path or Git label alone is not a build identity. Recheck the same bytes after capture. */
async function buildIdentity(root: string) {
  const problems = verifyStaged(resolve(root, 'assets')).problems.filter(problem => !/^[^/]+\.(?:js|css): extra staged file$/.test(problem));
  assert(!problems.length, `Paired build assets failed verification: ${problems.join('; ')}`);
  const hasBuild = existsSync(resolve(root, 'build.json'));
  const names = ['index.html', 'assets/pack.json', 'bundle-modules.json', ...(hasBuild ? ['build.json'] : []), ...(await readdir(resolve(root, 'assets'))).filter(name => /\.(js|css)$/.test(name)).map(name => `assets/${name}`)];
  const files = await Promise.all(names.sort().map(async path => { const bytes = await readFile(resolve(root, path)); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; }));
  return { root, files, source: hasBuild ? JSON.parse(await readFile(resolve(root, 'build.json'), 'utf8')).source : 'unknown: no build.json source receipt', sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex') };
}

/** An acceptance record must identify these exact bytes and an owner decision; a source reconstruction is not acceptance. */
export function acceptedBuildEvidence(receipt: unknown, buildSha256: string) {
  if (receipt === undefined) return { verified: false, status: 'unknown', reason: 'No exact accepted-build receipt; this comparison is diagnostic, even when every pair passes' };
  const value = receipt as { schema?: unknown; buildSha256?: unknown; ownerAccepted?: unknown; decision?: unknown };
  assert(value?.schema === 'kiln.farm-accepted-build/1' && value.buildSha256 === buildSha256 && value.ownerAccepted === true
    && typeof value.decision === 'string' && value.decision.trim().length > 0, 'Accepted-build receipt must identify the exact build hash and recorded owner decision');
  return { verified: true, status: 'recorded', decision: value.decision, buildSha256 };
}

export async function runPairedFarmParity(o: { workspace?: string; label: string; acceptedRoot: string; newRoot: string; acceptedReceipt?: string; release?: 'r33' | 'r34'; views?: string[]; backend?: ParityBackend | 'both' }) {
  const workspace = resolve(o.workspace ?? process.cwd()), release = o.release ?? 'r34';
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(o.label), 'Evidence label must be a simple directory name');
  assert(['r33', 'r34'].includes(release), 'Unknown sealed pilot release');
  const acceptedRoot = workspacePath(workspace, o.acceptedRoot), newRoot = workspacePath(workspace, o.newRoot);
  assert(acceptedRoot !== newRoot, 'Accepted and candidate builds must be separate inputs');
  const layout = JSON.parse(await readFile(workspacePath(workspace, `.tmp/pilot-${release}/scene/layout.json`), 'utf8'));
  const pilotDelivery = await readFile(workspacePath(workspace, `.tmp/pilot-${release}/delivery.json`));
  const required = [...Object.keys(layout.views), ...Object.keys(PLAY_FIXTURES)], views = o.views ?? required;
  assert(views.length && new Set(views).size === views.length && views.every(view => required.includes(view)), 'Every view must be a unique named or play fixture');
  const backends: ParityBackend[] = !o.backend || o.backend === 'both' ? ['webgpu', 'webgl2'] : [o.backend];
  assert(backends.every(backend => ['webgpu', 'webgl2'].includes(backend)), 'Unknown backend');
  const builds = { accepted: await buildIdentity(acceptedRoot), candidate: await buildIdentity(newRoot) };
  const acceptanceBytes = o.acceptedReceipt ? await readFile(workspacePath(workspace, o.acceptedReceipt)) : undefined;
  const acceptance = { ...acceptedBuildEvidence(acceptanceBytes ? JSON.parse(acceptanceBytes.toString('utf8')) : undefined, builds.accepted.sha256),
    ...(acceptanceBytes ? { receiptSha256: createHash('sha256').update(acceptanceBytes).digest('hex') } : {}) };
  const out = workspacePath(workspace, `evidence/parity/${o.label}`);
  assert(!existsSync(out), 'Refusing to overwrite existing parity evidence'); await mkdir(out, { recursive: true });
  const results: any[] = [], ledger: any = { closed: false };
  const report: any = { schema: 'kiln.farm-paired-parity/1', decision: 'D-68', builds, acceptance, release,
    pilotDeliverySha256: createHash('sha256').update(pilotDelivery).digest('hex'),
    conditions: { width: 1280, height: 720, dpr: 1, tier: 'high', phase: 'One read-only sealed-pilot phase shared by accepted and candidate fresh-page captures',
      rule: 'Fail a view only when the candidate fails B-06/D18 against the pilot and the accepted build passes; errors always fail',
      metric: 'Full-view B-06 luminance and >32-channel budget of 100 pixels beyond repeat noise (D-67)',
      scope: 'Paired pilot audit only; direct before/after parity, count gates and performance remain separate', timing: 'not collected' }, views, backends, results, ledger };
  const save = () => writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  let pilot: Awaited<ReturnType<typeof serveSealedPilot>> | undefined, accepted: Awaited<ReturnType<typeof serveOwned>> | undefined, candidate: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Awaited<ReturnType<typeof launchChrome>> | undefined;
  try {
    pilot = await serveSealedPilot(workspace, release); ledger.pilot = { port: pilot.port, pid: pilot.pid, log: pilot.log };
    accepted = await serveOwned(acceptedRoot); candidate = await serveOwned(newRoot); ledger.acceptedPort = accepted.port; ledger.candidatePort = candidate.port;
    browser = await launchChrome({ workspace, name: `paired-${o.label}` }); report.browser = await browser.version();
    await closeExtraStartupPages(browser);
    const ports = new Set([pilot.port, accepted.port, candidate.port]);
    for (const backend of backends) for (const view of views) {
      const dir = resolve(out, `${view}-${backend}`); await mkdir(dir, { recursive: true });
      const row: any = { view, backend, status: 'error' };
      try {
        const play = PLAY_FIXTURES[view];
        const old = await capturePilotPair({ browser, url: pilot.url, ports, backend, view, dir, play });
        const pair = await captureSamePhasePair({ pilot: old, capture: (side, phase) => captureFarmNew({ browser: browser!, url: side === 'accepted' ? accepted!.url : candidate!.url,
          ports, backend, view, file: resolve(dir, `${view}-${side}-${backend}.png`), play, ambientTime: phase }) });
        row.phase = pair.phase; row.pilot = { first: old.firstStats, repeat: old.repeatStats, diagnostics: old.diagnostics };
        for (const side of ['accepted', 'candidate'] as const) {
          const { diff, ...metric } = pair[side].metric;
          await writeFile(resolve(dir, `${view}-${side}-diff-${backend}.png`), PNG.sync.write({ ...diff, data: Buffer.from(diff.data) }));
          row[side] = { metric, stats: pair[side].capture.stats, diagnostics: pair[side].capture.diagnostics };
        }
        row.verdict = pair.verdict; row.status = pair.verdict.pass ? 'pass' : 'regression';
      } catch (error) { row.error = error instanceof Error ? error.stack : String(error); }
      results.push(row); await save(); console.log(`${view}/${backend}: ${row.status}`);
    }
    assert.deepEqual(await buildIdentity(acceptedRoot), builds.accepted, 'Accepted build changed during audit');
    assert.deepEqual(await buildIdentity(newRoot), builds.candidate, 'Candidate build changed during audit');
  } catch (error) { report.error = error instanceof Error ? error.stack : String(error); throw error; }
  finally {
    const errors: string[] = [];
    for (const [name, resource] of [['browser', browser], ['candidate', candidate], ['accepted', accepted], ['pilot', pilot]] as const) {
      try { await resource?.close(); ledger[`${name}Closed`] = true; } catch (error) { errors.push(`${name}: ${String(error)}`); }
    }
    ledger.closed = !errors.length; ledger.cleanupErrors = errors;
    report.summary = pairedFarmCoverage(required, results, acceptance.verified);
    if (report.error || errors.length) report.summary.releaseQualified = false;
    await save(); if (errors.length) throw new AggregateError(errors, 'Paired parity resources did not all close');
  }
  return { out, pass: results.length > 0 && results.every(row => row.status === 'pass'), report };
}

if (import.meta.main) {
  const args = process.argv.slice(2), option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--help')) console.log('Usage: bun scripts/capture-farm-paired.ts --label <new-evidence> --accepted-root <comparison-test-build> --new-root <candidate-test-build> [--accepted-receipt <exact-owner-acceptance.json>] [--release r34|r33] [--backend both|webgpu|webgl2] [--views hero,...]. Default covers all named/play views on both backends. Subsets or absent exact accepted-build evidence cannot qualify a release.');
  else {
    for (const flag of ['--label', '--accepted-root', '--new-root']) assert(option(flag) && !option(flag)!.startsWith('--'), `Required ${flag}`);
    const result = await runPairedFarmParity({ label: option('--label')!, acceptedRoot: option('--accepted-root')!, newRoot: option('--new-root')!, acceptedReceipt: option('--accepted-receipt'), release: option('--release') as 'r33' | 'r34' | undefined, backend: option('--backend') as ParityBackend | 'both' | undefined, views: option('--views')?.split(',') });
    console.log(JSON.stringify({ out: result.out, pass: result.pass, releaseQualified: result.report.summary.releaseQualified })); if (!result.pass) process.exitCode = 1;
  }
}
