// Sim-spec 12 test 8 (honesty) on what bun can see: no excluded name (the research pack's report, section c, and
// the task's list of companies and products) in any data, source or built string; the About text carries the
// mode label, the synthetic label, the route compression note, the label legend and the product story; the HUD
// line always names the mode and scale, and megafab mode adds the synthetic label.
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import about from '../../data/about.json';
import { FAB_DATA } from '../../src/sim/data';
import { hudLines } from '../../src/scene/hud-text';

const PACKAGE = resolve(import.meta.dir, '../..');
// Case-sensitive whole words, so ordinary words (telemetry, lamp, semiconductor, spectral) do not match.
const EXCLUDED = [
  'Terafab', 'Tesla', 'SpaceX', 'xAI', 'Intel', 'ASML', 'Musk', 'TWINSCAN', 'NXE', 'EXE', 'LITHIUS', 'Tactras', 'CELLESTA',
  'Purion', 'Cleanway', 'Spectra', 'Giga\\w*', 'Entegris', 'Daifuku', 'TEL', 'TELINDY', 'Lam', 'Axcelis', 'Muratec', 'Samsung',
  'TSMC', 'Trumpf', 'SEMI', 'Grimes',
];
const PATTERN = new RegExp(`\\b(${EXCLUDED.join('|')})\\b`);

function files(dir: string, exts: string[], skip: string[] = []): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (skip.some(s => path.replaceAll('\\', '/').includes(s))) continue;
    if (statSync(path).isDirectory()) out.push(...files(path, exts, skip));
    else if (exts.includes(extname(name))) out.push(path);
  }
  return out;
}

describe('sim-spec 12 test 8: honesty', () => {
  test('no excluded name in data, sources, scripts or the built scene', () => {
    const scan = [
      ...files(resolve(PACKAGE, 'data'), ['.json'], ['data/warm']),
      ...files(resolve(PACKAGE, 'src'), ['.ts', '.tsx', '.css', '.html']),
      ...files(resolve(PACKAGE, 'standalone'), ['.ts', '.tsx', '.html', '.css']),
      ...files(resolve(PACKAGE, 'scripts'), ['.ts']),
      ...files(resolve(PACKAGE, 'staged'), ['.json']),
      ...files(resolve(PACKAGE, 'dist'), ['.js', '.html', '.css', '.json']),
    ];
    expect(scan.length).toBeGreaterThan(15);
    const hits = scan.flatMap(path => {
      const m = PATTERN.exec(readFileSync(path, 'utf8'));
      return m ? [`${path}: ${m[0]}`] : [];
    });
    expect(hits).toEqual([]);
  });

  test('About this model: mode label, synthetic label, route compression, label legend, product story', () => {
    expect(about.title).toBe('About this model');
    expect(about.modeLabel).toContain('always on screen');
    expect(about.syntheticLabel).toBe(FAB_DATA.config.modes.megafab.syntheticLabel);
    const text = about.sections.map(s => `${s.heading} ${s.body}`).join(' ');
    expect(text).toContain(about.syntheticLabel);
    expect(text).toContain('240 steps');
    expect(Object.keys(about.labels)).toEqual(['C', 'R', 'T', 'E', 'S']);
    expect(about.product).toContain('2 nm-class');
    expect(about.product).toContain('300 mm');
  });

  test('the HUD line always names the mode and the scale; megafab adds the synthetic label', () => {
    for (const mode of ['pilot', 'megafab'] as const) {
      for (const scale of FAB_DATA.config.scales.values) {
        const lines = hudLines({ mode, scale, simMs: 30 * 86_400_000, synthetic: mode === 'megafab' ? 15 : 0 });
        expect(lines.mode).toContain(mode === 'pilot' ? FAB_DATA.config.modes.pilot.label : FAB_DATA.config.modes.megafab.label);
        expect(lines.mode).toContain(scale === 0 ? 'Paused' : `${scale}x`);
        expect(lines.mode).toContain('day 30 00:00');
        if (mode === 'megafab') expect(lines.synthetic).toContain(FAB_DATA.config.modes.megafab.syntheticLabel);
        else expect(lines.synthetic).toBe('');
      }
    }
  });
});
