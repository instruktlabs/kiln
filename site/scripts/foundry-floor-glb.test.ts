import { expect, test } from 'bun:test';
import { inspectFoundryFloorGlb } from './foundry-floor-glb.mjs';
import { loaderDraws } from './vehicle-glb.mjs';

import { foundryGlbFixture as fixture } from './fixtures/foundry-glb.mjs';

test('standard LOD includes sealed lower geometry in measurements without claiming a plain loader draws it',async()=>{
 const bytes=fixture('standard'), measured=inspectFoundryFloorGlb(bytes);
 expect(measured.unreachableMeshNodes).toEqual([]);expect(measured.lodMode).toBe('MSFT_lod');
 expect(measured.triangles).toMatchObject({detailed:1,lod1:1,total:2});expect(measured.defaultTriangles).toBe(1);
 expect((await loaderDraws(bytes)).triangles).toBe(measured.defaultTriangles);
 const legacy=inspectFoundryFloorGlb(fixture('legacy'));expect(legacy.lodMode).toBe('named-visible');expect(legacy.defaultTriangles).toBe(2);
 expect(inspectFoundryFloorGlb(fixture('unlinked')).unreachableMeshNodes).toEqual(['lod1']);
 expect(()=>inspectFoundryFloorGlb(fixture('cycle'))).toThrow('LOD');
});
