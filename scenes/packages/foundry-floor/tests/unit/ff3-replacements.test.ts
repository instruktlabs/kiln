import { expect, test } from 'bun:test';
import { readAssetMap, acceptedModels } from '../../scripts/stage';
import { publicReplacementEvidence, reviewReplacements, verifyReplacementMap } from '../../scripts/review-replacements';

test('public replacement evidence preserves original and fit-repair attribution without author paths',()=>{
  const r=reviewReplacements()[0]!;
  const lineage=[{...r.previous,model:'claude-sonnet-5-5',harness:'Claude Code',role:'Original authored asset',privatePath:'C:/private/author'}];
  const evidence=publicReplacementEvidence([{...r,lineage}]);
  expect(evidence.entries[0]!.lineage).toEqual([{...r.previous,model:'claude-sonnet-5-5',harness:'Claude Code',role:'Original authored asset'}]);
  expect(JSON.stringify(evidence)).not.toContain('C:/private');
});

test('FF3 allows only exact pinned review replacements; historical staging does not accept them implicitly',()=>{
  const map=readAssetMap(),replacements=reviewReplacements();
  expect(replacements.map(r=>r.id)).toContain('toolFrontRobotArm');
  expect(replacements.map(r=>r.id)).toContain('amrFloorRobot');
  verifyReplacementMap(map,replacements);
  expect(()=>acceptedModels(map)).toThrow('accepted');
  expect(acceptedModels(map,replacements.map(r=>r.id))).toHaveLength(31);
  const invalid=structuredClone(replacements);invalid[0]!.next.sha256='0'.repeat(64);
  expect(()=>verifyReplacementMap(map,invalid)).toThrow('replacement');
});
