/** M0 B-00e failed on both r186 backends. Z4: DPR is selected only at startup. */
export const DYNAMIC_DPR_SUPPORTED = false;
export const RUNTIME_PIXEL_RATIO_SUPPORTED = DYNAMIC_DPR_SUPPORTED;
export type TierName = 'minimal' | 'economy' | 'balanced' | 'high';
export interface LiveKnobs { pixelRatio: number; vegetationDensity: number; instanceDensity: number; lodBias: number; streamRadiusScale: number; zoneHops: number }
export interface LadderLevel extends LiveKnobs {}
export interface TierKnobs {
  pixelRatioCap: number; pixelRatioMin: number;
  shadows: { enabled: boolean; type: 'basic' | 'pcf'; mapSize: number; maxCasters: number };
  vegetationDensity: number; instanceDensity: number;
  drawDistance: { far: number; fogNear: number; fogFar: number; lodBias: number; streamRadiusScale: number; zoneHops: number };
  effects: { water: 'off' | 'simple' | 'full'; wind: boolean; ambientAnimation: boolean };
  ladder?: LadderLevel[];
}
export interface DeviceClass { form: 'desktop' | 'tablet' | 'phone'; backend: 'webgpu' | 'webgl2'; gpu: 'high' | 'mid' | 'low' | 'unknown'; devicePixelRatio: number }
export type TierEntry<K extends TierKnobs = TierKnobs> = K | ((d: DeviceClass) => K);
export type TierTable<K extends TierKnobs = TierKnobs> = { order: TierName[] } & Partial<Record<TierName, TierEntry<K>>>;
export interface DeviceProbe {
  backend: 'webgpu' | 'webgl2'; adapter?: { vendor: string; architecture: string; device: string; description: string };
  hardwareConcurrency: number; deviceMemory?: number; devicePixelRatio: number; screenWidth: number; screenHeight: number;
  coarsePointer: boolean; mobileUA: boolean; saveData: boolean; prefersReducedMotion: boolean; maxTextureSize?: number;
}
export type TierChange =
  | { kind: 'initial'; tier: TierName; reasons: string[]; level: 0 }
  | { kind: 'live'; tier: TierName; level: number; direction: 'down' | 'up' | 'revert'; live: LiveKnobs }
  | { kind: 'advice'; suggestedTier: TierName; reason: string };
function validateKnobs(k: TierKnobs): void {
  if (!(k.pixelRatioMin > 0) || k.pixelRatioMin > k.pixelRatioCap || !Number.isFinite(k.pixelRatioCap)) throw new Error('Invalid pixel ratio cap/floor');
  for (const v of [k.vegetationDensity, k.instanceDensity]) if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error('Density must be between 0 and 1');
  if (!(k.drawDistance.far > 0) || !(k.drawDistance.lodBias > 0) || !(k.drawDistance.streamRadiusScale > 0) || !Number.isInteger(k.drawDistance.zoneHops) || k.drawDistance.zoneHops < 0) throw new Error('Invalid draw-distance knobs');
}
export function defineTiers<K extends TierKnobs = TierKnobs>(t: TierTable<K>): TierTable<K> {
  if (!t.order.length || new Set(t.order).size !== t.order.length) throw new Error('Tier order must be nonempty and unique');
  for (const name of t.order) { const entry = t[name]; if (!entry) throw new Error(`Missing tier: ${name}`); if (typeof entry !== 'function') validateKnobs(entry); }
  return t;
}
export function resolveTier<K extends TierKnobs>(t: TierTable<K>, tier: TierName, d: DeviceClass): K {
  const entry = t[tier]; if (!entry || !t.order.includes(tier)) throw new Error(`Unknown tier: ${tier}`);
  const knobs = typeof entry === 'function' ? entry(d) : entry; validateKnobs(knobs); return knobs;
}
/**
 * X-07 (owner decision 2026-09-29 22:10): the Galaxy Tab S9 FE's GPU class takes the minimal tier on WebGPU too, matching its WebGL2
 * tier (D-03), so that its 33.3 ms p95 target holds. On that tablet (SM-X518U, Mali-G68) Chrome's WebGPU adapter reports vendor 'arm'
 * and architecture 'valhall' with device and description blank; its WebGL2 renderer string is 'ANGLE (ARM, Mali-G68, OpenGL ES 3.2)'.
 * A phone or tablet on WebGPU matches when its adapter strings name a Mali-G5x or G6x (the SPEC 8.2 class that includes the G68), or,
 * when they name no Mali model, when the vendor is exactly 'arm' and the architecture exactly 'valhall'. WebGPU exposes nothing finer,
 * so every Valhall Mali that reports no model name takes this route; desktops and other vendors never do.
 */
function maliG68ClassOnWebGpu(p: DeviceProbe, form: DeviceClass['form']): boolean {
  if (form === 'desktop' || p.backend !== 'webgpu' || !p.adapter) return false;
  const text = Object.values(p.adapter).join(' ').toLowerCase(), model = text.match(/mali[ -]?g(\d+)/);
  if (model) { const n = Number(model[1]); return n >= 50 && n < 70; }
  return !/immortalis/.test(text) && p.adapter.vendor.trim().toLowerCase() === 'arm' && p.adapter.architecture.trim().toLowerCase() === 'valhall';
}
/** D-05 restricts automatic minimal selection to the D-03 cases, extended by X-07; explicit props remain valid overrides. */
function automaticTierOrder(table: TierTable, device: Pick<DeviceClass, 'form' | 'backend'>, p: DeviceProbe): TierName[] {
  const allowMinimal = device.form !== 'desktop' && device.backend === 'webgl2' || maliG68ClassOnWebGpu(p, device.form);
  return table.order.filter(tier => tier !== 'minimal' || allowMinimal);
}
export function classifyDevice(p: DeviceProbe, table: TierTable, options: { quality?: 'auto' | TierName } = {}): { tier: TierName; device: DeviceClass; reasons: string[] } {
  const mobile = p.coarsePointer || p.mobileUA;
  const form = mobile ? Math.min(p.screenWidth, p.screenHeight) < 600 ? 'phone' : 'tablet' : 'desktop';
  const text = p.adapter ? Object.values(p.adapter).join(' ').toLowerCase() : '';
  const adreno = Number(text.match(/adreno[ -]?(\d+)/)?.[1] ?? 0), mali = Number(text.match(/mali[ -]?g(\d+)/)?.[1] ?? 0);
  let gpu: DeviceClass['gpu'] = 'unknown';
  if (/apple|immortalis|nvidia|geforce|radeon|\brtx\b|\bgtx\b|adreno[ -]?[789]xx/.test(text) || adreno >= 700 || mali >= 715) gpu = 'high';
  else if (/powervr/.test(text) || adreno > 0 && adreno < 700 || mali >= 50 && mali < 70) gpu = 'low';
  else if (/intel|iris|uhd|mali|adreno|qualcomm|arm|amd/.test(text)) gpu = 'mid';
  let tier: TierName = form === 'desktop' ? 'high' : gpu === 'high' ? 'high' : 'economy';
  const reasons = [`${form} / ${gpu} GPU`];
  if (form === 'desktop' && ((p.deviceMemory ?? Infinity) <= 4 || p.hardwareConcurrency <= 4)) { tier = 'balanced'; reasons.push('Limited CPU or memory'); }
  if (form !== 'desktop' && p.backend === 'webgl2') { tier = table.minimal ? 'minimal' : 'economy'; reasons.push('Mobile WebGL2 startup mitigation (D-03)'); }
  else if (table.minimal && maliG68ClassOnWebGpu(p, form)) { tier = 'minimal'; reasons.push('Mali-G68 class on WebGPU (X-07)'); }
  const device: DeviceClass = { form, backend: p.backend, gpu, devicePixelRatio: p.devicePixelRatio };
  if (options.quality && options.quality !== 'auto') {
    if (!table.order.includes(options.quality) || !table[options.quality]) throw new Error(`Unknown tier: ${options.quality}`);
    return { tier: options.quality, device, reasons: [...reasons, 'Explicit quality override'] };
  }
  const order = automaticTierOrder(table, device, p);
  if (!order.length) throw new Error('This device has no permitted automatic tier; provide an explicit quality override');
  const rank: TierName[] = ['minimal', 'economy', 'balanced', 'high'];
  let i = order.indexOf(tier);
  if (i < 0) { const candidates = order.filter(name => rank.indexOf(name) <= rank.indexOf(tier)); tier = candidates.at(-1) ?? order[0]; i = order.indexOf(tier); }
  if (p.saveData) { tier = order[Math.max(0, i - 1)]; reasons.push('Save-Data enabled'); }
  return { tier, device, reasons };
}
export function buildLadder(knobs: TierKnobs): LadderLevel[] {
  validateKnobs(knobs);
  const initial = { pixelRatio: knobs.pixelRatioCap, vegetationDensity: knobs.vegetationDensity, instanceDensity: knobs.instanceDensity, lodBias: knobs.drawDistance.lodBias, streamRadiusScale: knobs.drawDistance.streamRadiusScale, zoneHops: knobs.drawDistance.zoneHops };
  if (knobs.ladder) {
    if (!knobs.ladder.length) throw new Error('Custom ladder cannot be empty');
    const result: LadderLevel[] = [];
    for (const l of [initial, ...knobs.ladder]) {
      if (l.pixelRatio < knobs.pixelRatioMin || l.pixelRatio > knobs.pixelRatioCap || !Object.values(l).every(Number.isFinite)) throw new Error('Custom ladder violates tier floors');
      if (l.vegetationDensity < 0 || l.vegetationDensity > knobs.vegetationDensity || l.instanceDensity < 0 || l.instanceDensity > knobs.instanceDensity || l.lodBias <= 0 || l.lodBias > initial.lodBias || l.streamRadiusScale <= 0 || l.streamRadiusScale > initial.streamRadiusScale || !Number.isInteger(l.zoneHops) || l.zoneHops < 0 || l.zoneHops > initial.zoneHops) throw new Error('Custom ladder exceeds live knob bounds');
      const next = { ...l, pixelRatio: initial.pixelRatio };
      if (!result.length || JSON.stringify(result.at(-1)) !== JSON.stringify(next)) result.push(next);
    }
    return result;
  }
  const levels = [initial]; let current = initial;
  const add = (patch: Partial<LadderLevel>) => { const next = { ...current, ...patch }; if (Object.keys(next).some(key => next[key as keyof LadderLevel] !== current[key as keyof LadderLevel])) levels.push(next); current = next; };
  // Z4 removes DPR steps entirely, including custom overrides. Density never increases at low tiers.
  for (let density = knobs.vegetationDensity - .25; density >= .25; density -= .25) add({ vegetationDensity: density });
  if (knobs.vegetationDensity > .25 && current.vegetationDensity !== .25) add({ vegetationDensity: .25 });
  add({ lodBias: Math.min(current.lodBias, .75) }); add({ lodBias: Math.min(current.lodBias, .5) });
  add({ streamRadiusScale: Math.min(current.streamRadiusScale, .75) }); add({ streamRadiusScale: Math.min(current.streamRadiusScale, .5) });
  for (let density = knobs.instanceDensity - .25; density >= .25; density -= .25) add({ instanceDensity: density });
  if (knobs.instanceDensity > .25 && current.instanceDensity !== .25) add({ instanceDensity: .25 });
  return levels;
}
export interface GovernorOptions { windowMs: number; evalEveryMs: number; downP95Ms: number; downMedianMs: number; upP95Ms: number; upHoldMs: number; minChangeGapMs: number; upGapMs: number; maxChangesPerMinute: number; warmupFrames: number; settleFrames: number; stallMs: number; benefitMin: number }
export const DEFAULT_GOVERNOR: GovernorOptions = Object.freeze({ windowMs: 3000, evalEveryMs: 500, downP95Ms: 22, downMedianMs: 18, upP95Ms: 14, upHoldMs: 12000, minChangeGapMs: 5000, upGapMs: 30000, maxChangesPerMinute: 4, warmupFrames: 90, settleFrames: 45, stallMs: 250, benefitMin: .08 });
export interface GovernorChange { level: number; direction: 'down' | 'up' | 'revert' }
/** Logical elapsed frame time makes synthetic feeds deterministic and excludes paused wall time. */
export class FrameTimeGovernor {
  private _level = 0; private _locked = false; private elapsed = 0; private warmup: number; private settle = 0;
  private samples: { t: number; dt: number }[] = []; private evalAt = 0; private changedAt = -Infinity;
  /** FARM-004: start of the first frame interval collected since the samples were last cleared (null while empty). */
  private windowFrom: number | null = null;
  private changes: number[] = []; private reversals: number[] = []; private direction: 'down' | 'up' | null = null;
  private downDisabledUntil = 0; private upSince: number | null = null;
  private benefit: { median: number; fromLevel: number; start: number } | null = null;
  private _median = 0; private _p95 = 0; private _stalls = 0;
  constructor(private o: GovernorOptions, private ladder: LadderLevel[], private now?: () => number) {
    if (!ladder.length) throw new Error('Governor requires a nonempty ladder'); this.warmup = o.warmupFrames;
  }
  get level() { return this._level; } get locked() { return this._locked; }
  get median() { return this._median; } get p95() { return this._p95; } get stalls() { return this._stalls; }
  resetWarmup(): void { this.warmup = this.o.warmupFrames; this.clearSamples(); this.upSince = null; }
  private clearSamples(): void { this.samples.length = 0; this.windowFrom = null; }
  private change(level: number, direction: GovernorChange['direction'], t: number): GovernorChange {
    const trend = direction === 'revert' ? 'up' : direction;
    if (this.direction && trend !== this.direction) this.reversals.push(t);
    this.reversals = this.reversals.filter(time => t - time < 120000);
    if (this.reversals.length >= 2) { level = Math.max(this._level, level); this._locked = true; }
    this.direction = trend; this._level = level; this.changedAt = t; this.changes.push(t);
    this.clearSamples(); this.settle = this.o.settleFrames; this.upSince = null;
    return { level, direction };
  }
  pushFrame(dtMs: number, f: { hidden?: boolean; paused?: boolean } = {}): GovernorChange | null {
    if (f.hidden || f.paused) { this.clearSamples(); this.upSince = null; if (this.benefit) this.benefit.start = Infinity; return null; }
    if (!Number.isFinite(dtMs) || dtMs <= 0) return null;
    this.elapsed += dtMs; const t = this.now ? this.now() : this.elapsed;
    if (this.warmup > 0) { this.warmup--; return null; }
    if (dtMs > this.o.stallMs) { this._stalls++; return null; }
    if (this.settle > 0) { this.settle--; if (this.benefit) this.benefit.start = t; return null; }
    if (this.benefit?.start === Infinity) this.benefit.start = t;
    this.samples.push({ t, dt: dtMs }); this.windowFrom ??= t - dtMs;
    while (this.samples.length && this.samples[0].t < t - this.o.windowMs) this.samples.shift();
    // FARM-004 (approved M4): evaluate once the rolling window holds 60 samples or has spanned windowMs, whichever comes
    // first, so that a device below 20 FPS can still step down, revert, lock and be advised a lower tier.
    if (t - this.evalAt < this.o.evalEveryMs || (this.samples.length < 60 && t - this.windowFrom < this.o.windowMs)) return null;
    this.evalAt = t;
    const sorted = this.samples.map(s => s.dt).sort((a, b) => a - b), middle = sorted.length >> 1;
    this._median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    this._p95 = sorted[Math.ceil(sorted.length * .95) - 1];
    this.changes = this.changes.filter(time => t - time < 60000);
    if (this._locked) return null;
    if (this.benefit) {
      if (t - this.benefit.start < this.o.windowMs) return null;
      const check = this.benefit; this.benefit = null;
      if ((check.median - this._median) / check.median < this.o.benefitMin) { this.downDisabledUntil = t + 60000; return this.change(check.fromLevel, 'revert', t); }
    }
    if (this._p95 < this.o.upP95Ms) this.upSince ??= t; else this.upSince = null;
    const available = this.changes.length < this.o.maxChangesPerMinute;
    if (available && t >= this.downDisabledUntil && this._level < this.ladder.length - 1 && t - this.changedAt >= this.o.minChangeGapMs && (this._p95 > this.o.downP95Ms || this._median > this.o.downMedianMs)) {
      // Reserve the final rate-limit slot for the mandatory benefit-check revert.
      if (this.changes.length + 1 >= this.o.maxChangesPerMinute) return null;
      this.benefit = { median: this._median, fromLevel: this._level, start: t }; return this.change(this._level + 1, 'down', t);
    }
    if (available && this._level > 0 && this.upSince !== null && t - this.upSince >= this.o.upHoldMs && t - this.changedAt >= this.o.upGapMs) return this.change(this._level - 1, 'up', t);
    return null;
  }
}
export interface QualityController<K extends TierKnobs = TierKnobs> {
  readonly tier: TierName; readonly device: DeviceClass; readonly knobs: K; readonly live: Readonly<LiveKnobs>; readonly level: number;
  readonly motion: { reduced: boolean }; readonly governor: FrameTimeGovernor;
  onLiveChange(fn: (live: Readonly<LiveKnobs>) => void): () => void;
  setLive(patch: Partial<LiveKnobs>): void;
  step(dtMs: number, flags?: { paused?: boolean; hidden?: boolean }): GovernorChange | null;
  ready(): void; dispose(): void;
}
export interface QualityControllerOptions {
  quality?: 'auto' | TierName; onTier?: (event: TierChange) => void; sceneId?: string; motion?: { reduced: boolean };
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null; governor?: GovernorOptions; earnedAt?: () => number;
}
export function createQualityController<K extends TierKnobs>(table: TierTable<K>, probe: DeviceProbe, options: QualityControllerOptions = {}): QualityController<K> {
  defineTiers(table); const result = classifyDevice(probe, table, { quality: options.quality }); let tier = result.tier;
  const automaticOrder = automaticTierOrder(table, result.device, probe);
  let storage = options.storage; if (storage === undefined) try { storage = globalThis.localStorage; } catch { storage = null; }
  const key = `kiln.scene.${options.sceneId ?? 'scene'}.tier`, fingerprint = JSON.stringify([result.device.form, probe.backend, probe.adapter, probe.hardwareConcurrency, probe.deviceMemory]);
  if (options.quality && options.quality !== 'auto') { tier = options.quality; }
  else try {
    const raw = storage?.getItem(key); const prior = raw ? JSON.parse(raw) as { tier: TierName; earnedAt: number; device?: string } : null;
    if (prior && Number.isFinite(prior.earnedAt) && (!prior.device || prior.device === fingerprint) && table.order.includes(prior.tier)) {
      const index = automaticOrder.indexOf(tier), earned = Math.max(0, automaticOrder.indexOf(prior.tier));
      // D-03 and X-07 are explicit structural requirements; learned tiers never override mobile WebGL2 minimal or the X-07 route.
      if (!(probe.backend === 'webgl2' && result.device.form !== 'desktop') && !maliG68ClassOnWebGpu(probe, result.device.form)) { tier = automaticOrder[Math.min(earned, index + 1)]; result.reasons.push('Last earned tier on this device'); }
    }
  } catch { /* Storage is optional. */ }
  const knobs = resolveTier(table, tier, result.device), ladder = buildLadder(knobs);
  const initialDpr = Math.min(probe.devicePixelRatio, knobs.pixelRatioCap); for (const level of ladder) level.pixelRatio = initialDpr;
  const live: LiveKnobs = { ...ladder[0] }, governor = new FrameTimeGovernor(options.governor ?? DEFAULT_GOVERNOR, ladder);
  const motion = options.motion ?? { reduced: probe.prefersReducedMotion }, listeners = new Set<(live: Readonly<LiveKnobs>) => void>();
  let disposed = false, stableMs = 0, exhaustedMs = 0, advised = false, saved = '';
  const save = (value: TierName) => { if (saved === value || !automaticOrder.includes(value)) return; try { storage?.setItem(key, JSON.stringify({ tier: value, earnedAt: options.earnedAt?.() ?? Date.now(), device: fingerprint })); saved = value; } catch { /* Convenience only. */ } };
  options.onTier?.({ kind: 'initial', tier, reasons: result.reasons, level: 0 });
  return {
    tier, device: result.device, knobs, live, motion, governor, get level() { return governor.level; },
    onLiveChange(fn) { if (!disposed) listeners.add(fn); return () => { listeners.delete(fn); }; },
    setLive(patch) {
      if (disposed) return; let changed = false;
      for (const key of ['vegetationDensity', 'instanceDensity', 'lodBias', 'streamRadiusScale', 'zoneHops'] as const) {
        const value = patch[key]; if (value === undefined || !Number.isFinite(value)) continue;
        const floor = key === 'lodBias' || key === 'streamRadiusScale' ? .01 : 0;
        const next = Math.max(floor, Math.min(ladder[0][key], key === 'zoneHops' ? Math.floor(value) : value));
        if (next !== live[key]) { live[key] = next; changed = true; }
      }
      // pixelRatio is intentionally absent: Z4 applies to developer controls too.
      if (changed) for (const fn of listeners) fn(live);
    },
    ready() { if (!disposed) governor.resetWarmup(); },
    step(dtMs, flags = {}) {
      if (disposed) return null; const change = governor.pushFrame(dtMs, flags);
      if (change) { Object.assign(live, ladder[change.level]); for (const fn of listeners) fn(live); options.onTier?.({ kind: 'live', tier, ...change, live: { ...live } }); }
      if (flags.hidden || flags.paused || dtMs > (options.governor ?? DEFAULT_GOVERNOR).stallMs || !Number.isFinite(dtMs)) { stableMs = exhaustedMs = 0; return change; }
      const index = automaticOrder.indexOf(tier);
      if (governor.level === 0 && governor.p95 > 0 && governor.p95 < (options.governor ?? DEFAULT_GOVERNOR).upP95Ms) stableMs += dtMs; else stableMs = 0;
      if (stableMs >= 60000) save(automaticOrder[Math.min(automaticOrder.length - 1, index + 1)] ?? tier);
      if (governor.level === ladder.length - 1) {
        const suggestedTier = automaticOrder[Math.max(0, index - 1)] ?? tier;
        save(suggestedTier);
        if (governor.p95 > 30) exhaustedMs += dtMs; else exhaustedMs = 0;
        if (exhaustedMs >= 20000 && !advised && index > 0) { advised = true; options.onTier?.({ kind: 'advice', suggestedTier, reason: 'Live quality floor exceeded 30 ms p95 for 20 seconds; remount for a lower structural tier.' }); }
      } else exhaustedMs = 0;
      return change;
    },
    dispose() { disposed = true; listeners.clear(); },
  };
}
