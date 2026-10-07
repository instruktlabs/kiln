const dispose = (value: unknown) =>
  (value as { [Symbol.dispose]?: () => void } | null | undefined)?.[Symbol.dispose]?.();

/** Control RPCs return JSON values only. Detach them and release both the RPC
 * promise and result capabilities so an observer cannot pin a completed run. */
export async function qualificationControl<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PRIVATE_CONTROL_DEADLINE')), 10000);
      }),
    ]);
    try {
      return structuredClone(result);
    } finally {
      dispose(result);
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    dispose(work);
  }
}
