/** Bind the walking mode's Escape handoff independently of rendering. */
export function bindWalkExit(root: HTMLElement, canvas: HTMLCanvasElement, playing: () => boolean, leave: () => void): () => void {
  const doc = canvas.ownerDocument;
  let heldLock = doc.pointerLockElement === canvas;
  const exit = () => {
    // Clear before exitPointerLock: its change event can be synchronous in hosts.
    heldLock = false;
    leave();
    if (doc.pointerLockElement === canvas) doc.exitPointerLock();
    root.focus({ preventScroll: true });
  };
  const key = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' || !playing() || event.defaultPrevented) return;
    // Panel handlers run in capture. HudMenu closes in React's bubble phase,
    // after this native root listener, so let a focused open menu handle it.
    if ((event.target as Element | null)?.closest?.('.ks-menu[data-open]')) return;
    event.preventDefault(); event.stopPropagation(); exit();
  };
  const lockChanged = () => {
    const locked = doc.pointerLockElement === canvas, released = heldLock && !locked;
    heldLock = locked;
    // Browsers can reserve Escape for unlocking and withhold its keydown.
    if (released && playing()) exit();
  };
  root.addEventListener('keydown', key);
  doc.addEventListener('pointerlockchange', lockChanged);
  return () => { root.removeEventListener('keydown', key); doc.removeEventListener('pointerlockchange', lockChanged); };
}
