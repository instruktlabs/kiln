// DOM-only: actual input binding and joystick lifecycle, without a scene renderer or assets.
import { useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { RuntimeContext } from '../../src/internal/runtime';
import type { SceneRuntime } from '../../src/internal/runtime';
import { createInputApi, InputProvider, VirtualJoystick } from '../../src/input';
import type { InputApi } from '../../src/input';

let input: InputApi, serial = 0;
function Fixture({ mode, api }: { mode: 'switch' | 'always'; api: InputApi }) {
  const rootRef = useRef<HTMLDivElement>(null), [shown, setShown] = useState(true);
  const pointer = useSyncExternalStore(api.subscribe, () => api.state.lastPointer);
  const runtime = useRef({ rootRef, input: api, hud: { set() {} }, notify() {} } as unknown as SceneRuntime);
  (window as any).__hideStick = () => flushSync(() => setShown(false));
  return <RuntimeContext.Provider value={runtime.current}><InputProvider target={rootRef}>
    <div ref={rootRef} tabIndex={0} className="ks-root" style={{ width: 700, height: 400, outline: 'none' }}>
      {shown && (mode === 'always' || pointer !== 'keyboard') && <VirtualJoystick label="Move"/>}
    </div>
  </InputProvider></RuntimeContext.Provider>;
}
const root = createRoot(document.getElementById('fixture')!);
Object.assign(window, {
  __mountInput(mode: 'switch' | 'always' = 'switch') {
    input = createInputApi(); input.setEnabled(true); input.setPointerKind('touch');
    flushSync(() => root.render(<Fixture key={++serial} mode={mode} api={input}/>));
  },
  __inputState: () => ({ enabled: input.enabled, move: { ...input.state.move }, run: input.state.run, pointer: input.state.lastPointer, joystick: !!document.querySelector('.ks-joystick') }),
  __disableInput: () => input.setEnabled(false),
  __disposeInput: () => input.dispose(),
});
(window as any).__mountInput();
