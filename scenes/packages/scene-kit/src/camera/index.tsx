import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { JSX, Ref, RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { SystemOrder, useSystem } from '../lifecycle';
import { useRuntime } from '../internal/runtime';
import { createChaseDrag, createPathController, stepChase, stepChaseZoom } from './core';
import type { ChaseOptions, ChaseState, FollowOptions, OrbitOptions, PathDef, PathHandle, Pose, RigHandle, Vec3 } from './core';
import { createOrbitController, type ManagedOrbit } from './orbit';
import { createFollowController, type ManagedFollow } from './follow';
export * from './core';
export { createScopedControlsElement } from './scoped-controls';
export * from './orbit';

function setRef<T>(ref: Ref<T> | undefined, value: T | null): void { if (typeof ref === 'function') ref(value); else if (ref) ref.current = value; }
function newPose(): Pose { return { position: [0, 0, 0], target: [0, 0, 0], roll: 0 }; }
function applyPose(camera: PerspectiveCamera, pose: Pose): void {
  camera.position.fromArray(pose.position); camera.up.set(0, 1, 0); camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  if (pose.roll) camera.rotateZ(pose.roll);
  if (pose.fov !== undefined && camera.fov !== pose.fov) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
}
export function OrbitRig(p: OrbitOptions): JSX.Element {
  const runtime = useRuntime(), state = useThree(), current = useRef(p), managed = useRef<ManagedOrbit | null>(null);
  useLayoutEffect(() => { current.current = p; });
  useEffect(() => {
    const root = runtime.rootRef.current; if (!root) return;
    const orbit = createOrbitController(state.camera as PerspectiveCamera, state.gl.domElement, root, () => current.current);
    managed.current = orbit; setRef(p.rigRef, orbit.handle);
    return () => { setRef(p.rigRef, null); orbit.dispose(); managed.current = null; };
  }, [runtime, state.camera, state.gl, p.rigRef]);
  useSystem('orbit-camera', SystemOrder.camera, () => {
    const orbit = managed.current; if (!orbit) return; orbit.controls.enabled = current.current.active !== false;
    if (!orbit.controls.enabled) return;
    orbit.controls.update(); orbit.sync();
  });
  return <></>;
}
export function FollowRig(p: FollowOptions & { active: boolean; rigRef?: Ref<RigHandle> }): JSX.Element {
  const runtime = useRuntime(), state = useThree(), current = useRef(p), managed = useRef<ManagedFollow | null>(null);
  useLayoutEffect(() => { current.current = p; });
  useEffect(() => {
    const root = runtime.rootRef.current; if (!root) return;
    const follow = createFollowController(state.camera as PerspectiveCamera, state.gl.domElement, root, () => current.current);
    managed.current = follow; setRef(p.rigRef, follow.handle);
    return () => { setRef(p.rigRef, null); follow.dispose(); managed.current = null; };
  }, [runtime, state.camera, state.gl, p.rigRef]);
  useSystem('follow-camera', SystemOrder.camera, () => managed.current?.update());
  return <></>;
}
export function VehicleRig(p: ChaseOptions): JSX.Element {
  const runtime = useRuntime(), state = useThree(), current = useRef(p);
  const core = useRef<ChaseState>({ position: [0, 0, 0], smoothedYaw: 0, appliedDistance: 0, orbitAngle: 0, orbitHoldS: 0, subjectVisible: true });
  const work = useMemo(() => ({ position: new Vector3(), subject: { position: [0, 0, 0] as Vec3, yaw: 0, speed: 0 }, pose: newPose(), zoomed: {} as ChaseOptions }), []);
  const initialized = useRef(false), zoomScale = useRef(1); useLayoutEffect(() => { current.current = p; });
  useEffect(() => {
    const root = runtime.rootRef.current, canvas = state.gl.domElement; if (!root) return;
    // GG-010: one pointer drags the orbit offset; a second pointer (a pinch) ends the drag until all pointers lift.
    const drag = createChaseDrag();
    const release = (id: number) => { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); };
    const down = (e: PointerEvent) => {
      const previous = drag.pointer, started = drag.down(e.pointerId, e.clientX);
      if (previous !== null && drag.pointer === null) release(previous);
      if (started && current.current.active && current.current.orbitOffset) canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const dx = drag.move(e.pointerId, e.clientX); if (!dx || !current.current.active || !current.current.orbitOffset) return;
      core.current.orbitAngle -= dx * .005; core.current.orbitHoldS = 3;
    };
    const up = (e: PointerEvent) => { const held = drag.pointer === e.pointerId; drag.up(e.pointerId); if (held) release(e.pointerId); };
    canvas.addEventListener('pointerdown', down); root.addEventListener('pointermove', move); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
    return () => { canvas.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', up); if (drag.pointer !== null) release(drag.pointer); };
  }, [runtime, state.gl]);
  useSystem('vehicle-camera', SystemOrder.camera, dt => {
    const options = current.current, subject = options.subject.current; if (!options.active || !subject) { initialized.current = false; if (!core.current.subjectVisible) { core.current.subjectVisible = true; options.obstruction?.onSubjectVisible?.(true); } return; }
    subject.getWorldPosition(work.position).toArray(work.subject.position); work.subject.yaw = options.yaw(); work.subject.speed = options.speed?.() ?? 0;
    if (!initialized.current) {
      zoomScale.current = 1;
      const s = core.current; s.smoothedYaw = work.subject.yaw; s.position[0] = work.position.x - Math.sin(s.smoothedYaw) * options.distance; s.position[1] = work.position.y + options.height; s.position[2] = work.position.z - Math.cos(s.smoothedYaw) * options.distance; s.appliedDistance = Math.hypot(options.distance + options.lookAhead, options.height - options.targetHeight); initialized.current = true;
    }
    // GG-010: the rig owns pinch and wheel zoom when a range is given (the input's zoom is read before endFrame clears it).
    let chase: ChaseOptions = options;
    if (options.zoom) {
      zoomScale.current = stepChaseZoom(zoomScale.current, runtime.input.state.zoom, options.zoom);
      chase = Object.assign(work.zoomed, options); chase.distance = options.distance * zoomScale.current; chase.height = options.height * zoomScale.current;
    }
    // Reduced motion disables spring easing while preserving user-driven camera input.
    stepChase(core.current, chase, work.subject, dt, work.pose, runtime.motion.reduced);
    applyPose(state.camera as PerspectiveCamera, work.pose);
  });
  return <></>;
}
export function PathRig(p: { paths: readonly PathDef[]; active: boolean; interruptible?: boolean; time?: () => number; onInterrupt?: (pose: Pose) => void; onDone?: (name: string) => void; pathRef?: Ref<PathHandle> }): JSX.Element {
  const runtime = useRuntime(), state = useThree(), latest = useRef(p); useLayoutEffect(() => { latest.current = p; });
  const controller = useMemo(() => createPathController(p.paths, { time: () => latest.current.time?.() ?? runtime.clock.time, reduced: () => runtime.motion.reduced, onInterrupt: pose => latest.current.onInterrupt?.(pose), onDone: name => latest.current.onDone?.(name) }), [p.paths, runtime]);
  useEffect(() => { setRef(p.pathRef, controller); return () => { controller.stop(); setRef(p.pathRef, null); }; }, [controller, p.pathRef]);
  useEffect(() => {
    const root = runtime.rootRef.current; if (!root) return;
    let alive = true;
    const interrupt = (e: Event) => {
      if (!latest.current.active || latest.current.interruptible === false) return;
      if ((e.target as HTMLElement | null)?.closest('[data-ks-preserve-path]')) return;
      if (e instanceof KeyboardEvent) {
        const target = e.target as HTMLElement | null;
        if (target !== root && target?.tagName !== 'CANVAS') return;
        if (e.code === 'Tab') return;
        if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); }
        if (!e.defaultPrevented && !/^(Key[WASDEH]|Arrow(Up|Down|Left|Right)|Escape)$/.test(e.code)) {
          // InputProvider may have attached its root listener after this rig.
          // Wait until dispatch completes to recognize scene-declared handled keys.
          queueMicrotask(() => { if (alive && e.defaultPrevented && latest.current.active && latest.current.interruptible !== false) controller.interrupt(); }); return;
        }
      }
      controller.interrupt();
    };
    root.addEventListener('pointerdown', interrupt); root.addEventListener('wheel', interrupt, { passive: true }); root.addEventListener('keydown', interrupt);
    return () => { alive = false; root.removeEventListener('pointerdown', interrupt); root.removeEventListener('wheel', interrupt); root.removeEventListener('keydown', interrupt); };
  }, [controller, runtime]);
  useSystem('path-camera', SystemOrder.path, () => { if (latest.current.active && !controller.interrupted) { controller.update(); applyPose(state.camera as PerspectiveCamera, controller.pose); } });
  return <></>;
}
export function CameraButtons(p: { rig: RefObject<RigHandle | null>; labels?: Partial<Record<'zoomIn' | 'zoomOut' | 'left' | 'right' | 'forward' | 'back' | 'reset', string>> }): JSX.Element {
  const buttons = [
    ['zoomIn', 'Zoom in', '+', () => p.rig.current?.zoomBy(.8)], ['zoomOut', 'Zoom out', '−', () => p.rig.current?.zoomBy(1.25)],
    ['left', 'Pan left', '←', () => p.rig.current?.panBy(-1, 0)], ['right', 'Pan right', '→', () => p.rig.current?.panBy(1, 0)],
    ['forward', 'Pan up', '↑', () => p.rig.current?.panBy(0, 1)], ['back', 'Pan down', '↓', () => p.rig.current?.panBy(0, -1)],
    ['reset', 'Reset view', 'Reset', () => p.rig.current?.reset()],
  ] as const;
  return <div role="group" aria-label="Camera controls" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', pointerEvents: 'auto' }}>
    {buttons.map(([id, label, caption, action]) => <button type="button" className="ks-button" key={id} aria-label={p.labels?.[id] ?? label} title={p.labels?.[id] ?? label} onClick={action} style={{ minWidth: 48, minHeight: 48, touchAction: 'none' }}>{caption}</button>)}
  </div>;
}
