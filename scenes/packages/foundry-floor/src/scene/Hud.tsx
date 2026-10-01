// SPDX-License-Identifier: MIT
// The Foundry Floor HUD (sim-spec 10, TASK-FF2 items 3 and 4): the mode, scale and sim time always on screen (with the
// synthetic-traffic label in megafab mode), the fab's KPIs and tool counts by E10 state, the time-scale, mode and view
// controls, About this model one tap away from every view, and the cameras' controls: Walk (keyboard, or the kit's
// joystick on touch, with the kit's controls help), the tour with its stop captions, the panel of a tapped tool or
// stocker, and follow-a-wafer (pick a lot; its step, place and route progress). Every panel line is derived from the
// twin's state (panels.ts); the cameras (Cameras.tsx) refresh them.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CreditsPanel, HelpOverlay, HudButton, HudPanel, HudSegmented, StatusLine, useHud, useInput, usePanelEscape, usePlayMode, useSceneRootRef, VirtualJoystick } from '@kiln-scenes/scene-kit';
import about from '../../data/about.json';
import { SIM_CONFIG } from '../sim/config';
import type { FabMode } from '../sim/fab';
import { CAMERA_STRINGS as S, hudLines, kpiLines, modeLabel, tourCaption } from './hud-text';
import { useFoundrySession } from './session';
import type { ViewName } from './session';

const scales = SIM_CONFIG.scales;
const SCALE_OPTIONS = scales.values.map((value, i) => ({ value: String(value), label: scales.labels[i] ?? `${value}x` }));
const MODE_OPTIONS = (['pilot', 'megafab'] as const).map(value => ({ value, label: modeLabel(value) }));
const VIEW_OPTIONS: { value: ViewName; label: string }[] = [{ value: 'landing', label: 'Gallery' }, { value: 'overview', label: 'Overview' }, { value: 'stocker', label: 'Transfers' }];
const LABELS = about.labels as Record<string, string>;

/** Sized by the HUD's own box. Wide: the status panel top left, the toolbar top right, the panels and the status line
 *  bottom right. Narrow (900 px and under): the status panel and the panels stack at the bottom (the KPI list folds away
 *  while a panel is open or the joystick is up, and the stack rises above the joystick). The `.ks-hud>` prefix outranks
 *  the kit's `.ks-hud>*{pointer-events:auto}` so the canvas keeps its gestures; the controls take pointer events back.
 *  HUD updates arrive through the kit's store, which coalesces them to ten a second. */
const FF_HUD_CSS = `
.ks-hud>.ff-hud{position:absolute;inset:0;pointer-events:none;container:ff-hud/size}
.ff-hud>.ff-top{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-end;gap:8px;box-sizing:border-box;pointer-events:none;
  padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 12px max(12px,env(safe-area-inset-left))}
.ff-top>.ks-toolbar{position:static;justify-content:flex-end;max-width:min(680px,100%);pointer-events:auto}
.ff-top .ks-toolbar>.ks-help{position:static;flex:1 0 100%;max-width:none;max-height:40cqh;overflow:auto;text-align:left;font:14px/1.5 system-ui,sans-serif}
.ff-top>.ff-about{pointer-events:auto;overflow:auto;max-height:calc(100% - 110px);max-width:min(480px,100%);font:14px/1.5 system-ui,sans-serif}
.ff-about h2{margin:0 0 8px;font-size:17px}.ff-about h3{margin:12px 0 4px;font-size:14px}.ff-about p{margin:0 0 6px}
.ff-about dl{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:4px 0 10px}.ff-about dt{font-weight:600}.ff-about dd{margin:0}
.ff-hud>.ff-bottom{display:contents}
.ff-bottom>.ff-status{position:absolute;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));pointer-events:auto;
  max-width:min(340px,calc(100% - 24px));padding:10px 12px;font:13px/1.45 system-ui,sans-serif}
.ff-status .ff-mode{font-weight:600;font-size:14px}.ff-status .ff-syn{font-size:12px;opacity:.86}
.ff-status ul{margin:6px 0 0;padding:0;list-style:none;font-variant-numeric:tabular-nums}
.ff-bottom>.ff-dock{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));width:min(380px,calc(100% - 24px));
  display:flex;flex-direction:column;justify-content:flex-end;gap:8px;pointer-events:none}
.ff-dock>*{pointer-events:auto}
/* The kit joystick sits inside this layer, not directly under .ks-hud, so it takes its touches back explicitly. */
.ff-hud>.ks-joystick{pointer-events:auto}
.ff-dock>.ks-status{position:static;transform:none;max-width:none;text-align:left;pointer-events:none;padding:8px 12px;font:13px/1.45 system-ui,sans-serif}
/* The tour caption and the follow panel show what the status line announces: it stays for assistive technology only. */
.ff-camera-tour .ff-dock>.ks-status,.ff-camera-follow .ff-dock>.ks-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.ff-info{max-width:none;max-height:45cqh;overflow:auto;padding:10px 12px;font:13px/1.45 system-ui,sans-serif}
.ff-info h2{margin:0 0 4px;font-size:15px}
.ff-info ul,.ff-info ol{margin:4px 0 8px;padding:0;list-style:none;font-variant-numeric:tabular-nums}
.ff-info p{margin:0 0 6px}
.ff-picker li+li{margin-top:6px}.ff-picker li>.ks-button{width:100%;text-align:left;padding:8px 12px}
.ff-progress{height:8px;margin:6px 0 4px;border-radius:4px;background:#2c3f3b;overflow:hidden}.ff-progress>span{display:block;height:100%;background:#7fd1b9}
@container ff-hud (max-width: 900px){
  .ff-hud>.ff-bottom{position:absolute;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));
    display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none}
  .ff-bottom>.ff-status,.ff-bottom>.ff-dock{position:static;width:auto;max-width:none}
  .ff-bottom>.ff-status{align-self:flex-start;max-width:min(420px,100%)}
  .ff-info{max-height:36cqh}
  .ff-hud.ff-compact .ff-status ul{display:none}
  .ff-hud.ff-joystick>.ff-bottom{bottom:calc(max(24px,env(safe-area-inset-bottom)) + 144px)}
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

/** `leading`: controls a host places first in the toolbar (the campus puts its Exit there); FF2 passes none. */
export function FoundryHud({ leading }: { leading?: ReactNode } = {}) {
  const session = useFoundrySession(), hud = useHud(session.hud), { playing, setPlaying } = usePlayMode(), input = useInput(), root = useSceneRootRef();
  const aboutTrigger = useRef<HTMLButtonElement>(null);
  usePanelEscape(hud.about, 'ff-about', aboutTrigger, () => session.setAbout(false));
  const coarse = useCoarsePointer(), pointer = input.state.lastPointer;
  const touch = pointer === 'touch' || pointer === 'pen' || (coarse && pointer !== 'keyboard');
  const lines = hudLines({ mode: hud.mode, scale: hud.scale, simMs: hud.simMs, synthetic: hud.synthetic });
  const camera = hud.camera, control = () => session.camera;
  const joystick = playing && touch, open = !!(hud.panel || hud.picker || hud.tour || hud.follow);
  const walk = () => {
    if (playing) { setPlaying(false); return; }
    setPlaying(true); root.current?.focus({ preventScroll: true });
  };
  return <div className={`ff-hud ff-camera-${camera}${joystick ? ' ff-joystick' : ''}${open || joystick ? ' ff-compact' : ''}`}>
    <style>{FF_HUD_CSS}</style>
    <div className="ff-top">
      <div className="ks-toolbar">
        {leading}
        <HudSegmented label="Time scale" value={String(hud.scale)} options={SCALE_OPTIONS} onChange={value => session.setScale(Number(value))}/>
        {camera === 'orbit' && <HudSegmented label="Mode" value={hud.mode} options={MODE_OPTIONS} onChange={value => session.setMode(value as FabMode)}/>}
        {camera === 'orbit' && <HudSegmented label="View" value={hud.view} options={VIEW_OPTIONS} onChange={value => session.setView(value as ViewName)}/>}
        {hud.floor?.followLot !== null && hud.floor?.followLot !== undefined && !playing && <HudButton onClick={() => control()?.follow(hud.floor!.followLot!)}>Follow floor transfer</HudButton>}
        <HudButton aria-pressed={playing} onClick={walk}>{playing ? S.stopWalking : S.walk}</HudButton>
        {playing && <HelpOverlay label={S.controls} desktop={S.helpKeyboard} touch={S.helpTouch}/>}
        {!playing && <HudButton aria-pressed={camera === 'tour'} onClick={() => (camera === 'tour' ? control()?.stopTour() : control()?.startTour())}>
          {camera === 'tour' ? S.stopTour : S.tour}</HudButton>}
        {!playing && <HudButton aria-expanded={camera === 'follow' ? undefined : !!hud.picker} aria-controls={camera === 'follow' ? undefined : 'ff-picker'}
          onClick={() => (camera === 'follow' ? control()?.unfollow() : hud.picker ? control()?.closePicker() : control()?.openPicker())}>
          {camera === 'follow' ? S.stopFollowing : S.follow}</HudButton>}
        <HudButton ref={aboutTrigger} aria-expanded={hud.about} aria-controls="ff-about" onClick={() => session.setAbout(!hud.about)}>About this model</HudButton>
        <CreditsPanel label="Credits"/>
      </div>
      {hud.about && <HudPanel id="ff-about" className="ff-about" role="region" aria-label={about.title} data-ks-dismiss-panel>
        <h2>{about.title}</h2>
        {about.sections.map(section => <section key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p></section>)}
        <h3>Basis labels</h3>
        <dl>{Object.entries(LABELS).map(([letter, text]) => [<dt key={`${letter}-t`}>{letter}</dt>, <dd key={`${letter}-d`}>{text}</dd>])}</dl>
        <p>{about.modeLabel}</p>
        <HudButton onClick={() => session.setAbout(false)}>Close About</HudButton>
      </HudPanel>}
    </div>
    <div className="ff-bottom">
      <HudPanel className="ff-status" aria-label="Fab status" aria-live="off">
        <div className="ff-mode">{lines.mode}</div>
        {lines.synthetic && <div className="ff-syn">{lines.synthetic}</div>}
        {hud.kpis && <ul>{kpiLines(hud.kpis).map(line => <li key={line.slice(0, 8)}>{line}</li>)}</ul>}
        {hud.floor && <p className="ff-floor-status">{hud.floor.active}<br/>{hud.floor.delivered} delivered · {hud.floor.collected} collected · {hud.floor.queued} queued</p>}
      </HudPanel>
      <div className="ff-dock">
        {hud.tour && <HudPanel className="ff-info ff-tour" role="region" aria-label="Tour">
          <h2>{tourCaption(hud.tour)}</h2>
          <ul>{hud.tour.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
        </HudPanel>}
        {hud.follow && <HudPanel className="ff-info ff-follow" role="region" aria-label="Following a wafer">
          <h2>{hud.follow.title}</h2>
          <div className="ff-progress" role="progressbar" aria-label={S.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.follow.progress * 100)}>
            <span style={{ width: `${(hud.follow.progress * 100).toFixed(1)}%` }}/>
          </div>
          <ul>{hud.follow.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
        </HudPanel>}
        {hud.picker && <HudPanel id="ff-picker" className="ff-info ff-picker" role="region" aria-label={S.pickerTitle}>
          <h2>{S.pickerTitle}</h2>
          <p>{hud.picker.length ? S.pickerNote : S.pickerEmpty}</p>
          <ol>{hud.picker.map(choice => <li key={choice.id}><HudButton onClick={() => control()?.follow(choice.id)}>{choice.label}</HudButton></li>)}</ol>
          <HudButton onClick={() => control()?.closePicker()}>{S.closePicker}</HudButton>
        </HudPanel>}
        {hud.panel && <HudPanel className="ff-info ff-panel" role="region" aria-label={`${hud.panel.title} panel`}>
          <h2>{hud.panel.title}</h2>
          <ul>{hud.panel.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
          <HudButton onClick={() => control()?.closePanel()}>{S.closePanel}</HudButton>
        </HudPanel>}
        <StatusLine text={hud.status}/>
      </div>
    </div>
    {joystick && <VirtualJoystick label={S.joystick}/>}
  </div>;
}
