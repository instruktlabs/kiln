import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useRuntime } from '../src/internal/runtime';
import { useSystem } from '../src/lifecycle';
import { TouchButtons } from '../src/input';
import type { TouchButtonDef } from '../src/input';
import { CreditsPanel, HelpOverlay, HudPanel, InteractPrompt, useHud } from '../src/ui';

const buttons: readonly TouchButtonDef[] = [
  { action: 'interact', label: 'Open or close door', slot: 'primary' },
  { action: 'headlights', label: 'Lights', slot: 'secondary' },
  { action: 'throttle', label: 'Accelerate', slot: 'pedal-upper', hold: true },
  { action: 'handbrake', label: 'Brake', slot: 'pedal-lower', hold: true },
];
export function DemoHud() {
  const runtime = useRuntime(), tracked = useRef({ lights: false, throttle: 0, handbrake: 0 });
  useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot); useHud();
  useEffect(() => {
    runtime.input.configureActions([{ id: 'headlights', keys: ['KeyL'], mode: 'edge' }, { id: 'handbrake', keys: ['Space'], mode: 'hold' }, { id: 'throttle', keys: [], mode: 'hold' }]);
    if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) runtime.testHooks.demoActionState = () => ({ ...tracked.current });
    return () => { delete runtime.testHooks.demoActionState; };
  }, [runtime]);
  useSystem('demo-named-actions', 115, () => {
    const state = runtime.input.state, previous = tracked.current;
    if (state.actions.headlights) previous.lights = !previous.lights;
    previous.throttle = state.actions.throttle ?? 0; previous.handbrake = state.actions.handbrake ?? 0;
    runtime.hud.set({ demoLights: previous.lights, demoThrottle: previous.throttle, demoHandbrake: previous.handbrake });
  });
  const touch = runtime.input.state.lastPointer === 'touch';
  return <>
    <div className="ks-toolbar">
      <HelpOverlay desktop={<p>Choose Walk or press Enter on the scene. W A S D or arrows move; Shift runs. Drag to look and use the wheel to zoom. E opens the door, L toggles lights, Space holds the brake, and Escape returns to overview. Tab moves to the next control.</p>}
        touch={<p>Choose Walk or Drive. Use the joystick to move or steer, drag the scene to look, and pinch to zoom. The door button opens the door. Hold a pedal to test throttle or braking. Choose Overview to leave play.</p>} />
      <CreditsPanel />
    </div>
    {runtime.playing && <>
      {touch ? <TouchButtons buttons={buttons} /> : <InteractPrompt label="Open or close door" />}
      <HudPanel aria-label="Vehicle input status" style={{ position: 'absolute', right: 16, bottom: touch ? 165 : 80 }}>
        Lights {tracked.current.lights ? 'on' : 'off'} · Throttle {tracked.current.throttle} · Brake {tracked.current.handbrake}
      </HudPanel>
    </>}
  </>;
}
