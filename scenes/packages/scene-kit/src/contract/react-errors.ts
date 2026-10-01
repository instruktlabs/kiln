import { SceneError } from './core';
type ErrorReporter = (error: unknown) => void;
type FiberErrorRoot = Record<'onCaughtError' | 'onUncaughtError' | 'onRecoverableError', ErrorReporter>;
const names = ['onCaughtError', 'onUncaughtError', 'onRecoverableError'] as const;
const ignoreLateError: ErrorReporter = () => {};
/** r9.8.1 otherwise forwards even boundary-caught errors to global reportError. */
export function bindFiberErrors(value: unknown, fatal: ErrorReporter): () => void {
  const root = value as FiberErrorRoot | undefined;
  if (!root || names.some(name => typeof root[name] !== 'function')) throw new SceneError('renderer-init', 'Pinned R3F error callbacks are unavailable');
  const report: ErrorReporter = error => { try { fatal(error); } catch { /* A page callback must not escape the scoped boundary. */ } };
  for (const name of names) root[name] = report;
  return () => { for (const name of names) if (root[name] === report) root[name] = ignoreLateError; };
}
