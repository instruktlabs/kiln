/** Resolve workers in source, compiled SDK and installed bundle layouts. */
export function isolatedWorkerUrls(moduleUrl: string): {
  worker: URL;
  probe: URL;
  transport: URL;
} {
  const source = new URL(moduleUrl).pathname.endsWith('.ts');
  const sdk = new URL(moduleUrl).pathname.endsWith('/isolation.js');
  const base = new URL(source || sdk ? './' : '../lib/evaluator/', moduleUrl);
  const extension = source ? 'ts' : 'js';
  return {
    worker: new URL(`worker.${extension}`, base),
    probe: new URL(`probe-worker.${extension}`, base),
    transport: new URL('transport-worker.mjs', base),
  };
}
