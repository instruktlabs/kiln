/**
 * A raw JSON-RPC driver for the built MCP server over stdio.
 *
 * The reference `Client` from `@modelcontextprotocol/client` negotiates for the
 * caller: it picks a protocol revision, sends the handshake and fills in the
 * per-request envelope. The contract tests need the opposite -- to send exactly
 * one wire shape and read back exactly what the server wrote -- so this speaks
 * newline-delimited JSON-RPC by hand, the way every harness's transport does.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dir, '..', '..');
export const SERVER_BUNDLE = join(REPO_ROOT, 'dist', 'mcp-server.mjs');

/** The newest revision, and the two handshake revisions the measured harnesses still open with. */
export const MODERN_REVISION = '2026-07-28';
export const LEGACY_REVISIONS = ['2025-11-25', '2025-06-18'] as const;

export const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
export const CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo';
export const CLIENT_CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities';
export const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo';
export const SUBSCRIPTION_ID_KEY = 'io.modelcontextprotocol/subscriptionId';

/** The per-request envelope a 2026-07-28 client puts in `params._meta`. */
export function modernMeta(
  version: string = MODERN_REVISION,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_KEY]: version,
    [CLIENT_INFO_KEY]: { name: 'kiln-contract-tests', version: '0' },
    [CLIENT_CAPABILITIES_KEY]: {},
    ...overrides,
  };
}

export type JsonRpcError = { code: number; message: string; data?: unknown };
export type JsonRpcMessage = {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: JsonRpcError;
};

export type StdioServer = {
  pid: number;
  /** Sends a request and resolves with the server's answer, result or error. */
  request(method: string, params?: Record<string, unknown>): Promise<JsonRpcMessage>;
  /** Sends a request and resolves with its id as soon as it is written (for long-lived requests). */
  send(method: string, params?: Record<string, unknown>): number;
  notify(method: string, params?: Record<string, unknown>): void;
  /** Resolves with the next server notification of the given method, including ones already received. */
  notification(method: string, timeoutMs?: number): Promise<JsonRpcMessage>;
  notifications: JsonRpcMessage[];
  stderr(): string;
  /** Closes stdin and resolves when the process exits, with the time that took. */
  close(): Promise<{ code: number | null; signal: NodeJS.Signals | null; ms: number }>;
  kill(): void;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

export type StartOptions = {
  cwd: string;
  env?: Record<string, string>;
  args?: string[];
  bundle?: string;
};

/**
 * Launches `node dist/mcp-server.mjs` the way a harness does. The environment
 * is the caller's, with `KILN_RENDER=cpu` so nothing here depends on a GPU, and
 * with workspace, project and program store pinned to the test directory unless
 * the caller overrides them.
 */
export function startStdioServer(options: StartOptions): Promise<StdioServer> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    KILN_RENDER: 'cpu',
    KILN_WORKSPACE: '',
    KILN_PROJECT: '',
    KILN_PROGRAM_STORE: join(options.cwd, '.kiln', 'programs'),
    KILN_BUILD_CACHE: 'memory',
    KILN_EVALUATOR_MODE: 'in-process',
    ...options.env,
  };
  const child: ChildProcess = spawn(
    'node',
    [options.bundle ?? SERVER_BUNDLE, ...(options.args ?? [])],
    {
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let errors = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    errors += chunk;
  });
  const waiting = new Map<number, (message: JsonRpcMessage) => void>();
  const notifications: JsonRpcMessage[] = [];
  const notificationWaiters: { method: string; resolve: (message: JsonRpcMessage) => void }[] = [];
  let nextId = 1;
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
    child.on('exit', (code, signal) => {
      done({ code, signal });
      for (const resolve of waiting.values()) {
        resolve({
          jsonrpc: '2.0',
          error: {
            code: -1,
            message: `server exited (code ${code}, signal ${signal}) before answering; stderr: ${errors}`,
          },
        });
      }
      waiting.clear();
    });
  });
  createInterface({ input: child.stdout!, crlfDelay: Infinity }).on('line', (line) => {
    if (!line.trim()) return;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      errors += `\n[non-JSON stdout line] ${line}`;
      return;
    }
    if (message.id !== undefined && message.method === undefined) {
      const resolve = waiting.get(message.id as number);
      if (resolve) {
        waiting.delete(message.id as number);
        resolve(message);
      }
      return;
    }
    if (message.method !== undefined && message.id === undefined) {
      notifications.push(message);
      const index = notificationWaiters.findIndex((w) => w.method === message.method);
      if (index >= 0) notificationWaiters.splice(index, 1)[0]!.resolve(message);
    }
  });
  const write = (message: Record<string, unknown>) => {
    child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  };
  const send = (method: string, params?: Record<string, unknown>) => {
    const id = nextId++;
    write({ id, method, ...(params === undefined ? {} : { params }) });
    return id;
  };
  const server: StdioServer = {
    pid: child.pid ?? -1,
    request: (method, params) =>
      new Promise<JsonRpcMessage>((resolve) => {
        const id = nextId++;
        waiting.set(id, resolve);
        write({ id, method, ...(params === undefined ? {} : { params }) });
      }),
    send,
    notify: (method, params) => write({ method, ...(params === undefined ? {} : { params }) }),
    notification: (method, timeoutMs = 10_000) => {
      const seen = notifications.find((n) => n.method === method);
      if (seen) return Promise.resolve(seen);
      return new Promise<JsonRpcMessage>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(`no ${method} notification within ${timeoutMs} ms; stderr: ${errors}`),
            ),
          timeoutMs,
        );
        notificationWaiters.push({
          method,
          resolve: (message) => {
            clearTimeout(timer);
            resolve(message);
          },
        });
      });
    },
    notifications,
    stderr: () => errors,
    close: async () => {
      const started = performance.now();
      child.stdin!.end();
      const outcome = await exited;
      return { ...outcome, ms: Math.round(performance.now() - started) };
    },
    kill: () => {
      child.kill();
    },
    exited,
  };
  return new Promise((resolve, reject) => {
    child.once('spawn', () => resolve(server));
    child.once('error', reject);
  });
}

/** The text block of a tool result, parsed as JSON. */
export function resultJson(message: JsonRpcMessage): Record<string, unknown> {
  const content = (message.result?.['content'] ?? []) as { type: string; text?: string }[];
  const text = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n');
  if (!text) throw new Error(`no text block in ${JSON.stringify(message)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

/** A tiny program every tool accepts: one box on the ground. */
export const CUBE_PROGRAM =
  "const meta = { name: 'ContractCube', category: 'prop' };\n" +
  "function build() {\n  const root = createRoot('ContractCube');\n" +
  "  createPart('Body', boxGeo(1, 1, 1), gameMaterial(0x808080), { position: [0, 0.5, 0], parent: root });\n" +
  '  return root;\n}\n';
