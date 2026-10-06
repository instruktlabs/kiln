const marker = new TextEncoder().encode('KILN_PROBE_READY\n');

/** Fixed probe instrumentation only; never imported by a production Worker. */
export function observeResilience(
  actual: Container,
  script: string,
  onReady: () => void,
  failFirstDestruction = false,
) {
  let ready = false;
  let index = 0;
  let invalidPrefix = false;
  let exitCode: number | undefined;
  let injectFailure = failFirstDestruction;
  const container = new Proxy(actual, {
    get(target, key) {
      if (key === 'destroy')
        return async () => {
          if (injectFailure) {
            injectFailure = false;
            throw new Error('Fixed probe destruction fault');
          }
          return target.destroy();
        };
      if (key === 'exec')
        return async (_command: string[], options?: ContainerExecOptions) => {
          const process = await target.exec(
            ['/usr/local/bin/node', '--input-type=module', '-e', script],
            options,
          );
          const exited = process.exitCode.then((code) => {
            exitCode = code;
            return code;
          });
          void exited.catch(() => {});
          const stdout = process.stdout?.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                if (!ready && !invalidPrefix) {
                  for (const byte of chunk) {
                    if (byte !== marker[index++]) {
                      invalidPrefix = true;
                      break;
                    }
                    if (index === marker.length) {
                      ready = true;
                      onReady();
                      break;
                    }
                  }
                }
                controller.enqueue(chunk);
              },
            }),
          );
          return new Proxy(process, {
            get(processTarget, property) {
              if (property === 'stdout') return stdout;
              if (property === 'exitCode') return exited;
              const value = Reflect.get(processTarget, property);
              return typeof value === 'function' ? value.bind(processTarget) : value;
            },
          });
        };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { container, ready: () => ready, exitCode: () => exitCode };
}
