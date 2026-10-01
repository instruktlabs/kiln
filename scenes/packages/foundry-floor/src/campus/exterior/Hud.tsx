// SPDX-License-Identifier: MIT
// The exterior HUD: named views, the drive with independent touch steering and pedals, persistent entry to the
// registered SW level-1 cutaway, controls help,
// About the campus and the credits. Sized like FF2's HUD: the toolbar top right, the context action and the status
// line bottom centre, lifted above the joystick while it shows. The touch layout (D-22, Golden Gate's rule) applies to
// touch or pen input, or a coarse primary pointer unless the keyboard was used last: drag, pinch and two-finger pan
// move the camera there, and Reset view (back to the chosen named view) sits in the toolbar.
import { useEffect, useRef, useState } from 'react';
import { CreditsPanel, HelpOverlay, HudButton, HudHideButton, HudMenu, HudPanel, HudSegmented, HudToolbar, StatusLine, TouchButtons, useHud, useInput, usePanelEscape, usePlayMode, useSceneRootRef, VirtualJoystick } from '@kiln-scenes/scene-kit';
import { useCampusSession } from '../session';
import type { CampusViewName } from '../data';
import { DRIVE_TOUCH_BUTTONS } from '../drive/input';

const VIEW_OPTIONS: { value: CampusViewName; label: string }[] = [
  { value: 'campus', label: 'Campus' }, { value: 'pair', label: 'One pair' }, { value: 'canopy', label: 'Arrival' }, { value: 'split', label: 'The split' },
];

export const CAMPUS_STRINGS = {
  drive: 'Drive the sedan',
  leaveCar: 'Leave the car',
  enter: 'Enter the fab',
  resetView: 'Reset view',
  controls: 'Controls',
  joystick: 'Steer',
  turnAroundPrompt: 'End of the road. Press R, or stop and hold S, to turn around',
  turnAroundTouch: 'End of the road. Stop and hold Brake / reverse to turn around',
  helpKeyboard: 'Drag to orbit, scroll to zoom, right-drag to pan; choose a view in the toolbar. Press Enter or E, or choose Drive the sedan, to drive: W or Up accelerates, S or Down brakes and then reverses, A D or Left Right steer, Space brakes, X is the handbrake. Hold Shift while accelerating for a speed boost. At the end of a road press R, or hold W against the stop or S at rest, to turn around. Drag to look around the car and scroll to bring the camera closer or farther. Enter the fab is always available and transitions from the south-west entrance to the registered level 1 cutaway. E or Escape leaves the car.',
  helpTouch: 'Drag to orbit, pinch to zoom, two-finger drag to pan; Reset view, in the toolbar, brings the chosen view back. Choose Drive the sedan, steer with the left stick, and hold the separate Throttle, Brake / reverse and Boost buttons on the right. Pinch to bring the camera closer or farther and drag to look around the car. At the end of a road, stop and hold Brake / reverse to turn around. Enter the fab is always available and transitions from the south-west entrance to level 1. Leave the car returns to the orbit.',
  speed: (kmh: number) => `${Math.round(kmh)} km/h`,
};

const CSS = `
.ks-hud>.fc-hud{position:absolute;inset:0;pointer-events:none;container:fc-hud/size}
.fc-hud>.fc-top{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-end;gap:8px;box-sizing:border-box;pointer-events:none;
  padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 12px max(12px,env(safe-area-inset-left))}
.fc-top>.ks-toolbar{position:static;justify-content:flex-end;max-width:min(680px,100%);pointer-events:auto}
.fc-top>.fc-about{pointer-events:auto;overflow:auto;max-height:calc(100% - 110px);max-width:min(480px,100%);font:14px/1.5 system-ui,sans-serif}
.fc-about h2{margin:0 0 8px;font-size:17px}.fc-about p{margin:0 0 8px}
.fc-hud>.fc-bottom{position:absolute;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;
  pointer-events:none;max-width:calc(100% - 24px)}
.fc-bottom>.ks-button{pointer-events:auto;min-height:48px;padding:10px 22px;font:600 15px system-ui,sans-serif}
.fc-bottom>.fc-speed{padding:6px 14px;max-width:none;font:600 15px system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
.fc-bottom>.ks-status{position:static;transform:none;pointer-events:none;padding:8px 12px;font:13px/1.45 system-ui,sans-serif}
.fc-bottom>.ks-status:empty{display:none}
/* The kit joystick sits inside this layer, not directly under .ks-hud, so it takes its touches back explicitly. */
.fc-hud>.ks-joystick,.fc-hud>.ks-touch-buttons{pointer-events:auto}
.fc-hud.fc-joystick>.fc-bottom{bottom:calc(max(24px,env(safe-area-inset-bottom)) + 144px)}
`;

/** The primary pointer is coarse (a phone or tablet): the touch layout applies before the first touch arrives. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(pointer: coarse)'), update = () => setCoarse(query.matches); update();
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  return coarse;
}

export function ExteriorHud() {
  const campus = useCampusSession(), hud = useHud(campus.hud), { playing, setPlaying } = usePlayMode(), input = useInput(), root = useSceneRootRef();
  const coarse = useCoarsePointer(), S = CAMPUS_STRINGS;
  const aboutTrigger = useRef<HTMLButtonElement>(null);
  usePanelEscape(hud.about,'fc-about',aboutTrigger,()=>campus.setAbout(false));
  const busy = hud.moving, driving = playing && hud.camera === 'drive';
  const pointer = input.state.lastPointer, touch = pointer === 'touch' || pointer === 'pen';
  const touchLayout = touch || (coarse && pointer !== 'keyboard'), joystick = driving && touchLayout;
  const drive = () => {
    if (driving) { setPlaying(false); return; }
    setPlaying(true); root.current?.focus({ preventScroll: true });
  };
  return <div className={joystick ? 'fc-hud fc-joystick' : 'fc-hud'}>
    <style>{CSS}</style>
    <div className="fc-top">
      <HudToolbar>
        {/* Three groups: what to look at, the drive, and everything secondary. */}
        {!driving && <HudMenu label="View" collapse="narrow">
          <HudSegmented label="View" value={hud.view} options={VIEW_OPTIONS} onChange={value => campus.setView(value as CampusViewName)}/>
          {touchLayout && <HudButton onClick={() => campus.setView(hud.view)}>{S.resetView}</HudButton>}
        </HudMenu>}
        {hud.driveReady && <HudButton disabled={busy} onClick={drive}>{driving ? S.leaveCar : S.drive}</HudButton>}
        <HudMenu label="More">
          <HudButton aria-pressed={hud.paused} onClick={() => campus.setPaused(!hud.paused)}>{hud.paused ? 'Resume motion' : 'Pause motion'}</HudButton>
          <HudButton ref={aboutTrigger} aria-expanded={hud.about} aria-controls="fc-about" onClick={() => campus.setAbout(!hud.about)}>About the campus</HudButton>
          <HelpOverlay label={S.controls} desktop={S.helpKeyboard} touch={S.helpTouch}/>
          <CreditsPanel label="Credits"/>
        </HudMenu>
        <HudHideButton/>
      </HudToolbar>
      {hud.about && <HudPanel id="fc-about" className="fc-about" role="region" aria-label="About the campus" data-ks-dismiss-panel>
        <h2>The Foundry Floor campus</h2>
        <p>Four fab buildings in two mirrored pairs, each a head and a 2.6 km hall, joined by two links across the cross pass,
          with an arrival canopy at each end of the split road and eight bridges over it. The buildings are the accepted
          Kiln structure models placed on the campus plan; roads, parking, utility blocks and lights are simple scene volumes.</p>
        <p>Drive the sedan along the split road and around the roundabout among the campus traffic, or orbit above it.
          Enter the fab transitions from the south-west entrance to a physically registered level 1 cutaway. This representative slice is the one the
          Foundry Floor interior shows.</p>
        <HudButton onClick={() => campus.setAbout(false)}>Close About</HudButton>
      </HudPanel>}
    </div>
    <div className="fc-bottom">
      {driving && <div className="ks-panel fc-speed" aria-live="off">{S.speed(hud.speedKmh)}</div>}
      <HudButton disabled={busy} onClick={() => campus.enter()}>{S.enter}</HudButton>
      <StatusLine text={driving && hud.atRoadEnd ? (touchLayout ? S.turnAroundTouch : S.turnAroundPrompt) : hud.status}/>
    </div>
    {joystick && <><VirtualJoystick label={S.joystick} axes="x"/><TouchButtons buttons={DRIVE_TOUCH_BUTTONS}/></>}
  </div>;
}
