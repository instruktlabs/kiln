/** Keep one startup tab until browser.close(): closing its last window exits headed Chrome. */
export async function closeExtraStartupPages(browser: { pages(): Promise<{ close(): Promise<void> }[]> }): Promise<void> {
  for (const page of (await browser.pages()).slice(1)) await page.close();
}
