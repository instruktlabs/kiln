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
const sceneInputs = {
  base,
  files: [
    { path: 'scene-inputs/release1/farm.zip', bytes: 60, sha256: sha('e') },
    { path: 'scene-inputs/release2/golden-gate.zip', bytes: 70, sha256: sha('f') },
    { path: 'scene-inputs/release2/foundry-floor.zip', bytes: 80, sha256: sha('a') },
  ],
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

  test('includes all three scene archives in the required upload totals and groups', () => {
    const summary = summarizeUploadSet(mirror, upload, sceneInputs);
    expect(summary.problems).toEqual([]);
    expect(summary.sceneInputFiles).toBe(3);
    expect(summary.total).toEqual({ files: 7, bytes: 400 });
    expect(summary.groups.slice(-2)).toEqual([
      { group: 'scene-inputs/release1', files: 1, bytes: 60 },
      { group: 'scene-inputs/release2', files: 2, bytes: 150 },
    ]);
  });

  test('validates scene pins and reports duplicate paths across or within manifests', () => {
    const result = summarizeUploadSet(mirror, upload, { base, files: [
      { ...sceneInputs.files[0], bytes: -1, sha256: 'invalid', url: 'https://elsewhere.test/farm.zip' },
      sceneInputs.files[0],
      mirror.files[0],
      upload.files[0],
      { path: '../outside', bytes: 1, sha256: sha('a') },
    ] });
    const text = result.problems.join('\n');
    expect(text).toContain('scene-inputs/release1/farm.zip: bytes is not a whole number');
    expect(text).toContain('scene-inputs/release1/farm.zip: sha256 is not 64 hex characters');
    expect(text).toContain(`scene-inputs/release1/farm.zip: url is not ${base}scene-inputs/release1/farm.zip`);
    expect(text).toContain('listed in scene-inputs and scene-inputs');
    expect(text).toContain('listed in mirror-manifest and scene-inputs');
    expect(text).toContain('listed in upload-manifest and scene-inputs');
    expect(text).toContain('scene-inputs: a record has no usable path');
  });

  test('requires valid matching upload bases and keeps extracted archive provenance in the mirror manifest', () => {
    for (const invalid of ['', 'relative/', 'file:///tmp/', 'https://assets.example.test', 'https://name:password@assets.example.test/', 'https://assets.example.test/?query']) {
      const result = summarizeUploadSet(mirror, upload, { ...sceneInputs, base: invalid });
      expect(result.problems.join('\n')).toContain('scene-inputs: base must be an absolute HTTP(S) URL ending in /');
    }
    expect(summarizeUploadSet(mirror, upload, { ...sceneInputs, base: 'https://other.example.test/' }).problems)
      .toContain('scene-inputs: base does not match mirror-manifest base');
    const unpinned = summarizeUploadSet(mirror, { ...upload, files: [{ ...upload.files[0], archive: sceneInputs.files[0]!.path }] }, sceneInputs);
    expect(unpinned.problems.join('\n')).toContain('its archive scene-inputs/release1/farm.zip is not a pinned mirror file');
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
    const inputs = read('scene-inputs.json');
    const summary = summarizeUploadSet(read('mirror-manifest.json'), read('upload-manifest.json'), inputs);
    expect(summary.problems).toEqual([]);
    expect(summary.mirrorFiles).toBeGreaterThan(0);
    expect(summary.extractedFiles).toBeGreaterThan(0);
    expect(summary.sceneInputFiles).toBe(inputs.files.length);
    expect(summary.total.files).toBe(summary.mirrorFiles + summary.extractedFiles + summary.sceneInputFiles);
  });
});
