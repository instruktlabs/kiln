import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { installGuideNote, installGuideStatus } from '../src/lib/install-note';

describe('the install page note about the repository guide', () => {
  test('says the guide names the release only when the guide does', () => {
    expect(installGuideStatus('This guide installs Kiln **0.9.0**: standalone authoring', '0.9.0')).toBe('names-release');
    expect(installGuideStatus('Kiln 0.9.0 is current', '0.9.0')).toBe('names-release');
    expect(installGuideNote('Kiln **0.9.0**', '0.9.0')).toBe('The repository guide below is rendered directly from the configured documentation source and names the same 0.9.0 release.');
  });

  test('does not take another release, a longer number or a different digit run for this one', () => {
    for (const body of ['This guide installs Kiln **0.8.2**', 'version 10.9.0 of a tool', 'build 0.9.01', 'ratio 0.9.0.1', 'no version at all']) {
      expect(installGuideStatus(body, '0.9.0')).toBe('does-not-name-release');
    }
  });

  test('keeps the earlier advice when the guide does not name the release', () => {
    const note = installGuideNote('This guide installs Kiln **0.8.0**', '0.9.0');
    expect(note).toContain('does not name the 0.9.0 release');
    expect(note).toContain('Until the new tag exists, use the repository installation instructions below.');
  });

  test('treats a version with regular-expression characters as text', () => {
    expect(installGuideStatus('release 0x9y0', '0.9.0')).toBe('does-not-name-release');
  });

  test('the page passes the configured guide to it and never states the previous release itself', () => {
    const page = readFileSync(new URL('../src/pages/docs/[slug].astro', import.meta.url), 'utf8');
    expect(page).toMatch(/installGuideNote\(entry\.body \?\? "", VERSION\)/);
    expect(page).not.toMatch(/0\.8/);
  });
});
