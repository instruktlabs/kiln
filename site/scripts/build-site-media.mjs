import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(site, 'public');
const cacheDir = join(site, '.cache');
const packsEnabled = !['0', 'false'].includes(process.env.KILN_SITE_PACKS ?? '1');
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

/**
 * Share cards are JPEG. Every network's crawler documents JPEG and PNG; the previous site's fixture required a PNG after two
 * LinkedIn-specific preview fixes, and WebP is not something all of them read. The site's page images stay AVIF and WebP.
 */
export const SOCIAL_CARD_EXTENSION = '.jpg';

/** Cards on disk that no page in this build uses: `public/social` is derived, but it keeps whatever an earlier build left (including cards written in another format). */
export const staleSocialCards = (files, cards) => {
  const wanted = new Set(cards.map((card) => `${card.slug}${SOCIAL_CARD_EXTENSION}`));
  return files.filter((file) => /\.(?:webp|jpe?g|png)$/.test(file) && !wanted.has(file)).sort();
};

export function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const executable = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!executable) throw new Error('Social-card generation needs Chrome or Chromium. Set CHROME_PATH to its executable.');
  return executable;
}

async function buildMedia() {
  for (const directory of ['fonts', 'social']) await mkdir(join(publicDir, directory), { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  const archivo = join(site, 'node_modules', '@fontsource-variable', 'archivo');
  const plex = join(site, 'node_modules', '@fontsource', 'ibm-plex-mono');
  await copyFile(join(archivo, 'files', 'archivo-latin-standard-normal.woff2'), join(publicDir, 'fonts', 'archivo-latin-full-normal.woff2'));
  await copyFile(join(archivo, 'LICENSE'), join(publicDir, 'fonts', 'Archivo-OFL.txt'));
  await copyFile(join(plex, 'LICENSE'), join(publicDir, 'fonts', 'IBM-Plex-Mono-OFL.txt'));
  for (const style of ['400-normal', '500-normal', '600-normal', '400-italic']) {
    const name = `ibm-plex-mono-latin-${style}.woff2`;
    await copyFile(join(plex, 'files', name), join(publicDir, 'fonts', name));
  }

  const logoComponent = await readFile(join(site, 'src/components/Logo.astro'), 'utf8');
  const logoPaths = logoComponent.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  if (!logoPaths) throw new Error('Logo.astro has no inline SVG mark');
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${logoPaths}</svg>`;
  await writeFile(join(publicDir, 'favicon.svg'), logo);
  for (const size of [16, 32, 180]) {
    const file = size === 180 ? 'apple-touch-icon.png' : `favicon-${size}.png`;
    await sharp(Buffer.from(logo)).resize(size, size).flatten({ background: '#eee9df' }).png().toFile(join(publicDir, file));
  }

  const release = await json(join(site, 'src/data/release.json'));
  const version = release.version.replace(/\.0$/, '');
  const farm = await json(join(site, 'src/data/packs/farm.json'));
  const vehicles = await json(join(site, 'src/data/packs/vehicles.json'));
  const bridge = await json(join(site, 'src/data/standalone/golden-gate-bridge.json'));
  const foundryFloor = await json(join(site, 'src/data/foundry-floor.json'));
  const homePoster = packsEnabled ? (process.env.KILN_SITE_HERO === 'golden-gate-bridge' ? bridge : farm.assets.find((asset) => asset.id === 'farmhouse'))?.poster.src : undefined;
  const cards = [
    { slug: 'home', title: 'Build and revise 3D assets with your coding agent.', note: `Kiln · ${version} source release`, poster: homePoster },
    { slug: 'packs', title: 'Assets made with Kiln.', note: 'Kiln Commons', poster: homePoster },
    { slug: 'farm', title: 'Shapes & Seasons Farm', note: '23 assets · Kiln Commons', poster: packsEnabled ? farm.scene.poster.src : undefined },
    { slug: 'vehicles', title: 'Generic Road Vehicles', note: `${vehicles.assetCount} assets · Kiln Commons`, poster: packsEnabled ? vehicles.assets.find((asset) => asset.slug === 'sedan').poster.src : undefined },
    { slug: 'scenes', title: 'See the assets together.', note: 'Scenes made with Kiln', poster: packsEnabled ? farm.scene.poster.src : undefined },
    { slug: 'docs', title: 'Make the next revision.', note: 'Kiln documentation' },
    { slug: 'foundry-floor', title: foundryFloor.name, note: 'In production · Kiln Commons' },
    { slug: 'gallery', title: 'Read the source. Inspect the asset.', note: 'The Kiln gallery', poster: homePoster },
    { slug: 'archive', title: 'Earlier Kiln examples.', note: 'Unreviewed historical examples' },
  ];
  if (packsEnabled) {
    const packNames = { farm: 'Shapes & Seasons Farm', vehicles: 'Generic Road Vehicles' };
    for (const asset of [...farm.assets, ...vehicles.assets, bridge]) cards.push({ slug: asset.slug, title: asset.name, note: asset.pack ? `${packNames[asset.pack]} · Kiln Commons` : 'Standalone · Kiln Commons', poster: asset.poster.src });
  }
  const archiveIndex = join(publicDir, 'assets/index.json');
  if (existsSync(archiveIndex)) {
    const archive = await json(archiveIndex);
    for (const asset of archive) cards.push({ slug: `archive-${asset.name}`, title: asset.name.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' '), note: 'Earlier Kiln example · Unreviewed', poster: `/${asset.poster ?? asset.thumb}` });
  }
  const archivoData = (await readFile(join(publicDir, 'fonts/archivo-latin-full-normal.woff2'))).toString('base64');
  const plexData = (await readFile(join(publicDir, 'fonts/ibm-plex-mono-latin-400-normal.woff2'))).toString('base64');
  let prior = {};
  try { prior = await json(join(cacheDir, 'social-cards.json')); } catch { /* First build. */ }
  const records = {};
  let browser;
  let built = 0;
  try {
    for (const card of cards) {
      let poster = '';
      if (card.poster) {
        const file = resolve(publicDir, `.${card.poster}`);
        const bytes = await readFile(file).catch(() => { throw new Error(`Social card needs ${card.poster}. Run assets and fetch-mirror before build-site-media.`); });
        const resized = await sharp(bytes).resize(650, 550, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
        poster = `data:image/webp;base64,${resized.toString('base64')}`;
      }
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
      @font-face{font-family:Archivo;src:url(data:font/woff2;base64,${archivoData});font-weight:100 900;font-stretch:62% 125%}
      @font-face{font-family:Plex;src:url(data:font/woff2;base64,${plexData})}
      *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#eee9df;color:#292d29;font-family:Archivo,sans-serif;padding:48px 54px;background-image:linear-gradient(#292d290b 1px,transparent 1px),linear-gradient(90deg,#292d290b 1px,transparent 1px);background-size:24px 24px}
      header{display:flex;gap:12px;align-items:center;font-size:32px;font-weight:650}header svg{width:44px;height:44px}main{display:flex;height:406px;align-items:center;gap:24px}h1{font-size:${poster ? 56 : 72}px;font-weight:600;line-height:1.04;letter-spacing:-.025em;font-stretch:112%;margin:0;max-width:${poster ? 560 : 900}px;text-wrap:balance}main img{width:490px;height:406px;object-fit:contain;flex:none}footer{display:flex;justify-content:space-between;padding-top:20px;border-top:1px solid #292d29;font:16px Plex,monospace}h1{flex:1}footer span:first-child{color:#a44024}
      </style></head><body><header>${logo}<span>Kiln</span></header><main><h1>${escape(card.title)}</h1>${poster ? `<img src="${poster}" alt="">` : ''}</main><footer><span>${escape(card.note)}</span><span>kilnstudio.tools</span></footer></body></html>`;
      const digest = createHash('sha256').update(html).update('social-v2-jpeg-86').digest('hex');
      records[card.slug] = digest;
      const output = join(publicDir, 'social', `${card.slug}${SOCIAL_CARD_EXTENSION}`);
      if (prior[card.slug] === digest && existsSync(output)) continue;
      if (!browser) browser = await puppeteer.launch({ executablePath: chromeExecutable(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const png = await page.screenshot({ type: 'png' });
        // Full chroma resolution: the card is mostly text and thin rules, which 4:2:0 would fringe.
        const bytes = await sharp(png).jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
        if (bytes.length >= 300_000) throw new Error(`Social card exceeds 300 KB: ${card.slug}`);
        await writeFile(output, bytes);
        built++;
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); }
  await writeFile(join(cacheDir, 'social-cards.json'), JSON.stringify(records, null, 2));
  const stale = staleSocialCards(await readdir(join(publicDir, 'social')), cards);
  for (const file of stale) await rm(join(publicDir, 'social', file));
  console.log(`Site media: self-hosted fonts with OFL notices, favicons, ${built} social cards built (${cards.length - built} cached${stale.length ? `, ${stale.length} stale removed: ${stale.join(', ')}` : ''}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildMedia();
