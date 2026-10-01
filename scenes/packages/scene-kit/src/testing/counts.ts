interface RendererCountSource {
  _pipelines?: { caches?: { size: number } } | null;
  info?: { memory?: { programs?: number } };
}
/** r186 caches actual pipelines separately from the shader-stage program counter. */
export function rendererProgramCounts(renderer: RendererCountSource | null | undefined): { pipelines: number; programs: number } {
  return { pipelines: renderer?._pipelines?.caches?.size ?? 0, programs: renderer?.info?.memory?.programs ?? 0 };
}
