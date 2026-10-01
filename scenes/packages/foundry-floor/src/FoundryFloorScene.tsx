// SPDX-License-Identifier: MIT
import { useMemo } from 'react';
import { DevPanel, SceneRoot, useBuilt } from '@kiln-scenes/scene-kit';
import type { SceneDefinition, SceneProps } from '@kiln-scenes/scene-kit';
import { foundryFloorDefinition } from './definition';
import { FoundryHud } from './scene/Hud';
import { createFoundrySession, FoundryContext } from './scene/session';
import { FoundryWorld } from './scene/World';

export type FoundryFloorSceneProps = SceneProps;
/** The running twin drawn from the accepted GLBs, from the staged pack (its models, asset map and stored warm start). */
export function FoundryFloorScene(props: FoundryFloorSceneProps) {
  const session = useBuilt(createFoundrySession, value => value.dispose(), []);
  const definition = useMemo<SceneDefinition | null>(() => session ? { ...foundryFloorDefinition,
    hud: <FoundryContext.Provider value={session}><FoundryHud/></FoundryContext.Provider>,
    devPanel: import.meta.env.KILN_DEV ? <DevPanel/> : undefined,
  } : null, [session]);
  if (!session || !definition) return null;
  return <SceneRoot options={props} definition={definition}>
    <FoundryContext.Provider value={session}><FoundryWorld/></FoundryContext.Provider>
  </SceneRoot>;
}
