/** A handled scene Escape must not also close the host's scene frame. */
export function closeScenePanelOnEscape(event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'preventDefault' | 'stopPropagation'>, close: () => void): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.preventDefault(); event.stopPropagation(); close();
}

/** Restore panel focus even when a containing HUD menu has collapsed. */
export function restoreScenePanelFocus(trigger: HTMLElement | null): void {
  if (!trigger) return;
  const focus = (target: HTMLElement | null): boolean => {
    if (!target?.isConnected || target.getClientRects().length === 0) return false;
    target.focus({ preventScroll: true });
    return target.ownerDocument.activeElement === target;
  };
  if (focus(trigger)) return;
  let menu = trigger.closest<HTMLElement>('.ks-menu');
  while (menu) {
    if (focus(menu.querySelector<HTMLElement>(':scope > .ks-menu-trigger'))) return;
    menu = menu.parentElement?.closest<HTMLElement>('.ks-menu') ?? null;
  }
  focus(trigger.closest<HTMLElement>('.ks-root'));
}
