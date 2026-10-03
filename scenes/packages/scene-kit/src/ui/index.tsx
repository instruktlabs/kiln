import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, JSX, KeyboardEvent as ReactKeyboardEvent, ReactNode, Ref, RefObject } from 'react';
import type { CreditEntry } from '../assets';
import { useRuntime } from '../internal/runtime';
import { useSystem } from '../lifecycle';
import { TouchButtons, useInput } from '../input';
import type { TouchButtonDef } from '../input';
import type { HudStore } from './store';
import type { LiveKnobs } from '../quality';
import { closeScenePanelOnEscape, restoreScenePanelFocus } from './escape';
export * from './store';
export * from './fade';
export * from './styles';

/** Panels consume Escape before the scene's play controls or the embedding page. */
export function usePanelEscape(open: boolean, id: string, trigger: RefObject<HTMLButtonElement | null>, close: () => void): void {
  const runtime = useRuntime(), latest = useRef(close); latest.current = close;
  useEffect(() => {
    const root = runtime.rootRef.current; if (!root || !open) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null, panel = root.ownerDocument.getElementById(id);
      const focusedPanel = target?.closest('[data-ks-dismiss-panel]');
      if (focusedPanel && focusedPanel !== panel) return;
      const expanded = target?.closest('button[aria-expanded="true"]');
      if (expanded && expanded !== trigger.current && !panel?.contains(expanded)) return;
      closeScenePanelOnEscape(event, () => { latest.current(); restoreScenePanelFocus(trigger.current); });
    };
    root.addEventListener('keydown', key, true);
    return () => root.removeEventListener('keydown', key, true);
  }, [runtime, open, id, trigger]);
}

export function useHud<T extends object>(store?: HudStore<T>): T {
  const runtime = useRuntime(), value = store ?? runtime.hud as unknown as HudStore<T>;
  return useSyncExternalStore(value.subscribe, value.getSnapshot, value.getSnapshot);
}
/** Returns keyboard focus to the scene root so Space, Enter and the play keys reach the scene, not the last button. */
function focusSceneRoot(from: Element | null): void { (from?.closest('.ks-root') as HTMLElement | null)?.focus({ preventScroll: true }); }
const HudVisibility = createContext<{ hidden: boolean; setHidden(value: boolean): void } | null>(null);
/**
 * The HUD layer owns one visibility switch: `HudHideButton` hides every control except the touch play controls
 * (joystick and touch buttons), and the layer then shows a single Show controls button in the toolbar's corner.
 */
export function HudLayer(p: HTMLAttributes<HTMLDivElement>): JSX.Element {
  const [hidden, setHidden] = useState(false), visibility = useMemo(() => ({ hidden, setHidden }), [hidden]);
  return <HudVisibility.Provider value={visibility}><div {...p} className={`ks-hud ${p.className ?? ''}`} data-ks-hidden={hidden ? '' : undefined}>
    {p.children}
    {hidden && <HudButton className="ks-hud-show" data-ks-preserve-path="" onClick={event => { setHidden(false); focusSceneRoot(event.currentTarget); }}>Show controls</HudButton>}
  </div></HudVisibility.Provider>;
}
/** Hides the HUD (see `HudLayer`). Renders nothing outside a HUD layer. */
export function HudHideButton(p: { label?: string }): JSX.Element | null {
  const visibility = useContext(HudVisibility);
  if (!visibility) return null;
  return <HudButton className="ks-hud-hide" aria-label="Hide controls" data-ks-preserve-path="" onClick={event => { focusSceneRoot(event.currentTarget); visibility.setHidden(true); }}>{p.label ?? 'Hide'}</HudButton>;
}
const HudMenus = createContext<{ open: string | null; setOpen(id: string | null): void } | null>(null);
/** The scene toolbar. Its menus share one open slot, so opening one closes the other. */
export function HudToolbar(p: HTMLAttributes<HTMLDivElement>): JSX.Element {
  const [open, setOpen] = useState<string | null>(null), menus = useMemo(() => ({ open, setOpen }), [open]);
  return <HudMenus.Provider value={menus}><div {...p} className={`ks-toolbar ${p.className ?? ''}`} /></HudMenus.Provider>;
}
/**
 * A group of toolbar controls behind one trigger. `collapse: 'always'` keeps the group folded at every width;
 * `'narrow'` shows the controls inline on a wide HUD and folds them when the HUD is narrow (kit stylesheet, by the
 * HUD's own width). The controls stay mounted: open, they take their own toolbar row; choosing one closes the
 * group. Panels (`.ks-panel`) a control opens from inside the group stay visible after it closes.
 */
export function HudMenu(p: { label: string; value?: string; collapse?: 'always' | 'narrow'; children?: ReactNode; className?: string;
  /** The group's controls do not interrupt a running camera path (`PathRig`). */ preservePath?: boolean }): JSX.Element {
  const shared = useContext(HudMenus), [local, setLocal] = useState<string | null>(null), id = `ks-menu-${useId()}`;
  const open = (shared ? shared.open : local) === id, setOpen = (value: boolean) => (shared ? shared.setOpen : setLocal)(value ? id : null);
  const trigger = useRef<HTMLButtonElement>(null);
  const key = (event: ReactKeyboardEvent) => { if (open) closeScenePanelOnEscape(event.nativeEvent, () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }); };
  return <div className={`ks-menu ${p.className ?? ''}`} data-collapse={p.collapse ?? 'always'} data-open={open ? '' : undefined} data-ks-preserve-path={p.preservePath ? '' : undefined} onKeyDown={key}>
    <HudButton ref={trigger} aria-expanded={open} aria-controls={id} aria-label={p.value ? `${p.label}: ${p.value}` : p.label} className="ks-menu-trigger" onClick={() => setOpen(!open)}>
      {p.value ?? p.label}<span className="ks-menu-caret" aria-hidden="true"/></HudButton>
    <i className="ks-menu-break" aria-hidden="true"/>
    <div id={id} className="ks-menu-items" role="group" aria-label={p.label} onClick={event => { if (open && (event.target as Element).closest('button')) setOpen(false); }}>{p.children}</div>
  </div>;
}
export function HudButton(p: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }): JSX.Element { return <button type="button" {...p} className={`ks-button ${p.className ?? ''}`} />; }
export function HudPanel(p: HTMLAttributes<HTMLElement>): JSX.Element { return <section {...p} className={`ks-panel ${p.className ?? ''}`} />; }
export interface HudSegmentOption { value: string; label: string; disabled?: boolean }
export function HudSegmented(p: { label: string; value: string; options: readonly HudSegmentOption[]; onChange(value: string): void; className?: string }): JSX.Element {
  const active = Math.max(0, p.options.findIndex(option => option.value === p.value && !option.disabled));
  return <div role="radiogroup" aria-label={p.label} className={`ks-segmented ${p.className ?? ''}`}>{p.options.map((option, index) => <HudButton
    key={option.value} role="radio" aria-checked={p.value === option.value} disabled={option.disabled} tabIndex={index === active ? 0 : -1}
    onClick={() => p.onChange(option.value)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const enabled = p.options.filter(item => !item.disabled), current = enabled.findIndex(item => item.value === option.value);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length;
      const value = enabled[next]; if (!value) return; p.onChange(value.value);
      const all = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button'); all?.[p.options.indexOf(value)]?.focus();
    }}>{option.label}</HudButton>)}</div>;
}
export function StatusLine(p: { children?: ReactNode; text?: string; className?: string }): JSX.Element { return <div className={`ks-panel ks-status ${p.className ?? ''}`} role="status" aria-live="polite" aria-atomic="true">{p.text ?? p.children}</div>; }
export function InteractPrompt(p: { label?: string; text?: string; available?: boolean; disabled?: boolean; onInteract?: () => void; keyboardHint?: boolean }): JSX.Element {
  const runtime = useRuntime(), input = runtime.input;
  useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const label = p.label ?? p.text ?? 'Interact';
  return <HudButton className="ks-interact" disabled={p.disabled ?? p.available === false} onClick={() => p.onInteract ? p.onInteract() : input.press('interact')}>
    {label}{(p.keyboardHint ?? input.state.lastPointer === 'keyboard') ? ' (E)' : ''}
  </HudButton>;
}
export function InteractButton(p: { label?: string; visible?: () => boolean }): JSX.Element {
  const buttons: readonly TouchButtonDef[] = [{ action: 'interact', label: p.label ?? 'Interact', slot: 'primary', visible: p.visible }];
  return <TouchButtons buttons={buttons} />;
}
export function ExitPlayButton(p: { label?: string; visible?: () => boolean }): JSX.Element {
  const buttons: readonly TouchButtonDef[] = [{ action: 'cancel', label: p.label ?? 'Leave play', slot: 'secondary', visible: p.visible }];
  return <TouchButtons buttons={buttons} className="ks-exit-play" />;
}
export function HelpOverlay(p: { children?: ReactNode; desktop?: ReactNode; touch?: ReactNode; open?: boolean; onOpenChange?(open: boolean): void; onClose?(): void; playing?: boolean; storageKey?: string; label?: string; id?: string }): JSX.Element {
  const runtime = useRuntime(), input = useInput(), generated = useId(), id = p.id ?? `ks-help-${generated}`;
  useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const [localOpen, setLocalOpen] = useState(false), dismissed = useRef(false), initialized = useRef(false), trigger = useRef<HTMLButtonElement>(null);
  const open = p.open ?? localOpen, playing = p.playing ?? runtime.playing;
  const key = p.storageKey ?? `kiln.scene.${runtime.definition.id}.help`;
  const change = (value: boolean) => {
    setLocalOpen(value); p.onOpenChange?.(value);
    if (!value) { dismissed.current = true; p.onClose?.(); restoreScenePanelFocus(trigger.current); try { runtime.rootRef.current?.ownerDocument.defaultView?.localStorage.setItem(key, 'dismissed'); } catch {} }
  };
  usePanelEscape(open, id, trigger, () => change(false));
  useEffect(() => {
    if (!initialized.current) { initialized.current = true; try { dismissed.current = runtime.rootRef.current?.ownerDocument.defaultView?.localStorage.getItem(key) === 'dismissed'; } catch {} }
    if (playing && !dismissed.current) change(true);
  }, [playing, key, runtime]);
  useSystem('controls-help', 110, () => { if (input.state.helpToggle) change(!open); });
  return <>
    <HudButton ref={trigger} className="ks-help-button" aria-expanded={open} aria-controls={id} onClick={() => change(!open)}>{p.label ?? 'Controls'}</HudButton>
    {open && <HudPanel id={id} className="ks-help" role="region" aria-label="Controls help" data-ks-dismiss-panel>
      <h2>Controls</h2><div>{p.children ?? (input.state.lastPointer === 'touch' ? p.touch : p.desktop)}</div>
      <HudButton onClick={() => change(false)}>Close controls</HudButton>
    </HudPanel>}
  </>;
}
export function FadeOverlay(): JSX.Element {
  const fade = useRuntime().fade, ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const update = () => { if (ref.current) ref.current.style.opacity = String(fade.getSnapshot()); }; update(); return fade.subscribe(update); }, [fade]);
  return <div ref={ref} className="ks-fade" aria-hidden="true" />;
}
export function useFade(): { to(alpha: number, ms: number): Promise<void> } { return useRuntime().fade; }
const KIT_NOTICES: readonly CreditEntry[] = [
  { name: 'three.js', licence: 'MIT', source: 'https://github.com/mrdoob/three.js' },
  { name: 'React and React DOM', licence: 'MIT', source: 'https://github.com/facebook/react' },
  { name: 'React Three Fiber', licence: 'MIT', source: 'https://github.com/pmndrs/react-three-fiber' },
  { name: 'three-mesh-bvh', licence: 'MIT', source: 'https://github.com/gkjohnson/three-mesh-bvh' },
];
function safeCreditUrl(source: string): string | undefined { try { const url = new URL(source); return /^(https?:)$/.test(url.protocol) ? source : undefined; } catch { return undefined; } }
export function CreditsPanel(p: { credits?: readonly CreditEntry[]; open?: boolean; onOpenChange?(open: boolean): void; label?: string; includeKit?: boolean }): JSX.Element {
  const runtime = useRuntime(), id = `ks-credits-${useId()}`, [localOpen, setLocalOpen] = useState(false), open = p.open ?? localOpen;
  const trigger = useRef<HTMLButtonElement>(null);
  const change = (value: boolean) => { setLocalOpen(value); p.onOpenChange?.(value); if (!value) restoreScenePanelFocus(trigger.current); };
  usePanelEscape(open, id, trigger, () => change(false));
  const credits = [...(p.credits ?? runtime.pack?.manifest.credits ?? []), ...(p.includeKit === false ? [] : KIT_NOTICES)];
  return <><HudButton ref={trigger} className="ks-credits-button" aria-expanded={open} aria-controls={id} onClick={() => change(!open)}>{p.label ?? 'Credits'}</HudButton>
    {open && <HudPanel id={id} className="ks-credits" role="region" aria-label="Credits and licences" data-ks-dismiss-panel><h2>Credits and licences</h2>
      <ul>{credits.map((entry, i) => <li key={`${entry.name}-${i}`}><strong>{entry.name}</strong> — {entry.licence}{entry.holder && <div>{entry.holder}</div>}{entry.note && <p>{entry.note}</p>}{entry.source && safeCreditUrl(entry.source) && <a href={safeCreditUrl(entry.source)} target="_blank" rel="noopener noreferrer">Source for {entry.name}</a>}</li>)}</ul>
      <HudButton onClick={() => change(false)}>Close credits</HudButton></HudPanel>}
  </>;
}
export interface DevPanelProps { enabled?: boolean; stats?: Record<string, unknown>; children?: ReactNode; views?: readonly { label: string; onClick(): void }[]; onCollisionDebug?(enabled: boolean): void }
export function DevPanel(p: DevPanelProps): JSX.Element | null {
  if (!import.meta.env.KILN_DEV) return null;
  return <DeveloperPanelContent {...p} />;
}
function DeveloperPanelContent(p: DevPanelProps): JSX.Element | null {
  const runtime = useRuntime(); useHud(); useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const elapsed = useRef(0), [collisionDebug, setCollisionDebug] = useState(false);
  useSystem('diagnostics-hud', 950, dt => {
    if (!(p.enabled ?? runtime.options.dev)) return;
    elapsed.current += dt; if (elapsed.current >= .1) { elapsed.current %= .1; runtime.hud.set({ diagnosticsFrame: runtime.clock.frame }); }
  });
  if (!(p.enabled ?? runtime.options.dev)) return null;
  const info = runtime.renderer?.info, recorder = runtime.data.get('recorder') as { summary?(): Record<string, number> } | undefined;
  const pipelines = (runtime.renderer as unknown as { _pipelines?: { pipelines?: { size: number } } } | null)?._pipelines?.pipelines?.size;
  const counts = runtime.testHooks.counts?.();
  const streamers = runtime.data.get('streamerDiagnostics') as Map<string, { stats(): Record<string, number>; lastError?: string }> | undefined;
  const streamerStats = streamers ? Array.from(streamers, ([id, entry]) => ({ id, ...entry.stats(), lastError: entry.lastError })) : [];
  const stats = { backend: runtime.backend?.backend, adapter: runtime.backend?.adapter, tier: runtime.quality?.tier, ...runtime.quality?.live, ...recorder?.summary?.(), drawCalls: info?.render.drawCalls, triangles: info?.render.triangles, geometries: info?.memory.geometries, textures: info?.memory.textures, pipelines, streamers: streamerStats, ...(typeof counts === 'object' && counts !== null ? counts : {}), ...p.stats };
  const change = (key: keyof LiveKnobs, value: number) => runtime.quality?.setLive({ [key]: value });
  const toggles: readonly [keyof LiveKnobs, string, readonly number[]][] = [['vegetationDensity', 'Vegetation density', [0, .25, .5, .75, 1]], ['instanceDensity', 'Instance density', [0, .25, .5, .75, 1]], ['lodBias', 'Detail distance', [.25, .5, .75, 1]], ['streamRadiusScale', 'Streaming radius', [.25, .5, .75, 1]], ['zoneHops', 'Visible neighboring zones', [0, 1, 2, 3]]];
  return <HudPanel className="ks-dev-panel" aria-label="Developer tools"><h2>Scene diagnostics</h2>
    <dl>{Object.entries(stats).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}</dd></div>)}</dl>
    {runtime.quality && toggles.map(([key, label, values]) => <label key={key}>{label} <select className="ks-select" value={runtime.quality!.live[key]} onChange={event => change(key, Number(event.target.value))}>
      {Array.from(new Set([...values, runtime.quality!.live[key]])).sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>)}
    {p.onCollisionDebug && <HudButton aria-pressed={collisionDebug} onClick={() => { const value = !collisionDebug; setCollisionDebug(value); p.onCollisionDebug!(value); }}>Collision geometry</HudButton>}
    {p.views?.map(view => <HudButton key={view.label} onClick={view.onClick}>{view.label}</HudButton>)}{p.children}</HudPanel>;
}
