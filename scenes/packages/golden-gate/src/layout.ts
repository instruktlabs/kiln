import type { SceneLayout } from './data';
import { BOOTSTRAP } from './layout-bootstrap';
import { projectLayoutBootstrap, stableLayoutJson } from './layout-contract';

const contract = stableLayoutJson(BOOTSTRAP);

// Validate the bulk fields that world constructors consume. Bootstrap fields are checked exactly below.
// These are shape/finite-value checks, not substitutes for route, collision or visual qualification.
type Check = (value: unknown, path: string) => void;
const invalid = (path: string): never => { throw new Error(`Invalid Golden Gate layout ${path}`); };
const number: Check = (value, path) => { if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path); };
const positive: Check = (value, path) => { number(value, path); if ((value as number) <= 0) invalid(path); };
const integer: Check = (value, path) => { if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(path); };
const string: Check = (value, path) => { if (typeof value !== 'string') invalid(path); };
const choice = (...values: unknown[]): Check => (value, path) => { if (!values.includes(value)) invalid(path); };
const optional = (check: Check): Check => (value, path) => { if (value !== undefined) check(value, path); };
const array = (check: Check, min = 0): Check => (value, path) => {
  if (!Array.isArray(value) || value.length < min) invalid(path);
  (value as unknown[]).forEach((item, index) => check(item, `${path}[${index}]`));
};
const tuple = (size: number): Check => (value, path) => {
  array(number)(value, path); if ((value as unknown[]).length !== size) invalid(path);
};
const object = (fields: Record<string, Check>): Check => (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  for (const [key, check] of Object.entries(fields)) check((value as Record<string, unknown>)[key], `${path}.${key}`);
};
const pair = tuple(2), triple = tuple(3), approachName = choice('south', 'north'), vegetationKind = choice('tree', 'scrub');
const cut = object({ side: choice(-1, 1), s: pair, fade: positive, face: positive, bench: pair, reach: pair,
  toe: object({ x: pair, height: number, s: pair }), scrub: object({ dark: triple, light: triple, region: object({ s: pair, x: pair }) }) });
const approach = object({ length: positive, alignment: object({ pis: array(pair), radii: array(positive), end: pair }),
  profile: array(triple, 2), centreline: array(triple, 2), start: object({ elevation: number, grade: number }),
  segments: array(object({ kind: choice('viaduct', 'overpass', 'cut', 'fill', 'grade'), from: number, to: number,
    supports: optional(array(number)), abutments: optional(array(number)) })), cuts: optional(array(cut)) });
const vegetation = object({ reach: positive, clear: number, footprint: positive, ground: number,
  kinds: object(Object.fromEntries(['tree', 'scrub'].map(kind => [kind, object({ spacing: positive, height: pair, width: pair, sink: number })]))),
  classes: object({ tree: object({ greenOverRed: pair, luma: pair }), scrub: object({ greenOverBlue: pair, luma: pair, greenOverRed: pair }) }),
  approaches: object({ south: array(vegetationKind), north: array(vegetationKind) }) });
const bulk = object({
  approaches: object({ south: approach, north: approach, crossSection: object({ pavedHalfWidth: positive, barrier: triple, medianHeight: number,
    markings: object({ broken: array(pair), edge: pair, dash: positive, period: positive, phase: number, lift: number }), pavement: positive,
    deck: object({ slab: positive, girder: positive, girderHalfWidth: positive }), clearance: number,
    envelope: object({ bedMargin: number, cut: positive, fill: positive, reach: pair }),
    supports: object({ spacing: positive, columns: array(number), column: positive, cap: pair, abutment: positive, footing: number }),
    joint: object({ walk: pair, ramp: pair, taper: positive }) }) }),
  dressing: object({ paint: object({ color: string, roughness: number }), vegetation,
    plaza: object({ approach: approachName, side: choice(-1, 1), fan: tuple(4), pavedTo: positive, medianGap: pair,
      canopy: object({ s: pair, x: pair, top: number, depth: positive }), columns: object({ size: positive, s: array(number) }),
      islands: object({ s: pair, nose: positive, height: positive, x: array(number), halfWidth: array(positive) }) }),
    vista: object({ approach: approachName, level: number, outline: array(pair, 3), planter: array(pair, 3), throat: object({ edge: integer }),
      kerb: object({ height: positive, width: positive }), wall: object({ from: integer, to: integer, height: positive, width: positive }),
      stalls: object({ width: positive, depth: positive, line: positive, rows: array(object({ edge: choice('outline', 'planter'), from: integer, to: integer })) }),
      cars: array(object({ row: integer, stall: integer, type: string, paint: string })) }),
    lights: object({ start: number, spacing: positive, x: number, mount: positive, reach: positive, pole: pair, arm: positive, head: triple, clear: number, far: positive }) }),
  flights: object({ paths: array(object({ name: string, label: string, seconds: positive, requiresPreset: optional(choice('fog')),
    easing: optional(choice('ease-in-out', 'smoothstep')), keys: array(object({ position: triple, target: triple, fov: positive, seconds: optional(positive) }), 2) }), 1) }),
  fogBanks: object({ seed: integer, driftSpeed: number, wrap: object({ west: number, east: number }),
    puff: object({ sizeMin: positive, sizeRange: number, heightJitter: number, heightPerSize: number, aspect: positive }),
    banks: array(object({ x: number, y: number, z: number, spread: pair, puffs: integer })) }),
});

/** Consume the pack loader's already hash-verified bytes; never fetch again or fall back to authored source. */
export function readGoldenGateLayout(pack: { data: ReadonlyMap<string, ArrayBuffer> }, signal: AbortSignal): SceneLayout {
  if (signal.aborted) throw signal.reason ?? new DOMException('Golden Gate layout cancelled', 'AbortError');
  const bytes = pack.data.get('layout');
  if (!bytes) throw new Error('Golden Gate layout is missing from the verified pack');
  let layout: SceneLayout;
  try { layout = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as SceneLayout; }
  catch (cause) { throw new Error('Invalid Golden Gate layout JSON', { cause }); }
  if (!layout || layout.schema !== 'golden-gate-layout/1') throw new Error('Unsupported Golden Gate layout schema');
  bulk(layout, '');
  if (layout.fogBanks.wrap.west <= layout.fogBanks.wrap.east) invalid('fogBanks.wrap');
  if (new Set(layout.flights.paths.map(path => path.name)).size !== layout.flights.paths.length) invalid('flights.paths duplicate name');
  try {
    if (stableLayoutJson(projectLayoutBootstrap(layout)) !== contract) throw new Error('Golden Gate layout bootstrap mismatch; regenerate the bootstrap from authored data and rebuild');
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('bootstrap mismatch')) throw cause;
    throw new Error('Invalid Golden Gate layout bootstrap fields', { cause });
  }
  if (signal.aborted) throw signal.reason ?? new DOMException('Golden Gate layout cancelled', 'AbortError');
  return layout;
}
