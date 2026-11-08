import { expect, test } from 'bun:test';
import { Agent, tool } from '@strands-agents/sdk';
import { VercelModel } from '@strands-agents/sdk/models/vercel';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { ensureStreamStart } from './stream-start';

/** Actual installed provider + SDK, offline SSE at the HTTP boundary. */
function fixture() {
  const requests: Record<string, unknown>[] = [];
  const fetch = async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const first = requests.length === 1;
    const chunks = [
      {
        id: `offline-${requests.length}`,
        model: 'offline/model',
        choices: [
          {
            index: 0,
            delta: first
              ? {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_fixture',
                      type: 'function',
                      function: { name: 'lookup', arguments: '{"value":7}' },
                    },
                  ],
                }
              : { role: 'assistant', content: 'Complete.' },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [{ index: 0, delta: {}, finish_reason: first ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      },
    ];
    return new Response(
      `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    );
  };
  const provider = createOpenRouter({
    apiKey: 'offline-fixture',
    fetch: fetch as typeof globalThis.fetch,
  }).chat('offline/model');
  return { provider, requests };
}

test('OpenRouter 2.x still omits the required V3 stream-start event', async () => {
  const { provider } = fixture();
  const { stream } = await provider.doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Fixture' }] }],
  });
  const reader = stream.getReader();
  const first = await reader.read();
  await reader.cancel();
  expect(first.value?.type).not.toBe('stream-start');
});

// Strands 1.18–1.22 threw `Stream ended without completing a message` here; 1.24 tolerates the missing part. If this
// fails, the SDK has regressed and `ensureStreamStart` is load-bearing again.
test('Strands 1.24 completes an unadapted OpenRouter tool loop', async () => {
  const { provider, requests } = fixture();
  let received: unknown;
  const lookup = tool({
    name: 'lookup',
    description: 'Offline test',
    inputSchema: z.object({ value: z.number() }),
    callback: (input) => {
      received = input;
      return 'fixture-seven';
    },
  });
  const agent = new Agent({
    model: new VercelModel({ provider }),
    tools: [lookup],
    sandbox: false,
  });
  const result = await agent.invoke('Fixture', { limits: { turns: 2 } });
  expect(received).toEqual({ value: 7 });
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[1]?.messages)).toContain('fixture-seven');
  expect(result.stopReason).toBe('endTurn');
  expect(result.metrics?.latestAgentInvocation?.usage).toMatchObject({
    inputTokens: 40,
    outputTokens: 20,
  });
});

test('narrow stream adapter preserves actual provider tool input, result history and usage', async () => {
  const { provider, requests } = fixture();
  let received: unknown;
  const lookup = tool({
    name: 'lookup',
    description: 'Offline test',
    inputSchema: z.object({ value: z.number() }),
    callback: (input) => {
      received = input;
      return 'fixture-seven';
    },
  });
  const agent = new Agent({
    model: new VercelModel({ provider: ensureStreamStart(provider) }),
    tools: [lookup],
    sandbox: false,
  });
  const result = await agent.invoke('Fixture', { limits: { turns: 2 } });
  expect(received).toEqual({ value: 7 });
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[1]?.messages)).toContain('fixture-seven');
  expect(result.stopReason).toBe('endTurn');
  expect(result.lastMessage?.content).toContainEqual(
    expect.objectContaining({ type: 'textBlock', text: 'Complete.' }),
  );
  expect(result.metrics?.latestAgentInvocation?.usage).toMatchObject({
    inputTokens: 40,
    outputTokens: 20,
    totalTokens: 60,
  });
});
