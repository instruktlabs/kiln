import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { summarizeUploadSet } from './upload-set.mjs';

const sha = (digit: string) => digit.repeat(64);
const base = 'https://assets.example.test/';
const mirror = {
  base,
  files: [
    { path: 'packs/farm/r1/farm.zip', bytes: 100, sha256: sha('a') },
    { path: 'media/farm/a.avif', bytes: 20, sha256: sha('b') },
    { path: 'media/farm/b.avif', bytes: 30, sha256: sha('c') },
  ],
};
const upload = {
  base,
  files: [{ path: 'packs/farm/r1/models/a.glb', url: `${base}packs/farm/r1/models/a.glb`, bytes: 40, sha256: sha('d'), archive: 'packs/farm/r1/farm.zip', member: 'models/a.glb' }],
};

describe('the R2 upload set', () => {
  test('counts the pinned mirror files and the extracted GLBs, by group', () => {
    const summary = summarizeUploadSet(mirror, upload);
    expect(summary.problems).toEqual([]);
    expect(summary.mirrorFiles).toBe(3);
    expect(summary.extractedFiles).toBe(1);
    expect(summary.total).toEqual({ files: 4, bytes: 190 });
    expect(summary.groups).toEqual([
      { group: 'extracted packs/farm', files: 1, bytes: 40 },
      { group: 'media/farm', files: 2, bytes: 50 },
      { group: 'packs/farm', files: 1, bytes: 100 },
    ]);
  });

  test('reports a bad hash, a bad size, a duplicated path, a foreign url and an archive that is not pinned', () => {
    const bad = summarizeUploadSet(
      { base, files: [...mirror.files, { path: 'media/farm/a.avif', bytes: -1, sha256: 'xyz' }] },
      { base, files: [{ ...upload.files[0], url: 'https://elsewhere.test/a.glb', archive: 'packs/farm/other.zip' }] },
    );
    const text = bad.problems.join('\n');
    expect(text).toContain('media/farm/a.avif: bytes is not a whole number');
    expect(text).toContain('media/farm/a.avif: sha256 is not 64 hex characters');
    expect(text).toContain('media/farm/a.avif: listed in mirror-manifest and mirror-manifest');
    expect(text).toContain(`packs/farm/r1/models/a.glb: url is not ${base}packs/farm/r1/models/a.glb`);
    expect(text).toContain('its archive packs/farm/other.zip is not a pinned mirror file');
  });

  test('refuses a path that escapes the host root', () => {
    const bad = summarizeUploadSet({ base, files: [{ path: '../secret', bytes: 1, sha256: sha('a') }, { path: '/abs', bytes: 1, sha256: sha('a') }] }, { base, files: [] });
    expect(bad.problems).toHaveLength(2);
  });

  test('the checked-in manifests are consistent: valid records, no duplicate path, every extracted file inside a pinned archive', () => {
    const read = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));
    const summary = summarizeUploadSet(read('mirror-manifest.json'), read('upload-manifest.json'));
    expect(summary.problems).toEqual([]);
    expect(summary.mirrorFiles).toBeGreaterThan(0);
    expect(summary.extractedFiles).toBeGreaterThan(0);
  });
});
