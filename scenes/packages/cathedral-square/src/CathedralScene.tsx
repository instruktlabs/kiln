import { SceneRoot } from '@kiln-scenes/scene-kit';
import type { SceneProps } from '@kiln-scenes/scene-kit';
import { cathedralDefinition } from './definition';
import { Eyes } from './eyes';
import { SquareHud } from './hud';
import { SquareLighting } from './lighting';
import { SquareWorld } from './world';
import { InteriorAo } from './interior-ao';
import { SanctuaryReflections } from './sanctuary-reflections';

export type CathedralSceneProps = SceneProps;

export function CathedralScene(props: CathedralSceneProps) {
  const definition = { ...cathedralDefinition, hud: <SquareHud /> };
  return <SceneRoot options={props} definition={definition}>
    <SquareLighting />
    <SquareWorld />
    <Eyes />
    <SanctuaryReflections />
    <InteriorAo />
  </SceneRoot>;
}
