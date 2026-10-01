/** A handled scene Escape must not also close the host's scene frame. */
export function closeScenePanelOnEscape(event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation'>, close: () => void): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault(); event.stopPropagation(); close();
}
