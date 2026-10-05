import { afterEach, expect, spyOn, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Browser, LaunchOptions } from 'puppeteer-core';
import * as helpers from '../../src/testing/node';
import { launchHeadless as launchGoldenGate } from '../../../golden-gate/tests/tools/owned';
import { launchHeadless as launchFoundry } from '../../../foundry-floor/tests/tools/owned';

const workspaces: string[] = [];
afterEach(async () => { await Promise.all(workspaces.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'kiln chrome tests ')); workspaces.push(workspace);
  const executablePath = join(workspace, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
  await writeFile(executablePath, '#!/bin/sh\nexit 0\n'); await chmod(executablePath, 0o700);
  return { workspace, executablePath };
}

test('Chrome discovery prefers explicit configuration, then environment, then executable PATH entries', async () => {
  const { workspace, executablePath } = await fixture();
  const env = { KILN_CHROME: executablePath, CHROME: '/not-selected', PATH: '' };
  expect(await helpers.resolveChromeExecutable({ env })).toBe(executablePath);
  expect(await helpers.resolveChromeExecutable({ executablePath, env: { KILN_CHROME: '/not-selected' } })).toBe(executablePath);
  expect(await helpers.resolveChromeExecutable({ env: { CHROME: executablePath, PATH: '' } })).toBe(executablePath);
  expect(await helpers.resolveChromeExecutable({ env: { PUPPETEER_EXECUTABLE_PATH: executablePath, PATH: '' } })).toBe(executablePath);
  expect(await helpers.resolveChromeExecutable({ env: { PATH: workspace }, platform: process.platform })).toBe(executablePath);
  await expect(helpers.resolveChromeExecutable({ executablePath: join(workspace, 'missing'), env })).rejects.toThrow('Configured Chrome executable');
  await expect(helpers.resolveChromeExecutable({ executablePath: workspace, env })).rejects.toThrow('Configured Chrome executable');
  if (process.platform !== 'win32') {
    await chmod(executablePath, 0o600);
    await expect(helpers.resolveChromeExecutable({ executablePath, env })).rejects.toThrow('Configured Chrome executable');
  }
});

test('Windows discovery covers PATH, system and per-user installs without consulting Linux paths', () => {
  const candidates = helpers.chromeExecutableCandidates('win32', {
    PATH: 'D:\\Tools;E:\\Browser', ProgramFiles: 'D:\\Apps', 'ProgramFiles(x86)': 'D:\\Apps32', LOCALAPPDATA: 'D:\\User\\Local',
  });
  expect(candidates).toContain(win32.join('D:\\Tools', 'chrome.exe'));
  expect(candidates).toContain(win32.join('D:\\Apps', 'Google/Chrome/Application/chrome.exe'));
  expect(candidates).toContain(win32.join('D:\\Apps32', 'Google/Chrome/Application/chrome.exe'));
  expect(candidates).toContain(win32.join('D:\\User\\Local', 'Google/Chrome/Application/chrome.exe'));
  expect(candidates.some(path => path.startsWith('/'))).toBe(false);
  expect(helpers.chromeExecutableCandidates('linux', { PATH: '/browser/bin' })).toContain('/browser/bin/chromium');
});

test('a failed launch removes only its newly created profile and preserves the launch error', async () => {
  const options = await fixture(), scratch = join(options.workspace, '.tmp');
  await mkdir(join(scratch, 'someone-elses-profile'), { recursive: true });
  const failure = new Error('Chrome startup failed'); let profile = '';
  const launch = spyOn(puppeteer, 'launch').mockImplementation(async o => {
    profile = o!.userDataDir!; expect(existsSync(profile)).toBe(true); throw failure;
  });
  try {
    await expect(helpers.launchChrome(options)).rejects.toBe(failure);
    expect(existsSync(profile)).toBe(false);
    expect(await readdir(scratch)).toEqual(['someone-elses-profile']);
  } finally { launch.mockRestore(); }
});

test('closing a shared browser is idempotent and waits for close before removing its profile', async () => {
  const options = await fixture(); let profile = '', closes = 0;
  let finish!: () => void;
  const browser = { close: async () => { closes++; await new Promise<void>(resolve => { finish = resolve; }); } } as Browser;
  const launch = spyOn(puppeteer, 'launch').mockImplementation(async o => { profile = o!.userDataDir!; return browser; });
  try {
    const owned = await helpers.launchChrome({ ...options, windowSize: [800, 600], args: ['--hide-scrollbars'] });
    const first = owned.close(), second = owned.close();
    expect(existsSync(profile)).toBe(true); expect(closes).toBe(1);
    finish(); await Promise.all([first, second]);
    expect(existsSync(profile)).toBe(false);
    await owned.close(); expect(closes).toBe(1);
  } finally { launch.mockRestore(); }
});

test('close failure still cleans the owned profile and remains visible to the caller', async () => {
  const options = await fixture(); let profile = '';
  const failure = new Error('browser close failed');
  const browser = { close: async () => { throw failure; } } as Browser;
  const launch = spyOn(puppeteer, 'launch').mockImplementation(async o => { profile = o!.userDataDir!; return browser; });
  try {
    const owned = await helpers.launchChrome(options);
    await expect(owned.close()).rejects.toBe(failure);
    expect(existsSync(profile)).toBe(false);
  } finally { launch.mockRestore(); }
});

test('Golden Gate and Foundry use the shared executable and retain their window, viewport and cleanup contract', async () => {
  const { executablePath } = await fixture(), prior = process.env.KILN_CHROME;
  process.env.KILN_CHROME = executablePath;
  let options: LaunchOptions | undefined, closes = 0;
  const launch = spyOn(puppeteer, 'launch').mockImplementation(async o => {
    options = o; return { process: () => ({ pid: 123 }), close: async () => { closes++; } } as unknown as Browser;
  });
  try {
    for (const start of [launchGoldenGate, launchFoundry]) {
      const owned = await start('portable-test', 777, 555);
      try {
        expect(options!.executablePath).toBe(executablePath);
        expect(options!.defaultViewport).toEqual({ width: 777, height: 555, deviceScaleFactor: 1 });
        expect(options!.args).toContain('--window-size=777,555');
        expect(options!.args).toContain('--hide-scrollbars');
        expect(owned.pid).toBe(123); expect(owned.profile).toBe(options!.userDataDir!);
      } finally { await owned.close(); }
      expect(existsSync(owned.profile)).toBe(false);
    }
    expect(closes).toBe(2);
  } finally {
    launch.mockRestore();
    if (prior === undefined) delete process.env.KILN_CHROME; else process.env.KILN_CHROME = prior;
  }
});
