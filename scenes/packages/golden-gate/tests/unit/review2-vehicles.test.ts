import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkApprovedVehicle, checkVehicleGlb, VEHICLE_PROVENANCE, VEHICLE_PROVENANCE_G9, VEHICLE_TYPES, vehicleLicenceText } from '../../scripts/stage';
const bundle = new URL('../../../../../engine-work/local-v09-review/revision2-20260930/vehicles-runtime-final/', import.meta.url);
const delivery = JSON.parse(readFileSync(new URL('delivery.json', bundle), 'utf8'));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('g9 selects all six exact r4 saved revisions and paired runtime licences, preserving original authors', () => {
  for (const type of VEHICLE_TYPES) {
    const selected = delivery.assets.find((asset: { slug: string }) => asset.slug === type), pin = VEHICLE_PROVENANCE_G9[type];
    const bytes = readFileSync(new URL(selected.model, bundle)), licence = readFileSync(new URL(selected.licence, bundle), 'utf8');
    expect({ bytes: bytes.byteLength, sha256: sha256(bytes) }).toEqual({ bytes: pin.bytes, sha256: pin.sha256 });
    expect(() => checkVehicleGlb(type, bytes)).not.toThrow();
    expect(licence).toContain(`Saved revision: ${pin.revision}\n`);
    expect(licence).toContain(`Delivered GLB SHA-256: ${pin.sha256}`);
    expect(pin.revision).toBe(selected.revisionId);
    expect(pin.parentRevision).toBe(selected.parentRevision);
    expect(pin.author).toBe(['sedan', 'hatchback', 'suv'].includes(type) ? 'sonnet-vehicles-a' : 'sonnet-vehicles-b');
    expect(vehicleLicenceText(type, pin.sha256)).not.toContain('binary chunk unchanged');
  }
});

test('g9-flush2 replaces the sedan, SUV and box truck with children of their g9 revisions and keeps the other three', () => {
  for (const type of VEHICLE_TYPES) {
    if (['sedan', 'suv', 'box-truck'].includes(type)) expect(VEHICLE_PROVENANCE[type].parentRevision).toBe(VEHICLE_PROVENANCE_G9[type].revision);
    else expect(VEHICLE_PROVENANCE[type]).toEqual(VEHICLE_PROVENANCE_G9[type]);
  }
});

test('g9 rejects all superseded g8 runtime pins', () => {
  for (const type of VEHICLE_TYPES)
    expect(() => checkApprovedVehicle(type, readFileSync(new URL(`../../staged/g8/vehicles/${type}.glb`, import.meta.url)))).toThrow();
});
