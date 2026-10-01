import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CameraButtons, CreditsPanel, HelpOverlay, HudButton, HudSegmented, StatusLine, TouchButtons, useHud, useInput, usePanelEscape, usePlayMode, useReducedMotion, useSceneRootRef, VirtualJoystick } from '@kiln-scenes/scene-kit';
import type { CreditEntry, TouchButtonDef } from '@kiln-scenes/scene-kit';
import { useGoldenGateSession } from '../state';
import { PRESET_LABELS, PRESET_ORDER } from '../presets';
import { FLIGHT_NAMES, readGoldenGateParams } from '../params';
import type { FlightName } from '../params';
import { FLIGHT_LABELS } from '../camera/flights';
import { TRADEMARK_NOTE } from '../constants';
import { GG_STRINGS } from './strings';
import { GG_HUD_CSS } from './styles';
import { DRIVE_ACTIONS } from '../play/actions';

/** The trademark note is always shown verbatim, even when the pack's credits change. */
const TRADEMARK_ENTRY: CreditEntry = { name: 'Golden Gate Bridge trademark', licence: 'Trademark notice', note: TRADEMARK_NOTE };
const DRIVE_BUTTONS: readonly TouchButtonDef[] = [
  { action: DRIVE_ACTIONS.boost, label: GG_STRINGS.boost, hold: true, slot: 'pedal-upper' },
  { action: DRIVE_ACTIONS.brake, label: GG_STRINGS.brake, hold: true, slot: 'pedal-lower' },
];

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

export function GoldenGateHud() {
  const session = useGoldenGateSession(), hud = useHud(session.hud), { playing, setPlaying } = usePlayMode(), input = useInput(), root = useSceneRootRef();
  const params = useMemo(() => readGoldenGateParams(), []), [menu, setMenu] = useState(false), coarse = useCoarsePointer();
  const menuId = `gg-flights-${useId()}`, menuTrigger = useRef<HTMLButtonElement>(null), reduced = useReducedMotion();
  usePanelEscape(menu, menuId, menuTrigger, () => setMenu(false));
  if (params.hud === false) return null;
  const pointer = input.state.lastPointer, touch = pointer === 'touch' || pointer === 'pen';
  // D-22 touch layout (the Farm's rule): touch or pen input, or a coarse primary pointer unless the keyboard was used last.
  // Drag, pinch and two-finger pan move the camera there, so the camera button pad is for keyboard and mouse only
  // and Reset view moves into the toolbar.
  const touchLayout = touch || (coarse && pointer !== 'keyboard'), overview = !playing && !hud.flight;
  const presetOptions = PRESET_ORDER.map(value => ({ value, label: PRESET_LABELS[value] }));
  const play = (name: FlightName) => { setMenu(false); session.camera?.playFlight(name); root.current?.focus({ preventScroll: true }); };
  const drive = () => {
    if (!playing) { session.camera?.stopFlight(); setPlaying(true); root.current?.focus({ preventScroll: true }); return; }
    setPlaying(false);
  };
  // Layout in ./styles.ts: sized by the HUD's own width, with the kit's help and credits panels sized against the whole HUD (GG-007).
  return <div className="gg-hud">
    <style>{GG_HUD_CSS}</style>
    <div className="gg-top"><div className="ks-toolbar">
      <HudSegmented label={GG_STRINGS.light} value={hud.preset} options={presetOptions} onChange={value => session.presets?.set(value, { immediate: reduced || hud.paused })}/>
      {!playing && (hud.flight
        ? <HudButton onClick={() => session.camera?.stopFlight()}>{GG_STRINGS.flyoverStop}</HudButton>
        : <HudButton ref={menuTrigger} aria-expanded={menu} aria-controls={menuId} onClick={() => setMenu(!menu)}>{GG_STRINGS.flyovers}</HudButton>)}
      <HudButton data-ks-preserve-path aria-pressed={hud.paused} onClick={() => session.motion.setPaused(!hud.paused)}>{hud.paused ? GG_STRINGS.resumeMotion : GG_STRINGS.pauseMotion}</HudButton>
      {overview && touchLayout && <HudButton onClick={() => session.orbit.current?.reset()}>{GG_STRINGS.resetView}</HudButton>}
      <HudButton onClick={drive}>{playing ? GG_STRINGS.leaveCar : GG_STRINGS.drive}</HudButton>
      <HelpOverlay label={GG_STRINGS.controls} desktop={GG_STRINGS.helpKeyboard} touch={GG_STRINGS.helpTouch}/>
      <CreditsPanel label={GG_STRINGS.credits} credits={[TRADEMARK_ENTRY, ...(session.world?.credits ?? [])]}/>
    </div>
    {menu && !playing && !hud.flight && <div id={menuId} className="ks-panel gg-flights" role="group" aria-label={GG_STRINGS.flyovers} data-ks-dismiss-panel>
      {FLIGHT_NAMES.map(name => {
        const needsFog = name === 'fog-roll' && hud.preset !== 'fog';
        return <HudButton key={name} disabled={needsFog} title={needsFog ? GG_STRINGS.flyoverNeedsFog : undefined} onClick={() => play(name)}>{FLIGHT_LABELS[name]}</HudButton>;
      })}
    </div>}</div>
    {overview && !touchLayout && <div className="gg-camera"><CameraButtons rig={session.orbit}/></div>}
    <div className="gg-bottom">
      {playing && <div className="ks-panel gg-speed" aria-live="off">{GG_STRINGS.speed(hud.speedKmh)}</div>}
      <StatusLine text={playing && hud.atRoadEnd ? (touch ? GG_STRINGS.turnAroundTouch : GG_STRINGS.turnAroundPrompt) : hud.status}/>
    </div>
    {playing && touchLayout && <><VirtualJoystick label={GG_STRINGS.joystick} axes="throttle"/>
      <TouchButtons buttons={DRIVE_BUTTONS}/></>}
  </div>;
}
