/**
 * The last line of the install page's release aside describes the repository guide rendered beneath it.
 * That guide comes from the configured documentation source, so what the line says about it has to be
 * read from the guide, not remembered: it once said the guide still carried the previous release's
 * instructions after the source had moved on to the current one.
 */
export type InstallGuideStatus = 'names-release' | 'does-not-name-release';

const escapeForPattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether the rendered guide names this exact release (`0.9.0` in `0.9.0` or `**0.9.0**`, not in `10.9.0` or `0.9.01`). */
export const installGuideStatus = (body: string, version: string): InstallGuideStatus =>
  new RegExp(`(?<![\\d.])${escapeForPattern(version)}(?![\\d]|\\.\\d)`).test(body)
    ? 'names-release'
    : 'does-not-name-release';

export const installGuideNote = (body: string, version: string): string =>
  installGuideStatus(body, version) === 'names-release'
    ? `The repository guide below is rendered directly from the configured documentation source and names the same ${version} release.`
    : `The repository guide below is rendered directly from the configured documentation source and does not name the ${version} release, so parts of it may describe an earlier one. Until the new tag exists, use the repository installation instructions below.`;
