import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashBytes } from './mirror-core.mjs';
import { requestedAuthorship, selectToolPair, publicExcerpt } from './content-evidence.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => { if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]); return pairs; }, []));
if (!args['farm-events'] || !args['bridge-runs'] || !args.feedback) throw new Error('Usage: generate-content-evidence.mjs --farm-events FILE --bridge-runs DIR --feedback FILE [--out DIR]');
const out = args.out ?? resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
const write = async (name, data) => { await mkdir(out, { recursive: true }); await writeFile(join(out, name), `${JSON.stringify(data, null, 2)}\n`); };
const feedback = await readFile(args.feedback, 'utf8');
const statement = 'Yes, the farmhouse wood floor revision passes.';
if (!feedback.includes(statement)) throw new Error('Feedback does not contain the exact owner acceptance statement');
await write('owner-review.json', { assetId: 'farmhouse', revisionId: 'r_01f97f5e943e4c2693b6db8596f3e353', ownerAccepted: true, date: '2026-09-29', statement, source: 'site-build/FEEDBACK-site-review-1.md', sourceSha256: hashBytes(feedback) });
const requests = [];
for (const stage of ['first', 'review-1']) {
  const receiptBytes = await readFile(join(args['bridge-runs'], stage, 'receipt.json'));
  const invocationBytes = await readFile(join(args['bridge-runs'], stage, 'invocation.json'));
  requests.push({ ...requestedAuthorship(JSON.parse(receiptBytes), JSON.parse(invocationBytes)), source: { receipt: `showcase/runs/astra-golden-gate/${stage}/receipt.json`, receiptSha256: hashBytes(receiptBytes), invocation: `showcase/runs/astra-golden-gate/${stage}/invocation.json`, invocationSha256: hashBytes(invocationBytes) } });
}
await write('bridge-requests.json', requests);
const rawEvents = await readFile(args['farm-events'], 'utf8');
const rows = rawEvents.trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
const [discover, render, edit, save] = [28, 422, 472, 544].map((line) => selectToolPair(rows, line));
if (render.result.programRef !== edit.arguments.programRef || edit.result.programRef !== save.arguments.programRef || edit.result.parentRef !== render.result.programRef) throw new Error('Recorded render/edit/save chain does not match');
const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object[key]]));
const event = (pair, input, result, elisions) => {
  const inputCode = `${publicExcerpt(input).replace(/\n}$/, '\n  // … additional recorded arguments omitted\n}')}`;
  return { tool: pair.tool, arguments: input, result, callCode: `${pair.tool}(${elisions.arguments.length ? inputCode : publicExcerpt(input)})`, resultCode: `${publicExcerpt(result)}${elisions.result.length ? '\n// … additional recorded result fields omitted' : ''}`, elisions, source: { path: 'farm-pilot/pack-runs/opus-farmhouse/first/events.jsonl', callLine: pair.callLine, resultLine: pair.resultLine } };
};
const exchange = {
  schemaVersion: 1,
  title: 'An excerpt from the first farmhouse authoring run',
  description: 'Recorded Claude Opus 5.5 calls through the claude harness on 27 September 2026. These excerpts precede the r33 delivery and the later wood-floor refinement.',
  assetId: save.result.asset.assetId,
  savedRevisionId: save.result.asset.revisionId,
  sourceSha256: hashBytes(rawEvents),
  redactionNote: 'Arguments and results are excerpts. Ellipses mark omissions; image payloads, local paths and host identifiers are omitted. Remaining values are retained verbatim from the recorded calls and responses.',
  events: [
    event(discover, discover.arguments, pick(discover.result, ['version', 'id', 'name', 'summary']), { arguments: [], result: ['catalog contract fields after summary'], imagePayloads: discover.omittedImages }),
    event(render, pick(render.arguments, ['programRef', 'projectId']), { ok: render.result.ok, programRef: render.result.programRef, tris: render.result.tris, meshes: render.result.meshes, distinctMaterials: render.result.distinctMaterials, qaReport: pick(render.result.qaReport, ['acceptance', 'disposition']), viewFidelity: pick(render.result.viewFidelity, ['delivered', 'materialFaithful', 'exactArtifact']) }, { arguments: ['projectRevision', 'capture'], result: ['requirements', 'QA findings', 'bounds', 'part paths', 'view payloads', 'renderer identity', 'cache fields'], imagePayloads: render.omittedImages }),
    event(edit, { programRef: edit.arguments.programRef, edits: [edit.arguments.edits[0]] }, { ok: edit.result.ok, programRef: edit.result.programRef, parentRef: edit.result.parentRef, preservation: { status: edit.result.preservation.status, comparison: { summary: edit.result.preservation.comparison.summary } } }, { arguments: ['six further exact anchored edits', 'projectId', 'projectRevision', 'capture'], result: ['applied edit records', 'full diff', 'detailed preservation comparison', 'rerendered views and checks'], imagePayloads: edit.omittedImages }),
    event(save, pick(save.arguments, ['programRef', 'name', 'collection', 'attribution']), { ok: save.result.ok, collection: save.result.collection, asset: pick(save.result.asset, ['assetId', 'revisionId', 'editable', 'files']) }, { arguments: ['projectId', 'projectRevision', 'brief', 'description', 'tags'], result: ['asset tags', 'creation time', 'build record', 'resource links'], imagePayloads: save.omittedImages }),
  ],
};
for (const item of exchange.events) { publicExcerpt(item.arguments); publicExcerpt(item.result); }
await write('home-exchange.json', exchange);
console.log(`Recorded acceptance, ${requests.length} request receipts and ${exchange.events.length} linked real tool exchanges.`);
