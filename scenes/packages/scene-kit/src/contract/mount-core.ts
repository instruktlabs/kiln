import { asSceneError } from './core';

export interface SafeMountCallbacks {
  onReady(): void;
  onError(error: unknown): void;
}

export interface SafeMountOptions<Host, Root> {
  createHost(): Host;
  appendHost(host: Host): void;
  removeHost(host: Host): void;
  createRoot(host: Host, onError: SafeMountCallbacks['onError']): Root;
  render(root: Root, callbacks: SafeMountCallbacks): void;
  unmountRoot(root: Root): void;
  scheduleFailureCleanup?: (cleanup: () => void) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

/** Own setup, callbacks and teardown without depending on React or the DOM. */
export function safeMount<Host, Root>(options: SafeMountOptions<Host, Root>): { readonly disposed: boolean; unmount(): void } {
  let disposed = false, failed = false, ready = false;
  let host!: Host, root!: Root, hasHost = false, hasRoot = false;
  let hostReleased = false, rootReleased = false, acquiringRoot = false, failureCleanupPending = false;

  function release(): void {
    // A synchronously failing factory may still return a root to release first.
    if (acquiringRoot) return;
    try {
      if (hasRoot && !rootReleased) {
        rootReleased = true;
        try { options.unmountRoot(root); } catch { /* Continue removing the owned host. */ }
      }
    } finally {
      if (hasHost && !hostReleased) {
        hostReleased = true;
        try { options.removeHost(host); } catch { /* Cleanup never escapes to the page. */ }
      }
    }
  }
  function unmount(): void {
    // Close callbacks before invoking cleanup: cleanup may itself invoke them.
    disposed = true;
    release();
  }

  const callbacks: SafeMountCallbacks = {
    onError(error) {
      if (disposed || failed) return;
      failed = true; disposed = true;
      try { options.onError?.(asSceneError(error)); } catch { /* Consumer callback. */ }
      finally {
        if (options.scheduleFailureCleanup) {
          failureCleanupPending = true;
          try { options.scheduleFailureCleanup(() => { failureCleanupPending = false; release(); }); }
          catch { failureCleanupPending = false; release(); }
        } else release();
      }
    },
    onReady() {
      if (disposed || failed || ready) return;
      ready = true;
      try { options.onReady?.(); } catch (error) { callbacks.onError(error); }
    },
  };
  const handle = { get disposed() { return disposed; }, unmount };

  try {
    host = options.createHost(); hasHost = true;
    options.appendHost(host);
    acquiringRoot = true;
    try { root = options.createRoot(host, callbacks.onError); hasRoot = true; }
    finally { acquiringRoot = false; }
    // A root factory may report an error synchronously and still return its root.
    if (disposed) { if (!failureCleanupPending) release(); }
    else options.render(root, callbacks);
  } catch (error) {
    callbacks.onError(error);
    // A setup stage can throw after a callback has already closed the gates.
    if (!failureCleanupPending) release();
  }
  return handle;
}

/** A subscriber or diagnostics collector cannot interrupt terminal cleanup. */
export function notifySafely(listeners: Iterable<() => void>, collect?: (error: unknown) => void): void {
  for (const listener of listeners) {
    try { listener(); }
    catch (error) { try { collect?.(error); } catch { /* Diagnostics are optional. */ } }
  }
}
