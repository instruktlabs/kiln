// Operator-only diagnostics. Never return native exception text or process output.
const operations = new Set([
  'start',
  'monitor',
  'setInactivityTimeout',
  'exec',
  'inspect',
  'destroy',
]);

export function observeContainer(actual: Container, script?: string) {
  let failedOperation: string | undefined;
  const container = new Proxy(actual, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      if (typeof key !== 'string' || !operations.has(key)) return value.bind(target);
      return (...args: unknown[]) => {
        const fail = (error: unknown): never => {
          failedOperation ??= key;
          throw error;
        };
        try {
          if (key === 'exec' && script)
            args[0] = ['/usr/local/bin/node', '--input-type=module', '-e', script];
          const result = value.apply(target, args);
          return result instanceof Promise ? result.catch(fail) : result;
        } catch (error) {
          return fail(error);
        }
      };
    },
  });
  return { container, failure: () => failedOperation };
}
