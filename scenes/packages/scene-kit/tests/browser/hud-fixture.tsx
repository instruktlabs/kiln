// DOM-only qualification: real kit components and input, without a renderer or asset pack.
import { useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { RuntimeContext } from '../../src/internal/runtime';
import type { SceneRuntime } from '../../src/internal/runtime';
import { createInputApi, TouchButtons, VirtualJoystick } from '../../src/input';
import { CreditsPanel, HelpOverlay, HudButton, HudHideButton, HudLayer, HudMenu, HudToolbar, SceneStyles, createHudStore } from '../../src/ui';

const input = createInputApi(), hud = createHudStore();
input.setEnabled(true);
const text = Array.from({ length: 35 }, (_, i) => <p key={i}>Control {i + 1}: use the scene keyboard or touch controls.</p>);
function Fixture({ variant }: { variant: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const runtime = useRef({ rootRef, input, hud, playing: false, definition: { id: 'hud-layout' },
    subscribe: () => () => {}, getSnapshot: () => 0, systems: { add: () => () => {} }, pack: null } as unknown as SceneRuntime);
  const panels = <><HelpOverlay playing={false}>{text}</HelpOverlay><CreditsPanel credits={Array.from({ length: 30 }, (_, i) => ({ name: `Fixture ${i}`, licence: 'MIT' }))}/></>;
  // Match the campus's actual control order and labels: on a narrow HUD More
  // wraps over two rows, including one beneath the fixed Controls panel.
  const toolbar = variant === 'foundry-campus' ? <HudToolbar>
    <HudMenu label="View" collapse="narrow"><HudButton>Campus</HudButton><HudButton>One pair</HudButton><HudButton>Arrival</HudButton><HudButton>The split</HudButton><HudButton>Reset view</HudButton></HudMenu>
    <HudButton>Drive the sedan</HudButton>
    <HudMenu label="More"><HudButton>Pause motion</HudButton><HudButton>About the campus</HudButton>{panels}</HudMenu>
    <HudHideButton/>
  </HudToolbar> : <HudToolbar>{variant === 'menu' ? <HudMenu label="More">{panels}</HudMenu> : panels}</HudToolbar>;
  const controls = <><VirtualJoystick label="Move"/><TouchButtons buttons={[{ action: 'boost', label: 'Interact', slot: 'primary', hold: true }]}/></>;
  return <RuntimeContext.Provider value={runtime.current}><div ref={rootRef} tabIndex={0} className="ks-root" data-fixture={variant}>
    <SceneStyles/><div className="canvas-hit-target" style={{ position: 'absolute', inset: 0 }} onPointerDown={() => (window as any).__canvasHits++}/>
    <HudLayer>{variant === 'kit' ? <div className="fixture-nested">{toolbar}{controls}</div>
      : variant === 'farm' ? <div className="farm-hud farm-play-touch">{toolbar}{controls}</div>
      : variant === 'golden-gate' || variant === 'menu' ? <div className="gg-hud"><div className="gg-top">{toolbar}</div>{controls}</div>
      : variant === 'foundry-campus' ? <div className="fc-hud"><div className="fc-top">{toolbar}</div>{controls}</div>
      : <div className="ff-hud ff-joystick"><div className="ff-top">{toolbar}</div>{controls}</div>}</HudLayer>
  </div></RuntimeContext.Provider>;
}
const root = createRoot(document.getElementById('fixture')!);
let mountId = 0;
Object.assign(window, { __input: input, __canvasHits: 0, __mountHud: (variant: string) => {
  // Isolate every size/case, including after a failed assertion leaves a panel open.
  flushSync(() => root.render(<Fixture key={++mountId} variant={variant}/>));
} });
(window as any).__mountHud('kit');
