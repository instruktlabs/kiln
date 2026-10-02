// SPDX-License-Identifier: MIT
// The campus world inside the canvas (FF-C1 item 6): one place at a time. Outside, the exterior (its own chunk, loaded
// when the exterior starts); inside, FF2's world unchanged (the running twin, its cameras, walk, tour, panels and
// follow-a-wafer) under a fresh FF2 session. Enter and Exit fade down, swap the places and fade up once the new place
// has drawn its first view. Inside, the twin renders in its own frame (a floating origin at the campus locator, the
// south-west head's level 1), so FF2's code and coordinates run as they are; the exterior is unmounted, not drawn.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SystemOrder, useFade, useLoadedPack, usePlayMode, useRegisterTestHooks, useSystem } from '@kiln-scenes/scene-kit';
import { useThree } from '@react-three/fiber';
import { useCampusSession } from './session';
import type { CampusPlace } from './session';
import { foundryProbeAsset, foundryProbeSystems } from './probe-systems';

const TEST = !!(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV);
const FADE_MS = 350;
const CampusExterior = lazy(() => import('./exterior').then(m => ({ default: m.CampusExterior })));
const InteriorPlace = lazy(() => import('./interior').then(m => ({ default: m.InteriorPlace })));

/** The place the campus shows now (re-renders only when it changes). */
export function useCampusPlace(): CampusPlace {
  const campus = useCampusSession();
  return useSyncExternalStore(campus.hud.subscribe, () => campus.hud.getSnapshot().place, () => campus.hud.getSnapshot().place);
}

export function CampusWorld() {
  const campus = useCampusSession(), fade = useFade(), place = useCampusPlace(), { setPlaying } = usePlayMode();
  const pack=useLoadedPack(),scene=useThree(state=>state.scene);
  const busy = useRef(false), play = useRef(setPlaying);
  const alive = useRef(true), [failure, setFailure] = useState<unknown>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  play.current = setPlaying;

  const swap = useMemo(() => async (to: CampusPlace) => {
    if (busy.current) return;
    busy.current = true;
    try {
      campus.hud.set({ moving: true, canEnter: false, status: to==='interior' ? 'South-west entrance → level 1 cutaway' : 'Returning to campus' });
      await fade.to(1, FADE_MS);
      if (!alive.current) return;
      // Play mode is the drive outside and FF2's walk inside: each place starts without it (the car is parked first).
      play.current(false);
      if (to === 'interior') {
        const { createFoundrySession } = await import('./interior');
        if (!alive.current) return;
        campus.interior = createFoundrySession();
        campus.hud.set({ place: 'interior' });
      } else {
        // Exit returns to the canopy: the orbit at the arrival view, or the car at rest in the drop-off zone.
        if (campus.cameFrom === 'orbit') campus.hud.set({ view: 'canopy' });
        else campus.resumeDrive = !!campus.car;
        campus.hud.set({ place: 'exterior' });
      }
    } catch (error) { if (alive.current) setFailure(error); }
    finally { busy.current = false; }
  }, [campus, fade]);

  useSystem('campus-places', SystemOrder.input + 5, () => {
    const to = campus.requests.place;
    if (!to) return;
    campus.requests.place = null;
    if (to !== campus.hud.getSnapshot().place) void swap(to);
  });

  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!TEST) return {};
    return {
      campusPlace: () => ({ place: campus.hud.getSnapshot().place, moving: campus.hud.getSnapshot().moving, interior: !!campus.interior, interiorReady: !!campus.interior?.viewReady }),
      campusResources:()=>({models:[...pack.models.keys()],exterior:!!scene.getObjectByName('campus-exterior'),context:!!scene.getObjectByName('campus-interior-context')}),
      campusEnter: () => { campus.enter(); return true; },
      campusExit: () => { campus.exit(); return true; },
      /** Count-probe systems and fab entity names (scene-kit testing/probe.ts), found by name for either place. */
      probeSystems: () => foundryProbeSystems(scene),
      probeAsset: foundryProbeAsset,
    };
  }, [campus,pack,scene]);
  useRegisterTestHooks(hooks);
  if (failure) throw failure;

  const interior = place === 'interior' ? campus.interior : null;
  return <>
    {place === 'exterior' && <Suspense fallback={null}><CampusExterior/></Suspense>}
    {interior && <Suspense fallback={null}><InteriorPlace session={interior}/></Suspense>}
  </>;
}
