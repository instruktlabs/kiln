import { glbDigest } from './fixtures';
import type { ResilienceCase, ResilienceResult } from './resilience-run';

async function sha(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
function bytes(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(max / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('Invalid bytes');
  const decoded = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (!decoded.length || decoded.length > max) throw new Error('Invalid byte limit');
  return decoded;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid result');
  return value as Record<string, unknown>;
}
function validPng(png: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 57 || signature.some((byte, index) => png[index] !== byte)) return false;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let imageData = false;
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > png.length) return false;
    const kind = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    let crc = 0xffffffff;
    for (let i = offset + 4; i < end - 4; i++) {
      crc ^= png[i]!;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(end - 4)) return false;
    if (offset === 8) {
      if (
        kind !== 'IHDR' ||
        length !== 13 ||
        view.getUint32(16) !== 128 ||
        view.getUint32(20) !== 128
      )
        return false;
      // CPU previews are RGB; software material views may also carry alpha.
      if (
        png[24] !== 8 ||
        ![2, 6].includes(png[25]!) ||
        png[26] !== 0 ||
        png[27] !== 0 ||
        png[28] !== 0
      )
        return false;
    } else if (kind === 'IHDR') return false;
    if (kind === 'IDAT' && length > 0) imageData = true;
    if (kind === 'IEND') return length === 0 && imageData && end === png.length;
    offset = end;
  }
  return false;
}
const expectedFailures: Partial<Record<ResilienceCase, string>> = {
  'native-deadline': 'DEADLINE_EXCEEDED',
  'native-cancel': 'CANCELLED',
  'stdout-flood': 'OUTPUT_LIMIT_EXCEEDED',
  'stderr-flood': 'OUTPUT_LIMIT_EXCEEDED',
};

/** Strictly retain fixed proof fields; no arbitrary native diagnostic strings. */
export async function checkResilienceResult(input: {
  name: ResilienceCase;
  stopped: boolean;
  ready?: boolean;
  reason?: string;
  output?: Uint8Array;
}): Promise<ResilienceResult> {
  const result: ResilienceResult = { name: input.name, passed: false, stopped: input.stopped };
  if (!input.stopped) return { ...result, reason: 'CLEANUP_UNCONFIRMED' };
  const expected = expectedFailures[input.name];
  if (expected)
    return {
      ...result,
      passed: input.reason === expected && input.ready === true,
      reason: input.reason,
    };
  if (input.reason || !input.output || input.output.byteLength > 1024 * 1024) return result;
  try {
    const value = object(
      JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input.output)),
    );
    if (value.ok !== true) return result;
    if (input.name === 'engine-after') {
      if (value.version !== 'kiln.evaluator.result.v2' || value.requestId !== 'image-fixture')
        return result;
      const glb = bytes(object(value.render).glbBase64, 2097152);
      const digest = await sha(glb);
      return { ...result, passed: glb.length === 1912 && digest === glbDigest, digest };
    }
    if (input.name === 'memory-limit') {
      if (
        !Number.isSafeInteger(value.oomKills) ||
        (value.oomKills as number) < 1 ||
        (value.oomKills as number) > 100 ||
        !['cgroup', 'vmstat'].includes(String(value.counterSource)) ||
        value.signal !== 'SIGKILL'
      )
        return result;
      return {
        ...result,
        passed: true,
        oomKills: value.oomKills as number,
        counterSource: value.counterSource as string,
      };
    }
    if (input.name === 'cpu-preview' || input.name === 'software-views') {
      const expectedCount = input.name === 'cpu-preview' ? 1 : 6;
      if (!Array.isArray(value.views) || value.views.length !== expectedCount) return result;
      const views: NonNullable<ResilienceResult['views']> = [];
      for (const [i, entry] of value.views.entries()) {
        const view = object(entry);
        const png = bytes(view.pngBase64, 128 * 1024);
        if (!validPng(png)) return result;
        const backdrop =
          input.name === 'cpu-preview'
            ? 'neutral'
            : ['neutral', 'dark', 'light'][Math.floor(i / 2)]!;
        const index = input.name === 'cpu-preview' ? 0 : i % 2;
        if (view.backdrop !== backdrop || view.index !== index) return result;
        const digest = await sha(png);
        if (input.name === 'cpu-preview') {
          if (digest !== '75be56a750d986a9d444328aa6ec3c5b8555ede64734b1f83ac6860b6939e527')
            return result;
        } else if (
          value.software !== true ||
          !Number.isSafeInteger(view.red) ||
          !Number.isSafeInteger(view.green) ||
          (view.red as number) < 21 ||
          (view.green as number) < 21 ||
          (view.red as number) > 16384 ||
          (view.green as number) > 16384
        )
          return result;
        views.push({
          backdrop,
          index,
          pngBase64: view.pngBase64 as string,
          sha256: digest,
          ...(input.name === 'software-views'
            ? { red: view.red as number, green: view.green as number }
            : {}),
        });
      }
      return { ...result, passed: true, views };
    }
    return { ...result, passed: ['network', 'write-marker', 'read-marker'].includes(input.name) };
  } catch {
    return result;
  }
}
