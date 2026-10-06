import { EXECUTION_PROFILES, type ExecutionKind } from './execution-profiles';

type FailureCode =
  | 'INPUT_INVALID'
  | 'JOB_ALREADY_USED'
  | 'ISOLATION_UNAVAILABLE'
  | 'WORKER_FAILED'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'DEADLINE_EXCEEDED'
  | 'CANCELLED'
  | 'CLEANUP_FAILED';

export class ContainerJobFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}

interface JobRecord {
  state: 'running' | 'finished';
  deadlineAt: number;
  cancelled?: boolean;
  outcome?: FailureCode | 'completed';
}

/** Private host limits, deliberately below the engine protocol's general limits. */
const STDERR_BYTES = 16 * 1024;
const CLEANUP_MS = 5_000;

function boundedInteger(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= max;
}

async function capture(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  check: () => void,
) {
  if (!stream) throw new ContainerJobFailure('WORKER_FAILED');
  const reader = stream.getReader();
  // Tiny chunks must not turn a byte allowance into an unbounded array of objects.
  const bytes = new Uint8Array(limit);
  let size = 0;
  try {
    for (;;) {
      check();
      const { value, done } = await reader.read();
      check();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new ContainerJobFailure('WORKER_FAILED');
      if (size + value.byteLength > limit) throw new ContainerJobFailure('OUTPUT_LIMIT_EXCEEDED');
      bytes.set(value, size);
      size += value.byteLength;
    }
    return bytes.slice(0, size);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function destroyContainer(container: Container): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await container.destroy();
        // Keep the watchdog and suppress output unless the provider confirms
        // destruction. Inspection shares the cleanup deadline, including errors
        // and a hung readback; a successful destroy acknowledgement alone is
        // insufficient to release admission for an unconfirmed VM.
        const remaining = await container.inspect();
        if (container.running || remaining !== null)
          throw new ContainerJobFailure('CLEANUP_FAILED');
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ContainerJobFailure('CLEANUP_FAILED')), CLEANUP_MS);
      }),
    ]);
  } catch {
    throw new ContainerJobFailure('CLEANUP_FAILED');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * One private Durable Object per job. Bytes returned here remain untrusted;
 * the caller must validate the engine's versioned evaluator response.
 * Unit tests cover orchestration, not the provider's isolation guarantees.
 */
class ContainerExecutionJob {
  private readonly cancellation = new AbortController();
  private activeRun?: Promise<Uint8Array>;
  private cancellationWork?: Promise<void>;

  constructor(
    private readonly context: Pick<DurableObjectState, 'container' | 'storage'>,
    private readonly kind: ExecutionKind,
  ) {}

  run(
    request: Uint8Array,
    controls: { deadlineMs: number; maxResponseBytes: number; signal?: AbortSignal },
  ): Promise<Uint8Array> {
    if (this.activeRun) return Promise.reject(new ContainerJobFailure('JOB_ALREADY_USED'));
    const pending = this.runOnce(request, {
      ...controls,
      signal: controls.signal
        ? AbortSignal.any([controls.signal, this.cancellation.signal])
        : this.cancellation.signal,
    });
    this.activeRun = pending;
    const finished = () => {
      if (this.activeRun === pending) this.activeRun = undefined;
    };
    void pending.then(finished, finished);
    return pending;
  }

  /**
   * Private parent-controller RPC: fence even an as-yet-undelivered child request.
   * Keep one controller per DO instance so cancellation reaches a pending claim
   * before it can start compute. Durable state protects subsequent incarnations.
   * Success means no child VM remains; failure must retain outer admission.
   */
  cancel(): Promise<void> {
    if (this.cancellationWork) return this.cancellationWork;
    const pending = this.cancelOnce().catch(() => {
      throw new ContainerJobFailure('CLEANUP_FAILED');
    });
    this.cancellationWork = pending;
    const finished = () => {
      if (this.cancellationWork === pending) this.cancellationWork = undefined;
    };
    void pending.then(finished, finished);
    return pending;
  }

  private async cancelOnce(): Promise<void> {
    this.cancellation.abort();
    await this.context.storage.transaction(async (transaction) => {
      const job = await transaction.get<JobRecord>('job');
      if (job?.state === 'finished') return;
      if (!job) {
        // A VM is never started before its durable record exists. This tombstone
        // denies a request still in transport, including after this DO is evicted.
        await transaction.put('job', {
          state: 'finished',
          deadlineAt: Date.now(),
          outcome: 'CANCELLED',
        } satisfies JobRecord);
        return;
      }
      await transaction.put('job', { ...job, cancelled: true } satisfies JobRecord);
      await transaction.setAlarm(Date.now());
    });
    // A live run owns its cleanup. Do not race its pending startup with a separate
    // destruction and then return success while that run can still resume.
    await this.activeRun?.catch(() => {});
    const job = await this.context.storage.get<JobRecord>('job');
    if (job?.state === 'running') await this.recover(job);
  }

  private async runOnce(
    request: Uint8Array,
    controls: { deadlineMs: number; maxResponseBytes: number; signal?: AbortSignal },
  ): Promise<Uint8Array> {
    const container = this.context.container;
    if (!container) throw new ContainerJobFailure('ISOLATION_UNAVAILABLE');
    const profile = EXECUTION_PROFILES[this.kind];
    const image = container.images[profile.image];
    if (
      typeof image !== 'string' ||
      image.length > 512 ||
      !/^[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}$/.test(image) ||
      !(request instanceof Uint8Array) ||
      request.byteLength === 0 ||
      request.byteLength > profile.requestBytes ||
      !boundedInteger(controls.deadlineMs, profile.deadlineMs) ||
      !boundedInteger(controls.maxResponseBytes, profile.responseBytes)
    )
      throw new ContainerJobFailure('INPUT_INVALID');
    if (controls.signal?.aborted) throw new ContainerJobFailure('CANCELLED');

    const job: JobRecord = { state: 'running', deadlineAt: Date.now() + controls.deadlineMs };
    // Persist the watchdog before starting compute. Never reuse a completed ID.
    // Another request's failed claim must not destroy the first request's VM.
    const admitted = await this.context.storage.transaction(async (transaction) => {
      if (await transaction.get('job')) return false;
      await transaction.put('job', job);
      await transaction.setAlarm(job.deadlineAt);
      return true;
    });
    if (!admitted) throw new ContainerJobFailure('JOB_ALREADY_USED');

    let failure: ContainerJobFailure | undefined;
    let closing = false;
    let rejectStopped: (error: ContainerJobFailure) => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      rejectStopped = reject;
    });
    void stopped.catch(() => {});
    const stop = (code: FailureCode) => {
      if (closing || failure) return;
      failure = new ContainerJobFailure(code);
      rejectStopped(failure);
    };
    const check = () => {
      if (failure) throw failure;
      if (closing) throw new ContainerJobFailure('WORKER_FAILED');
      if (Date.now() >= job.deadlineAt) {
        stop('DEADLINE_EXCEEDED');
        throw failure;
      }
    };
    const onAbort = () => stop('CANCELLED');
    controls.signal?.addEventListener('abort', onAbort, { once: true });
    if (controls.signal?.aborted) onAbort();
    const timer = setTimeout(
      () => stop('DEADLINE_EXCEEDED'),
      Math.max(0, job.deadlineAt - Date.now()),
    );

    try {
      const execute = async () => {
        check();
        if (container.running) throw new ContainerJobFailure('ISOLATION_UNAVAILABLE');
        container.start({
          image,
          enableInternet: false,
          instance: 'standard-2',
          entrypoint: ['/usr/bin/sleep', 'infinity'],
          env: {},
        });
        void container.monitor().then(
          () => stop('WORKER_FAILED'),
          () => stop('WORKER_FAILED'),
        );
        // A fallback for abandoned requests, never a substitute for the watchdog.
        await container.setInactivityTimeout(120_000);
        check();
        const process = await container.exec(['/usr/local/bin/node', profile.entry], {
          // Native exec requires numeric uid:gid; the pinned image's node user
          // is 1000:1000. This selects file ownership, not an isolation boundary.
          user: '1000:1000',
          env: profile.env,
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'pipe',
        });
        check();
        const observed = await container.inspect();
        check();
        if (observed?.image !== image) throw new ContainerJobFailure('ISOLATION_UNAVAILABLE');
        if (!process.stdin) throw new ContainerJobFailure('WORKER_FAILED');
        const write = async () => {
          const writer = process.stdin!.getWriter();
          try {
            await writer.write(request);
            await writer.close();
          } finally {
            writer.releaseLock();
          }
        };
        const [, stdout, , exitCode] = await Promise.all([
          write(),
          capture(process.stdout, controls.maxResponseBytes, check),
          capture(process.stderr, STDERR_BYTES, check),
          process.exitCode,
        ]);
        check();
        if (exitCode !== 0 || stdout.byteLength === 0)
          throw new ContainerJobFailure('WORKER_FAILED');
        return stdout;
      };
      return await Promise.race([execute(), stopped]);
    } catch (error) {
      failure =
        error instanceof ContainerJobFailure ? error : new ContainerJobFailure('WORKER_FAILED');
      throw failure;
    } finally {
      closing = true;
      clearTimeout(timer);
      controls.signal?.removeEventListener('abort', onAbort);
      // A process kill can leave children running. Wait for destruction of the VM
      // before accepting output or releasing its admission reservation.
      await destroyContainer(container);
      await this.context.storage.put('job', {
        ...job,
        state: 'finished',
        outcome: failure?.code ?? 'completed',
      } satisfies JobRecord);
      await this.context.storage.deleteAlarm();
    }
  }

  async alarm(): Promise<void> {
    const job = await this.context.storage.get<JobRecord>('job');
    if (!job || job.state === 'finished') {
      await this.context.storage.deleteAlarm();
      return;
    }
    // Coalesce an at-least-once alarm with a live parent cancellation instead of
    // starting a second cleanup while the run still owns its destruction.
    if (job.cancelled) return this.cancel();
    if (Date.now() < job.deadlineAt) {
      await this.context.storage.setAlarm(job.deadlineAt);
      return;
    }
    await this.recover(job);
  }

  private async recover(job: JobRecord): Promise<void> {
    const container = this.context.container;
    if (!container) throw new ContainerJobFailure('ISOLATION_UNAVAILABLE');
    try {
      await destroyContainer(container);
      await this.context.storage.put('job', {
        ...job,
        state: 'finished',
        outcome: job.cancelled ? 'CANCELLED' : 'DEADLINE_EXCEEDED',
      } satisfies JobRecord);
      await this.context.storage.deleteAlarm();
    } catch {
      await this.context.storage.setAlarm(Date.now() + 30_000);
      throw new ContainerJobFailure('CLEANUP_FAILED');
    }
  }
}

export class ContainerEvaluationJob extends ContainerExecutionJob {
  constructor(context: Pick<DurableObjectState, 'container' | 'storage'>) {
    super(context, 'evaluation');
  }
}

export class ContainerRenderJob extends ContainerExecutionJob {
  constructor(context: Pick<DurableObjectState, 'container' | 'storage'>) {
    super(context, 'render');
  }
}
