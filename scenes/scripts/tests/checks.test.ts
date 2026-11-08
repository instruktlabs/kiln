import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectPinSnapshot, validatePins, type PinSnapshot, APPROVED_PINS } from '../check-pins';
import { findHygieneHits, DENYLIST } from '../check-bundle-hygiene';
import { isAllowedLicense } from '../check-licenses';

// A consistent checkout is the approved pins themselves, so a version bump edits APPROVED_PINS alone.
const pin = (name: string): string => APPROVED_PINS[name]!;
/** The approved version with its last component raised by one: drift the check must reject. */
const drift = (version: string): string => version.replace(/\d+$/, (n) => String(Number(n) + 1));

function fixture(): PinSnapshot {
  const peers = { react: pin('react'), 'react-dom': pin('react-dom'), three: pin('three'), '@react-three/fiber': pin('@react-three/fiber') };
  return {
    manifests: [
      { path: 'package.json', json: { private: true, packageManager: 'bun@1.4.2', devDependencies: { ...APPROVED_PINS } } },
      { path: 'packages/scene-kit/package.json', json: { name: '@kiln-scenes/scene-kit', private: true, peerDependencies: peers, devDependencies: peers } },
    ],
    lockfiles: ['bun.lock'],
    lock: { packages: { three: [`three@${pin('three')}`, '', {}, 'sha512-fixture'], '@types/three': [`@types/three@${pin('@types/three')}`, '', {}, 'sha512-types-fixture'] } },
    site: { dependencies: peers, devDependencies: { '@types/react': '^19.3.0', '@types/react-dom': '^19.3.0', '@types/three': pin('@types/three'), typescript: '6.0.3' } },
    engine: { dependencies: { three: pin('three') } },
    renderService: { dependencies: { three: pin('three') } },
    toolchain: { bun: '1.4.2', node: '22.23.4', npm: '12.2.0' },
    siteToolchain: { bun: '1.4.2', node: '22.23.4', npm: '12.2.0' },
    siteViteVersions: [pin('vite')],
    installedThree: [{ path: 'node_modules/three', version: pin('three') }],
  };
}

describe('U-20 pin fixture repositories', () => {
  test('collects pins from a relocated integrated checkout', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'kiln pins checkout '));
    const root = join(repo, 'scenes');
    const f = fixture();
    async function write(path: string, value: unknown) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(value));
    }
    try {
      await Promise.all([
        ...f.manifests.map(m => write(join(root, m.path), m.json)),
        write(join(root, 'bun.lock'), f.lock),
        write(join(root, 'toolchain.json'), f.toolchain),
        write(join(root, 'node_modules/three/package.json'), { version: pin('three') }),
        write(join(repo, 'site/package.json'), f.site),
        write(join(repo, 'site/bun.lock'), { packages: { vite: [`vite@${pin('vite')}`] } }),
        write(join(repo, 'package.json'), f.engine),
        write(join(repo, 'render-service/package.json'), f.renderService),
        write(join(repo, 'toolchain.json'), f.siteToolchain),
      ]);
      const snapshot = collectPinSnapshot(root);
      expect(validatePins(snapshot)).toEqual([]);
      expect(snapshot.site).toEqual(f.site);
      expect(snapshot.engine).toEqual(f.engine);
      expect(snapshot.renderService).toEqual(f.renderService);
      await write(join(repo, 'package.json'), { dependencies: { three: drift(pin('three')) } });
      expect(validatePins(collectPinSnapshot(root)).join('\n')).toContain('engine three');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
  test('accepts exact pins and the website React types exception', () => expect(validatePins(fixture())).toEqual([]));
  test('accepts the direct Three.js Troy package while preserving React peers on R3F scenes', () => {
    const f = fixture();
    f.manifests.push({ path: 'packages/troy/package.json', json: { private: true, peerDependencies: { three: pin('three') }, devDependencies: { three: pin('three'), acorn: pin('acorn') } } });
    expect(validatePins(f)).toEqual([]);
    f.manifests[2]!.path = 'packages/farm/package.json';
    expect(validatePins(f).join('\n')).toContain('missing exact react');
  });
  test('rejects Troy parser version drift and ranges while retaining its exact approved pin', () => {
    for (const acorn of [drift(pin('acorn')), `^${pin('acorn')}`, `~${pin('acorn')}`]) {
      const f = fixture();
      f.manifests.push({ path: 'packages/troy/package.json', json: { private: true, peerDependencies: { three: pin('three') }, devDependencies: { three: pin('three'), acorn } } });
      expect(validatePins(f).join('\n')).toContain(`acorn must be ${pin('acorn')}, got ${acorn}`);
    }
  });
  test('rejects a different three in a package', () => {
    const f = fixture(); f.manifests[1]!.json.devDependencies!.three = drift(pin('three'));
    expect(validatePins(f).join('\n')).toContain(`three must be ${pin('three')}`);
  });
  test('rejects a range outside the two website types exceptions', () => {
    const f = fixture(); f.manifests[0]!.json.devDependencies!.react = `^${pin('react')}`;
    expect(validatePins(f).join('\n')).toContain(`react must be ${pin('react')}`);
  });
  test('detects a website mismatch', () => {
    const f = fixture(); f.site.dependencies!.three = drift(pin('three'));
    expect(validatePins(f).join('\n')).toContain('website three');
  });
  test('detects website types drift', () => {
    const f = fixture(); f.site.devDependencies!['@types/three'] = drift(pin('@types/three'));
    expect(validatePins(f).join('\n')).toContain(`website @types/three must be ${pin('@types/three')}`);
  });
  test('detects a second lockfile resolution even with an exact direct pin', () => {
    const f = fixture(); f.lock.packages['nested/three'] = [`three@${drift(pin('three'))}`, '', {}, 'sha512-other'];
    expect(validatePins(f).join('\n')).toContain('exactly one three resolution');
  });
  test('rejects a single lockfile resolution at a version other than the approved pin', () => {
    const f = fixture(); f.lock.packages.three = [`three@${drift(pin('three'))}`, '', {}, 'sha512-other'];
    expect(validatePins(f).join('\n')).toContain(`exactly one three resolution at ${pin('three')}`);
  });
  test('rejects a render service three that differs from the scenes pin', () => {
    const f = fixture(); f.renderService.dependencies!.three = drift(pin('three'));
    expect(validatePins(f).join('\n')).toContain(`render service three must equal scenes pin ${pin('three')}`);
  });
  test('rejects a second lockfile and an unapproved direct package', () => {
    const f = fixture(); f.lockfiles.push('packages/scene-kit/package-lock.json');
    f.manifests[0]!.json.devDependencies!['@react-three/drei'] = '10.7.9';
    const result = validatePins(f).join('\n');
    expect(result).toContain('one lockfile'); expect(result).toContain('unapproved direct dependency');
  });
  test('rejects missing TS6 alias, two physical three copies, and a wrong engine pin', () => {
    const f = fixture(); delete f.manifests[0]!.json.devDependencies!['typescript-6'];
    f.installedThree.push({ path: 'packages/scene-kit/node_modules/three', version: pin('three') });
    f.engine.dependencies!.three = `^${pin('three')}`;
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
