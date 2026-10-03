import { parse } from 'parse5';
import { compareRuntimeRecord } from './scene-pack.mjs';

const ORIGIN = 'https://kilnstudio.tools';
const elements = (html, tag) => {
  const found = [];
  const walk = node => { if (node.tagName === tag) found.push(Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]))); for (const child of node.childNodes ?? []) walk(child); };
  walk(parse(html)); return found;
};
const requireEqual = (actual, expected, message) => { if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

/**
 * Self-consistent runtime hashes alone can describe the wrong delivery. Bind the selected catalog
 * to the emitted shell and, for frame scenes, the actual entry script and asset-base metadata.
 * Payload hashes, producer evidence and budgets remain separate verification steps.
 */
export function verifySceneDeliveryBinding({ id, record, runtime, shellHtml, frameHtml }) {
  if (!['farm', 'golden-gate', 'foundry-floor'].includes(id)) throw new Error(`Unknown scene binding: ${id}`);
  requireEqual(record?.id, id, 'Catalog scene id');
  requireEqual(runtime?.schema, 'kiln.scene-runtime/1', 'Runtime schema');
  requireEqual(runtime?.id, id, 'Runtime scene id');
  const kind = id === 'farm' ? 'module' : 'frame';
  requireEqual(runtime.kind, kind, 'Runtime kind');
  if (!/^[A-Za-z0-9_-]+\.js$/.test(runtime.file)) throw new Error('Invalid runtime entry file');
  if (kind === 'frame') {
    const differences = compareRuntimeRecord(record.runtime, runtime);
    if (differences.length) throw new Error(`Served catalog runtime differs: ${differences.join('; ')}`);
  }
  const root = `/scene-runtime/${id}/`, entry = `${root}${runtime.file}`, url = kind === 'frame' ? `${root}frame.html` : entry;
  requireEqual(runtime.url, url, 'Runtime URL');
  const shells = elements(shellHtml, 'scene-shell');
  requireEqual(shells.length, 1, 'Exactly one emitted scene shell');
  const shell = shells[0];
  for (const [key, value] of Object.entries({ 'data-scene': id, 'data-kind': kind, 'data-runtime-url': url, 'data-asset-base': record.base })) requireEqual(shell[key], value, `Scene shell ${key}`);
  if (kind === 'frame') {
    requireEqual(runtime.chunk, entry, 'Runtime chunk URL');
    if (typeof frameHtml !== 'string') throw new Error('Frame HTML is required');
    const bases = elements(frameHtml, 'meta').filter(e => e.name === 'kiln-asset-base');
    requireEqual(bases.length, 1, 'Exactly one frame asset base');
    requireEqual(bases[0].content, record.base, 'Frame asset base');
    const scripts = elements(frameHtml, 'script').filter(e => e.type === 'module');
    requireEqual(scripts.length, 1, 'Exactly one frame module');
    if (!scripts[0].src) throw new Error('Frame entry module needs src');
    requireEqual(new URL(scripts[0].src, new URL(url, ORIGIN)).href, new URL(entry, ORIGIN).href, 'Frame module entry');
  }
  return { id, kind, runtimeUrl: url, assetBase: record.base, entry };
}
