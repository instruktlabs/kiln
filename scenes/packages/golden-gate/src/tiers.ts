import { defineTiers } from '@kiln-scenes/scene-kit';
import type { DeviceClass, TierKnobs } from '@kiln-scenes/scene-kit';
import { TIER_DATA } from './data';
import { BOOTSTRAP as LAYOUT } from './layout-bootstrap';
import type { FeatureData, FeatureLevel } from './data';

/** WATER-SPEC feature levels. `minimal`/`economy` are Low, `balanced` is Medium, `high` is High (Medium on phones). Values: data/tiers.json (D-21). */
export type { FeatureLevel, TrafficDensity } from './data';

/** A feature level as the scene uses it: the data plus its own name. */
export type GoldenGateFeatures = FeatureData & { feature: FeatureLevel };
export type GoldenGateKnobs = TierKnobs & { gg: GoldenGateFeatures };

const LEVELS: readonly FeatureLevel[] = ['high', 'medium', 'low'];
export const FEATURES = Object.fromEntries(LEVELS.map(level => [level, { ...TIER_DATA.features[level], feature: level }])) as Record<FeatureLevel, GoldenGateFeatures>;

function knobs(features: GoldenGateFeatures, pixelRatioCap: number, pixelRatioMin: number): GoldenGateKnobs {
  const shadows = features.shadows.enabled;
  return {
    pixelRatioCap, pixelRatioMin,
    shadows: { enabled: shadows, type: features.shadows.filter, mapSize: features.shadows.mapSize, maxCasters: shadows ? features.shadows.cascades : 0 },
    vegetationDensity: 0, instanceDensity: 1,
    drawDistance: { far: LAYOUT.cameras.clip.far, fogNear: 0, fogFar: LAYOUT.cameras.clip.far, lodBias: 1, streamRadiusScale: 1, zoneHops: 0 },
    effects: { water: features.feature === 'low' ? 'simple' : 'full', wind: false, ambientAnimation: true },
    // OD-10: water depth contact and fog banks read viewportDepthTexture, a mid-pass copy of the 4x depth, so only a
    // feature set with neither may discard. Derived from the features, so high on a phone (Medium) keeps store.
    multisample: { discard: !features.water.depthContact && features.fogBanks === 0 },
    gg: features,
  };
}
/** SPEC 21.1 map (data/tiers.json `tiers`). `high` on a phone returns the Medium set, so an S24+ class phone lands on Medium or higher. */
const tier = (name: keyof Omit<typeof TIER_DATA.tiers, 'order'>, level?: FeatureLevel) => { const t = TIER_DATA.tiers[name]; return knobs(FEATURES[level ?? t.features], t.pixelRatioCap, t.pixelRatioMin); };
export const goldenGateTiers = defineTiers<GoldenGateKnobs>({
  order: TIER_DATA.tiers.order,
  minimal: tier('minimal'),
  economy: tier('economy'),
  balanced: tier('balanced'),
  high: (device: DeviceClass) => device.form === 'phone' ? tier('high', TIER_DATA.tiers.high.phone?.features ?? 'medium') : tier('high'),
});
