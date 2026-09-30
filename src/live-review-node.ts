/** Bounded host observations. Storage and browser availability never gate authoring. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  lstat,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
  realpath,
} from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { z } from 'zod';
import type { LiveFile, LiveOperation, LiveReviewPort, LiveSnapshot } from './live-review';
import type { RenderResult } from './render';
import { ASSET_LIMIT, validateAssetGlb } from './assets';

const operationPattern = /^op_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const filePattern = /^(asset\.glb|source\.kiln\.js|evaluation\.json|capture-\d{1,2}\.png)$/;
const hash = (value: string | Uint8Array) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;
const metadataLimit = 256 * 1024;
const evaluationLimit = 2 * 1024 * 1024;
const staleMs = 120000;
const terminal = (op: LiveOperation) => !['running', 'evaluated'].includes(op.status);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const collision = (error: unknown) => (error as NodeJS.ErrnoException).code === 'EEXIST';
const fileLimit = (name: string) =>
  name === 'asset.glb'
    ? ASSET_LIMIT
    : name === 'source.kiln.js'
      ? 1024 * 1024
      : name === 'evaluation.json'
        ? evaluationLimit
        : 16 * 1024 * 1024;
const descriptorSchema = z
  .object({
    name: z.string().regex(filePattern),
    bytes: z.number().int().nonnegative().max(ASSET_LIMIT),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    url: z.string().max(200),
  })
  .strict();
const operationSchema = z
  .object({
    version: z.literal('kiln.live.v1'),
    operationId: z.string().regex(operationPattern),
    revision: z.number().int().nonnegative(),
    tool: z.string().min(1).max(120),
    transport: z.enum(['cli', 'mcp', 'native', 'api']),
    sessionId: z.string().uuid(),
    workId: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,79}$/)
      .optional(),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum(['running', 'evaluated', 'complete', 'failed', 'interrupted', 'unknown']),
    projectId: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,79}$/)
      .optional(),
    projectRevision: z.string().min(1).max(200).optional(),
    programRef: z.string().min(1).max(200).optional(),
    runtimeIdentity: z.string().min(1).max(200).optional(),
    artifact: descriptorSchema.optional(),
    captures: z.array(descriptorSchema).max(100),
    viewFidelity: z.unknown().optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    error: z.string().max(4000).optional(),
    pinned: z.boolean(),
    phases: z
      .array(z.object({ phase: z.string().max(100), at: z.string().datetime() }).strict())
      .max(32),
    observationIssues: z.array(z.string().max(500)).max(20).optional(),
  })
  .strict();
const stateSchema = z
  .object({
    operation: operationSchema,
    files: z.record(z.string(), descriptorSchema),
    ownerPid: z.number().int().nonnegative().optional(),
    heartbeatAt: z.string().datetime().optional(),
  })
  .strict();
interface OperationState {
  operation: LiveOperation;
  files: Record<string, LiveFile>;
  ownerPid?: number;
  heartbeatAt?: string;
}
interface Job {
  state: OperationState;
  blobs: Record<string, Uint8Array>;
  bytes: number;
}
export interface LiveReviewObserver {
  begin?(tool: string, input: unknown): unknown;
  finish?(output: unknown, error?: unknown): unknown;
  artifact?(code: string, rendered: RenderResult): unknown;
}
function notify(run: () => unknown) {
  try {
    void Promise.resolve(run()).catch(() => {});
  } catch {
    /* Optional observation. */
  }
}
export async function observeTool<T>(
  observer: LiveReviewObserver,
  tool: string,
  input: unknown,
  run: () => Promise<T>,
): Promise<T> {
  notify(() => observer.begin?.(tool, input));
  try {
    const result = await run();
    notify(() => observer.finish?.(result));
    return result;
  } catch (error) {
    notify(() => observer.finish?.(undefined, error));
    throw error;
  }
}
function issue(state: OperationState, message: string) {
  state.operation.observationIssues ??= [];
  const issues = state.operation.observationIssues;
  const bounded = message.slice(0, 500);
  if (!issues.includes(bounded) && issues.length < 20) issues.push(bounded);
}
function jsonValue(value: unknown, maxBytes: number): unknown {
  let count = 0;
  const inspect = (item: unknown, depth: number) => {
    if (++count > 20000 || depth > 24)
      throw new Error('Observation JSON exceeds structural bounds');
    if (item && typeof item === 'object') {
      for (const child of Object.values(item)) inspect(child, depth + 1);
    } else if (typeof item === 'number' && !Number.isFinite(item))
      throw new Error('Non-finite observation value');
  };
  inspect(value, 0);
  const text = JSON.stringify(value);
  if (!text || Buffer.byteLength(text) > maxBytes)
    throw new Error('Observation JSON exceeds byte bounds');
  return JSON.parse(text);
}
/** Optional detail cannot evict the measurements and acceptance needed by the live UI. */
function resultSummary(state: OperationState, result: Record<string, unknown>) {
  const summary: Record<string, unknown> = {};
  const add = (key: string, value: unknown, limit = 4096) => {
    if (value === undefined) return;
    try {
      const bounded = jsonValue(value, limit);
      if (Buffer.byteLength(JSON.stringify({ ...summary, [key]: bounded })) > 32768)
        throw new Error('Summary is full');
      summary[key] = bounded;
    } catch {
      issue(state, `Result summary ${key} details were omitted: invalid or oversized metadata.`);
    }
  };
  for (const key of ['ok', 'tris', 'meshes', 'materials', 'bounds', 'artifactGlbSha256'])
    add(key, result[key]);
  if (result.qaReport !== undefined) {
    try {
      add('qaReport', jsonValue(result.qaReport, 8192), 8192);
    } catch {
      const full = result.qaReport;
      if (full && typeof full === 'object' && !Array.isArray(full)) {
        const report = full as Record<string, unknown>;
        const compact: Record<string, unknown> = { detailsOmitted: true };
        for (const key of [
          'kind',
          'schemaVersion',
          'category',
          'qaProfile',
          'policyHash',
          'adviceHash',
          'acceptance',
          'disposition',
        ]) {
          try {
            if (report[key] !== undefined) compact[key] = jsonValue(report[key], 512);
          } catch {
            // A malformed optional field cannot discard a valid acceptance field.
          }
        }
        const dimensions = report.dimensions;
        if (dimensions && typeof dimensions === 'object' && !Array.isArray(dimensions)) {
          const compactDimensions: Record<string, unknown> = {};
          for (const key of [
            'exportIntegrity',
            'categoryReadiness',
            'requirementReadiness',
            'promptAlignment',
            'visualQuality',
            'runtimeCost',
          ]) {
            const dimension = (dimensions as Record<string, unknown>)[key];
            if (!dimension || typeof dimension !== 'object') continue;
            const detail = dimension as Record<string, unknown>;
            try {
              compactDimensions[key] = {
                status: jsonValue(detail.status, 128),
                ...(Array.isArray(detail.findings)
                  ? { findingsOmitted: detail.findings.length }
                  : {}),
              };
            } catch {
              // Unknown dimension metadata is detail, not inferred acceptance.
            }
          }
          compact.dimensions = compactDimensions;
        }
        for (const key of ['rules', 'unevaluatedRequirements'])
          if (Array.isArray(report[key])) compact[`${key}Omitted`] = report[key].length;
        add('qaReport', compact, 8192);
      }
      issue(state, 'QA summary details were omitted; recorded acceptance is unchanged.');
    }
  }
  for (const key of ['requirements', 'capture', 'buildCache']) add(key, result[key]);
  if (Array.isArray(result.warnings)) {
    try {
      add('warnings', jsonValue(result.warnings, 8192), 8192);
      return summary;
    } catch {
      // Ordinary bounded warning lists remain exact; compact only oversized lists.
    }
    const warnings: unknown[] = [];
    let truncated = false;
    for (const warning of result.warnings.slice(0, 32)) {
      try {
        const value = typeof warning === 'string' ? warning.slice(0, 512) : jsonValue(warning, 512);
        if (value !== warning && typeof warning === 'string') truncated = true;
        if (Buffer.byteLength(JSON.stringify([...warnings, value])) > 8192) break;
        warnings.push(value);
      } catch {
        truncated = true;
      }
    }
    const omitted = result.warnings.length - warnings.length;
    add('warnings', warnings, 8192);
    if (omitted) add('warningsOmitted', omitted);
    if (omitted || truncated)
      issue(
        state,
        'Result warning details were truncated; evaluation.json, when retained, contains full build details.',
      );
  } else add('warnings', result.warnings, 8192);
  return summary;
}
function dead(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

export class FileLiveReview implements LiveReviewPort {
  readonly directory: string;
  readonly sessionId = randomUUID();
  private readonly workspace: string;
  private readonly current = new AsyncLocalStorage<OperationState>();
  private readonly queue = new Map<string, Job>();
  private pending?: Promise<void>;
  private queuedBytes = 0;
  private maxOperations: number;
  private maxBytes: number;
  private readonly maxQueuedBytes: number;
  private readonly transport: LiveOperation['transport'];
  private readonly workId?: string;
  private readonly issues: string[] = [];
  private readonly storedSizes = new WeakMap<OperationState, number>();
  private unreportedIssues: string[] = [];
  constructor(
    workspace: string,
    options: {
      maxOperations?: number;
      maxBytes?: number;
      maxQueuedBytes?: number;
      transport?: LiveOperation['transport'];
      workId?: string;
    } = {},
  ) {
    this.workspace = resolve(workspace);
    this.directory = join(this.workspace, '.kiln', 'review');
    this.maxOperations = options.maxOperations ?? 200;
    this.maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
    this.maxQueuedBytes = options.maxQueuedBytes ?? 128 * 1024 * 1024;
    this.transport = options.transport ?? 'api';
    this.workId = options.workId;
    if (this.workId !== undefined && !/^[a-z][a-z0-9_-]{0,79}$/.test(this.workId))
      throw new Error('Invalid work item ID');
    if (
      !Number.isSafeInteger(this.maxOperations) ||
      this.maxOperations < 2 ||
      this.maxOperations > 2000 ||
      !Number.isSafeInteger(this.maxBytes) ||
      this.maxBytes < 1024 ||
      this.maxBytes > 1024 ** 3 ||
      !Number.isSafeInteger(this.maxQueuedBytes) ||
      this.maxQueuedBytes < 1024 ||
      this.maxQueuedBytes > 512 * 1024 * 1024 ||
      !['cli', 'mcp', 'native', 'api'].includes(this.transport)
    )
      throw new Error('Invalid live retention limits');
  }
  private report(message: string) {
    const text = message.slice(0, 500);
    if (!this.issues.includes(text)) this.issues.push(text);
    if (!this.unreportedIssues.includes(text)) this.unreportedIssues.push(text);
    this.issues.splice(0, Math.max(0, this.issues.length - 20));
    this.unreportedIssues.splice(0, Math.max(0, this.unreportedIssues.length - 20));
  }
  private path(operationId: string, file?: string) {
    if (!operationPattern.test(operationId)) throw new Error('Invalid operation ID');
    return join(this.directory, operationId, ...(file ? [file] : []));
  }
  private async root(create = false) {
    if (create) await mkdir(this.workspace, { recursive: true });
    const canonical = await realpath(this.workspace);
    let path = this.workspace;
    for (const part of ['.kiln', 'review']) {
      path = join(path, part);
      if (create)
        await mkdir(path).catch((error: unknown) => {
          if (!collision(error)) throw error;
        });
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe live directory');
      const rel = relative(canonical, await realpath(path));
      if (rel === '..' || rel.startsWith(`..${sep}`))
        throw new Error('Live directory escapes workspace');
    }
  }
  private async boundedFile(path: string, limit: number): Promise<Uint8Array> {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > limit)
      throw new Error('Invalid live file');
    const data = new Uint8Array(await readFile(path));
    if (data.length !== info.size || data.length > limit)
      throw new Error('Live file changed while reading');
    return data;
  }
  private async atomic(path: string, bytes: string | Uint8Array) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!missing(error)) throw error;
      });
    }
  }
  /** Immutable lock generations avoid deleting a replacement lock during dead-owner recovery. */
  private async locked<T>(run: () => Promise<T>): Promise<T> {
    await this.root(true);
    const token = randomUUID();
    const directory = join(this.directory, '.locks');
    await mkdir(directory).catch((error: unknown) => {
      if (!collision(error)) throw error;
    });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe live lock directory');
    const candidate = join(directory, `.candidate-${process.pid}-${token}.tmp`);
    const owner = JSON.stringify({ pid: process.pid, token });
    await writeFile(candidate, owner, { flag: 'wx', mode: 0o600 });
    const generations = async () =>
      (await readdir(directory)).filter((name) => /^[0-9]{16}\.lock$/.test(name)).sort();
    const deadline = Date.now() + 3000;
    let acquired: string | undefined;
    try {
      while (!acquired) {
        if (Date.now() >= deadline)
          throw new Error('Live review storage is busy; observation was not persisted');
        const names = await generations();
        const latest = names.at(-1);
        const sequence = latest ? Number(latest.slice(0, 16)) + 1 : 1;
        if (!Number.isSafeInteger(sequence)) throw new Error('Live lock generation exhausted');
        if (latest) {
          try {
            const prior = z
              .object({ pid: z.number().int().positive(), token: z.string().uuid() })
              .strict()
              .parse(
                JSON.parse(
                  new TextDecoder().decode(await this.boundedFile(join(directory, latest), 1024)),
                ),
              );
            const released = await lstat(join(directory, `${latest}.released`))
              .then((entry) => {
                if (!entry.isFile() || entry.isSymbolicLink() || entry.size !== 0)
                  throw new Error('Invalid lock release');
                return true;
              })
              .catch((error: unknown) => {
                if (missing(error)) return false;
                throw error;
              });
            if (!released && !dead(prior.pid)) {
              await new Promise((resolve) => setTimeout(resolve, 10));
              continue;
            }
          } catch (error) {
            if (missing(error)) continue;
            throw error;
          }
        }
        const name = `${String(sequence).padStart(16, '0')}.lock`;
        try {
          await link(candidate, join(directory, name));
          // A slow reader may have seen an old, already pruned generation. It must
          // not acquire an obsolete slot while a newer owner is active.
          if ((await generations()).at(-1) !== name) {
            await unlink(join(directory, name));
            continue;
          }
          acquired = name;
        } catch (error) {
          if (!collision(error)) throw error;
        }
      }
      for (const name of (await generations()).slice(0, -3)) {
        await unlink(join(directory, name));
        await unlink(join(directory, `${name}.released`)).catch((error: unknown) => {
          if (!missing(error)) throw error;
        });
      }
      for (const name of await readdir(directory)) {
        const match = /^\.candidate-([0-9]+)-[a-f0-9-]+\.tmp$/.exec(name);
        if (match && dead(Number(match[1]))) await unlink(join(directory, name)).catch(() => {});
      }
      await this.limits(true);
      return await run();
    } finally {
      if (acquired)
        await writeFile(join(directory, `${acquired}.released`), '', { flag: 'wx', mode: 0o600 });
      await unlink(candidate).catch(() => {});
    }
  }
  private async limits(create = false) {
    const path = join(this.directory, 'limits.json');
    try {
      const value = JSON.parse(new TextDecoder().decode(await this.boundedFile(path, 1024)));
      const parsed = z
        .object({
          maxOperations: z.number().int().min(2).max(2000),
          maxBytes: z
            .number()
            .int()
            .min(1024)
            .max(1024 ** 3),
        })
        .strict()
        .parse(value);
      this.maxOperations = parsed.maxOperations;
      this.maxBytes = parsed.maxBytes;
    } catch (error) {
      if (!missing(error)) throw error;
      if (create)
        await this.atomic(
          path,
          JSON.stringify({ maxOperations: this.maxOperations, maxBytes: this.maxBytes }),
        );
    }
  }
  private strip(state: OperationState, names: string[], reason: string) {
    for (const name of names) delete state.files[name];
    if (state.operation.artifact && names.includes(state.operation.artifact.name))
      delete state.operation.artifact;
    state.operation.captures = state.operation.captures.filter(
      (file) => !names.includes(file.name),
    );
    issue(state, reason);
  }
  private schedule(state: OperationState, blobs: Record<string, Uint8Array> = {}) {
    const id = state.operation.operationId;
    let previous = this.queue.get(id);
    if (!previous && this.queue.size >= 2000) {
      this.report(`Live observation queue is full; operation ${id} could not be retained.`);
      return;
    }
    const bytes = Object.values(blobs).reduce((sum, value) => sum + value.length, 0);
    if (this.queuedBytes + bytes > this.maxQueuedBytes) {
      this.strip(
        state,
        Object.keys(blobs),
        'Live payload exceeded the queue byte budget; source/artifact/capture evidence was not retained.',
      );
      blobs = {};
    }
    const copied = Object.fromEntries(
      Object.entries(blobs).map(([name, data]) => [name, Uint8Array.from(data)]),
    );
    const added = Object.values(copied).reduce((sum, value) => sum + value.length, 0);
    const snapshot = stateSchema.parse(jsonValue(state, metadataLimit));
    if (previous) {
      previous.state = snapshot;
      for (const [name, data] of Object.entries(copied)) {
        const replaced = previous.blobs[name]?.length ?? 0;
        previous.bytes -= replaced;
        this.queuedBytes -= replaced;
        previous.blobs[name] = data;
      }
      previous.bytes += added;
    } else {
      previous = { state: snapshot, blobs: copied, bytes: added };
      this.queue.set(id, previous);
    }
    this.queuedBytes += added;
    if (!this.pending) this.pending = Promise.resolve().then(() => this.drain());
  }
  private async drain() {
    try {
      while (this.queue.size) {
        const [id, job] = this.queue.entries().next().value!;
        this.queue.delete(id);
        try {
          await this.locked(() => this.persist(job));
        } catch (error) {
          this.report(
            `Live observation ${id} unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          this.queuedBytes -= job.bytes;
        }
      }
      if (this.unreportedIssues.length) {
        const issues = [...this.unreportedIssues];
        try {
          await this.locked(async () => {
            const previous = await this.health();
            await this.atomic(
              join(this.directory, 'health.json'),
              JSON.stringify([...new Set([...previous, ...issues])].slice(-20)),
            );
          });
          this.unreportedIssues = this.unreportedIssues.filter((value) => !issues.includes(value));
        } catch {
          /* snapshot includes in-memory issues when storage itself is unavailable. */
        }
      }
    } finally {
      this.pending = undefined;
      if (this.queue.size) this.pending = this.drain();
    }
  }
  private phase(state: OperationState, status: LiveOperation['status']) {
    state.operation.revision++;
    state.operation.status = status;
    state.operation.updatedAt = new Date().toISOString();
    state.heartbeatAt = state.operation.updatedAt;
    state.operation.phases.push({ phase: status, at: state.operation.updatedAt });
    state.operation.phases = state.operation.phases.slice(-32);
  }
  private file(state: OperationState, name: string, bytes: Uint8Array): LiveFile {
    const record = {
      name,
      bytes: bytes.length,
      sha256: hash(bytes),
      url: `/api/live/${state.operation.operationId}/${name}`,
    };
    state.files[name] = record;
    return record;
  }
  async observe<T>(tool: string, input: unknown, run: () => Promise<T>): Promise<T> {
    if (this.current.getStore()) return run();
    const now = new Date().toISOString();
    const state: OperationState = {
      files: {},
      ownerPid: process.pid,
      heartbeatAt: now,
      operation: {
        version: 'kiln.live.v1',
        operationId: `op_${randomUUID()}`,
        revision: 0,
        tool: String(tool).slice(0, 120) || 'unknown',
        transport: this.transport,
        sessionId: this.sessionId,
        ...(this.workId ? { workId: this.workId } : {}),
        startedAt: now,
        updatedAt: now,
        status: 'running',
        captures: [],
        pinned: false,
        phases: [{ phase: 'running', at: now }],
      },
    };
    try {
      const args = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
      if (typeof args.projectId === 'string' && /^[a-z][a-z0-9_-]{0,79}$/.test(args.projectId))
        state.operation.projectId = args.projectId;
      for (const key of ['projectRevision', 'programRef', 'runtimeIdentity'] as const)
        if (typeof args[key] === 'string' && args[key].length <= 200)
          state.operation[key] = args[key];
    } catch {
      issue(state, 'Invocation metadata was unavailable.');
    }
    return this.current.run(state, async () => {
      const timer = setInterval(
        () =>
          notify(() => {
            state.heartbeatAt = new Date().toISOString();
            this.schedule(state);
          }),
        10000,
      );
      timer.unref();
      try {
        return await observeTool(
          {
            begin: () => this.schedule(state),
            finish: (output, error) => this.finish(state, output, error),
          },
          tool,
          input,
          run,
        );
      } finally {
        clearInterval(timer);
      }
    });
  }
  private finish(state: OperationState, output: unknown, error?: unknown) {
    const result = output && typeof output === 'object' ? (output as Record<string, unknown>) : {};
    this.phase(state, error || result.ok === false ? 'failed' : 'complete');
    if (error || result.error)
      state.operation.error = String(
        error instanceof Error ? error.message : (error ?? result.error),
      ).slice(0, 4000);
    if (typeof result.programRef === 'string')
      state.operation.programRef = result.programRef.slice(0, 200);
    if (result.viewFidelity !== undefined) {
      try {
        state.operation.viewFidelity = jsonValue(result.viewFidelity, 16384);
      } catch {
        issue(state, 'viewFidelity was not retained: invalid or oversized metadata.');
      }
    }
    const blobs: Record<string, Uint8Array> = {};
    const frames = Array.isArray(result.framesBase64)
      ? result.framesBase64
      : typeof result.pngBase64 === 'string'
        ? [result.pngBase64]
        : [];
    let captureBytes = 0;
    if (frames.length > 100)
      issue(state, 'Some captures were not retained: frame count exceeds 100.');
    for (const [index, encoded] of frames.slice(0, 100).entries()) {
      if (typeof encoded === 'string' && encoded.length <= 22 * 1024 * 1024) {
        const name = `capture-${index}.png`;
        // The byte bound must apply before decoding, including frames omitted after
        // the total budget is full. Malformed encoding may overestimate, never admit more.
        const decodedBytes = Buffer.byteLength(encoded, 'base64');
        if (decodedBytes > fileLimit(name) || decodedBytes > 32 * 1024 * 1024 - captureBytes) {
          issue(
            state,
            'Capture was not retained: decoded size exceeds the remaining capture byte budget.',
          );
          continue;
        }
        const bytes = Buffer.from(encoded, 'base64');
        if (
          bytes.length >= 8 &&
          bytes.length <= fileLimit(name) &&
          captureBytes + bytes.length <= 32 * 1024 * 1024 &&
          bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
        ) {
          captureBytes += bytes.length;
          blobs[name] = bytes;
          state.operation.captures.push(this.file(state, name, bytes));
        } else issue(state, 'Capture was not retained: invalid PNG or size.');
      } else issue(state, 'Capture was not retained: encoded size exceeds the limit.');
    }
    state.operation.result = resultSummary(state, result);
    this.schedule(state, blobs);
  }
  artifact(code: string, rendered: RenderResult) {
    const state = this.current.getStore();
    if (!state || state.operation.artifact) return;
    try {
      if (Buffer.byteLength(code) > 1024 * 1024) throw new Error('Source exceeds 1 MiB');
      validateAssetGlb(rendered.glb);
      if (hash(rendered.glb) !== rendered.artifactGlbSha256)
        throw new Error('Artifact hash mismatch');
      const { glb, diagnosticViews: _, ...evaluation } = rendered;
      const metadata = Buffer.from(JSON.stringify(jsonValue(evaluation, evaluationLimit)));
      const source = Buffer.from(code);
      state.operation.programRef = hash(source);
      state.operation.artifact = this.file(state, 'asset.glb', glb);
      this.file(state, 'source.kiln.js', source);
      this.file(state, 'evaluation.json', metadata);
      this.phase(state, 'evaluated');
      this.schedule(state, {
        'asset.glb': glb,
        'source.kiln.js': source,
        'evaluation.json': metadata,
      });
    } catch (error) {
      issue(
        state,
        `Artifact was not retained: ${error instanceof Error ? error.message : String(error)}`,
      );
      notify(() => this.schedule(state));
    }
  }
  async flush() {
    while (this.pending) await this.pending;
  }
  private async record(operationId: string): Promise<OperationState> {
    await this.root();
    const directory = this.path(operationId);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe live directory');
    const raw = JSON.parse(
      new TextDecoder().decode(
        await this.boundedFile(join(directory, 'record.json'), metadataLimit),
      ),
    );
    const state = stateSchema.parse(jsonValue(raw, metadataLimit));
    if (state.operation.operationId !== operationId) throw new Error('Invalid live identity');
    if (Object.keys(state.files).length > 103) throw new Error('Invalid live file inventory');
    for (const [name, file] of Object.entries(state.files))
      if (
        !filePattern.test(name) ||
        file.name !== name ||
        file.bytes > fileLimit(name) ||
        file.url !== `/api/live/${operationId}/${name}`
      )
        throw new Error('Invalid live file descriptor');
    for (const file of [
      ...state.operation.captures,
      ...(state.operation.artifact ? [state.operation.artifact] : []),
    ])
      if (JSON.stringify(state.files[file.name]) !== JSON.stringify(file))
        throw new Error('Live record file inventory mismatch');
    if (
      state.operation.artifact?.name !== undefined &&
      state.operation.artifact.name !== 'asset.glb'
    )
      throw new Error('Invalid artifact descriptor');
    if (state.operation.captures.some((file) => !/^capture-\d{1,2}\.png$/.test(file.name)))
      throw new Error('Invalid capture descriptor');
    state.operation.pinned = await lstat(join(directory, 'pinned'))
      .then((s) => {
        if (!s.isFile() || s.isSymbolicLink()) throw new Error('Invalid live pin');
        return true;
      })
      .catch((error: unknown) => {
        if (missing(error)) return false;
        throw error;
      });
    if (!terminal(state.operation)) {
      if (dead(state.ownerPid)) {
        state.operation.status = 'interrupted';
        issue(state, 'The authoring host process exited before reporting completion.');
      } else if (
        !state.ownerPid ||
        !state.heartbeatAt ||
        Date.now() - Date.parse(state.heartbeatAt) > staleMs
      ) {
        state.operation.status = 'unknown';
        issue(state, 'Host liveness expired; execution state is unknown.');
      }
    }
    let bytes = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new Error('Invalid live directory entry');
      bytes += (await lstat(join(directory, entry.name))).size;
    }
    this.storedSizes.set(state, bytes);
    return state;
  }
  async get(operationId: string): Promise<LiveOperation> {
    return (await this.record(operationId)).operation;
  }
  private async readRecords(operationIds: string[]) {
    const results: PromiseSettledResult<OperationState>[] = [];
    // Bound filesystem work without caching state across calls or writer locks.
    for (let offset = 0; offset < operationIds.length; offset += 8)
      results.push(
        ...(await Promise.allSettled(
          operationIds.slice(offset, offset + 8).map((id) => this.record(id)),
        )),
      );
    return results;
  }
  /** Cleanup is admitted only by the writer-lock path. Read results retain directory order. */
  private async records(cleanup = false): Promise<OperationState[]> {
    try {
      await this.root();
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
    const entries = (await readdir(this.directory, { withFileTypes: true })).filter((entry) =>
      operationPattern.test(entry.name),
    );
    const reads = await this.readRecords(
      entries
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .map((entry) => entry.name),
    );
    const records: OperationState[] = [];
    let index = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        this.report(`Invalid live record directory: ${entry.name}`);
        continue;
      }
      const result = reads[index++]!;
      try {
        if (result.status === 'rejected') throw result.reason;
        records.push(cleanup ? await this.cleanupRecord(result.value) : result.value);
      } catch (error) {
        if (!missing(error)) {
          if (cleanup) this.report(`Invalid live record ${entry.name} requires review.`);
          this.report(
            `Invalid live record ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        } else if (cleanup) {
          await this.remove(entry.name);
          this.report(
            'Removed unpublished live payloads left by an interrupted storage transaction.',
          );
        }
      }
    }
    return records.sort(
      (a, b) =>
        a.operation.startedAt.localeCompare(b.operation.startedAt) ||
        a.operation.operationId.localeCompare(b.operation.operationId),
    );
  }
  private async health(): Promise<string[]> {
    try {
      return z
        .array(z.string().max(500))
        .max(20)
        .parse(
          JSON.parse(
            new TextDecoder().decode(
              await this.boundedFile(join(this.directory, 'health.json'), 16384),
            ),
          ),
        );
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
  }
  private size(state: OperationState) {
    return (
      this.storedSizes.get(state) ??
      Buffer.byteLength(JSON.stringify(state)) +
        Object.values(state.files).reduce((sum, file) => sum + file.bytes, 0) +
        (state.operation.pinned ? 6 : 0)
    );
  }
  /** Called only while holding the writer lock: no valid publish is in flight. */
  private async cleanupRecord(record: OperationState): Promise<OperationState> {
    const id = record.operation.operationId;
    const allowed = new Set(['record.json', 'pinned', ...Object.keys(record.files)]);
    let changed = false;
    for (const file of await readdir(this.path(id), { withFileTypes: true })) {
      if (allowed.has(file.name) || !file.isFile() || file.isSymbolicLink()) continue;
      await unlink(this.path(id, file.name));
      changed = true;
      this.report('Removed unpublished live payloads left by an interrupted storage transaction.');
    }
    // record() accounts for all actual files. Discard its old size after removing orphans.
    return changed ? this.record(id) : record;
  }
  private async cleanup() {
    return this.records(true);
  }
  private async persist(job: Job) {
    const { state, blobs } = job;
    // This validated scan belongs to this lock acquisition only. It includes external pins.
    let records = await this.cleanup();
    const existing = records.find(
      (record) => record.operation.operationId === state.operation.operationId,
    );
    if (existing && existing.operation.revision > state.operation.revision) return;
    state.operation.pinned = existing?.operation.pinned ?? false;
    for (const name of Object.keys(state.files))
      if (!blobs[name] && !existing?.files[name])
        this.strip(
          state,
          [name],
          'Earlier live payload was unavailable; its descriptor was removed.',
        );
    records = records.filter(
      (record) => record.operation.operationId !== state.operation.operationId,
    );
    const protectedBytes = records
      .filter((record) => record.operation.pinned || !terminal(record.operation))
      .reduce((sum, record) => sum + this.size(record), 0);
    if (protectedBytes + this.size(state) > this.maxBytes) {
      const removable = Object.keys(blobs);
      this.strip(
        state,
        removable,
        'Live payload exceeded the shared retention byte budget; metadata was retained.',
      );
      for (const name of removable) delete blobs[name];
    }
    let total = records.reduce((sum, record) => sum + this.size(record), 0) + this.size(state);
    let count = records.length + 1;
    for (const record of records) {
      if (count <= this.maxOperations && total <= this.maxBytes) break;
      if (record.operation.pinned || !terminal(record.operation)) continue;
      await this.remove(record.operation.operationId);
      count--;
      total -= this.size(record);
    }
    if (count > this.maxOperations || total > this.maxBytes) {
      this.report(
        `Live retention is occupied by pinned or active operations; ${state.operation.operationId} could not be retained.`,
      );
      return;
    }
    const directory = this.path(state.operation.operationId);
    await mkdir(directory).catch((error: unknown) => {
      if (!collision(error)) throw error;
    });
    if ((await lstat(directory)).isSymbolicLink()) throw new Error('Unsafe live directory');
    for (const [name, data] of Object.entries(blobs))
      await this.atomic(join(directory, name), data);
    await this.atomic(join(directory, 'record.json'), JSON.stringify(state));
    // Other records cannot change through another writer while this lock is held.
    await this.cleanupRecord(await this.record(state.operation.operationId));
  }
  private async remove(operationId: string) {
    const directory = this.path(operationId);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe live directory');
    await rm(directory, { recursive: true, force: true });
  }
  async snapshot(options: { cursor?: string; projectId?: string } = {}): Promise<LiveSnapshot> {
    await this.limits();
    const all = await this.records();
    const operations = all
      .filter(({ operation }) => !options.projectId || operation.projectId === options.projectId)
      .map((record) => record.operation);
    const issues = [...new Set([...(await this.health()), ...this.issues])].slice(-20);
    const cursor = hash(JSON.stringify({ operations, issues }));
    return {
      cursor,
      unchanged: cursor === options.cursor,
      operations: cursor === options.cursor ? [] : operations,
      retention: {
        maxOperations: this.maxOperations,
        maxBytes: this.maxBytes,
        pinned: all.filter((record) => record.operation.pinned).length,
        bytes: all.reduce((sum, record) => sum + this.size(record), 0),
      },
      ...(issues.length ? { observationIssues: issues } : {}),
    };
  }
  async readFile(operationId: string, name: string): Promise<Uint8Array> {
    if (!filePattern.test(name)) throw new Error('Unknown live file');
    const record = await this.record(operationId);
    const descriptor = record.files[name];
    if (!descriptor) throw new Error('Live file unavailable');
    const bytes = await this.boundedFile(this.path(operationId, name), fileLimit(name));
    if (bytes.length !== descriptor.bytes || hash(bytes) !== descriptor.sha256)
      throw new Error('Live file integrity mismatch');
    return bytes;
  }
  async pin(operationId: string, pinned: boolean) {
    if (typeof pinned !== 'boolean') throw new Error('Invalid pin state');
    await this.locked(async () => {
      const record = await this.record(operationId);
      if (record.operation.pinned === pinned) return;
      const path = this.path(operationId, 'pinned');
      if (pinned) {
        for (const name of Object.keys(record.files)) await this.readFile(operationId, name);
        const pins = (await this.records()).filter((item) => item.operation.pinned);
        if (pins.length >= this.maxOperations - 1)
          throw new Error('Unpin an earlier operation before pinning another');
        if (
          pins.reduce((sum, item) => sum + this.size(item), 0) + this.size(record) + 6 >
          this.maxBytes - 512
        )
          throw new Error('Pinned evidence exceeds the shared byte budget');
        await this.atomic(path, 'pinned');
      } else await unlink(path);
    });
  }
}
