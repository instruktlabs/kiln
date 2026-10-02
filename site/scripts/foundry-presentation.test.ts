import { describe, expect, test } from 'bun:test';
import { foundryPresentation } from '../src/lib/foundry-presentation';

describe('Foundry scene claims follow its staged inventory', () => {
  test('an interior catalogue keeps exterior and floor-transfer claims out of the page', () => {
    const copy = foundryPresentation({ assetCount: 31, placedInScene: 23, assets: [{ group: 'tools' }] });
    expect(copy.description).toContain('An interior: a lot-level');
    expect(copy.foundation).toContain('other 8 are in the pack but not placed');
    expect(copy.controls).toContain('seven views');
    expect(JSON.stringify(copy)).not.toMatch(/campus|freight|floor robots|sedan/i);
  });
  test('the complete campus catalogue describes its actual scene without promoting acceptance', () => {
    const copy = foundryPresentation({ assetCount: 62, placedInScene: 62, assets: [{ group: 'campus' }, { group: 'vegetation' }, { group: 'freight' }] });
    expect(copy.description).toContain('fictional chip fab and campus, arranged');
    expect(copy.description).toContain('62');
    expect(copy.controls).toContain('Drive the sedan');
    expect(copy.factory).toContain('AMRs carry actual lots');
    expect(copy.factory).toContain('Humanoid work robots handle repair and preventive maintenance');
    expect(copy.foundation).not.toContain('other 0');
    expect(JSON.stringify(copy)).not.toMatch(/accepted|qualified|fps|phones?|tablets?/i);
  });
  test('registered-floor and revised-control claims require the explicit review2 runtime', () => {
    const inventory = { assetCount: 62, placedInScene: 62, assets: [{ group: 'campus' }] };
    const legacy = foundryPresentation(inventory, 'ff3');
    expect(JSON.stringify(legacy)).not.toMatch(/cutaway|Shift|hysteresis|size on screen/);
    expect(legacy.loading).toBe('Loads only when you choose Explore.');
    const copy = foundryPresentation(inventory, 'ff3-review2');
    expect(copy.description).toMatch(/level.1 cutaway.*south-west building/);
    expect(copy.controls).toMatch(/Shift.*boost/);
    expect(copy.controls).toMatch(/Touch.*steering.*throttle.*brake.*reverse.*Boost/);
    expect(copy.controls).toMatch(/Enter the fab.*Exit to campus.*visible/);
    expect(copy.controls).not.toContain('at Arrival');
    expect(copy.foundation).toMatch(/size on screen/);
    expect(copy.foundation).toMatch(/transition buffer/);
    expect(copy.foundation).toMatch(/entrance to level 1/);
    expect(copy.loading).toMatch(/campus.*Explore.*interior.*Enter the fab/);
    expect(JSON.stringify(copy)).not.toMatch(/seamless|accepted|qualified|fps|phones?|tablets?/i);
    expect(copy.factory).toMatch(/calibration remains open/);
  });
});
