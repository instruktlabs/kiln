import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MEDIA_WIDTHS = Object.freeze([320, 480, 672, 768, 1024, 1440]);
const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function imageSrcsets(inputPath, width) {
  if (typeof inputPath !== 'string' || !Number.isFinite(width) || width <= 0) throw new Error('Image variants require an input path and positive source width');
  const stem = inputPath.replace(/\.[^.]+$/, '');
  const widths = MEDIA_WIDTHS.filter((value) => value <= width);
  return {
    srcsetWebp: widths.map((value) => `/${stem}-${value}.webp ${value}w`).join(', '),
    srcsetAvif: widths.map((value) => `/${stem}-${value}.avif ${value}w`).join(', '),
  };
}

/** Refresh only derived srcset strings; never import, replace or reinterpret delivery records. */
export async function refreshMediaSrcsets({ dataDir = join(SITE, 'src/data') } = {}) {
  let filesChanged = 0, imageRecordsUpdated = 0;
  for (const filename of ['packs/farm.json', 'standalone/golden-gate-bridge.json', 'commons-build.json']) {
    const path = join(dataDir, filename), data = JSON.parse(await readFile(path, 'utf8'));
    let changed = 0;
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.inputPath === 'string' && typeof value.src === 'string' && typeof value.width === 'number') {
        const next = imageSrcsets(value.inputPath, value.width);
        if (value.srcsetWebp !== next.srcsetWebp || value.srcsetAvif !== next.srcsetAvif) { Object.assign(value, next); changed++; }
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(data);
    if (changed) { await writeFile(path, `${JSON.stringify(data, null, 2)}\n`); filesChanged++; imageRecordsUpdated += changed; }
  }
  return { filesChanged, imageRecordsUpdated, widths: MEDIA_WIDTHS };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), index = args.indexOf('--data-dir');
  console.log(JSON.stringify(await refreshMediaSrcsets({ dataDir: index === -1 ? undefined : resolve(args[index + 1]) }), null, 2));
}
