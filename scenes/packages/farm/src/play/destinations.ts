import { FARM_DESTINATIONS } from '../constants';

/** INV A.1 start points. Per D-09 there is no public destination menu; test and dev hooks use them. */
export { FARM_DESTINATIONS };
export type FarmDestination = keyof typeof FARM_DESTINATIONS;
export const FARM_DESTINATION_NAMES = Object.freeze(Object.keys(FARM_DESTINATIONS)) as readonly FarmDestination[];
export function isFarmDestination(name: string): name is FarmDestination { return Object.hasOwn(FARM_DESTINATIONS, name); }
