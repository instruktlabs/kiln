/**
 * What the site knows about the Generic Road Vehicles pack before it looks at any file: which six saved
 * revisions are delivered, who saved them in which run, and the words the pages use. Everything measured (bounds,
 * triangles per tier, hashes, sizes) is read from the files by `stage-vehicles.mjs`; nothing measured is typed here.
 *
 * The descriptions come from the authors' own briefs: the brief every author received
 * (`golden-gate-scene/vehicles/BRIEF.md`), the brief saved with each revision, and the design notes in the two
 * author reports. They name no maker, model, badge or livery; the vehicles have none.
 */

export const VEHICLES_ID = 'vehicles';
export const VEHICLES_NAME = 'Generic Road Vehicles';
// Licence text corrected from the sealed g7 scene; accepted GLB revision bytes are unchanged.
export const VEHICLES_RELEASE = 'r2';
/** Mirror directory of the pack's files (and, later, their place on the asset host). */
export const VEHICLES_DIR = `packs/${VEHICLES_ID}/${VEHICLES_RELEASE}`;

/** Triangle budgets per tier that the brief set (LOD0, LOD1, LOD2). */
export const TIER_BUDGETS = Object.freeze({ car: [12000, 3000, 600], heavy: [20000, 5000, 1000] });

/**
 * The runs whose receipts the site pins. A run's folder is `showcase/runs/<author>/<dir>`. Every delivered revision
 * (and the bus's first revision) was saved inside one of these three windows, checked against its creation time;
 * the authors' earlier sessions (`first`, `review-1`) saved none of them, since the earliest was saved after those
 * sessions had ended.
 */
export const VEHICLE_RUNS = Object.freeze([
  { stage: 'first-retry1', author: 'sonnet-vehicles-a', dir: 'first-retry1', label: 'first run, retry 1' },
  { stage: 'first-retry1', author: 'sonnet-vehicles-b', dir: 'first-retry1', label: 'first run, retry 1' },
  { stage: 'review-2', author: 'sonnet-vehicles-b', dir: 'review-2', label: 'review 2' },
]);

/** Where each author's saved revisions and exports live: `showcase/authors/<author>/...`. */
export const VEHICLES = Object.freeze([
  {
    slug: 'hatchback',
    name: 'Generic hatchback',
    category: 'Cars',
    author: 'sonnet-vehicles-a',
    root: 'Hatchback',
    assetId: 'generic-hatchback',
    budget: 'car',
    revisions: [{ revisionId: 'r_105b27d31fe44f2aa188a333e19e3977', parentRevisionId: null, run: 'first-retry1', stage: 'first' }],
    description: 'Generic five-door hatchback with a two-box roofline, a steep tailgate and taillight clusters at the rear corners. Its paint is a neutral near-white, so a scene can tint each instance.',
  },
  {
    slug: 'sedan',
    name: 'Generic sedan',
    category: 'Cars',
    author: 'sonnet-vehicles-a',
    root: 'Sedan',
    assetId: 'generic-sedan',
    budget: 'car',
    revisions: [{ revisionId: 'r_1cb27a0c14d44e48afff84db23013dad', parentRevisionId: null, run: 'first-retry1', stage: 'first' }],
    description: 'Generic four-door sedan with a low beltline, a notch-back deck and a full-width rear light bar. Authored as the drivable car of the Golden Gate scene, so its rear stays clean for a chase camera; the paint is a neutral near-white for scene tinting.',
  },
  {
    slug: 'suv',
    name: 'Generic SUV',
    category: 'Cars',
    author: 'sonnet-vehicles-a',
    root: 'SUV',
    assetId: 'generic-suv',
    budget: 'car',
    revisions: [{ revisionId: 'r_8261935e39684470b65549b1c39142fd', parentRevisionId: null, run: 'first-retry1', stage: 'first' }],
    description: 'Generic five-door SUV with a tall, square greenhouse, raised ground clearance, larger wheel arches and a steep liftgate. Its paint is a neutral near-white for scene tinting.',
  },
  {
    slug: 'pickup',
    name: 'Generic pickup truck',
    category: 'Trucks',
    author: 'sonnet-vehicles-b',
    root: 'Pickup',
    assetId: 'a_557b9bd6c2c34340804e802081a9b983',
    budget: 'car',
    revisions: [{ revisionId: 'r_b74ac56a93a44c7484890f712df9c64c', parentRevisionId: null, run: 'first-retry1', stage: 'first' }],
    description: 'Generic crew-cab pickup truck with a short bed. Made for traffic seen from about 3 m to 1 km, it steps from a detailed cab down to a boxy silhouette across three tiers.',
  },
  {
    slug: 'box-truck',
    name: 'Generic box truck',
    category: 'Trucks',
    author: 'sonnet-vehicles-b',
    root: 'BoxTruck',
    assetId: 'a_2092ca0610c749b386c14c07dbaf4236',
    budget: 'heavy',
    revisions: [{ revisionId: 'r_d5e37b6d4e7347ac863220cdbd8e49a4', parentRevisionId: null, run: 'first-retry1', stage: 'first' }],
    description: 'Generic class 6 cab-over box truck with dual rear wheels. The cab takes the paint tint; the cargo box has its own untinted near-white material.',
  },
  {
    slug: 'transit-bus',
    name: 'Generic transit bus',
    category: 'Buses',
    author: 'sonnet-vehicles-b',
    root: 'TransitBus',
    assetId: 'a_a8c030b2570f4ae5aa54eefbd3767f4c',
    budget: 'heavy',
    revisions: [
      { revisionId: 'r_4dc2fb11b58b4dcd9f89197a8f7e28ff', parentRevisionId: null, run: 'first-retry1', stage: 'first' },
      { revisionId: 'r_6ab2ee53817449c59972502fcf008f1a', parentRevisionId: 'r_4dc2fb11b58b4dcd9f89197a8f7e28ff', run: 'review-2', stage: 'review-2' },
    ],
    description: 'Generic 40 ft low-floor transit bus with two doors on the right, a two-tone body (paint above, trim below), dual rear wheels and a roof equipment pod. No operator livery, text or numbers.',
    // What the corrected revision answers, in the words of its own saved brief (see the history on the page).
    correction: 'The transit bus was then found to be see-through from behind, and this revision (review 2) corrects that.',
  },
]);

/** The documents the descriptions and conventions come from, pinned by SHA-256 when the catalog is generated. */
export const VEHICLE_DOCUMENTS = Object.freeze([
  { role: 'brief', path: 'golden-gate-scene/vehicles/BRIEF.md' },
  { role: 'report', path: 'showcase/authors/sonnet-vehicles-a/REPORT.md' },
  { role: 'report', path: 'showcase/authors/sonnet-vehicles-b/REPORT.md' },
  { role: 'lod-convention', path: 'showcase/review/vehicles/LOD-CONVENTION.md' },
  { role: 'lod-writer', path: 'showcase/review/vehicles/msft-lod.mjs' },
]);

export const vehicleBySlug = (slug) => VEHICLES.find((vehicle) => vehicle.slug === slug);
export const deliveredRevision = (vehicle) => vehicle.revisions.at(-1);

/** The frame, wheel, material and tier conventions every vehicle follows (from the brief, checked against each file). */
export const VEHICLE_CONVENTIONS = Object.freeze({
  frame: 'Metres, +Y up, +X forward, the vehicle’s right side at +Z. The origin is on the ground, centred between the axles and left to right.',
  wheels: 'Four nodes named Wheel_FL, Wheel_FR, Wheel_RL and Wheel_RR sit outside the detail groups. Each pivots at the wheel centre with the axle along local Z, so rolling is a rotation about Z and steering a rotation about Y. On the box truck and the bus each rear node holds the dual pair.',
  materials: 'Materials use fixed names because a scene drives them: Paint (near-white, tinted per instance), Trim, Glass (opaque), Chrome, Tyre, Rim, Headlight, Taillight, BrakeLight and Plate (no text). The box truck adds CargoBox.',
  tiers: 'Three detail groups named LOD0, LOD1 and LOD2 sit under the root. The delivered files link them with the glTF vendor extension MSFT_lod, so a loader that does not know the extension draws LOD0 and the wheels.',
  restrictions: 'No interiors, brands, logos, badges, text or liveries.',
});
