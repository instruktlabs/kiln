/** Private host admission bounds; these do not change the published engine limits. */
export const RENDER_LIMITS = Object.freeze({
  glbBytes: 4 * 1024 * 1024,
  requestBytes: 6 * 1024 * 1024,
  responseBytes: 20 * 1024 * 1024,
  pngBytes: 12 * 1024 * 1024,
  dimension: 1024,
  pixels: 3 * 1024 * 1024,
  deadlineMs: 30_000,
});
