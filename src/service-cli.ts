import {
  describeUnavailableService,
  explainRenderServiceState,
  inspectLocalRenderService,
  localRenderServicePort,
  localRenderServiceState,
  localRenderServiceUrl,
  renderServiceDir,
  startLocalRenderService,
  terminateRenderService,
  type LocalRenderServiceProbe,
} from './render-service-host';
export const SERVICE_USAGE = `Usage:
  kiln service status     inspect installation and the shared local renderer
  kiln service start      start a managed local renderer now, or report the current one
  kiln service reprobe    refresh readiness after an installation or service change
  kiln service stop       explicitly stop the verified local renderer

Managed renderers use a bounded idle lifetime shared by all sessions; the next
local view that needs one starts it again. start never replaces a listener it
cannot join. Manual renderers run until stopped. A remote renderer is managed
on its own device.
`;
export interface ServiceIo {
  log: (line: string) => void;
  error: (line: string) => void;
}
function clientToken(): string | undefined {
  return process.env['KILN_RENDER_TOKEN'] ?? process.env['RENDER_SERVICE_TOKEN'];
}
/** The identity lines status and start print for a listening render service. */
function logService(
  io: ServiceIo,
  probe: Extract<LocalRenderServiceProbe, { kind: 'service' }>,
): void {
  io.log(`listening        yes  ${probe.rendererId}`);
  io.log(
    `process          pid ${probe.instance.pid}, ${probe.instance.ownerPid === null ? 'started by hand' : `started by session ${probe.instance.ownerPid} (provenance only)`}`,
  );
  io.log(
    `lifetime         ${probe.instance.mode}${probe.instance.idleTimeoutMs ? `, idle timeout ${probe.instance.idleTimeoutMs}ms` : ''}`,
  );
  io.log(
    `source           ${probe.stale ? 'incompatible (different from this installation)' : 'current'}`,
  );
  io.log(`protocol         ${probe.health.protocol}`);
  io.log(`build            ${probe.health.compatibility.fingerprint}`);
  io.log(
    `authentication   ${!probe.health.authRequired ? 'not required' : clientToken() ? 'required; client token configured (not verified by health)' : 'required; set KILN_RENDER_TOKEN to the matching renderer token'}`,
  );
}
/**
 * Start the shared local renderer through the same path on-demand views use, or
 * report the current one. A listener that cannot be joined is reported, never replaced.
 */
async function startService(
  io: ServiceIo,
  url: string,
  dir: string,
  probe: LocalRenderServiceProbe,
): Promise<number> {
  const current = probe.kind === 'service' && !probe.stale;
  if (!current) {
    if (probe.kind !== 'absent') {
      io.error(`${describeUnavailableService(url, probe)}; nothing was started`);
      return 1;
    }
    const state = localRenderServiceState(dir);
    if (state !== 'ready') {
      io.error(`${explainRenderServiceState(state, dir)}; nothing was started`);
      return 1;
    }
    try {
      await startLocalRenderService(dir);
    } catch (error) {
      io.error(
        `could not start the render service on ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 1;
    }
  }
  const fresh = current ? probe : await inspectLocalRenderService(url, dir);
  if (fresh.kind !== 'service' || fresh.stale) {
    io.error(
      `the render service on ${url} is not available: ${describeUnavailableService(url, fresh)}`,
    );
    return 1;
  }
  const { pid, mode, ownerPid, idleTimeoutMs } = fresh.instance;
  io.log(`render service   ${url}`);
  io.log(`port             ${localRenderServicePort()}`);
  // Another session can start the shared renderer between the probe and this start.
  io.log(
    !current && ownerPid === process.pid
      ? `started          ${mode} renderer, pid ${pid}`
      : `already running  pid ${pid}; nothing was started`,
  );
  logService(io, fresh);
  if (mode === 'managed' && idleTimeoutMs)
    io.log(
      `A managed renderer exits after ${idleTimeoutMs}ms without work; the next local view that needs it starts it again.`,
    );
  return 0;
}
export async function serviceMain(
  argv: readonly string[],
  io: ServiceIo = { log: console.log, error: console.error },
): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === '--help' || command === '-h') {
    io.log(SERVICE_USAGE);
    return command === undefined ? 2 : 0;
  }
  if (command === 'prune') {
    io.error(
      'kiln service prune was removed: the initiating session exiting does not mean a shared renderer is unused. Use kiln service status, then kiln service stop explicitly when other clients are finished.',
    );
    return 2;
  }
  if (!['status', 'start', 'reprobe', 'stop'].includes(command) || argv.length !== 1) {
    io.error(`unknown service command: ${argv.join(' ')}\n${SERVICE_USAGE}`);
    return 2;
  }
  const url = localRenderServiceUrl();
  const dir = renderServiceDir();
  const probe = await inspectLocalRenderService(url, dir);
  if (command === 'start') return startService(io, url, dir, probe);
  if (command === 'status' || command === 'reprobe') {
    const state = localRenderServiceState(dir);
    io.log(`render service   ${url}`);
    io.log(
      `installation     ${state === 'ready' ? `ready (${dir}); GPU checked at startup` : explainRenderServiceState(state, dir)}`,
    );
    if (probe.kind === 'absent') io.log('listening        no');
    else if (probe.kind === 'service') logService(io, probe);
    else io.log(`listening        ${describeUnavailableService(url, probe)}`);
    const missingToken = probe.kind === 'service' && probe.health.authRequired && !clientToken();
    return command === 'reprobe' && (probe.kind !== 'service' || probe.stale || missingToken)
      ? 1
      : 0;
  }
  if (probe.kind === 'absent') {
    io.log(`nothing is listening on ${url}`);
    return 0;
  }
  if (probe.kind !== 'service') {
    io.error(`${describeUnavailableService(url, probe)}; nothing was stopped`);
    return 1;
  }
  if (!(await terminateRenderService(url, probe))) {
    io.error(`could not verify and stop the render service on ${url} (pid ${probe.instance.pid})`);
    return 1;
  }
  io.log(
    `stopped the render service on ${url} (pid ${probe.instance.pid}); the next local view that needs it starts a new one`,
  );
  return 0;
}
