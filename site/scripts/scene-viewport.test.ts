import { expect, test } from 'bun:test';
import { observeSceneLayoutShifts, sceneHasRoom } from './scene-viewport.mjs';

const measured = {
  viewportWidth: 390,
  documentClientWidth: 375,
  overlay: { left: 0, right: 375, width: 375 },
  overlayClientWidth: 375,
  mount: { left: 0, right: 375, width: 375, height: 851 },
};

test('a scene fills the layout viewport when the browser reserves a scrollbar', () => {
  expect(sceneHasRoom(measured)).toBe(true);
});

test('a scrollbar inside the overlay reduces the available mount width', () => {
  expect(sceneHasRoom({ ...measured, overlayClientWidth: 360, mount: { ...measured.mount, right: 360, width: 360 } })).toBe(true);
});

test('a viewport without scrollbar reservation still needs a full-width overlay and mount', () => {
  expect(sceneHasRoom({ ...measured, viewportWidth: 375 })).toBe(true);
});

test('a genuinely narrow overlay or mount fails, even without horizontal overflow', () => {
  expect(sceneHasRoom({ ...measured, viewportWidth: 375, overlay: { left: 0, right: 360, width: 360 } })).toBe(false);
  expect(sceneHasRoom({ ...measured, viewportWidth: 375, mount: { ...measured.mount, right: 360, width: 360 } })).toBe(false);
});

test('shifted or oversized overlay and mount rectangles are not full viewport coverage', () => {
  expect(sceneHasRoom({ ...measured, viewportWidth: 375, overlay: { left: 15, right: 390, width: 375 } })).toBe(false);
  expect(sceneHasRoom({ ...measured, viewportWidth: 375, overlay: { left: 0, right: 390, width: 390 } })).toBe(false);
  expect(sceneHasRoom({ ...measured, viewportWidth: 375, mount: { ...measured.mount, left: 15, right: 390 } })).toBe(false);
});

test('the existing 200px minimum height and 1px width tolerance remain', () => {
  expect(sceneHasRoom({ ...measured, mount: { ...measured.mount, height: 199 } })).toBe(false);
  expect(sceneHasRoom({ ...measured, mount: { ...measured.mount, width: 374.5, right: 374.5, height: 200 } })).toBe(true);
});

test('absent, zero or nonfinite measurements fail closed', () => {
  for (const change of [
    { mount: null }, { overlay: null }, { overlayClientWidth: 0 },
    { documentClientWidth: Number.NaN }, { overlayClientWidth: Infinity },
    { mount: { ...measured.mount, height: Infinity } },
  ]) expect(sceneHasRoom({ ...measured, viewportWidth: 375, ...change })).toBe(false);
});

test('layout-shift receipts retain source rectangles and timing without retaining live DOM nodes', () => {
  let notify!: (list: { getEntries: () => any[] }) => void;
  let observed: unknown;
  const scope = {
    __shifts: [] as any[],
    document: { fonts: { status: 'loaded' }, querySelector: () => ({ hidden: false }) },
    PerformanceObserver: class {
      constructor(callback: typeof notify) { notify = callback; }
      observe(options: unknown) { observed = options; }
    },
  };
  observeSceneLayoutShifts(scope);
  const previousRect = { x: 33, y: 577.609375, width: 687, height: 322.390625 };
  const currentRect = { x: 33, y: 649.609375, width: 687, height: 250.390625 };
  const node = { tagName: 'DIV', id: '', className: 'grid gap-px bg-rule' };
  notify({ getEntries: () => [{ value: 0.026113501549358126, hadRecentInput: false, startTime: 52.9, sources: [{ node, previousRect, currentRect }] }] });
  expect(observed).toEqual({ type: 'layout-shift', buffered: true });
  expect(scope.__shifts[0]).toEqual({
    value: 0.026113501549358126, hadRecentInput: false, time: 52.9, fonts: 'loaded', exploreHidden: false,
    sources: [{ tag: 'DIV', id: '', classes: 'grid gap-px bg-rule', previous: previousRect, current: currentRect }],
  });
  expect(scope.__shifts[0].sources[0].previous).not.toBe(previousRect);
  expect(JSON.stringify(scope.__shifts)).not.toContain('tagName');
});
