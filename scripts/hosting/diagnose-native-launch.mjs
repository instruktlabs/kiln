#!/usr/bin/env node
// CI-only diagnostics for the fixed installed transport worker. No user source,
// provider access, inherited child environment or security-policy changes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

assert.equal(process.platform, 'linux');
assert(process.getuid() > 0);
assert.equal(process.argv.length, 3);
const output = process.argv[2];
const installation = '/app/node_modules/@instruktlabs/kiln';
const host = {
  bwrapPath: '/usr/local/bin/kiln-probe-bwrap',
  nodePath: '/usr/local/bin/kiln-probe-node',
};
const record = { version: 'kiln.fixed-transport-diagnostic.v1', qualified: false };
try {
  const evaluator = await import(pathToFileURL(`${installation}/lib/evaluator/isolation.js`).href);
  const worker = `${installation}/lib/evaluator/transport-worker.mjs`;
  record.filesPresent = Object.fromEntries(
    [worker, host.bwrapPath, host.nodePath, '/usr/bin/setpriv', '/usr/bin/prlimit'].map((path) => [
      path,
      existsSync(path),
    ]),
  );
  const launch = evaluator.isolatedEvaluatorLaunch(worker, host);
  const child = spawnSync(launch.command, launch.args, {
    env: launch.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 8000,
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024,
  });
  record.launch = { command: launch.command, args: launch.args };
  record.exit = {
    status: child.status,
    signal: child.signal,
    error: child.error?.code ?? null,
  };
  record.stdout = String(child.output[1] ?? '').slice(0, 4096);
  record.stderr = String(child.output[2] ?? '').slice(0, 4096);
  record.fd3 = String(child.output[3] ?? '').slice(0, 4096);
  // This fixed inspection runs with the exact same launch boundary after a
  // successful transport. It reads only kernel identity flags and env key names.
  if (child.status === 0) {
    const fixedInspection = `
      import { readFileSync } from 'node:fs';
      const status = readFileSync('/proc/self/status', 'utf8').split('\\n')
        .filter(line => /^(Uid|Gid|NoNewPrivs|CapInh|CapPrm|CapEff|CapBnd|CapAmb|Seccomp):/.test(line));
      console.log(JSON.stringify({status, uidMap: readFileSync('/proc/self/uid_map', 'utf8'),
        envKeys: Object.keys(process.env).sort(), pwd: process.env.PWD ?? null}));
    `;
    const inspected = spawnSync(
      launch.command,
      [...launch.args.slice(0, -1), '--input-type=module', '--eval', fixedInspection],
      {
        env: launch.env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 8000,
        killSignal: 'SIGKILL',
        maxBuffer: 16 * 1024,
      },
    );
    record.invariants = {
      status: inspected.status,
      signal: inspected.signal,
      error: inspected.error?.code ?? null,
      stdout: String(inspected.stdout ?? '').slice(0, 4096),
      stderr: String(inspected.stderr ?? '').slice(0, 4096),
    };
  }
} catch {
  record.failure = 'Fixed launch could not be prepared';
}
writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
