import { useEffect, useMemo } from 'react';
import { DevPanel, SceneRoot, useBuilt } from '@kiln-scenes/scene-kit';
import type { SceneDefinition, SceneProgress, SceneProps } from '@kiln-scenes/scene-kit';
import { goldenGateDefinition } from './definition';
import { createGoldenGateSession, GoldenGateContext } from './state';
import { GoldenGateHud } from './ui/GoldenGateHud';
import { GG_STRINGS } from './ui/strings';
import { GoldenGateWorldContent } from './World';

export type GoldenGateSceneProps = SceneProps;
export function GoldenGateScene(props: GoldenGateSceneProps) {
  const session = useBuilt(createGoldenGateSession, value => value.dispose(), []);
  const definition = useMemo<SceneDefinition | null>(() => session ? { ...goldenGateDefinition,
    hud: <GoldenGateContext.Provider value={session}><GoldenGateHud/></GoldenGateContext.Provider>,
    devPanel: import.meta.env.KILN_DEV ? <DevPanel/> : undefined,
  } : null, [session]);
  // The kit reports one 'build' step; the world reports its own stages through the session.
  useEffect(() => {
    if (!session) return;
    session.progress = progress => props.onProgress?.(progress);
    return () => { session.progress = null; };
  });
  if (!session || !definition) return null;
  const onProgress = (progress: SceneProgress) => {
    const text = progress.phase === 'pack' ? GG_STRINGS.pack : progress.phase === 'graphics' ? GG_STRINGS.graphics
      : progress.phase === 'assets' ? `Loading assets: ${progress.loaded} of ${progress.total}…`
      : progress.phase === 'build' ? GG_STRINGS.build : GG_STRINGS.firstFrame;
    props.onProgress?.({ ...progress, text });
  };
  return <SceneRoot options={{ ...props, onProgress }} definition={definition}>
    <GoldenGateContext.Provider value={session}><GoldenGateWorldContent/></GoldenGateContext.Provider>
  </SceneRoot>;
}
