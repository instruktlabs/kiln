const CAPABILITY_STATUS_FIELDS = ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'] as const;

export interface ProbeHostIdentity {
  uid: number;
  userNamespace: string;
}

const namespacePattern = /^user:\[[0-9]{1,20}\](?![\s\S])/;
const nonRootUid = (uid: number) => Number.isSafeInteger(uid) && uid > 0 && uid < 0xffff_ffff;

export function parseProbeHostIdentity(argv: readonly string[]): ProbeHostIdentity | undefined {
  if (
    argv.length !== 4 ||
    argv[0] !== '--kiln-host-uid' ||
    argv[2] !== '--kiln-host-userns' ||
    !argv[1] ||
    !/^[1-9][0-9]{0,9}(?![\s\S])/.test(argv[1]) ||
    !argv[3] ||
    !namespacePattern.test(argv[3])
  )
    return undefined;
  const uid = Number(argv[1]);
  return nonRootUid(uid) ? { uid, userNamespace: argv[3] } : undefined;
}

export function processUserNamespaceIsIsolated(
  current: { uid: number; effectiveUid: number; userNamespace?: string; uidMap?: string },
  host: ProbeHostIdentity | undefined,
): boolean {
  if (
    !host ||
    !nonRootUid(host.uid) ||
    !namespacePattern.test(host.userNamespace) ||
    current.uid !== host.uid ||
    current.effectiveUid !== host.uid ||
    typeof current.userNamespace !== 'string' ||
    !namespacePattern.test(current.userNamespace) ||
    current.userNamespace === host.userNamespace ||
    typeof current.uidMap !== 'string' ||
    current.uidMap.length > 256
  )
    return false;
  const map = /^\s*([0-9]{1,10})\s+([0-9]{1,10})\s+([0-9]{1,10})\s*$/.exec(current.uidMap);
  if (!map) return false;
  const [, inside, outside, count] = map.map(Number);
  // --disable-userns creates a second user namespace. With --dev, that maps
  // our non-root UID to UID 0 in Bubblewrap's intermediate namespace, not host
  // root. Require a different namespace, the exact unprivileged caller identity
  // and a single-ID map; never accept an initial-namespace or broad mapping.
  return inside === host.uid && count === 1 && (outside === 0 || outside === host.uid);
}

/** Require every capability set exposed by /proc to be present and empty. */
export function processCapabilitiesAreEmpty(status: string | undefined): boolean {
  if (typeof status !== 'string') return false;
  return CAPABILITY_STATUS_FIELDS.every((field) =>
    new RegExp(`^${field}:\\s+0+$`, 'm').test(status),
  );
}
