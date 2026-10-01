// SPDX-License-Identifier: MIT
// The Foundry Floor's cameras (TASK-FF2 items 3 and 4). One mode drives the camera at a time:
//   orbit   the kit's OrbitRig and the layout's named views (the HUD's view control);
//   walk    the free walk (D-22) through the kit's play mode: keyboard, or the kit joystick on touch, at human eye
//           height, colliding with tools and walls (walk.ts); walking starts where the view is;
//   tour    the guided tour (tour.ts) along the named views, fading through cuts; any canvas input, a movement key or
//           Escape hands the camera back to the orbit where it is;
//   follow  follow-a-wafer: the kit's FollowRig on the chosen lot's FOUP as the twin moves it (drag orbits it); where the
//           lot arrives (a port, a shelf, a stocker, a furnace) the camera cuts to the first clear side (follow.ts).
// A tap or click on a tool or stocker opens its panel (picking.ts; the words in panels.ts, derived from state). Root and
// canvas listeners only, as the kit's rigs use; no document or window listeners.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Object3D, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { FollowRig, OrbitRig, SystemOrder, useFade, useInput, usePlayMode, useReducedMotion, useRegisterTestHooks, useSceneClock, useSceneRootRef, useSystem } from '@kiln-scenes/scene-kit';
import type { Vec3 } from '@kiln-scenes/scene-kit';
import type { FabData, LayoutData } from '../sim/data';
import type { LotView } from '../sim/fab';
import { VIEW_NAMES } from '../sim/data';
import type { AssetMap } from './assets/asset-map';
import { FOLLOW, followOffset, followPlaces, preferredYaw } from './follow';
import { followInfo, lotChoices, panelContext, panelFor, tourStopLines } from './panels';
import { obstructionDistance, pickBoxes, pickRay, roomLimits } from './picking';
import { useFoundrySession } from './session';
import type { CameraControl, CameraMode, FoundryHudState, TourHud, ViewName } from './session';
import { buildTour, holdTime, newTourFrame, sampleTour, tourFov } from './tour';
import type { TourFrame, TourPose } from './tour';
import { createWalkWorld, stepWalker, walkerEye, walkPlace, walkStart } from './walk';
import type { Walker } from './walk';
import type { GlbWorld } from './world/glb-world';

const TEST = !!(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV);
export const MAX_POLAR = 1.75;
export type ViewPose = { position: [number, number, number]; target: [number, number, number]; fov: number; maxPolar: number };
/** The named views of the layout (cameras) as orbit poses. */
export function viewsFor(layout: LayoutData): Record<ViewName, ViewPose> {
  const cams = layout.cameras;
  return Object.fromEntries(VIEW_NAMES.map(name => [name, { position: cams[name].position, target: cams[name].target, fov: cams[name].fov, maxPolar: MAX_POLAR }])) as Record<ViewName, ViewPose>;
}
const TARGET_BOUNDS = new Box3(new Vector3(-40, -8, -30), new Vector3(40, 12, 30));
const HUD_INTERVAL_MS = 250;
/** A tap: the pointer moves at most this many pixels and lifts within this many milliseconds. */
const TAP_PX = 6, TAP_MS = 500;
const FOLLOW_FOV = 50;
const STOP_KEYS = /^(Key[WASD]|Arrow(Up|Down|Left|Right)|Escape)$/;

export function FoundryCameras({ world, data, map }: { world: GlbWorld | null; data: FabData; map: AssetMap }) {
  const session = useFoundrySession(), { playing, setPlaying } = usePlayMode(), fade = useFade(), reduced = useReducedMotion();
  const camera = useThree(state => state.camera) as PerspectiveCamera, size = useThree(state => state.size);
  const clock = useSceneClock(), input = useInput(), root = useSceneRootRef();
  const views = useMemo(() => viewsFor(data.layout), [data]);
  const walkWorld = useMemo(() => createWalkWorld(data, map), [data, map]);
  const tour = useMemo(() => buildTour(data.layout, { reduced }), [data, reduced]);
  const boxes = useMemo(() => pickBoxes(data.layout), [data]), bodies = useMemo(() => pickBoxes(data.layout, { ports: false }), [data]);
  const room = useMemo(() => roomLimits(data.layout, 0.3), [data]), places = useMemo(() => followPlaces(data.layout), [data]);
  const ctx = useMemo(() => (world && session.fab ? panelContext(session.fab.sim, data) : null), [world, session, data]);
  const [mode, setModeState] = useState<CameraMode>('orbit');
  const modeRef = useRef<CameraMode>('orbit'), walker = useRef<Walker | null>(null), pendingWalker = useRef<Walker | null>(null);
  const tourRef = useRef({ t: 0, start: null as TourPose | null, frame: newTourFrame() as TourFrame, lastFade: 0, lastStop: -1, lastPhase: '' });
  const followRef = useRef({ lot: -1, offset: [0, FOLLOW.upM, FOLLOW.outM] as Vec3, key: '' });
  // Two subject objects: switching between them makes the FollowRig re-read the offset (a cut to a new side).
  const subjects = useMemo(() => [new Object3D(), new Object3D()] as const, []);
  const subject = useMemo(() => ({ current: subjects[0] as Object3D }), [subjects]);
  const panelId = useRef<string | null>(null), panelAt = useRef(-Infinity), lastPlace = useRef('');
  const scratch = useMemo(() => ({ v: new Vector3(), eye: [0, 0, 0], look: [0, 0, 0], pos: [0, 0, 0] }), []);
  const latest = useRef({ playing, setPlaying, ctx, world });
  useLayoutEffect(() => { latest.current = { playing, setPlaying, ctx, world }; });

  const control = useMemo(() => {
    const setMode = (next: CameraMode) => {
      const prev = modeRef.current;
      if (prev === next) return;
      const patch: Partial<FoundryHudState> = { camera: next };
      if (prev === 'tour') { void fade.to(0, 0); tourRef.current.lastFade = 0; patch.tour = null; }
      if (prev === 'follow') { followRef.current.lot = -1; patch.follow = null; }
      // The status line (announced politely) belongs to the mode: the walker's place, the tour stop, the followed lot.
      if (prev !== 'orbit') patch.status = '';
      if (prev === 'walk') lastPlace.current = '';
      modeRef.current = next; setModeState(next);
      session.hud.set(patch);
    };
    const handBack = (position: Vec3, target: Vec3, fov: number) => {
      const t = scratch.v.fromArray(target).clamp(TARGET_BOUNDS.min, TARGET_BOUNDS.max);
      session.orbit.current?.setView({ position, target: [t.x, t.y, t.z], fov, maxPolar: MAX_POLAR });
    };
    const handBackFromCamera = () => {
      const p = camera.position, d = camera.getWorldDirection(scratch.v);
      handBack([p.x, p.y, p.z], [p.x + d.x * 4, p.y + d.y * 4, p.z + d.z * 4], camera.fov);
    };
    /** Ends a walk, tour or follow without a hand-back (a named view follows). */
    const leave = () => {
      const was = modeRef.current;
      setMode('orbit');
      if (was === 'walk' || latest.current.playing) latest.current.setPlaying(false);
    };
    /** The lot's drawn FOUP (its middle), else the front of what holds it; null while neither is known. */
    const aimOf = (lot: number, v: LotView): Vec3 | null => {
      const glb = latest.current.world;
      if (glb?.foupOf(lot, scratch.pos)) return [scratch.pos[0]!, scratch.pos[1]! + FOLLOW.foupMidM, scratch.pos[2]!];
      return places.front.get(v.at) ?? null;
    };
    const frame = (aim: Vec3, v: LotView) => {
      const p = camera.position;
      followRef.current.offset = followOffset(bodies, room, data.layout, aim, preferredYaw(places, v, aim, [p.x, p.y, p.z]));
    };
    const updateSubject = () => {
      const r = followRef.current, v = r.lot >= 0 ? session.fab?.sim.lotView(r.lot) : null;
      if (!v) return;
      const aim = aimOf(r.lot, v);
      if (!aim) return;
      const key = `${v.loc}:${v.at}`;
      if (key !== r.key) {
        const arrived = r.key !== '' && v.loc !== 'vehicle';
        r.key = key;
        // Arriving at a port, a shelf, a stocker or a furnace: cut to its first clear side.
        if (arrived) { frame(aim, v); subject.current = subject.current === subjects[0] ? subjects[1] : subjects[0]; }
      }
      subject.current.position.set(aim[0], aim[1], aim[2]);
      subject.current.updateMatrixWorld();
    };
    const api: CameraControl & {
      setMode: typeof setMode; handBack: typeof handBack; handBackFromCamera: typeof handBackFromCamera; leave: typeof leave; updateSubject: typeof updateSubject;
    } = {
      get mode() { return modeRef.current; },
      setMode, handBack, handBackFromCamera, leave, updateSubject,
      startTour(atSeconds = 0) {
        const s = tourRef.current, p = camera.position, d = camera.getWorldDirection(scratch.v);
        s.t = Math.max(0, atSeconds); s.lastStop = -1; s.lastPhase = '';
        s.start = { position: [p.x, p.y, p.z], target: [p.x + d.x * 4, p.y + d.y * 4, p.z + d.z * 4], fov: camera.fov };
        panelId.current = null;
        session.hud.set({ panel: null, picker: null });
        setMode('tour');
        if (latest.current.playing) latest.current.setPlaying(false);
      },
      stopTour() { if (modeRef.current !== 'tour') return; setMode('orbit'); handBackFromCamera(); },
      follow(lot) {
        const c = latest.current.ctx, v = c?.sim.lotView(lot), aim = v ? aimOf(lot, v) : null;
        if (!c || !v || !aim) return;
        const r = followRef.current;
        r.lot = lot; r.key = '';
        frame(aim, v);
        updateSubject();
        panelId.current = null;
        setMode('follow');
        session.hud.set({ picker: null, panel: null, follow: followInfo(c, lot), status: `Following lot ${lot}` });
        if (latest.current.playing) latest.current.setPlaying(false);
      },
      unfollow() { if (modeRef.current !== 'follow') return; setMode('orbit'); handBackFromCamera(); },
      openPicker() { const c = latest.current.ctx; if (c) session.hud.set({ picker: lotChoices(c), panel: null }); panelId.current = null; },
      closePicker() { session.hud.set({ picker: null }); },
      openPanel(id) {
        const c = latest.current.ctx, panel = c ? panelFor(c, id) : null;
        if (!panel) return false;
        panelId.current = id;
        session.hud.set({ panel, picker: null });
        return true;
      },
      closePanel() { panelId.current = null; session.hud.set({ panel: null }); },
    };
    return api;
  }, [session, camera, fade, scratch, subject, subjects, data, places, bodies, room]);
  useEffect(() => { session.camera = control; return () => { if (session.camera === control) session.camera = null; }; }, [session, control]);
  useEffect(() => () => { void fade.to(0, 0); }, [fade]);

  // The walk is the kit's play mode: entering it places the walker where the view is; leaving hands back to the orbit.
  useLayoutEffect(() => {
    if (playing && modeRef.current !== 'walk') {
      const d = camera.getWorldDirection(scratch.v);
      walker.current = pendingWalker.current ?? walkStart(walkWorld, camera.position.toArray(), [d.x, d.y, d.z], camera.fov);
      pendingWalker.current = null;
      control.setMode('walk');
    } else if (!playing && modeRef.current === 'walk') {
      control.setMode('orbit');
      if (session.requests.view === null) control.handBackFromCamera();
    }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // A tour stops at canvas input, a movement key or Escape (the orbit takes over where it is); Escape ends following.
  // A tap or click (little movement, a short press) on the canvas opens the panel of the tool or stocker under it.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let down: { id: number; x: number; y: number; t: number } | null = null;
    const onCanvas = (e: Event) => (e.target as HTMLElement | null)?.tagName === 'CANVAS';
    const interrupt = (e: Event) => {
      const m = modeRef.current;
      if (!(e instanceof KeyboardEvent)) { if (m === 'tour' && onCanvas(e)) control.stopTour(); return; }
      const target = e.target as HTMLElement | null;
      if ((target !== element && target?.tagName !== 'CANVAS') || !STOP_KEYS.test(e.code)) return;
      if (m === 'tour') control.stopTour();
      else if (m === 'follow' && e.code === 'Escape') control.unfollow();
      else return;
      // Like the kit's play mode, the Escape that ends the tour or following is the scene's, not the page's.
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); }
    };
    const pointerDown = (e: PointerEvent) => {
      interrupt(e);
      down = onCanvas(e) && e.isPrimary ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
    };
    const pointerUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId || !onCanvas(e) || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX || performance.now() - d.t > TAP_MS) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1, ny = 1 - ((e.clientY - rect.top) / rect.height) * 2;
      const dir = scratch.v.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
      const hit = pickRay(boxes, camera.position.toArray(), [dir.x, dir.y, dir.z], 200);
      if (hit) control.openPanel(hit.box.id); else control.closePanel();
    };
    element.addEventListener('pointerdown', pointerDown);
    element.addEventListener('pointerup', pointerUp);
    element.addEventListener('wheel', interrupt, { passive: true });
    element.addEventListener('keydown', interrupt);
    return () => {
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('pointerup', pointerUp);
      element.removeEventListener('wheel', interrupt);
      element.removeEventListener('keydown', interrupt);
    };
  }, [root, control, camera, boxes, scratch]);

  // Named views from the HUD (and the first view): any other mode ends first.
  useSystem('foundry-floor-views', SystemOrder.path - 10, () => {
    const rig = session.orbit.current, req = session.requests;
    if (!rig || (req.view === null && session.viewReady)) return;
    const name = req.view ?? session.hud.getSnapshot().view, v = views[name];
    req.view = null;
    if (modeRef.current !== 'orbit' || latest.current.playing) control.leave();
    rig.setView({ ...v, fov: tourFov(v.fov, camera.aspect, tour.data.minHorizontalFovDeg) });
    session.viewReady = true;
  });

  useSystem('foundry-floor-tour', SystemOrder.path, () => {
    if (modeRef.current !== 'tour') return;
    const s = tourRef.current, f = sampleTour(tour, (s.t += clock.delta), s.frame, s.start ?? undefined);
    const fov = tourFov(f.fov, camera.aspect, tour.data.minHorizontalFovDeg);
    camera.position.fromArray(f.position); camera.up.set(0, 1, 0); camera.lookAt(f.target[0], f.target[1], f.target[2]);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    if (f.fade !== s.lastFade) { s.lastFade = f.fade; void fade.to(f.fade, 0); }
    if (f.phase === 'done') {
      const last = tour.stops[tour.stops.length - 1]!;
      control.setMode('orbit');
      control.handBack(last.position, last.target, fov);
      return;
    }
    if (f.stop !== s.lastStop || f.phase !== s.lastPhase) {
      if (f.phase === 'hold') session.hud.set({ status: `Tour stop ${f.stop + 1} of ${tour.stops.length}: ${tour.stops[f.stop]!.label}` });
      s.lastStop = f.stop; s.lastPhase = f.phase; panelAt.current = -Infinity;
    }
  });

  useSystem('foundry-floor-walk', SystemOrder.camera, dt => {
    if (modeRef.current !== 'walk') return;
    const w = walker.current;
    if (!w) return;
    if (input.enabled) stepWalker(walkWorld, w, input.state, Math.min(dt, 0.1));
    walkerEye(walkWorld, w, scratch.eye, scratch.look);
    camera.position.fromArray(scratch.eye); camera.up.set(0, 1, 0); camera.lookAt(scratch.look[0]!, scratch.look[1]!, scratch.look[2]!);
    if (camera.fov !== w.fov) { camera.fov = w.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    const place = walkPlace(walkWorld, data.layout, w.x, w.z);
    if (place !== lastPlace.current) { lastPlace.current = place; session.hud.set({ status: place }); }
  });

  // After the twin and the world have moved (SystemOrder.sim): the followed FOUP, then the HUD's derived lines.
  useSystem('foundry-floor-follow', SystemOrder.sim + 20, () => { if (modeRef.current === 'follow') control.updateSubject(); });
  useSystem('foundry-floor-panels', SystemOrder.sim + 30, () => {
    const now = performance.now(), c = latest.current.ctx;
    if (!c || now - panelAt.current < HUD_INTERVAL_MS) return;
    panelAt.current = now;
    const patch: Partial<FoundryHudState> = {};
    if (panelId.current) patch.panel = panelFor(c, panelId.current);
    const m = modeRef.current;
    if (m === 'tour') {
      const f = tourRef.current.frame, stop = tour.stops[f.stop]!;
      patch.tour = { stop: f.stop, stops: tour.stops.length, label: stop.label, phase: f.phase, lines: tourStopLines(c, stop.feature) } satisfies TourHud;
    } else if (m === 'follow') {
      const lot = followRef.current.lot, info = followInfo(c, lot);
      if (info.done) {
        control.setMode('orbit');
        control.handBackFromCamera();
        patch.status = `Lot ${lot} has shipped and left the fab`;
      } else patch.follow = info;
    }
    if (Object.keys(patch).length) session.hud.set(patch);
  });

  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!TEST) return {};
    return {
      ffCamera: () => {
        const w = walker.current, f = tourRef.current.frame, m = modeRef.current;
        return {
          mode: m, position: camera.position.toArray(), fov: camera.fov,
          walker: m === 'walk' && w ? { x: w.x, z: w.z, yawDeg: (w.yaw * 180) / Math.PI, pitchDeg: (w.pitch * 180) / Math.PI, place: lastPlace.current } : null,
          tour: m === 'tour' ? { t: tourRef.current.t, total: tour.total, stop: tour.stops[f.stop]?.name, phase: f.phase, fade: f.fade } : null,
          follow: m === 'follow' ? { lot: followRef.current.lot, place: followRef.current.key, subject: subject.current.position.toArray(), offset: followRef.current.offset } : null,
        };
      },
      ffWalk: (on = true) => { latest.current.setPlaying(!!on); return !!on; },
      /** Walks to (x, z) facing yawDeg (the layout's yaw: 90 faces north) and pitchDeg, starting the walk if needed. */
      ffWalkTo: (x: number, z: number, yawDeg = 90, pitchDeg = 0) => {
        const spot = walkWorld.nearestFree(x, z, 4);
        if (!spot) throw new Error(`No free walking spot near ${x}, ${z}`);
        const w: Walker = { x: spot[0], z: spot[1], yaw: (yawDeg * Math.PI) / 180, pitch: (pitchDeg * Math.PI) / 180, fov: walker.current?.fov ?? 60 };
        if (modeRef.current === 'walk') walker.current = w;
        else { pendingWalker.current = w; latest.current.setPlaying(true); }
        return spot;
      },
      /** Starts the tour at a stop's hold (a view name) or at a time in seconds. */
      ffTour: (at: string | number = 0) => {
        const t = typeof at === 'string' ? holdTime(tour, tour.stops.findIndex(s => s.name === at)) + 0.5 : Number(at);
        control.startTour(t);
        return { t, total: tour.total };
      },
      ffTourStop: () => { control.stopTour(); return modeRef.current; },
      ffPanel: (id: string) => (control.openPanel(id) ? session.hud.getSnapshot().panel : null),
      ffPicker: () => { control.openPicker(); return session.hud.getSnapshot().picker; },
      ffFollow: (lot?: number) => {
        const c = latest.current.ctx, id = lot ?? (c ? lotChoices(c, 1)[0]?.id : undefined);
        if (id === undefined) return null;
        control.follow(id);
        return modeRef.current === 'follow' ? id : null;
      },
      ffUnfollow: () => { control.unfollow(); return modeRef.current; },
      /** The page (client) coordinates of a world point in this frame's camera, or null behind it or off the canvas. */
      ffProject: (x: number, y: number, z: number) => {
        const canvas = root.current?.querySelector('canvas'), p = new Vector3(x, y, z).project(camera);
        if (!canvas || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
        const r = canvas.getBoundingClientRect();
        return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
      },
      /** Every lot's view (for choosing a lot to follow in captures). */
      ffLots: () => {
        const sim = session.fab?.sim;
        return sim ? sim.lots().map(l => sim.lotView(l.id)).filter(v => v !== null) : [];
      },
    };
  }, [camera, control, session, subject, tour, walkWorld, root]);
  useRegisterTestHooks(hooks);

  const offset = useMemo(() => () => followRef.current.offset, []);
  const obstruction = useMemo(() => ({
    ray: (from: Vector3, to: Vector3) => obstructionDistance(bodies, room, [from.x, from.y, from.z], [to.x, to.y, to.z]),
    pad: 0.3, minDistance: 1.2, hideSubjectBelow: 0, onSubjectVisible: () => {},
  }), [bodies, room]);
  return <>
    <OrbitRig rigRef={session.orbit} active={mode === 'orbit' && !playing} target={views.landing.target} minDistance={1.5} maxDistance={140} maxPolar={MAX_POLAR}
      pan floor={() => 0} clearance={0.4} bounds={TARGET_BOUNDS}/>
    <FollowRig active={mode === 'follow'} subject={subject} targetHeight={0} offset={offset} maxPolar={2.4} minDistance={1.5} maxDistance={16} obstruction={obstruction}
      fov={tourFov(FOLLOW_FOV, size.width / Math.max(1, size.height), tour.data.minHorizontalFovDeg)}/>
  </>;
}
