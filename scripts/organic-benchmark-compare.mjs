/**
 * Build, QA, render and composite before/after organic benchmark programs.
 *
 *   KILN_RENDER=cpu node scripts/organic-benchmark-compare.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { resolveEvaluatorPortV2 } from '../src/evaluator/protocol.ts';
import { renderGlbViewGrid } from '../src/views/index.ts';
import { assertSeahorseAfterGuards } from './organic-benchmark-guards.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const BENCH = join(REPO, 'benchmark', 'organic-comparison');
const OUT = join(REPO, 'output', 'organic-benchmark');
const ARTIFACTS = '/opt/cursor/artifacts';

const SUBJECTS = ['stylised-newt', 'pine-tree', 'rock-cluster', 'jellyfish', 'seahorse'];

const COMPARE_VIEW = {
  capture: {
    preset: '1x1',
    cells: [{ azimuthDeg: 35, elevationDeg: 26, zoom: 1.06 }],
  },
  size: 512,
};

const SHEET_VIEW = { capture: { preset: '3x2' }, size: 384 };

async function evaluateLane(evaluator, lane, subject) {
  const path = join(BENCH, lane, `${subject}.kiln.js`);
  const code = await readFile(path, 'utf8');
  const started = performance.now();
  const rendered = await evaluator.render(code);
  const buildMs = performance.now() - started;
  const triangles = rendered.tris ?? 0;
  const qa = rendered.meta?.qaReport;
  const acceptance = qa?.acceptance ?? 'unknown';
  const blockers = (qa?.findings ?? []).filter((f) => f.disposition === 'block').length;

  const glbBytes = Uint8Array.from(rendered.glb);
  const sheet = await renderGlbViewGrid(glbBytes, SHEET_VIEW);
  const hero = await renderGlbViewGrid(glbBytes, COMPARE_VIEW);

  const facetingNote = 'seeComparePng';

  return {
    lane,
    subject,
    buildMs: Math.round(buildMs),
    triangles,
    qaAcceptance: acceptance,
    qaBlockers: blockers,
    topologyNote: facetingNote,
    sheetPng: sheet.png,
    heroPng: hero.png,
  };
}

async function compositeCompare(beforePng, afterPng, subject, outPath) {
  const labelH = 36;
  const w = 512;
  const h = 512;
  const left = await sharp(Buffer.from(beforePng)).resize(w, h).png().toBuffer();
  const right = await sharp(Buffer.from(afterPng)).resize(w, h).png().toBuffer();
  const row = await sharp({
    create: {
      width: w * 2,
      height: h + labelH,
      channels: 4,
      background: { r: 24, g: 26, b: 32, alpha: 1 },
    },
  })
    .composite([
      { input: left, top: labelH, left: 0 },
      { input: right, top: labelH, left: w },
    ])
    .png()
    .toBuffer();

  const labeled = await sharp(row)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${w * 2}" height="${labelH}">
            <text x="20" y="24" fill="#e8eaed" font-family="sans-serif" font-size="18">BEFORE (legacy API)</text>
            <text x="${w + 20}" y="24" fill="#8fd5a6" font-family="sans-serif" font-size="18">AFTER (organic helpers)</text>
            <text x="${w - 80}" y="24" fill="#9aa0a6" font-family="sans-serif" font-size="14">${subject}</text>
          </svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  await writeFile(outPath, labeled);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(ARTIFACTS, { recursive: true }).catch(() => {});
  const evaluator = resolveEvaluatorPortV2(undefined, 'trusted-local');
  const metrics = [];

  for (const subject of SUBJECTS) {
    const before = await evaluateLane(evaluator, 'before', subject);
    if (subject === 'seahorse') {
      const afterPath = join(BENCH, 'after', `${subject}.kiln.js`);
      await assertSeahorseAfterGuards(await readFile(afterPath, 'utf8'));
    }
    const after = await evaluateLane(evaluator, 'after', subject);

    const sheetBefore = join(OUT, `${subject}-before-sheet.png`);
    const sheetAfter = join(OUT, `${subject}-after-sheet.png`);
    const compare = join(OUT, `${subject}-compare.png`);
    await writeFile(sheetBefore, before.sheetPng);
    await writeFile(sheetAfter, after.sheetPng);
    await compositeCompare(before.heroPng, after.heroPng, subject, compare);

    for (const [name, file] of [
      [`organic-${subject}-before-sheet.png`, sheetBefore],
      [`organic-${subject}-after-sheet.png`, sheetAfter],
      [`organic-${subject}-compare.png`, compare],
    ]) {
      try {
        await writeFile(join(ARTIFACTS, name), await readFile(file));
      } catch {
        /* artifacts dir optional locally */
      }
    }

    metrics.push({
      subject,
      before: {
        buildMs: before.buildMs,
        triangles: before.triangles,
        qaAcceptance: before.qaAcceptance,
        qaBlockers: before.qaBlockers,
        topologyNote: before.topologyNote,
      },
      after: {
        buildMs: after.buildMs,
        triangles: after.triangles,
        qaAcceptance: after.qaAcceptance,
        qaBlockers: after.qaBlockers,
        topologyNote: after.topologyNote,
      },
    });
    console.log(
      `${subject}: before ${before.triangles} tris / after ${after.triangles} tris — QA ${before.qaAcceptance} → ${after.qaAcceptance}`,
    );
  }

  const tablePath = join(OUT, 'metrics.json');
  await writeFile(
    tablePath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), metrics }, null, 2)}\n`,
  );
  try {
    await writeFile(join(ARTIFACTS, 'organic-benchmark-metrics.json'), await readFile(tablePath));
  } catch {
    /* optional */
  }
  console.log(`Wrote ${tablePath}`);
}

await main();
