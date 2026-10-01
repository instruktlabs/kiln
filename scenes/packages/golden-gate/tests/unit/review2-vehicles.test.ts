import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { checkApprovedVehicle, checkVehicleGlb, checkVehicleLicence, VEHICLE_PROVENANCE, VEHICLE_TYPES, vehicleLicenceText } from '../../scripts/stage';
const bundle = new URL('../../../../../engine-work/local-v09-review/revision2-20260930/vehicles-runtime-final/', import.meta.url);
const delivery = JSON.parse(readFileSync(new URL('delivery.json', bundle), 'utf8'));

test('g9 selects all six exact r4 saved revisions and paired runtime licences, preserving original authors', () => {
  for (const type of VEHICLE_TYPES) {
    const selected = delivery.assets.find((asset: { slug: string }) => asset.slug === type);
    const bytes = readFileSync(new URL(selected.model, bundle));
    expect(() => checkApprovedVehicle(type, bytes)).not.toThrow();
    expect(() => checkVehicleGlb(type, bytes)).not.toThrow();
    expect(() => checkVehicleLicence(type, readFileSync(new URL(selected.licence, bundle), 'utf8'))).not.toThrow();
    expect(VEHICLE_PROVENANCE[type].revision).toBe(selected.revisionId);
    expect(VEHICLE_PROVENANCE[type].parentRevision).toBe(selected.parentRevision);
    expect(VEHICLE_PROVENANCE[type].author).toBe(['sedan', 'hatchback', 'suv'].includes(type) ? 'sonnet-vehicles-a' : 'sonnet-vehicles-b');
    expect(vehicleLicenceText(type, VEHICLE_PROVENANCE[type].sha256)).not.toContain('binary chunk unchanged');
  }
});

test('g9 rejects all superseded g8 runtime pins', () => {
  for (const type of VEHICLE_TYPES)
    expect(() => checkApprovedVehicle(type, readFileSync(new URL(`../../staged/g8/vehicles/${type}.glb`, import.meta.url)))).toThrow();
});
