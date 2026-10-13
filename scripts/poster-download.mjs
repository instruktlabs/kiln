/** Read the entire body before reporting a successful poster download. */
export async function downloadPoster(
  url,
  { fetchImpl = fetch, timeoutMs = 30_000, retryDelayMs = 250 } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        await response.body?.cancel();
        return { response, bytes: null };
      }
      return { response, bytes: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      // GET is idempotent. Retry transport failures, including interrupted bodies;
      // HTTP, MIME and receipt/hash failures remain the caller's audit failures.
      if (attempt === 3) throw error;
      await new Promise((done) => setTimeout(done, retryDelayMs * attempt));
    }
  }
}
