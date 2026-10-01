import { describe, expect, test } from 'bun:test';
import { validatePins, type PinSnapshot, APPROVED_PINS } from '../check-pins';
import { findHygieneHits, DENYLIST } from '../check-bundle-hygiene';
import { isAllowedLicense } from '../check-licenses';

function fixture(): PinSnapshot {
  const peers = { react: '19.3.0', 'react-dom': '19.3.0', three: '0.186.0', '@react-three/fiber': '9.8.1' };
  return {
    manifests: [
      { path: 'package.json', json: { private: true, packageManager: 'bun@1.4.2', devDependencies: { ...APPROVED_PINS } } },
      { path: 'packages/scene-kit/package.json', json: { name: '@kiln-scenes/scene-kit', private: true, peerDependencies: peers, devDependencies: peers } },
    ],
    lockfiles: ['bun.lock'],
    lock: { packages: { three: ['three@0.186.0', '', {}, 'sha512-fixture'], '@types/three': ['@types/three@0.186.0', '', {}, 'sha512-types-fixture'] } },
    site: { dependencies: peers, devDependencies: { '@types/react': '^19.3.0', '@types/react-dom': '^19.3.0', '@types/three': '0.186.0', typescript: '6.0.3' } },
    engine: { dependencies: { three: '0.186.0' } },
    renderService: { dependencies: { three: '0.186.0' } },
    toolchain: { bun: '1.4.2', node: '22.23.2', npm: '12.0.2' },
    siteToolchain: { bun: '1.4.2', node: '22.23.2', npm: '12.0.2' },
    siteViteVersions: ['8.3.0'],
    installedThree: [{ path: 'node_modules/three', version: '0.186.0' }],
  };
}

describe('U-20 pin fixture repositories', () => {
  test('accepts exact pins and the website React types exception', () => expect(validatePins(fixture())).toEqual([]));
  test('rejects a different three in a package', () => {
    const f = fixture(); f.manifests[1]!.json.devDependencies!.three = '0.186.1';
    expect(validatePins(f).join('\n')).toContain('three must be 0.186.0');
  });
  test('rejects a range outside the two website types exceptions', () => {
    const f = fixture(); f.manifests[0]!.json.devDependencies!.react = '^19.3.0';
    expect(validatePins(f).join('\n')).toContain('react must be 19.3.0');
  });
  test('detects a website mismatch', () => {
    const f = fixture(); f.site.dependencies!.three = '0.186.1';
    expect(validatePins(f).join('\n')).toContain('website three');
  });
  test('detects a second lockfile resolution even with an exact direct pin', () => {
    const f = fixture(); f.lock.packages['nested/three'] = ['three@0.186.1', '', {}, 'sha512-other'];
    expect(validatePins(f).join('\n')).toContain('exactly one three resolution');
  });
  test('rejects a second lockfile and an unapproved direct package', () => {
    const f = fixture(); f.lockfiles.push('packages/scene-kit/package-lock.json');
    f.manifests[0]!.json.devDependencies!['@react-three/drei'] = '10.7.9';
    const result = validatePins(f).join('\n');
    expect(result).toContain('one lockfile'); expect(result).toContain('unapproved direct dependency');
  });
  test('rejects missing TS6 alias, two physical three copies, and a wrong engine pin', () => {
    const f = fixture(); delete f.manifests[0]!.json.devDependencies!['typescript-6'];
    f.installedThree.push({ path: 'packages/scene-kit/node_modules/three', version: '0.186.0' });
    f.engine.dependencies!.three = '^0.186.0';
    const result = validatePins(f).join('\n');
    expect(result).toContain('typescript-6'); expect(result).toContain('physical three'); expect(result).toContain('engine three');
  });
});

describe('U-21 public bundle hygiene', () => {
  test('detects every denylist token including HTML and source maps', () => {
    for (const token of DENYLIST) expect(findHygieneHits('index.html', `<div>${token}</div>`)).toHaveLength(1);
    expect(findHygieneHits('bundle.js.map', '{"sourcesContent":["__kilnScene"]}')).toHaveLength(1);
  });
  test('reports location and permits a clean bundle', () => {
    expect(findHygieneHits('app.js', 'const version = "186";')).toEqual([]);
    expect(findHygieneHits('app.js', '\nwindow.__kilnScene = {};')[0]).toEqual({ file: 'app.js', token: '__kilnScene', line: 2 });
  });
});

describe('production license policy', () => {
  test('accepts permitted SPDX alternatives but rejects a copyleft conjunction', () => {
    expect(isAllowedLicense('MIT')).toBe(true);
    expect(isAllowedLicense('(MIT OR GPL-3.0-only)')).toBe(true);
    expect(isAllowedLicense('(MIT AND GPL-3.0-only)')).toBe(false);
    expect(isAllowedLicense('MPL-2.0')).toBe(false);
    expect(isAllowedLicense('UNLICENSED')).toBe(false);
  });
});
