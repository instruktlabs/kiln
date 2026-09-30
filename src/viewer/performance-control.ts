/// <reference lib="dom" />
import type { createAssetStage } from './scene';
import { node, recordDetails } from './dom';
import { measureReviewedArtifact } from './performance';

export function mountPerformanceControl(
  button: HTMLButtonElement,
  target: HTMLElement,
  stage: () => ReturnType<typeof createAssetStage> | undefined,
  identity: () => unknown,
) {
  let url: string | undefined;
  button.onclick = async () => {
    const current = stage();
    if (!current) {
      target.replaceChildren(node('p', 'Load an artifact before measuring.', 'subtle'));
      return;
    }
    button.disabled = true;
    target.replaceChildren(
      node(
        'p',
        'Measuring frame pacing for 3 seconds. Keep this viewport visible and the camera steady.',
        'subtle',
      ),
    );
    try {
      const receipt = await measureReviewedArtifact(() => current.measure(3000), identity);
      const card = node('div', undefined, 'evidence-card');
      card.append(
        node('h3', 'Exploratory browser measurement'),
        node(
          'p',
          'Other workloads are not controlled. This sample is not an isolated performance baseline or budget acceptance.',
        ),
        node(
          'strong',
          `p50 ${receipt.frameMs.p50.toFixed(1)} ms · p95 ${receipt.frameMs.p95.toFixed(1)} ms`,
        ),
        node(
          'p',
          `${receipt.frameMs.samples} frame intervals · ${(receipt.windowMs / 1000).toFixed(2)} s · ${receipt.drawCalls} draws · ${receipt.triangles.toLocaleString()} rendered triangles`,
        ),
        node(
          'p',
          `${receipt.geometryObjects} geometry objects · ${receipt.textureObjects} texture objects. These counts are not GPU memory bytes.`,
        ),
        node(
          'p',
          `GLB parse to first frame submission: ${receipt.loadToFirstFrameMs?.toFixed(1) ?? 'unavailable'} ms. Download time excluded.`,
        ),
        node(
          'p',
          `${receipt.viewport.cssWidth}×${receipt.viewport.cssHeight} CSS pixels · DPR ${receipt.viewport.devicePixelRatio.toFixed(2)}. Frame pacing includes browser scheduling and vertical sync, not GPU execution timing.`,
        ),
      );
      const details = recordDetails('Exact measurement receipt and limitations', receipt);
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(
        new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }),
      );
      const download = node('a', 'Download measurement receipt');
      download.href = url;
      download.download = 'kiln-viewer-performance.json';
      card.append(details, download);
      target.replaceChildren(card);
    } catch (error) {
      target.replaceChildren(
        node('p', error instanceof Error ? error.message : String(error), 'subtle'),
      );
    } finally {
      button.disabled = false;
    }
  };
}
