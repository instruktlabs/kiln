/**
 * `ensureStreamStart` — guarantee a leading `stream-start` part on a
 * LanguageModelV3 stream.
 *
 * WHY THIS EXISTS: Strands' `VercelModel` only emits its `modelMessageStartEvent`
 * (which sets the internal `messageRole`) when it sees a `stream-start` stream
 * part, and its base model loop only stores the final message `if (messageRole)`.
 * The AI-SDK V3 spec lists `stream-start` as the leading part, but some providers
 * — notably `@openrouter/ai-sdk-provider` (2.10.0) — omit it, leading instead with
 * `response-metadata`. The result: `messageRole` is never set, the terminal
 * `modelMessageStopEvent` is dropped, and the loop throws
 * `ModelError: Stream ended without completing a message`. Native Strands
 * providers (Anthropic/OpenAI/Google) emit `stream-start`, so only the
 * Vercel-bridge providers (OpenRouter and friends) are affected.
 *
 * This proxy pipes `doStream`'s stream through a TransformStream that prepends a
 * spec-conformant `{ type: 'stream-start', warnings: [] }` part if the provider
 * doesn't already open with one. It is a no-op for conformant providers.
 *
 * Reproduced offline with the actual OpenRouter 2.10.0 + Strands SDK 1.18.0
 * packages in openrouter-conformance.test.ts, including a complete tool loop and
 * usage accounting. Strands SDK 1.24.0 tolerates the missing part, so with the
 * pinned SDK this adapter is redundant; the conformance test records both facts.
 * Remove it in its own change, after a live OpenRouter check. Do not patch the
 * SDK or coerce the V4 provider into V3.
 */
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';

/**
 * Wrap a `LanguageModelV3` so its `doStream` output always begins with a
 * `stream-start` part. All other properties/methods pass through unchanged.
 */
export function ensureStreamStart(model: LanguageModelV3): LanguageModelV3 {
  const origDoStream = model.doStream.bind(model);
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === 'doStream') {
        return async (options: LanguageModelV3CallOptions) => {
          const result = await origDoStream(options);
          let injected = false;
          const guard = new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
            transform(chunk, ctrl) {
              if (!injected && chunk.type !== 'stream-start')
                ctrl.enqueue({ type: 'stream-start', warnings: [] });
              injected = true;
              ctrl.enqueue(chunk);
            },
            flush(ctrl) {
              if (!injected) ctrl.enqueue({ type: 'stream-start', warnings: [] });
            },
          });
          return { ...result, stream: result.stream.pipeThrough(guard) };
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
