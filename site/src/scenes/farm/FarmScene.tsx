import { useEffect } from 'react';

/** The scene workstream replaces this module without changing its host. */
export interface FarmSceneProps {
  assetBase: string;
  onReady?: () => void;
  onError?: (e: Error) => void;
}

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
