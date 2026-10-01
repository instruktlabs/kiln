// SPDX-License-Identifier: MIT
// The typed agent API of the twin (sim-spec 9), plus the snapshot and warm-start helpers the scene uses. This is the
// Node-side entry (tools, tests, headless agents): createFab defaults to FAB_DATA, the data files read from disk. The
// page imports create.ts and config.ts instead, so the bundle carries no layout, rail graph, route or tools JSON.
import { FAB_DATA } from './data';
import type { FabData } from './data';
import { E10_STATES } from './fab';
import { createFabFrom } from './create';
import type { CreateFabOptions, Fab } from './create';

export type { ClipEvent, DispatchRule, E10State, FabKpis, FabMode, LotClass, LotState, VehicleState } from './fab';
export { E10_STATES, FabSim } from './fab';
export { DAY_MS, FAB_DATA, HOUR_MS } from './data';
export type { FabData, SimConfig, Vec3 } from './data';
export { groupUtilisation, regressionBand, SANITY_BAND, sanityVerdict, SPEC_SANITY_BAND, stateTotals, windowMetrics } from './metrics';
export type { GroupUtilisation, SanityBand, SweepRun, WindowMetrics } from './metrics';
export { createFabFrom } from './create';
export type { CreateFabOptions, Fab, FabStateView } from './create';

export function createFab(options: CreateFabOptions & { data?: FabData } = {}): Fab {
  return createFabFrom(options.data ?? FAB_DATA, options);
}

export const TOOL_STATES = E10_STATES;
