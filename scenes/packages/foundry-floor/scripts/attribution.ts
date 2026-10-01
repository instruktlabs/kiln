// SPDX-License-Identifier: MIT
// Model attribution for the pack texts (FF3 pack hygiene): each staged model's Kiln asset, saved revision and author
// in the site's standard wording ("Claude Sonnet 5.5 · claude 2.1.280", then "Requested effort: max. Independently
// confirmed: not recorded."), from the author records, read-only: the revision's manifest in the author's Kiln library
// gives the asset id and the save time, and the one author run whose receipt window holds that time gives the requested
// model, the harness and its version, and the requested effort. The manifest's own model attribution must agree with
// the run's requested model. The results carry no folder or file names, so the pack texts built from them name no
// author workspace, review file or repository path.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PACKAGE_ROOT } from './stage';

const SHOWCASE = resolve(PACKAGE_ROOT, '../../../showcase');

export interface Attribution {
  /** The Kiln asset id (the revision manifest's assetId). */
  asset: string;
  revision: string;
  createdAt: string;
  /** The requested model id (for example claude-sonnet-5-5) and its display name (Claude Sonnet 5.5). */
  model: string; modelName: string;
  /** Retain the authored label separately when it is less specific than the completed run record. */
  recordedModel?: string; attributionNote?: string;
  harness: string; harnessVersion: string;
  requestedEffort: string | null;
  /** No run record confirms the effective effort. */
  confirmedEffort: null;
  /** The pass that saved the revision (first, first-retry1, review-1 and so on). */
  stage: string;
}

interface Manifest { assetId: string; revisionId: string; createdAt: string; attribution?: { model?: string } }
interface Receipt { requestedModel: string; requestedEffort: string | null; harness: string; harnessVersion: string; startedAt: string; finishedAt?: string | null; stage: string }

/** Claude model ids to the site's display names: claude-sonnet-5-5 is Claude Sonnet 5.5. */
export function modelName(id: string): string {
  if (id === 'not recorded') return 'model not recorded';
  if (id === 'gpt-6.1-sol') return 'GPT-6.1 Sol';
  const m = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(id);
  if (!m) throw new Error(`No display name rule for model ${id}`);
  return `Claude ${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}`;
}

export function revisionDirectory(author: string, revision: string): string {
  const assets = resolve(SHOWCASE, 'authors', author, 'assets');
  const found: string[] = [];
  for (const collection of existsSync(assets) ? readdirSync(assets) : []) {
    const dir = resolve(assets, collection);
    for (const asset of readdirSync(dir)) {
      const path = resolve(dir, asset, 'revisions', revision, 'manifest.json');
      if (existsSync(path)) found.push(path);
    }
  }
  if (found.length !== 1) throw new Error(`Revision ${revision}: ${found.length} manifests in the author's Kiln library (one expected)`);
  return resolve(found[0]!, '..');
}

function manifestOf(author: string, revision: string): Manifest {
  const manifest = JSON.parse(readFileSync(resolve(revisionDirectory(author, revision), 'manifest.json'), 'utf8')) as Manifest;
  if (manifest.revisionId !== revision) throw new Error(`Revision ${revision}: the manifest names ${manifest.revisionId}`);
  return manifest;
}

function runsOf(author: string): Receipt[] {
  const runs = resolve(SHOWCASE, 'runs', author);
  const receipts = existsSync(runs) ? readdirSync(runs).map(stage => resolve(runs, stage, 'receipt.json')).filter(existsSync)
    .map(path => JSON.parse(readFileSync(path, 'utf8')) as Receipt) : [];
  const commons = resolve(SHOWCASE, '..');
  const codex = resolve(commons, 'engine-work/dogfood-v09/codex-runs', author);
  const addCodex = (metaPath: string, donePath: string, stage: string) => {
    if (!existsSync(metaPath) || !existsSync(donePath)) return;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { model: string; effort: string; cwd?: string; workspace?: string; start: string };
    const done = JSON.parse(readFileSync(donePath, 'utf8')) as { exit: number; end: string };
    if (done.exit !== 0) return;
    const input = JSON.parse(readFileSync(resolve(SHOWCASE, 'authors', author, 'inputs/author.json'), 'utf8')) as { harness: string; harnessVersion: string; requestedModel: string; requestedEffort: string };
    if (input.harness !== 'codex' || input.requestedModel !== meta.model || input.requestedEffort !== meta.effort ||
      resolve(meta.cwd ?? meta.workspace ?? '') !== resolve(SHOWCASE, 'authors', author)) throw new Error(`Codex receipt identity mismatch for ${author}`);
    if (!(Date.parse(meta.start) < Date.parse(done.end))) throw new Error(`Codex receipt has no valid completed window for ${author}`);
    receipts.push({ requestedModel: meta.model, requestedEffort: meta.effort, harness: 'codex',
      harnessVersion: input.harnessVersion.replace(/^codex-cli /, ''), startedAt: meta.start, finishedAt: done.end, stage });
  };
  addCodex(resolve(codex, 'author.meta.json'), resolve(codex, 'author.done.json'), 'author');
  if (author === 'sol-ff-vegetation') {
    const review = resolve(commons, 'engine-work/local-v09-review/vegetation-author');
    addCodex(resolve(review, 'run.json'), resolve(review, 'done.json'), 'v09-owner-review');
  }
  if (!receipts.length) throw new Error(`No completed run records for the author of this revision`);
  return receipts;
}

const cache = new Map<string, Attribution>();
/** The attribution of `revision`, saved in the Kiln library of the author workspace `author`. */
export function attributionOf(author: string, revision: string): Attribution {
  const key = `${author} ${revision}`, hit = cache.get(key);
  if (hit) return hit;
  const manifest = manifestOf(author, revision), t = Date.parse(manifest.createdAt);
  if (!Number.isFinite(t)) throw new Error(`Revision ${revision}: no save time`);
  if(author==='codex-review2-asset-repairs'){
    // Final six-vehicle intake uses explicit revision-to-run assignments from the sealed
    // handoffs. Save times validate the named run; they never select one by inference.
    const finalInputs=readFileSync(resolve(SHOWCASE,'../engine-work/local-v09-review/revision2-20260930/inputs/vehicles-final-inputs.json'));
    const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
    if(sha(finalInputs)!=='5108bb59e0bbcf7b0e617eafa20623bc78c202b65e528cc924fb95d7d1b898ac')throw new Error('Final review2 attribution inputs changed');
    const sealed=JSON.parse(finalInputs.toString()) as {assets:{revisionId:string;files:Record<string,{path:string;bytes:number;sha256:string}>}[];documents:{path:string;bytes:number;sha256:string}[];revisionRuns:Record<string,{authorRunPath:string;stage:string}>};
    const head=sealed.assets.find(a=>a.revisionId===revision),named=sealed.revisionRuns[revision];
    if(head){
      const pin=head.files['manifest.json']!,saved=readFileSync(resolve(revisionDirectory(author,revision),'manifest.json'));
      if(saved.length!==pin.bytes||sha(saved)!==pin.sha256)throw new Error('Final review2 saved manifest changed');
      const runPin=sealed.documents.find(d=>d.path===named?.authorRunPath);
      if(!runPin)throw new Error('No explicitly sealed final review2 author run');
      const runBytes=readFileSync(runPin.path);
      if(runBytes.length!==runPin.bytes||sha(runBytes)!==runPin.sha256)throw new Error('Final review2 author run changed');
      const run=JSON.parse(runBytes.toString());
      if(run.status!=='completed'||run.processExitCode!==0||run.confirmedEffort!==null||t<Date.parse(run.startedAt)||t>Date.parse(run.endedAt)||manifest.attribution?.model!==run.requestedModel)throw new Error('Final review2 attribution does not match its named completed run');
      const a:Attribution={asset:manifest.assetId,revision,createdAt:manifest.createdAt,model:run.requestedModel,modelName:'GPT-6 Astra',recordedModel:manifest.attribution?.model,harness:run.harness,harnessVersion:run.harnessVersion,requestedEffort:run.requestedEffort,confirmedEffort:null,stage:named!.stage,attributionNote:'Original asset: Claude Sonnet 5.5. This preserved child was authored with GPT-6 Astra in Codex. Its exact revision names a separately sealed CLI author run; requested effort is recorded and effective backend effort is not independently confirmed. Owner review is pending.'};
      cache.set(key,a);return a;
    }
    const root=resolve(SHOWCASE,'authors',author),identity=readFileSync(resolve(root,'evidence/REFINEMENT-RUN-IDENTITY.json')),receipt=readFileSync(resolve(root,'delivery/VEHICLE-REPAIR-RECEIPT.json'));
    const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
    if(hash(identity)!=='905bd072899079f7de39df8b4ee3468645d69a90c67ff091eb85537ff9771803'||hash(receipt)!=='2e11c6c3d59778b2c82d74e26e3178b20a0eea798e5fd69afc1e02f5eba3557b')throw new Error('Review2 attribution evidence changed');
    const closedRun=readFileSync(resolve(root,'delivery/VEHICLE-AUTHOR-RUN.json'));
    if(hash(closedRun)!=='594736b61d05bd42ad60aca561428e554f00dadf8dfdfbe215b62e167540e9e8')throw new Error('Review2 completed run evidence changed');
    const interval=JSON.parse(closedRun.toString());if(interval.status!=='completed'||t<Date.parse(interval.startedAt)||t>Date.parse(interval.endedAt))throw new Error('Review2 revision is outside its recorded completed run');
    const run=JSON.parse(identity.toString()),delivery=JSON.parse(receipt.toString()),asset=delivery.assets.find((a:{outputRevision:string})=>a.outputRevision===revision);
    if(!asset||asset.assetId!==manifest.assetId||manifest.attribution?.model!==run.vehicleSavedLabel)throw new Error('Review2 revision attribution does not match the sealed delivery');
    const a:Attribution={asset:manifest.assetId,revision,createdAt:manifest.createdAt,model:run.configuredModel,modelName:run.displayModel,recordedModel:run.vehicleSavedLabel,harness:'codex',harnessVersion:run.harnessVersion,requestedEffort:run.configuredEffort,confirmedEffort:null,stage:'review2-vehicle-repair',attributionNote:'Original asset: Claude Sonnet 5.5. This child was repaired with GPT-6 Astra in Codex; the immutable saved label is GPT-6. The exact CLI session records the configured model and effort; backend effort is not independently confirmed.'};
    cache.set(key,a);return a;
  }
  const runs = runsOf(author).filter(r => Date.parse(r.startedAt) <= t && t <= Date.parse(r.finishedAt ?? r.startedAt));
  if (runs.length !== 1) throw new Error(`Revision ${revision}: saved at ${manifest.createdAt}, inside ${runs.length} run windows (one expected)`);
  const run = runs[0]!;
  const recordedModel = manifest.attribution?.model;
  // These five saved freight revisions used the generic author-supplied family label.
  // Keep it visible; the run window supplies the requested model, not an inferred effective model.
  const genericFreightLabel = author === 'sol-ff-freight' && recordedModel === 'GPT-6' && run.harness === 'codex' && run.requestedModel === 'gpt-6.1-sol';
  if (recordedModel && recordedModel !== run.requestedModel && !genericFreightLabel) {
    throw new Error(`Revision ${revision}: the manifest names ${recordedModel}, the run requested ${run.requestedModel}`);
  }
  const a: Attribution = {
    asset: manifest.assetId, revision, createdAt: manifest.createdAt, model: run.requestedModel, modelName: modelName(run.requestedModel),
    harness: run.harness, harnessVersion: run.harnessVersion, requestedEffort: run.requestedEffort, confirmedEffort: null, stage: run.stage,
    recordedModel,
    ...(genericFreightLabel ? { attributionNote: 'The saved asset records the generic model label GPT-6. The completed run requested gpt-6.1-sol; effective model identity is not independently certified by the asset metadata.' } : {}),
  };
  cache.set(key, a);
  return a;
}

/** "Claude Sonnet 5.5 · claude 2.1.280": the model and harness line of the site's revision entries. */
export const authorLine = (a: Attribution) => a.harness==='codex'&&a.model==='not recorded'&&a.harnessVersion==='not recorded'
  ? 'Codex · model and harness version not recorded' : `${a.modelName} · ${a.harness} ${a.harnessVersion}`;
/** "Requested effort: max. Independently confirmed: not recorded.": the site's effort sentence. */
export const effortLine = (a: Attribution) => `Requested effort: ${a.requestedEffort??'not recorded'}. Independently confirmed: not recorded.`;
