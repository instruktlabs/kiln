import { expect, test } from 'bun:test';
import { parseProbeHostIdentity, processUserNamespaceIsIsolated } from './probe-invariants';

const host = { uid: 1001, userNamespace: 'user:[4026531837]' };
const child = {
  uid: 1001,
  effectiveUid: 1001,
  userNamespace: 'user:[4026532441]',
  uidMap: '      1001          0          1\n',
};

test('the nested Bubblewrap map retains the non-root host identity in a different namespace', () => {
  expect(processUserNamespaceIsIsolated(child, host)).toBe(true);
  expect(processUserNamespaceIsIsolated({ ...child, uidMap: '1001 1001 1\n' }, host)).toBe(true);
});

test('a host namespace, broad map, changed user or elevated effective user cannot qualify', () => {
  for (const override of [
    { userNamespace: host.userNamespace },
    { userNamespace: undefined },
    { uidMap: '0 0 4294967295\n' },
    { uidMap: '1001 0 1\n1002 2 1\n' },
    { uidMap: '1001 99 1' },
    { uidMap: undefined },
    { uid: 0 },
    { uid: 1002 },
    { effectiveUid: 0 },
  ])
    expect(processUserNamespaceIsIsolated({ ...child, ...override }, host)).toBe(false);
  expect(processUserNamespaceIsIsolated(child, undefined)).toBe(false);
  expect(processUserNamespaceIsIsolated(child, { ...host, uid: 0 })).toBe(false);
});

test('probe host identity accepts only the exact bounded launch envelope', () => {
  const argv = ['--kiln-host-uid', '1001', '--kiln-host-userns', host.userNamespace];
  expect(parseProbeHostIdentity(argv)).toEqual(host);
  for (const invalid of [
    [],
    [...argv, 'extra'],
    ['--kiln-host-uid', '0', '--kiln-host-userns', host.userNamespace],
    ['--kiln-host-uid', '1001junk', '--kiln-host-userns', host.userNamespace],
    ['--kiln-host-uid', '4294967295', '--kiln-host-userns', host.userNamespace],
    ['--kiln-host-uid', '1001', '--kiln-host-userns', 'user:[1]\n'],
    ['--kiln-host-uid', '1001', '--kiln-host-userns', 'other:[1]'],
  ])
    expect(parseProbeHostIdentity(invalid)).toBeUndefined();
});
