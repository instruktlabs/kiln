import { expect, test } from 'bun:test';
import { selectBridgeArchive } from './generate-commons.mjs';
test('a bridge update chooses an explicit revision and never silently keeps an older one', () => {
  const files = [{path:'standalone/golden-gate-bridge/r_old/golden-gate-editable.zip'}, {path:'standalone/golden-gate-bridge/r_new/golden-gate-editable.zip'}];
  expect(()=>selectBridgeArchive(files)).toThrow('bridge-revision');
  expect(selectBridgeArchive(files,'r_new').path).toContain('/r_new/');
  expect(()=>selectBridgeArchive(files,'r_missing')).toThrow('not found');
});
