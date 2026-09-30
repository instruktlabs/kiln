/**
 * A three-tier vehicle program for the LOD contract's tests.
 *
 * The vehicle pattern the owner's convention describes: three body tiers built by one routine
 * and declared with defineLod, and four wheels outside the body set that vanish at distance
 * through their own two-level sets with an empty far level. LOD2 is a tall block, so bounds or
 * views that counted it would reach 3 m where LOD0 reaches 1.5 m.
 */
export const BODY_COVERAGE = [0.004, 0.0002, 0.000006];
export const WHEEL_COVERAGE = [0.00005, 0];
export const WHEELS = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'] as const;

export const TIERED_CAR = `const meta = { name: 'Tiered Car' };
function build() {
  const root = createRoot('Car');
  const paint = gameMaterial(0x3366aa);
  const rubber = gameMaterial(0x151515);
  const tiers = [0, 1, 2].map((lod) => {
    const group = new THREE.Group();
    group.name = 'Body_LOD' + lod;
    root.add(group);
    createPart('Shell' + lod, boxGeo(4 - lod * 0.5, lod === 2 ? 3 : 1.2, 1.8), paint, {
      parent: group, position: [0, lod === 2 ? 1.5 : 0.9, 0] });
    if (lod === 0) createPart('Mirror', boxGeo(0.1, 0.1, 0.3), paint, { parent: group, position: [1, 1.4, 1.05] });
    return group;
  });
  defineLod(tiers, { screenCoverage: [${BODY_COVERAGE.join(', ')}] });
  for (const [name, x, z] of [['Wheel_FL', 1.3, 1.05], ['Wheel_FR', 1.3, -1.05], ['Wheel_RL', -1.3, 1.05], ['Wheel_RR', -1.3, -1.05]]) {
    const near = new THREE.Group();
    near.name = name + '_LOD0';
    near.position.set(x, 0.35, z);
    root.add(near);
    createPart('Tyre_' + name, boxGeo(0.7, 0.7, 0.3), rubber, { parent: near });
    const far = new THREE.Group();
    far.name = name + '_LOD1';
    far.position.set(x, 0.35, z);
    root.add(far);
    defineLod([near, far], { screenCoverage: [${WHEEL_COVERAGE.join(', ')}] });
  }
  return root;
}`;

/** Placed triangles per level: LOD0 body shell and mirror, one box per lower tier and wheel. */
export const TIERED_CAR_TRIANGLES = { body: [24, 12, 12], wheel: [12, 0], headline: 72 };

const at = (name: string) => `/Tiered%20Car[0]/Car[0]/${name}[0]`;

/** The chains the tiered car's bytes carry, in scene order, as Kiln summarizes them. */
export const TIERED_CAR_CHAINS = [
  {
    path: at('Body_LOD0'),
    screenCoverage: BODY_COVERAGE,
    levels: [0, 1, 2].map((level) => ({
      level,
      name: `Body_LOD${level}`,
      path: at(`Body_LOD${level}`),
      triangles: TIERED_CAR_TRIANGLES.body[level]!,
    })),
  },
  ...WHEELS.map((wheel) => ({
    path: at(`${wheel}_LOD0`),
    screenCoverage: WHEEL_COVERAGE,
    levels: [0, 1].map((level) => ({
      level,
      name: `${wheel}_LOD${level}`,
      path: at(`${wheel}_LOD${level}`),
      triangles: TIERED_CAR_TRIANGLES.wheel[level]!,
    })),
  })),
];
