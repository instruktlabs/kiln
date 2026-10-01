import { useEffect, useState } from 'react';
import { CameraButtons, HelpOverlay, HudButton, InteractButton, InteractPrompt, StatusLine, useHud, useInput, usePlayMode, useSceneRootRef, VirtualJoystick } from '@kiln-scenes/scene-kit';
import { useFarmSession } from '../state';
import { FARM_STRINGS } from './strings';

/**
 * Farm-scoped layout (M3a, D-22). The HUD lays out from 360 px wide in both orientations:
 * - the toolbar is static inside a full-HUD layer, so the help panel sizes against the HUD (GG-007) and stacks above the controls;
 * - the overview camera controls sit bottom-left and wrap, clear of the toolbar;
 * - the status line rises above the overview camera controls; in touch play it sits under the toolbar, away from the
 *   joystick, the context button and the player (beside the toolbar in a short landscape scene); it never takes input.
 * Instance-owned like the kit's stylesheet: no document mutation.
 */
export const FARM_HUD_CSS = `
.farm-hud{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;align-items:flex-end;container-type:size;
  padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 0 max(12px,env(safe-area-inset-left));box-sizing:border-box}
.ks-hud>.farm-hud{pointer-events:none}.farm-hud>*{pointer-events:auto}.farm-hud>style{display:none}.farm-hud>.ks-status{pointer-events:none}
.farm-hud .ks-toolbar{position:static;justify-content:flex-end;max-width:100%}
.farm-hud .ks-help{z-index:3;top:max(70px,calc(env(safe-area-inset-top) + 58px));right:max(12px,env(safe-area-inset-right));max-height:calc(100% - max(70px,calc(env(safe-area-inset-top) + 58px)) - 12px)}
.farm-hud .farm-camera{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));max-width:calc(100% - 24px)}
.farm-hud .ks-status{max-width:min(520px,calc(100% - 24px));box-sizing:border-box}
.farm-hud.farm-overview .ks-status,.farm-hud.farm-overview-touch .ks-status{bottom:calc(max(14px,env(safe-area-inset-bottom)) + 58px)}
.farm-hud.farm-play-touch .ks-status{top:calc(max(12px,env(safe-area-inset-top)) + 58px);bottom:auto}
.farm-hud .ks-touch-buttons{z-index:1}.farm-hud .ks-touch-button{max-width:calc(50cqw - 24px);white-space:normal}
@container (max-width:560px){
  .farm-hud.farm-overview .ks-status{bottom:calc(max(14px,env(safe-area-inset-bottom)) + 110px)}
  .farm-hud.farm-play-desktop .ks-status{bottom:calc(max(14px,env(safe-area-inset-bottom)) + 58px)}
  .farm-hud .ks-help{left:max(12px,env(safe-area-inset-left));max-width:none}
}
@container (max-height:480px) and (min-width:561px){
  .farm-hud.farm-play-touch .ks-status{top:max(12px,env(safe-area-inset-top));bottom:auto;left:max(12px,env(safe-area-inset-left));transform:none;max-width:calc(100% - 300px);text-align:left}
}
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

/**
 * SPEC 13.1 public HUD with the D-22 touch scheme (M3a). On touch: the joystick moves Rowan and, while driving,
 * is the throttle (forward accelerates, back brakes then reverses, sideways steers); one-finger drag looks and a
 * pinch zooms while driving; walking uses a fixed first-person eye. A context button appears when there is something to do
 * (open a door, drive, leave the tractor). The overview keeps one tap target, Reset view, since drag, pinch and
 * two-finger pan replace the rest of the camera pad. The mode button leaves play, so no Leave play pad exists.
 * Desktop walking captures the pointer; Escape releases it and returns to overview. Strings come from the table.
 */
export function FarmHud() {
  const session = useFarmSession(), hud = useHud(session.hud), { playing, setPlaying } = usePlayMode(), input = useInput(), root = useSceneRootRef();
  const pointer = input.state.lastPointer, coarse = useCoarsePointer();
  const touch = pointer === 'touch' || pointer === 'pen' || (coarse && pointer !== 'keyboard');
  const toggle = () => {
    if (!playing) { setPlaying(true); root.current?.focus({ preventScroll: true }); if (!touch) void session.captureWalk?.(); return; }
    // The pilot's play button stays in play while the tractor has no free exit.
    const sim = session.world?.sim; if (sim && !sim.stop()) return;
    setPlaying(false);
  };
  const layout = !playing ? (touch ? 'farm-overview-touch' : 'farm-overview') : touch ? 'farm-play-touch' : 'farm-play-desktop';
  return <div className={`farm-hud ${layout}`}>
    <style data-farm-styles="">{FARM_HUD_CSS}</style>
    <div className="ks-toolbar">
      <HudButton onClick={toggle}>{playing ? FARM_STRINGS.overview : FARM_STRINGS.walk}</HudButton>
      <HelpOverlay playing={false} label={FARM_STRINGS.controls} desktop={FARM_STRINGS.helpKeyboard} touch={FARM_STRINGS.helpTouch}/>
    </div>
    {!playing && <div className="farm-camera">{touch
      ? <HudButton className="farm-reset-view" onClick={() => session.orbit.current?.reset()}>{FARM_STRINGS.resetView}</HudButton>
      : <CameraButtons rig={session.orbit}/>}</div>}
    <StatusLine text={playing && !hud.driving && !touch ? (hud.captured ? FARM_STRINGS.walkCaptured : FARM_STRINGS.walkCapture) : hud.status}/>
    {playing && !touch && <InteractPrompt label={hud.interact} available={hud.canInteract}/>}
    {playing && touch && <VirtualJoystick label={hud.driving ? FARM_STRINGS.joystickDrive : FARM_STRINGS.joystick} axes={hud.driving ? 'throttle' : 'both'}/>}
    {playing && touch && hud.canInteract && <InteractButton label={hud.interact}/>}
  </div>;
}
