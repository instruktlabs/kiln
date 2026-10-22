/**
 * The model-facing half of the host-rooted export destination (#207). No
 * filesystem access: the host injects an {@link ExportRootWriter} through
 * `KilnToolContext.exportRoot`, and `src/export-root-node.ts` is the Node one.
 */

/** Writes new files under a root the host configured. Never replaces a file. */
export interface ExportRootWriter {
  /**
   * Publish complete files at root-relative, forward-slash paths, in order. An
   * existing file at any path refuses the call and nothing new is left behind.
   * Errors name root-relative paths only.
   */
  writeNew(files: readonly { path: string; data: Uint8Array }[]): Promise<void>;
}

export interface ExportPath {
  /** The validated root-relative GLB path. */
  path: string;
  /** The runtime sidecar beside it: `<stem>.kiln-metadata.json`. */
  metadataPath: string;
  /** The sidecar's file name alone, as the GLB's provenance pointer records it. */
  metadataFileName: string;
}

const MAX_PATH_CHARS = 240;
const MAX_SEGMENTS = 8;
/** The portable stem rule documented for exports, applied to every segment. */
const PORTABLE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEVICE_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

/**
 * Check a root-relative path and return its segments: relative, forward slashes,
 * at most 240 characters and 8 segments, each segment portable (ASCII letters,
 * digits, `.`, `_`, `-`; starting with a letter or digit; not ending in `.`; not
 * a Windows device name).
 */
export function rootRelativeSegments(path: string): string[] {
  if (path.length > MAX_PATH_CHARS)
    throw new Error(`Export path must be at most ${MAX_PATH_CHARS} characters.`);
  if (path.includes('\\'))
    throw new Error('Export path must use forward slashes, for example models/door.glb.');
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path))
    throw new Error(
      'Export path must be relative to the export root, for example models/door.glb.',
    );
  const segments = path.split('/');
  if (segments.length > MAX_SEGMENTS)
    throw new Error(`Export path must have at most ${MAX_SEGMENTS} segments.`);
  for (const segment of segments) {
    if (segment === '..')
      throw new Error('Export path must stay inside the export root; ".." is not allowed.');
    if (!PORTABLE_SEGMENT.test(segment) || segment.endsWith('.'))
      throw new Error(
        `Export path segment ${JSON.stringify(segment)} is not portable: use ASCII letters, digits, ".", "_" or "-", starting with a letter or digit.`,
      );
    if (DEVICE_NAME.test(segment))
      throw new Error(
        `Export path segment ${JSON.stringify(segment)} is a Windows device name; choose another name.`,
      );
  }
  return segments;
}

/** Check a model-supplied GLB path and derive its runtime sidecar beside it. */
export function validateExportPath(path: string): ExportPath {
  if (!path.toLowerCase().endsWith('.glb'))
    throw new Error('Export path must name a .glb file, for example models/door.glb.');
  const segments = rootRelativeSegments(path);
  const metadataFileName = `${segments.at(-1)!.slice(0, -4)}.kiln-metadata.json`;
  return {
    path,
    metadataPath: [...segments.slice(0, -1), metadataFileName].join('/'),
    metadataFileName,
  };
}
