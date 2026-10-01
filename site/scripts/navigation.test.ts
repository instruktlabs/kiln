import { expect, test } from 'bun:test';
import { legacyDestination, matchesAsset } from '../src/lib/navigation';
test('legacy links resolve only known archive slugs and safely fall back',()=>{
 expect(legacyDestination('#/gallery',['barn'])).toBe('/gallery/archive/');
 expect(legacyDestination('#/barn',['barn'])).toBe('/gallery/archive/barn/');
 expect(legacyDestination('#/../../docs',['barn'])).toBe('/gallery/archive/');
 expect(legacyDestination('#section',['barn'])).toBeNull();
});
test('pack and category filters intersect; standalone is explicit',()=>{
 expect(matchesAsset({pack:null,category:'Architecture'},'standalone','all')).toBe(true);
 expect(matchesAsset({pack:'farm',category:'Buildings'},'farm','Animals')).toBe(false);
 expect(matchesAsset({pack:'farm',category:'Buildings'},'all','Buildings')).toBe(true);
});

test('an asset shared by two packs is visible in either pack filter without a duplicate card', () => {
 const shared = { pack: 'vehicles', packs: ['vehicles', 'foundry-floor'], category: 'Road vehicles' };
 expect(matchesAsset(shared, 'foundry-floor', 'all')).toBe(true);
 expect(matchesAsset(shared, 'vehicles', 'Road vehicles')).toBe(true);
 expect(matchesAsset(shared, 'farm', 'all')).toBe(false);
 expect(matchesAsset(shared, 'foundry-floor', 'Buildings')).toBe(false);
});
