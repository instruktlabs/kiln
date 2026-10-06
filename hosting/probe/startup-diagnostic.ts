const IMAGE = 'cloudflare/debian-trixie';
const DEADLINE_MS = 60_000;
const CLEANUP_MS = 5_000;
const COMMAND = [
  '/usr/local/bin/node',
  '--eval',
  'process.stdout.write(JSON.stringify({version:process.version,uid:process.getuid(),gid:process.getgid()}))',
];

type Operation =
  | 'start'
  | 'monitor'
  | 'inactivity'
  | 'exec'
  | 'inspect'
  | 'output'
  | 'destroy'
  | 'stopped';
type Reason =
  | 'ISOLATION_UNAVAILABLE'
  | 'PREEXISTING_CONTAINER'
  | 'START_FAILED'
  | 'MONITOR_FAILED'
  | 'CONTAINER_EXITED'
  | 'INACTIVITY_FAILED'
  | 'EXEC_FAILED'
  | 'INSPECT_FAILED'
  | 'OUTPUT_FAILED'
  | 'DEADLINE_EXCEEDED'
  | 'CLEANUP_FAILED';
interface Phase {
  operation: Operation;
  event: 'entered' | 'completed' | 'failed';
  elapsedMs: number;
  duringCleanup: boolean;
}
interface StartupRecord {
  state: 'running' | 'finished';
  passed: boolean;
  claimedAt: number;
  deadlineAt: number;
  phases: Phase[];
  cleanupRequired: boolean;
  stopped: boolean;
  reason?: Reason;
  runtime?: { version: string; uid: number; gid: number };
}
class DiagnosticFailure extends Error {
  constructor(readonly reason: Reason) {
    super(reason);
  }
}

function mark(
  record: StartupRecord,
  operation: Operation,
  event: Phase['event'],
  duringCleanup: boolean,
) {
  // Only fixed operation names and numeric timing leave this diagnostic.
  if (record.phases.length < 32)
    record.phases.push({
      operation,
      event,
      elapsedMs: Math.max(0, Date.now() - record.claimedAt),
      duringCleanup,
    });
}

async function boundedOutput(
  stream: ReadableStream<Uint8Array> | null | undefined,
  check: () => void,
) {
  if (!stream) throw new DiagnosticFailure('OUTPUT_FAILED');
  const bytes = new Uint8Array(1024);
  let length = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      check();
      const { value, done } = await reader.read();
      check();
      if (done) return bytes.slice(0, length);
      if (!(value instanceof Uint8Array) || length + value.byteLength > bytes.length)
        throw new DiagnosticFailure('OUTPUT_FAILED');
      bytes.set(value, length);
      length += value.byteLength;
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function cleanup(container: Container | undefined, record: StartupRecord): Promise<boolean> {
  if (!container) {
    record.stopped = true;
    return true;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Date.now() + CLEANUP_MS;
  try {
    await Promise.race([
      (async () => {
        mark(record, 'destroy', 'entered', true);
        await container.destroy();
        if (Date.now() >= deadline) throw new DiagnosticFailure('CLEANUP_FAILED');
        mark(record, 'destroy', 'completed', true);
        mark(record, 'stopped', 'entered', true);
        const info = await container.inspect();
        if (Date.now() >= deadline || container.running || info !== null)
          throw new DiagnosticFailure('CLEANUP_FAILED');
        record.stopped = true;
        mark(record, 'stopped', 'completed', true);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DiagnosticFailure('CLEANUP_FAILED')), CLEANUP_MS);
      }),
    ]);
    return true;
  } catch {
    mark(record, 'stopped', 'failed', true);
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Fixed platform diagnostic only. No source, image, command or run ID is accepted. */
export class ManagedStartupDiagnostic {
  constructor(private readonly context: Pick<DurableObjectState, 'container' | 'storage'>) {}

  async run(): Promise<StartupRecord> {
    const storage = this.context.storage;
    const record: StartupRecord = {
      state: 'running',
      passed: false,
      claimedAt: Date.now(),
      deadlineAt: Date.now() + DEADLINE_MS,
      phases: [],
      cleanupRequired: true,
      stopped: false,
    };
    const claimed = await storage.transaction(async (transaction) => {
      if (await transaction.get('startup')) return false;
      await transaction.put('startup', record);
      await transaction.setAlarm(record.deadlineAt);
      return true;
    });
    if (!claimed) return (await storage.get<StartupRecord>('startup'))!;

    const container = this.context.container;
    let closing = false;
    let reason: Reason | undefined;
    let rejectStopped: (error: DiagnosticFailure) => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      rejectStopped = reject;
    });
    void stopped.catch(() => {});
    const stop = (failure: Reason) => {
      if (closing || reason) return;
      reason = failure;
      rejectStopped(new DiagnosticFailure(failure));
    };
    const check = () => {
      if (closing) throw new DiagnosticFailure('EXEC_FAILED');
      if (Date.now() >= record.deadlineAt) stop('DEADLINE_EXCEEDED');
      if (reason) throw new DiagnosticFailure(reason);
    };
    const step = async <T>(
      operation: Operation,
      failure: Reason,
      action: () => T | Promise<T>,
    ): Promise<T> => {
      check();
      mark(record, operation, 'entered', false);
      try {
        const result = await action();
        check();
        mark(record, operation, 'completed', false);
        return result;
      } catch (error) {
        mark(record, operation, 'failed', closing);
        throw error instanceof DiagnosticFailure ? error : new DiagnosticFailure(failure);
      }
    };
    const timer = setTimeout(
      () => stop('DEADLINE_EXCEEDED'),
      Math.max(0, record.deadlineAt - Date.now()),
    );
    try {
      const execute = async () => {
        if (!container) throw new DiagnosticFailure('ISOLATION_UNAVAILABLE');
        if (container.running) throw new DiagnosticFailure('PREEXISTING_CONTAINER');
        await step('start', 'START_FAILED', () =>
          container.start({
            image: IMAGE,
            instance: 'standard-2',
            enableInternet: false,
            entrypoint: ['sleep', 'infinity'],
            env: {},
          }),
        );
        mark(record, 'monitor', 'entered', false);
        try {
          void container.monitor().then(
            () => {
              mark(record, 'monitor', 'completed', closing);
              stop('CONTAINER_EXITED');
            },
            () => {
              mark(record, 'monitor', 'failed', closing);
              stop('MONITOR_FAILED');
            },
          );
        } catch {
          mark(record, 'monitor', 'failed', false);
          throw new DiagnosticFailure('MONITOR_FAILED');
        }
        await step('inactivity', 'INACTIVITY_FAILED', () =>
          container.setInactivityTimeout(120_000),
        );
        const process = await step('exec', 'EXEC_FAILED', () =>
          container.exec(COMMAND, {
            stdout: 'pipe',
            stderr: 'pipe',
          }),
        );
        await step('inspect', 'INSPECT_FAILED', async () => {
          const observed = await container.inspect();
          if (observed?.image !== IMAGE) throw new DiagnosticFailure('INSPECT_FAILED');
        });
        record.runtime = await step('output', 'OUTPUT_FAILED', async () => {
          const [stdout, stderr, exitCode] = await Promise.all([
            boundedOutput(process.stdout, check),
            boundedOutput(process.stderr, check),
            process.exitCode,
          ]);
          check();
          if (exitCode !== 0 || stderr.byteLength !== 0)
            throw new DiagnosticFailure('OUTPUT_FAILED');
          const value: unknown = JSON.parse(
            new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(stdout),
          );
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new DiagnosticFailure('OUTPUT_FAILED');
          const data = value as Record<string, unknown>;
          if (
            Object.keys(data).sort().join(',') !== 'gid,uid,version' ||
            data.version !== 'v24.20.0' ||
            !Number.isSafeInteger(data.uid) ||
            !Number.isSafeInteger(data.gid) ||
            Number(data.uid) < 0 ||
            Number(data.gid) < 0 ||
            Number(data.uid) > 0xffff_ffff ||
            Number(data.gid) > 0xffff_ffff
          )
            throw new DiagnosticFailure('OUTPUT_FAILED');
          return { version: data.version, uid: Number(data.uid), gid: Number(data.gid) };
        });
      };
      await Promise.race([execute(), stopped]);
    } catch (error) {
      record.reason = error instanceof DiagnosticFailure ? error.reason : 'EXEC_FAILED';
    } finally {
      closing = true;
      clearTimeout(timer);
      record.cleanupRequired = !(await cleanup(container, record));
      if (record.cleanupRequired) record.reason ??= 'CLEANUP_FAILED';
      record.state = 'finished';
      record.passed = record.reason === undefined && record.stopped;
      await storage.put('startup', record);
      if (record.cleanupRequired) await storage.setAlarm(Date.now() + 30_000);
      else await storage.deleteAlarm();
    }
    return structuredClone(record);
  }

  async alarm(): Promise<void> {
    const storage = this.context.storage;
    const record = await storage.get<StartupRecord>('startup');
    if (!record?.cleanupRequired) {
      await storage.deleteAlarm();
      return;
    }
    if (record.state === 'running' && Date.now() < record.deadlineAt) {
      await storage.setAlarm(record.deadlineAt);
      return;
    }
    record.state = 'finished';
    record.passed = false;
    record.reason ??= 'DEADLINE_EXCEEDED';
    record.cleanupRequired = !(await cleanup(this.context.container, record));
    await storage.put('startup', record);
    if (record.cleanupRequired) await storage.setAlarm(Date.now() + 30_000);
    else await storage.deleteAlarm();
  }
}
