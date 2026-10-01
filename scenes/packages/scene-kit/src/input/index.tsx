import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { JSX, ReactNode, RefObject, PointerEvent as ReactPointerEvent } from 'react';
import { useRuntime } from '../internal/runtime';
import { bindInputEvents, joystickAxes } from './core';
import type { ActionDef, InputApi, JoystickAxes } from './core';
export * from './core';

export function InputProvider(p: { target: RefObject<HTMLElement | null>; actions?: readonly ActionDef[]; children: ReactNode }): JSX.Element {
  const runtime = useRuntime();
  useEffect(() => { runtime.input.configureActions(p.actions ?? []); }, [runtime, p.actions]);
  useEffect(() => {
    const root = p.target.current; if (!root) return;
    const offPointer = runtime.input.subscribe(() => { runtime.hud.set({ lastPointer: runtime.input.state.lastPointer }); runtime.notify(); });
    const off = bindInputEvents(root, runtime.input); return () => { off(); offPointer(); };
  }, [runtime, p.target]);
  return <>{p.children}</>;
}
export function useInput(): InputApi { return useRuntime().input; }
/** A movement stick; `axes="throttle"` makes it the only driving input (forward accelerates, back brakes or reverses, sideways steers). */
export function VirtualJoystick(p: { label: string; axes?: JoystickAxes; runThreshold?: number | null }): JSX.Element {
  const input = useInput(), active = useRef<number | null>(null), thumb = useRef<HTMLSpanElement>(null);
  const center = useRef({ x: 0, y: 0 });
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (active.current !== event.pointerId) return;
    const dx = event.clientX - center.current.x, dy = p.axes === 'x' ? 0 : event.clientY - center.current.y;
    const value = joystickAxes(dx, dy, 66, p.axes, p.runThreshold === undefined ? .92 : p.runThreshold);
    input.setMove(value.x, value.y, value.run);
    // The thumb stays inside the ring (the throttle axes can both be full at a diagonal).
    const reach = Math.max(1, Math.hypot(value.x, value.y));
    if (thumb.current) thumb.current.style.transform = `translate(${value.x / reach * 38}px, ${-value.y / reach * 38}px)`;
  };
  const release = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && active.current !== event.pointerId) return;
    active.current = null; input.setMove(0, 0, false); if (thumb.current) thumb.current.style.transform = 'translate(0px, 0px)';
  };
  useEffect(() => () => { input.setMove(0, 0, false); }, [input]);
  return <div className="ks-joystick" role="application" aria-label={p.label}
    onPointerDown={event => {
      if (active.current !== null) return;
      event.preventDefault(); active.current = event.pointerId; input.setPointerKind(event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse');
      const rect = event.currentTarget.getBoundingClientRect(); center.current.x = rect.left + rect.width / 2; center.current.y = rect.top + rect.height / 2;
      event.currentTarget.setPointerCapture(event.pointerId); move(event);
    }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <span ref={thumb} className="ks-joystick-thumb" aria-hidden="true" />
    <span className="ks-sr-only">{p.axes === 'throttle'
      ? 'Push the joystick forward to accelerate, pull it back to brake or reverse, and push it left or right to steer, or use the arrow keys while the scene has focus.'
      : 'Move with the joystick or use the arrow keys while the scene has focus.'}</span>
  </div>;
}
export interface TouchButtonDef { action: string; label: string; slot: 'primary' | 'secondary' | 'pedal-upper' | 'pedal-lower'; hold?: boolean; visible?: () => boolean; ariaLabel?: string }
export function TouchButtons(p: { buttons: readonly TouchButtonDef[]; className?: string }): JSX.Element {
  const runtime = useRuntime(), input = runtime.input;
  useSyncExternalStore(runtime.hud.subscribe, runtime.hud.getSnapshot, runtime.hud.getSnapshot);
  const visibleButtons = p.buttons.filter(button => !button.visible || button.visible());
  const visibleSignature = visibleButtons.map(button => button.action).join('\u0000');
  useEffect(() => {
    input.configureActions(p.buttons.map(button => ({ id: button.action, keys: [], mode: button.hold ? 'hold' : 'edge' })));
    return () => { for (const button of p.buttons) if (button.hold) input.setAction(button.action, 0); };
  }, [input, p.buttons, visibleSignature]);
  return <div className={`ks-touch-buttons ${p.className ?? ''}`}>{visibleButtons.map(button => <button
    key={button.action} type="button" className={`ks-button ks-touch-button ks-slot-${button.slot}`} aria-label={button.ariaLabel ?? button.label}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); input.setPointerKind(event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse'); input.setAction(button.action, 1); }}
    onPointerUp={() => { if (button.hold) input.setAction(button.action, 0); }}
    onPointerCancel={() => { if (button.hold) input.setAction(button.action, 0); }}
    onLostPointerCapture={() => { if (button.hold) input.setAction(button.action, 0); }}
    onBlur={() => { if (button.hold) input.setAction(button.action, 0); }}
    onKeyDown={event => { if (button.hold && (event.key === ' ' || event.key === 'Enter')) input.setAction(button.action, 1); }}
    onKeyUp={event => { if (button.hold && (event.key === ' ' || event.key === 'Enter')) input.setAction(button.action, 0); }}
    onClick={event => { if (!button.hold && event.detail === 0) { input.setPointerKind('keyboard'); input.setAction(button.action, 1); } }}
  >{button.label}</button>)}</div>;
}
