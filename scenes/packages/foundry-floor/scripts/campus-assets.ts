// SPDX-License-Identifier: MIT
// Explicit revision pins. Later workspace edits cannot silently replace a candidate asset.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PACKAGE_ROOT } from './stage';
import { attributionOf, authorLine, revisionDirectory } from './attribution';
import { sha256 } from './structures';
import type { CampusData } from '../src/campus/data';
import { campusPlantings } from '../src/campus/exterior/planting';

export interface CampusAssetPin {
  id: string; name: string; kind: 'vegetation'|'freight'; asset: string; revision: string;
  author: string; source: string; bytes: number; sha256: string; to: string;
}
export interface CampusAssetModel extends CampusAssetPin { from: string }
export function verifyCampusModel(pin: CampusAssetPin): CampusAssetModel {
  const from = resolve(PACKAGE_ROOT, '../../../showcase/authors', pin.author, pin.source);
  const revision = revisionDirectory(pin.author, pin.revision);
  const manifest = JSON.parse(readFileSync(resolve(revision, 'manifest.json'), 'utf8')) as {
    assetId: string; revisionId: string; files: { 'asset.glb': { bytes: number; sha256: string } };
  };
  const bytes = readFileSync(from), saved = readFileSync(resolve(revision, 'asset.glb'));
  const entry = manifest.files['asset.glb'];
  if (manifest.assetId !== pin.asset || manifest.revisionId !== pin.revision || bytes.length !== pin.bytes ||
      sha256(bytes) !== pin.sha256 || bytes.length!==saved.length || !bytes.every((b,i)=>b===saved[i]) || entry.bytes !== pin.bytes || entry.sha256 !== `sha256:${pin.sha256}`) {
    throw new Error(`${pin.id}: delivered file, saved revision and manifest do not match the pins`);
  }
  const attribution = attributionOf(pin.author, pin.revision);
  if (attribution.asset !== pin.asset) throw new Error(`${pin.id}: attribution names another asset`);
  return { ...pin, from };
}
export function campusModels(): CampusAssetModel[] {
  const pins = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'scripts/campus-asset-pins.json'), 'utf8')) as CampusAssetPin[];
  if (pins.length !== 13 || new Set(pins.map(p=>p.id)).size !== 13) throw new Error('Campus pins must name thirteen distinct models');
  return pins.map(verifyCampusModel);
}

/** Public scene data: no local provenance paths, and no inferred effective model identity. */
export function campusAssetManifest(models: readonly CampusAssetModel[], campus: CampusData) {
  return {
    schema: 'foundry-floor.campus-assets/1' as const,
    models: Object.fromEntries(models.map(m=>{
      const a=attributionOf(m.author,m.revision);
      return [m.id,{kind:m.kind,asset:m.asset,revision:m.revision,path:m.to,bytes:m.bytes,sha256:m.sha256,
        author:authorLine(a),requestedModel:a.model,recordedModel:a.recordedModel??null,
        requestedEffort:a.requestedEffort,confirmedEffort:a.confirmedEffort,
        ...(a.attributionNote?{attributionNote:a.attributionNote}:{})}];
    })),
    vegetation:{placements:campusPlantings(campus)},
  };
}
