import { describe, expect, test } from 'bun:test';
import { createInputApi, handleInputKey, joystickAxes, bindInputEvents } from '../../src/input/core';

function event(code: string, type = 'keydown', repeat = false, tag = 'DIV') {
  return { code, type, repeat, key: code === 'Slash' ? '?' : '', target: { tagName: tag }, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}
describe('U-17 input core', () => {
  test('keyboard, edge pulses, hold actions, Escape order, form controls and undeclared Space', () => {
    const input = createInputApi([{ id: 'handbrake', keys: ['Space'], mode: 'hold' }, { id: 'lights', keys: ['KeyL'], mode: 'edge' }]);
    input.setEnabled(true);
    const key = (code: string, type = 'keydown', repeat = false, tag = 'DIV') => { const e = event(code, type, repeat, tag); handleInputKey(input, e as unknown as KeyboardEvent, true); return e; };
    expect(key('KeyW').prevented).toBe(true); key('KeyD'); key('ShiftLeft');
    expect(input.state.move).toEqual({ x: 1, y: 1 }); expect(input.state.run).toBe(true);
    key('KeyE'); expect(input.state.interact).toBe(true); input.endFrame(); expect(input.state.interact).toBe(false);
    key('KeyE', 'keydown', true); expect(input.state.interact).toBe(false);
    key('Space'); key('KeyL'); expect(input.state.actions.handbrake).toBe(1); expect(input.state.actions.lights).toBe(1);
    input.endFrame(); expect(input.state.actions.handbrake).toBe(1); expect(input.state.actions.lights).toBe(0);
    key('Space', 'keyup'); expect(input.state.actions.handbrake).toBe(0);
    expect(key('Tab').prevented).toBe(false);
    for (const tag of ['BUTTON', 'SELECT', 'INPUT', 'TEXTAREA', 'A']) expect(key('KeyW', 'keydown', false, tag).prevented).toBe(false);
    const canvas = event('KeyA', 'keydown', false, 'CANVAS'); handleInputKey(input, canvas as unknown as KeyboardEvent, true); expect(canvas.prevented).toBe(true);
    const outside = event('KeyS'); handleInputKey(input, outside as unknown as KeyboardEvent, false); expect(outside.prevented).toBe(false);
    expect(key('Escape').stopped).toBe(true); input.setEnabled(false);
    expect(key('Escape').stopped).toBe(false); expect(input.state.move).toEqual({ x: 0, y: 0 });
    key('KeyH'); expect(input.state.helpToggle).toBe(true); input.endFrame(); expect(input.state.helpToggle).toBe(false);
    const plain = createInputApi(); plain.setEnabled(true); const space = event('Space'); handleInputKey(plain, space as unknown as KeyboardEvent, true); expect(space.prevented).toBe(false);
  });
  test('joystick dead zone, normalized linear range, run threshold and steering axis', () => {
    expect(joystickAxes(4, 0, 66)).toEqual({ x: 0, y: 0, run: false });
    const full = joystickAxes(66, -66, 66); expect(Math.hypot(full.x, full.y)).toBeCloseTo(1); expect(full.run).toBe(true);
    expect(joystickAxes(66, -66, 66, 'x', null)).toEqual({ x: 1, y: 0, run: false });
    expect(joystickAxes(66 * .92, 0, 66).run).toBe(true);
    const half = joystickAxes(66 * .56, 0, 66); expect(half.x).toBeCloseTo(.5);
  });
  test('throttle joystick: independent steering and signed throttle axes, no run (D-22)', () => {
    expect(joystickAxes(4, -4, 66, 'throttle')).toEqual({ x: 0, y: 0, run: false });
    expect(joystickAxes(0, -66, 66, 'throttle')).toEqual({ x: 0, y: 1, run: false }); // forward accelerates
    expect(joystickAxes(0, 99, 66, 'throttle')).toEqual({ x: 0, y: -1, run: false }); // back brakes or reverses
    const drift = joystickAxes(66 * Math.sin(.1), -66 * Math.cos(.1), 66, 'throttle'); // forward, six degrees off
    expect(drift.x).toBe(0); expect(drift.y).toBeGreaterThan(.99);
    expect(joystickAxes(-66, -66, 66, 'throttle', .5)).toEqual({ x: -1, y: 1, run: false }); // full throttle while steering
    expect(joystickAxes(66 * .56, 0, 66, 'throttle').x).toBeCloseTo(.5);
  });
  test('touch hold and edge actions share state and clear on blur/visibility, listeners are removed', () => {
    class Target extends EventTarget { tagName = 'DIV'; ownerDocument!: Target & { hidden?: boolean; defaultView?: Target }; contains() { return true; } }
    const root = new Target(), doc = new Target() as Target & { hidden?: boolean; defaultView?: Target }; doc.defaultView = new Target(); root.ownerDocument = doc;
    const input = createInputApi(); input.setEnabled(true); input.configureActions([{ id: 'throttle', keys: [], mode: 'hold' }]);
    const cleanup = bindInputEvents(root as unknown as HTMLElement, input);
    input.setMove(.5, 2, true); input.setAction('throttle', .6); input.setAction('toggle', 1); input.endFrame();
    expect(input.state.move).toEqual({ x: .5, y: 1 }); expect(input.state.actions.throttle).toBe(.6); expect(input.state.actions.toggle).toBe(0);
    doc.defaultView.dispatchEvent(new Event('blur')); expect(input.state.actions.throttle).toBe(0); expect(input.state.move.y).toBe(0);
    input.setMove(1, 1, false); doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); expect(input.state.move.x).toBe(0);
    input.setMove(1, 0, false); root.dispatchEvent(new Event('blur')); expect(input.state.move.x).toBe(0);
    cleanup(); input.setMove(1, 0, false); doc.defaultView.dispatchEvent(new Event('blur')); expect(input.state.move.x).toBe(1);
    input.dispose(); expect(input.state.move.x).toBe(0);
  });
  test('movement release belongs to its writer; keyboard and unowned writes supersede joystick cleanup', () => {
    const input = createInputApi(), first = {}, second = {};
    input.setEnabled(true);
    input.setMove(.4, .8, true, first); input.releaseMove(second);
    expect(input.state.move).toEqual({ x: .4, y: .8 }); expect(input.state.run).toBe(true);
    input.setMove(-.6, 1, false, second); input.releaseMove(first);
    expect(input.state.move).toEqual({ x: -.6, y: 1 });
    input.releaseMove(second); expect(input.state.move).toEqual({ x: 0, y: 0 });
    input.setMove(.4, .8, true, first);
    // A pointer-mode subscriber may synchronously unmount/release a joystick at keydown.
    const stop = input.subscribe(() => input.releaseMove(first));
    input.key('KeyW', true); expect(input.state.move).toEqual({ x: 0, y: 1 }); expect(input.state.run).toBe(false);
    input.key('ShiftLeft', true); input.releaseMove(first); expect(input.state.run).toBe(true);
    input.key('KeyW', false); input.key('ShiftLeft', false); expect(input.state.move).toEqual({ x: 0, y: 0 }); expect(input.state.run).toBe(false);
    input.setMove(1, 0, true, first); input.setMove(.2, -.3, false); input.releaseMove(first);
    expect(input.state.move).toEqual({ x: .2, y: -.3 }); stop(); input.dispose();
  });
  test('clear, disabling and disposal invalidate movement ownership', () => {
    const input = createInputApi(), owner = {};
    input.setEnabled(true); input.setMove(1, 1, true, owner); input.clear(); input.releaseMove(owner);
    expect(input.state.move).toEqual({ x: 0, y: 0 }); expect(input.state.run).toBe(false);
    input.setMove(.5, .5, true, owner); input.setEnabled(false); input.setMove(1, 1, true, owner); input.releaseMove(owner);
    expect(input.state.move).toEqual({ x: 0, y: 0 }); expect(input.state.run).toBe(false);
    input.setEnabled(true); input.key('KeyD', true); input.releaseMove(owner); expect(input.state.move).toEqual({ x: 1, y: 0 });
    input.dispose(); input.setMove(1, 1, true, owner); input.releaseMove(owner);
    expect(input.state.move).toEqual({ x: 0, y: 0 }); expect(input.state.run).toBe(false);
  });
});
