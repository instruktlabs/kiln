import { expect, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontverter from 'fontverter';
import { create } from 'fontkitten';
import { collectSiteCharacters, subsetSiteFonts, textFromHtml } from './subset-site-fonts.mjs';

async function decode(bytes: Buffer) {
  const font = create(await fontverter.convert(bytes, 'sfnt'));
  if (font.isCollection) throw new Error('Unexpected font collection');
  return font;
}

test('font characters include decoded source text and fallbacks without script/style payloads', () => {
  const text = textFromHtml('<h1>Caf&eacute; &amp; Kiln</h1><pre><code>const angle = 45&deg;;</code></pre><script>Ж</script><style>Ω</style><!--Ф--><template><p>±</p></template><img alt="Façade"><input placeholder="£">');
  expect(text).toContain('Café & Kiln'); expect(text).toContain('45°'); expect(text).toContain('±'); expect(text).toContain('Façade'); expect(text).toContain('£');
  expect(text).not.toContain('Ж'); expect(text).not.toContain('Ω'); expect(text).not.toContain('Ф');
});

test('emitted subsets retain every required glyph, both complete Archivo axes, names, notices and repeatable cache', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'kiln-site-font-subsets-'));
  try {
    const distDir = join(temp, 'dist'), sourceDir = join(temp, 'src'), sourceFontsDir = join(temp, 'original-fonts'), cacheDir = join(temp, 'cache');
    await Promise.all([mkdir(join(distDir, 'fonts'), { recursive: true }), mkdir(sourceDir), mkdir(sourceFontsDir)]);
    const filenames = ['archivo-latin-full-normal.woff2', ...['400-normal', '500-normal', '600-normal', '400-italic'].map((style) => `ibm-plex-mono-latin-${style}.woff2`)];
    for (const filename of filenames) {
      const source = filename.startsWith('archivo') ? 'node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2' : `node_modules/@fontsource/ibm-plex-mono/files/${filename}`;
      const originalPath = fileURLToPath(new URL(`../${source}`, import.meta.url));
      await copyFile(originalPath, join(sourceFontsDir, filename)); await copyFile(originalPath, join(distDir, 'fonts', filename));
    }
    await writeFile(join(distDir, 'index.html'), '<h1>Build and revise café assets.</h1><p>Floor ±2°; façade © 2026 →</p><pre>const value = "é";</pre>');
    await writeFile(join(sourceDir, 'Viewer.tsx'), 'export const message = "Chargé · € £ — ↔";');
    await writeFile(join(distDir, 'fonts/Archivo-OFL.txt'), 'Original OFL notice');
    const options = { distDir, sourceDir, sourceFontsDir, cacheDir };
    const characters = await collectSiteCharacters(options); expect(characters).toContain('é'); expect(characters).toContain('£'); expect(characters).toContain('↔'); expect(characters).toContain('Z');
    const result = await subsetSiteFonts(options); expect(result.fonts).toHaveLength(5);
    const firstOutputs = [];
    for (const filename of filenames) {
      const beforeBytes = await readFile(join(sourceFontsDir, filename)), afterBytes = await readFile(join(distDir, 'fonts', filename)); firstOutputs.push(afterBytes);
      const before = await decode(beforeBytes), after = await decode(afterBytes);
      const expected = [...characters].map((char) => char.codePointAt(0)!).filter((point) => before.characterSet.includes(point));
      expect(expected.every((point) => after.hasGlyphForCodePoint(point))).toBe(true);
      expect(after.variationAxes).toEqual(before.variationAxes);
      expect(after.fullName).toBe(before.fullName); expect(after.familyName).toBe(before.familyName); expect(after.copyright).toBe(before.copyright);
      expect(before.getName('licenseURL')).toBeTruthy();
      for (const name of ['license', 'licenseURL']) expect(after.getName(name)).toBe(before.getName(name));
      expect(afterBytes.length).toBeLessThan(beforeBytes.length);
      if (filename.startsWith('archivo')) { expect(after.variationAxes.wght).toEqual({ name: 'Weight', min: 100, default: 600, max: 900 }); expect(after.variationAxes.wdth).toEqual({ name: 'Width', min: 62, default: 100, max: 125 }); expect(afterBytes.length).toBeLessThan(beforeBytes.length * 0.8); }
    }
    const cached = await subsetSiteFonts(options); expect(cached.fonts.every((font: { cached: boolean }) => font.cached)).toBe(true);
    for (let i = 0; i < filenames.length; i++) expect(await readFile(join(distDir, 'fonts', filenames[i]!))).toEqual(firstOutputs[i]);
    expect(await readFile(join(distDir, 'fonts/Archivo-OFL.txt'), 'utf8')).toBe('Original OFL notice');
    await writeFile(join(distDir, 'extra.html'), '<p>New character: Å</p>');
    const updated = await subsetSiteFonts(options); expect(updated.fonts.every((font: { cached: boolean }) => !font.cached)).toBe(true); expect((await decode(await readFile(join(distDir, 'fonts', filenames[0]!)))).hasGlyphForCodePoint(0xC5)).toBe(true);
  } finally {
    const target = resolve(temp); if (!target.startsWith(resolve(tmpdir())) || !target.includes('kiln-site-font-subsets-')) throw new Error('Unsafe test cleanup path'); await rm(target, { recursive: true, force: true });
  }
}, 20000);
