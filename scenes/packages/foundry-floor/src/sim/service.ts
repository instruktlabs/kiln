// SPDX-License-Identifier: MIT
// Service visits: who repairs a failed tool and who runs a PM. FF1 and FF2 simulate no technicians (sim-spec 3.8
// lets the repair clock run during the walk), so the twin talks to one small interface and the default provider is
// the stub: the visit starts at the request and nothing walks. A later walker (FF3's humanoid work robot, which takes
// the PM and repair visits) implements ServiceProvider and is passed as FabOptions.service; the twin's timeline stays
// the tool's own (repair and PM times are the reliability table's), so a provider changes who is drawn where, never a
// hash. Visits are derived from tool state (serviceVisits), so snapshots need no provider state.
import type { E10State } from './fab';

export type ServiceKind = 'repair' | 'pm' | 'qualification';
export interface ServiceRequest {
  kind: ServiceKind;
  /** Resource index and id of the tool (a litho cell for track and scanner). */
  ri: number;
  tool: string;
  /** Sim ms: the failure, or the PM start. */
  at: number;
  /** Sim ms when the tool's timeline ends the work (repair done, or PM done). */
  until: number;
}
export interface ServiceProvider {
  readonly id: string;
  /** A tool needs a visit. The stub answers with `at` (no walk); a walker returns its arrival time. */
  request(req: ServiceRequest): number;
  /** The tool's work ended at `t` (repair done, or PM and qualification done). */
  release(ri: number, t: number): void;
}
export const STUB_SERVICE: ServiceProvider = { id: 'stub', request: r => r.at, release: () => {} };

export interface ServiceVisit { tool: string; kind: ServiceKind; since: number; until: number }
const KIND: Partial<Record<E10State, ServiceKind>> = { UNSCHEDULED_DOWN: 'repair', SCHEDULED_DOWN: 'pm', ENGINEERING: 'qualification' };
/** The visits in progress, from tool state: a down tool has a repair or a PM visit, a qualifying tool its run. */
export function serviceVisits(tools: readonly { st: E10State; t0: number; downUntil: number }[], ids: readonly string[]): ServiceVisit[] {
  const out: ServiceVisit[] = [];
  tools.forEach((T, i) => { const kind = KIND[T.st]; if (kind) out.push({ tool: ids[i] as string, kind, since: T.t0, until: T.downUntil }); });
  return out;
}
