import { expect, test } from 'bun:test';
import { bindWalkExit } from '../src/walk-controls';

function fixture() {
  const view = new EventTarget(), root = Object.assign(new EventTarget(), {
    openMenu: false, focuses: 0,
    closest() { return this.openMenu ? {} : null; },
    focus() { this.focuses++; },
  });
  const doc = Object.assign(new EventTarget(), { defaultView: view, pointerLockElement: null as object | null,
    unlocks: 0, exitPointerLock() { this.unlocks++; this.pointerLockElement = null; this.dispatchEvent(new Event('pointerlockchange')); } });
  const canvas = { ownerDocument: doc };
  let playing = true, exits = 0;
  const dispose = bindWalkExit(root as unknown as HTMLElement, canvas as unknown as HTMLCanvasElement, () => playing, () => { playing = false; exits++; });
  const escape = (consumed = false) => {
    const event = Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { code: 'Escape', key: 'Escape', stops: 0 });
    const stop = event.stopPropagation.bind(event);
    event.stopPropagation = () => { event.stops++; stop(); };
    if (consumed) event.preventDefault();
    root.dispatchEvent(event);
    return event;
  };
  return { root, doc, canvas, view, dispose, escape, get exits() { return exits; }, setPlaying(on: boolean) { playing = on; } };
}

test('Escape on a focused HUD button exits walk before the outer shell and restores scene focus', () => {
  const f = fixture(), event = f.escape();
  expect(f.exits).toBe(1); expect(event.defaultPrevented).toBe(true); expect(event.stops).toBe(1);
  expect(f.root.focuses).toBe(1);
  const overviewEscape = f.escape();
  expect(overviewEscape.defaultPrevented).toBe(false); expect(overviewEscape.stops).toBe(0);
  expect(f.exits).toBe(1); f.dispose();
});

test('panel capture dismissal and open menu dismissal take priority over leaving walk', () => {
  const f = fixture();
  f.escape(true); expect(f.exits).toBe(0);
  f.root.openMenu = true;
  const event = f.escape(); expect(f.exits).toBe(0); expect(event.defaultPrevented).toBe(false);
  f.root.openMenu = false; f.escape(); expect(f.exits).toBe(1); f.dispose();
});

test('browser pointer-lock release leaves walk even when Escape is withheld, and cleanup removes listeners', () => {
  const f = fixture();
  f.doc.pointerLockElement = f.canvas; f.doc.dispatchEvent(new Event('pointerlockchange'));
  f.doc.exitPointerLock(); expect(f.exits).toBe(1); expect(f.root.focuses).toBe(1);
  f.setPlaying(true); f.dispose(); f.escape();
  f.doc.pointerLockElement = f.canvas; f.doc.dispatchEvent(new Event('pointerlockchange')); f.doc.exitPointerLock();
  expect(f.exits).toBe(1);
});

test('walking Escape unlocks once without duplicate exit through pointerlockchange', () => {
  const f = fixture();
  f.doc.pointerLockElement = f.canvas; f.doc.dispatchEvent(new Event('pointerlockchange'));
  f.escape(); expect(f.doc.unlocks).toBe(1); expect(f.exits).toBe(1);
  f.dispose();
});
