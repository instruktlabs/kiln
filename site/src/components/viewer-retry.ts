export const viewerErrorMessage = (error?: Error): string =>
  /WebGL|WebGPU|graphics|renderer/i.test(error?.message ?? '')
    ? 'This browser cannot draw the 3D view. The poster and downloads are still available.'
    : 'The 3D view could not load. Choose Open 3D view to try again; the poster and downloads are still available.';

/**
 * drei caches each GLB load by URL, a rejected one included: without eviction a failed first open would fail every
 * later open on the page without a new request. The viewer's error path clears the entry first, so Open retries the
 * network (engineering review, finding 5).
 */
export const clearingOnError =
  (modelUrl: string, onError: (error: Error) => void, clear: (url: string) => void) =>
  (error: Error): void => {
    clear(modelUrl);
    onError(error);
  };
