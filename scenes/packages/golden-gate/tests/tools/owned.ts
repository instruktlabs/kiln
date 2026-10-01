// Golden Gate process ownership helpers. The builder may serve only on ports 4600-4649.
// The kit's serveOwned/assertOwnedUrl/runSceneContractTests are fixed to 4400-4499
// (kit request GG-001), so this package binds its own range with the kit's static server.
// Binding is attempted directly (EADDRINUSE moves on): no listener is ever probed.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
// @ts-ignore Shared Node-builtins-only implementation owned by the kit builder (read-only use).
import { startStaticServer } from '../../../../scripts/static-server.mjs';

export const PORT_FIRST = 4600, PORT_LAST = 4649;
export const PACKAGE_ROOT = resolve(import.meta.dir, '../..');
export const SCENES_ROOT = resolve(PACKAGE_ROOT, '../..');
export interface Hosted { url: string; port: number; close(): Promise<void> }

export async function serveOwned(root: string, avoid: ReadonlySet<number> = new Set()): Promise<Hosted> {
  for (let port = PORT_FIRST; port <= PORT_LAST; port++) {
    if (avoid.has(port)) continue;
    try { const hosted = await startStaticServer({ root: resolve(root), port }); return { url: hosted.url, port, close: hosted.close }; }
    catch (error) { if ((error as { code?: string }).code !== 'EADDRINUSE') throw error; }
  }
  throw new Error('No Golden Gate port (4600-4649) is available');
}
export function assertOwnedUrl(url: string, owned: ReadonlySet<number>): void {
  const value = new URL(url), port = Number(value.port || 80);
  if (value.protocol !== 'http:' || value.hostname !== '127.0.0.1' || port < PORT_FIRST || port > PORT_LAST || !owned.has(port)) throw new Error(`Refusing non-owned URL ${url}`);
}
/**
 * Owner rule (2026-09-29 11:40): every browser check on this PC runs headless (Chrome's new
 * headless mode) with an explicit window size and viewport, so nothing opens on a display.
 * The profile lives in the package's .tmp and is removed after close.
 */
export interface OwnedBrowser { browser: import('puppeteer-core').Browser; pid: number | undefined; profile: string; close(): Promise<void> }
export async function launchHeadless(name: string, width = 1280, height = 720): Promise<OwnedBrowser> {
  const puppeteer = (await import('puppeteer-core')).default, { mkdtemp, rm } = await import('node:fs/promises');
  const scratch = resolve(PACKAGE_ROOT, '.tmp'); mkdirSync(scratch, { recursive: true });
  const profile = await mkdtemp(resolve(scratch, `${name}-chrome-`));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, pipe: true, userDataDir: profile,
    defaultViewport: { width, height, deviceScaleFactor: 1 },
    args: ['--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check', `--window-size=${width},${height}`, '--hide-scrollbars'],
    env: { ...process.env, TEMP: scratch, TMP: scratch },
  });
  let closed = false;
  return { browser, pid: browser.process()?.pid, profile, async close() {
    if (closed) return; closed = true;
    try { await browser.close(); } finally { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined); }
  } };
}
export function evidencePath(...parts: string[]): string { const path = resolve(PACKAGE_ROOT, 'evidence', ...parts); mkdirSync(resolve(path, '..'), { recursive: true }); return path; }
export function writeJson(path: string, value: unknown): void { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); }
export function readJson<T>(path: string): T | null { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : null; }
export const FALLBACK_WARNING = /THREE\.WebGPURenderer: WebGPU is not available, running under WebGL2 backend\./;
export interface ConsoleRecord { kind: string; type?: string; text?: string; url?: string }
/** Section 18: any console error or warning fails, except three's single WebGL2 fallback warning. */
export function unexpectedMessages(messages: ConsoleRecord[]): ConsoleRecord[] {
  return messages.filter(m => m.kind !== 'console' || m.type === 'error' || (m.type === 'warn' && !FALLBACK_WARNING.test(m.text ?? '')) || m.type === 'warning' && !FALLBACK_WARNING.test(m.text ?? ''));
}
