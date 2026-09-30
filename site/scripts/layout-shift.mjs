import { EXPAND_SCRIPT } from '../src/lib/code-preview.ts';

/**
 * Layout shift of one page in a real browser, for the check that collapsing a source block does not move what the reader
 * is looking at (`scripts/verify-source.mjs`). A 12000 px window puts every block and everything after it on screen, so a
 * shift anywhere on the page is counted; the score is what the browser reports (`layout-shift` entries without recent input).
 *
 * The page's own shift has to be kept out of the comparison. The 3D viewer reveals its Open control once its script has
 * run, which moves everything below it down 28 px. Whether the browser has painted by then is a race, and the taller page
 * (the one whose block is not collapsed) loses it more often, so with the viewer live the same page scores 0.0000 on one
 * load and 0.0020 on the next, and the page with the script scored worse than the page without it on some runs and better
 * on others. The measured loads therefore run with the viewer held off: an inert element takes the name `asset-viewer`, the
 * viewer's script finds the name taken and leaves the control hidden, as the served HTML has it. Only the returning load
 * keeps the viewer live, because that is the page as a visitor gets it, and it reports whether the control was revealed.
 */

/** How long after the load event the deferred collapse of the control runs. */
export const LATE_MS = 300;

const CALL = '(document.currentScript.parentElement);';

/**
 * The collapse script with its work moved to `LATE_MS` after the load event: what a collapse that came after the first paint
 * would do to the page. It is the control of the comparison. A check that finds no difference between the page with the script
 * and the page without it proves nothing until it is shown to find a difference when there is one.
 */
export function lateCollapseScript(script = EXPAND_SCRIPT) {
  if (!script.endsWith(CALL)) throw new Error('The collapse script no longer ends by calling itself on the block that holds it; lateCollapseScript has to follow.');
  const work = script.slice(0, -CALL.length);
  return `(function (block) { window.addEventListener("load", function () { setTimeout(function () { ${work}(block); }, ${LATE_MS}); }); })(document.currentScript.parentElement);`;
}

/**
 * One measured page: two loads in one tab, the second one counted.
 *
 *   returning  the page as a returning visitor gets it: cache on, the viewer live.
 *   served     first load (interception switches the cache off), collapse script as served, viewer held off.
 *   stripped   the same with the collapse script removed from the HTML.
 *   late       the same with the collapse deferred until after the load (the control).
 *
 * Returns `{ total, collapsed, revealed, shifts }`: the score, whether the block ended collapsed, whether the viewer's Open
 * control is shown (null on a page without a viewer), and each shift with what moved (up to three nodes, by how far).
 */
export async function shiftOf(browser, { base, route, block, width, mode, onError = () => {} }) {
  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument((holdViewer) => {
      if (holdViewer) customElements.define('asset-viewer', class extends HTMLElement {});
      const describe = (node) => {
        const element = node && node.nodeType === 1 ? node : node?.parentElement;
        if (!element) return null;
        const classes = typeof element.className === 'string' ? element.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
        return element.tagName.toLowerCase() + (element.id ? `#${element.id}` : '') + (classes ? `.${classes}` : '');
      };
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
          window.__shifts.push({
            value: item.value,
            hadRecentInput: item.hadRecentInput,
            at: Math.round(item.startTime),
            moved: (item.sources ?? []).slice(0, 3).map((source) => ({
              node: describe(source.node),
              dx: Math.round(source.currentRect.x - source.previousRect.x),
              dy: Math.round(source.currentRect.y - source.previousRect.y),
              dHeight: Math.round(source.currentRect.height - source.previousRect.height),
            })),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    }, mode !== 'returning');
    if (mode !== 'returning') {
      await page.setRequestInterception(true);
      page.on('request', async (request) => {
        if (mode === 'served' || request.resourceType() !== 'document') return request.continue();
        try {
          const original = await (await fetch(request.url())).text();
          const html = original.replaceAll(EXPAND_SCRIPT, mode === 'late' ? lateCollapseScript() : '');
          if (html === original) throw new Error(`The collapse script is not in ${request.url()}`);
          await request.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        } catch (error) {
          onError(String(error.message));
          await request.continue();
        }
      });
    }
    await page.setViewport({ width, height: 12000 });
    let last;
    for (let load = 0; load < 2; load++) {
      await page.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => { await document.fonts.ready; });
      await new Promise((resolve) => setTimeout(resolve, 800));
      last = await page.evaluate((selector) => {
        const open = document.querySelector('[data-open]');
        const shifts = window.__shifts.filter((item) => !item.hadRecentInput);
        return {
          total: shifts.reduce((sum, item) => sum + item.value, 0),
          collapsed: document.querySelector(selector).hasAttribute('data-collapsed'),
          revealed: open ? !open.hidden : null,
          shifts: shifts.filter((item) => item.value > 0).map(({ value, at, moved }) => ({ value, at, moved })),
        };
      }, block);
    }
    return last;
  } finally {
    await page.close();
  }
}
