import { ContainerEvaluationJob, ContainerJobFailure } from '../src/container-job';
import { engineRequest } from './fixtures';
import { resilienceFixtures } from './resilience-fixtures';
import { observeResilience } from './resilience-observation';
import { checkResilienceResult } from './resilience-result';
import { resilienceCases, type ResilienceCase, type ResilienceResult } from './resilience-run';

export const resilienceImage =
  'registry.cloudflare.com/56adffd40534f7fe110fc661a40bbf53/kiln-evaluation@sha256:84a0fa62bcffa010b9ac1c5f2f0e2cf9045a9cdb6407f621e8049e6a37f9de99';
type Context = Pick<DurableObjectState, 'container' | 'storage'>;
interface ProbeClaim {
  name: ResilienceCase;
  started: number;
}

/** Only fixed test programs and a single deliberate cleanup fault enter this class. */
export class ResilienceExecution {
  constructor(private readonly context: Context) {}

  async run(name: ResilienceCase): Promise<ResilienceResult> {
    if (!resilienceCases.includes(name)) throw new Error('Unknown fixed case');
    const actual = this.context.container;
    if (!actual) return { name, passed: false, reason: 'CONTAINER_UNAVAILABLE' };
    if (actual.images.kiln !== resilienceImage)
      return { name, passed: false, reason: 'IMAGE_UNAVAILABLE' };
    const started = Date.now();
    const claimed = await this.context.storage.transaction(async (transaction) => {
      if (await transaction.get('probe')) return false;
      await transaction.put('probe', { name, started } satisfies ProbeClaim);
      return true;
    });
    if (!claimed) return (await this.read()) ?? { name, passed: false, reason: 'ALREADY_CLAIMED' };
    const abort = new AbortController();
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    let readyAt: number | undefined;
    const observed = observeResilience(
      actual,
      resilienceFixtures[name] ?? '',
      () => {
        readyAt = Date.now();
        if (name === 'native-cancel' || name === 'alarm-recovery')
          cancelTimer = setTimeout(() => abort.abort(), 250);
      },
      name === 'alarm-recovery',
    );
    const deadlineMs = name === 'native-deadline' || name === 'alarm-recovery' ? 15_000 : 60_000;
    let output: Uint8Array | undefined;
    let reason: string | undefined;
    try {
      // The final engine check uses the real image entry without substitution.
      output = await new ContainerEvaluationJob({
        container: name === 'engine-after' ? actual : observed.container,
        storage: this.context.storage,
      }).run(name === 'engine-after' ? engineRequest : new TextEncoder().encode('{}'), {
        deadlineMs,
        maxResponseBytes:
          name === 'stdout-flood' ? 1024 : name === 'software-views' ? 512 * 1024 : 64 * 1024,
        signal: abort.signal,
      });
    } catch (error) {
      reason = error instanceof ContainerJobFailure ? error.code : 'CHECK_FAILED';
    } finally {
      if (cancelTimer !== undefined) clearTimeout(cancelTimer);
    }
    const job = await this.context.storage.get<{ state: string }>('job');
    // Production controller marks finished only after bounded destroy+inspection.
    const stopped = job?.state === 'finished' && !actual.running;
    const common = {
      image: resilienceImage,
      elapsedMs: Date.now() - started,
      ready: observed.ready(),
      readyAfterMs: readyAt === undefined ? undefined : readyAt - started,
      exitCode: observed.exitCode(),
    };
    let result: ResilienceResult;
    if (
      name === 'alarm-recovery' &&
      reason === 'CLEANUP_FAILED' &&
      actual.running &&
      observed.ready() &&
      job?.state === 'running'
    ) {
      result = {
        name,
        passed: false,
        stopped: false,
        pendingAlarm: true,
        reason: 'AWAITING_DURABLE_ALARM',
        ...common,
      };
    } else {
      result = {
        ...(await checkResilienceResult({
          name,
          stopped,
          ready: observed.ready(),
          reason,
          output,
        })),
        ...common,
      };
      // A startup timeout must not masquerade as sustained native-loop evidence.
      if (
        name === 'native-deadline' &&
        (readyAt === undefined || readyAt - started > deadlineMs - 1000)
      )
        result.passed = false;
    }
    await this.context.storage.put('probeResult', result);
    return result;
  }

  read() {
    return this.context.storage.get<ResilienceResult>('probeResult');
  }

  async alarm(): Promise<void> {
    await new ContainerEvaluationJob(this.context).alarm();
    const [claim, result, job] = await Promise.all([
      this.context.storage.get<ProbeClaim>('probe'),
      this.read(),
      this.context.storage.get<{ state: string; outcome: string }>('job'),
    ]);
    if (claim?.name !== 'alarm-recovery' || !result?.pendingAlarm || job?.state !== 'finished')
      return;
    const passed =
      job.outcome === 'DEADLINE_EXCEEDED' &&
      !this.context.container?.running &&
      result.ready === true;
    await this.context.storage.put('probeResult', {
      ...result,
      passed,
      stopped: !this.context.container?.running,
      pendingAlarm: false,
      reason: passed ? 'ALARM_RECOVERED' : 'RECOVERY_FAILED',
      elapsedMs: Date.now() - claim.started,
    } satisfies ResilienceResult);
  }

  /** Teardown after observation expires. It can never turn failed recovery into a pass. */
  async stopUnconfirmed(): Promise<ResilienceResult> {
    const prior = await this.read();
    if (!prior?.pendingAlarm)
      return prior ?? { name: 'alarm-recovery', passed: false, reason: 'NO_RECOVERY' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    try {
      const actual = this.context.container!;
      stopped = await Promise.race([
        (async () => {
          await actual.destroy();
          return (await actual.inspect()) === null && !actual.running;
        })(),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), 5000);
        }),
      ]);
    } catch {
      /* Preserve failure; the operator must reconcile any live instance. */
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    const result = {
      ...prior,
      passed: false,
      pendingAlarm: false,
      stopped,
      reason: 'ALARM_NOT_OBSERVED',
    };
    await this.context.storage.put('probeResult', result);
    return result;
  }
}
