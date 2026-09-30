import { expect, test } from 'bun:test';
import { initialWorkspaceSection } from './navigation';

test('a fresh or invalid dashboard preference opens the standalone Library', () => {
  expect(initialWorkspaceSection('', undefined)).toBe('library');
  expect(initialWorkspaceSection('', null)).toBe('library');
  expect(initialWorkspaceSection('', 'removed-section')).toBe('library');
});

test('explicit prior sections remain available and asset/file links open Library', () => {
  expect(initialWorkspaceSection('', 'projects')).toBe('projects');
  expect(initialWorkspaceSection('', 'live')).toBe('live');
  expect(initialWorkspaceSection('?asset=an-exact-asset', 'projects')).toBe('library');
  expect(initialWorkspaceSection('?open=fixture.glb', 'materials')).toBe('library');
});
