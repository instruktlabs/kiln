import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { asWebGPU, defineDevParams, readDevParams, useBuilt, useQuality, useRegisterTestHooks } from '@kiln-scenes/scene-kit';
import { useFarmSession, type FarmSession } from '../state';
import { buildFarmPipeline, type FarmPipeline } from './pipeline';
import { FARM_ANTIALIAS, FARM_LOOK_DEFAULT, FARM_LOOK_PRESETS, formatFarmLook, lookExposure, matchedNeutralExposure, needsPipeline, parseFarmLook, resolveFarmLook, type FarmAntialias, type FarmLookOptions } from './options';

/**
 * Dev-build look exploration (M3, PLAN.md 1.1). FarmScene loads this module with a dynamic import behind
 * `import.meta.env.KILN_DEV`, so public and test outputs never contain it. The requested options live in one small
 * store per Farm session: `?look=` sets the initial value, the developer panel and the `setLook` test hook change it.
 */
interface LookStore { get(): FarmLookOptions; set(next: FarmLookOptions): void; subscribe(fn: () => void): () => void; error: string | null }
const stores = new WeakMap<FarmSession, LookStore>();
const LOOK_PARAMS = defineDevParams({ look: { kind: 'string' } });
function storeFor(session: FarmSession): LookStore {
  let store = stores.get(session);
  if (store) return store;
  let value: FarmLookOptions = { ...FARM_LOOK_DEFAULT }, error: string | null = null;
  try { value = parseFarmLook(readDevParams(LOOK_PARAMS).look); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const listeners = new Set<() => void>();
  store = { error, get: () => value, set(next) { value = { ...next }; for (const fn of listeners) fn(); }, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; } };
  stores.set(session, store); return store;
}
function useLook(store: LookStore) { return useSyncExternalStore(store.subscribe, store.get, store.get); }

function PipelineFrame({ pipeline }: { pipeline: FarmPipeline }) {
  // A positive priority makes this the frame's only render: R3F skips its own gl.render while it is subscribed.
  useFrame(() => pipeline.render(), 1);
  return null;
}

/** Canvas side: builds the render pipeline for the requested options when they differ from the default look. */
export function FarmPostEffects() {
  const session = useFarmSession(), store = storeFor(session), requested = useLook(store), quality = useQuality();
  const gl = useThree(state => state.gl), scene = useThree(state => state.scene), camera = useThree(state => state.camera);
  const renderer = asWebGPU(gl), { look, disabled } = resolveFarmLook(requested, quality.tier), key = formatFarmLook(look);
  const built = useBuilt(() => needsPipeline(look) ? buildFarmPipeline(renderer, scene, camera, look) : null, value => value?.dispose(), [renderer, scene, camera, key]);
  useEffect(() => {
    const previous = renderer.toneMappingExposure; renderer.toneMappingExposure = lookExposure(look);
    return () => { renderer.toneMappingExposure = previous; };
  }, [renderer, key]); // key names the options
  const hooks = useMemo(() => ({
    setLook: (value: string | Partial<FarmLookOptions>) => { store.set(typeof value === 'string' ? parseFarmLook(value) : { ...FARM_LOOK_DEFAULT, ...value }); return formatFarmLook(store.get()); },
    lookState: () => ({ requested: formatFarmLook(store.get()), effective: key, disabled, pipeline: built !== null, active: built !== null || !needsPipeline(look),
      passes: built?.passes ?? ["direct render with the renderer's MSAA"], samples: built ? built.samples : renderer.samples, exposure: renderer.toneMappingExposure,
      tier: quality.tier, parameterError: store.error }),
  }), [store, key, built, disabled.join('|'), quality.tier, renderer]);
  useRegisterTestHooks(hooks);
  return built ? <PipelineFrame pipeline={built}/> : null;
}

const EFFECTS = [['ao', 'Ambient occlusion (GTAO)'], ['bloom', 'Bloom (emissive only)'], ['vignette', 'Vignette'], ['grading', 'Colour grade']] as const;
const AA_LABELS: Record<FarmAntialias, string> = { msaa: 'MSAA 4x (default)', none: 'None', fxaa: 'FXAA', smaa: 'SMAA', traa: 'TRAA (temporal)', ssaa: 'SSAA 4x' };
/** Developer panel side: the same store, as native controls. */
export function FarmLookControls() {
  const store = storeFor(useFarmSession()), look = useLook(store);
  return <fieldset className="farm-look"><legend>Look exploration (dev only; defaults unchanged)</legend>
    <label>Preset <select className="ks-select" value={Object.keys(FARM_LOOK_PRESETS).find(name => formatFarmLook(parseFarmLook(name)) === formatFarmLook(look)) ?? ''} onChange={event => store.set(parseFarmLook(event.target.value))}>
      <option value="" disabled>Custom</option>{Object.keys(FARM_LOOK_PRESETS).map(name => <option key={name} value={name}>{name}</option>)}
    </select></label>
    <label>Anti-aliasing <select className="ks-select" value={look.aa} onChange={event => store.set({ ...look, aa: event.target.value as FarmAntialias })}>
      {FARM_ANTIALIAS.map(aa => <option key={aa} value={aa}>{AA_LABELS[aa]}</option>)}
    </select></label>
    {EFFECTS.map(([key, label]) => <label key={key}><input type="checkbox" checked={look[key]} onChange={event => store.set({ ...look, [key]: event.target.checked })}/> {label}</label>)}
    <label>Tone mapping <select className="ks-select" value={look.tone} onChange={event => store.set({ ...look, tone: event.target.value as FarmLookOptions['tone'], exposure: undefined })}>
      <option value="aces">ACES Filmic, .95 (default, D-18)</option><option value="neutral">{`Neutral, ${matchedNeutralExposure()} (mid-grey match)`}</option>
    </select></label>
  </fieldset>;
}
