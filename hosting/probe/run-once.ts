export const probeCases = ['engine-a', 'network', 'write-marker', 'read-marker'] as const;
export type ProbeCase = (typeof probeCases)[number];
export interface ProbeResult {
  name: ProbeCase;
  passed: boolean;
  image?: string;
  stopped?: boolean;
  elapsedMs?: number;
  digest?: string;
  reason?: string;
  failedOperation?: string;
}
interface RunRecord {
  state: 'running' | 'finished';
  results: ProbeResult[];
}

export async function runProbeOnce(
  storage: DurableObjectStorage,
  execute: (name: ProbeCase) => Promise<ProbeResult>,
): Promise<RunRecord> {
  const claimed = await storage.transaction(async (transaction) => {
    if (await transaction.get('run')) return false;
    await transaction.put('run', { state: 'running', results: [] } satisfies RunRecord);
    return true;
  });
  if (!claimed) return (await storage.get<RunRecord>('run'))!;
  const record: RunRecord = { state: 'running', results: [] };
  for (const name of probeCases) {
    let result: ProbeResult;
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
