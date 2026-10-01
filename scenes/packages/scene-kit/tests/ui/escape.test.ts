import { expect, test } from 'bun:test';
import { closeScenePanelOnEscape } from '../../src/ui/escape';

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
