// SPDX-License-Identifier: MIT
// What the page bundles of the twin's data: only the sim config (data/sim-config.json), because the HUD's scale ladder
// and mode labels are needed before the pack loads. The layout, rail graph, route and tools are pack data fetched at
// startup (D-21: the truth stays in plain JSON beside the GLBs), assembled here into the FabData the twin and the
// world take. Node tools and tests use FAB_DATA (data.ts), which reads the same files from disk.
import simConfigJson from '../../data/sim-config.json';
import type { FabData, LayoutData, RailGraphData, RouteData, SimConfig, ToolsData } from './data';

export const SIM_CONFIG = simConfigJson as unknown as SimConfig;

/** Pack data ids of the twin's data files (scripts/stage.ts stages each one under data/). */
export const FAB_DATA_IDS = { layout: 'fab-layout', graph: 'fab-rail-graph', route: 'fab-route', tools: 'fab-tools' } as const;

/** The twin's data from the pack's data entries (`read` returns an entry's bytes, or undefined when it is missing). */
export function fabDataFromPack(read: (id: string) => ArrayBuffer | Uint8Array | undefined): FabData {
  const decoder = new TextDecoder();
  const json = <T>(id: string): T => {
    const bytes = read(id);
    if (!bytes) throw new Error(`The scene pack has no ${id} data entry`);
    return JSON.parse(decoder.decode(bytes)) as T;
  };
  return {
    layout: json<LayoutData>(FAB_DATA_IDS.layout), graph: json<RailGraphData>(FAB_DATA_IDS.graph),
    route: json<RouteData>(FAB_DATA_IDS.route), tools: json<ToolsData>(FAB_DATA_IDS.tools), config: SIM_CONFIG,
  };
}
