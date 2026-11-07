#!/usr/bin/env node
// Refuse to dispatch a model that cannot see.
//
// Kiln's loop is the model rendering its own program and looking at the result,
// so a model without image input is not doing the thing this repository claims
// its assets demonstrate. It will still produce a file -- it just produces it
// blind, from the API docs alone, and the attribution header promote-asset.mjs
// writes ("looked at its own six-view contact sheet") would be a lie.
//
// This came out of a nine-model batch in which four of the nine turned out to
// be text-only. Nothing failed loudly; they simply built worse assets for
// reasons that looked like model quality and were actually a missing modality.
//
//   node scripts/check-vision.mjs opencode-go/kimi-k3 opencode-go/glm-5.3
//
// Exits non-zero and names the offenders. OpenCode 1.x prints capabilities with
// `opencode models <provider> --verbose`. OpenCode 2.2 rejects that flag, so the
// fallback reads the whole catalogue once from `GET /api/model` on a private
// server. Both answer from a local cache in a few seconds.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pull top-level JSON objects out of `opencode models --verbose` output. */
function jsonBlocks(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // A model whose metadata does not parse is not this script's problem.
        }
        start = -1;
      }
    }
  }
  return out;
}

function runOpencode(args) {
  return spawnSync('opencode', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 120_000,
  });
}

/** OpenCode 2.x catalogue: `{ data: [{ providerID, id, capabilities }] }`, grouped by provider. */
function catalogueByProvider(stdout) {
  const byProvider = new Map();
  let data;
  try {
    data = JSON.parse(stdout).data;
  } catch {
    return byProvider;
  }
  if (!Array.isArray(data)) return byProvider;
  for (const m of data) {
    if (!m?.providerID || !m.id) continue;
    if (!byProvider.has(m.providerID)) byProvider.set(m.providerID, new Map());
    byProvider.get(m.providerID).set(m.id, m.capabilities ?? {});
  }
  return byProvider;
}

/**
 * Model capabilities per provider, as `Map<provider, Map<modelId, capabilities>>`.
 * Tries the 1.x `--verbose` listing first; it fails fast on 2.x.
 */
export function loadCapabilities(providers, run = runOpencode) {
  const out = new Map();
  let catalogue;
  for (const provider of providers) {
    const legacy = run(['models', provider, '--verbose']);
    if (legacy.status === 0) {
      const map = new Map();
      for (const o of jsonBlocks(legacy.stdout ?? '')) {
        if (o.id) map.set(o.id, o.capabilities ?? {});
      }
      if (map.size) {
        out.set(provider, map);
        continue;
      }
    }
    if (!catalogue) {
      const r = run(['api', '--standalone', 'GET', '/api/model']);
      catalogue = r.status === 0 ? catalogueByProvider(r.stdout ?? '') : new Map();
    }
    out.set(provider, catalogue.get(provider) ?? new Map());
  }
  return out;
}

/** 2.x lists input modalities as an array; 1.x has an `input` object and `attachment`. */
export function seesImages(caps) {
  if (!caps) return false;
  if (Array.isArray(caps.input)) return caps.input.includes('image');
  if (caps.input && typeof caps.input === 'object' && 'image' in caps.input) {
    return caps.input.image === true;
  }
  return caps.attachment === true;
}

function splitModel(m) {
  const slash = m.indexOf('/');
  return slash > 0
    ? { provider: m.slice(0, slash), id: m.slice(slash + 1) }
    : { provider: 'opencode', id: m };
}

function main(models) {
  if (!models.length) {
    console.error('usage: check-vision.mjs <provider/model> [<provider/model> ...]');
    process.exit(2);
  }

  const byProvider = loadCapabilities([...new Set(models.map((m) => splitModel(m).provider))]);

  const blind = [];
  const unknown = [];
  for (const m of models) {
    const { provider, id } = splitModel(m);
    const caps = byProvider.get(provider)?.get(id);
    const sees = seesImages(caps);
    if (!caps) unknown.push(m);
    else if (!sees) blind.push(m);
    const state = !caps ? 'not listed by this provider' : sees ? 'sees images' : 'TEXT ONLY';
    console.log(`  ${m.padEnd(44)} ${state}`);
  }

  if (blind.length || unknown.length) {
    console.error('');
    if (blind.length)
      console.error(`refusing to dispatch ${blind.length} text-only model(s): ${blind.join(', ')}`);
    if (unknown.length) console.error(`could not verify: ${unknown.join(', ')}`);
    process.exit(1);
  }
  console.log(`all ${models.length} models accept image input`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main(process.argv.slice(2));
