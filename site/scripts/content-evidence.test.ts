import { describe, expect, test } from 'bun:test';
import { applyOwnerAcceptance, recordedEngineVersion, requestedAuthorship, selectToolPair, publicExcerpt } from './content-evidence.mjs';
import exchange from '../src/data/home-exchange.json';

describe('current acceptance and recorded requests', () => {
  test('accepting a child does not approve or replace its sealed parent', () => {
    const farm = {revision:'r33',fullPackAccepted:false,assets:[{id:'farmhouse',revisionId:'parent',review:{ownerAccepted:false}}],floorRevision:{asset:{revisionId:'child'},ownerAccepted:false}};
    const decision = {assetId:'farmhouse',revisionId:'child',ownerAccepted:true,date:'2026-09-29',statement:'The floor passes.',source:'owner-feedback.md'};
    const result=applyOwnerAcceptance(farm,decision);
    expect(result.floorRevision.ownerAccepted).toBe(true);
    expect(result.ownerReview.acceptedAssets).toBe(1);
    expect(result.ownerReview.revisions[0].revisionId).toBe('child');
    expect(result.deliveryReview.acceptedAssets).toBe(0);
    expect(result.fullPackAccepted).toBe(false);
    expect(result.assets[0].revisionId).toBe('parent');
    expect(result.assets[0].review.ownerAccepted).toBe(false);
  });
  test('receipt request fields cannot become independent effort confirmation', () => {
    const record={stage:'first',requestedModel:'gpt-6-astra',requestedEffort:'ultra',harness:'codex',harnessVersion:'0.157.1'};
    expect(requestedAuthorship(record,record)).toEqual({...record,confirmedEffort:null,confirmation:'Requested in receipt and invocation; effective reasoning effort not independently confirmed.'});
    expect(()=>requestedAuthorship(record,{...record,requestedEffort:'high'})).toThrow('disagree');
  });
});

describe('recorded tool exchange', () => {
  test('matches a real tool result by its call id rather than the next line', () => {
    const rows=[{message:{content:[{type:'tool_use',id:'a',name:'mcp__kiln_workspace__kiln_render',input:{programRef:'p_1'}}]}},{message:{content:[{type:'tool_result',tool_use_id:'other',content:'ignore'}]}},{message:{content:[{type:'tool_result',tool_use_id:'a',content:[{type:'image',source:{data:'private'}},{type:'text',text:'{"ok":true,"programRef":"p_1"}'}]}]}}];
    const pair=selectToolPair(rows,1);
    expect(pair.tool).toBe('kiln_render');expect(pair.resultLine).toBe(3);expect(pair.result).toEqual({ok:true,programRef:'p_1'});expect(pair.omittedImages).toBe(1);
  });
  test('the engine version is the one the recorded capabilities result reports, and only one', () => {
    const capabilities = (version: string) => ({ message: { content: [{ type: 'tool_result', tool_use_id: 'c', content: [{ type: 'text', text: `Current host capabilities.\n{\n  "version": "kiln.capabilities.v1",\n  "engine": {\n    "version": "${version}"\n  }\n}` }] }] } });
    const unrelated = { message: { content: [{ type: 'tool_result', tool_use_id: 'd', content: '{"engine":{"version":"9.9.9"}}' }] } };
    expect(recordedEngineVersion([unrelated, capabilities('0.8.0'), capabilities('0.8.0')])).toBe('0.8.0');
    expect(() => recordedEngineVersion([unrelated])).toThrow('none');
    expect(() => recordedEngineVersion([capabilities('0.8.0'), capabilities('0.9.0')])).toThrow('0.8.0, 0.9.0');
  });
  test('the home page exchange names the engine version it was recorded under', () => {
    // Read from farm-pilot/pack-runs/opus-farmhouse/first/events.jsonl (its SHA-256 is sourceSha256) by recordedEngineVersion.
    expect(exchange.engineVersion).toBe('0.8.0');
    expect(exchange.sourceSha256).toBe('5c518feeec554f7704b6efb1ba7f698654a81430b5ecf1ac4ab257323f5b7f3f');
  });
  test('public excerpts reject local absolute paths, usernames and embedded image payloads', () => {
    expect(()=>publicExcerpt({path:'C:\\Users\\Private\\asset.glb'})).toThrow('private');
    expect(()=>publicExcerpt({path:'/home/private/model.glb'})).toThrow('private');
    expect(()=>publicExcerpt({image:'data:image/png;base64,AAAA'})).toThrow('private');
    expect(publicExcerpt({programRef:'p_123',ok:true})).toContain('p_123');
  });
});
