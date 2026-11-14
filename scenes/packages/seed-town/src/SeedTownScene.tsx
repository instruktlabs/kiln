import { useEffect, useMemo, useRef } from 'react';
import { SceneRoot } from '@kiln-scenes/scene-kit';
import type { SceneProps } from '@kiln-scenes/scene-kit';
import { townDefinition } from './definition';
import { Eyes } from './eyes';
import { TownHud } from './hud';
import { TownLighting } from './lighting';
import { createSession } from './session';
import type { TownState } from './session';
import { TownWorld } from './world';

export interface SeedTownSceneProps extends SceneProps {
  /** The town to stand first. Any text; the same seed always gives the same town. */
  seed?: string;
  dusk?: boolean;
  /** Called when the visitor stands another town or changes the hour, so a page can keep its address in step. */
  onTown?: (state: TownState) => void;
}

export function SeedTownScene(props: SeedTownSceneProps) {
  const { seed, dusk, onTown, ...options } = props;
  // The first seed and hour are a starting point; afterwards the visitor's own choices stand.
  const session = useMemo(() => createSession({ seed, dusk }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const notify = useRef(onTown);
  notify.current = onTown;
  useEffect(() => {
    let last = session.getState();
    return session.subscribe(() => {
      const next = session.getState();
      if (next === last) return;
      last = next;
      notify.current?.(next);
    });
  }, [session]);
  const definition = useMemo(() => ({ ...townDefinition, hud: <TownHud session={session} /> }), [session]);
  return <SceneRoot options={options} definition={definition}>
    <TownLighting session={session} />
    <TownWorld session={session} />
    <Eyes session={session} />
  </SceneRoot>;
}
