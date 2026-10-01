// Guided flyovers (SCENE-TASK "Guided flyovers"): named, deterministic Catmull-Rom splines with
// eased speed and no roll, played by the kit's PathRig on scene time. The keys are data
// (layout.json `flights`, D-21). Every path is checked against the terrain collision grid when it is
// built, and against the bridge's geometry by tests/unit/flights.test.ts.
import type { PathDef, PathKey, Vec3 } from '@kiln-scenes/scene-kit';
import { LAYOUT } from '../data';
import { sightlineClearance, surfaceHeight } from '../world/heightfield';
import type { HeightField } from '../world/heightfield';
import { FLIGHT_NAMES } from '../params';
import type { FlightName } from '../params';

export interface FlightInfo { name: FlightName; label: string; seconds: number; requiresPreset?: 'fog'; minClearance: number; start: { position: Vec3; target: Vec3; fov: number } }
export interface Flights { paths: PathDef[]; info: Record<FlightName, FlightInfo> }

const DATA = LAYOUT.flights, BY_NAME = new Map(DATA.paths.map(path => [path.name, path]));
if (BY_NAME.size !== FLIGHT_NAMES.length || FLIGHT_NAMES.some(name => !BY_NAME.has(name))) throw new Error(`data/layout.json flights (${[...BY_NAME.keys()].join(', ')}) differ from the scene's (${FLIGHT_NAMES.join(', ')})`);
const flight = (name: FlightName) => BY_NAME.get(name)!;

export const FLIGHT_LABELS = Object.fromEntries(FLIGHT_NAMES.map(name => [name, flight(name).label])) as Record<FlightName, string>;
/** Height above terrain or water that every key aims for (metres); keys and chords must keep at least `terrainMinimum`. */
export const FLIGHT_CLEARANCE = DATA.clearance.terrain;

/** The flights as the kit's path definitions, keys exactly as the data gives them. */
export function flightPaths(): PathDef[] {
  return FLIGHT_NAMES.map(name => {
    const data = flight(name);
    const keys: PathKey[] = data.keys.map(k => k.seconds === undefined ? { position: k.position, target: k.target, fov: k.fov } : { position: k.position, target: k.target, fov: k.fov, seconds: k.seconds });
    return { name, keys, seconds: data.seconds, interpolation: 'catmull-rom', easing: data.easing ?? 'ease-in-out', loop: false };
  });
}

export function buildFlights(field: HeightField): Flights {
  const info = {} as Record<FlightName, FlightInfo>, paths = flightPaths();
  for (const path of paths) {
    const name = path.name as FlightName, data = flight(name);
    // Terrain clearance at each key, and along each chord between keys.
    let minClearance = Infinity;
    for (let i = 0; i < path.keys.length; i++) {
      const p = path.keys[i]!.position;
      minClearance = Math.min(minClearance, p[1] - surfaceHeight(field, p[0], p[2]));
      if (i > 0) minClearance = Math.min(minClearance, sightlineClearance(field, path.keys[i - 1]!.position, p, 5).clearance);
    }
    if (!(minClearance >= DATA.clearance.terrainMinimum)) throw new Error(`Flight ${name} passes ${minClearance.toFixed(2)} m above terrain`);
    const first = path.keys[0]!;
    info[name] = { name, label: data.label, seconds: data.seconds, requiresPreset: data.requiresPreset === 'fog' ? 'fog' : undefined, minClearance,
      start: { position: first.position, target: first.target, fov: first.fov ?? 55 } };
  }
  return { paths, info };
}
