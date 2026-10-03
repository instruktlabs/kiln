// SPDX-License-Identifier: MIT
// Foundry Floor staging for FF3 (TASK-FF3 item 7): release `ff3` at staged/ff3/, one kiln.scene-pack/1 folder holding
//   - everything staged/ffc1 holds: the twin's data, the asset map, the warm start, the accepted interior GLBs, the twelve
//     campus structures, the campus and driving data and the six vehicles with their licence texts, read from the same
//     sources and pins as FF-C1's staging (the exports of scripts/stage.ts and scripts/stage-campus.ts; neither staging
//     function is called, so staged/ff2, staged/ffc1 and their generated folders are never written);
//   - the FF3 data: the enlarged kit zone and the placed kits (data/layout.json, D-42), the humanoid mover class
//     (data/sim-config.json and data/assets.json), the placed subfab kit and the humanoid work robot as pack models (the
//     scene now fetches both), and the evidence behind them: evidence/sanity.json (the re-based sanity band, D-43) and
//     evidence/kit-clearance.json (the placed kit's clearances);
//   - the coordinator's pack hygiene (2026-09-30, scripts/pack-hygiene.ts): the data files' documentation strings in
//     pack wording, the asset map's model sources as Kiln asset, revision and author in the site's wording, the licence
//     text and the pack.json credits and sources likewise, and Golden Gate's g7 vehicle licence texts (read-only), which
//     name no author folder. The pack is scanned after staging and refused on any hit.
// Then compares the pack with staged/ffc1 file by file (compareWithFfc1): unchanged models are byte-identical;
// revised models require exact before/after pins in the retained replacement ledger. Every data change is either
// pack wording or an explicit FF3 data path. Every file gets its SHA-256 in pack.json and SHA256SUMS.
// Prints every file's bytes and hash and writes evidence/build/ff3/stage.json.
// Run from the scenes root: ./scripts/toolchain-run.ps1 packages/foundry-floor/scripts/stage-ff3.ts [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageFiles, verifyStaged } from '@kiln-scenes/scene-kit/staging';
import type { CreditEntry, PackManifest } from '@kiln-scenes/scene-kit';
import { attributionOf, authorLine, effortLine } from './attribution';
import { modelCredit, packAssetMap, packDataText, rewriteStrings, scanPack, staleEntries } from './pack-hygiene';
import { PACK_TEXT } from './pack-text';
import { acceptedModels, DATA_FILES, FAB_DATA_ENTRIES, LICENCE_PATH, PACKAGE_ROOT, readAssetMap, STAGED_DIR } from './stage';
import type { StagedModel } from './stage';
import { CAMPUS_DATA_ENTRIES, CAMPUS_STAGED_DIR, structureModels, vehicleLicencePath, vehicleModels, VEHICLE_TYPES, VEHICLES } from './stage-campus';
import type { CampusModel, VehicleType } from './stage-campus';
import { sha256 } from './structures';
import { campusAssetManifest, campusModels, type CampusAssetModel } from './campus-assets';
import { parseCampus } from '../src/campus/data';
import { createFab, DAY_MS, type FabData } from '../src/sim/index';
import { publicReplacementEvidence, reviewReplacements, verifyReplacementMap } from './review-replacements';
import { revision2Vehicles, revision2VehicleLicence } from './revision2-vehicles';

export const FF3_RELEASE = 'ff3';
export const FF3_STAGED_DIR = resolve(PACKAGE_ROOT, 'staged/ff3');
/** Generated inputs (the data files in pack wording, the licence text) go here, outside the pack folder. */
export const FF3_GENERATED_DIR = resolve(PACKAGE_ROOT, 'staged/generated-ff3');
export const CAMPUS_ASSETS_PATH = 'data/campus-assets.json';
export const WARM_EVIDENCE_PATH = 'evidence/sim/ff3-warm-pins.json';
export const REPLACEMENT_EVIDENCE_PATH = 'evidence/asset-replacements.json';
const G7_LICENCES = resolve(PACKAGE_ROOT, '../golden-gate/staged/g7/licenses/vehicles');
/** The evidence the pack carries: pack path to package path. */
export const FF3_EVIDENCE: Readonly<Record<string, string>> = {
  'evidence/sanity.json': 'evidence/sim/sanity.json',
  'evidence/kit-clearance.json': 'evidence/sim-spec/ff3/kit-clearance.json',
  'evidence/sim/hashes.json': 'evidence/sim/hashes.json',
  [WARM_EVIDENCE_PATH]: WARM_EVIDENCE_PATH,
};
/** Where FF3's data differs from FF-C1's (JSON paths, dot separated, array indices as numbers): D-42's kit zone and
 *  kits, the humanoid mover class and the technician's share of the visits, the kit's and the humanoid's asset-map rows. */
export const FF3_DATA_CHANGES: Readonly<Record<string, readonly string[]>> = {
  'data/layout.json': ['sectionCut.kitZone', 'sectionCut.subfabKits'],
  'data/sim-config.json': ['movers.classes.1', 'movers.classes.2', 'technicians', 'floorTransport'],
  'data/assets.json': ['conventions.lod1', 'entities.humanoidWorkRobot', 'entities.subfabKit', 'entities.technician', 'entities.sectionModule.mount.subfabKitMount',
    'entities.amrFloorRobot.sim','entities.amrFloorRobot.drive.statusLamp','entities.amrFloorRobot.facts.lod1','entities.toolFrontRobotArm.sim','entities.toolFrontRobotArm.instances',
    'entities.toolFrontRobotArm.placements','entities.toolFrontRobotArm.drive.statusLamp','entities.toolFrontRobotArm.facts.gripPoses.homeClear',
    'entities.toolFrontRobotArm.facts.gripPoses.transferAbove','entities.toolFrontRobotArm.facts.foupParenting','entities.toolFrontRobotArm.facts.clearance'],
  'data/driving.json': ['flow.freight', 'freightParking', 'conventions.units'],
};

const vehicleType = (m: { id: string }) => m.id.replace(/^vehicle-/, '') as VehicleType;
/** A model's source in the asset map (restructured for the pack, not a documentation string). */
const SOURCE_PATH = /^(?:entities|structures)\.[^.]+\.source(?:\.|$)/;

/** Golden Gate's g7 licence text for a vehicle (read-only), checked to declare exactly the approved file. */
export function g7VehicleLicence(type: VehicleType): { from: string; text: string } {
  const from = resolve(G7_LICENCES, `${type}.ASSET-LICENSE.txt`), p = VEHICLES[type];
  if (!existsSync(from)) throw new Error(`Vehicle ${type}: Golden Gate's g7 licence text is missing`);
  const text = readFileSync(from, 'utf8');
  for (const needle of ['SPDX-License-Identifier: CC0-1.0', `Kiln asset: ${p.asset}`, `Saved revision: ${p.revision}`, `Delivered GLB SHA-256: ${p.sha256}`]) {
    if (!text.includes(needle)) throw new Error(`Vehicle ${type}: the g7 licence text does not state "${needle}"`);
  }
  return { from, text };
}

type Model = Pick<StagedModel, 'to' | 'sha256' | 'author' | 'revision'>;
/** A model's licence entry: its pack file, Kiln asset, revision and SHA-256, then its author in the site's wording. */
export function licenceEntry(m: Model): string[] {
  const a = attributionOf(m.author, m.revision);
  return [`${m.to}  Kiln asset ${a.asset}, revision ${a.revision}  SHA-256 ${m.sha256}`, `    ${authorLine(a)}. ${effortLine(a)}`,
    ...(a.attributionNote ? [`    ${a.attributionNote}`] : [])];
}

export function ff3LicenceText(interior: readonly Model[], structures: readonly Model[], vehicles: readonly Model[], release: string, campus: readonly Model[] = []): string {
  return [
    'Foundry Floor assets', 'SPDX-License-Identifier: CC0-1.0', '',
    `Release: ${release}`, '',
    'Foundry Floor: authored asset content is designated CC0-1.0 by the project owner.',
    'This covers the Kiln-authored models listed below (their procedural geometry, materials, animation clips and',
    'locators; no third-party model, texture or brand data), to the extent of the owner\'s rights.',
    'The campus structures and the vehicles carry the same licence and scope as the Farm pack (owner decision, 2026-09-30).',
    'CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/', '',
    'Each model: its file in this pack, its Kiln asset and saved revision and the file\'s SHA-256, then its author: the',
    'model and harness that saved the revision, with the effort requested for that run.', '',
    'Interior twin:', ...interior.flatMap(licenceEntry), '',
    'Campus structures (S1 to S5):', ...structures.flatMap(licenceEntry), '',
    'Vehicles (their own declarations in licenses/vehicles/):', ...vehicles.flatMap(licenceEntry), '',
    'Campus vegetation and freight:', ...campus.flatMap(licenceEntry), '',
    'Scene code and third-party software retain their separate software licence notices.',
    'This designation does not relicense Kiln or its third-party dependencies.',
    'Written at staging because the Kiln revisions ship no licence file.', '',
  ].join('\n');
}

export function ff3Credits(interior: readonly StagedModel[], structures: readonly CampusModel[], vehicles: readonly CampusModel[], campus: readonly CampusAssetModel[] = []): CreditEntry[] {
  const credit = (name: string, m: Model, note: string): CreditEntry => {
    const a=attributionOf(m.author,m.revision);
    return {name,licence:'CC0-1.0',holder:'Kiln Commons',source:modelCredit(a),note:[note,a.attributionNote].filter(Boolean).join(' ')};
  };
  const declaration = 'Authored asset content designated CC0-1.0 by the project owner. Exact declaration: licenses/ASSET-LICENSE.txt';
  return [
    ...interior.map(m => credit(`${m.asset} (Kiln-authored model)`, m, declaration)),
    ...structures.map(m => credit(`${m.name} (Kiln-authored campus structure)`, m, declaration)),
    ...vehicles.map(m => credit(`${m.name} (Kiln-authored vehicle)`, m, `Authored asset content designated CC0-1.0 by the project owner. Exact declarations: licenses/ASSET-LICENSE.txt and ${vehicleLicencePath(vehicleType(m))}`)),
    ...campus.map(m=>credit(`${m.name} (Kiln-authored ${m.kind})`,m,declaration)),
  ];
}

interface DataFile { to: string; from: string; replaced: number; generated: boolean }
interface FilePin { path:string;bytes:number;sha256:string }
interface WarmReceipt { schema:string;seed:number;hours:number;day30Hash:string;warm:FilePin;inputs:FilePin[];hashes:FilePin;verification:{freshReplay:boolean;byteIdenticalWarmSnapshot:boolean;hourlyHashesMatched:number} }
const filePin=(path:string,bytes:Uint8Array):FilePin=>({path,bytes:bytes.length,sha256:sha256(bytes)});
const matchesPin=(pin:FilePin,bytes:Uint8Array)=>pin.bytes===bytes.length&&pin.sha256===sha256(bytes);

/** The fresh replay seals authored data. Public documentation wording changes bytes, never simulation values. */
export function packedWarmReceipt(): WarmReceipt & {sourceInputs:FilePin[];inputTransform:string} {
  const receipt=JSON.parse(readFileSync(resolve(PACKAGE_ROOT,WARM_EVIDENCE_PATH),'utf8')) as WarmReceipt;
  const paths=['data/layout.json','data/rail-graph.json','data/route.json','data/tools.json','data/sim-config.json'];
  if(receipt.schema!=='foundry-floor.evidence.warm-pins/1'||receipt.seed!==1||receipt.hours!==720||
    receipt.warm.path!=='data/warm/seed-1.json'||receipt.hashes.path!=='evidence/sim/hashes.json'||
    JSON.stringify(receipt.inputs.map(p=>p.path))!==JSON.stringify(paths)||!receipt.verification.freshReplay||
    !receipt.verification.byteIdenticalWarmSnapshot||receipt.verification.hourlyHashesMatched!==720)throw new Error('Invalid fresh warm replay receipt');
  for(const pin of [receipt.warm,receipt.hashes,...receipt.inputs]){
    if(!matchesPin(pin,readFileSync(resolve(PACKAGE_ROOT,pin.path))))throw new Error(`${pin.path}: differs from fresh replay pins`);
  }
  return {...receipt,sourceInputs:receipt.inputs,inputs:receipt.inputs.map(pin=>{
    const raw=readFileSync(resolve(PACKAGE_ROOT,pin.path),'utf8');
    const packed=Object.keys(PACK_TEXT[pin.path]??{}).length?packDataText(pin.path,raw).text:raw;
    return filePin(pin.path,new TextEncoder().encode(packed));
  }),inputTransform:'Documentation strings written for this pack; simulation data unchanged.'};
}

function verifyWarmState(packDir:string):void {
  const receipt=JSON.parse(readFileSync(resolve(packDir,WARM_EVIDENCE_PATH),'utf8')) as WarmReceipt;
  if(JSON.stringify(receipt)!==JSON.stringify(packedWarmReceipt()))throw new Error('Pack warm receipt differs from qualified replay');
  for(const pin of [receipt.warm,receipt.hashes,...receipt.inputs])if(!matchesPin(pin,readFileSync(resolve(packDir,pin.path))))throw new Error(`${pin.path}: pack bytes differ from warm receipt`);
  const read=(name:string)=>JSON.parse(readFileSync(resolve(packDir,name),'utf8'));
  const data={layout:read('data/layout.json'),graph:read('data/rail-graph.json'),route:read('data/route.json'),tools:read('data/tools.json'),config:read('data/sim-config.json')} as FabData;
  const fab=createFab({seed:receipt.seed,data,snapshot:readFileSync(resolve(packDir,receipt.warm.path),'utf8')});
  const hashes=read(receipt.hashes.path) as {hashes:string[];day30Hash:string};
  if(fab.sim.S.t!==30*DAY_MS||fab.hash()!==receipt.day30Hash||hashes.day30Hash!==receipt.day30Hash||JSON.stringify(fab.hourlyHashes())!==JSON.stringify(hashes.hashes))throw new Error('Pack warm state does not reproduce the qualified hashes');
}

/** The data and evidence files of the pack: in pack wording where the table lists strings (written to `generated`),
 *  otherwise the package file itself. */
export function packDataFiles(generated: string): DataFile[] {
  const sources: { to: string; src: string }[] = [
    ...DATA_FILES.map(name => ({ to: `data/${name}`, src: resolve(PACKAGE_ROOT, 'data', name) })),
    ...Object.values(CAMPUS_DATA_ENTRIES).map(to => ({ to, src: resolve(PACKAGE_ROOT, to) })),
    ...Object.entries(FF3_EVIDENCE).map(([to, path]) => ({ to, src: resolve(PACKAGE_ROOT, path) })),
  ];
  return sources.map(({ to, src }) => {
    if (!existsSync(src)) throw new Error(`${to}: its package file is missing`);
    const text = readFileSync(src, 'utf8');
    let out: string, replaced = 0;
    if(to===WARM_EVIDENCE_PATH){out=JSON.stringify(packedWarmReceipt(),null,2)+'\n';}
    else if (to === 'data/assets.json') {
      const map = JSON.parse(text) as Parameters<typeof packAssetMap>[0];
      if (`${JSON.stringify(map, null, 1)}\n` !== text) throw new Error('data/assets.json is not in its generator\'s form (run scripts/inspect-assets.ts --write)');
      const stale = staleEntries(to, map);
      if (stale.length) throw new Error(`${to}: the pack wording lists strings the data no longer holds: ${stale.map(s => s.slice(0, 80)).join(' | ')}`);
      const packed = packAssetMap(map);
      out = `${JSON.stringify(packed, null, 1)}\n`;
      replaced = diffPaths(map, packed).filter(p => !SOURCE_PATH.test(p)).length;
    } else if (Object.keys(PACK_TEXT[to] ?? {}).length) {
      ({ text: out, replaced } = packDataText(to, text));
    } else return { to, from: src, replaced: 0, generated: false };
    const from = resolve(generated, to);
    mkdirSync(dirname(from), { recursive: true });
    writeFileSync(from, out);
    return { to, from, replaced, generated: true };
  });
}

/** Leaf JSON paths where `a` and `b` differ (objects by key, arrays by index). */
export function diffPaths(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  const at = (k: string | number) => (path ? `${path}.${k}` : String(k));
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) diffPaths(a[i], b[i], at(i), out);
  } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at(k), out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(path);
  return out;
}

const under = (path: string, prefixes: readonly string[]) => prefixes.some(p => path === p || path.startsWith(`${p}.`));
const OLD_LICENCE_LINE = /^(\S+)  (\S+)  Kiln revision (r_[0-9a-f]+)  showcase\/authors\/(\S+)  SHA-256 ([0-9a-f]{64})$/;

/** Every file staged/ffc1 holds is in ff3: models byte-identical; data equal to ffc1's in pack wording except the FF3
 *  data paths; the licence regenerated with every ffc1 model line's file, revision and hash; the vehicle licences as g7
 *  states them. The only new files are the FF3 evidence; the only new models the kit and the humanoid, unplaced in ffc1. */
export function compareWithFfc1(ff3Dir: string, ffc1Dir: string = CAMPUS_STAGED_DIR) {
  const ffc1 = JSON.parse(readFileSync(resolve(ffc1Dir, 'pack.json'), 'utf8')) as PackManifest & { source: { unplaced: { id: string }[] } };
  const ff3 = JSON.parse(readFileSync(resolve(ff3Dir, 'pack.json'), 'utf8')) as PackManifest;
  const revisedVehicles=ff3.release==='ff3-review2'?revision2Vehicles():[];
  const replacements=reviewReplacements();verifyReplacementMap(readAssetMap(),replacements);
  const byPath = new Map(ff3.files.map(f => [f.path, f]));
  const same: string[] = [], changed: { path: string; ffc1: { bytes: number; sha256: string }; ff3: { bytes: number; sha256: string }; why: string }[] = [], problems: string[] = [];
  for (const f of ffc1.files) {
    const g = byPath.get(f.path);
    if (!g) { problems.push(`${f.path}: in staged/ffc1, missing from ff3`); continue; }
    if (g.sha256 === f.sha256 && g.bytes === f.bytes) { same.push(f.path); continue; }
    const record = (why: string) => changed.push({ path: f.path, ffc1: { bytes: f.bytes, sha256: f.sha256 }, ff3: { bytes: g.bytes, sha256: g.sha256 }, why });
    const replacement=replacements.find(r=>r.path===f.path);
    const vehicle=revisedVehicles.find(m=>m.to===f.path);
    if(vehicle){
      const old=VEHICLES[vehicleType(vehicle)];
      if(f.sha256!==old.sha256||g.sha256!==vehicle.sha256||g.bytes!==vehicle.bytes)problems.push(`${f.path}: differs from explicit vehicle parent/child pins`);
      else record(`Local review 2 lamp-fit child ${vehicle.revision}; original vehicle retained in the preceding candidate`);
      continue;
    }
    if(replacement){
      if(f.sha256!==replacement.previous.sha256||f.bytes!==replacement.previous.bytes||g.sha256!==replacement.next.sha256||g.bytes!==replacement.next.bytes)problems.push(`${f.path}: differs from explicit before/after replacement pins`);
      else record(replacement.reason);
      continue;
    }
    if(f.path==='data/warm/seed-1.json'){
      try {verifyWarmState(ff3Dir);record('Regenerated for real floor transport; exact inputs, 720 hourly hashes and restored state verified by the fresh replay receipt');}
      catch(error){problems.push(error instanceof Error?error.message:String(error));}
      continue;
    }
    const a = readFileSync(resolve(ffc1Dir, f.path), 'utf8'), b = readFileSync(resolve(ff3Dir, f.path), 'utf8');
    if (f.path.endsWith('.json')) {
      const old = JSON.parse(a) as Parameters<typeof packAssetMap>[0], now = JSON.parse(b) as unknown;
      const expected = f.path === 'data/assets.json' ? packAssetMap(old) : rewriteStrings(f.path, old);
      const differing = diffPaths(expected, now), allowed = [...(FF3_DATA_CHANGES[f.path] ?? []),
        ...(ff3.release==='ff3-review2'&&f.path==='data/driving.json'?['boost','controls.boost','conventions.controls','conventions.traffic']:[]),
        ...(f.path==='data/assets.json'?replacements.flatMap(r=>['asset','status','source','pins','measured','locators','nodes','clips','poses'].map(key=>`entities.${r.id}.${key}`)):[])];
      const unexplained = differing.filter(p => !under(p, allowed));
      if (unexplained.length) problems.push(`${f.path}: differs from ffc1's in pack wording at ${unexplained.slice(0, 8).join(', ')}${unexplained.length > 8 ? ` and ${unexplained.length - 8} more` : ''}`);
      const worded = diffPaths(old, expected).filter(p => !SOURCE_PATH.test(p)).length;
      const sources = f.path === 'data/assets.json' ? ', each model source as its Kiln asset, revision and author' : '';
      const data = allowed.filter(p => differing.some(d => under(d, [p])));
      record(`${worded} documentation strings in pack wording${sources}${data.length ? `; FF3 data at ${data.join(', ')}` : ''}`);
    } else if (f.path === LICENCE_PATH) {
      const lines = a.split('\n').map(l => OLD_LICENCE_LINE.exec(l)).filter(m => m !== null);
      const missing = lines.filter(m => {
        const r=replacements.find(r=>r.path===m[1]&&r.previous.revision===m[3]&&r.previous.sha256===m[5]);
        const vehicle=revisedVehicles.find(v=>v.to===m[1]);
        return !b.split('\n').some(l=>l.startsWith(`${m[1]}  Kiln asset `)&&l.endsWith(`, revision ${vehicle?.revision??r?.next.revision??m[3]}  SHA-256 ${vehicle?.sha256??r?.next.sha256??m[5]}`));
      });
      if (!lines.length || missing.length) problems.push(`${LICENCE_PATH}: ${missing.length} of ${lines.length} ffc1 model lines have no ff3 entry with the same file, revision and SHA-256`);
      record(`Regenerated in pack wording: ${lines.length-replacements.length} original model pins retained and ${replacements.length} explicit qualified replacement pins recorded, with author attribution`);
    } else if (/^licenses\/vehicles\/[\w-]+\.ASSET-LICENSE\.txt$/.test(f.path)) {
      const type = f.path.slice('licenses/vehicles/'.length, -'.ASSET-LICENSE.txt'.length) as VehicleType;
      if (b !== (revisedVehicles.length?revision2VehicleLicence(type):g7VehicleLicence(type)).text) problems.push(`${f.path}: differs from the pinned vehicle declaration`);
      if (!a.includes(`Saved revision: ${VEHICLES[type].revision}`) || !a.includes(VEHICLES[type].sha256)) problems.push(`${f.path}: ffc1's text names another file`);
      record('Golden Gate\'s g7 declaration of the same revision and SHA-256 (it names no author folder)');
    } else problems.push(`${f.path}: differs from staged/ffc1 (${f.sha256} vs ${g.sha256})`);
  }
  const ffc1Paths = new Set(ffc1.files.map(f => f.path));
  const added = ff3.files.filter(f => !ffc1Paths.has(f.path)).map(f => f.path);
  const campus=campusModels(),newPaths=new Set([CAMPUS_ASSETS_PATH,REPLACEMENT_EVIDENCE_PATH,...campus.map(m=>m.to)]);
  for (const path of added) if (!(path in FF3_EVIDENCE)&&!newPaths.has(path)) problems.push(`${path}: new in ff3 and not declared FF3 evidence or a campus asset`);
  for(const m of campus){
    const file=byPath.get(m.to);
    if(file?.sha256!==m.sha256||file.bytes!==m.bytes)problems.push(`${m.to}: campus pin mismatch`);
    if(!ff3.models.some(row=>row.id===m.id&&row.path===m.to))problems.push(`${m.id}: missing pinned campus model`);
  }
  const campusData=JSON.parse(readFileSync(resolve(ff3Dir,CAMPUS_ASSETS_PATH),'utf8'));
  if(JSON.stringify(campusData)!==JSON.stringify(campusAssetManifest(campus,parseCampus(readFileSync(resolve(PACKAGE_ROOT,'data/campus.json'),'utf8')))))problems.push(`${CAMPUS_ASSETS_PATH}: differs from pinned campus delivery`);
  if(JSON.stringify(JSON.parse(readFileSync(resolve(ff3Dir,REPLACEMENT_EVIDENCE_PATH),'utf8')))!==JSON.stringify(publicReplacementEvidence(replacements)))problems.push('Public replacement evidence does not match the explicit pin ledger');
  const oldModels = new Map(ffc1.models.map(m => [m.id, m.path]));
  for (const [id, path] of oldModels) if (!ff3.models.some(m => m.id === id && m.path === path)) problems.push(`model ${id}: in staged/ffc1, missing from ff3`);
  const addedModels = ff3.models.filter(m => !oldModels.has(m.id)).map(m => m.id);
  const unplaced = new Set(ffc1.source.unplaced.map(u => u.id));
  for (const id of addedModels) if (!unplaced.has(id)&&!campus.some(m=>m.id===id)) problems.push(`model ${id}: new in ff3 and not one of ffc1's unplaced files or pinned campus assets`);
  for (const [id, path] of Object.entries(ffc1.data)) if (ff3.data[id] !== path) problems.push(`data ${id}: ${path} in staged/ffc1, ${ff3.data[id] ?? 'missing'} in ff3`);
  for (const id of Object.keys(ff3.data)) if (!(id in ffc1.data)&&!(id==='campus-assets'&&ff3.data[id]===CAMPUS_ASSETS_PATH)) problems.push(`data ${id}: new in ff3`);
  return { ffc1PackSha256: sha256(readFileSync(resolve(ffc1Dir, 'pack.json'))), ffc1Files: ffc1.files.length, same: same.length, changed, added, addedModels, problems };
}

export interface Ff3StageOptions { out?: string; generated?: string; force?: boolean; release?: string; revision2?:boolean }

export function stageFf3(options: Ff3StageOptions = {}) {
  const release = options.release ?? FF3_RELEASE, out = resolve(options.out ?? FF3_STAGED_DIR), generated = resolve(options.generated ?? FF3_GENERATED_DIR);
  if(options.revision2&&(release!=='ff3-review2'||out===FF3_STAGED_DIR))throw new Error('Revision2 requires its explicit release and a separate staging directory');
  for (const dir of [STAGED_DIR, CAMPUS_STAGED_DIR, resolve(PACKAGE_ROOT, 'staged/generated-ff2'), resolve(PACKAGE_ROOT, 'staged/generated-ffc1')]) {
    if (out === resolve(dir) || generated === resolve(dir)) throw new Error('FF3 never stages into the ff2 or ffc1 folders');
  }
  const map = readAssetMap();
  const replacements=reviewReplacements();verifyReplacementMap(map,replacements);
  const config = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'data/sim-config.json'), 'utf8')) as { seeds: { snapshots: number[] } };
  const interior = acceptedModels(map,replacements.map(r=>r.id)), structures = structureModels(), vehicles = options.revision2?revision2Vehicles():vehicleModels(), campus=campusModels();
  const licences = VEHICLE_TYPES.map(type => ({ type, ...(options.revision2?revision2VehicleLicence(type):g7VehicleLicence(type)) }));
  const data = packDataFiles(generated);
  const campusFrom=resolve(generated,CAMPUS_ASSETS_PATH);
  mkdirSync(dirname(campusFrom),{recursive:true});
  writeFileSync(campusFrom,JSON.stringify(campusAssetManifest(campus,parseCampus(readFileSync(resolve(PACKAGE_ROOT,'data/campus.json'),'utf8'))),null,2)+'\n');
  const replacementsFrom=resolve(generated,REPLACEMENT_EVIDENCE_PATH);
  mkdirSync(dirname(replacementsFrom),{recursive:true});writeFileSync(replacementsFrom,JSON.stringify(publicReplacementEvidence(replacements),null,2)+'\n');
  const licenceFrom = resolve(generated, LICENCE_PATH);
  mkdirSync(dirname(licenceFrom), { recursive: true });
  writeFileSync(licenceFrom, ff3LicenceText(interior, structures, vehicles, release, campus));
  const warm = config.seeds.snapshots.map(seed => ({ id: `warm-seed-${seed}`, to: `data/warm/seed-${seed}.json`, from: resolve(PACKAGE_ROOT, `data/warm/seed-${seed}.json`) }));
  const dataFrom = (to: string) => data.find(d => d.to === to)!.from;
  const files = [
    ...DATA_FILES.map(name => ({ from: dataFrom(`data/${name}`), to: `data/${name}` })),
    ...warm.map(w => ({ from: w.from, to: w.to })),
    ...interior.map(m => ({ from: m.from, to: m.to, sha256: m.sha256 })),
    ...Object.values(CAMPUS_DATA_ENTRIES).map(to => ({ from: dataFrom(to), to })),
    ...structures.map(m => ({ from: m.from, to: m.to, sha256: m.sha256 })),
    ...vehicles.map(m => ({ from: m.from, to: m.to, sha256: m.sha256 })),
    ...campus.map(m => ({ from: m.from, to: m.to, sha256: m.sha256 })),
    {from:campusFrom,to:CAMPUS_ASSETS_PATH},
    {from:replacementsFrom,to:REPLACEMENT_EVIDENCE_PATH},
    ...licences.map(l => ({ from: l.from, to: vehicleLicencePath(l.type) })),
    { from: licenceFrom, to: LICENCE_PATH },
    ...Object.keys(FF3_EVIDENCE).map(to => ({ from: dataFrom(to), to })),
  ];
  const attributed = (m: { id: string; author: string; revision: string; bytes: number; sha256: string }) => {
    const a = attributionOf(m.author, m.revision);
    return [m.id, { asset: a.asset, revision: a.revision, bytes: m.bytes, sha256: m.sha256, author: authorLine(a), requestedEffort: a.requestedEffort, confirmedEffort: null, stage: a.stage,
      requestedModel:a.model,recordedModel:a.recordedModel??null,...(a.attributionNote?{attributionNote:a.attributionNote}:{}) }] as const;
  };
  const result = stageFiles({
    id: 'foundry-floor', release, three: '0.186.1', out, force: options.force,
    models: [
      ...interior.filter(m => m.placed).map(m => ({ id: m.id, to: m.to })),
      ...structures.map(m => ({ id: m.id, to: m.to })),
      ...vehicles.map(m => ({ id: m.id, to: m.to })),
      ...campus.map(m => ({ id: m.id, to: m.to })),
    ],
    data: { 'asset-map': 'data/assets.json', ...FAB_DATA_ENTRIES, ...Object.fromEntries(warm.map(w => [w.id, w.to])), ...CAMPUS_DATA_ENTRIES, 'campus-assets':CAMPUS_ASSETS_PATH },
    files, credits: ff3Credits(interior, structures, vehicles, campus),
    source: {
      stage: 'FF3: simulation-backed floor transport, service visits, the placed subfab kit, revised campus vegetation and articulated freight traffic',
      texts: 'The documentation strings of the data files are written for the pack: they cite no repository file, author workspace or coordination record. Every value, id, name and structure is the package data unchanged, and each model source names its Kiln asset, revision and author.',
      assetMap: sha256(readFileSync(dataFrom('data/assets.json'))),
      campusData: Object.fromEntries(Object.entries(CAMPUS_DATA_ENTRIES).map(([id, to]) => [id, sha256(readFileSync(dataFrom(to)))])),
      warmStarts: Object.fromEntries(warm.map(w => [w.id, sha256(readFileSync(w.from))])),
      evidence: {
        'evidence/sanity.json': 'the model-sanity band re-based on the twin at 4,500 wafer starts a month (owner decision, 2026-09-30) and the values measured inside it',
        'evidence/kit-clearance.json': 'the placed subfab kits\' clearances to their section modules and to the tool rows (owner decision, 2026-09-30)',
      },
      models: Object.fromEntries([...interior, ...structures, ...vehicles, ...campus].map(attributed)),
      structures: structures.map(m => m.id),
      vehicles: Object.fromEntries(vehicles.map(m => [m.id, { licence: vehicleLicencePath(vehicleType(m)) }])),
      pending: Object.entries(map.entities).filter(([, e]) => !e.glb).map(([id]) => id),
      unplaced: interior.filter(m => !m.placed).map(m => ({ id: m.id, file: m.to, why: 'accepted and staged as a pack file; no instance in FF3, so the scene does not fetch it' })),
    },
  });
  const verification = verifyStaged(out);
  if (!verification.ok) throw new Error(verification.problems.join('\n'));
  for (const m of [...interior, ...structures, ...vehicles, ...campus]) {
    const copy = new Uint8Array(readFileSync(resolve(out, m.to)));
    if (copy.length !== m.bytes || sha256(copy) !== m.sha256) throw new Error(`${m.id}: the staged copy differs from the pins`);
  }
  const hygiene = scanPack(out);
  if (hygiene.hits.length) throw new Error(`Pack hygiene: ${hygiene.hits.length} hits\n${hygiene.hits.slice(0, 20).map(h => `${h.file}:${h.line} ${h.rule} "${h.match}"`).join('\n')}`);
  const ffc1 = existsSync(resolve(CAMPUS_STAGED_DIR, 'pack.json')) ? compareWithFfc1(out) : null;
  if (ffc1?.problems.length) throw new Error(ffc1.problems.join('\n'));
  const manifest = JSON.parse(readFileSync(resolve(out, 'pack.json'), 'utf8')) as PackManifest;
  const sum = (list: readonly { bytes: number }[]) => list.reduce((s, m) => s + m.bytes, 0);
  const loadedInterior = interior.filter(m => m.placed);
  return {
    out, release, ...result, packSha256: sha256(readFileSync(resolve(out, 'pack.json'))), verification,
    models: manifest.models.length,
    groups: {
      interior: { staged: interior.length, loaded: loadedInterior.length, stagedBytes: sum(interior), loadedBytes: sum(loadedInterior) },
      structures: { loaded: structures.length, bytes: sum(structures) },
      vehicles: { loaded: vehicles.length, bytes: sum(vehicles) },
      vegetation: {loaded:campus.filter(m=>m.kind==='vegetation').length,bytes:sum(campus.filter(m=>m.kind==='vegetation'))},
      freight: {loaded:campus.filter(m=>m.kind==='freight').length,bytes:sum(campus.filter(m=>m.kind==='freight'))},
    },
    loadedModelBytes: sum(loadedInterior) + sum(structures) + sum(vehicles) + sum(campus),
    data: manifest.data,
    packText: data.filter(d => d.generated).map(d => ({ file: d.to, strings: d.replaced })),
    hygiene: { scannedFiles: hygiene.files, glbs: hygiene.glbs, hits: hygiene.hits.length, knownModelText: hygiene.known },
    ffc1,
    files: manifest.files.map(f => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 })),
  };
}

function parseArgs(argv: readonly string[]): Ff3StageOptions {
  const options: Ff3StageOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') options.force = true;
    else if (arg === '--out') options.out = resolve(argv[++i] ?? '');
    else if (arg === '--generated') options.generated = resolve(argv[++i] ?? '');
    else throw new Error(`Unknown argument ${arg}`);
  }
  return options;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const staged = stageFf3(options);
    const { files, ...summary } = staged;
    if (!options.out) {
      const evidence = resolve(PACKAGE_ROOT, 'evidence/build/ff3');
      mkdirSync(evidence, { recursive: true });
      writeFileSync(resolve(evidence, 'stage.json'), JSON.stringify({ ...summary, files }, null, 2) + '\n');
    }
    console.log(JSON.stringify(summary, null, 2));
    for (const f of files) console.log(`${String(f.bytes).padStart(10)}  ${f.sha256}  ${f.path}`);
  } catch (error) { console.error(error); process.exitCode = 1; }
}
