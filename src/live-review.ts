/** Browser-safe observation records. These describe Kiln operations, not an agent's private state. */
export interface LiveFile {
  name: string;
  bytes: number;
  sha256: string;
  url: string;
}
export interface LiveOperation {
  version: 'kiln.live.v1';
  operationId: string;
  revision: number;
  tool: string;
  transport: 'cli' | 'mcp' | 'native' | 'api';
  sessionId: string;
  /** Explicit host identity for one authoring item across sessions; never inferred from a project. */
  workId?: string;
  startedAt: string;
  updatedAt: string;
  status: 'running' | 'evaluated' | 'complete' | 'failed' | 'interrupted' | 'unknown';
  projectId?: string;
  projectRevision?: string;
  /** Host-provided build identity at invocation time, never inferred at review time. */
  runtimeIdentity?: string;
  programRef?: string;
  artifact?: LiveFile;
  captures: LiveFile[];
  viewFidelity?: unknown;
  result?: Record<string, unknown>;
  error?: string;
  pinned: boolean;
  phases: { phase: string; at: string }[];
  /** Evidence that observation was incomplete, never a claim that authoring failed. */
  observationIssues?: string[];
}
export interface LiveSnapshot {
  cursor: string;
  unchanged: boolean;
  operations: LiveOperation[];
  retention: { maxOperations: number; maxBytes: number; pinned: number; bytes?: number };
  observationIssues?: string[];
}
/** Host capability. Core calls never depend on the presence of a connected viewer. */
export interface LiveReviewPort {
  /**
   * Invoke run synchronously exactly once, inside any observation async context.
   * Await that promise to record completion; do not wait for storage or a browser
   * before invoking it. Host adapters preserve the callback's original outcome
   * and guard against observers that throw, replace it, or violate this contract.
   */
  observe<T>(tool: string, input: unknown, run: () => Promise<T>): Promise<T>;
  artifact(code: string, rendered: import('./render').RenderResult): void;
  flush?(): Promise<void>;
}
