import type { VehicleAsset } from './catalog';

type Tier = VehicleAsset['tiers'][number];

/**
 * Switch distances are worked out from the screen-coverage thresholds stored in the file (a bounding sphere at a
 * 50 degree vertical field of view, 16:9), so they are stated to the nearest 10 m and as approximate.
 */
export const approxMetres = (value: number) =>
  `${(Math.round(value / 10) * 10).toLocaleString('en-US')} m`;

/** Where a tier is the one drawn: LOD0 up to the next tier's start; the last tier up to the file's own limit. */
export function tierRange(
  tiers: readonly Tier[],
  index: number,
  culledMetres: number | null,
): string {
  const start = tiers[index]?.distanceMetres ?? null;
  const end = tiers[index + 1]?.distanceMetres ?? culledMetres;
  if (start === null)
    return end === null ? 'At every distance' : `Up to about ${approxMetres(end)}`;
  return end === null
    ? `From about ${approxMetres(start)}`
    : `About ${approxMetres(start)} to ${approxMetres(end)}`;
}

/** The wheel and axle line used on cards and the pack page, from the measured values only. */
export function wheelSummary(vehicle: VehicleAsset['vehicle']): string {
  const track =
    vehicle.frontTrack === vehicle.rearTrack
      ? `${vehicle.frontTrack} m`
      : `${vehicle.frontTrack} m front, ${vehicle.rearTrack} m rear`;
  return `Wheelbase ${vehicle.wheelbase} m · track ${track} · ${vehicle.dualRear ? 'dual rear wheels' : 'single rear wheels'}`;
}
