import type { Page } from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { waitFrames as frames } from '../src/testing/node';
// @ts-ignore pngjs is a pinned test dependency; no extra type package is installed.
import { PNG } from 'pngjs';

const check = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const counts = (page: Page) => page.evaluate(() => (window as any).__kilnScene.instanceStats() as { name: string; count: number; tangent: boolean; colors: number[] | null }[]);
const linear = (channel: number) => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; };
function regionDifference(a: any, b: any, rect: { x: number; y: number; width: number; height: number }, scaleX: number, scaleY: number) {
  const x0 = Math.max(0, Math.floor(rect.x * scaleX)), x1 = Math.min(a.width, Math.ceil((rect.x + rect.width) * scaleX));
  const y0 = Math.max(0, Math.floor(rect.y * scaleY)), y1 = Math.min(a.height, Math.ceil((rect.y + rect.height) * scaleY));
  let difference = 0, pixels = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const at = (y * a.width + x) * 4; const ya = .2126 * linear(a.data[at]) + .7152 * linear(a.data[at + 1]) + .0722 * linear(a.data[at + 2]), yb = .2126 * linear(b.data[at]) + .7152 * linear(b.data[at + 1]) + .0722 * linear(b.data[at + 2]); difference += Math.abs(ya - yb); pixels++; }
  return { pixels, meanLinearLuminanceDifference: difference / Math.max(1, pixels) };
}

/** Count and pixel correctness, never performance timing. Caller owns the page and backend. */
export async function assertDemoInstances(page: Page, outDir: string): Promise<Record<string, unknown>> {
  await page.evaluate(() => { const api = (window as any).__kilnScene; api.setTimeScale(0); api.setTime(0); api.instanceProofView(); api.moveDynamic(0); api.instanceDensity(1); });
  await frames(page, 4);
  const initial = await counts(page), sourceCount = initial.filter(m => m.name.startsWith('ten-thousand/')).reduce((sum, m) => sum + m.count, 0);
  check(sourceCount === 10000, `Ten thousand static instances are drawn (${sourceCount})`);
  check(initial.filter(m => m.name.startsWith('ten-thousand/')).length > 1, 'Static set is split into spatial cells');
  const proof = await page.evaluate(() => (window as any).__kilnScene.tangentProof());
  check(proof.sourceHasTangent && proof.offenders.length === 0, 'Normal-mapped authored tangents remain on the source and every rendered instance is safe');
  check(proof.flaggedWithout.length === 1, 'Removing the derivative makes the tangent assertion flag the explicit offender');
  const look = await page.evaluate(() => (window as any).__kilnScene.lookProof());
  check(look.toneMapping === look.expectedAgX && look.exposure > 0, 'AgX is applied to the demo renderer');
  const backend = await page.evaluate(() => (window as any).__kilnHarness.snapshot().backend.backend as string);
  const canvas = await page.$('canvas'); check(canvas, 'Demo canvas exists');
  const bounds = await canvas!.boundingBox(); check(bounds, 'Canvas has a non-zero box');
  await mkdir(outDir, { recursive: true });
  const capturePath = resolve(outDir, `instances-${backend}.png`), image = PNG.sync.read(Buffer.from(await canvas!.screenshot({ path: capturePath })));
  const locations = await page.evaluate(() => (window as any).__kilnScene.tintProbePositions() as { x: number; y: number }[]);
  const colors: number[][] = [];
  for (let i = 0; i < locations.length; i++) {
    const point = locations[i]!, x = Math.round(point.x * image.width / bounds!.width), y = Math.round(point.y * image.height / bounds!.height);
    check(x >= 3 && x < image.width - 3 && y >= 3 && y < image.height - 3, `Tint ${i} probe lies inside the canvas`);
    const channels = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const at = ((y + dy) * image.width + x + dx) * 4; for (let c = 0; c < 3; c++) channels[c]! += image.data[at + c]! / 25; }
    colors.push(channels); const others = channels.filter((_v, c) => c !== i);
    check(channels[i]! > Math.max(...others) * 1.15 && channels[i]! > 45, `Per-instance ${['red', 'green', 'blue'][i]} tint reaches rendered pixels (${channels.map(c => Math.round(c)).join(',')})`);
  }
  const rectangles = await page.evaluate(() => (window as any).__kilnScene.normalProofRects() as { x: number; y: number; width: number; height: number }[]);
  const previousHudVisibility = await page.evaluate(() => { const hud = document.querySelector<HTMLElement>('.ks-hud')!; const previous = hud.style.visibility; hud.style.visibility = 'hidden'; return previous; });
  let normalShading: { rect: unknown; noise: unknown; comparison: unknown; threshold: number }[] = [];
  try {
    await page.evaluate(() => (window as any).__kilnScene.normalProofMode('instanced')); await frames(page, 3);
    const instancedPath = resolve(outDir, `normal-instanced-${backend}.png`), noisePath = resolve(outDir, `normal-instanced-repeat-${backend}.png`), referencePath = resolve(outDir, `normal-reference-${backend}.png`);
    const instancedImage = PNG.sync.read(Buffer.from(await canvas!.screenshot({ path: instancedPath }))); await frames(page, 3);
    const repeatImage = PNG.sync.read(Buffer.from(await canvas!.screenshot({ path: noisePath })));
    await page.evaluate(() => (window as any).__kilnScene.normalProofMode('reference')); await frames(page, 3);
    const referenceImage = PNG.sync.read(Buffer.from(await canvas!.screenshot({ path: referencePath })));
    normalShading = rectangles.map(rect => {
      const noise = regionDifference(instancedImage, repeatImage, rect, instancedImage.width / bounds!.width, instancedImage.height / bounds!.height);
      const comparison = regionDifference(instancedImage, referenceImage, rect, instancedImage.width / bounds!.width, instancedImage.height / bounds!.height), threshold = Math.max(.02, 3 * noise.meanLinearLuminanceDifference);
      check(comparison.pixels > 100, 'Normal-map proof has a visible pixel region');
      check(comparison.meanLinearLuminanceDifference <= threshold, `Derivative-safe instanced normals match authored-tangent ordinary meshes (${comparison.meanLinearLuminanceDifference} <= ${threshold})`);
      return { rect, noise, comparison, threshold };
    });
    check(normalShading.length === 2, 'Both rotated normal-mapped specimens were compared');
  } finally { await page.evaluate(previous => { (window as any).__kilnScene.normalProofMode('instanced'); document.querySelector<HTMLElement>('.ks-hud')!.style.visibility = previous; }, previousHudVisibility); }
  const positionBefore = await page.evaluate(() => (window as any).__kilnScene.dynamicPosition() as number[]);
  await page.evaluate(() => (window as any).__kilnScene.moveDynamic(2)); await frames(page, 3);
  const positionAfter = await page.evaluate(() => (window as any).__kilnScene.dynamicPosition() as number[]);
  check(Math.abs(positionAfter[0]! - positionBefore[0]! - 2) < 1e-5, 'Dynamic InstanceHandle writes change actual instance matrix data');
  await page.evaluate(() => (window as any).__kilnScene.instanceDensity(.5)); await frames(page, 2);
  const half = (await counts(page)).filter(m => m.name.startsWith('ten-thousand/')).reduce((sum, m) => sum + m.count, 0);
  check(half <= 5000 && half >= 4800, `Density knob reduces cell counts with per-cell flooring (${half})`);
  await page.evaluate(() => (window as any).__kilnScene.instanceDensity(1)); await frames(page, 2);
  check((await counts(page)).filter(m => m.name.startsWith('ten-thousand/')).reduce((sum, m) => sum + m.count, 0) === 10000, 'Density knob restores all instances');
  await page.waitForFunction(() => { const stats = (window as any).__kilnScene.streamStats(); return stats.resident === 1 && stats.visibleNode; }, { timeout: 120000 });
  const streaming = await page.evaluate(() => (window as any).__kilnScene.streamStats());
  await page.evaluate(() => (window as any).__kilnScene.zoneHops(0));
  await page.waitForFunction(() => (window as any).__kilnScene.zoneState().visible.length === 1, { timeout: 120000 });
  const zone = await page.evaluate(() => (window as any).__kilnScene.zoneState());
  check(zone.current && zone.visible.length === 1, 'Zone visibility applies the current cell and zero neighbour hops');
  await page.evaluate(() => { const api = (window as any).__kilnScene; api.zoneHops(1); api.moveDynamic(0); api.setTimeScale(1); });
  return { backend, sourceCount, halfDensityCount: half, proof, normalShading, look, pixelColors: colors, capturePath, positionBefore, positionAfter, streaming, zone, frameTimeMeasurements: 'none' };
}
