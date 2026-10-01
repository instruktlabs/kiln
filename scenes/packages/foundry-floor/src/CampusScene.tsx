// SPDX-License-Identifier: MIT
// The Foundry Floor campus scene (FF-C1): the exterior of the accepted campus (orbit, drive) with the way in to the
// unchanged FF2 interior twin. One stable definition (the kit remounts the scene when it changes): FF2's tiers and
// look (NeutralToneMapping; the interior keeps FF2's room environment, the exterior sets its own sky and restores it),
// the opening camera at the whole-campus view. The world and the HUD switch places from the campus session.
import { useMemo } from 'react';
import { DevPanel, SceneRoot, useBuilt } from '@kiln-scenes/scene-kit';
import type { SceneDefinition, SceneProps } from '@kiln-scenes/scene-kit';
import { foundryFloorDefinition } from './definition';
import { CampusHud } from './campus/Hud';
import { CampusContext, createCampusSession } from './campus/session';
import { CampusWorld } from './campus/World';
import { campusStartupModel } from './campus/loading';

export type FoundryFloorCampusSceneProps = SceneProps;

/** The campus definition: FF2's tiers and look, its own id (the tier it earns is the campus's), the opening camera. */
export const foundryFloorCampusDefinition: SceneDefinition = {
  ...foundryFloorDefinition,
  id: 'foundry-floor-campus',
  label: 'Foundry Floor campus',
  description: 'The Foundry Floor campus: four fab buildings in two mirrored pairs on a split road with a roundabout. Orbit the campus, drive its roads, and enter at the south-west arrival canopy to see the running fab inside, a live, seeded simulation of one fab slice.',
  camera: { position: [-3400, 3000, -6400], fov: 40, near: 20, far: 40000 },
  startupModel:campusStartupModel,
};

export function FoundryFloorCampusScene(props: FoundryFloorCampusSceneProps) {
  const session = useBuilt(createCampusSession, value => value.dispose(), []);
  const definition = useMemo<SceneDefinition | null>(() => session ? {
    ...foundryFloorCampusDefinition,
    hud: <CampusContext.Provider value={session}><CampusHud/></CampusContext.Provider>,
    devPanel: import.meta.env.KILN_DEV ? <DevPanel/> : undefined,
  } : null, [session]);
  if (!session || !definition) return null;
  return <SceneRoot options={props} definition={definition}>
    <CampusContext.Provider value={session}><CampusWorld/></CampusContext.Provider>
  </SceneRoot>;
}
