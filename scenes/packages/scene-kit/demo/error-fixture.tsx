import type { JSX } from 'react';
import { SceneRoot } from '../src/contract';
import type { SceneProps } from '../src/contract';
import { demoDefinition } from './DemoScene';
function RenderFailure(): JSX.Element { throw new Error('Expected scene render failure'); }
export function DemoRenderFailureScene(props: SceneProps) { return <SceneRoot options={props} definition={demoDefinition}><RenderFailure/></SceneRoot>; }
