import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { assertOwnedUrl, CORRECTNESS_TIMEOUT, launchChrome, serveOwned, waitForReady, workspacePath } from '../packages/scene-kit/src/testing/node';
import { assertDemoInstances } from '../packages/scene-kit/demo/browser-instances';
import { assertDemoRigs } from '../packages/scene-kit/demo/browser-demo';
import { assertDemoUi } from '../packages/scene-kit/demo/browser-ui';

const backend = process.argv.includes('--webgl') ? 'webgl2' : 'auto';
const labelIndex = process.argv.indexOf('--label'), label = labelIndex < 0 ? '' : process.argv[labelIndex + 1];
if (label === undefined || !/^[a-z0-9-]*$/.test(label)) throw new Error('--label must use lowercase letters, numbers and hyphens');
const workspace = process.cwd(), out = workspacePath(workspace, `evidence/m1/demo-features-${backend}${label ? '-' + label : ''}`);
const command = `./scripts/toolchain-run.ps1 scripts/run-demo-features.ts${backend === 'webgl2' ? ' --webgl' : ''}${label ? ' --label ' + label : ''}`;
const expectedFallback = /^THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\./;
type Message = { attempt: number; stage: string; kind: string; type?: string; text: string; url?: string; expected?: boolean };
const report = {
  id: 'B-15', backend, command,
  note: 'Focused demo feature correctness only. No frame, startup, CPU, or GPU timing is measured. The separate contract suite supplies B-01 to B-05, B-11 and B-12.',
  browser: '', attempts: [] as { attempt: number; status: 'pass' | 'fail'; details: Record<string, unknown>; error?: string }[],
  messages: [] as Message[], cleanupErrors: [] as string[],
  ledger: { ports: [] as number[], browserPid: undefined as number | undefined, browserClosed: false, browserExitCode: undefined as number | null | undefined, serverClosed: false, disposalConfirmed: false, finalSnapshot: undefined as unknown },
};

// This mode checks imports and the invocation without acquiring a server or GPU.
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ command, backend, output: out, browserStarted: false, serverStarted: false }));
} else {
  await mkdir(out, { recursive: true });
  let server: Awaited<ReturnType<typeof serveOwned>> | undefined, browser: Browser | undefined, page: Page | undefined;
  let attempt = 0, stage = 'setup';
  const persist = () => writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  const stack = (error: unknown) => error instanceof Error ? error.stack ?? error.message : String(error);
  async function unmountOwnedScene() {
    if (!page || page.isClosed()) return;
    const before = await page.evaluate(() => {
      const harness = (window as any).__kilnHarness;
      return { mounted: !!document.querySelector('.ks-root'), disposals: harness?.snapshot().disposals?.length ?? 0 };
    });
    if (before.mounted) {
      await page.evaluate(() => (window as any).__kilnHarness.unmount());
      await page.waitForFunction(previous => !document.querySelector('.ks-root') && ((window as any).__kilnHarness.snapshot().disposals?.length ?? 0) > previous,
        { timeout: CORRECTNESS_TIMEOUT }, before.disposals);
      report.ledger.disposalConfirmed = true;
    }
    report.ledger.finalSnapshot = await page.evaluate(() => (window as any).__kilnHarness?.snapshot());
  }
  try {
    server = await serveOwned(workspacePath(workspace, 'packages/scene-kit/dist/test'));
    report.ledger.ports.push(server.port);
    browser = await launchChrome({ workspace, name: `demo-features-${backend}` });
    report.ledger.browserPid = browser.process()?.pid;
    report.browser = await browser.version();
    page = await browser.newPage();
    await page.setViewport({ width: 960, height: 720, deviceScaleFactor: 1 });
    page.setDefaultTimeout(CORRECTNESS_TIMEOUT);
    page.on('console', message => report.messages.push({ attempt, stage, kind: 'console', type: message.type(), text: message.text() }));
    page.on('pageerror', error => report.messages.push({ attempt, stage, kind: 'pageerror', text: stack(error) }));
    page.on('requestfailed', request => report.messages.push({ attempt, stage, kind: 'requestfailed', text: request.failure()?.errorText ?? '', url: request.url(), expected: stage === 'cleanup' }));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) { void request.continue(); return; }
      try { assertOwnedUrl(url, new Set(report.ledger.ports)); void request.continue(); }
      catch (error) { report.messages.push({ attempt, stage, kind: 'blocked-request', text: stack(error), url }); void request.abort('blockedbyclient'); }
    });
    for (attempt = 1; attempt <= 2; attempt++) {
      const attemptOut = resolve(out, `attempt-${attempt}`), details: Record<string, unknown> = {};
      await mkdir(attemptOut, { recursive: true });
      const firstMessage = report.messages.length;
      try {
        stage = 'ready'; console.log(`B-15 ${backend}: START attempt ${attempt}`);
        const url = `${server.url}/?backend=${backend}`; assertOwnedUrl(url, new Set(report.ledger.ports));
        await page.goto(url, { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT });
        await waitForReady(page);
        const initial = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
        assert.equal(initial.backend?.backend, backend === 'auto' ? 'webgpu' : 'webgl2', 'The requested backend is exercised');
        details.initial = initial;
        stage = 'instances'; console.log(`B-15 ${backend}: instances`);
        details.instances = await assertDemoInstances(page, attemptOut);
        stage = 'rigs'; console.log(`B-15 ${backend}: rigs`);
        details.rigs = await assertDemoRigs(page);
        stage = 'ui'; console.log(`B-15 ${backend}: UI`);
        details.ui = await assertDemoUi(page);
        const unexpected = report.messages.slice(firstMessage).filter(message => !message.expected &&
          (message.kind !== 'console' || message.type === 'error' || (message.type === 'warn' && !expectedFallback.test(message.text))));
        assert.deepEqual(unexpected, [], 'No unexpected browser diagnostics');
        const final = await page.evaluate(() => (window as any).__kilnHarness.snapshot());
        assert.deepEqual(final.errors, [], 'No scene errors');
        details.final = final;
        report.attempts.push({ attempt, status: 'pass', details });
        console.log(`B-15 ${backend}: PASS attempt ${attempt}`);
        break;
      } catch (error) {
        report.attempts.push({ attempt, status: 'fail', details, error: stack(error) });
        console.error(`B-15 ${backend}: FAIL attempt ${attempt}\n${stack(error)}`);
        await page.screenshot({ path: resolve(attemptOut, 'failure.png') }).catch(captureError => { report.messages.push({ attempt, stage, kind: 'capture-error', text: stack(captureError) }); });
        details.failureSnapshot = await page.evaluate(() => (window as any).__kilnHarness?.snapshot()).catch(() => null);
        details.failureDiagnostics = await page.evaluate(() => {
          const api = (window as any).__kilnScene;
          return { rigs: api?.demoRigState?.(), actions: api?.demoActionState?.(), stream: api?.streamStats?.(), zones: api?.zoneState?.() };
        }).catch(() => null);
      } finally {
        stage = 'cleanup';
        await unmountOwnedScene().catch(error => report.cleanupErrors.push(stack(error)));
        await persist();
      }
    }
  } catch (error) {
    report.attempts.push({ attempt, status: 'fail', details: { stage }, error: stack(error) });
    console.error(stack(error));
  } finally {
    stage = 'cleanup';
    await unmountOwnedScene().catch(error => report.cleanupErrors.push(stack(error)));
    if (browser) {
      try { await browser.close(); report.ledger.browserClosed = true; report.ledger.browserExitCode = browser.process()?.exitCode; }
      catch (error) { report.cleanupErrors.push(stack(error)); }
    } else report.ledger.browserClosed = true;
    if (server) {
      try { await server.close(); report.ledger.serverClosed = true; }
      catch (error) { report.cleanupErrors.push(stack(error)); }
    } else report.ledger.serverClosed = true;
    await writeFile(resolve(out, 'browser-messages.json'), JSON.stringify(report.messages, null, 2) + '\n');
    await persist();
  }
  console.log(JSON.stringify({ id: report.id, backend, results: report.attempts.map(({ attempt, status }) => ({ attempt, status })), ledger: report.ledger, cleanupErrors: report.cleanupErrors, evidence: out }));
  if (report.attempts.at(-1)?.status !== 'pass' || report.cleanupErrors.length || !report.ledger.browserClosed || !report.ledger.serverClosed) process.exitCode = 1;
}
