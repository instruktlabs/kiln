import { mountAssetViewer } from '../src/components/AssetViewerRuntime';

/**
 * Browser side of `verify-viewer-draws.mjs`: the site's own viewer runtime on one model, with its query string
 * choosing the backend and the saved cameras, so the counts come from what a visitor's page runs.
 */
const query = new URLSearchParams(location.search);
const failures: string[] = [];
(window as unknown as { kilnViewerFailures: string[] }).kilnViewerFailures = failures;
mountAssetViewer(document.getElementById('viewer') as HTMLElement, {
  name: 'model',
  modelUrl: '/model.glb',
  onError: (error) => failures.push(error.message),
  forceWebGL: query.get('backend') === 'webgl2',
  views: JSON.parse(query.get('views') ?? '[]'),
});
