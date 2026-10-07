import assert from 'node:assert/strict';
import { assertProductionBoundary } from '../scripts/build-boundary.mjs';

export function assertLifecycleBoundary(role, inputs) {
  const paths = inputs.map(path => path.replaceAll('\\', '/'));
  if (role === 'operator') {
    const allowed = new Set(['lifecycle-worker', 'lifecycle-budget', 'lifecycle-binding',
      'lifecycle-run', 'gateway-preflight', 'qualification-accounts', 'qualification-rpc']);
    for (const path of paths) {
      assert(!/(?:^|\/)test\//.test(path));
      const probe = path.match(/(?:^|\/)probe\/([^/]+)\.ts$/);
      if (/(?:^|\/)probe\//.test(path)) assert(probe && allowed.has(probe[1]));
    }
    return;
  }
  const wrappers = ['request', 'evaluation', 'render'].includes(role);
  const expected = role === 'allowance' ? new Set(['lifecycle-allowance-worker', 'lifecycle-budget']) :
    wrappers ? new Set([`lifecycle-${role}-worker`, 'lifecycle-binding']) : new Set();
  const production = paths.filter(path => {
    const probe = path.match(/(?:^|\/)probe\/([^/]+)\.ts$/);
    if (!probe) return true;
    assert(expected.has(probe[1]));
    return false;
  });
  assertProductionBoundary(role === 'gateway' ? 'worker' : `${role}-worker`, production);
}
