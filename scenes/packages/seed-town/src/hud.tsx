import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { CameraButtons, CreditsPanel, HelpOverlay, HudButton, HudHideButton, HudMenu, HudPanel, HudSegmented, HudToolbar, StatusLine, useInput, usePanelEscape, usePlayMode, useSceneRootRef, VirtualJoystick } from '@kiln-scenes/scene-kit';
import { freshSeed, MAX_SEED_LENGTH } from './session';
import type { TownInfo, TownSession } from './session';

/** The seed panel sits top left, the toolbar top right; both fold under each other in a narrow embed. */
export const TOWN_HUD_CSS = `
.ks-hud>.st-hud{pointer-events:none}
.st-hud{position:absolute;inset:0;pointer-events:none;container:st-hud/size;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 0 max(12px,env(safe-area-inset-left))}
.st-hud>*{pointer-events:auto}.st-hud>style{display:none}.st-hud>.ks-status{pointer-events:none}
.st-hud .ks-toolbar{position:static;justify-content:flex-end;max-width:100%;gap:6px;margin-left:auto}
.st-hud .ks-toolbar .ks-button{padding:8px}
.st-hud .st-seed{position:static;display:grid;gap:8px;padding:10px 12px;max-width:min(360px,100%);box-sizing:border-box}
.st-hud .st-seed form{display:flex;flex-wrap:wrap;gap:6px;align-items:end;margin:0}
.st-hud .st-seed label{display:grid;gap:2px;font-size:12px;flex:1 1 9em;min-width:0}
.st-hud .st-seed input{min-height:44px;min-width:0;width:100%;box-sizing:border-box;border:1px solid #879593;border-radius:9px;background:#0d1917;color:#fff;padding:8px 10px;font:inherit}
.st-hud .st-seed input:focus-visible{outline:3px solid #fff;outline-offset:3px}
.st-hud .st-seed .ks-button{padding:8px 12px}
.st-hud .st-facts{margin:0;font-size:12px;line-height:1.4;opacity:.92;font-variant-numeric:tabular-nums}
.st-hud :is(.ks-help,.ks-credits,.st-camera){position:fixed;z-index:3;top:max(70px,calc(env(safe-area-inset-top) + 58px));right:max(12px,env(safe-area-inset-right));max-height:calc(100% - max(70px,calc(env(safe-area-inset-top) + 58px)) - max(12px,env(safe-area-inset-bottom)));overflow:auto;overscroll-behavior:contain}
.st-hud .st-camera{max-width:min(440px,calc(100% - 24px))}
.st-hud .st-camera>button{margin-top:8px}
.st-hud .st-views{max-width:min(240px,100%);min-width:0}
.st-hud .ks-status{max-width:min(520px,calc(100% - 24px));box-sizing:border-box;padding:8px 12px}
.st-hud.st-walk.st-touch .ks-status{left:auto;right:max(12px,env(safe-area-inset-right));transform:none;max-width:min(400px,calc(100% - 180px))}
@container st-hud (max-width:560px){
  .st-hud :is(.ks-help,.ks-credits,.st-camera){left:max(12px,env(safe-area-inset-left));max-width:none}
  .st-hud .st-seed{max-width:none;width:100%;order:2}
}
@container st-hud (max-height:360px){
  .st-hud .ks-status{font-size:12px;padding:6px 10px}
  .st-hud .st-facts{display:none}
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

const count = (value: number) => value.toLocaleString('en-US');

/** One line of what stands: counted by the page as it fills the buffers, not copied from a build. */
export function townFacts(info: TownInfo): string {
  const time = info.buildMs < 10 ? info.buildMs.toFixed(1) : String(Math.round(info.buildMs));
  return `${count(info.buildings)} buildings from ${count(info.placements)} kit pieces, drawn in ${count(info.draws)} calls. Dressed in ${time} ms.`;
}

export function TownHud({ session }: { session: TownSession }) {
  const { playing, setPlaying } = usePlayMode(), input = useInput(), root = useSceneRootRef();
  const coarse = useCoarsePointer(), pointer = input.state.lastPointer;
  const touch = pointer === 'touch' || pointer === 'pen' || (coarse && pointer !== 'keyboard');
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const info = useSyncExternalStore(session.subscribe, session.getInfo, session.getInfo);
  const [draft, setDraft] = useState(state.seed);
  const [panel, setPanel] = useState<'camera' | 'help' | 'credits' | null>(null);
  const cameraId = `st-camera-${useId()}`, seedId = `st-seed-${useId()}`, cameraTrigger = useRef<HTMLButtonElement>(null);
  usePanelEscape(panel === 'camera' && !playing && !touch, cameraId, cameraTrigger, () => setPanel(null));
  useEffect(() => { setPanel(null); }, [playing, touch]);
  useEffect(() => { setDraft(state.seed); }, [state.seed]);
  const views = session.frame?.views ?? [];
  const toggle = () => { setPanel(null); setPlaying(!playing); root.current?.focus({ preventScroll: true }); };
  const submit = (event: FormEvent) => { event.preventDefault(); session.set({ seed: draft }); };
  const closeCamera = () => {
    setPanel(null);
    cameraTrigger.current?.closest('.ks-menu')?.querySelector<HTMLButtonElement>('.ks-menu-trigger')?.focus({ preventScroll: true });
  };
  return <div className={`st-hud ${playing ? 'st-walk' : 'st-orbit'} ${touch ? 'st-touch' : 'st-desktop'}`}>
    <style>{TOWN_HUD_CSS}</style>
    <HudPanel className="st-seed" aria-label="Town seed">
      <form onSubmit={submit}>
        <label htmlFor={seedId}>Seed
          <input id={seedId} type="text" value={draft} maxLength={MAX_SEED_LENGTH} autoComplete="off" autoCapitalize="off" spellCheck={false}
            onChange={event => setDraft(event.target.value)}/>
        </label>
        <HudButton type="submit">Build</HudButton>
        <HudButton onClick={() => session.set({ seed: freshSeed(Math.random, state.seed) })}>New town</HudButton>
      </form>
      <HudSegmented label="Hour" value={state.dusk ? 'dusk' : 'day'} options={[{ value: 'day', label: 'Day' }, { value: 'dusk', label: 'Dusk' }]}
        onChange={value => session.set({ dusk: value === 'dusk' })}/>
      {info && <p className="st-facts">{townFacts(info)}</p>}
    </HudPanel>
    <HudToolbar>
      <HudButton onClick={toggle}>{playing ? 'Back to the view' : 'Walk the town'}</HudButton>
      {!playing && <HudMenu label="View">
        <select className="ks-select st-views" aria-label="Town viewpoint" value="" onChange={event => {
          const view = views.find(item => item.id === event.target.value);
          if (view) session.orbit.current?.setView({ position: [...view.position], target: [...view.target], fov: view.fov, maxPolar: Math.PI * .99 });
        }}>
          <option value="" disabled>Choose a view</option>
          {views.map(view => <option key={view.id} value={view.id}>{view.label}</option>)}
        </select>
        <HudButton onClick={() => session.orbit.current?.reset()}>Reset view</HudButton>
        {!touch && <HudButton ref={cameraTrigger} aria-expanded={panel === 'camera'} aria-controls={cameraId} onClick={() => setPanel(panel === 'camera' ? null : 'camera')}>Camera controls</HudButton>}
      </HudMenu>}
      <HudMenu label="More" preservePath>
        <HelpOverlay playing={false} open={panel === 'help'} onOpenChange={open => setPanel(open ? 'help' : null)} label="Controls">
          {touch
            ? 'Type a seed and choose Build, or choose New town, to stand a different town from the same nine kit files. Drag to orbit, pinch to zoom and use two fingers to pan. Walk the town starts on the road south of the high street. Use the stick to walk and drag the view to look.'
            : 'Type a seed and press Enter, or choose New town, to stand a different town from the same nine kit files. Drag to orbit, scroll to zoom, right-drag to pan. Enter, or Walk the town, starts on the road south of the high street. Click the view to capture the mouse. W A S D walks, Shift runs. Escape closes an open panel first, then leaves walking.'}
        </HelpOverlay>
        <CreditsPanel open={panel === 'credits'} onOpenChange={open => setPanel(open ? 'credits' : null)}/>
      </HudMenu>
      <HudHideButton/>
    </HudToolbar>
    {panel === 'camera' && !playing && !touch && <HudPanel id={cameraId} className="st-camera" aria-label="Camera controls" data-ks-dismiss-panel>
      <CameraButtons rig={session.orbit}/><HudButton onClick={closeCamera}>Close camera controls</HudButton>
    </HudPanel>}
    <StatusLine text={playing
      ? (touch ? 'Stick to walk. Drag to look.' : 'Click to look. W A S D walks. Shift runs. Escape returns.')
      : (touch ? 'Drag to orbit. Pinch to zoom.' : 'Drag to orbit. Scroll to zoom. Enter walks.')}/>
    {playing && touch && <VirtualJoystick label="Walk"/>}
  </div>;
}
