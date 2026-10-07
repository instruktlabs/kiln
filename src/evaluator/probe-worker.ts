import { readFile, readlink, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { validate } from '../validation';
import { writeFileSync } from 'node:fs';
import {
  parseProbeHostIdentity,
  processCapabilitiesAreEmpty,
  processUserNamespaceIsIsolated,
} from './probe-invariants';

const VERSION = 'kiln.evaluator.isolation-readiness.v1';
type ProbeFailure =
  | 'loader-probe-boot'
  | 'invariant-namespace'
  | 'invariant-environment'
  | 'invariant-filesystem'
  | 'invariant-network'
  | 'invariant-generated-policy';

async function deniedRead(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return false;
  } catch {
    return true;
  }
}

async function optionalRead(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

async function deniedWrite(path: string): Promise<boolean> {
  try {
    await writeFile(path, 'denied');
    return false;
  } catch {
    return true;
  }
}

async function deniedConnect(host: string, port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    let socket: ReturnType<typeof connect>;
    try {
      socket = connect({ host, port });
    } catch {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(true);
    }, 250);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function isolationInterfaces(): ReturnType<typeof networkInterfaces> | undefined {
  try {
    return networkInterfaces();
  } catch {
    return undefined;
  }
}

function writeFailure(failure: ProbeFailure): void {
  writeFileSync(3, JSON.stringify({ version: VERSION, mode: 'isolated', failure }), {
    encoding: 'utf8',
  });
}

function groupedFailure(failedChecks: readonly string[]): ProbeFailure {
  const failed = new Set(failedChecks);
  if (
    ['user-namespace', 'no-new-privileges', 'capabilities-empty'].some((name) => failed.has(name))
  ) {
    return 'invariant-namespace';
  }
  if (failed.has('environment-exact')) return 'invariant-environment';
  if (
    ['product-filesystem-denied', 'host-filesystem-denied', 'runtime-filesystem-read-only'].some(
      (name) => failed.has(name),
    )
  ) {
    return 'invariant-filesystem';
  }
  if (
    ['network-namespace-empty', 'metadata-and-local-network-denied'].some((name) =>
      failed.has(name),
    )
  ) {
    return 'invariant-network';
  }
  return 'invariant-generated-policy';
}

function generatedDenials(): boolean {
  const prelude = "const meta = { name: 'probe' }; function build(){ return createRoot('probe'); }";
  const probes = [
    `const leak = process.env; ${prelude}`,
    `const leak = fetch('http://169.254.169.254/'); ${prelude}`,
    `const leak = globalThis.process.mainModule.require('fs'); ${prelude}`,
    `const leak = globalThis.process.mainModule.require('child_process'); ${prelude}`,
  ];
  return probes.every((source) => !validate(source).valid);
}

async function main(): Promise<void> {
  const status = await optionalRead('/proc/self/status');
  const uidMap = await optionalRead('/proc/self/uid_map');
  const envKeys = Object.keys(process.env).sort();
  const userNamespace = await readlink('/proc/self/ns/user').catch(() => undefined);
  const hostIdentity = parseProbeHostIdentity(process.argv.slice(2));
  const interfaceMap = isolationInterfaces();
  const interfaces = interfaceMap ? Object.values(interfaceMap).flat().filter(Boolean) : undefined;
  const checks: Array<[string, boolean]> = [
    [
      'user-namespace',
      processUserNamespaceIsIsolated(
        {
          uid: process.getuid?.() ?? -1,
          effectiveUid: process.geteuid?.() ?? -1,
          uidMap,
          userNamespace,
        },
        hostIdentity,
      ),
    ],
    ['no-new-privileges', typeof status === 'string' && /^NoNewPrivs:\s+1$/m.test(status)],
    ['capabilities-empty', processCapabilitiesAreEmpty(status)],
    ['environment-exact', envKeys.join(',') === 'NODE_ENV,NO_COLOR'],
    ['product-filesystem-denied', await deniedRead('/app/agent-runtime/src/server.ts')],
    ['host-filesystem-denied', await deniedRead('/etc/passwd')],
    ['runtime-filesystem-read-only', await deniedWrite('/app/node_modules/.kiln-probe')],
    ['network-namespace-empty', interfaces?.every((entry) => entry?.internal === true) === true],
    [
      'metadata-and-local-network-denied',
      (await deniedConnect('169.254.169.254', 80)) && (await deniedConnect('127.0.0.1', 8080)),
    ],
    ['generated-capabilities-denied', generatedDenials()],
  ];
  const failedChecks = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failedChecks.length > 0) {
    writeFailure(groupedFailure(failedChecks));
    process.exitCode = 1;
  } else {
    writeFileSync(
      3,
      JSON.stringify({ version: VERSION, mode: 'isolated', checks: checks.map(([name]) => name) }),
      { encoding: 'utf8' },
    );
  }
}

await main().catch(() => {
  try {
    writeFailure('loader-probe-boot');
  } catch {}
  process.exitCode = 1;
});
