import { expect, test } from 'bun:test';
import { closeExtraStartupPages } from '../browser-startup';

// Headed Chrome exits when its last window closes, unlike headless Chrome.
function headedBrowser(startupTabs: number) {
  let connected = true;
  const open = new Set<{ close(): Promise<void> }>();
  const newPage = async () => {
    if (!connected) throw new Error('Target.createTarget failed: browser window closed');
    const page = { async close() { open.delete(page); if (!open.size) connected = false; } };
    open.add(page);
    return page;
  };
  return {
    async start() { return Promise.all(Array.from({ length: startupTabs }, () => newPage())); },
    browser: {
      pages: async () => [...open],
      newPage,
      async close() { for (const page of [...open]) await page.close(); connected = false; },
    },
    isConnected: () => connected,
  };
}

test.each([1, 3])('fresh capture pages survive startup cleanup with %i initial tab(s)', async startupTabs => {
  const owned = headedBrowser(startupTabs);
  const initial = await owned.start();
  await closeExtraStartupPages(owned.browser);
  // Reproduce the actual runner lifetime: every capture opens and closes its own page.
  for (let capture = 0; capture < 3; capture++) {
    const page = await owned.browser.newPage();
    expect(initial).not.toContain(page);
    await page.close();
    expect(owned.isConnected()).toBe(true);
  }
  expect(await owned.browser.pages()).toEqual([initial[0]!]);
  await owned.browser.close();
  expect(owned.isConnected()).toBe(false);
  expect(await owned.browser.pages()).toEqual([]);
});
