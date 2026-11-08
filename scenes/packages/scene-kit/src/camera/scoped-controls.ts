/**
 * r187 OrbitControls attaches captured pointer moves and Control-key tracking to
 * ownerDocument; r186 tracked Control keys through getRootNode, which stays redirected.
 * Redirect only those event targets to the scene root.
 * Canvas methods retain their real receiver, including setPointerCapture, so drags
 * that leave the canvas continue to bubble through the root without global listeners.
 */
export function createScopedControlsElement(canvas: HTMLCanvasElement, root: HTMLElement): HTMLElement {
  const bound = new Map<PropertyKey, unknown>();
  return new Proxy(canvas, {
    get(target, key) {
      if (key === 'ownerDocument') return root;
      if (key === 'getRootNode') return () => root;
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!bound.has(key)) bound.set(key, value.bind(target)); return bound.get(key);
    },
    set(target, key, value) { return Reflect.set(target, key, value, target); },
  });
}
