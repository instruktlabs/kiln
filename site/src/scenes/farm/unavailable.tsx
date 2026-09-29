import type { FarmSceneProps } from '@kiln-scenes/farm';
import { useEffect } from 'react';

/**
 * Stands in for the scene package in builds that cannot include it: no scenes workspace, or no
 * staged pack (scripts/scene-source.mjs). It keeps the island contract and states the status.
 */
export function FarmScene({ onReady }: FarmSceneProps) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <div className="flex min-h-viewer flex-col items-center justify-center gap-6 p-8 text-center">
      <h2 className="font-semibold">The interactive Farm is being rebuilt.</h2>
      <p className="max-w-prose text-lg">
        This scene is in production. The Farm scene download contains the current runnable scene.
      </p>
      <a className="btn btn-secondary" href="/packs/farm/">
        View the Farm downloads
      </a>
    </div>
  );
}
