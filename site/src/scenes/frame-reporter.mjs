/** Serialized into the standalone wrapper. It depends only on the supplied browser window. */
export function installFrameReporter(scope) {
  const status = scope.document.getElementById('page-status');
  const post = (message) => {
    if (scope.parent !== scope) scope.parent.postMessage({ source: 'kiln-scene', ...message }, scope.location.origin);
  };
  const fail = (error) => post({ state: 'error', message: error?.message ?? 'The scene could not start.', errorCode: error?.code ?? 'runtime' });
  post({ state: 'started' });
  scope.addEventListener('error', (event) => fail(event.error));
  scope.addEventListener('unhandledrejection', (event) => fail(event.reason));
  // Run after the scene's own event listeners, including listeners installed later.
  scope.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') scope.queueMicrotask(() => {
      if (!event.defaultPrevented) post({ state: 'exit' });
    });
  });
  if (!status) return fail(new Error('The scene status element is missing.'));
  const report = () => {
    const text = status.textContent.trim();
    const state = status.dataset.state;
    if (state === 'error') post({ state: 'error', message: text, errorCode: status.dataset.errorCode ?? 'runtime' });
    else if (state === 'ready') post({ state: 'ready' });
    // Structural compatibility for frozen scene builds that predate explicit state.
    else if (!state && !text) post({ state: 'ready' });
    else post({ state: 'progress', text });
  };
  new scope.MutationObserver(report).observe(status, { attributes: true, attributeFilter: ['data-state', 'data-error-code'], childList: true, characterData: true, subtree: true });
  report();
}
