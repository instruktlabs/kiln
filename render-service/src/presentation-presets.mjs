// Renderer-owned, versioned presentation definitions. Requests select an ID;
// no caller-controlled light/color/exposure object crosses the HTTP boundary.
import { TONE_MAPPINGS } from './display-transform.mjs';

const PRESET_KEYS = Object.freeze([
  'id',
  'environment',
  'exposure',
  'ambient',
  'sun',
  'key',
  'fill',
  'rim',
  'shadows',
]);
const ACTIVE_DIRECTIONAL_KEYS = Object.freeze([
  'enabled',
  'color',
  'intensity',
  'position',
  'castsShadow',
]);
const DISABLED_DIRECTIONAL_KEYS = Object.freeze(['enabled']);

function exactKeys(value, expected, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new TypeError(`${path} keys must be exactly ${wanted.join(', ')}`);
  }
}

function finite(value, path, { minimum = -Infinity } = {}) {
  if (!Number.isFinite(value) || value < minimum)
    throw new TypeError(`${path} must be finite >= ${minimum}`);
}

function color(value, path) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new TypeError(`${path} must be a 24-bit color integer`);
  }
}

function tuple(value, length, path, validate) {
  if (!Array.isArray(value) || value.length !== length)
    throw new TypeError(`${path} must have ${length} entries`);
  value.forEach((entry, index) => {
    validate(entry, `${path}[${index}]`);
  });
}

function validateDirectional(value, path) {
  exactKeys(
    value,
    value?.enabled === false ? DISABLED_DIRECTIONAL_KEYS : ACTIVE_DIRECTIONAL_KEYS,
    path,
  );
  if (typeof value.enabled !== 'boolean') throw new TypeError(`${path}.enabled must be boolean`);
  if (!value.enabled) return;
  color(value.color, `${path}.color`);
  finite(value.intensity, `${path}.intensity`, { minimum: 0 });
  tuple(value.position, 3, `${path}.position`, finite);
  if (typeof value.castsShadow !== 'boolean')
    throw new TypeError(`${path}.castsShadow must be boolean`);
}

/**
 * The shadow filters that exist, as preset-facing names.
 *
 * `pcf-soft` was here until r186 deleted the PCFSoft implementation. three kept the
 * constant, warns on it, and substitutes PCFShadowMap -- so a preset naming it was
 * asking for a filter that no longer exists and quietly receiving a different one.
 * These three survive, and `renderer.mjs` maps each to its three constant, which is
 * what makes this field select a filter rather than describe one. `vsm` is the soft
 * option now, with one behavioural catch worth knowing before choosing it: under VSM
 * every shadow receiver also casts, so a ground plane starts casting too.
 */
export const SHADOW_FILTERS = Object.freeze(['basic', 'pcf', 'vsm']);

function validatePreset(preset) {
  exactKeys(
    preset,
    [...PRESET_KEYS, ...(Object.hasOwn(preset, 'toneMapping') ? ['toneMapping'] : [])],
    'presentation preset',
  );
  if (preset.toneMapping !== undefined && !TONE_MAPPINGS.includes(preset.toneMapping))
    throw new TypeError(`${preset.id}.toneMapping is unsupported`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-v[1-9][0-9]*$/.test(preset.id)) {
    throw new TypeError('presentation preset id must end in a positive version');
  }
  exactKeys(
    preset.environment,
    ['type', 'sigma', ...(Object.hasOwn(preset.environment, 'intensity') ? ['intensity'] : [])],
    `${preset.id}.environment`,
  );
  if (preset.environment.intensity !== undefined)
    finite(preset.environment.intensity, `${preset.id}.environment.intensity`, { minimum: 0 });
  if (preset.environment.type !== 'room')
    throw new TypeError(`${preset.id}.environment.type must be room`);
  finite(preset.environment.sigma, `${preset.id}.environment.sigma`, { minimum: 0 });
  finite(preset.exposure, `${preset.id}.exposure`, { minimum: 0 });
  exactKeys(preset.ambient, ['type', 'sky', 'ground', 'intensity'], `${preset.id}.ambient`);
  if (preset.ambient.type !== 'hemisphere')
    throw new TypeError(`${preset.id}.ambient.type must be hemisphere`);
  color(preset.ambient.sky, `${preset.id}.ambient.sky`);
  color(preset.ambient.ground, `${preset.id}.ambient.ground`);
  finite(preset.ambient.intensity, `${preset.id}.ambient.intensity`, { minimum: 0 });
  for (const role of ['sun', 'key', 'fill', 'rim'])
    validateDirectional(preset[role], `${preset.id}.${role}`);
  exactKeys(
    preset.shadows,
    ['enabled', 'type', 'mapSize', 'bias', 'normalBias', 'radius'],
    `${preset.id}.shadows`,
  );
  if (typeof preset.shadows.enabled !== 'boolean')
    throw new TypeError(`${preset.id}.shadows.enabled must be boolean`);
  if (!SHADOW_FILTERS.includes(preset.shadows.type))
    throw new TypeError(`${preset.id}.shadows.type must be one of ${SHADOW_FILTERS.join(', ')}`);
  tuple(preset.shadows.mapSize, 2, `${preset.id}.shadows.mapSize`, (entry, path) => {
    if (!Number.isInteger(entry) || entry < 1 || entry > 8192)
      throw new TypeError(`${path} must be an integer in [1,8192]`);
  });
  finite(preset.shadows.bias, `${preset.id}.shadows.bias`);
  finite(preset.shadows.normalBias, `${preset.id}.shadows.normalBias`, { minimum: 0 });
  finite(preset.shadows.radius, `${preset.id}.shadows.radius`, { minimum: 0 });
  return preset;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const definitions = [
  validatePreset({
    id: 'neutral-studio-v1',
    environment: { type: 'room', sigma: 0.04 },
    exposure: 1.38,
    ambient: { type: 'hemisphere', sky: 0xffffff, ground: 0x6f7888, intensity: 2 },
    // The v1 studio rig has no separate sun. Retaining this explicit disabled
    // role lets future world-oriented IDs add one without changing the schema.
    sun: { enabled: false },
    key: { enabled: true, color: 0xffffff, intensity: 3, position: [4, 7, 5], castsShadow: false },
    fill: {
      enabled: true,
      color: 0xdce8ff,
      intensity: 1.8,
      position: [-4, 3, 2],
      castsShadow: false,
    },
    rim: {
      enabled: true,
      color: 0xffead6,
      intensity: 1.2,
      position: [-2, 5, -5],
      castsShadow: false,
    },
    // These are the WebGPU/three.js controls the renderer knows how to apply.
    // Disabled preserves the exact pre-registry v1 visual behavior.
    shadows: {
      enabled: false,
      type: 'pcf',
      mapSize: [1024, 1024],
      bias: 0,
      normalBias: 0,
      radius: 1,
    },
  }),
];

// Gallery photography uses a lower exposure without changing the default tool rig.
definitions.push(
  validatePreset({
    ...definitions[0],
    id: 'gallery-studio-v1',
    exposure: 0.9,
  }),
);

// New review captures use measured white illumination. Both v1 definitions
// above remain byte-for-byte selectable; an existing receipt never changes rig.
definitions.push(
  validatePreset({
    ...definitions[0],
    id: 'review-neutral-v1',
    toneMapping: 'review-neutral',
    environment: { type: 'room', sigma: 0.04, intensity: 0.4352 },
    exposure: 0.9,
    ambient: { type: 'hemisphere', sky: 0xffffff, ground: 0xffffff, intensity: 1.0879 },
    key: { ...definitions[0].key, color: 0xffffff, intensity: 0.136 },
    fill: { ...definitions[0].fill, color: 0xffffff, intensity: 0.0204 },
    rim: { ...definitions[0].rim, color: 0xffffff, intensity: 0.0204 },
  }),
);

for (const definition of definitions) deepFreeze(definition);
export const PRESENTATION_PRESET_IDS = Object.freeze(definitions.map(({ id }) => id));
export const DEFAULT_PRESENTATION_PRESET_ID = 'review-neutral-v1';
export const PRESENTATION_PRESET_CAPABILITIES = Object.freeze(
  PRESENTATION_PRESET_IDS.map((id) => `render.profile.${id}`),
);
const registry = Object.freeze(
  Object.fromEntries(definitions.map((preset) => [preset.id, preset])),
);

export function isPresentationPresetId(id) {
  return typeof id === 'string' && Object.hasOwn(registry, id);
}

export function getPresentationPreset(id) {
  return isPresentationPresetId(id) ? registry[id] : undefined;
}
