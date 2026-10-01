export interface InputState {
  move: { x: number; y: number }; run: boolean; look: { x: number; y: number }; zoom: number;
  interact: boolean; cancel: boolean; helpToggle: boolean;
  lastPointer: 'mouse' | 'touch' | 'pen' | 'keyboard'; actions: Readonly<Record<string, number>>;
}
export interface ActionDef { id: string; keys: readonly string[]; mode: 'edge' | 'hold' }
export interface InputApi {
  readonly state: InputState; readonly enabled: boolean;
  setEnabled(on: boolean): void; press(action: 'interact' | 'cancel'): void;
  setMove(x: number, y: number, run: boolean): void; setAction(id: string, value: number): void; clear(): void;
  endFrame(): void; configureActions(actions: readonly ActionDef[]): void;
  key(code: string, down: boolean, repeat?: boolean): boolean;
  setPointerKind(kind: InputState['lastPointer']): void;
  subscribe(fn: () => void): () => void; dispose(): void;
}
const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
export function createInputApi(definitions: readonly ActionDef[] = []): InputApi {
  const actions: Record<string, number> = Object.create(null), defs = new Map<string, ActionDef>(), keys = new Set<string>(), listeners = new Set<() => void>();
  let enabled = false, disposed = false;
  const state: InputState = { move: { x: 0, y: 0 }, run: false, look: { x: 0, y: 0 }, zoom: 0, interact: false, cancel: false, helpToggle: false, lastPointer: 'mouse', actions };
  const api: InputApi = {
    state, get enabled() { return enabled && !disposed; },
    setEnabled(on) { if (disposed) return; enabled = on; if (!on) api.clear(); },
    clear() { keys.clear(); state.move.x = state.move.y = state.look.x = state.look.y = state.zoom = 0; state.run = state.interact = state.cancel = state.helpToggle = false; for (const id in actions) actions[id] = 0; },
    press(action) { if (enabled && !disposed) state[action] = true; },
    setMove(x, y, run) { if (!enabled || disposed) return; state.move.x = clamp(x, -1, 1); state.move.y = clamp(y, -1, 1); state.run = run; },
    setAction(id, value) {
      if (!enabled || disposed) return;
      if (id === 'interact' || id === 'cancel') { if (value > 0) api.press(id); return; }
      actions[id] = clamp(value, 0, 1);
    },
    endFrame() { state.interact = state.cancel = state.helpToggle = false; state.look.x = state.look.y = state.zoom = 0; for (const id in actions) if (defs.get(id)?.mode !== 'hold') actions[id] = 0; },
    configureActions(next) { for (const def of next) { const previous = defs.get(def.id); defs.set(def.id, { ...def, keys: def.keys.length ? def.keys : previous?.keys ?? def.keys }); actions[def.id] ??= 0; } },
    key(code, down, repeat = false) {
      if (disposed || code === 'Tab') return false;
      if (code === 'KeyH' || code === 'HelpToggle') {
        if (down && !repeat && !keys.has(code)) state.helpToggle = true;
        if (down) keys.add(code); else keys.delete(code); api.setPointerKind('keyboard'); return true;
      }
      if (!enabled) return false;
      let handled = movement.has(code) || code === 'KeyE' || code === 'Escape';
      for (const def of defs.values()) if (def.keys.includes(code)) { handled = true; break; }
      if (!handled) return false;
      const edge = down && !repeat && !keys.has(code);
      if (down) keys.add(code); else keys.delete(code);
      if (movement.has(code)) {
        state.move.x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
        state.move.y = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
        state.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      }
      if (edge && code === 'KeyE') state.interact = true;
      if (edge && code === 'Escape') state.cancel = true;
      for (const def of defs.values()) if (def.keys.includes(code)) {
        if (def.mode === 'hold') actions[def.id] = Number(def.keys.some(key => keys.has(key)));
        else if (edge) actions[def.id] = 1;
      }
      api.setPointerKind('keyboard'); return true;
    },
    setPointerKind(kind) { if (disposed || state.lastPointer === kind) return; state.lastPointer = kind; for (const fn of listeners) fn(); },
    subscribe(fn) { if (disposed) return () => {}; listeners.add(fn); return () => { listeners.delete(fn); }; },
    dispose() { if (disposed) return; api.clear(); enabled = false; disposed = true; defs.clear(); listeners.clear(); },
  };
  api.configureActions(definitions); return api;
}
/** Only the focused root/canvas owns game keys; native controls keep their defaults. */
export function handleInputKey(input: InputApi, event: KeyboardEvent, onRootOrCanvas: boolean): boolean {
  const target = event.target as HTMLElement | null;
  if (!onRootOrCanvas || target?.isContentEditable || /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(target?.tagName ?? '')) return false;
  const handled = input.key(event.key === '?' ? 'HelpToggle' : event.code, event.type !== 'keyup', event.repeat);
  if (handled) { event.preventDefault(); if (input.enabled) event.stopPropagation(); }
  return handled;
}
/**
 * Joystick modes. 'both' moves in any direction with one radial dead zone and reports `run` near full deflection;
 * 'x' reads the horizontal axis only. 'throttle' is the bidirectional driving mode (D-22): x steers and y is a
 * signed throttle (push forward to accelerate, pull back to brake or reverse), each axis with its own dead zone,
 * so a thumb held forward does not also steer and a turn does not lift the throttle. It never reports `run`.
 */
export type JoystickAxes = 'both' | 'x' | 'throttle';
export function joystickAxes(dx: number, dy: number, radius: number, axes: JoystickAxes = 'both', runThreshold: number | null = .92): { x: number; y: number; run: boolean } {
  if (axes === 'throttle') {
    const r = Math.max(1, radius), axis = (d: number) => { const a = Math.min(1, Math.abs(d) / r); return a <= .12 ? 0 : Math.sign(d) * (a - .12) / .88; };
    return { x: axis(dx) || 0, y: -axis(dy) || 0, run: false };
  }
  if (axes === 'x') dy = 0;
  const length = Math.hypot(dx, dy), deflection = Math.min(1, length / Math.max(1, radius));
  if (deflection <= .12 || !length) return { x: 0, y: 0, run: false };
  const magnitude = (deflection - .12) / .88;
  return { x: dx / length * magnitude, y: dy ? -dy / length * magnitude : 0, run: runThreshold !== null && deflection >= runThreshold };
}
export function bindInputEvents(root: HTMLElement, input: InputApi): () => void {
  const doc = root.ownerDocument, win = doc.defaultView;
  const pointers = new Map<number, { x: number; y: number }>();
  const key = (event: KeyboardEvent) => handleInputKey(input, event, event.target === root || (event.target as HTMLElement)?.tagName === 'CANVAS');
  const clear = () => { pointers.clear(); input.clear(); };
  const visibility = () => { if (doc.hidden) clear(); };
  const down = (event: PointerEvent) => {
    input.setPointerKind(event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse');
    if ((event.target as HTMLElement)?.tagName !== 'CANVAS') return;
    root.focus({ preventScroll: true }); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const move = (event: PointerEvent) => {
    const p = pointers.get(event.pointerId); if (!p) return;
    if (pointers.size === 1) { input.state.look.x += (event.clientX - p.x) * .005; input.state.look.y += (event.clientY - p.y) * .005; }
    else {
      for (const [id, other] of pointers) if (id !== event.pointerId) { input.state.zoom += (Math.hypot(p.x - other.x, p.y - other.y) - Math.hypot(event.clientX - other.x, event.clientY - other.y)) * .01; break; }
    }
    p.x = event.clientX; p.y = event.clientY;
  };
  const up = (event: PointerEvent) => { pointers.delete(event.pointerId); };
  const wheel = (event: WheelEvent) => { if ((event.target as HTMLElement)?.tagName === 'CANVAS') input.state.zoom += event.deltaY * .001; };
  const context = (event: Event) => { if ((event.target as HTMLElement)?.tagName === 'CANVAS') event.preventDefault(); };
  root.addEventListener('keydown', key); root.addEventListener('keyup', key); root.addEventListener('blur', clear);
  root.addEventListener('pointerdown', down); root.addEventListener('pointermove', move); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up); root.addEventListener('lostpointercapture', up);
  root.addEventListener('wheel', wheel, { passive: true }); root.addEventListener('contextmenu', context);
  doc.addEventListener('visibilitychange', visibility, { passive: true }); win?.addEventListener('blur', clear, { passive: true });
  return () => {
    root.removeEventListener('keydown', key); root.removeEventListener('keyup', key); root.removeEventListener('blur', clear);
    root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', up); root.removeEventListener('lostpointercapture', up);
    root.removeEventListener('wheel', wheel); root.removeEventListener('contextmenu', context);
    doc.removeEventListener('visibilitychange', visibility); win?.removeEventListener('blur', clear); clear();
  };
}
