import { expect, test } from 'bun:test';
import { closeScenePanelOnEscape, restoreScenePanelFocus } from '../../src/ui/escape';

test('Escape closes one open scene control and is consumed before host exit', () => {
  let closed = 0;
  const event = Object.assign(new Event('keydown', { cancelable: true, bubbles: true }), { key: 'Escape' });
  closeScenePanelOnEscape(event, () => closed++);
  expect(closed).toBe(1); expect(event.defaultPrevented).toBe(true); expect(event.cancelBubble).toBe(true);
  closeScenePanelOnEscape(event, () => closed++);
  expect(closed).toBe(1);
  closeScenePanelOnEscape(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter' }), () => closed++);
  expect(closed).toBe(1);
});

/** Models the browser's relevant focus rule: hidden/disabled/detached controls cannot take focus.
 * The DOM browser regression separately exercises the real HudMenu CSS and React dismissal.
 */
function focusFixture() {
  const document = { activeElement: null as FocusTarget | null };
  class FocusTarget {
    ownerDocument = document;
    visible = true;
    isConnected = true;
    disabled = false;
    calls: FocusOptions[] = [];
    constructor(public kind: string, public parentElement: FocusTarget | null = null, public trigger: FocusTarget | null = null) {}
    focus(options: FocusOptions) { this.calls.push(options); if (this.visible && this.isConnected && !this.disabled) document.activeElement = this; }
    getClientRects() { return this.visible && this.isConnected ? [{}] : []; }
    closest(selector: string): FocusTarget | null { return this.kind === selector ? this : this.parentElement?.closest(selector) ?? null; }
    querySelector() { return this.trigger; }
  }
  const root = new FocusTarget('.ks-root'), menu = new FocusTarget('.ks-menu', root);
  const more = new FocusTarget('button', menu), trigger = new FocusTarget('button', menu);
  menu.trigger = more;
  return { document, root, menu, more, trigger, Target: FocusTarget };
}

test('closing a panel from a collapsed menu restores visible More focus instead of its hidden trigger', () => {
  const f = focusFixture(); f.trigger.visible = false;
  restoreScenePanelFocus(f.trigger as unknown as HTMLElement);
  expect(f.document.activeElement).toBe(f.more);
  expect(f.more.calls).toEqual([{ preventScroll: true }]);
});

test('panel focus keeps its original visible trigger and handles nested collapsed menus', () => {
  const f = focusFixture();
  restoreScenePanelFocus(f.trigger as unknown as HTMLElement);
  expect(f.document.activeElement).toBe(f.trigger); expect(f.more.calls).toEqual([]);
  f.trigger.visible = false; f.more.visible = false;
  const outer = new f.Target('.ks-menu', f.root), outerTrigger = new f.Target('button', outer);
  outer.trigger = outerTrigger; f.menu.parentElement = outer;
  restoreScenePanelFocus(f.trigger as unknown as HTMLElement);
  expect(f.document.activeElement).toBe(outerTrigger);
});

test('panel focus falls back to its own scene root if all containing controls are unavailable', () => {
  const f = focusFixture(); f.trigger.disabled = true; f.more.visible = false;
  restoreScenePanelFocus(f.trigger as unknown as HTMLElement);
  expect(f.document.activeElement).toBe(f.root);
  expect(() => restoreScenePanelFocus(null)).not.toThrow();
});
