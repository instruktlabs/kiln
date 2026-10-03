/** The scene mount's minimum room, from browser measurements. */
export function sceneHasRoom(measured) {
  const { documentClientWidth, overlayClientWidth, overlay, mount } = measured;
  if (!overlay || !mount) return false;
  const values = [documentClientWidth, overlayClientWidth, overlay.left, overlay.right, overlay.width, mount.left, mount.right, mount.width, mount.height];
  if (!values.every(Number.isFinite) || documentClientWidth <= 0 || overlayClientWidth <= 0) return false;
  // A native browser scrollbar occupies part of innerWidth; an overlay scrollbar
  // can further reduce its client width. Neither represents a narrow scene.
  return Math.abs(overlay.left) <= 1 && Math.abs(overlay.right - documentClientWidth) <= 1
    && Math.abs(overlay.width - documentClientWidth) <= 1
    && overlayClientWidth <= overlay.width + 1
    && Math.abs(mount.width - overlayClientWidth) <= 1
    && mount.left >= overlay.left - 1 && mount.right <= overlay.right + 1
    && mount.height >= 200;
}

/** Runs in the browser before page scripts so late control reveals remain visible. */
export function observeSceneLayoutShifts(scope = window) {
  scope.__shifts = [];
  new scope.PerformanceObserver((list) => {
    const rect = (value) => value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
    for (const entry of list.getEntries()) scope.__shifts.push({
      value: entry.value, hadRecentInput: entry.hadRecentInput, time: entry.startTime,
      fonts: scope.document.fonts.status,
      exploreHidden: scope.document.querySelector('scene-shell [data-explore]')?.hidden ?? null,
      sources: (entry.sources ?? []).map((source) => ({
        tag: source.node?.tagName ?? null, id: source.node?.id ?? null,
        classes: typeof source.node?.className === 'string' ? source.node.className : null,
        previous: rect(source.previousRect), current: rect(source.currentRect),
      })),
    });
  }).observe({ type: 'layout-shift', buffered: true });
}
