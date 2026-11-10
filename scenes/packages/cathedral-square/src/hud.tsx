import { useEffect, useId, useRef, useState } from 'react';
import { CameraButtons, CreditsPanel, HelpOverlay, HudButton, HudHideButton, HudMenu, HudPanel, HudToolbar, StatusLine, useInput, usePanelEscape, usePlayMode, useSceneRootRef, VirtualJoystick } from '@kiln-scenes/scene-kit';
import { orbitRig } from './orbit';
import { VIEWPOINTS } from './viewpoints';

/** Instance-sized controls: no permanent camera pad, and panels scroll inside short embeds. */
export const SQUARE_HUD_CSS = `
.ks-hud>.sq-hud{pointer-events:none}
.sq-hud{position:absolute;inset:0;pointer-events:none;container:sq-hud/size;box-sizing:border-box;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 0 max(12px,env(safe-area-inset-left))}
.sq-hud>*{pointer-events:auto}.sq-hud>style{display:none}.sq-hud>.ks-status{pointer-events:none}
.sq-hud .ks-toolbar{position:static;justify-content:flex-end;max-width:100%;gap:6px}
.sq-hud .ks-toolbar .ks-button{padding:8px}
.sq-hud :is(.ks-help,.ks-credits,.sq-camera){position:fixed;z-index:3;top:max(70px,calc(env(safe-area-inset-top) + 58px));right:max(12px,env(safe-area-inset-right));max-height:calc(100% - max(70px,calc(env(safe-area-inset-top) + 58px)) - max(12px,env(safe-area-inset-bottom)));overflow:auto;overscroll-behavior:contain}
.sq-hud .sq-camera{max-width:min(440px,calc(100% - 24px))}
.sq-hud .sq-camera>button{margin-top:8px}
.sq-hud .sq-views{max-width:min(240px,100%);min-width:0}
.sq-hud .ks-status{max-width:min(520px,calc(100% - 24px));box-sizing:border-box;padding:8px 12px}
.sq-hud.sq-walk.sq-touch .ks-status{left:auto;right:max(12px,env(safe-area-inset-right));transform:none;max-width:min(400px,calc(100% - 180px))}
@container sq-hud (max-width:560px){
  .sq-hud :is(.ks-help,.ks-credits,.sq-camera){left:max(12px,env(safe-area-inset-left));max-width:none}
}
@container sq-hud (max-height:360px){
  .sq-hud .ks-status{font-size:12px;padding:6px 10px}
}
`;

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(pointer: coarse)'), update = () => setCoarse(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return coarse;
}

export function SquareHud() {
  const { playing, setPlaying } = usePlayMode(), input = useInput(), root = useSceneRootRef();
  const coarse = useCoarsePointer(), pointer = input.state.lastPointer;
  const touch = pointer === 'touch' || pointer === 'pen' || (coarse && pointer !== 'keyboard');
  const [panel, setPanel] = useState<'camera' | 'help' | 'credits' | null>(null);
  const cameraId = `sq-camera-${useId()}`, cameraTrigger = useRef<HTMLButtonElement>(null);
  usePanelEscape(panel === 'camera' && !playing && !touch, cameraId, cameraTrigger, () => setPanel(null));
  useEffect(() => { setPanel(null); }, [playing, touch]);
  const toggle = () => { setPanel(null); setPlaying(!playing); root.current?.focus({ preventScroll: true }); };
  const closeCamera = () => {
    setPanel(null);
    // The Camera controls trigger is folded away after selection; return to its visible View trigger.
    cameraTrigger.current?.closest('.ks-menu')?.querySelector<HTMLButtonElement>('.ks-menu-trigger')?.focus({ preventScroll: true });
  };
  return <div className={`sq-hud ${playing ? 'sq-walk' : 'sq-orbit'} ${touch ? 'sq-touch' : 'sq-desktop'}`}>
    <style>{SQUARE_HUD_CSS}</style>
    <HudToolbar>
      <HudButton onClick={toggle}>{playing ? 'Back to the view' : 'Walk the square'}</HudButton>
      {!playing && <HudMenu label="View">
        <select className="ks-select sq-views" aria-label="Cathedral viewpoint" defaultValue="" onChange={event => {
          const view = VIEWPOINTS.find(item => item.id === event.target.value);
          if (view) orbitRig.current?.setView({ position: [...view.position], target: [...view.target], fov: view.fov, maxPolar: Math.PI * .99 });
        }}>
          <option value="" disabled>Choose a view</option>
          {VIEWPOINTS.map(view => <option key={view.id} value={view.id}>{view.label}</option>)}
        </select>
        <HudButton onClick={() => orbitRig.current?.reset()}>Reset view</HudButton>
        {!touch && <HudButton ref={cameraTrigger} aria-expanded={panel === 'camera'} aria-controls={cameraId} onClick={() => setPanel(panel === 'camera' ? null : 'camera')}>Camera controls</HudButton>}
      </HudMenu>}
      <HudMenu label="More" preservePath>
        <HelpOverlay playing={false} open={panel === 'help'} onOpenChange={open => setPanel(open ? 'help' : null)} label="Controls">
          {touch
            ? 'Drag to orbit, pinch to zoom and use two fingers to pan. Walk the square starts outside the west doors. Use the stick to walk and drag the view to look. Back to the view returns to your saved orbit.'
            : 'Drag to orbit, scroll to zoom, right-drag to pan. View has named viewpoints, Reset view and camera buttons. Enter, or Walk the square, starts outside the west doors. Click the view to capture the mouse. W A S D walks, Shift runs. Escape closes an open panel first, then leaves walking and restores your orbit.'}
        </HelpOverlay>
        <CreditsPanel open={panel === 'credits'} onOpenChange={open => setPanel(open ? 'credits' : null)}/>
      </HudMenu>
      <HudHideButton/>
    </HudToolbar>
    {panel === 'camera' && !playing && !touch && <HudPanel id={cameraId} className="sq-camera" aria-label="Camera controls" data-ks-dismiss-panel>
      <CameraButtons rig={orbitRig}/><HudButton onClick={closeCamera}>Close camera controls</HudButton>
    </HudPanel>}
    <StatusLine text={playing
      ? (touch ? 'Stick to walk. Drag to look.' : 'Click to look. W A S D walks. Shift runs. Escape returns.')
      : (touch ? 'Drag to orbit. Pinch to zoom.' : 'Drag to orbit. Scroll to zoom. Enter walks.')}/>
    {playing && touch && <VirtualJoystick label="Walk"/>}
  </div>;
}
