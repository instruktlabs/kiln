export function summarizeFrameTimes(samples: readonly number[]) {
  const sorted = samples
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!sorted.length) throw new Error('No frame timing evidence was collected.');
  const rank = (quantile: number) => sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)]!;
  return {
    samples: sorted.length,
    min: sorted[0]!,
    p50: rank(0.5),
    p95: rank(0.95),
    max: sorted.at(-1)!,
  };
}

/** Receipts name only a loaded artifact that remains selected for the complete sample. */
export async function measureReviewedArtifact<T extends object>(
  measure: () => Promise<T>,
  identity: () => unknown,
) {
  const artifact = identity();
  if (artifact === undefined)
    throw new Error('Wait for the selected artifact to be loaded before measuring.');
  const stamp = JSON.stringify(artifact);
  const receipt = await measure();
  if (JSON.stringify(identity()) !== stamp)
    throw new Error('The artifact changed during measurement. Measure the loaded revision again.');
  return { ...receipt, artifact };
}

export interface StagePerformanceReceipt {
  version: 'kiln.viewer-performance.v1';
  measuredAt: string;
  windowMs: number;
  frameMs: ReturnType<typeof summarizeFrameTimes>;
  loadToFirstFrameMs?: number;
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  geometryObjects: number;
  textureObjects: number;
  shaderPrograms: number;
  viewport: {
    cssWidth: number;
    cssHeight: number;
    bufferWidth: number;
    bufferHeight: number;
    devicePixelRatio: number;
  };
  renderer: {
    version: string;
    vendor: string;
    renderer: string;
    browser: string;
    unmaskedVendor?: string;
    unmaskedRenderer?: string;
  };
  camera: { position: number[]; target: number[]; fov: number };
  limitations: string[];
}
