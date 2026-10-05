type ReviewState = 'loading' | 'ready' | 'closing' | 'idle' | 'error';
interface TroyWindow extends Window {
  troy?: { dispose(): Promise<void> | void; stats(): unknown };
}
interface Options {
  origin: string;
  createFrame(): HTMLIFrameElement;
  mount(frame: HTMLIFrameElement): void;
  subscribe(listener: (event: MessageEvent) => void): () => void;
  onState(state: ReviewState, error?: Error): void;
  onProgress(text: string): void;
  onExit(): void;
  clock?: { set(fn: () => void, ms: number): number; clear(id: number): void };
}

/** Same-origin scene preview; the scene finishes GPU teardown before its frame goes away. */
export function createTroySceneSession(options: Options) {
  const clock = options.clock ?? {
    set: (fn, ms) => window.setTimeout(fn, ms),
    clear: (id) => window.clearTimeout(id),
  };
  let frame: HTMLIFrameElement | undefined, unsubscribe: (() => void) | undefined;
  let timer: number | undefined, closing: Promise<void> | undefined, release: unknown;
  const untimer = () => {
    if (timer !== undefined) clock.clear(timer);
    timer = undefined;
  };
  function renew() {
    untimer();
    timer = clock.set(() => {
      void stop().then(() => options.onState('error', new Error('The scene stopped responding.')));
    }, 45_000);
  }
  function stop(): Promise<void> {
    if (closing) return closing;
    const owned = frame;
    if (!owned) return Promise.resolve();
    frame = undefined;
    untimer();
    unsubscribe?.();
    unsubscribe = undefined;
    options.onState('closing');
    closing = (async () => {
      try {
        const troy = (owned.contentWindow as TroyWindow | null)?.troy;
        await troy?.dispose();
        release = troy?.stats();
      } finally {
        owned.remove();
        closing = undefined;
        options.onState('idle');
      }
    })();
    return closing;
  }
  return {
    start(url: string) {
      if (frame || closing) return;
      const target = new URL(url, options.origin);
      if (
        target.origin !== options.origin ||
        !/^\/scene-packs\/troy\/[a-z0-9-]+\/web\/(?:index\.html)?$/.test(target.pathname)
      )
        throw new Error('An exact staged Troy scene entry is required.');
      const owned = options.createFrame();
      frame = owned;
      options.onState('loading');
      renew();
      unsubscribe = options.subscribe((event) => {
        if (
          frame !== owned ||
          event.origin !== options.origin ||
          event.source !== owned.contentWindow
        )
          return;
        const data = event.data;
        if (data?.source !== 'kiln-scene') return;
        if (data.state === 'progress' || data.state === 'started') {
          renew();
          options.onProgress(data.text ?? 'Loading the sceneâ€¦');
        } else if (data.state === 'ready') {
          untimer();
          options.onState('ready');
          owned.contentWindow?.focus();
        } else if (data.state === 'exit') options.onExit();
        else if (data.state === 'error') {
          void stop().then(() =>
            options.onState('error', new Error(data.message ?? 'The scene could not start.')),
          );
        }
      });
      options.mount(owned);
      owned.src = target.href;
    },
    stop,
    released: () => release,
  };
}
