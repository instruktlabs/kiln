import { expect, test } from 'bun:test';
import { campusModels, campusAssetManifest, verifyCampusModel } from '../../scripts/campus-assets';
import { attributionOf, authorLine, effortLine, modelName } from '../../scripts/attribution';
import { readFileSync } from 'node:fs';
import { parseCampus } from '../../src/campus/data';
import { campusPlantings, parseCampusPlantings } from '../../src/campus/exterior/planting';
import { ff3Credits, ff3LicenceText } from '../../scripts/stage-ff3';

test('campus models pin all thirteen exact saved deliveries, including reviewed vegetation child revisions', () => {
  const models = campusModels();
  expect(models).toHaveLength(13);
  expect(new Set(models.map(m=>m.id)).size).toBe(13);
  expect(models.filter(m=>m.kind==='vegetation')).toHaveLength(8);
  expect(models.filter(m=>m.kind==='freight')).toHaveLength(5);
  expect(models.find(m=>m.id==='plant-tree-conifer-l')!.revision).toBe('r_b7d3879520f24b349d6a6ae6701ae2c3');
  expect(models.find(m=>m.id==='freight-trailer-tanker')!.revision).toBe('r_247bb2b5dbd048889d3efd6c95aa20e0');
  for(const model of models){
    const author=attributionOf(model.author,model.revision);
    expect(author.asset).toBe(model.asset);
    expect(authorLine(author)).toBe('GPT-6.1 Sol · codex 0.159.2');
    expect(author.requestedEffort).toBe('high');
    expect(author.confirmedEffort).toBeNull();
    if(model.kind==='freight'){
      expect(author.recordedModel).toBe('GPT-6');
      expect(author.attributionNote).toContain('not independently certified');
    }
  }
  expect(()=>verifyCampusModel({...models[0]!,sha256:'0'.repeat(64)})).toThrow('pins');
});

test('public campus data preserves exact pins and explicit placements without author workspace paths', () => {
  const campus=parseCampus(readFileSync(new URL('../../data/campus.json',import.meta.url),'utf8'));
  const manifest=campusAssetManifest(campusModels(),campus);
  expect(manifest.schema).toBe('foundry-floor.campus-assets/1');
  expect(Object.keys(manifest.models)).toHaveLength(13);
  expect(parseCampusPlantings(JSON.stringify(manifest),campus)).toEqual(campusPlantings(campus));
  expect(JSON.stringify(manifest)).not.toMatch(/showcase|sol-ff-|outputs\/|[A-Z]:\\/);
  expect(manifest.models['freight-truck-tractor']).toMatchObject({requestedModel:'gpt-6.1-sol',recordedModel:'GPT-6',confirmedEffort:null});
  expect(manifest.models['freight-truck-tractor']!.attributionNote).toContain('not independently certified');
  const invalid=structuredClone(manifest);invalid.vegetation.placements[0]!.x=1000;invalid.vegetation.placements[0]!.z=0;
  expect(()=>parseCampusPlantings(JSON.stringify(invalid),campus)).toThrow('clearance');
  const missing=structuredClone(manifest);delete missing.models['plant-tree-conifer-l'];
  expect(()=>parseCampusPlantings(JSON.stringify(missing),campus)).toThrow('model');
});

test('FF3 credits and licence declare every campus asset and preserve the freight attribution caveat',()=>{
  const models=campusModels();
  const licence=ff3LicenceText([],[],[],'ff3',models),credits=ff3Credits([],[],[],models);
  expect(credits).toHaveLength(13);
  for(const m of models){
    expect(licence).toContain(`${m.to}  Kiln asset ${m.asset}, revision ${m.revision}  SHA-256 ${m.sha256}`);
  }
  expect(credits.filter(c=>c.note?.includes('not independently certified'))).toHaveLength(5);
  expect(licence.split('not independently certified')).toHaveLength(6);
});

test('desktop author records with unknown selected model and effort remain explicitly unknown',()=>{
  const a={...attributionOf('sol-ff-freight','r_bbd6fc0083764d728aa0c796fb33ab91'),model:'not recorded',modelName:modelName('not recorded'),harnessVersion:'not recorded',requestedEffort:null};
  expect(authorLine(a)).toBe('Codex · model and harness version not recorded');
  expect(effortLine(a)).toBe('Requested effort: not recorded. Independently confirmed: not recorded.');
});
