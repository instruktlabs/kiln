import { mountScene } from '@kiln-scenes/scene-kit';
import type { SceneProps, SceneHandle } from '@kiln-scenes/scene-kit';
import { DemoScene } from '../demo/DemoScene';
// Same minimum prop shape as the website island, with no required extras.
interface WebsiteSceneProps { assetBase: string; onReady?: () => void; onError?: (error: Error) => void }
const props: WebsiteSceneProps = { assetBase: './assets/' };
const checked: SceneProps = props;
const handle: SceneHandle = mountScene(document.querySelector<HTMLElement>('#scene')!, DemoScene, checked);
document.querySelector<HTMLButtonElement>('#close')!.onclick = () => handle.unmount();
