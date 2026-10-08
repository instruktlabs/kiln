/**
 * Historical example sources still execute; their public inventory and credits agree.
 *
 * The examples are not decoration: they are the gallery in the README, they are
 * what a reader looks at first, and `scripts/hero-shots.ts` regenerates the
 * published renders straight from them. Until this file existed, none of that
 * was covered. Two examples were deleted during a gallery edit and the suite did
 * not move by a single test, and a triangle count in the README sat 552 wrong
 * for as long as it took someone to re-render the asset by hand and notice.
 *
 * These are unvetted assets from earlier engine versions, not golden geometry.
 * Current helper improvements may change tessellation. Published triangle counts
 * describe the historical gallery, so they are not current-engine regression targets.
 *
 * It runs on the CPU path (no render service required) and does not rasterize.
 * Execution is where the cost and the risk both are -- booleans, revolves,
 * procedural textures -- so it is the part worth guarding in CI.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { readAuthorship } from '../../scripts/authorship';
import { resolveEvaluatorPortV2 } from '../evaluator/protocol';

const REPO = resolve(import.meta.dir, '..', '..');
const EXAMPLES = join(REPO, 'examples');
const RENDERS = join(EXAMPLES, 'renders');

const names = (await readdir(EXAMPLES))
  .filter((f) => f.endsWith('.kiln.js'))
  .map((f) => basename(f, '.kiln.js'))
  .sort();

type Outcome = { tris: number; bytes: number; warnings: string[] } | { error: string };

/**
 * Executed once, at module scope, because several assertions need the same
 * result and a boolean-heavy building is not cheap to run twice. Failures are
 * captured rather than thrown so that one broken example reports as one failing
 * test instead of taking the whole file down with it.
 */
const outcomes = new Map<string, Outcome>(
  await Promise.all(
    names.map(async (name): Promise<[string, Outcome]> => {
      try {
        const code = await readFile(join(EXAMPLES, `${name}.kiln.js`), 'utf8');
        const evaluator = resolveEvaluatorPortV2(undefined, 'trusted-local');
        const r = await evaluator.render(code);
        return [name, { tris: r.tris, bytes: r.glb.byteLength, warnings: r.warnings }];
      } catch (err) {
        return [name, { error: err instanceof Error ? err.message : String(err) }];
      }
    }),
  ),
);

// Completed local sweep/loft checks no longer emit unconditional unchecked warnings.
// Exact remaining advisory groups are still asserted, without a blanket filter.
const documentedAdvisories: Record<string, string[]> = {
  'demo-floating-observatory': [
    'Floating parts (no mesh overlap with any sibling, 2cm tol): Mesh_WaterfallSprayDroplet_3 — Fix: shift "Mesh_WaterfallSprayDroplet_3" by [0.000, 0.000, -0.024] toward "Mesh_ContinuousWaterCurtain", or call snapTo(part, hostPart) to do it automatically. | Mesh_WaterfallSprayDroplet_5 — Fix: shift "Mesh_WaterfallSprayDroplet_5" by [0.000, 0.000, -0.026] toward "Mesh_ContinuousWaterCurtain", or call snapTo(part, hostPart) to do it automatically. | Mesh_WaterfallSprayDroplet_9 — Fix: shift "Mesh_WaterfallSprayDroplet_9" by [0.000, 0.000, -0.046] toward "Mesh_ContinuousWaterCurtain", or call snapTo(part, hostPart) to do it automatically. | Mesh_WaterfallSprayDroplet_11 — Fix: shift "Mesh_WaterfallSprayDroplet_11" by [0.000, 0.000, -0.059] toward "Mesh_ContinuousWaterCurtain", or call snapTo(part, hostPart) to do it automatically.',
  ],
};

describe('examples', () => {
  it('finds a non-trivial set to check', () => {
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  for (const name of names) {
    it(`${name} executes and produces geometry`, () => {
      const out = outcomes.get(name)!;
      if ('error' in out) throw new Error(`${name} failed to execute: ${out.error}`);
      expect(out.tris).toBeGreaterThan(0);
      expect(out.bytes).toBeGreaterThan(0);
      // Subdivision legitimately replaces primitive face provenance. Keep that
      // exact advisory visible; unexpected attribute loss or defects still fail.
      const expected =
        name === 'lighthouse'
          ? [
              'SUBDIVIDE_PROVENANCE_DROPPED (8 meshes: Mesh_Rock1, Mesh_Rock2, Mesh_Rock3, +5 more): Subdivision changed triangle topology. Source face/range provenance was discarded rather than guessed.',
            ]
          : (documentedAdvisories[name] ?? []);
      // Conversion cleanup is a defined, visible engine event, not a newly
      // accepted asset defect. Its topology/attribute guarantees have independent
      // numeric regressions; every other warning retains the exact check here.
      // Meshes that removed the same number of faces share one grouped line.
      const precisionNotice =
        /^(?:.+: SOLID_FLOAT32_CANONICALIZED|SOLID_FLOAT32_CANONICALIZED \(\d+ meshes: .+\):) Removed [1-9]\d* zero-area Float32 faces and rebuilt their topology with Manifold\. Source runs and properties were retained; this is precision cleanup, not general mesh repair\.$/;
      expect(out.warnings.filter((warning) => !precisionNotice.test(warning))).toEqual(expected);
    });
  }
});

describe('hero gallery', () => {
  /**
   * Read the hero list out of the script rather than importing it: importing
   * `hero-shots.ts` pulls in the render port and would try to build one. The
   * list is a plain literal, so a regex over the source is enough and cannot
   * drift from what the script actually renders.
   */
  const heroes = (async () => {
    const src = await readFile(join(REPO, 'scripts', 'hero-shots.ts'), 'utf8');
    const block = /const HEROES = \[([^\]]*)\] as const;/.exec(src);
    if (!block) throw new Error('could not find the HEROES list in scripts/hero-shots.ts');
    return [...block[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  })();

  const readme = readFile(join(REPO, 'docs/examples.md'), 'utf8').then((text) =>
    text
      .replaceAll('https://github.com/instruktlabs/kiln/blob/main/examples/', 'examples/')
      .replaceAll('../examples/', 'examples/'),
  );

  it('names every public example and matches the documented collection count', async () => {
    const excluded = [
      'crate',
      'well',
      'tidal-observatory',
      'fire-lookout-tower',
      'brass-tellurion',
      'victorian-greenhouse',
    ];
    const publicNames = names.filter(
      (name) => !excluded.includes(name) && !name.startsWith('demo-'),
    );
    expect([...(await heroes)].sort()).toEqual(publicNames);
    const count = /public gallery contains (\d+) selected examples/.exec(await readme);
    expect(count).not.toBeNull();
    expect(Number(count![1])).toBe(publicNames.length);
  });

  it('has a poster receipt for every public hero and only the explicitly retained archive', async () => {
    const publicHeroes = await heroes;
    const archives = [
      'tidal-observatory',
      'fire-lookout-tower',
      'brass-tellurion',
      'victorian-greenhouse',
    ];
    for (const archive of archives) expect(publicHeroes).not.toContain(archive);
    // The images are served from R2 and no longer sit in the tree, so this keys
    // on the poster receipts that stayed behind: one per attested render, and the
    // only leg of this check a local test can honestly make. `tidal-observatory`
    // is an archive entry predating the receipts and is the single exception.
    // That the published bytes exist and still match is checked by
    // `scripts/verify-posters.mjs`, the only layer that can see them.
    const expected = [...publicHeroes, ...archives]
      .filter((h) => h !== 'tidal-observatory')
      .map((h) => `${h}.json`)
      .sort();
    const actual = (await readdir(RENDERS))
      .filter((f) => f.endsWith('.json') && !f.startsWith('demo-'))
      .sort();
    expect(actual).toEqual(expected);
  });

  it('has a poster receipt for every curated demo addition', async () => {
    const demos = names.filter((n) => n.startsWith('demo-'));
    expect(demos.length).toBe(18);
    const expected = demos.map((d) => `${d}.json`).sort();
    const actual = (await readdir(RENDERS))
      .filter((f) => f.startsWith('demo-') && f.endsWith('.json'))
      .sort();
    expect(actual).toEqual(expected);
  });

  it('is in the README exactly once per hero, with no cell for anything else', async () => {
    const src = await readme;
    // Scoped to the gallery table specifically. The README has a second table
    // below it for the animated examples, and those cells link back to programs
    // that are already heroes — counting them here would read as duplicates and
    // make the check fail for a README that is correct.
    const gallery = /<table>[\s\S]*?<\/table>/.exec(src);
    if (!gallery) throw new Error('no gallery table in README.md');
    const cells = [...gallery[0].matchAll(/href="examples\/([a-z0-9-]+)\.kiln\.js"/g)].map(
      (m) => m[1]!,
    );
    expect(cells.sort()).toEqual([...(await heroes)].sort());
  });

  /**
   * The animated examples get a GIF each, and a README that points at one which
   * was never rendered shows a broken image to everyone who opens the page.
   * Same lockstep as the stills: the list in the script, the files on disk, and
   * the cells in the README all have to agree.
   */
  it('has a GIF for every animated example the README shows, and no orphans', async () => {
    const script = await readFile(join(REPO, 'scripts', 'anim-gifs.ts'), 'utf8');
    const block =
      /const GIFS: readonly \{ name: string; clip: string \}\[\] = \[([\s\S]*?)\];/.exec(script);
    if (!block) throw new Error('could not find the GIFS list in scripts/anim-gifs.ts');
    const declared = [...block[1]!.matchAll(/name: '([^']+)'/g)].map((m) => m[1]!).sort();

    // No third leg here. GIFs are assembled from frames and were never attested
    // individually, so once they moved to R2 nothing local can say whether one
    // exists; `scripts/verify-posters.mjs` checks that over HTTP instead. What is
    // still worth guarding locally is that the script, the README and the
    // programs agree, which is where the typos actually happen.
    const src = await readme;
    // Posters and GIFs are linked absolutely from R2 now, so key on the file
    // name rather than a repository-relative path.
    const shown = [...src.matchAll(/src="[^"]*renders\/([a-z0-9-]+)\.gif"/g)]
      .map((m) => m[1]!)
      .sort();
    expect(shown).toEqual(declared);

    // A GIF only means anything if the program actually defines the clip.
    for (const name of declared) expect(names).toContain(name);
  });

  it('credits each example from its source header or exact-source run record', async () => {
    const table = await readme;
    for (const hero of await heroes) {
      const source = await readFile(join(EXAMPLES, `${hero}.kiln.js`), 'utf8');
      let display = readAuthorship(source).display;
      try {
        const record = JSON.parse(
          await readFile(join(EXAMPLES, `${hero}.provenance.json`), 'utf8'),
        );
        expect(record.sourceHash).toBe(createHash('sha256').update(source).digest('hex'));
        expect(typeof record.model).toBe('string');
        display = record.model;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      expect(display).not.toBeNull();
      const cell = table
        .split('\n')
        .find((line) => line.includes(`href="examples/${hero}.kiln.js"`));
      expect(cell).toBeDefined();
      expect(cell).toContain(display!);
    }
  });
});
