import { DevPanel, SceneRoot, useBuilt } from '@kiln-scenes/scene-kit';
import { useEffect, useMemo, useState } from 'react';
import type { SceneProgress, SceneProps } from '@kiln-scenes/scene-kit';
import { farmDefinition } from './definition';
import { createFarmSession, FarmContext } from './state';
import { FarmHud } from './ui/FarmHud';
import { FARM_STRINGS } from './ui/strings';
import { FarmLighting } from './world/lighting';
import { FarmWorldContent } from './World';
import { prepareFarmData } from './world/prepare';
import type { SceneDefinition } from '@kiln-scenes/scene-kit';

type LookModule = typeof import('./look/FarmLook');
/** Dev builds only (M3 look exploration): the module is loaded on demand, so public and test outputs never contain it. */
function useLookModule(): LookModule | null {
  const [module, setModule] = useState<LookModule | null>(null);
  useEffect(() => { let live = true; void import('./look/FarmLook').then(value => { if (live) setModule(value); }); return () => { live = false; }; }, []);
  return module;
}
function DevLookEffects() { const look = useLookModule(); return look ? <look.FarmPostEffects/> : null; }
function DevLookControls() { const look = useLookModule(); return look ? <look.FarmLookControls/> : null; }

export type FarmSceneProps = SceneProps;
export function FarmScene(props: FarmSceneProps) {
  const session = useBuilt(createFarmSession, value => value.dispose(), []);
  const definition = useMemo<SceneDefinition | null>(() => session ? { ...farmDefinition,
    prepareData: (data, context) => prepareFarmData(session, data, context),
    hud: <FarmContext.Provider value={session}><FarmHud/></FarmContext.Provider>,
    devPanel: import.meta.env.KILN_DEV ? <DevPanel><FarmContext.Provider value={session}><DevLookControls/></FarmContext.Provider></DevPanel> : undefined,
  } : null, [session]);
  if (!session || !definition) return null;
  const onProgress = (progress: SceneProgress) => {
    if (progress.phase === 'build') props.onProgress?.({ ...progress, phase: 'graphics', text: FARM_STRINGS.lighting });
    const text = progress.phase === 'pack' ? FARM_STRINGS.pack : progress.phase === 'graphics' ? FARM_STRINGS.graphics
      : progress.phase === 'assets' ? `Loading assets: ${progress.loaded} of ${progress.total}…`
      : progress.phase === 'build' ? FARM_STRINGS.build : FARM_STRINGS.firstFrame;
    props.onProgress?.({ ...progress, text });
  };
  return <SceneRoot options={{ ...props, onProgress }} definition={definition}>
    <FarmContext.Provider value={session}><FarmLighting/><FarmWorldContent/>{import.meta.env.KILN_DEV ? <DevLookEffects/> : null}</FarmContext.Provider>
  </SceneRoot>;
}
