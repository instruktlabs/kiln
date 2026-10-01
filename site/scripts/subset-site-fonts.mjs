import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import subsetFont from 'subset-font';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SUBSETTER_VERSION = require('subset-font/package.json').version;
const FONT_NAMES = ['archivo-latin-full-normal.woff2', ...['400-normal', '500-normal', '600-normal', '400-italic'].map((style) => `ibm-plex-mono-latin-${style}.woff2`)];
const OPTIONS = { targetFormat: 'woff2', preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17] };
// No variationAxes, keepFeatures, noHinting or dropTables override: keep the full design space and layout behavior.
const COMMON_TEXT = '\u00a0©®™¢£¥€°±²·×÷−–—‘’‚“”„…•′″‹›←→↑↓↔≤≥';
const SOURCE_EXTENSIONS = new Set(['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.css', '.txt']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

/** Decode HTML entities and include code, templates and accessible image/input fallback text. */
export function textFromHtml(html) {
  const text = [];
  const walk = (node) => {
    if (node.tagName === 'script' || node.tagName === 'style') return;
    if (node.nodeName === '#text') text.push(node.value);
    for (const attr of node.attrs ?? []) if (['alt', 'title', 'aria-label', 'placeholder', 'value'].includes(attr.name)) text.push(attr.value);
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content);
  };
  walk(parse(html));
  return text.join('\n');
}

export async function collectSiteCharacters({ distDir = join(SITE, 'dist'), sourceDir = join(SITE, 'src') } = {}) {
  const htmlFiles = (await filesBelow(distDir)).filter((file) => file.endsWith('.html'));
  if (!htmlFiles.length) throw new Error('Font subsetting requires emitted HTML; run Astro build first.');
  const characters = new Set([...COMMON_TEXT, ...Array.from({ length: 95 }, (_, index) => String.fromCodePoint(index + 32))]);
  const add = (text) => { for (const char of text) if (char.codePointAt(0) >= 32) characters.add(char); };
  for (const file of htmlFiles) add(textFromHtml(await readFile(file, 'utf8')));
  // Include UI messages and labels that are inserted only after viewer/scene/copy interactions.
  for (const file of await filesBelow(sourceDir)) {
    if (!SOURCE_EXTENSIONS.has(extname(file))) continue;
    const source = await readFile(file, 'utf8'); add(source);
    for (const match of source.matchAll(/\\u(?:\{([\da-fA-F]{1,6})\}|([\da-fA-F]{4}))/g)) {
      const point = Number.parseInt(match[1] ?? match[2], 16);
      if (point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)) add(String.fromCodePoint(point));
    }
  }
  return [...characters].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

/** Change only dist fonts. Public originals remain available for social cards and coverage audits. */
export async function subsetSiteFonts({ distDir = join(SITE, 'dist'), sourceDir = join(SITE, 'src'), sourceFontsDir = join(SITE, 'public/fonts'), cacheDir = join(SITE, '.cache/font-subsets') } = {}) {
  if (resolve(sourceFontsDir) === resolve(distDir, 'fonts')) throw new Error('The full source fonts must be separate from the emitted subset fonts.');
  const text = await collectSiteCharacters({ distDir, sourceDir });
  const charsetSha256 = hash(text);
  await mkdir(cacheDir, { recursive: true });
  await mkdir(join(distDir, 'fonts'), { recursive: true });
  const fonts = [];
  for (const filename of FONT_NAMES) {
    const original = await readFile(join(sourceFontsDir, filename));
    const sourceSha256 = hash(original);
    const cacheKey = hash(Buffer.concat([original, Buffer.from(`\0${text}\0${SUBSETTER_VERSION}\0${JSON.stringify(OPTIONS)}`)]));
    const cachedPath = join(cacheDir, `${cacheKey}.woff2`), receiptPath = join(cacheDir, `${cacheKey}.json`);
    let bytes, cached = false;
    try {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      bytes = await readFile(cachedPath);
      if (receipt.sha256 !== hash(bytes) || receipt.bytes !== bytes.length || receipt.sourceSha256 !== sourceSha256 || receipt.charsetSha256 !== charsetSha256) throw new Error(`Font subset cache integrity failed: ${filename}`);
      cached = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      bytes = await subsetFont(original, text, OPTIONS);
      if (bytes.toString('ascii', 0, 4) !== 'wOF2') throw new Error(`Subsetter did not emit WOFF2: ${filename}`);
      await writeFile(cachedPath, bytes);
      await writeFile(receiptPath, `${JSON.stringify({ sourceSha256, charsetSha256, subsetterVersion: SUBSETTER_VERSION, bytes: bytes.length, sha256: hash(bytes) }, null, 2)}\n`);
    }
    await writeFile(join(distDir, 'fonts', filename), bytes);
    fonts.push({ file: filename, originalBytes: original.length, bytes: bytes.length, savedBytes: original.length - bytes.length, sourceSha256, sha256: hash(bytes), cached });
  }
  const report = { subsetterVersion: SUBSETTER_VERSION, requestedCodePoints: [...text].length, charsetSha256, fonts };
  await writeFile(join(cacheDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = (flag) => args.includes(flag) ? resolve(args[args.indexOf(flag) + 1]) : undefined;
  const report = await subsetSiteFonts({ distDir: value('--dist'), sourceDir: value('--source'), sourceFontsDir: value('--fonts'), cacheDir: value('--cache') });
  console.log(`Font subsets: ${report.fonts.length} WOFF2 files; ${report.fonts.reduce((sum, font) => sum + font.savedBytes, 0).toLocaleString('en-US')} bytes saved; Archivo keeps both full variable axes.`);
}
