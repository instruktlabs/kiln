import worker, { KilnProbeRun, KilnProbeJob } from '../probe/worker';
export { KilnProbeRun, KilnProbeJob };
export default {
  async fetch(request: Request, _env: unknown, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === '/test-trigger') {
      const bindings = ctx.exports as unknown as {
        KilnProbeRun: DurableObjectNamespace<KilnProbeRun>;
      };
      const runs = bindings.KilnProbeRun;
      return Response.json(await runs.getByName('test').run());
    }
    return worker.fetch();
  },
};
