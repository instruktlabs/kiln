/** Manual pilot host. This starts tools, never a model or a paid provider request. */
import { readFile, mkdir, appendFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { McpServer, type Transport } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createConditionRegistry, disabledHelperNames, type Condition } from './conditions';
import { createLocalToolContext } from '../../src/local-runtime';
import { FileProgramStore } from '../../src/program-store-node';
import { runTool } from '../../src/mcp-server';

const configPath = process.argv[2];
if (!configPath) throw new Error('Usage: bun scripts/evaluation/server.ts RUN_CONFIG.json');
const config = JSON.parse(await readFile(resolve(configPath), 'utf8')) as {
  runId: string;
  condition: Condition;
  outputDirectory: string;
  programStoreDirectory: string;
  authorization: string;
  maxToolCalls: number;
  maxImageCells: number;
  maxCellSide: number;
  maxWallSeconds: number;
  allowResume?: boolean;
};
if (
  !['A', 'B', 'C'].includes(config.condition) ||
  !config.runId ||
  !config.authorization ||
  !config.programStoreDirectory
)
  throw new Error('runId, condition and a declared authorization record are required.');
for (const key of ['maxToolCalls', 'maxImageCells', 'maxCellSide', 'maxWallSeconds'] as const)
  if (!Number.isInteger(config[key]) || config[key] <= 0)
    throw new Error(`${key} must be a positive integer.`);
if (config.maxCellSide > 512) throw new Error('Pilot cells are capped at 512 pixels per side.');
const output = resolve(config.outputDirectory);
// Nonrecursive final creation refuses accidental reuse of a completed or active run directory.
/**
 * The arguments the image-cell estimator below reads, and only those. The real
 * schema is each tool's own `inputSchema`; this is the pilot's view of it, so a
 * field appearing here is a field the budget depends on.
 */
type PilotToolInput = {
  render?: boolean;
  frames?: number;
  frameTimes?: unknown[];
  capture?: { shots?: unknown[]; cells?: unknown[]; preset?: unknown; size?: number };
};

let previous: { config?: unknown; deadline?: number } | undefined;
try {
  await mkdir(output);
  await mkdir(join(output, 'images'));
} catch (error) {
  if (!config.allowResume || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  previous = JSON.parse(await readFile(join(output, 'host.json'), 'utf8'));
  if (!isDeepStrictEqual(previous.config, config))
    throw new Error('Resume configuration differs from frozen run.');
}
const deadline = previous?.deadline ?? Date.now() + config.maxWallSeconds * 1000;
const session = new AbortController();
const timer = setTimeout(
  () => session.abort(new Error('budget-exhausted: wall-time limit')),
  Math.max(1, deadline - Date.now()),
);
const requestSignals = new AsyncLocalStorage<AbortSignal>();
const context = createLocalToolContext({
  programStore: new FileProgramStore(resolve(config.programStoreDirectory)),
  evaluationControls: () => ({
    signal: AbortSignal.any([
      session.signal,
      ...(requestSignals.getStore() ? [requestSignals.getStore()!] : []),
    ]),
    deadlineMs: Math.max(1, Math.min(60000, deadline - Date.now())),
  }),
});
// This historical controlled comparison keeps its original authoring surface.
// Workspace management would change the experimental conditions and tool budget.
const definitions = createConditionRegistry(config.condition, {
  ...context,
  workspace: undefined,
  projectStore: undefined,
  materialLibrary: undefined,
  reviewStore: undefined,
});
const sha = (bytes: string | Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
if (!previous)
  await writeFile(
    join(output, 'host.json'),
    JSON.stringify(
      {
        config,
        deadline,
        disabledHelpers: config.condition === 'C' ? [] : disabledHelperNames,
        execution: {
          ...context.localExecution,
          cacheScope: 'disabled',
          cacheReason: 'Experimental adapter does not declare an evaluator cache identity',
        },
        adapterHash: sha(await readFile(new URL('./conditions.ts', import.meta.url))),
        note: 'CPU-only matched pilot host. Transport delivery is not proof of model image consumption.',
      },
      null,
      2,
    ),
  );
let calls = 0,
  cells = 0,
  pixels = 0;
if (previous) {
  const records = async (name: string) => {
    try {
      return (await readFile(join(output, name), 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  };
  calls = Math.max(0, ...(await records('requests.jsonl')).map((record) => record.sequence));
  const counters = (await records('events.jsonl')).at(-1)?.counters;
  cells = counters?.reservedOrDeliveredCells ?? 0;
  pixels = counters?.pixels ?? 0;
}
const requestSequences = new Map<string | number, number>();
const server = new McpServer({ name: 'kiln-evaluation', version: '1.0.0' });
for (const def of definitions)
  server.registerTool(
    def.name,
    { description: def.description, inputSchema: def.inputSchema },
    async (args, request) => {
      const sequence = requestSequences.get(request.mcpReq.id);
      if (sequence === undefined) throw new Error('Missing reserved pilot request sequence.');
      const started = Date.now();
      const input = args as PilotToolInput;
      const estimate =
        ![
          'kiln_render',
          'kiln_edit',
          'kiln_inspect',
          'kiln_screenshot_animation',
          'kiln_view_interior',
        ].includes(def.name) ||
        (def.name === 'kiln_edit' && input.render === false)
          ? 0
          : (input.capture?.shots?.length ??
            input.capture?.cells?.length ??
            (input.capture?.preset
              ? String(input.capture.preset)
                  .split('x')
                  .reduce((a, b) => a * Number(b), 1)
              : def.name === 'kiln_inspect'
                ? 1
                : def.name === 'kiln_view_interior'
                  ? 3
                  : (input.frameTimes?.length ?? input.frames ?? 6)));
      let reserved = false;
      try {
        if (
          Date.now() >= deadline ||
          sequence > config.maxToolCalls ||
          cells + estimate > config.maxImageCells ||
          (input.capture?.size ?? 384) > config.maxCellSide
        )
          throw new Error('budget-exhausted: declared pilot limit');
        // Reserve before awaiting so parallel requests cannot exceed the image-cell allowance.
        cells += estimate;
        reserved = true;
        const result = await requestSignals.run(request.mcpReq.signal, () => runTool(def, args));
        const images: Array<{ path: string; hash: string; width: number; height: number }> = [];
        for (const block of result.content)
          if (block.type === 'image') {
            const data = Buffer.from(block.data, 'base64');
            const width = data.readUInt32BE(16),
              height = data.readUInt32BE(20);
            pixels += width * height;
            const path = `images/${sequence}-${images.length}.png`;
            await writeFile(join(output, path), data);
            images.push({ path, hash: sha(data), width, height });
          }
        if (!images.length) cells -= estimate;
        reserved = false;
        if (pixels > config.maxImageCells * config.maxCellSide * config.maxCellSide)
          throw new Error('budget-exhausted: delivered pixel limit');
        await appendFile(
          join(output, 'events.jsonl'),
          `${JSON.stringify({
            sequence,
            tool: def.name,
            args,
            startedAt: new Date(started).toISOString(),
            wallMs: Date.now() - started,
            result: {
              ...result,
              content: result.content.filter((block) => block.type !== 'image'),
            },
            images,
            counters: { calls, reservedOrDeliveredCells: cells, pixels },
          })}\n`,
        );
        return result;
      } catch (error) {
        if (reserved) cells -= estimate;
        const message = error instanceof Error ? error.message : String(error);
        await appendFile(
          join(output, 'events.jsonl'),
          `${JSON.stringify({
            sequence,
            tool: def.name,
            args,
            wallMs: Date.now() - started,
            error: message,
            counters: { calls, reservedOrDeliveredCells: cells, pixels },
          })}\n`,
        );
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    },
  );
process.on('exit', () => clearTimeout(timer));
timer.unref();
const underlying = new StdioServerTransport();
const transport: Transport = {
  start: () => underlying.start(),
  send: (message) => {
    if ('id' in message) requestSequences.delete(message.id);
    return underlying.send(message);
  },
  close: () => underlying.close(),
};
underlying.onmessage = (message) => {
  if ('method' in message && message.method === 'tools/call') {
    const sequence = ++calls;
    appendFileSync(
      join(output, 'requests.jsonl'),
      `${JSON.stringify({
        sequence,
        method: message.method,
        paramsHash: sha(JSON.stringify(message.params ?? {})),
        receivedAt: new Date().toISOString(),
      })}\n`,
    );
    if ('id' in message) requestSequences.set(message.id, sequence);
    transport.onmessage?.(message);
  } else transport.onmessage?.(message);
};
underlying.onerror = (error) => transport.onerror?.(error);
underlying.onclose = () => transport.onclose?.();
void serveStdio(() => server, { transport });
