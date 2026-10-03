import type { SceneLayout } from './data';

/** Early camera/tier and fixed bridge/traffic contracts. Bulk world geometry and animation remain runtime data. */
export function projectLayoutBootstrap(layout: SceneLayout) {
  return {
    schema: layout.schema,
    bridge: layout.bridge,
    cameras: layout.cameras,
    lanes: layout.lanes.map(({ polyline: _polyline, ...lane }) => lane),
    lights: layout.lights,
    referenceColours: layout.referenceColours,
    approachEnds: { south: layout.approaches.south.ends, north: layout.approaches.north.ends },
    approachLengths: { south: layout.approaches.south.length, north: layout.approaches.north.length },
    flightLabels: Object.fromEntries(layout.flights.paths.map(path => [path.name, path.label])),
    flightClearance: layout.flights.clearance,
  };
}
export type LayoutBootstrap = ReturnType<typeof projectLayoutBootstrap>;

/** Object key ordering is immaterial; array ordering (lanes and cameras) remains part of the contract. */
export function stableLayoutJson(value: unknown): string {
  return JSON.stringify(value, (_key, child) => child && typeof child === 'object' && !Array.isArray(child)
    ? Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]])) : child);
}
