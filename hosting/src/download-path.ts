/** One exact route grammar for native links, browser reads and sign-in resumption. */
export const DOWNLOAD_FILES = new Set([
  'asset.glb',
  'source.kiln.js',
  'preview.png',
  'manifest.json',
  'materials.kiln.json',
]);
export const DOWNLOAD_TOKEN = /^[a-f0-9]{64}(?![\s\S])/;

export function parseDownloadPath(path: unknown): { token: string; filename: string } | null {
  if (typeof path !== 'string') return null;
  const parts = path.match(/^\/downloads\/([a-f0-9]{64})\/([a-z.]+)(?![\s\S])/);
  if (!parts || !DOWNLOAD_FILES.has(parts[2]!)) return null;
  return { token: parts[1]!, filename: parts[2]! };
}

export function validLoginReturn(path: unknown): path is string {
  return path === '/account' || parseDownloadPath(path) !== null;
}
