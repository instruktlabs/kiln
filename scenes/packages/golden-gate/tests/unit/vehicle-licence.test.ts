import { expect, test } from 'bun:test';
import { checkVehicleLicence, VEHICLE_PROVENANCE, vehicleLicenceText } from '../../scripts/stage';

test('a vehicle licence binds CC0, exact asset, saved revision and runtime GLB hash', () => {
  for (const type of ['sedan', 'hatchback', 'suv', 'pickup', 'box-truck', 'transit-bus'] as const) {
    const pin = VEHICLE_PROVENANCE[type], text = vehicleLicenceText(type, pin.sha256);
    expect(() => checkVehicleLicence(type, text)).not.toThrow();
    expect(() => checkVehicleLicence(type, text.replace(pin.asset, 'another-asset'))).toThrow(/asset/i);
    expect(() => checkVehicleLicence(type, text.replace(`Saved revision: ${pin.revision}`, 'Saved revision: r_other'))).toThrow(/revision/i);
    expect(() => checkVehicleLicence(type, text.replace(pin.sha256, '0'.repeat(64)))).toThrow(/hash/i);
    expect(() => checkVehicleLicence(type, text.replace('SPDX-License-Identifier: CC0-1.0', 'SPDX-License-Identifier: MIT'))).toThrow(/CC0/i);
    expect(() => checkVehicleLicence(type, text + '\nSaved revision: r_other\n')).toThrow(/revision/i);
  }
});
