import { describe, expect, test } from 'bun:test';
import { EXPAND_SCRIPT } from '../src/lib/code-preview';
import { LATE_MS, lateCollapseScript } from './layout-shift.mjs';

// The layout-shift check compares the page as served with the page whose collapse comes after the load. The deferred script
// has to do the same work at a different moment; the browser check (verify-source.mjs) shows the moment makes the difference.
describe('the deferred collapse that is the control of the layout-shift check', () => {
  type Callback = () => void;
  const run = (script: string) => {
    const attributes = new Map<string, string>();
    const listeners: Record<string, Callback> = {};
    const timers: Array<{ callback: Callback; ms: number }> = [];
    const part = { textContent: '' };
    const toggle = {
      hidden: true,
      addEventListener: () => {},
      getAttribute: () => 'false',
      setAttribute: () => {},
      querySelector: () => part,
    };
    const block = {
      dataset: {},
      querySelector: (selector: string) => (selector === '[data-code-expand]' ? toggle : null),
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: () => {},
    };
    const window = { addEventListener: (type: string, callback: Callback) => { listeners[type] = callback; } };
    const setTimeout = (callback: Callback, ms: number) => timers.push({ callback, ms });
    new Function('window', 'setTimeout', 'document', script)(window, setTimeout, { currentScript: { parentElement: block } });
    return { attributes, toggle, listeners, timers };
  };

  test('the served script collapses the block while the page is parsed', () => {
    const { attributes, toggle } = run(EXPAND_SCRIPT);
    expect(attributes.has('data-collapsed')).toBe(true);
    expect(toggle.hidden).toBe(false);
  });

  test('the deferred one leaves the block alone until the load event and the delay have passed', () => {
    const { attributes, toggle, listeners, timers } = run(lateCollapseScript());
    expect(attributes.has('data-collapsed')).toBe(false);
    expect(toggle.hidden).toBe(true);
    expect(timers).toEqual([]);
    listeners.load();
    expect(attributes.has('data-collapsed')).toBe(false);
    expect(timers.map((timer) => timer.ms)).toEqual([LATE_MS]);
    timers[0].callback();
    expect(attributes.has('data-collapsed')).toBe(true);
    expect(toggle.hidden).toBe(false);
  });

  test('is plain script text that parses on its own and does not close the script element', () => {
    const script = lateCollapseScript();
    expect(() => new Function(script)).not.toThrow();
    expect(script).not.toMatch(/<\/script/i);
    expect(script).not.toBe(EXPAND_SCRIPT);
  });

  test('refuses a collapse script whose ending it does not know, so the control cannot drift from the script', () => {
    expect(() => lateCollapseScript('(function () {})();')).toThrow(/no longer ends/);
  });
});
