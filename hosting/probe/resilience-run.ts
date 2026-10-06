export const resilienceCases = [
  'cpu-preview',
  'software-views',
  'network',
  'write-marker',
  'read-marker',
  'native-deadline',
  'native-cancel',
  'stdout-flood',
  'stderr-flood',
  'memory-limit',
  'alarm-recovery',
  'engine-after',
] as const;
export type ResilienceCase = (typeof resilienceCases)[number];
export interface ResilienceResult {
  name: ResilienceCase;
  passed: boolean;
  stopped?: boolean;
  reason?: string;
  image?: string;
  elapsedMs?: number;
  ready?: boolean;
  readyAfterMs?: number;
  exitCode?: number;
  digest?: string;
  views?: {
    backdrop: string;
    index: number;
    pngBase64: string;
    sha256: string;
    red?: number;
    green?: number;
  }[];
  oomKills?: number;
  counterSource?: string;
  pendingAlarm?: boolean;
}
interface RunRecord {
  state: 'running' | 'finished';
  results: ResilienceResult[];
}

/** A new allowance, never a reset or continuation of earlier exhausted probes. */
export async function runResilienceOnce(
  storage: DurableObjectStorage,
  execute: (name: ResilienceCase) => Promise<ResilienceResult>,
): Promise<RunRecord> {
  const claimed = await storage.transaction(async (transaction) => {
    if (await transaction.get('run')) return false;
    await transaction.put('run', { state: 'running', results: [] } satisfies RunRecord);
    return true;
  });
  if (!claimed) return (await storage.get<RunRecord>('run'))!;
  const record: RunRecord = { state: 'running', results: [] };
  for (const name of resilienceCases) {
    let result: ResilienceResult;
    try {
      result = await execute(name);
    } catch {
      result = { name, passed: false, reason: 'PROBE_FAILED' };
    }
    record.results.push(result);
    await storage.put('run', record);
    if (!result.passed) break;
  }
  record.state = 'finished';
  await storage.put('run', record);
  return record;
}
