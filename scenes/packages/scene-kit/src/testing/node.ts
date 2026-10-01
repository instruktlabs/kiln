// Node-only helpers. This entry is never re-exported by the browser testing module.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer-core';
import type { Browser, Page, HTTPRequest } from 'puppeteer-core';
import axe from 'axe-core';
// @ts-ignore Shared Node-builtins-only implementation copied into standalone outputs.
import { startStaticServer } from '../../../../scripts/static-server.mjs';

export const INSTALLED_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const CORRECTNESS_TIMEOUT = 120_000;
/** A loopback port range a runner owns (GG-001 / FF-001): each builder serves only in its own range. */
export interface PortRange { first: number; last: number }
/** The kit's range, used when a caller passes none. */
export const DEFAULT_PORT_RANGE: Readonly<PortRange> = Object.freeze({ first: 4400, last: 4499 });
/** The range to bind and connect in: whole port numbers from 1024 to 65535, `first` at most `last`. */
function ownedRange(ports: PortRange = DEFAULT_PORT_RANGE): PortRange {
  const { first, last } = ports;
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1024 || last > 65535 || first > last) throw new Error(`Invalid owned port range ${first}–${last}`);
  return { first, last };
}
export interface BrowserResult { id: string; status: 'pass' | 'fail' | 'deferred'; attempt: number; details?: unknown; error?: string }
export interface BrowserMessage { kind: 'console' | 'pageerror' | 'requestfailed'; type?: string; text?: string; url?: string; expected?: boolean }
export interface DisposalReceipt { backend: 'webgpu' | 'webgl2' | null; disposed: boolean; deviceLost?: boolean; contextLost?: boolean; resources?: number }
export interface HarnessSnapshot {
  readyCount: number; errors: { code: string; message: string }[]; backend?: { backend: string; forced: boolean; adapter?: unknown };
  callbacksAfterUnmount?: number; disposals?: DisposalReceipt[]; shellEscapes?: number;
}
export interface SceneContractTestOptions {
  testRoot: string; publicRoot: string; devRoot: string; outDir: string;
  workspace?: string; executablePath?: string; headless?: boolean;
  /** Optional explicit Chrome window size, passed to `launchChrome` (the page viewport stays 960x720). */
  windowSize?: readonly [number, number];
  /** Optional owned port range for every server the suite starts and every URL it checks; default 4400–4499. */
  ports?: PortRange;
  sceneSelector?: string; hudSelector?: string; expectedBackend?: 'webgpu' | 'webgl2';
  mountOptions?: Record<string, unknown>; axeSource?: string;
  /** Optional fixture supplied by the scene harness to exercise a React render exception. */
  renderFailureOptions?: Record<string, unknown>;
  /** Optional named fixtures that throw from consumer callbacks during startup. */
  callbackFailureOptions?: { name:string; options:Record<string,unknown> }[];
  /** Scene-specific postconditions (for example keyboard movement) supplement the shared checks. */
  accessibilityFlow?(page: Page): Promise<unknown>;
  afterReady?(page: Page): Promise<void>;
  /** Extra correctness checks run while this runner still owns its page and browser. */
  extraChecks?(context: { page: Page; browser: Browser; testUrl: string; check(id: string, fn: () => Promise<unknown>): Promise<boolean> }): Promise<void>;
}
export interface SceneContractTestReport {
  note: string; browser: string; results: BrowserResult[]; messages: BrowserMessage[];
  ledger: { ports: number[]; browserPid?: number; browserProfile?: string; browserClosed: boolean; serversClosed: boolean };
}
const expectedFallback = /THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\./;
const browserProfiles = new WeakMap<Browser, string>();
export function workspacePath(workspace: string, path: string): string {
  const base = resolve(workspace), value = resolve(base, path), rel = relative(base, value);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Test output must remain in the scenes workspace');
  return value;
}
export function assertOwnedUrl(url: string, ownedPorts: ReadonlySet<number>, ports?: PortRange): void {
  const { first, last } = ownedRange(ports), value = new URL(url), port = Number(value.port || 80);
  if (value.protocol !== 'http:' || value.hostname !== '127.0.0.1' || value.username || value.password || port < first || port > last || !ownedPorts.has(port)) throw new Error(`Browser tests may only connect to their own loopback server on ports ${first}–${last}`);
}
/** `windowSize` adds an explicit `--window-size` (owner rule 2026-09-29 11:40: headless runs on the dev PC name their window size); `args` are extra Chrome flags. Both optional and additive. */
export async function launchChrome(o: { workspace?: string; executablePath?: string; headless?: boolean; name?: string; windowSize?: readonly [number, number]; args?: readonly string[] } = {}): Promise<Browser> {
  const workspace = o.workspace ?? process.cwd(), scratch = workspacePath(workspace, '.tmp');
  await mkdir(scratch, { recursive: true });
  const profile = await mkdtemp(workspacePath(scratch, `${o.name ?? 'contract'}-chrome-`));
  const browser = await puppeteer.launch({ executablePath: o.executablePath ?? INSTALLED_CHROME, headless: o.headless ?? true, pipe: true,
    userDataDir: profile,
    args: ['--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check', ...(o.windowSize ? [`--window-size=${o.windowSize[0]},${o.windowSize[1]}`] : []), ...(o.args ?? [])],
    env: { ...process.env, TEMP: scratch, TMP: scratch },
  });
  browserProfiles.set(browser, profile);
  return browser;
}
/** Try bind, never probe a listener. Every returned server was created by this call. */
export async function serveOwned(root: string, ports?: PortRange): Promise<{ url: string; port: number; close(): Promise<void> }> {
  const { first, last } = ownedRange(ports);
  for (let port = first; port <= last; port++) {
    try { const hosted = await startStaticServer({ root: resolve(root), port }); return { url: hosted.url, port, close: hosted.close }; }
    catch (error) { if ((error as { code?: string }).code !== 'EADDRINUSE') throw error; }
  }
  throw new Error(`No permitted scene-test port is available in ${first}–${last}`);
}
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const host = (window as any).__kilnHarness?.snapshot(), api = (window as any).__kilnScene;
    return host?.errors?.length > 0 || (!!api && (host?.readyCount > 0 || api.events?.some((event: any) => event.type === 'ready')));
  }, { timeout: CORRECTNESS_TIMEOUT });
  await page.evaluate(() => {
    const errors = (window as any).__kilnHarness?.snapshot().errors;
    if (errors?.length) throw new Error(`Scene readiness failed: ${errors[0].code}: ${errors[0].message}`);
  });
  await waitFrames(page, 3);
}
export async function waitFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(async ({ frames, timeout }) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([(window as any).__kilnScene.waitFrames(frames), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Frame-count wait exceeded the correctness timeout')), timeout); })]); }
    finally { clearTimeout(timer); }
  }, { frames: count, timeout: CORRECTNESS_TIMEOUT });
}
export async function capture(page: Page, path: string, selector = 'canvas'): Promise<Uint8Array> {
  const element = await page.$(selector); assert(element, 'Capture target exists'); return element.screenshot({ path });
}
const snapshot = (page: Page): Promise<HarnessSnapshot> => page.evaluate(() => (window as any).__kilnHarness.snapshot());
async function mount(page: Page, options: Record<string, unknown> = {}): Promise<HarnessSnapshot> {
  const ready = await page.evaluate(() => !!document.querySelector('.ks-root') && (window as any).__kilnHarness.snapshot().readyCount > 0);
  if (ready) await unmount(page, '.ks-root', true);
  await page.evaluate(value => (window as any).__kilnHarness.mount(value), options); await waitForReady(page); return snapshot(page);
}
async function unmount(page: Page, sceneSelector: string, waitForDisposal = false): Promise<HarnessSnapshot> {
  const before = waitForDisposal ? (await snapshot(page)).disposals?.length ?? 0 : 0;
  await page.evaluate(() => (window as any).__kilnHarness.unmount());
  await page.waitForFunction(selector => !document.querySelector(selector), { timeout: CORRECTNESS_TIMEOUT }, sceneSelector);
  if (waitForDisposal) await page.waitForFunction(previous => ((window as any).__kilnHarness.snapshot().disposals?.length ?? 0) > previous, { timeout: CORRECTNESS_TIMEOUT }, before);
  return snapshot(page);
}
async function heapUsage(page: Page, forceGc = false): Promise<{ usedSize: number; totalSize: number; embedderHeapUsedSize: number; backingStorageSize: number }> {
  const client = await page.createCDPSession();
  try { if (forceGc) await client.send('HeapProfiler.collectGarbage'); return await client.send('Runtime.getHeapUsage'); }
  finally { await client.detach(); }
}
export interface TeardownListenerDetail {
  type: string; useCapture: boolean; passive: boolean; once: boolean;
  scriptId?: string; lineNumber?: number; columnNumber?: number; handlerDescription?: string;
}
export interface TeardownListenerAudit {
  listeners: Record<string, TeardownListenerDetail[]>;
  reactDocumentMarkers: { name: string; value: boolean }[];
}
/** C-03 exempts one precisely identified ReactDOM listener, never other globals. */
export function assertTeardownListenerAudit(audit: TeardownListenerAudit): void {
  assert.deepEqual(audit.listeners.window, [], 'No window listener remains after teardown');
  assert.deepEqual(audit.listeners['window.__kilnDetachedRoot'], [], 'No root listener remains after teardown');
  assert.deepEqual(audit.listeners.document?.map(({ type, useCapture, passive, once }) => ({ type, useCapture, passive, once })),
    [{ type: 'selectionchange', useCapture: false, passive: false, once: false }], 'Only the C-03 ReactDOM selectionchange listener remains on document');
  assert.equal(audit.reactDocumentMarkers.length, 1, 'Exactly one React listening marker identifies the document listener');
  assert.match(audit.reactDocumentMarkers[0]!.name, /^_reactListening[a-z0-9]+$/);
  assert.equal(audit.reactDocumentMarkers[0]!.value, true, 'The React document listening marker is set');
}
async function teardownListenerAudit(page: Page): Promise<TeardownListenerAudit> {
  const client = await page.createCDPSession(), listeners: Record<string, TeardownListenerDetail[]> = {};
  try {
    for (const expression of ['window', 'document', 'window.__kilnDetachedRoot']) {
      const result = await client.send('Runtime.evaluate', { expression, objectGroup: 'kiln-listeners' });
      listeners[expression] = result.result.objectId ? (await client.send('DOMDebugger.getEventListeners', { objectId: result.result.objectId })).listeners.map(listener => ({
        type: listener.type, useCapture: listener.useCapture, passive: listener.passive, once: listener.once,
        scriptId: listener.scriptId, lineNumber: listener.lineNumber, columnNumber: listener.columnNumber,
        handlerDescription: listener.originalHandler?.description ?? listener.handler?.description,
      })) : [];
    }
    const reactDocumentMarkers = await page.evaluate(() => Object.getOwnPropertyNames(document).filter(name => name.startsWith('_reactListening')).sort()
      .map(name => ({ name, value: Object.getOwnPropertyDescriptor(document, name)?.value === true })));
    return { listeners, reactDocumentMarkers };
  } finally { await client.send('Runtime.releaseObjectGroup', { objectGroup: 'kiln-listeners' }); await client.detach(); }
}
async function animationFrames(page: Page, count = 4) {
  await page.evaluate(n => new Promise<void>(done => { function next() { if (--n <= 0) done(); else requestAnimationFrame(next); } requestAnimationFrame(next); }), count);
}
function diagnosticFailure(messages: BrowserMessage[]): BrowserMessage[] {
  return messages.filter(message => !message.expected && (message.kind !== 'console' || message.type === 'error' || (message.type === 'warn' && !expectedFallback.test(message.text ?? ''))));
}
/** Applied only to requests begun by a deliberately failing callback fixture. */
export function isExpectedCallbackFailureDiagnostic(message: BrowserMessage, fixtureUrls: string | ReadonlySet<string>): boolean {
  const member = typeof fixtureUrls === 'string' ? message.url === fixtureUrls : message.url !== undefined && fixtureUrls.has(message.url);
  return message.kind === 'requestfailed' && member && message.text === 'net::ERR_ABORTED';
}
/** AbortController may cancel the held fetch or its deliberate HTTP404 body. */
export function isExpectedLifecycleDiagnostic(message: BrowserMessage, kind: 'loading' | 'after-error', packUrl: string): boolean {
  if (message.url !== packUrl) return false;
  if (message.kind === 'requestfailed' && message.text === 'net::ERR_ABORTED') return true;
  return kind === 'after-error' && message.kind === 'console' && message.type === 'error'
    && /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/.test(message.text ?? '');
}
async function noCorsServer(ports?: PortRange): Promise<{ url: string; port: number; close(): Promise<void> }> {
  const { first, last } = ownedRange(ports);
  for (let port = first; port <= last; port++) {
    const server = createServer((_request: unknown, response: any) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"schema":"kiln.scene-pack/1"}'); });
    try {
      await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); done(); }); });
      return { url: `http://127.0.0.1:${port}`, port, close: () => new Promise<void>((done, reject) => { server.closeIdleConnections?.(); server.close((error: Error | undefined) => error ? reject(error) : done()); }) };
    } catch (error) { if ((error as { code?: string }).code !== 'EADDRINUSE') throw error; }
  }
  throw new Error(`No permitted port for CORS fixture in ${first}–${last}`);
}
/** Shared B-01..05/B-11/B-12 suite. Correctness waits are never performance measurements. */
export async function runSceneContractTests(o: SceneContractTestOptions): Promise<SceneContractTestReport> {
  // An invalid range is a caller error: it is refused before any output, server or browser exists.
  const ports = ownedRange(o.ports);
  const workspace = resolve(o.workspace ?? process.cwd()), out = workspacePath(workspace, o.outDir);
  await mkdir(out, { recursive: true });
  const report: SceneContractTestReport = { note: 'Correctness and count-based evidence only. No startup, frame-time or CPU timing is collected.', browser: '', results: [], messages: [], ledger: { ports: [], browserClosed: false, serversClosed: false } };
  const servers: Awaited<ReturnType<typeof serveOwned>>[] = []; let browser: Browser | undefined, page: Page | undefined, expectedDiagnostics = false;
  const callbackRequests = new WeakMap<HTTPRequest, { urls: ReadonlySet<string>; confirmed: boolean; diagnostics: BrowserMessage[] }>();
  const callbackManifestUrls = new Map<string, ReadonlySet<string>>();
  const sceneSelector = o.sceneSelector ?? '.ks-root', hudSelector = o.hudSelector ?? '.ks-hud';
  try {
    for (const root of [o.testRoot, o.publicRoot, o.devRoot]) { const hosted = await serveOwned(workspacePath(workspace, root), ports); servers.push(hosted); report.ledger.ports.push(hosted.port); }
    const [testServer, publicServer, devServer] = servers as [typeof servers[number], typeof servers[number], typeof servers[number]];
    browser = await launchChrome({ workspace, executablePath: o.executablePath, headless: o.headless, windowSize: o.windowSize }); report.ledger.browserPid = browser.process()?.pid;
    report.ledger.browserProfile = browserProfiles.get(browser);
    report.browser = await browser.version();
    page = await browser.newPage(); await page.setViewport({ width: 960, height: 720, deviceScaleFactor: 1 }); page.setDefaultTimeout(CORRECTNESS_TIMEOUT);
    page.on('console', message => report.messages.push({ kind: 'console', type: message.type(), text: message.text(), url: message.location().url, expected: expectedDiagnostics && message.type() === 'error' && /Failed to load resource|Access to fetch.*CORS|net::ERR_FAILED/.test(message.text()) }));
    page.on('pageerror', error => report.messages.push({ kind: 'pageerror', text: String(error) }));
    page.on('requestfailed', request => {
      const message: BrowserMessage = { kind: 'requestfailed', url: request.url(), text: request.failure()?.errorText, expected: expectedDiagnostics };
      const fixture = callbackRequests.get(request);
      if (fixture) {
        fixture.diagnostics.push(message);
        if (fixture.confirmed && isExpectedCallbackFailureDiagnostic(message, fixture.urls)) message.expected = true;
      }
      report.messages.push(message);
    });
    await page.goto(testServer.url, { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT });
    await page.waitForFunction(() => !!(window as any).__kilnHarness, { timeout: CORRECTNESS_TIMEOUT });
    console.log('Contract setup: waiting for the initial scene and GPU teardown');
    await waitForReady(page); await unmount(page, sceneSelector, true);
    const check = async (id: string, fn: () => Promise<unknown>): Promise<boolean> => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const before = report.messages.length;
        console.log(`${id}: START (attempt ${attempt})`);
        try { const details = await fn(); assert.deepEqual(diagnosticFailure(report.messages.slice(before)), [], 'Unexpected browser diagnostics'); report.results.push({ id, status: 'pass', attempt, details }); console.log(`${id}: PASS (attempt ${attempt})`); return true; }
        catch (error) {
          report.results.push({ id, status: 'fail', attempt, error: error instanceof Error ? error.stack : String(error), details: error instanceof Error ? (error as Error & { details?: unknown }).details : undefined });
          console.error(`${id}: FAIL (attempt ${attempt}) ${String(error)}`);
          await page!.evaluate(() => (window as any).__kilnHarness?.unmount()).catch(() => {});
          if (attempt < 2) { expectedDiagnostics = false; await page!.goto(testServer.url, { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT }); }
        }
      }
      return false;
    };
    await check('B-01', async () => {
      // A collapsed page slot is valid. Exercise the root ResizeObserver without
      // relying on a scene-specific harness resize API or a timing threshold.
      await unmount(page!, sceneSelector);
      await page!.evaluate(({selector,options}) => {
        const style=document.createElement('style');style.id='kiln-zero-size-fixture';
        style.textContent=`${selector}{width:0!important;height:0!important}`;document.head.appendChild(style);
        (window as any).__kilnHarness.mount(options);
      },{selector:sceneSelector,options:o.mountOptions ?? {}});
      let collapsed:HarnessSnapshot;
      try {
        await page!.waitForSelector(sceneSelector);await animationFrames(page!,4);
        collapsed=await snapshot(page!);assert.equal(collapsed.readyCount,0);assert.deepEqual(collapsed.errors,[]);
        assert.equal(await page!.$eval(sceneSelector,root=>root.getBoundingClientRect().width),0);
      }finally{await page!.evaluate(()=>document.getElementById('kiln-zero-size-fixture')?.remove());}
      await waitForReady(page!);const value=await snapshot(page!);
      assert.equal(value.readyCount,1);assert.deepEqual(value.errors,[]);await o.afterReady?.(page!);
      await waitFrames(page!,6);assert.equal((await snapshot(page!)).readyCount,1);
      await capture(page!,resolve(out,'B-01-ready.png'));return{...value,zeroSize:{readyCount:collapsed.readyCount,errors:collapsed.errors}};
    });
    await check('B-02', async () => { const value = await mount(page!, { ...o.mountOptions, backend: 'webgl2' }); assert.equal(await page!.$eval(sceneSelector, root => root.getAttribute('data-kiln-backend')), 'webgl2'); assert.equal(value.backend?.forced, true); return value.backend; });
    await check('B-03', async () => { const value = await mount(page!, { ...o.mountOptions, backend: 'auto' }); assert.equal(await page!.$eval(sceneSelector, root => root.getAttribute('data-kiln-backend')), o.expectedBackend ?? 'webgpu'); assert(value.backend?.adapter, 'Backend adapter information is present'); return value.backend; });
    await check('B-04', async () => {
      const cases: unknown[] = [];
      const run = async (kind: '404' | 'hash' | 'schema' | 'cors') => {
        await unmount(page!, sceneSelector); expectedDiagnostics = true;
        let cors: Awaited<ReturnType<typeof noCorsServer>> | undefined;
        const intercept = async (request: HTTPRequest) => {
          if (request.isInterceptResolutionHandled()) return;
          try {
            if (kind === '404' && request.url().includes('/missing-pack/')) return await request.respond({ status: 404, body: 'Not found' });
            if (kind === 'schema' && new URL(request.url()).pathname.endsWith('/pack.json')) return await request.respond({ status: 200, contentType: 'application/json', body: '{"schema":"invalid"}' });
            if (kind === 'hash' && new URL(request.url()).pathname.endsWith('.glb')) {
              assertOwnedUrl(request.url(), new Set(report.ledger.ports), ports); const response = await fetch(request.url()), bytes = new Uint8Array(await response.arrayBuffer()); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
              return await request.respond({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from(bytes) });
            }
            await request.continue();
          } catch { if (!request.isInterceptResolutionHandled()) await request.abort(); }
        };
        await page!.setRequestInterception(true); page!.on('request', intercept);
        try {
          if (kind === 'cors') { cors = await noCorsServer(ports); servers.push(cors); report.ledger.ports.push(cors.port); }
          await page!.evaluate(options => (window as any).__kilnHarness.mount(options), { ...o.mountOptions, ...(kind === '404' ? { assetBase: testServer.url + '/missing-pack/' } : kind === 'cors' ? { assetBase: cors!.url + '/' } : {}) });
          await page!.waitForFunction(() => (window as any).__kilnHarness.snapshot().errors.length > 0, { timeout: CORRECTNESS_TIMEOUT });
          const value = await snapshot(page!); assert.equal(value.errors.length, 1); assert.equal(value.readyCount, 0);
          assert.equal(value.errors[0]!.code, kind === 'hash' ? 'asset-hash' : kind === 'schema' ? 'pack-invalid' : 'asset-fetch');
          if (kind === 'hash') assert.match(value.errors[0]!.message, /\.glb/);
          await animationFrames(page!); assert.equal((await snapshot(page!)).errors.length, 1); cases.push({ kind, value });
        } finally { await unmount(page!, sceneSelector); page!.off('request', intercept); await page!.setRequestInterception(false); expectedDiagnostics = false; }
      };
      for (const kind of ['404', 'hash', 'schema', 'cors'] as const) await run(kind);
      if(o.renderFailureOptions){
        await page!.evaluate(options => (window as any).__kilnHarness.mount(options),{...o.mountOptions,...o.renderFailureOptions});
        await page!.waitForFunction(()=>(window as any).__kilnHarness.snapshot().errors.length>0,{timeout:CORRECTNESS_TIMEOUT});
        await animationFrames(page!);
        const value=await snapshot(page!);assert.equal(value.errors.length,1);assert.equal(value.errors[0]!.code,'runtime');assert.equal(value.readyCount,0);
        cases.push({kind:'react-render',value});await unmount(page!,sceneSelector);
      }
      for(const fixture of o.callbackFailureOptions ?? []){
        const options={...o.mountOptions,...fixture.options};
        const packUrl=await page!.evaluate(value=>{
          const configured=typeof value.assetBase==='string'?value.assetBase:document.querySelector<HTMLMetaElement>('meta[name="kiln-asset-base"]')?.content ?? './assets/';
          const base=new URL(configured,document.baseURI);base.pathname=base.pathname.replace(/\/*$/,'/');base.search='';base.hash='';return new URL('pack.json',base).href;
        },options);
        assertOwnedUrl(packUrl,new Set(report.ledger.ports),ports);
        let urls=callbackManifestUrls.get(packUrl);
        if(!urls){
          // A callback can fail after manifest loading starts parallel data/model requests. Bind cancellation
          // evidence to exact declared file URLs AND HTTPRequest identity; an unrelated same-origin abort stays fatal.
          const response=await fetch(packUrl);assert(response.ok,'Callback fixture manifest is readable');
          const manifest=await response.json() as {files?:{path:string}[]};
          assert(Array.isArray(manifest.files),'Callback fixture has a file manifest');
          const declared=new Set([packUrl]);
          for(const file of manifest.files){const url=new URL(file.path,packUrl).href;assertOwnedUrl(url,new Set(report.ledger.ports),ports);declared.add(url);}
          urls=declared;callbackManifestUrls.set(packUrl,urls);
        }
        const context={urls,confirmed:false,diagnostics:[] as BrowserMessage[]};
        // Track request identity as well as URL: a same-URL request from another
        // mount never inherits this fixture's deliberate fatal cancellation.
        const track=(request:HTTPRequest)=>{if(context.urls.has(request.url()))callbackRequests.set(request,context);};
        page!.on('request',track);
        try{
          await page!.evaluate(value=>(window as any).__kilnHarness.mount(value),options);
          await page!.waitForFunction(()=>(window as any).__kilnHarness.snapshot().errors.length>0,{timeout:CORRECTNESS_TIMEOUT});
          await page!.waitForFunction(()=>(window as any).__kilnHarness.snapshot().fiberRoots===0,{timeout:CORRECTNESS_TIMEOUT});
          const value=await snapshot(page!);assert.equal(value.errors.length,1);assert.equal(value.errors[0]!.code,'runtime');assert.equal(value.readyCount,0);
          context.confirmed=true;
          for(const message of context.diagnostics)if(isExpectedCallbackFailureDiagnostic(message,context.urls))message.expected=true;
          await unmount(page!,sceneSelector);await animationFrames(page!);
          cases.push({kind:`callback-${fixture.name}`,value,packUrl,cancelledRequests:context.diagnostics});
        }finally{page!.off('request',track);}
      }
      return cases;
    });
    await check('B-05', async () => {
      // R2-13 is fixed before acceptance: never extend initialization in response
      // to a byte count. Cold results remain separate, visible evidence.
      const initialization: unknown[] = [], cycles: unknown[] = [], cancellations: unknown[] = [], trendCycles: unknown[] = [];
      const trend: Record<string, unknown> = { decision: 'C-04', gate: false, cycles: trendCycles, requiredCycles: 10 };
      const evidence: Record<string, unknown> = {
        protocol: { decision: 'R2-13/C-04', listenerException: 'C-03', coldBaseline: 'Fresh document after initial auto-mount; not process-cold', backendInitializationFrames: 120, initializationCycles: 10, measuredCycles: 10, trendCycles: 10, thresholdExclusive: 1.05, adaptiveInitialization: false },
        initialization, cycles, cancellations, trend,
      };
      let baselineListeners: Record<string, number> | undefined;
      let baselineReactDocumentMarkers: TeardownListenerAudit['reactDocumentMarkers'] | undefined;
      const receiptCount = async () => (await snapshot(page!)).disposals?.length ?? 0;
      const retainRoot = () => page!.evaluate(selector => { (window as any).__kilnDetachedRoot = document.querySelector(selector); }, sceneSelector);
      const auditTeardown = async (label: string, previousReceipts: number, records: unknown[]) => {
        await unmount(page!, sceneSelector);
        // Fatal cleanup can publish its receipt before explicit unmount. The
        // count is captured before mounting, so either ordering is accepted.
        await page!.waitForFunction(previous => ((window as any).__kilnHarness.snapshot().disposals?.length ?? 0) > previous, { timeout: CORRECTNESS_TIMEOUT }, previousReceipts);
        await animationFrames(page!);
        const listenerAudit = await teardownListenerAudit(page!);
        const listeners = Object.fromEntries(Object.entries(listenerAudit.listeners).map(([target, entries]) => [target, entries.length]));
        await page!.evaluate(() => { delete (window as any).__kilnDetachedRoot; });
        const canvasAbsent = !(await page!.$('canvas')), hudAbsent = !(await page!.$(hudSelector));
        const usageBeforeGc = await heapUsage(page!), usageAfterGc = await heapUsage(page!, true), state = await snapshot(page!);
        const receipts = state.disposals?.slice(previousReceipts) ?? [];
        const value = { label, listeners, listenerAudit, canvasAbsent, hudAbsent, usageBeforeGc, usageAfterGc, snapshot: state, receipts };
        records.push(value);
        console.log(`B-05 ${label}: ${usageAfterGc.usedSize} heap bytes after GC; ${usageAfterGc.backingStorageSize} backing bytes`);
        assertTeardownListenerAudit(listenerAudit);
        if (baselineReactDocumentMarkers) assert.deepEqual(listenerAudit.reactDocumentMarkers, baselineReactDocumentMarkers, 'The same single React document marker remains throughout the cycles');
        else baselineReactDocumentMarkers = listenerAudit.reactDocumentMarkers;
        const globalListeners = { window: listeners.window, document: listeners.document } as Record<string, number>;
        if (baselineListeners) assert.deepEqual(globalListeners, baselineListeners); else baselineListeners = globalListeners;
        assert(canvasAbsent && hudAbsent, 'No canvas or HUD remains after unmount');
        assert.equal(state.callbacksAfterUnmount ?? 0, 0, 'No callback occurs after unmount');
        assert.equal(receipts.length, 1, 'Each completed mount releases exactly one owned backend');
        assert(receipts.every(receipt => receipt.disposed && (receipt.resources ?? 0) === 0 && (receipt.backend === null || (receipt.backend === 'webgpu' ? receipt.deviceLost : receipt.contextLost))), 'Every owned backend was released');
        return value;
      };
      const completeCycle = async (label: string, backend: 'auto' | 'webgl2', frames: number, records: unknown[]) => {
        const previous = await receiptCount(); await mount(page!, { ...o.mountOptions, backend });
        if (frames) await waitFrames(page!, frames);
        await retainRoot(); return auditTeardown(label, previous, records);
      };
      try {
        const coldRecords: unknown[] = []; evidence.cold = coldRecords;
        // B-01..04 and retry history must not choose this test's starting state.
        await page!.goto(testServer.url, { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT }); await waitForReady(page!);
        const initialReceiptCount = await receiptCount(); await retainRoot();
        const cold = await auditTeardown('document-initialized-cold', initialReceiptCount, coldRecords);
        for (const backend of ['auto', 'webgl2'] as const) await completeCycle(`initialize-${backend}-120-frames`, backend, 120, initialization);
        for (let i = 0; i < 10; i++) await completeCycle(`initialize-cycle-${i + 1}`, i % 2 ? 'webgl2' : 'auto', 0, initialization);
        const beforeUsage = await heapUsage(page!, true), before = beforeUsage.usedSize;
        Object.assign(evidence, { beforeBytes: before, beforeUsage, baselineListeners, baselineReactDocumentMarkers, coldInitializationGrowthRatio: before / cold.usageAfterGc.usedSize });
        for (let i = 0; i < 10; i++) await completeCycle(`measured-cycle-${i + 1}`, i % 2 ? 'webgl2' : 'auto', 0, cycles);

        const cancellation = async (kind: 'loading' | 'after-error') => {
          const assetBase = `${testServer.url}/b05-${kind}/`, packUrl = assetBase + 'pack.json', pending: HTTPRequest[] = [];
          const previous = await receiptCount(), diagnosticStart = report.messages.length;
          const hold = (request: HTTPRequest) => {
            if (request.isInterceptResolutionHandled()) return;
            if (request.url() === packUrl) pending.push(request); else void request.continue();
          };
          await page!.setRequestInterception(true); page!.on('request', hold);
          try {
            const packRequested = page!.waitForRequest(request => request.url() === packUrl, { timeout: CORRECTNESS_TIMEOUT });
            await page!.evaluate(options => (window as any).__kilnHarness.mount(options), { ...o.mountOptions, assetBase });
            const request = await packRequested;
            await page!.waitForFunction(selector => !!document.querySelector(selector)?.getAttribute('data-kiln-backend'), { timeout: CORRECTNESS_TIMEOUT }, sceneSelector);
            await retainRoot();
            const waiting = await snapshot(page!); assert.equal(waiting.readyCount, 0); assert.equal(waiting.errors.length, 0);
            if (kind === 'after-error') {
              await request.respond({ status: 404, body: 'Intentional B-05 pack failure' });
              await page!.waitForFunction(() => (window as any).__kilnHarness.snapshot().errors.length > 0, { timeout: CORRECTNESS_TIMEOUT });
              const failed = await snapshot(page!); assert.equal(failed.errors.length, 1); assert.equal(failed.errors[0]!.code, 'asset-fetch'); assert.equal(failed.readyCount, 0);
            }
            await auditTeardown(`cancel-${kind}`, previous, cancellations);
          } finally {
            page!.off('request', hold);
            for (const request of pending) if (!request.isInterceptResolutionHandled()) await request.abort('aborted').catch(() => {});
            await page!.setRequestInterception(false); await animationFrames(page!);
            // Only the exact held URL's abort or intentional HTTP404 is expected.
            // Other requests, warnings and page exceptions remain failures.
            for (const message of report.messages.slice(diagnosticStart)) {
              if (isExpectedLifecycleDiagnostic(message, kind, packUrl)) message.expected = true;
            }
          }
        };
        await cancellation('loading'); await cancellation('after-error');
        const afterUsage = await heapUsage(page!, true), after = afterUsage.usedSize, final = await snapshot(page!);
        const measuredGrowthBytes = after - before;
        Object.assign(evidence, { afterBytes: after, afterUsage, growthRatio: after / before, measuredGrowthBytes, measuredPass: after < before * 1.05, coldTotalGrowthRatio: after / cold.usageAfterGc.usedSize, final });
        assert.equal(final.readyCount, 0); assert.equal(final.errors.length, 1); assert.equal(final.callbacksAfterUnmount ?? 0, 0);
        // Keep the measured endpoint above unchanged. C-04's third block is
        // collected even when that stored measured heap threshold will fail.
        Object.assign(trend, { beforeBytes: after, beforeUsage: afterUsage, measuredGrowthBytes });
        for (let i = 0; i < 10; i++) await completeCycle(`trend-cycle-${i + 1}`, i % 2 ? 'webgl2' : 'auto', 0, trendCycles);
        const trendAfterUsage = await heapUsage(page!, true), trendAfter = trendAfterUsage.usedSize, trendGrowthBytes = trendAfter - after;
        const investigateBeforeM4 = trendGrowthBytes >= measuredGrowthBytes;
        Object.assign(trend, { afterBytes: trendAfter, afterUsage: trendAfterUsage, growthBytes: trendGrowthBytes, growthRatio: trendAfter / after,
          comparison: 'third-block growthBytes >= measured-block growthBytes', investigateBeforeM4, final: await snapshot(page!) });
        console.log(`B-05 C-04 trend: ${trendGrowthBytes} bytes versus measured ${measuredGrowthBytes}; investigateBeforeM4=${investigateBeforeM4}; not a heap gate`);
        assert(after < before * 1.05, `Heap count grew by 5 percent or more (${before} -> ${after})`);
        return evidence;
      } catch (error) { if (error instanceof Error) Object.assign(error, { details: evidence }); throw error; }
    });
    await check('B-11', async () => {
      await mount(page!, o.mountOptions); await page!.addScriptTag({ content: o.axeSource ?? axe.source });
      const violations = await page!.evaluate(async selector => { const result = await (window as any).axe.run({ include: [selector], exclude: ['canvas'] }); return result.violations.filter((entry: any) => entry.impact === 'serious' || entry.impact === 'critical'); }, hudSelector);
      assert.deepEqual(violations, []);
      await page!.focus(sceneSelector); await page!.keyboard.press('Enter'); await waitFrames(page!, 3);
      assert.equal(await page!.evaluate(() => (window as any).__kilnScene.motionPolicy().paused), false);
      const flow = await o.accessibilityFlow?.(page!);
      const escapeBefore = (await snapshot(page!)).shellEscapes ?? 0;
      await page!.focus(sceneSelector); await page!.keyboard.press('Escape'); await waitFrames(page!, 2); assert.equal((await snapshot(page!)).shellEscapes ?? 0, escapeBefore);
      await page!.keyboard.press('Escape'); await waitFrames(page!, 2); assert.equal((await snapshot(page!)).shellEscapes, escapeBefore + 1);
      await page!.focus(sceneSelector); await page!.keyboard.press('Tab'); assert.equal(await page!.$eval(sceneSelector, root => document.activeElement !== root), true);
      assert(await page!.$('[aria-live="polite"]'), 'Status is announced');
      await page!.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await waitFrames(page!, 3);
      const motion = await page!.evaluate(() => (window as any).__kilnScene.motionPolicy()); assert.equal(motion.reduced, true);
      assert.equal(typeof motion.ambient, 'number', 'Motion policy exposes the ambient clock for evidence');
      await waitFrames(page!, 8); const laterMotion = await page!.evaluate(() => (window as any).__kilnScene.motionPolicy());
      assert.equal(laterMotion.ambient, motion.ambient, 'Ambient motion freezes'); assert(laterMotion.time > motion.time, 'Simulation time continues');
      const other = await browser!.newPage(); await other.goto('about:blank'); await other.bringToFront();
      try {
        await page!.waitForFunction(() => (window as any).__kilnScene.motionPolicy().paused, { polling: 50, timeout: CORRECTNESS_TIMEOUT });
        const first = await page!.evaluate(() => (window as any).__kilnScene.stats().render.frame); await animationFrames(other, 8);
        const second = await page!.evaluate(() => (window as any).__kilnScene.stats().render.frame); assert.equal(second, first);
      } finally { await other.close(); await page!.bringToFront(); }
      await page!.waitForFunction(() => !(window as any).__kilnScene.motionPolicy().paused, { polling: 50, timeout: CORRECTNESS_TIMEOUT }); await waitFrames(page!, 3);
      await page!.emulateMediaFeatures([]);
      const controls = await page!.evaluate(selector => Array.from(document.querySelectorAll<HTMLElement>(`${selector} button, ${selector} select`)).filter(element => element.getBoundingClientRect().width > 0).map(element => {
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element); return { label: element.getAttribute('aria-label') ?? element.textContent, width: rect.width, height: rect.height, color: style.color, background: style.backgroundColor };
      }), hudSelector);
      assert(controls.length > 0); assert(controls.every(control => control.width >= 44 && control.height >= 44 && control.label?.trim()), 'Named controls have 44px targets');
      for (const control of controls) assert(contrastRatio(control.color, control.background) >= 4.5, `Text contrast: ${control.label}`);
      return { violations, motion, controls, sceneFlow: flow };
    });
    await check('B-12', async () => {
      await unmount(page!, sceneSelector); await page!.goto(publicServer.url + '/?backend=webgl2&tier=minimal&assetBase=/missing/&dev=1', { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT });
      await page!.waitForFunction(selector => document.querySelector(selector)?.getAttribute('data-kiln-backend'), { timeout: CORRECTNESS_TIMEOUT }, sceneSelector);
      assert.equal(await page!.evaluate(() => '__kilnScene' in window), false); assert.equal(await page!.$('.ks-dev-panel'), null);
      assert.equal(await page!.$eval(sceneSelector, root => root.getAttribute('data-kiln-backend')), o.expectedBackend ?? 'webgpu', 'Public backend URL parameter is ignored');
      await page!.waitForSelector(hudSelector,{timeout:CORRECTNESS_TIMEOUT});
      await page!.addScriptTag({content:o.axeSource ?? axe.source});
      const publicViolations=await page!.evaluate(async selector=>{const result=await (window as any).axe.run({include:[selector],exclude:['canvas']});return result.violations.filter((entry:any)=>entry.impact==='serious'||entry.impact==='critical');},hudSelector);
      assert.deepEqual(publicViolations,[],'A9: public HUD has no serious or critical axe violations');
      await page!.goto(devServer.url + '/?dev=1', { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT }); await waitForReady(page!); assert(await page!.$('.ks-dev-panel'));
      return { publicHooksAbsent: true, publicDeveloperPanelAbsent: true, publicUrlFlagsIgnored: true, developerPanelPresent: true,publicAxeViolations:publicViolations };
    });
    await page.goto(testServer.url, { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT });
    await o.extraChecks?.({ page, browser, testUrl: testServer.url, check });
  } catch (error) { report.results.push({ id: 'harness', attempt: 1, status: 'fail', error: error instanceof Error ? error.stack : String(error) }); console.error('Contract harness: FAIL ' + String(error)); }
  finally {
    try { await browser?.close(); report.ledger.browserClosed = true; }
    finally {
      const closed = await Promise.allSettled(servers.map(server => server.close())); report.ledger.serversClosed = closed.every(result => result.status === 'fulfilled');
      for (const result of closed) if (result.status === 'rejected') report.results.push({ id: 'cleanup', attempt: 1, status: 'fail', error: String(result.reason) });
      await writeFile(resolve(out, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(`Contract cleanup: browser=${report.ledger.browserClosed}, servers=${report.ledger.serversClosed}`);
    }
  }
  return report;
}
function rgb(color: string): number[] { const values = color.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255]; const alpha = values[3] ?? 1; return values.slice(0, 3).map(value => (value * alpha + 255 * (1 - alpha)) / 255); }
function luminance(color: string): number { const c = rgb(color).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4); return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722; }
export function contrastRatio(a: string, b: string): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

/** `ports` is the optional owned port range `url` must lie in (GG-001 / FF-001); default 4400–4499. */
export interface PerformanceRunOptions { url: string; ownedPorts: ReadonlySet<number>; ports?: PortRange; workspace?: string; executablePath?: string; headless?: boolean; tier: string; backend: 'webgpu' | 'webgl2'; workload: string; seconds: number; out?: string; smoke?: boolean }
/** Opt-in timing runner for the idle qualification machines. A local smoke must be exactly five seconds and discards every number. */
export async function runPerformance(o: PerformanceRunOptions): Promise<Record<string, unknown>> {
  assertOwnedUrl(o.url, o.ownedPorts, o.ports);
  if (o.smoke && o.seconds !== 5) throw new Error('The local smoke run is exactly five seconds');
  if (!(o.seconds > 0) || !Number.isFinite(o.seconds)) throw new Error('Positive duration required');
  const workspace = resolve(o.workspace ?? process.cwd()); let browser: Browser | undefined;
  try {
    browser = await launchChrome({ workspace, executablePath: o.executablePath, headless: o.headless, name: 'perf' }); const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { (window as any).__kilnMeasureRequested = true; });
    const url = new URL(o.url); url.searchParams.set('tier', o.tier); if (o.backend === 'webgl2') url.searchParams.set('backend', 'webgl2');
    await page.goto(url.href, { waitUntil: 'load', timeout: CORRECTNESS_TIMEOUT }); await waitForReady(page);
    await page.evaluate(name => { const api = (window as any).__kilnScene; api.beginMeasurement(); api.runWorkload(name); api.recordFrames(true); }, o.workload);
    // The timer belongs only to an explicitly requested qualification or smoke run.
    await page.evaluate(seconds => new Promise<void>(done => setTimeout(done, seconds * 1000)), o.seconds);
    const report = await page.evaluate(() => {
      const api = (window as any).__kilnScene; api.recordFrames(false); api.endMeasurement?.(); const frames: number[] = api.frameTimes(), sorted = frames.slice().sort((a, b) => a - b), stats = api.stats(), tier = api.tierState();
      const percentile = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : 0;
      return { device: navigator.userAgent, browser: navigator.userAgent, backend: document.querySelector('.ks-root')?.getAttribute('data-kiln-backend'), adapter: api.events.find((event: any) => event.type === 'backend')?.value?.adapter ?? null, tier: tier.tier, frames: frames.length, medianMs: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), cpuRenderMedianMs: stats.cpuRenderMedianMs ?? null, drawCalls: stats.render?.drawCalls, triangles: stats.render?.triangles, longTasks: stats.longTasks ?? null, governorChanges: api.events.filter((event: any) => event.type === 'tier' && event.value?.kind === 'live'), readyMs: stats.readyMs ?? null };
    });
    if (o.smoke) { assert(report.frames > 0, 'Recorder collected frames'); return { smoke: 'passed', numbers: 'discarded' }; }
    const result = { ...report, browser: await browser.version(), workload: o.workload }; if (o.out) { const path = workspacePath(workspace, o.out); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(result, null, 2) + '\n'); } return result;
  } finally { await browser?.close(); }
}
