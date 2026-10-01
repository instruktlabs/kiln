import { expect, test } from 'bun:test';
import { handoffRecords, changedAssetMedia } from './switch-farm-delivery.mjs';

test('handoff supports sealed file lists and requires every promised download seal', () => {
  const hash='a'.repeat(64);
  const rows=handoffRecords({files:[{file:'downloads.json',bytes:12,sha256:hash},{path:'shapes-and-seasons-farm-runtime.zip',bytes:10,sha256:`sha256:${hash}`}],changedMedia:[{file:'farmhouse-cutout.webp',r2Path:'media/farm/r34/cutout/farmhouse.webp',bytes:9,sha256:hash,assetId:'farmhouse',kind:'cutout'}]});
  expect(rows).toHaveLength(3);
  expect(rows[2]?.publicPath).toBe('media/farm/r34/cutout/farmhouse.webp');
  expect(()=>handoffRecords({files:[{file:'downloads.json',bytes:12}]})).toThrow('seal');
});
test('changing a revision requires newly pinned poster and cutout imagery', () => {
  const asset={id:'farmhouse',revisionId:'new'};
  const previous={id:'farmhouse',revisionId:'old',poster:{inputPath:'media/farm/r33/cutout/farmhouse.webp'},reviewImage:{inputPath:'media/farm/r33/poster/farmhouse.webp'}};
  expect(()=>changedAssetMedia(asset,previous,[])).toThrow('cutout');
  const records=[{assetId:'farmhouse',kind:'cutout',publicPath:'media/farm/r34/cutout/farmhouse.webp'},{assetId:'farmhouse',kind:'poster',publicPath:'media/farm/r34/poster/farmhouse.webp'}];
  expect(changedAssetMedia(asset,previous,records).cutout.publicPath).toContain('/r34/');
  expect(changedAssetMedia({...asset,revisionId:'old'},previous,[])).toBeNull();
});
